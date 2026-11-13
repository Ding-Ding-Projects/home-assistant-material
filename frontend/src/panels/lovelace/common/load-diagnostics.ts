import type { TimedRequest } from "../../../data/request-timing";
import { getTimedRequests } from "../../../data/request-timing";
import { walkDeep } from "../editor/tools/deep-dom";

/**
 * What this browser measured while it opened a dashboard: when each card
 * finished its first draw, which history and statistics requests were made
 * and how long they took, and the pictures on the page with their real and
 * shown sizes. The diagnostics page (Settings, System, Performance) reads it
 * back. Everything is measured here and kept in this browser's own storage;
 * nothing is sent anywhere.
 *
 * A sample covers the first `LOAD_WINDOW_MS` after the dashboard started to
 * load, or until the person leaves it. Cards that are created later, for
 * example when scrolled to, are not part of the load.
 */

export const LOAD_WINDOW_MS = 20_000;

const STORAGE_KEY = "haLoadDiagnostics";
const MAX_CARDS = 300;
const MAX_IMAGES = 100;
const MAX_ENTITIES = 5000;

export interface RecordedCard {
  type: string;
  label: string;
  /** Milliseconds after the sample started that the card was created. */
  startedMs: number;
  /** Milliseconds after the sample started that the card finished drawing. */
  endedMs: number;
  /** Entities named in the card's configuration. */
  entityCount: number;
}

export interface RecordedImage {
  /** Where the picture comes from, without any query or token. */
  path: string;
  naturalWidth: number;
  naturalHeight: number;
  shownWidth: number;
  shownHeight: number;
  /** Device pixels per CSS pixel when sampled. */
  pixelRatio: number;
  /** Bytes memory takes once the picture is decoded (4 bytes a pixel). */
  decodedBytes: number;
  /** Bytes the browser reported for the download, when it reports them. */
  transferBytes?: number;
  /** Milliseconds the download took, when the browser reports it. */
  loadMs?: number;
}

export interface LoadSample {
  version: 1;
  /** The dashboard's url path; null for the default dashboard. */
  urlPath: string | null;
  /** The address of the page, without query or hash. */
  path: string;
  mode?: "yaml" | "storage";
  /** When the load started, in milliseconds since 1970. */
  startedAt: number;
  /** Milliseconds from the page's own start to the start of this load. */
  sinceNavigationMs: number;
  cards: RecordedCard[];
  /** Cards left out of `cards` because the list is full. */
  skippedCards: number;
  /** Different entities named by the cards of this dashboard. */
  entityCount: number;
  requests: TimedRequest[];
  images: RecordedImage[];
  finished: boolean;
}

export interface CardDrawInfo {
  type: string;
  label: string;
  entities: string[];
}

let current: LoadSample | undefined;
let currentPerfStart = 0;
let entitySet = new Set<string>();
let timer: number | undefined;
let saveTimer: number | undefined;

const save = (sample: LoadSample) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sample));
  } catch (_err) {
    // Storage may be full or blocked; the sample then lives in memory only.
  }
};

const saveSoon = () => {
  if (saveTimer !== undefined || !current) {
    return;
  }
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    if (current) {
      save(current);
    }
  }, 1000);
};

/** The latest sample: the one being taken, or the one kept from earlier. */
export const getLoadSample = (): LoadSample | undefined => {
  if (current) {
    return current;
  }
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (!text) {
      return undefined;
    }
    const sample = JSON.parse(text) as LoadSample;
    return sample && sample.version === 1 && Array.isArray(sample.cards)
      ? sample
      : undefined;
  } catch (_err) {
    return undefined;
  }
};

/** Forgets the kept sample. */
export const clearLoadSample = () => {
  current = undefined;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (_err) {
    // Nothing to forget.
  }
};

const stripAddress = (src: string): string => {
  try {
    const url = new URL(src, location.href);
    const path =
      url.origin === location.origin
        ? url.pathname
        : `${url.host}${url.pathname}`;
    return path.slice(0, 200);
  } catch (_err) {
    return "";
  }
};

