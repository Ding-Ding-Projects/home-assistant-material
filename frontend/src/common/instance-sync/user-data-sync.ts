import type { Connection, UnsubscribeFunc } from "home-assistant-js-websocket";
import type { SyncedUserData, ValidUserDataKey } from "../../data/frontend";
import { ownerStillClaimed } from "./sync-owner";
import {
  saveFrontendUserData,
  subscribeFrontendUserData,
} from "../../data/frontend";

/**
 * Keeps one browser-side setting in step with the signed-in person's copy on
 * this instance.
 *
 * The browser copy stays as a fast cache. Once the instance copy has loaded it
 * is the source of truth, with three promises: a value that exists only in
 * this browser is uploaded, never dropped; when both exist and differ the one
 * with the newer `updated` time wins and the page says which; and every value
 * is checked with the owning feature's validator before it is used, because
 * the instance copy is still input.
 *
 * Nothing is sent anywhere except this instance's own websocket. A failed
 * save is reported by status code only: no error text and no value is kept.
 */

/**
 * Largest synced value, in bytes. The websocket carries messages of up to
 * 4 MiB by default; staying at 768 KiB leaves a wide margin.
 */
export const SYNC_MAX_BYTES = 786432;

export const SYNC_DEBOUNCE_MS = 800;

const META_PREFIX = "instanceSync.";

export interface LocalState<T> {
  /** Epoch milliseconds of the last local change; 0 for an older value. */
  updated: number;
  /** Undefined when the person cleared the setting. */
  value: T | undefined;
}

export type InstanceState<T> = LocalState<T> | "invalid" | undefined;

export type MergePlan =
  | { action: "keep" }
  | { action: "adopt-instance"; conflict: boolean }
  | { action: "upload-local"; conflict: boolean; replacedInvalid: boolean };

/**
 * How far ahead of this device's clock a stored time may be before it is not
 * believed (five minutes: enough for two devices whose clocks differ).
 */
export const MAX_CLOCK_SKEW_MS = 300000;

/**
 * A time more than a few minutes in the future comes from a fast or wrong
 * clock. It counts as now, so it cannot win every later merge.
 */
export const clampStamp = (updated: number, now = Date.now()): number =>
  updated > now + MAX_CLOCK_SKEW_MS ? now : updated;

/** Reads the stored wrapper without trusting its shape. */
export const parseEnvelope = (
  raw: unknown,
  now = Date.now()
): { updated: number; data: unknown } | "invalid" | undefined => {
  if (raw === null || raw === undefined) {
    return undefined;
  }
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return "invalid";
  }
  const envelope = raw as Record<string, unknown>;
  if (
    envelope.version !== 1 ||
    typeof envelope.updated !== "number" ||
    !Number.isFinite(envelope.updated) ||
    envelope.updated < 0 ||
    !("data" in envelope)
  ) {
    return "invalid";
  }
  return { updated: clampStamp(envelope.updated, now), data: envelope.data };
};

/** Turns what the instance holds into a state, validating the value. */
export const toInstanceState = <T>(
  raw: unknown,
  validate: (data: unknown) => T | undefined
): InstanceState<T> => {
  const envelope = parseEnvelope(raw);
  if (envelope === undefined || envelope === "invalid") {
    return envelope;
  }
  if (envelope.data === null) {
    return { updated: envelope.updated, value: undefined };
  }
  const value = validate(envelope.data);
  return value === undefined ? "invalid" : { updated: envelope.updated, value };
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])])
    );
  }
  return value;
};

/** JSON with the keys of every object in order, so equal values match. */
export const canonicalJson = (value: unknown): string =>
  JSON.stringify(sortKeys(value)) ?? "";

const sameJson = (a: unknown, b: unknown): boolean =>
  canonicalJson(a) === canonicalJson(b);

