/**
 * Health of the offline copy of the app: the service worker that serves it
 * and the caches it fills. The counts of stalls (a file of the app failed to
 * load, or the page had to reload itself to recover) are kept in this
 * browser's own storage by the page that detects them; nothing is sent
 * anywhere.
 */

export const STALLS_KEY = "haWorkerStalls";
export const WORKER_STATE_KEY = "haWorkerState";

export type StallKind = "import" | "reload" | "gave-up";

export interface Stall {
  /** When it happened, in milliseconds since 1970. */
  t: number;
  k: StallKind;
}

export interface WorkerState {
  /** The version of the app when the worker last changed. */
  version: string;
  /** When this browser first saw that version's worker. */
  since: number;
  /** When the page last asked the browser to look for a newer worker. */
  lastCheck: number;
}

const MAX_STALLS = 50;
const DAY_MS = 86_400_000;

const KINDS: StallKind[] = ["import", "reload", "gave-up"];

/** Reads the stall list; anything unreadable counts as no stalls. */
export const parseStalls = (text: string | null): Stall[] => {
  if (!text) {
    return [];
  }
  try {
    const value = JSON.parse(text);
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter(
      (item): item is Stall =>
        !!item &&
        typeof item.t === "number" &&
        Number.isFinite(item.t) &&
        KINDS.includes(item.k)
    );
  } catch (_err) {
    return [];
  }
};

/** Adds a stall and keeps the newest `MAX_STALLS`. */
export const addStall = (
  stalls: Stall[],
  kind: StallKind,
  now: number
): Stall[] => [...stalls, { t: now, k: kind }].slice(-MAX_STALLS);

/** How many stalls happened in the last `days` days. */
export const countStalls = (
  stalls: Stall[],
  days: number,
  now: number
): number =>
  stalls.filter((s) => s.t > now - days * DAY_MS && s.t <= now).length;

export const readStalls = (): Stall[] => {
  try {
    return parseStalls(localStorage.getItem(STALLS_KEY));
  } catch (_err) {
    return [];
  }
};

/** Records that the app had a stall. Never throws. */
export const recordStall = (kind: StallKind) => {
  try {
    localStorage.setItem(
      STALLS_KEY,
      JSON.stringify(addStall(readStalls(), kind, Date.now()))
    );
  } catch (_err) {
    // Storage is blocked or full; the stall just is not counted.
  }
};

export const readWorkerState = (): WorkerState | undefined => {
  try {
    const value = JSON.parse(localStorage.getItem(WORKER_STATE_KEY) ?? "null");
    return value &&
      typeof value.version === "string" &&
      typeof value.since === "number" &&
      typeof value.lastCheck === "number"
      ? value
      : undefined;
  } catch (_err) {
    return undefined;
  }
};

/** The state after a page asked for a worker check; the "since" moment moves only when the version changes. */
export const nextWorkerState = (
  previous: WorkerState | undefined,
  version: string,
  now: number
): WorkerState => ({
  version,
  since: previous && previous.version === version ? previous.since : now,
  lastCheck: now,
});

/** Notes that this page asked the browser to look for a newer worker. Never throws. */
export const recordWorkerCheck = (version: string) => {
  try {
    localStorage.setItem(
      WORKER_STATE_KEY,
      JSON.stringify(nextWorkerState(readWorkerState(), version, Date.now()))
    );
  } catch (_err) {
    // Not stored; the page then shows no last check.
  }
};

const OWN_CACHES = [
  "navigation-cache",
  "brands",
  "map-assets",
  "map-tiles",
  "map-tilejson",
  "file-cache",
];

/** The caches the app's own worker fills. Other caches on this address are left alone. */
export const isOwnCache = (name: string): boolean =>
  name.startsWith("workbox-") || OWN_CACHES.includes(name);

export interface CacheInfo {
  name: string;
  entries: number;
  /** Bytes of the stored answers. */
  bytes: number;
  /** True when the list was too long to add up completely. */
  partial: boolean;
}

export type WorkerVerdict =
  "healthy" | "attention" | "inactive" | "unsupported";

export interface WorkerHealth {
  supported: boolean;
  /** A worker is registered for this page. */
  registered: boolean;
  /** The worker's state: "activated", "installing", "waiting" and so on. */
  state?: string;
  /** This page is served by the worker. */
  controlled: boolean;
  /** A newer worker is installed and waiting for the page to let go. */
  updateWaiting: boolean;
  caches: CacheInfo[];
}

export const workerSupported = (): boolean =>
  "serviceWorker" in navigator &&
  (location.protocol === "https:" || location.hostname === "localhost");

/** Reads the worker and the app's caches. Sizes need every stored answer read, so a cache is added up from at most `limit` entries. */
export const readWorkerHealth = async (limit = 400): Promise<WorkerHealth> => {
  if (!workerSupported()) {
    return {
      supported: false,
      registered: false,
      controlled: false,
      updateWaiting: false,
      caches: [],
    };
  }
  let registration: ServiceWorkerRegistration | undefined;
  try {
    registration = await navigator.serviceWorker.getRegistration();
  } catch (_err) {
    registration = undefined;
  }
  const caches_: CacheInfo[] = [];
  if ("caches" in window) {
    try {
      const names = (await caches.keys()).filter(isOwnCache).sort();
      for (const name of names) {
        // eslint-disable-next-line no-await-in-loop
        const cache = await caches.open(name);
        // eslint-disable-next-line no-await-in-loop
        const requests = await cache.keys();
        let bytes = 0;
        for (const request of requests.slice(0, limit)) {
          // eslint-disable-next-line no-await-in-loop
          const response = await cache.match(request);
          if (response) {
            // eslint-disable-next-line no-await-in-loop
            bytes += (await response.blob()).size;
          }
        }
        caches_.push({
          name,
          entries: requests.length,
          bytes,
          partial: requests.length > limit,
        });
      }
    } catch (_err) {
      // The browser refused to list its caches; they show as none.
    }
  }
  const worker =
    registration?.active ?? registration?.waiting ?? registration?.installing;
  return {
    supported: true,
    registered: !!registration,
    state: worker?.state,
    controlled: !!navigator.serviceWorker.controller,
    updateWaiting: !!registration?.waiting,
    caches: caches_,
  };
};

/** What the card on the diagnostics page says about the offline copy. */
export const workerVerdict = (
  health: WorkerHealth,
  stallsThisWeek: number
): WorkerVerdict => {
  if (!health.supported) {
    return "unsupported";
  }
  if (!health.registered || health.state !== "activated") {
    return "inactive";
  }
  return stallsThisWeek > 0 || health.updateWaiting ? "attention" : "healthy";
};

/**
 * Removes the worker and the app's own caches. The person's settings and
 * sign-in are in other storage and are not touched. The caller reloads the
 * page afterwards.
 */
export const repairWorker = async (): Promise<void> => {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((reg) => reg.unregister()));
  }
  if ("caches" in window) {
    const names = (await caches.keys()).filter(isOwnCache);
    await Promise.all(names.map((name) => caches.delete(name)));
  }
};
