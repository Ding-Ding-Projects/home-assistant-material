import { getStorage } from "../decorators/storage";
import { isVerticalDock } from "./tab-dock";
import type { DockEdge } from "./tab-dock";
import { cleanSurface, surfaceEntries } from "./tab-validate";

/**
 * The navigation pane: the tab strip that also carries what the side rail
 * carries (settings, developer tools, notifications and the person), so the
 * rail can be hidden. It is on until the person turns it off, stored per
 * strip. Both answers are kept, so "never chosen" (on) can be told from
 * "chosen off".
 */

export const MERGE_STORAGE_KEY = "pageTabsMerged";

/** The pane is merged with the rail when the person never chose. */
export const DEFAULT_MERGED = true;

/** Stored shape: strip name to the choice made for it. Unchosen strips are absent. */
export type MergeStore = Record<string, boolean>;

export const normalizeMerged = (raw: unknown): MergeStore => {
  const store: MergeStore = {};
  surfaceEntries(raw).forEach(([surface, value]) => {
    if (typeof value === "boolean") {
      store[surface] = value;
    }
  });
  return store;
};

/** The store after choosing on or off for a strip. Both choices are kept. */
export const withMerged = (
  store: MergeStore,
  surface: string | undefined,
  merged: boolean
): MergeStore => ({ ...store, [cleanSurface(surface)]: merged });

/** Whether a strip is merged; on unless the person chose off. */
export const mergedFor = (store: MergeStore, surface?: string): boolean =>
  store[cleanSurface(surface)] ?? DEFAULT_MERGED;

export const readMerged = (surface?: string): boolean =>
  mergedFor(normalizeMerged(getStorage().getValue(MERGE_STORAGE_KEY)), surface);

export const writeMerged = (
  surface: string | undefined,
  merged: boolean
): void =>
  getStorage().setValue(
    MERGE_STORAGE_KEY,
    withMerged(
      normalizeMerged(getStorage().getValue(MERGE_STORAGE_KEY)),
      surface,
      merged
    )
  );

/** What the pane draws for an edge, a collapsed state and a merged state. */
export interface PaneLayout {
  /** The search is a field (true) or a button that opens the same search. */
  searchField: boolean;
  /** The field sits at the top of the pane, under its tools, not at the foot. */
  searchAtTop: boolean;
  /** "Pages" and "System" headings over the two groups of the pane. */
  sectionLabels: boolean;
  /** The brand tile and the instance name lead the pane. */
  brand: boolean;
  /** Assist and the sidebar editor, which the rail carried, are in the pane. */
  railTools: boolean;
  /** Settings, developer tools and notifications are in the pane. */
  systemEntries: boolean;
  /** The system entries show their names, not only their icons. */
  systemNames: boolean;
  /** The person's name sits beside their picture. */
  profileName: boolean;
  /** A home button leads a bar docked to the top or bottom. */
  homeButton: boolean;
}

export const paneLayout = (options: {
  edge: DockEdge;
  collapsed: boolean;
  merged: boolean;
}): PaneLayout => {
  const vertical = isVerticalDock(options.edge);
  const wide = options.merged && vertical && !options.collapsed;
  return {
    searchField: !vertical || wide,
    searchAtTop: wide,
    sectionLabels: wide,
    brand: wide,
    railTools: options.merged,
    systemEntries: options.merged,
    systemNames: wide,
    profileName: wide,
    homeButton: options.merged && !vertical,
  };
};

/** The text of a count badge: nothing for none, "99+" beyond two digits. */
export const badgeText = (count: number): string => {
  if (!Number.isFinite(count) || count <= 0) {
    return "";
  }
  return count > 99 ? "99+" : String(Math.floor(count));
};
