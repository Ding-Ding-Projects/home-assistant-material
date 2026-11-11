import type { Connection } from "home-assistant-js-websocket";
import { markFirstInstanceMerge } from "./first-merge";
import { ownerStillClaimed } from "./sync-owner";
import { clampStamp, SYNC_MAX_BYTES, UserDataSync } from "./user-data-sync";
import { SETTING_VALUE_MAX_CHARS, syncedRuleFor } from "./settings-registry";

/**
 * Every browser-storage key that is a person's own setting or saved content
 * (see `settings-registry.ts`), saved on this instance for the signed-in
 * account under the user-data key `settings_bundle`, and loaded again on
 * every device.
 *
 * The value is one entry per key: the stored text exactly as the browser
 * holds it, and the time it last changed here. A key the person removed stays
 * as an entry without text (a removal notice) for 30 days, so the removal
 * reaches other devices instead of the old value coming back. Merging is
 * per key and the newer time wins; a tie goes to the instance, as for every
 * synced value. The browser copy stays a fast cache that features read as
 * before.
 *
 * Safety:
 * - Only keys a rule in the registry names ever leave or enter the browser.
 *   Sign-in tokens and the sync's own bookkeeping are on the exclusion list.
 * - A value from the instance is input: its shape, size and (for JSON keys)
 *   syntax are checked, and a key that is not in the registry is ignored,
 *   including names such as `__proto__`.
 * - Values are never logged and a failed save is reported by status only.
 * - If the bundle would be too large, the largest optional keys stay only in
 *   this browser and the page says which, instead of the whole save failing.
 */

export const SETTINGS_SYNC_KEY = "settings_bundle" as const;

/** Browser key holding the time and fingerprint of each mirrored key. */
export const SETTINGS_TIMES_KEY = "instanceSync.settingsTimes";

/** How long a removal notice is kept, in milliseconds. */
export const REMOVAL_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;

/** Room kept for the envelope around the bundle, in bytes. */
const ENVELOPE_MARGIN = 512;

/** How often a change that bypassed every event is looked for. */
export const SETTINGS_WATCH_MS = 2000;

export interface BundleEntry {
  /** The stored text, or null once the key was removed. */
  v: string | null;
  /** Epoch milliseconds of the last change. */
  t: number;
}

export type SettingsBundle = Record<string, BundleEntry>;

interface KeyRecord {
  t: number;
  /** Fingerprint of the stored text when the time was set. */
  h: string;
  gone?: boolean;
}

type TimesMap = Record<string, KeyRecord>;

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const hashText = (text: string | null): string => {
  if (text === null) {
    return "";
  }
  // A small polynomial fingerprint, enough to notice that text changed.
  let hash = 7;
  for (let i = 0; i < text.length; i++) {
    hash = (hash * 31 + text.charCodeAt(i)) % 4294967291;
  }
  return `${text.length}:${hash.toString(16)}`;
};

const isJson = (text: string): boolean => {
  try {
    JSON.parse(text);
    return true;
  } catch (_err) {
    return false;
  }
};

const getItem = (key: string): string | null => {
  try {
    return window.localStorage.getItem(key);
  } catch (_err) {
    return null;
  }
};

const listSyncedKeys = (): string[] => {
  const keys: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && syncedRuleFor(key)) {
        keys.push(key);
      }
    }
  } catch (_err) {
    // No storage: nothing to mirror.
  }
  return keys;
};

const readTimes = (): TimesMap => {
  const times: TimesMap = {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_TIMES_KEY);
    const parsed = raw ? JSON.parse(raw) : undefined;
    if (isObject(parsed)) {
      for (const key of Object.keys(parsed)) {
        const record = parsed[key];
        if (
          syncedRuleFor(key) &&
          isObject(record) &&
          typeof record.t === "number" &&
          Number.isFinite(record.t) &&
          typeof record.h === "string"
        ) {
          times[key] = {
            t: clampStamp(record.t),
            h: record.h,
            ...(record.gone === true ? { gone: true } : {}),
          };
        }
      }
    }
  } catch (_err) {
    // Treated as no ages: every value counts as older than the instance's.
  }
  return times;
};

const writeTimes = (times: TimesMap): void => {
  try {
    window.localStorage.setItem(SETTINGS_TIMES_KEY, JSON.stringify(times));
  } catch (_err) {
    // The values still sync; only their ages are lost.
  }
};

