import { getStorage } from "../decorators/storage";
import { canonicalJson, UserDataSync } from "../instance-sync/user-data-sync";
import type { AccessibilitySettings } from "../accessibility/accessibility-tools";
import {
  ACCESSIBILITY_STORAGE_KEY,
  normalizeAccessibilitySettings,
} from "../accessibility/accessibility-tools";
import { reloadAppearance } from "./appearance-session";
import type { AppearanceStore } from "./element-appearance";
import {
  APPEARANCE_STORAGE_KEY,
  isEmptyStore,
  normalizeStore,
  subscribeAppearanceChanges,
} from "./element-appearance";
import type { ReadingOptions } from "./reading-options";
import {
  normalizeReadingOptions,
  READING_STORAGE_KEY,
} from "./reading-options";

/**
 * The appearance choices, saved on this instance for the signed-in person
 * under the user-data key `appearance`: the per-element choices, the reading
 * options (fonts, spacing) and the accessibility tools. One value, one
 * `updated` time, so the three stay together.
 *
 * Uploaded fonts do not exist in this product: fonts are picked from a fixed
 * list, so nothing here is a file. A picture layer's address is limited to
 * 2,000 characters, but many layers on many elements can still add up to more
 * than the size limit. A bundle that is too large stays in this browser, and
 * the status says which part takes the most room.
 */

export const APPEARANCE_SYNC_KEY = "appearance" as const;

export interface AppearanceBundle {
  elementAppearance?: AppearanceStore;
  readingOptions?: ReadingOptions;
  accessibilityTools?: AccessibilitySettings;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

/** Checks stored data part by part; undefined if it holds nothing usable. */
export const validateAppearanceData = (
  data: unknown
): AppearanceBundle | undefined => {
  if (!isObject(data)) {
    return undefined;
  }
  const bundle: AppearanceBundle = {};
  if (isObject(data.elementAppearance)) {
    const store = normalizeStore(data.elementAppearance);
    if (!isEmptyStore(store)) {
      bundle.elementAppearance = store;
    }
  }
  if (isObject(data.readingOptions)) {
    bundle.readingOptions = normalizeReadingOptions(
      data.readingOptions as Partial<ReadingOptions>
    );
  }
  if (isObject(data.accessibilityTools)) {
    bundle.accessibilityTools = normalizeAccessibilitySettings(
      data.accessibilityTools as Partial<AccessibilitySettings>
    );
  }
  return Object.keys(bundle).length ? bundle : undefined;
};

const readLocal = (): AppearanceBundle | undefined => {
  const raw: Record<string, unknown> = {};
  try {
    const element = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (element) {
      raw.elementAppearance = JSON.parse(element);
    }
    raw.readingOptions = getStorage().getValue(READING_STORAGE_KEY);
    raw.accessibilityTools = getStorage().getValue(ACCESSIBILITY_STORAGE_KEY);
  } catch (_err) {
    return undefined;
  }
  return validateAppearanceData(raw);
};

const canonical = (bundle: AppearanceBundle | undefined): string =>
  bundle === undefined ? "" : canonicalJson(bundle);

// True while a copy from the instance is being put in use, so that applying
// it is not mistaken for a change made here.
let applying = false;

// What this tab last wrote, adopted or copied from the browser cache. A change
// notice for a value equal to it is not a change made here.
let lastSeen = canonical(readLocal());

const writeLocal = (bundle: AppearanceBundle | undefined) => {
  applying = true;
  try {
    try {
      if (bundle?.elementAppearance) {
        window.localStorage.setItem(
          APPEARANCE_STORAGE_KEY,
          JSON.stringify(bundle.elementAppearance)
        );
      } else {
        window.localStorage.removeItem(APPEARANCE_STORAGE_KEY);
      }
    } catch (_err) {
      // Without storage the choices still apply until the page is closed.
    }
    reloadAppearance();
    getStorage().setValue(READING_STORAGE_KEY, bundle?.readingOptions);
    getStorage().setValue(
      ACCESSIBILITY_STORAGE_KEY,
      bundle?.accessibilityTools
    );
  } finally {
    applying = false;
  }
  lastSeen = canonical(readLocal());
};

// Another tab may have changed the cache: show what it holds here too.
const refreshLocal = () => {
  applying = true;
  try {
    reloadAppearance();
  } finally {
    applying = false;
  }
  lastSeen = canonical(readLocal());
};

const bytesOf = (value: unknown): number =>
  value === undefined
    ? 0
    : new TextEncoder().encode(JSON.stringify(value)).length;

export const appearanceSync = new UserDataSync<AppearanceBundle>({
  key: APPEARANCE_SYNC_KEY,
  validate: validateAppearanceData,
  readLocal,
  writeLocal,
  refreshLocal,
  // Says which part is too large when the whole bundle does not fit.
  partSizes: (bundle) => ({
    elementAppearance: bytesOf(bundle.elementAppearance),
    readingOptions: bytesOf(bundle.readingOptions),
    accessibilityTools: bytesOf(bundle.accessibilityTools),
  }),
});

// True while another tab's change to the cache is being delivered here.
let fromOtherTab = false;

const pushLocal = () => {
  if (applying || fromOtherTab) {
    return;
  }
  const now = canonical(readLocal());
  if (now === lastSeen) {
    return;
  }
  lastSeen = now;
  appearanceSync.push();
};

if (typeof window !== "undefined") {
  const synced = new Set([
    APPEARANCE_STORAGE_KEY,
    READING_STORAGE_KEY,
    ACCESSIBILITY_STORAGE_KEY,
  ]);
  // Capture phase, so this runs before the listeners that react to the event:
  // a value copied from another tab must not be pushed with a fresh age.
  window.addEventListener(
    "storage",
    (ev: StorageEvent) => {
      if (!ev.key || !synced.has(ev.key)) {
        return;
      }
      fromOtherTab = true;
      window.setTimeout(() => {
        fromOtherTab = false;
        lastSeen = canonical(readLocal());
      }, 0);
    },
    true
  );
}

// A change made on this device in any of the three stores goes to the instance.
subscribeAppearanceChanges(pushLocal);
getStorage().subscribeChanges(READING_STORAGE_KEY, pushLocal);
getStorage().subscribeChanges(ACCESSIBILITY_STORAGE_KEY, pushLocal);
