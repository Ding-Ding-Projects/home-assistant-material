/**
 * Reads a readable message from whatever a failed Home Assistant call rejected
 * with. The websocket API rejects with `{ code, message }` objects and the REST
 * API with `{ body: { message } }`, neither of which is an `Error`.
 */
export const getErrorMessage = (err: unknown): string => {
  if (typeof err === "string") {
    return err;
  }
  if (err && typeof err === "object") {
    const candidate = err as {
      message?: unknown;
      body?: { message?: unknown } | string;
      error?: unknown;
    };
    if (typeof candidate.message === "string" && candidate.message) {
      return candidate.message;
    }
    if (typeof candidate.body === "string" && candidate.body) {
      return candidate.body;
    }
    if (
      candidate.body &&
      typeof candidate.body === "object" &&
      typeof candidate.body.message === "string" &&
      candidate.body.message
    ) {
      return candidate.body.message;
    }
    if (typeof candidate.error === "string" && candidate.error) {
      return candidate.error;
    }
    try {
      return JSON.stringify(err);
    } catch (_e: unknown) {
      return String(err);
    }
  }
  return String(err);
};

const runsInProgress = new Set<string>();

/**
 * One run at a time per automation or script, shared by every place that can
 * start a run (the status bar and the editor menu). Returns a release function,
 * or undefined when a run for this key is already in progress.
 */
export const beginRun = (key: string): (() => void) | undefined => {
  if (runsInProgress.has(key)) {
    return undefined;
  }
  runsInProgress.add(key);
  return () => {
    runsInProgress.delete(key);
  };
};