const pruneTimes = (times: TimesMap, now = Date.now()): void => {
  for (const key of Object.keys(times)) {
    if (times[key].gone && now - times[key].t > REMOVAL_NOTICE_MS) {
      delete times[key];
    }
  }
};

// What this tab last saw for each mirrored key, so that a value put in place
// from the instance, or by another tab, is never taken for a change made here.
const seen = new Map<string, string | null>();

const announceKey = (
  key: string,
  oldValue: string | null,
  newValue: string | null
): void => {
  seen.set(key, newValue);
  try {
    // The storage decorator and the features that listen for other tabs
    // react to this event, so what arrives is shown without a reload.
    window.dispatchEvent(
      new StorageEvent("storage", {
        key,
        oldValue,
        newValue,
        storageArea: window.localStorage,
        url: window.location.href,
      })
    );
  } catch (_err) {
    // The value is stored; a feature reads it the next time it needs it.
  }
};

const putKey = (key: string, text: string | null): boolean => {
  const old = getItem(key);
  try {
    if (text === null) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, text);
    }
  } catch (_err) {
    return false;
  }
  announceKey(key, old, text);
  return true;
};

/** Checks what the instance holds; only registered, well-formed keys stay. */
export const validateSettingsData = (
  data: unknown
): SettingsBundle | undefined => {
  if (!isObject(data)) {
    return undefined;
  }
  const bundle: SettingsBundle = {};
  for (const key of Object.keys(data)) {
    const rule = syncedRuleFor(key);
    const entry = data[key];
    if (!rule || !isObject(entry)) {
      continue;
    }
    const { v, t } = entry;
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) {
      continue;
    }
    if (v !== null) {
      if (
        typeof v !== "string" ||
        v.length > SETTING_VALUE_MAX_CHARS ||
        (rule.kind === "json" && !isJson(v))
      ) {
        continue;
      }
    }
    bundle[key] = { v: v as string | null, t: clampStamp(t) };
  }
  return bundle;
};

// Keys that stay only in this browser because the bundle was too large.
let dropped: string[] = [];
const droppedListeners = new Set<(keys: string[]) => void>();

export const getDroppedSettingKeys = (): string[] => dropped;

export const subscribeDroppedSettingKeys = (
  listener: (keys: string[]) => void
): (() => void) => {
  droppedListeners.add(listener);
  return () => droppedListeners.delete(listener);
};

const setDropped = (keys: string[]): void => {
  const next = [...keys].sort();
  if (next.join("\n") === dropped.join("\n")) {
    return;
  }
  dropped = next;
  droppedListeners.forEach((listener) => listener(dropped));
};

const entryBytes = (key: string, entry: BundleEntry): number =>
  new TextEncoder().encode(JSON.stringify([key, entry])).length + 1;

/**
 * Fits a bundle in the size limit by leaving out the largest keys, bulky
 * ones (the journal, the console history, the logo) first. Returns the keys
 * left out.
 */
export const fitSettingsBundle = (
  bundle: SettingsBundle,
  maxBytes = SYNC_MAX_BYTES
): { bundle: SettingsBundle; dropped: string[] } => {
  const sizes = new Map<string, number>();
  let total = ENVELOPE_MARGIN;
  for (const key of Object.keys(bundle)) {
    const size = entryBytes(key, bundle[key]);
    sizes.set(key, size);
    total += size;
  }
  if (total <= maxBytes) {
    return { bundle, dropped: [] };
  }
  // Removal notices are tiny and carry deletions, so they are never dropped.
  const candidates = Object.keys(bundle)
    .filter((key) => bundle[key].v !== null)
    .sort((a, b) => {
      const bulkyA = syncedRuleFor(a)?.bulky ? 1 : 0;
      const bulkyB = syncedRuleFor(b)?.bulky ? 1 : 0;
      return (
        bulkyB - bulkyA || sizes.get(b)! - sizes.get(a)! || (a < b ? -1 : 1)
      );
    });
  const kept = { ...bundle };
  const left: string[] = [];
  for (const key of candidates) {
    if (total <= maxBytes) {
      break;
    }
    total -= sizes.get(key)!;
    delete kept[key];
    left.push(key);
  }
  return { bundle: kept, dropped: left };
};