/** Decides what to do with the browser copy and the instance copy. */
export const planMerge = <T>(
  local: LocalState<T> | undefined,
  instance: InstanceState<T>,
  equal: (a: T, b: T) => boolean = sameJson
): MergePlan => {
  if (instance === undefined) {
    // Nothing on the instance yet: a value made here (earlier, or while
    // offline) goes up once.
    return local?.value !== undefined
      ? { action: "upload-local", conflict: false, replacedInvalid: false }
      : { action: "keep" };
  }
  if (instance === "invalid") {
    return local?.value !== undefined
      ? { action: "upload-local", conflict: false, replacedInvalid: true }
      : { action: "keep" };
  }
  if (!local) {
    return instance.value !== undefined
      ? { action: "adopt-instance", conflict: false }
      : { action: "keep" };
  }
  const same =
    local.value === undefined || instance.value === undefined
      ? local.value === instance.value
      : equal(local.value, instance.value);
  if (same) {
    return { action: "keep" };
  }
  // Both exist and differ: the newer one wins, a tie goes to the instance.
  return instance.updated >= local.updated
    ? { action: "adopt-instance", conflict: true }
    : { action: "upload-local", conflict: true, replacedInvalid: false };
};

export const envelopeBytes = (envelope: SyncedUserData): number =>
  new TextEncoder().encode(JSON.stringify(envelope)).length;

export type SyncStatus =
  "idle" | "saving" | "saved" | "offline" | "error" | "too_large";

export interface SyncSnapshot {
  status: SyncStatus;
  /** With `too_large`: the part of the value that takes up the most room. */
  largestPart?: string;
  /** Which copy was used when both existed and differed. */
  used?: "instance" | "browser";
  /** True when the instance copy failed its checks and was replaced. */
  replacedInvalid?: boolean;
}

/** True when the value is only in this browser. */
export const isOnlyInBrowser = (status: SyncStatus): boolean =>
  status === "offline" || status === "error" || status === "too_large";

export interface UserDataSyncOptions<T> {
  key: ValidUserDataKey;
  /** Checks a value from the instance; undefined means it is not valid. */
  validate: (data: unknown) => T | undefined;
  /** The browser copy as it is now, already checked; undefined if none. */
  readLocal: () => T | undefined;
  /**
   * Puts a value in use and in the browser cache. Must not call `push`.
   * Undefined means the setting was cleared.
   */
  writeLocal: (value: T | undefined) => void;
  /**
   * Puts the browser cache in use again, for a tab whose memory may be older
   * than the cache. Must not call `push`.
   */
  refreshLocal?: () => void;
  equal?: (a: T, b: T) => boolean;
  maxBytes?: number;
  /** Bytes taken by each named part of a value, to say what is too large. */
  partSizes?: (value: T) => Record<string, number>;
}

export class UserDataSync<T> {
  private _snapshot: SyncSnapshot = { status: "idle" };

  private _listeners = new Set<(snapshot: SyncSnapshot) => void>();

  private _conn?: Connection;

  // How many callers asked for this connection. The sidebar and the wording
  // card share one connection, and it stops only when the last one lets go.
  private _starts = 0;

  private _unsub?: Promise<UnsubscribeFunc>;

  private _timer?: ReturnType<typeof setTimeout>;

  private _inFlight = false;

  // The newest time the instance has reported, so that a change made here is
  // always stamped after it.
  private _lastInstance = 0;

  // An instance copy that arrived while a change made here was waiting to be
  // saved. It is kept for the next merge instead of replacing that change.
  private _deferred?: { raw: unknown };

  constructor(private _options: UserDataSyncOptions<T>) {}

  public get snapshot(): SyncSnapshot {
    return this._snapshot;
  }

