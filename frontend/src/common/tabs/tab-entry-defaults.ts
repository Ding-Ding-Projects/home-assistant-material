import { getStorage } from "../decorators/storage";
import { cleanDestinationPath, isRouteUnder } from "./tab-destinations";

/**
 * Defaults for the entries of the navigation: whether Developer tools shows
 * (it does unless the person turns it off here) and the page an entry opens
 * on when it has sub-pages. They are stored for the person and saved on the
 * instance with their other settings.
 *
 * The labels of entries are not here: a renamed entry keeps its name in the
 * tab appearance store (`tab-appearance-store.ts`), next to the other
 * per-person tab choices.
 */

export const SIDEBAR_DEFAULTS_STORAGE_KEY = "sidebarDefaults";

/** An entry that has sub-pages, with the address of the entry itself. */
export const DEFAULT_PAGE_ENTRIES = {
  config: "/config",
  tools: "/config/tools",
} as const;

export type DefaultPageEntry = keyof typeof DEFAULT_PAGE_ENTRIES;

export const isDefaultPageEntry = (value: unknown): value is DefaultPageEntry =>
  typeof value === "string" &&
  Object.prototype.hasOwnProperty.call(DEFAULT_PAGE_ENTRIES, value);

export interface SidebarDefaults {
  /** Developer tools in the navigation. Shown unless this is false. */
  showDeveloperTools: boolean;
  /** The page each entry opens on, as a path under the entry. */
  defaultPages: Partial<Record<DefaultPageEntry, string>>;
}

export const DEFAULT_SIDEBAR_DEFAULTS: SidebarDefaults = {
  showDeveloperTools: true,
  defaultPages: {},
};

const PATH_LIMIT = 200;
const PATH_CHARS = /^[A-Za-z0-9_\-./]+$/;

/** A stored page for an entry, or undefined when it is not a page under it. */
export const cleanDefaultPage = (
  entry: DefaultPageEntry,
  raw: unknown
): string | undefined => {
  if (typeof raw !== "string" || raw.length > PATH_LIMIT) {
    return undefined;
  }
  const clean = cleanDestinationPath(raw);
  const path = `/${clean}`;
  if (!clean || !PATH_CHARS.test(clean) || clean.includes("..")) {
    return undefined;
  }
  const base = DEFAULT_PAGE_ENTRIES[entry];
  return path !== base && isRouteUnder(path, base) ? path : undefined;
};

export const normalizeSidebarDefaults = (raw: unknown): SidebarDefaults => {
  const result: SidebarDefaults = {
    showDeveloperTools: true,
    defaultPages: {},
  };
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }
  const { showDeveloperTools, defaultPages } = raw as Record<string, unknown>;
  if (showDeveloperTools === false) {
    result.showDeveloperTools = false;
  }
  if (
    defaultPages &&
    typeof defaultPages === "object" &&
    !Array.isArray(defaultPages)
  ) {
    (Object.keys(DEFAULT_PAGE_ENTRIES) as DefaultPageEntry[]).forEach(
      (entry) => {
        const page = cleanDefaultPage(
          entry,
          (defaultPages as Record<string, unknown>)[entry]
        );
        if (page) {
          result.defaultPages[entry] = page;
        }
      }
    );
  }
  return result;
};

export const isDefaultSidebarDefaults = (value: SidebarDefaults): boolean =>
  value.showDeveloperTools && Object.keys(value.defaultPages).length === 0;

/**
 * Where an entry opens. The entry's own address, unless a default page is
 * chosen and the person is not already inside the entry, so a page they are
 * on is never replaced by the default.
 */
export const resolveEntryRoute = (
  entry: DefaultPageEntry,
  currentPath: string,
  defaults: SidebarDefaults
): string => {
  const base = DEFAULT_PAGE_ENTRIES[entry];
  const page = defaults.defaultPages[entry];
  if (!page || isRouteUnder(currentPath, base)) {
    return base;
  }
  return page;
};

/** The entry a path belongs to, for links built from a plain address. */
export const entryForPath = (path: string): DefaultPageEntry | undefined => {
  const clean = `/${cleanDestinationPath(path)}`;
  return (Object.keys(DEFAULT_PAGE_ENTRIES) as DefaultPageEntry[]).find(
    (entry) => clean === DEFAULT_PAGE_ENTRIES[entry]
  );
};

export const readSidebarDefaults = (): SidebarDefaults => {
  try {
    return normalizeSidebarDefaults(
      getStorage().getValue(SIDEBAR_DEFAULTS_STORAGE_KEY)
    );
  } catch (_err) {
    return normalizeSidebarDefaults(undefined);
  }
};

/** Saves the defaults; false when browser storage refused them. */
export const writeSidebarDefaults = (value: SidebarDefaults): boolean => {
  const clean = normalizeSidebarDefaults(value);
  try {
    getStorage().setValue(
      SIDEBAR_DEFAULTS_STORAGE_KEY,
      isDefaultSidebarDefaults(clean) ? undefined : clean
    );
    return true;
  } catch (_err) {
    return false;
  }
};

export const subscribeSidebarDefaults = (
  callback: (value: SidebarDefaults) => void
): (() => void) =>
  getStorage().subscribeChanges(SIDEBAR_DEFAULTS_STORAGE_KEY, (_old, value) =>
    callback(normalizeSidebarDefaults(value))
  );

/**
 * Where activating a tab goes: its own route, except for the Settings tab,
 * which opens on the default page the person chose for it.
 */
export const tabEntryRoute = (id: string, plainRoute: string): string =>
  id === "config" ? entryRoute("config") : plainRoute;

/** The route an entry should open now, read from the stored defaults. */
export const entryRoute = (entry: DefaultPageEntry): string =>
  resolveEntryRoute(entry, window.location.pathname, readSidebarDefaults());
