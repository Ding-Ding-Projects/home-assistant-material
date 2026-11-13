import type {
  LoadSample,
  RecordedImage,
} from "../../lovelace/common/load-diagnostics";
import { cardEntities } from "../../lovelace/editor/dashboard-tools";

/**
 * Turns what the browser measured while a dashboard loaded into a list of
 * things that slowed it down, slowest first, and works out which of them
 * have a real change that can be made to the dashboard. Pure functions: the
 * measurements come in, text-free results go out.
 */

/** A history graph that reaches further back than this is asking for more than it usually shows. */
export const HISTORY_MAX_HOURS = 24;
/** The same limit for a statistics graph, in days. */
export const STATISTICS_MAX_DAYS = 7;
/** A card that needs longer than this for its first draw is worth a look. */
export const SLOW_CARD_MS = 1000;
/** A custom resource that downloaded slower than this, or was bigger than `LARGE_RESOURCE_BYTES`. */
export const SLOW_RESOURCE_MS = 800;
export const LARGE_RESOURCE_BYTES = 500_000;
/** A picture is larger than needed when it has this many times the pixels the card shows. */
export const OVERSIZED_FACTOR = 2;
export const OVERSIZED_MIN_WIDTH = 800;

const HOUR_TOLERANCE = 0.1;

export type FindingKind =
  | "history-span"
  | "statistics-span"
  | "slow-card"
  | "large-image"
  | "custom-resource";

/** A change the page can make to the stored dashboard. */
export type FixSpec =
  | { type: "history-hours"; entityIds: string[]; to: number }
  | { type: "statistics-days"; entityIds: string[]; to: number }
  | { type: "image-size"; path: string; size: 256 | 512 };

export interface Finding {
  id: string;
  kind: FindingKind;
  /** Measured milliseconds, the key the list is sorted by. */
  ms: number;
  /** Values for the sentence that describes it. */
  args: Record<string, string | number>;
  /** A change to the dashboard that would help, when there is one. */
  fix?: FixSpec;
  /** A page where the person can act, when the change is theirs to choose. */
  reviewPath?: string;
}

export interface LoadSummary {
  /** Milliseconds from the start of the load to the first finished card. */
  firstCardsMs?: number;
  /** Milliseconds from the start of the load to the last finished card. */
  allCardsMs?: number;
}

export const summarizeLoad = (sample: LoadSample): LoadSummary => {
  if (!sample.cards.length) {
    return {};
  }
  return {
    firstCardsMs: Math.min(...sample.cards.map((card) => card.endedMs)),
    allCardsMs: Math.max(...sample.cards.map((card) => card.endedMs)),
  };
};

export interface ResourceTiming {
  /** The file's address. */
  url: string;
  ms: number;
  /** Bytes over the network; undefined when the browser does not report it. */
  bytes?: number;
}

/** The parts of a resource timing entry that are used here. */
export interface TimingEntry {
  name: string;
  duration: number;
  transferSize: number;
  decodedBodySize: number;
  initiatorType: string;
}

const pathOf = (value: string, origin: string): string | undefined => {
  try {
    const url = new URL(value, origin);
    return url.origin === origin ? url.pathname : undefined;
  } catch (_err) {
    return undefined;
  }
};

/**
 * The slowest files of the product itself: same-origin scripts, styles, fonts
 * and pictures, not the data requests. Slowest first.
 */
export const ownFileTimings = (
  entries: TimingEntry[],
  origin: string,
  limit = 8
): ResourceTiming[] =>
  entries
    .filter((entry) => {
      const path = pathOf(entry.name, origin);
      return (
        path !== undefined &&
        !path.startsWith("/api/") &&
        !path.startsWith("/auth/") &&
        entry.initiatorType !== "fetch" &&
        entry.initiatorType !== "xmlhttprequest"
      );
    })
    .map((entry) => ({
      url: pathOf(entry.name, origin)!,
      ms: Math.round(entry.duration),
      ...(entry.transferSize > 0 ? { bytes: entry.transferSize } : {}),
    }))
    .sort((a, b) => b.ms - a.ms)
    .slice(0, limit);