  public subscribe(listener: (snapshot: SyncSnapshot) => void): () => void {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * Starts loading and syncing. Safe to call again for the same connection:
   * each call is counted, and the returned function lets go of that one call.
   */
  public start(conn: Connection): () => void {
    if (this._conn === conn) {
      this._starts++;
      return this._stopper(conn);
    }
    this.stop();
    this._conn = conn;
    this._starts = 1;
    window.addEventListener("pagehide", this._flush);
    document.addEventListener("visibilitychange", this._flushWhenHidden);
    // After a reconnect the subscription delivers the instance copy again and
    // the merge decides what to do with a save that failed; nothing is sent
    // on reconnect alone.
    this._unsub = subscribeFrontendUserData(
      conn,
      this._options.key,
      ({ value }) => this._onInstance(value)
    );
    this._unsub.catch(() => this._set({ status: "offline" }));
    return this._stopper(conn);
  }

  private _stopper(conn: Connection): () => void {
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this.stop(conn);
      }
    };
  }

  public stop(conn?: Connection): void {
    if (conn && conn !== this._conn) {
      return;
    }
    if (conn && this._starts > 1) {
      this._starts--;
      return;
    }
    // A change made just before leaving is sent now, not dropped.
    this._flush();
    clearTimeout(this._timer);
    this._timer = undefined;
    window.removeEventListener("pagehide", this._flush);
    document.removeEventListener("visibilitychange", this._flushWhenHidden);
    this._unsub?.then((unsub) => unsub()).catch(() => undefined);
    this._unsub = undefined;
    this._conn = undefined;
    this._starts = 0;
    this._deferred = undefined;
  }

  /**
   * True while this page still owns the browser cache. When another tab has
   * signed in as a different account, this page stops for good: it reads
   * nothing and uploads nothing, so one account's cache never reaches another
   * account.
   */
  protected _ownerOk(): boolean {
    if (ownerStillClaimed()) {
      return true;
    }
    this._abandon();
    return false;
  }

  /** Stops without sending anything. */
  protected _abandon(): void {
    clearTimeout(this._timer);
    this._timer = undefined;
    window.removeEventListener("pagehide", this._flush);
    document.removeEventListener("visibilitychange", this._flushWhenHidden);
    this._unsub?.then((unsub) => unsub()).catch(() => undefined);
    this._unsub = undefined;
    this._conn = undefined;
    this._starts = 0;
    this._deferred = undefined;
    this._set({ status: "idle" });
  }

  /** Call after every change the person makes here (undefined = cleared). */
  public push(): void {
    if (!this._ownerOk()) {
      return;
    }
    this._writeMeta(Math.max(Date.now(), this._lastInstance + 1));
    this._schedule();
  }

  /** Tries the last failed save again. */
  public retry(): void {
    if (!this._ownerOk()) {
      return;
    }
    this._schedule(0);
  }

  /**
   * Forgets everything this browser holds for this setting: the value in use,
   * the browser cache and its age. Nothing is sent to the instance.
   */
  public resetLocal(): void {
    clearTimeout(this._timer);
    this._timer = undefined;
    this._deferred = undefined;
    this._lastInstance = 0;
    this._options.writeLocal(undefined);
    try {
      window.localStorage.removeItem(META_PREFIX + this._options.key);
    } catch (_err) {
      // Nothing was stored.
    }
    this._set({ status: "idle" });
  }

  /** True when this browser holds an age for the cached value. */
  public hasAge(): boolean {
    try {
      return (
        window.localStorage.getItem(META_PREFIX + this._options.key) !== null
      );
    } catch (_err) {
      return true;
    }
  }

  /** Puts the browser cache in use, once its owner is known. */
  public restoreLocal(): void {
    this._options.refreshLocal?.();
  }

  private _set(snapshot: SyncSnapshot) {
    this._snapshot = snapshot;
    this._listeners.forEach((listener) => listener(snapshot));
  }

  private _flush = () => {
    if (this._timer === undefined || this._inFlight || !this._conn) {
      return;
    }
    clearTimeout(this._timer);
    this._timer = undefined;
    void this._send();
  };

  /** A closing tab does not always fire pagehide, but it does become hidden. */
  private _flushWhenHidden = () => {
    if (document.visibilityState === "hidden") {
      this._flush();
    }
  };

  private _readMeta(): number | undefined {
    try {
      const raw = window.localStorage.getItem(META_PREFIX + this._options.key);
      const parsed = raw ? JSON.parse(raw) : undefined;
      return typeof parsed?.updated === "number" &&
        Number.isFinite(parsed.updated)
        ? clampStamp(parsed.updated)
        : undefined;
    } catch (_err) {
      return undefined;
    }
  }

  private _writeMeta(updated: number) {
    try {
      window.localStorage.setItem(
        META_PREFIX + this._options.key,
        JSON.stringify({ updated })
      );
    } catch (_err) {
      // The value still syncs; only the age is lost.
    }
  }

  private _local(): LocalState<T> | undefined {
    const value = this._options.readLocal();
    const updated = this._readMeta();
    if (value === undefined && updated === undefined) {
      return undefined;
    }
    return { updated: updated ?? 0, value };
  }

  private _onInstance(raw: unknown) {
    if (!this._ownerOk()) {
      return;
    }
    if (this._timer !== undefined || this._inFlight) {
      // A change made here is waiting or on its way: it is the newest. The
      // instance copy is kept for the next merge.
      this._deferred = { raw };
      return;
    }
    const instance = toInstanceState(raw, this._options.validate);
    if (instance && instance !== "invalid") {
      this._lastInstance = Math.max(this._lastInstance, instance.updated);
    }
    const local = this._local();
    const plan = planMerge(local, instance, this._options.equal);
    if (plan.action === "adopt-instance") {
      const state = instance as LocalState<T>;
      this._options.writeLocal(state.value);
      this._writeMeta(state.updated);
      this._set({
        status: "saved",
        used: plan.conflict ? "instance" : undefined,
      });
      return;
    }
    // This tab's memory may be older than the cache another tab updated.
    this._options.refreshLocal?.();
    if (plan.action === "upload-local") {
      if (local && local.updated === 0) {
        this._writeMeta(Math.max(Date.now(), this._lastInstance + 1));
      }
      this._set({
        status: this._snapshot.status === "saving" ? "saving" : "idle",
        used: plan.conflict ? "browser" : undefined,
        replacedInvalid: plan.replacedInvalid || undefined,
      });
      this._schedule(0);
      return;
    }
    if (this._snapshot.status !== "saving") {
      this._set({ status: "saved", used: this._snapshot.used });
    }
  }

  private _schedule(delay = SYNC_DEBOUNCE_MS) {
    if (!this._conn) {
      this._set({ ...this._snapshot, status: "offline" });
      return;
    }
    clearTimeout(this._timer);
    this._set({ ...this._snapshot, status: "saving", largestPart: undefined });
    this._timer = setTimeout(() => {
      this._timer = undefined;
      void this._send();
    }, delay);
  }

  private async _send() {
    if (!this._ownerOk()) {
      return;
    }
    const conn = this._conn;
    if (!conn) {
      this._set({ ...this._snapshot, status: "offline" });
      return;
    }
    if (this._inFlight) {
      this._schedule();
      return;
    }
    const value = this._options.readLocal();
    const updated = this._readMeta() ?? Date.now();
    const envelope: SyncedUserData = {
      version: 1,
      updated,
      data: value === undefined ? null : value,
    };
    if (envelopeBytes(envelope) > (this._options.maxBytes ?? SYNC_MAX_BYTES)) {
      this._set({
        ...this._snapshot,
        status: "too_large",
        largestPart: this._largestPart(value),
      });
      return;
    }
    this._inFlight = true;
    try {
      await saveFrontendUserData(conn, this._options.key, envelope);
      this._inFlight = false;
      this._set({
        status: this._timer !== undefined ? "saving" : "saved",
        used: this._snapshot.used,
        replacedInvalid: this._snapshot.replacedInvalid,
      });
      this._replayDeferred(updated);
    } catch (_err) {
      // Never keep the error: its text could repeat the value.
      this._inFlight = false;
      this._set({ ...this._snapshot, status: "error", largestPart: undefined });
    }
  }

  /** Merges an instance copy that arrived during a save, if it is newer. */
  private _replayDeferred(sentUpdated: number) {
    if (!this._deferred || this._timer !== undefined) {
      return;
    }
    const { raw } = this._deferred;
    this._deferred = undefined;
    const state = toInstanceState(raw, this._options.validate);
    if (state && state !== "invalid" && state.updated > sentUpdated) {
      this._onInstance(raw);
    }
  }

  private _largestPart(value: T | undefined): string | undefined {
    if (value === undefined || !this._options.partSizes) {
      return undefined;
    }
    const sizes = Object.entries(this._options.partSizes(value));
    sizes.sort((a, b) => b[1] - a[1]);
    return sizes[0]?.[0];
  }
}