/** The mirrored keys as this browser holds them now, with their ages. */
const readLocalBundle = (): SettingsBundle | undefined => {
  const times = readTimes();
  const bundle: SettingsBundle = {};
  const tooLong: string[] = [];
  for (const key of listSyncedKeys()) {
    const raw = getItem(key);
    const rule = syncedRuleFor(key);
    if (raw === null || !rule) {
      continue;
    }
    if (
      raw.length > SETTING_VALUE_MAX_CHARS ||
      (rule.kind === "json" && !isJson(raw))
    ) {
      if (raw.length > SETTING_VALUE_MAX_CHARS) {
        tooLong.push(key);
      }
      continue;
    }
    const record = times[key];
    // A value changed while nothing was watching has an unknown time: it
    // counts as older than anything the instance holds.
    const t = record && record.h === hashText(raw) ? record.t : 0;
    bundle[key] = { v: raw, t };
  }
  for (const key of Object.keys(times)) {
    if (times[key].gone && !(key in bundle) && getItem(key) === null) {
      bundle[key] = { v: null, t: times[key].t };
    }
  }
  const fitted = fitSettingsBundle(bundle);
  setDropped([...tooLong, ...fitted.dropped]);
  return Object.keys(fitted.bundle).length ? fitted.bundle : undefined;
};

/**
 * Puts what the instance holds in use, key by key, and says whether this
 * browser holds something newer that still has to go up.
 */
export const mergeInstanceSettings = (
  instance: SettingsBundle
): { applied: string[]; needsUpload: boolean } => {
  if (!ownerStillClaimed()) {
    // Another account owns the cache now; nothing is written or sent.
    return { applied: [], needsUpload: false };
  }
  const times = readTimes();
  pruneTimes(times);
  const applied: string[] = [];
  const failed = new Set<string>();
  let needsUpload = false;
  let timesChanged = false;
  for (const key of Object.keys(instance)) {
    const entry = instance[key];
    const local = getItem(key);
    const record = times[key];
    const localTime = record && record.h === hashText(local) ? record.t : 0;
    if (entry.v === local) {
      if (!record || record.t < entry.t || record.h !== hashText(local)) {
        times[key] = {
          t: Math.max(entry.t, record?.h === hashText(local) ? record.t : 0),
          h: hashText(local),
          ...(local === null ? { gone: true } : {}),
        };
        timesChanged = true;
      }
      seen.set(key, local);
      continue;
    }
    if (entry.t >= localTime) {
      if (putKey(key, entry.v)) {
        times[key] = {
          t: entry.t,
          h: hashText(entry.v),
          ...(entry.v === null ? { gone: true } : {}),
        };
        timesChanged = true;
        applied.push(key);
      } else {
        failed.add(key);
      }
    }
  }
  if (timesChanged) {
    writeTimes(times);
  }
  // Something has to go up only if what this browser would really send
  // differs from the instance copy. A key that can never be sent (not valid
  // JSON, too long, left out for size) is not counted, or two tabs would
  // upload to each other for ever.
  const mine = readLocalBundle() ?? {};
  for (const key of Object.keys(mine)) {
    if (failed.has(key)) {
      continue;
    }
    const entry = instance[key];
    if (!entry || entry.v !== mine[key].v) {
      needsUpload = true;
      break;
    }
  }
  return { applied, needsUpload };
};

/**
 * Notes every mirrored key that differs from what this tab last saw and
 * gives it a new time. Returns true when something changed.
 */
export const recordLocalChanges = (
  now = Date.now(),
  initial = false
): boolean => {
  const times = readTimes();
  pruneTimes(times, now);
  let changed = false;
  const present = new Set<string>();
  for (const key of listSyncedKeys()) {
    const raw = getItem(key);
    present.add(key);
    if (!seen.has(key)) {
      seen.set(key, raw);
      const record = times[key];
      if (initial) {
        // The starting point. A value that differs from the fingerprint kept
        // with its time was changed while nothing was watching.
        if (record && record.h !== hashText(raw)) {
          times[key] = { t: Math.max(now, record.t + 1), h: hashText(raw) };
          changed = true;
        }
      } else {
        // A key that appeared after the start was made here.
        times[key] = {
          t: Math.max(now, (record?.t ?? 0) + 1),
          h: hashText(raw),
        };
        changed = true;
      }
      continue;
    }
    if (seen.get(key) !== raw) {
      seen.set(key, raw);
      times[key] = {
        t: Math.max(now, (times[key]?.t ?? 0) + 1),
        h: hashText(raw),
      };
      changed = true;
    }
  }
  for (const key of Array.from(seen.keys())) {
    if (!present.has(key) && seen.get(key) !== null) {
      seen.set(key, null);
      times[key] = {
        t: Math.max(now, (times[key]?.t ?? 0) + 1),
        h: "",
        gone: true,
      };
      changed = true;
    }
  }
  for (const key of Object.keys(times)) {
    if (!present.has(key) && !times[key].gone) {
      // Removed while nothing was watching.
      times[key] = { t: now, h: "", gone: true };
      changed = true;
    }
  }
  if (changed) {
    writeTimes(times);
  }
  return changed;
};

