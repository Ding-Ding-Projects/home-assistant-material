import { REGEX_LIMITS } from "./query";
import type {
  RegexWorkerRequest,
  RegexWorkerResponse,
  RegexWorkerResult,
} from "./regex-worker";

/**
 * Runs regular expressions in a worker with a time limit.
 *
 * JavaScript cannot interrupt a regular expression once it is running. The
 * only way to stop one is to end the thread it runs on, so every evaluation
 * the workbench shows happens in a worker. When the time limit passes, the
 * worker is ended and a fresh one is started for the next request.
 */

export type RegexOutcome<T extends RegexWorkerResult["type"]> =
  | { status: "ok"; result: Extract<RegexWorkerResult, { type: T }> }
  /** The engine rejected the pattern. `message` is the engine's own text. */
  | { status: "invalid"; message: string }
  /** The time limit passed and the evaluation was stopped. */
  | { status: "timeout"; limitMs: number }
  /** A newer request replaced this one. */
  | { status: "cancelled" }
  /** Workers are not available, so nothing was evaluated. */
  | { status: "unavailable" };

type DistributiveOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

export type RegexRequest = DistributiveOmit<RegexWorkerRequest, "id">;

interface Pending {
  resolve: (outcome: RegexOutcome<RegexWorkerResult["type"]>) => void;
  timer: number;
}

let worker: Worker | undefined;
let nextId = 1;
const pending = new Map<number, Pending>();

const stopWorker = (
  outcome: RegexOutcome<RegexWorkerResult["type"]>,
  exceptId?: number
) => {
  worker?.terminate();
  worker = undefined;
  pending.forEach((entry, id) => {
    window.clearTimeout(entry.timer);
    if (id !== exceptId) {
      entry.resolve(outcome);
    }
  });
  pending.clear();
};

const getWorker = (): Worker | undefined => {
  if (worker) {
    return worker;
  }
  if (typeof Worker === "undefined") {
    return undefined;
  }
  try {
    worker = new Worker(
      /* webpackChunkName: "regex-worker" */
      new URL("./regex-worker", import.meta.url)
    );
  } catch (_err) {
    return undefined;
  }
  worker.onmessage = (ev: MessageEvent<RegexWorkerResponse>) => {
    const entry = pending.get(ev.data.id);
    if (!entry) {
      return;
    }
    pending.delete(ev.data.id);
    window.clearTimeout(entry.timer);
    entry.resolve(
      ev.data.ok
        ? { status: "ok", result: ev.data.result }
        : { status: "invalid", message: ev.data.message }
    );
  };
  worker.onerror = () => {
    stopWorker({ status: "unavailable" });
  };
  return worker;
};

/** Stops whatever is running. Waiting requests resolve as cancelled. */
export const cancelRegexEvaluations = () => {
  if (pending.size) {
    stopWorker({ status: "cancelled" });
  }
};

export const evaluateRegex = <T extends RegexRequest["type"]>(
  request: Extract<RegexRequest, { type: T }>,
  limitMs: number = REGEX_LIMITS.timeoutMs
): Promise<RegexOutcome<T>> =>
  new Promise((resolve) => {
    const target = getWorker();
    if (!target) {
      resolve({ status: "unavailable" });
      return;
    }
    const id = nextId++;
    const timer = window.setTimeout(() => {
      // Ending the worker is the only way to stop the evaluation. Anything
      // queued behind it is cancelled and can be asked for again.
      stopWorker({ status: "cancelled" }, id);
      resolve({ status: "timeout", limitMs });
    }, limitMs);
    pending.set(id, {
      resolve: resolve as Pending["resolve"],
      timer,
    });
    target.postMessage({ ...request, id });
  });