/** The timing of each custom resource the dashboard lists, when the browser measured it. */
export const customResourceTimings = (
  resourceUrls: string[],
  entries: TimingEntry[],
  origin: string
): ResourceTiming[] => {
  const result: ResourceTiming[] = [];
  for (const raw of resourceUrls) {
    let target: string;
    try {
      target = new URL(raw, origin).href.split("#")[0];
    } catch (_err) {
      continue;
    }
    const base = target.split("?")[0];
    const entry = [...entries]
      .reverse()
      .find((e) => e.name === target || e.name.split("?")[0] === base);
    if (!entry) {
      continue;
    }
    result.push({
      url: raw.split("?")[0],
      ms: Math.round(entry.duration),
      ...(entry.transferSize > 0
        ? { bytes: entry.transferSize }
        : entry.decodedBodySize > 0
          ? { bytes: entry.decodedBodySize }
          : {}),
    });
  }
  return result;
};

const imageNeedsSmallerCopy = (image: RecordedImage): boolean =>
  image.naturalWidth >= OVERSIZED_MIN_WIDTH &&
  image.shownWidth > 0 &&
  image.naturalWidth >=
    image.shownWidth * Math.max(1, image.pixelRatio) * OVERSIZED_FACTOR;

const IMAGE_ORIGINAL = /^\/api\/image\/serve\/([^/]+)\/original$/;

/** The smallest stored size that still covers what the card shows, when the picture is an uploaded one. */
const imageFix = (image: RecordedImage): FixSpec | undefined => {
  if (!IMAGE_ORIGINAL.test(image.path)) {
    return undefined;
  }
  const needed = image.shownWidth * Math.max(1, image.pixelRatio);
  if (needed <= 256) {
    return { type: "image-size", path: image.path, size: 256 };
  }
  if (needed <= 512) {
    return { type: "image-size", path: image.path, size: 512 };
  }
  return undefined;
};

const entityKey = (ids: string[]) => [...ids].sort().join("\n");

/** Every reason this load was slow that the measurements show, slowest first. */
export const buildFindings = (
  sample: LoadSample,
  customResources: ResourceTiming[] = []
): Finding[] => {
  const findings: Finding[] = [];

  // History and statistics requests that reach far back. One finding per set
  // of entities, from the slowest of its requests.
  const spans = new Map<string, Finding>();
  for (const request of sample.requests) {
    if (request.failed) {
      continue;
    }
    const isHistory = request.kind === "history";
    const limitHours = isHistory ? HISTORY_MAX_HOURS : STATISTICS_MAX_DAYS * 24;
    if (request.spanHours <= limitHours + HOUR_TOLERANCE) {
      continue;
    }
    const key = `${request.kind}:${entityKey(request.entityIds)}`;
    const complete = request.entityCount === request.entityIds.length;
    const days = Math.round(request.spanHours / 24);
    const finding: Finding = {
      id: key,
      kind: isHistory ? "history-span" : "statistics-span",
      ms: request.ms,
      args: {
        days,
        hours: Math.round(request.spanHours),
        entities: request.entityCount,
        limit: isHistory ? HISTORY_MAX_HOURS : STATISTICS_MAX_DAYS,
        first: request.entityIds[0] ?? "",
      },
      ...(complete && request.entityIds.length
        ? {
            fix: isHistory
              ? {
                  type: "history-hours" as const,
                  entityIds: request.entityIds,
                  to: HISTORY_MAX_HOURS,
                }
              : {
                  type: "statistics-days" as const,
                  entityIds: request.entityIds,
                  to: STATISTICS_MAX_DAYS,
                },
          }
        : {}),
    };
    const known = spans.get(key);
    if (!known || known.ms < finding.ms) {
      spans.set(key, finding);
    }
  }
  findings.push(...spans.values());

  for (const [index, card] of sample.cards.entries()) {
    const ms = card.endedMs - card.startedMs;
    if (ms >= SLOW_CARD_MS) {
      findings.push({
        id: `card:${index}`,
        kind: "slow-card",
        ms,
        args: { type: card.type, label: card.label || card.type },
      });
    }
  }

  const seenImages = new Set<string>();
  for (const image of sample.images) {
    if (!imageNeedsSmallerCopy(image) || seenImages.has(image.path)) {
      continue;
    }
    seenImages.add(image.path);
    const fix = imageFix(image);
    findings.push({
      id: `image:${image.path}`,
      kind: "large-image",
      ms: image.loadMs ?? 0,
      args: {
        path: image.path,
        natural: image.naturalWidth,
        shown: image.shownWidth,
        megabytes: Math.round((image.decodedBytes / 1_000_000) * 10) / 10,
      },
      ...(fix ? { fix } : {}),
    });
  }

  for (const resource of customResources) {
    if (
      resource.ms >= SLOW_RESOURCE_MS ||
      (resource.bytes ?? 0) >= LARGE_RESOURCE_BYTES
    ) {
      findings.push({
        id: `resource:${resource.url}`,
        kind: "custom-resource",
        ms: resource.ms,
        args: {
          url: resource.url,
          kilobytes: Math.round((resource.bytes ?? 0) / 1000),
        },
        reviewPath: "/config/lovelace/resources",
      });
    }
  }

  return findings.sort((a, b) => b.ms - a.ms);
};

