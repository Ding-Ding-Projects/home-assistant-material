import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import type { SectionCounts } from "./section-summaries";

/** The places most people open: they get large tiles on the settings front. */
export const FEATURED_PATHS = [
  "/config/integrations",
  "/config/automation",
  "/config/areas",
  "/config/backup",
] as const;

export interface SplitPages {
  tiles: PageNavigation[];
  rows: PageNavigation[];
}

/**
 * Splits the visible pages into large tiles and compact rows. Every page ends
 * up in exactly one of the two, so nothing is dropped from the front.
 */
export const splitPages = (pages: PageNavigation[]): SplitPages => {
  const tiles: PageNavigation[] = [];
  const rows: PageNavigation[] = [];
  const seen = new Set<string>();
  for (const page of pages) {
    if (seen.has(page.path)) {
      continue;
    }
    seen.add(page.path);
    if ((FEATURED_PATHS as readonly string[]).includes(page.path)) {
      tiles.push(page);
    } else {
      rows.push(page);
    }
  }
  // Tiles keep the order of FEATURED_PATHS, whatever order the pages came in.
  tiles.sort(
    (a, b) =>
      (FEATURED_PATHS as readonly string[]).indexOf(a.path) -
      (FEATURED_PATHS as readonly string[]).indexOf(b.path)
  );
  return { tiles, rows };
};

/**
 * The live count shown on a tile, or undefined when the page holds no count
 * that is already known. A number is never invented.
 */
export const tileCount = (
  path: string,
  counts?: SectionCounts
): number | undefined => {
  if (!counts) {
    return undefined;
  }
  switch (path) {
    case "/config/integrations":
      return counts.devices;
    case "/config/automation":
      return counts.automations;
    case "/config/areas":
      return counts.areas;
    default:
      return undefined;
  }
};