const collectImages = (): RecordedImage[] => {
  const entries = new Map<string, PerformanceResourceTiming>();
  try {
    (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
      .filter((entry) => entry.initiatorType === "img")
      .forEach((entry) => entries.set(stripAddress(entry.name), entry));
  } catch (_err) {
    // Resource timing is not available.
  }
  const found: RecordedImage[] = [];
  const ratio = window.devicePixelRatio || 1;
  walkDeep(document.body, (element) => {
    if (found.length >= MAX_IMAGES || element.localName !== "img") {
      return;
    }
    const image = element as HTMLImageElement;
    const src = image.currentSrc || image.src;
    if (!src || src.startsWith("data:") || src.startsWith("blob:")) {
      return;
    }
    if (!image.complete || !image.naturalWidth) {
      return;
    }
    const box = image.getBoundingClientRect();
    if (!box.width || !box.height) {
      return;
    }
    const path = stripAddress(src);
    if (!path) {
      return;
    }
    const entry = entries.get(path);
    found.push({
      path,
      naturalWidth: image.naturalWidth,
      naturalHeight: image.naturalHeight,
      shownWidth: Math.round(box.width),
      shownHeight: Math.round(box.height),
      pixelRatio: ratio,
      decodedBytes: image.naturalWidth * image.naturalHeight * 4,
      ...(entry && entry.transferSize > 0
        ? { transferBytes: entry.transferSize }
        : {}),
      ...(entry ? { loadMs: Math.round(entry.duration) } : {}),
    });
  });
  return found;
};

/** Ends the sample: keeps the requests made so far and the pictures on the page. */
export const finishLoadSample = () => {
  const sample = current;
  if (!sample || sample.finished) {
    return;
  }
  window.clearTimeout(timer);
  timer = undefined;
  sample.finished = true;
  const end = Date.now();
  sample.requests = getTimedRequests().filter(
    (request) => request.at >= sample.startedAt && request.at <= end
  );
  try {
    sample.images = collectImages();
  } catch (_err) {
    sample.images = [];
  }
  save(sample);
};

/** Starts timing a dashboard load. A sample still being taken is kept. */
export const startLoadSample = (
  urlPath: string | null,
  mode?: "yaml" | "storage"
) => {
  if (current && !current.finished) {
    return;
  }
  currentPerfStart = performance.now();
  entitySet = new Set();
  current = {
    version: 1,
    urlPath,
    path: location.pathname,
    mode,
    startedAt: Date.now(),
    sinceNavigationMs: Math.round(currentPerfStart),
    cards: [],
    skippedCards: 0,
    entityCount: 0,
    requests: [],
    images: [],
    finished: false,
  };
  timer = window.setTimeout(finishLoadSample, LOAD_WINDOW_MS);
};

/** Notes that a card finished its first draw. `startedPerf` and `endedPerf` come from `performance.now()`. */
export const recordCardDraw = (
  info: CardDrawInfo,
  startedPerf: number,
  endedPerf: number
) => {
  const sample = current;
  if (!sample || sample.finished) {
    return;
  }
  const startedMs = Math.max(0, startedPerf - currentPerfStart);
  if (startedMs > LOAD_WINDOW_MS) {
    return;
  }
  for (const id of info.entities) {
    if (entitySet.size < MAX_ENTITIES) {
      entitySet.add(id);
    }
  }
  sample.entityCount = entitySet.size;
  if (sample.cards.length >= MAX_CARDS) {
    sample.skippedCards++;
  } else {
    sample.cards.push({
      type: info.type,
      label: info.label,
      startedMs: Math.round(startedMs),
      endedMs: Math.round(Math.max(startedMs, endedPerf - currentPerfStart)),
      entityCount: info.entities.length,
    });
  }
  saveSoon();
};

/** A short name for a card, from its configuration. */
export const describeCard = (
  config: Record<string, unknown>,
  entities: string[]
): CardDrawInfo => {
  const title = (config.title ?? config.name ?? config.heading) as unknown;
  const label =
    typeof title === "string" && title.trim()
      ? title.trim().slice(0, 80)
      : (entities[0] ?? "");
  return { type: String(config.type ?? "unknown"), label, entities };
};
