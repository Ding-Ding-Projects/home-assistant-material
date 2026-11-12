import { getStorage } from "../decorators/storage";
import { isVerticalDock, normalizeCollapse, withCollapsed } from "./tab-dock";
import type { DockEdge } from "./tab-dock";
import { cleanSurface } from "./tab-validate";

/**
 * The navigation pane: the tab strip that also carries what the side rail
 * carries (settings, developer tools, notifications and the person), so the
 * rail can be hidden. It is a choice, off until chosen, stored per strip.
 */

export const MERGE_STORAGE_KEY = "pageTabsMerged";

/** Stored shape: the strips that are merged with the rail. Others are not kept. */
export const normalizeMerged = normalizeCollapse;

export const withMerged = withCollapsed;

export const readMerged = (surface?: string): boolean =>
  normalizeMerged(getStorage().getValue(MERGE_STORAGE_KEY))[
    cleanSurface(surface)
  ] === true;

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