// ---- Changing the stored dashboard -------------------------------------

type Json = Record<string, unknown>;

const isObject = (value: unknown): value is Json =>
  !!value && typeof value === "object" && !Array.isArray(value);

const walkObjects = (value: unknown, visit: (object: Json) => void) => {
  if (Array.isArray(value)) {
    value.forEach((item) => walkObjects(item, visit));
  } else if (isObject(value)) {
    visit(value);
    Object.values(value).forEach((item) => walkObjects(item, visit));
  }
};

export interface FixResult {
  /** The dashboard with the change made; the original is left untouched. */
  config: unknown;
  /** How many cards or pictures were changed. */
  changed: number;
}

const sameEntities = (card: Json, ids: string[]): boolean => {
  const found = cardEntities(card);
  return found.length > 0 && entityKey(found) === entityKey(ids);
};

/**
 * Makes the change a finding suggests to a copy of the dashboard. Returns
 * undefined when nothing in the stored dashboard matches (for example the
 * request came from another page, or the dashboard is made by a strategy).
 */
export const applyFix = (
  config: unknown,
  fix: FixSpec,
  origin: string
): FixResult | undefined => {
  const next = structuredClone(config);
  let changed = 0;
  if (fix.type === "history-hours") {
    walkObjects(next, (object) => {
      if (
        object.type === "history-graph" &&
        typeof object.hours_to_show === "number" &&
        object.hours_to_show > fix.to &&
        sameEntities(object, fix.entityIds)
      ) {
        object.hours_to_show = fix.to;
        changed++;
      }
    });
  } else if (fix.type === "statistics-days") {
    walkObjects(next, (object) => {
      if (
        object.type === "statistics-graph" &&
        typeof object.days_to_show === "number" &&
        object.days_to_show > fix.to &&
        sameEntities(object, fix.entityIds)
      ) {
        object.days_to_show = fix.to;
        changed++;
      }
    });
  } else {
    const match = IMAGE_ORIGINAL.exec(fix.path);
    if (!match) {
      return undefined;
    }
    const replacement = `/api/image/serve/${match[1]}/${fix.size}x${fix.size}`;
    walkObjects(next, (object) => {
      for (const [key, value] of Object.entries(object)) {
        if (typeof value === "string" && pathOf(value, origin) === fix.path) {
          object[key] = value.replace(fix.path, replacement);
          changed++;
        }
      }
    });
  }
  return changed ? { config: next, changed } : undefined;
};
