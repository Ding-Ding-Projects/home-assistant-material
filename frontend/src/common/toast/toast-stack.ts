/**
 * Queue rules for the stacked toasts.
 *
 * This file holds no DOM and no timers: it decides which toasts are visible,
 * which wait, and which arrivals are dropped as duplicates. The notification
 * manager renders what it reports.
 */

export const TOAST_MAX_VISIBLE = 3;
export const TOAST_DEDUPE_WINDOW_MS = 2000;
export const TOAST_MIN_DURATION_MS = 4000;

export type ToastSeverity = "info" | "warning" | "error";

export interface ToastStackItem<T = unknown> {
  /** Stable key. Pushing an existing key updates that toast in place. */
  key: string;
  /**
   * Text used to recognise an identical message. Items without an explicit
   * `id` are de-duplicated on this text; identified items update in place.
   */
  text: string;
  /** Identified toasts are never dropped as duplicates; they update in place. */
  identified: boolean;
  data: T;
}

export type ToastPushOutcome =
  "shown" | "queued" | "updated" | "updated-queued" | "duplicate";

export interface ToastPushResult {
  outcome: ToastPushOutcome;
}

export interface ToastStackOptions {
  maxVisible?: number;
  dedupeWindowMs?: number;
  now?: () => number;
}

/**
 * Normalises how long a toast stays.
 *
 * - progress toasts and errors or warnings without an explicit duration stay
 *   until dismissed or replaced (-1)
 * - an undefined or very short duration becomes the four second minimum
 * - any other duration is kept as given
 */
export const normalizeToastDuration = (
  duration: number | undefined,
  severity?: ToastSeverity,
  hasProgress = false
): number => {
  if (
    hasProgress ||
    (duration === undefined && (severity === "warning" || severity === "error"))
  ) {
    return -1;
  }
  if (duration === undefined || (duration > 0 && duration <= 4000)) {
    return TOAST_MIN_DURATION_MS;
  }
  return duration;
};

export class ToastStack<T = unknown> {
  private _visible: ToastStackItem<T>[] = [];

  private _queue: ToastStackItem<T>[] = [];

  private _lastArrival = new Map<string, number>();

  private readonly _maxVisible: number;

  private readonly _dedupeWindowMs: number;

  private readonly _now: () => number;

  public constructor(options: ToastStackOptions = {}) {
    this._maxVisible = Math.max(1, options.maxVisible ?? TOAST_MAX_VISIBLE);
    this._dedupeWindowMs = options.dedupeWindowMs ?? TOAST_DEDUPE_WINDOW_MS;
    this._now = options.now ?? (() => Date.now());
  }

  /** Visible toasts, oldest first. The last one is the newest. */
  public get visible(): readonly ToastStackItem<T>[] {
    return this._visible;
  }

  /** Waiting toasts in arrival order. */
  public get queued(): readonly ToastStackItem<T>[] {
    return this._queue;
  }

  public get all(): readonly ToastStackItem<T>[] {
    return [...this._visible, ...this._queue];
  }

  public get(key: string): ToastStackItem<T> | undefined {
    return this.all.find((item) => item.key === key);
  }

  public isVisible(key: string): boolean {
    return this._visible.some((item) => item.key === key);
  }

  public push(item: ToastStackItem<T>): ToastPushResult {
    const visibleIndex = this._visible.findIndex(
      (existing) => existing.key === item.key
    );
    if (visibleIndex !== -1) {
      this._visible = this._visible.map((existing, index) =>
        index === visibleIndex ? item : existing
      );
      return { outcome: "updated" };
    }
    const queuedIndex = this._queue.findIndex(
      (existing) => existing.key === item.key
    );
    if (queuedIndex !== -1) {
      this._queue = this._queue.map((existing, index) =>
        index === queuedIndex ? item : existing
      );
      return { outcome: "updated-queued" };
    }

    const now = this._now();
    if (!item.identified) {
      const last = this._lastArrival.get(item.text);
      const sameTextPresent = this.all.some(
        (existing) => !existing.identified && existing.text === item.text
      );
      if (
        sameTextPresent &&
        last !== undefined &&
        now - last <= this._dedupeWindowMs
      ) {
        return { outcome: "duplicate" };
      }
      this._lastArrival.set(item.text, now);
      this._pruneArrivals(now);
    }

    if (this._visible.length < this._maxVisible) {
      this._visible = [...this._visible, item];
      return { outcome: "shown" };
    }
    this._queue = [...this._queue, item];
    return { outcome: "queued" };
  }

  /**
   * Removes a toast, visible or waiting. Returns the toast promoted from the
   * queue into the freed visible slot, if any.
   */
  public remove(key: string): ToastStackItem<T> | undefined {
    if (this._queue.some((item) => item.key === key)) {
      this._queue = this._queue.filter((item) => item.key !== key);
      return undefined;
    }
    if (!this._visible.some((item) => item.key === key)) {
      return undefined;
    }
    this._visible = this._visible.filter((item) => item.key !== key);
    const next = this._queue[0];
    if (!next) {
      return undefined;
    }
    this._queue = this._queue.slice(1);
    this._visible = [...this._visible, next];
    return next;
  }

  public clear(): void {
    this._visible = [];
    this._queue = [];
    this._lastArrival.clear();
  }

  private _pruneArrivals(now: number): void {
    for (const [text, time] of this._lastArrival) {
      if (now - time > this._dedupeWindowMs) {
        this._lastArrival.delete(text);
      }
    }
  }
}
