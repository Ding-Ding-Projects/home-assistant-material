/**
 * Times the history and statistics requests this browser makes, so the
 * dashboard diagnostics page can say which of them were slow. Only the
 * measurements are kept: what was asked for (the entities and how far back),
 * and how long the answer took to arrive. They stay in this browser; nothing
 * is sent anywhere.
 */

export type TimedRequestKind = "history" | "statistics";

export interface TimedRequest {
  kind: TimedRequestKind;
  /** When the request was made, in milliseconds since 1970. */
  at: number;
  /** Milliseconds from asking to the first answer. */
  ms: number;
  /** The entities asked for, at most `MAX_ENTITIES`. */
  entityIds: string[];
  /** How many entities were asked for in all. */
  entityCount: number;
  /** How many hours of history the request covers. */
  spanHours: number;
  failed?: boolean;
}

const MAX_REQUESTS = 100;
const MAX_ENTITIES = 50;
const HOUR_MS = 3_600_000;

let requests: TimedRequest[] = [];
const listeners = new Set<() => void>();

export const getTimedRequests = (): TimedRequest[] => requests.slice();

/** Calls `listener` after each recorded request; returns a function that stops it. */
export const subscribeTimedRequests = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const recordTimedRequest = (request: TimedRequest) => {
  requests.push(request);
  if (requests.length > MAX_REQUESTS) {
    requests = requests.slice(requests.length - MAX_REQUESTS);
  }
  listeners.forEach((listener) => listener());
};

/** Forgets every recorded request (used by tests). */
export const clearTimedRequests = () => {
  requests = [];
};

const toMs = (
  value: Date | number | string | undefined
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }
  const ms =
    value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(ms) ? ms : undefined;
};

/** Hours between two moments; the end defaults to now. Never negative; undefined when a moment is not a date. */
export const spanInHours = (
  start: Date | number | string | undefined,
  end?: Date | number | string
): number | undefined => {
  const from = toMs(start);
  const to = end === undefined ? Date.now() : toMs(end);
  if (from === undefined || to === undefined) {
    return undefined;
  }
  return Math.max(0, (to - from) / HOUR_MS);
};

interface TimeRequestMeta {
  kind: TimedRequestKind;
  entityIds: string[] | undefined;
  startTime: Date | number | string | undefined;
  endTime?: Date | number | string;
}

/**
 * Runs `run` and records how long it took to settle. The result, or the
 * failure, is passed on unchanged. A request that names no start time is
 * still timed but counts as covering no hours.
 */
export const timeRequest = <T>(
  meta: TimeRequestMeta,
  run: () => Promise<T>
): Promise<T> => {
  const finish = startTimedRequest(meta);
  const promise = run();
  if (typeof promise?.then === "function") {
    promise.then(
      () => finish(false),
      () => finish(true)
    );
  }
  return promise;
};

/**
 * Starts the clock for a request that is answered more than once, such as a
 * stream. Call the returned function when the first answer arrives (or when
 * the request fails); later calls do nothing.
 */
export const startTimedRequest = (
  meta: TimeRequestMeta
): ((failed?: boolean) => void) => {
  const started = performance.now();
  const at = Date.now();
  let done = false;
  return (failed = false) => {
    if (done) {
      return;
    }
    done = true;
    try {
      const ids = meta.entityIds ?? [];
      recordTimedRequest({
        kind: meta.kind,
        at,
        ms: Math.round((performance.now() - started) * 10) / 10,
        entityIds: ids.slice(0, MAX_ENTITIES),
        entityCount: ids.length,
        spanHours:
          Math.round((spanInHours(meta.startTime, meta.endTime) ?? 0) * 10) /
          10,
        ...(failed ? { failed: true } : {}),
      });
    } catch (_err) {
      // A measurement must never break the request it measures.
    }
  };
};