/** Forgets every mirrored key and its age in this browser. Nothing is sent. */
export const clearMirroredSettings = (): void => {
  for (const key of listSyncedKeys()) {
    putKey(key, null);
  }
  try {
    window.localStorage.removeItem(SETTINGS_TIMES_KEY);
  } catch (_err) {
    // Nothing was stored.
  }
  seen.clear();
  setDropped([]);
};

/** For tests: forgets what this tab last saw and which keys were left out. */
export const forgetSettingsWatch = (): void => {
  seen.clear();
  setDropped([]);
};

export class SettingsBundleSync extends UserDataSync<SettingsBundle> {
  private _watchStarts = 0;

  private _interval?: ReturnType<typeof setInterval>;

  public override start(conn: Connection): () => void {
    const stopBase = super.start(conn);
    this._watchStart();
    let released = false;
    return () => {
      if (!released) {
        released = true;
        this._watchStop();
        stopBase();
      }
    };
  }

  public override resetLocal(): void {
    clearMirroredSettings();
    super.resetLocal();
  }

  public override hasAge(): boolean {
    try {
      return (
        super.hasAge() ||
        window.localStorage.getItem(SETTINGS_TIMES_KEY) !== null
      );
    } catch (_err) {
      return true;
    }
  }

  /** Looks for a change right now and sends it if there is one. */
  public checkNow = (): void => {
    if (!ownerStillClaimed()) {
      // Another account signed in on this browser: stop, send nothing.
      this._watchHalt();
      this.push();
      return;
    }
    if (recordLocalChanges()) {
      this.push();
    }
  };

  private _onStorage = (ev: StorageEvent) => {
    if (ev.key && syncedRuleFor(ev.key)) {
      // Another tab (or a value from the instance) wrote it. The tab that
      // made the change sends it.
      seen.set(ev.key, getItem(ev.key));
    }
  };

  private _onVisibility = () => {
    if (document.hidden) {
      this.checkNow();
    }
  };

  private _watchStart() {
    this._watchStarts++;
    if (this._watchStarts > 1) {
      return;
    }
    // The starting point: what is stored now is not a change.
    recordLocalChanges(Date.now(), true);
    window.addEventListener("storage", this._onStorage);
    window.addEventListener("pagehide", this.checkNow);
    document.addEventListener("visibilitychange", this._onVisibility);
    // Some writers (direct property assignment) raise no event at all.
    this._interval = setInterval(() => {
      if (!document.hidden) {
        this.checkNow();
      }
    }, SETTINGS_WATCH_MS);
  }

  private _watchHalt() {
    window.removeEventListener("storage", this._onStorage);
    window.removeEventListener("pagehide", this.checkNow);
    document.removeEventListener("visibilitychange", this._onVisibility);
    clearInterval(this._interval);
    this._interval = undefined;
  }

  private _watchStop() {
    this._watchStarts = Math.max(0, this._watchStarts - 1);
    if (this._watchStarts > 0) {
      return;
    }
    this.checkNow();
    window.removeEventListener("storage", this._onStorage);
    window.removeEventListener("pagehide", this.checkNow);
    document.removeEventListener("visibilitychange", this._onVisibility);
    clearInterval(this._interval);
    this._interval = undefined;
  }
}

export const settingsBundleSync: SettingsBundleSync = new SettingsBundleSync({
  key: SETTINGS_SYNC_KEY,
  // Putting the instance copy in use happens here, key by key, because the
  // plain "newer copy wins" rule would drop a key only one side holds. What
  // is newer here is sent right after.
  validate: (data) => {
    const bundle = validateSettingsData(data);
    if (bundle) {
      const { needsUpload } = mergeInstanceSettings(bundle);
      if (needsUpload) {
        setTimeout(() => settingsBundleSync.push(), 0);
      }
    }
    markFirstInstanceMerge();
    return bundle;
  },
  readLocal: readLocalBundle,
  // Already done in `validate`.
  writeLocal: () => undefined,
  // The merge above decides per key; the whole-value comparison never has to.
  equal: () => true,
});
