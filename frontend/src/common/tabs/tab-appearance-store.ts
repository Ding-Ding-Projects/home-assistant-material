import { getStorage } from "../decorators/storage";
import {
  cleanSurface,
  isSafeKey,
  safeEntries,
  surfaceEntries,
  LIST_LIMIT,
} from "./tab-validate";

/**
 * How individual tabs look. A tab keeps its look when it moves because the
 * look is stored under the tab's stable id, never under a position or a
 * page element path.
 */

export const TAB_APPEARANCE_STORAGE_KEY = "pageTabsAppearance";

export const TAB_APPEARANCE_PROPERTIES = [
  "color",
  "background",
  "borderColor",
  "icon",
  "label",
  "fontWeight",
  "fontStyle",
  "radius",
  "density",
] as const;

export type TabAppearanceProperty = (typeof TAB_APPEARANCE_PROPERTIES)[number];

export type TabAppearance = Partial<Record<TabAppearanceProperty, string>>;

/** Stored shape: strip name, then tab id, then its changed properties. */
export type TabAppearanceStore = Record<string, Record<string, TabAppearance>>;

export const APPEARANCE_VALUE_LIMIT = 200;

/** Letters, digits and the characters of colours, lengths and icon names. */
const VALUE = /^[\p{L}\p{N} #%.,()/+:_-]*$/u;

export const isTabAppearanceProperty = (
  value: unknown
): value is TabAppearanceProperty =>
  typeof value === "string" &&
  (TAB_APPEARANCE_PROPERTIES as readonly string[]).includes(value);

/** A usable value, or undefined. Anything that could break out of a style is refused. */
export const cleanAppearanceValue = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }
  const text = raw.trim();
  return text && text.length <= APPEARANCE_VALUE_LIMIT && VALUE.test(text)
    ? text
    : undefined;
};

export const normalizeTabAppearance = (raw: unknown): TabAppearance => {
  const result: TabAppearance = {};
  safeEntries(raw).forEach(([key, value]) => {
    const clean = cleanAppearanceValue(value);
    if (isTabAppearanceProperty(key) && clean !== undefined) {
      result[key] = clean;
    }
  });
  return result;
};

export const normalizeTabAppearanceStore = (
  raw: unknown
): TabAppearanceStore => {
  const store: TabAppearanceStore = {};
  surfaceEntries(raw).forEach(([surface, tabs]) => {
    const entries: Record<string, TabAppearance> = {};
    safeEntries(tabs)
      .slice(0, LIST_LIMIT)
      .forEach(([id, value]) => {
        const look = normalizeTabAppearance(value);
        if (Object.keys(look).length) {
          entries[id] = look;
        }
      });
    if (Object.keys(entries).length) {
      store[surface] = entries;
    }
  });
  return store;
};

export const appearanceFor = (
  store: TabAppearanceStore,
  surface: string | undefined,
  tabId: string
): TabAppearance => store[cleanSurface(surface)]?.[tabId] ?? {};

const tidy = (store: TabAppearanceStore): TabAppearanceStore =>
  normalizeTabAppearanceStore(store);

/** Sets one property of one tab. An unusable value changes nothing. */
export const setTabAppearance = (
  store: TabAppearanceStore,
  surface: string | undefined,
  tabId: string,
  property: TabAppearanceProperty,
  value: string
): TabAppearanceStore => {
  const clean = cleanAppearanceValue(value);
  if (!isSafeKey(tabId) || !isTabAppearanceProperty(property) || !clean) {
    return store;
  }
  const key = cleanSurface(surface);
  return tidy({
    ...store,
    [key]: {
      ...store[key],
      [tabId]: { ...store[key]?.[tabId], [property]: clean },
    },
  });
};

/** Puts one property of one tab back to its default. */
export const resetTabProperty = (
  store: TabAppearanceStore,
  surface: string | undefined,
  tabId: string,
  property: TabAppearanceProperty
): TabAppearanceStore => {
  const key = cleanSurface(surface);
  const look = { ...store[key]?.[tabId] };
  delete look[property];
  return tidy({ ...store, [key]: { ...store[key], [tabId]: look } });
};

/** Puts every property of one tab back to the default. */
export const resetTab = (
  store: TabAppearanceStore,
  surface: string | undefined,
  tabId: string
): TabAppearanceStore => {
  const key = cleanSurface(surface);
  const tabs = { ...store[key] };
  delete tabs[tabId];
  return tidy({ ...store, [key]: tabs });
};

/** Resets every tab of one strip, or of all strips when no strip is given. */
export const resetAllTabs = (
  store: TabAppearanceStore,
  surface?: string
): TabAppearanceStore => {
  if (surface === undefined) {
    return {};
  }
  const next = { ...store };
  delete next[cleanSurface(surface)];
  return tidy(next);
};

/** Ids of tabs that have a changed look. */
export const customisedTabs = (
  store: TabAppearanceStore,
  surface?: string
): string[] => Object.keys(store[cleanSurface(surface)] ?? {});

export const readTabAppearance = (): TabAppearanceStore =>
  normalizeTabAppearanceStore(
    getStorage().getValue(TAB_APPEARANCE_STORAGE_KEY)
  );

export const writeTabAppearance = (store: TabAppearanceStore): void => {
  const clean = normalizeTabAppearanceStore(store);
  getStorage().setValue(
    TAB_APPEARANCE_STORAGE_KEY,
    Object.keys(clean).length ? clean : undefined
  );
};
