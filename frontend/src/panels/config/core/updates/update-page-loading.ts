/**
 * Loading rules for the updates page. Nothing on the page may wait for a call
 * that never answers: every call has a time limit, a failure is a state the
 * page can show, and a failed call is tried again after a pause and when the
 * connection comes back. Plain code, so it can be tested without a page.
 */

/** How long the page waits for the backup state before it shows itself. */
export const BACKUP_WAIT_MS = 2000;

/** The time limit of one Supervisor call. */
export const CALL_TIMEOUT_MS = 8000;

/** Pauses before each new attempt; the last one repeats. */
export const RETRY_PAUSES_MS = [3000, 6000, 12000, 30000];

export class CallTimeoutError extends Error {
  constructor() {
    super("The call did not answer in time");
    this.name = "CallTimeoutError";
  }
}

/** Rejects when `promise` has not settled within `ms`. */
export const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new CallTimeoutError()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });

/**
 * Whether the whole page is replaced by a spinner. Only while the backup
 * state is still unknown and the short wait is not over; after that the page
 * shows itself with whatever it has.
 */
export const pageShowsSpinner = (
  backupState: string | undefined,
  watchesBackups: boolean,
  waitOver: boolean
): boolean => backupState === undefined && watchesBackups && !waitOver;

export type LoadStatus = "idle" | "loading" | "ready" | "error";

/**
 * One call that loads a block of the page on its own. It never throws, ends
 * in "ready" or "error", and tries again by itself after a failure.
 */
export class RetryingLoad<T> {
  public status: LoadStatus = "idle";

  public value?: T;

  private _attempt = 0;

  private _timer?: ReturnType<typeof setTimeout>;

  private _stopped = false;

  private _run = 0;

  constructor(
    private _load: () => Promise<T>,
    private _changed: () => void,
    private _timeoutMs: number = CALL_TIMEOUT_MS,
    private _pauses: readonly number[] = RETRY_PAUSES_MS
  ) {}

  public start(): void {
    this._stopped = false;
    void this._try();
  }

  public stop(): void {
    this._stopped = true;
    clearTimeout(this._timer);
    this._timer = undefined;
  }

  /** The connection came back: try again now unless it is loaded. */
  public retryNow(): void {
    if (this._stopped || this.status === "ready" || this.status === "loading") {
      return;
    }
    clearTimeout(this._timer);
    this._timer = undefined;
    void this._try();
  }

  private async _try(): Promise<void> {
    const run = ++this._run;
    this.status = "loading";
    this._changed();
    try {
      const value = await withTimeout(this._load(), this._timeoutMs);
      if (this._stopped || run !== this._run) {
        return;
      }
      this.value = value;
      this.status = "ready";
      this._attempt = 0;
    } catch (_err) {
      if (this._stopped || run !== this._run) {
        return;
      }
      this.status = "error";
      const pause =
        this._pauses[Math.min(this._attempt, this._pauses.length - 1)];
      this._attempt++;
      this._timer = setTimeout(() => {
        this._timer = undefined;
        void this._try();
      }, pause);
    }
    this._changed();
  }
}
