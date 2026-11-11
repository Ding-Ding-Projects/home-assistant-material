import type { Connection, UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  saveFrontendSystemData,
  subscribeFrontendSystemData,
} from "../../data/frontend";
import { safeGetStored, safeSetStored } from "./safe-storage";
import type { LanguageMode, PersonalPreferences } from "./personal-preferences";

/**
 * Defaults an administrator sets for everyone on this instance.
 *
 * They are only defaults: a choice a person made in this browser always wins,
 * and a person can go back to the shared default with one reset. Every value
 * that arrives is validated field by field before it is used or kept, and the
 * last good answer is cached in this browser so it applies before the
 * connection is up.
 */
export const SHARED_PREFERENCE_DEFAULTS_KEY = "preferenceDefaults";
const CACHE_KEY = "sharedPreferenceDefaultsCache";

declare global {
  interface FrontendSystemData {
    preferenceDefaults: SharedPreferenceDefaults;
  }
}

/** The preferences that make sense to share as a default for everyone. */
export const SHARED_DEFAULT_FIELDS = [
  "languageMode",
  "funnyEnglish",
  "funnyCantonese",
  "dialogEmojis",
  "soundEffects",
  "soundVolume",
  "lowStimulation",
  "oneThingAtATime",
  "timeAwareness",
  "momentum",
] as const satisfies readonly (keyof PersonalPreferences)[];

export type SharedDefaultField = (typeof SHARED_DEFAULT_FIELDS)[number];

export type SharedPreferenceDefaults = Partial<
  Pick<PersonalPreferences, SharedDefaultField>
>;

const MODES: readonly LanguageMode[] = ["english", "cantonese", "bilingual"];

const isLevel = (value: unknown, min: number, max: number): boolean =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= min &&
  value <= max;

const VALID: Record<SharedDefaultField, (value: unknown) => boolean> = {
  languageMode: (value) => MODES.includes(value as LanguageMode),
  funnyEnglish: (value) => isLevel(value, 1, 5),
  funnyCantonese: (value) => isLevel(value, 1, 5),
  dialogEmojis: (value) => typeof value === "boolean",
  soundEffects: (value) => typeof value === "boolean",
  soundVolume: (value) => isLevel(value, 0, 100),
  lowStimulation: (value) => typeof value === "boolean",
  oneThingAtATime: (value) => typeof value === "boolean",
  timeAwareness: (value) => typeof value === "boolean",
  momentum: (value) => typeof value === "boolean",
};

/** Keeps only known fields with valid values; anything else is dropped. */
export const sanitizeSharedDefaults = (
  raw: unknown
): SharedPreferenceDefaults => {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const source = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const field of SHARED_DEFAULT_FIELDS) {
    if (field in source && VALID[field](source[field])) {
      out[field] = source[field];
    }
  }
  return out as SharedPreferenceDefaults;
};

let shared: SharedPreferenceDefaults = sanitizeSharedDefaults(
  safeGetStored<unknown>(CACHE_KEY)
);

const listeners = new Set<() => void>();

/** The defaults the instance supplies, if any. */
export const getSharedDefaults = (): SharedPreferenceDefaults => shared;

/** Takes a value read from the instance, validates it, caches it, tells listeners. */
export const setSharedDefaults = (value: unknown): void => {
  const next = sanitizeSharedDefaults(value);
  if (JSON.stringify(next) === JSON.stringify(shared)) {
    return;
  }
  shared = next;
  safeSetStored(CACHE_KEY, next);
  listeners.forEach((listener) => listener());
};

/** Calls back when the shared defaults change. */
export const onSharedDefaultsChanged = (
  callback: () => void
): UnsubscribeFunc => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};

/** Starts reading the defaults the instance supplies. */
export const subscribeSharedPreferenceDefaults = (conn: Connection) =>
  subscribeFrontendSystemData(
    conn,
    SHARED_PREFERENCE_DEFAULTS_KEY,
    ({ value }) => {
      setSharedDefaults(value);
    }
  );

/** Stores defaults for everyone. Administrators only. */
export const applyPreferenceDefaultsForEveryone = (
  conn: Connection,
  defaults: SharedPreferenceDefaults
): Promise<void> =>
  saveFrontendSystemData(
    conn,
    SHARED_PREFERENCE_DEFAULTS_KEY,
    sanitizeSharedDefaults(defaults)
  );

/** Clears the defaults stored for everyone. Administrators only. */
export const removePreferenceDefaultsForEveryone = (
  conn: Connection
): Promise<void> =>
  saveFrontendSystemData(conn, SHARED_PREFERENCE_DEFAULTS_KEY, {});
