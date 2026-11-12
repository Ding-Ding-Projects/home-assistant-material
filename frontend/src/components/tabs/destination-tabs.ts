import memoizeOne from "memoize-one";
import { getStorage } from "../../common/decorators/storage";
import { currentPath } from "../../common/url/current-path";
import {
  readDestinations,
  withDestination,
  writeDestinations,
} from "../../common/tabs/tab-destination-list";
import type { DestinationKind } from "../../common/tabs/tab-destinations";
import {
  cleanDestinationPath,
  destinationId,
  openDestination,
  selectTabForLocation,
  tabRoute,
} from "../../common/tabs/tab-destinations";
import {
  CLOSED_STORAGE_KEY,
  normalizeClosed,
} from "../../common/tabs/tab-pins";
import { openTab } from "../../common/tabs/tab-seen";
import { DEFAULT_SURFACE } from "../../common/tabs/tab-validate";
import { getDefaultPanelUrlPath } from "../../data/panel";
import type { HomeAssistant } from "../../types";
import {
  computeSettingsEntries,
  computeToolEntries,
} from "../page-catalog-entries";
import { computePageTabs } from "./compute-page-tabs";
import type { PageTab } from "./tab-types";

/**
 * Settings pages and tools as tabs.
 *
 * A destination tab is a `PageTab` whose `urlPath` is the destination id
 * (`settings:config/automation`, `tool:config/tools/converter`), so the order,
 * pins, groups, look, locks and the closed list treat it exactly like a page
 * tab. What is added here is where its title and icon come from (the catalog
 * entries, with the same visibility checks the catalog applies), which
 * destinations are open (`pageTabsDestinations`) and which tab is selected for
 * the location.
 */

export interface DestinationCandidate {
  id: string;
  kind: Exclude<DestinationKind, "page">;
  /** Address to navigate to, with its leading slash. */
  path: string;
  title: string;
  iconPath?: string;
}

/**
 * Whether the page that serves an address exists for this person. A settings
 * page or tool lives below a panel (`config`), and an account without that
 * panel is sent to its default page instead, so a tab for it would lead
 * nowhere.
 */
export const isDestinationReachable = (
  hass: HomeAssistant,
  path: string
): boolean => {
  const panel = cleanDestinationPath(path).split("/")[0];
  return !!panel && !!hass.panels && panel in hass.panels;
};

/**
 * Every settings page and tool this person may open as a tab. A destination
 * the person may not see (an administrator page for another account, a tool
 * whose integration is not loaded) is not in this list. When a settings page
 * and a tool share an address only the settings page is kept, so no address
 * owns two tabs.
 */
export const destinationCandidates = (
  hass: HomeAssistant
): DestinationCandidate[] => {
  const taken = new Set<string>();
  const result: DestinationCandidate[] = [];
  const add = (
    kind: DestinationCandidate["kind"],
    entries: ReturnType<typeof computeSettingsEntries>
  ) => {
    entries.forEach((entry) => {
      const id = destinationId(kind, entry.path);
      const clean = cleanDestinationPath(entry.path);
      if (!id || taken.has(clean) || !isDestinationReachable(hass, clean)) {
        return;
      }
      taken.add(clean);
      result.push({
        id,
        kind,
        path: `/${clean}`,
        title: entry.title,
        iconPath: entry.iconPath,
      });
    });
  };
  add("settings", computeSettingsEntries(hass));
  add("tool", computeToolEntries(hass));
  return result;
};

const resolveDestinations = memoizeOne(
  (
    _panels: HomeAssistant["panels"],
    _config: HomeAssistant["config"],
    _user: HomeAssistant["user"],
    _localize: HomeAssistant["localize"],
    ids: string,
    hass: HomeAssistant
  ): PageTab[] => {
    const wanted = ids ? ids.split("\n") : [];
    const byId = new Map(
      destinationCandidates(hass).map((candidate) => [candidate.id, candidate])
    );
    // A destination that is not offered now (not visible to this person, or its
    // title is not loaded yet) is hidden, never deleted from the saved list.
    return wanted.flatMap((id) => {
      const candidate = byId.get(id);
      return candidate
        ? [
            {
              urlPath: id,
              title: candidate.title,
              iconPath: candidate.iconPath,
            },
          ]
        : [];
    });
  },
  // `hass` changes with every state update; only what decides the entries counts.
  (next, last) => next.slice(0, 5).every((arg, index) => arg === last[index])
);

/** The destination tabs the person opened and may see, in the order opened. */
export const computeDestinationTabs = (
  hass: HomeAssistant,
  surface = DEFAULT_SURFACE
): PageTab[] => {
  const ids = readDestinations(surface);
  if (!ids.length || !hass?.panels) {
    return [];
  }
  return resolveDestinations(
    hass.panels,
    hass.config,
    hass.user,
    hass.localize,
    ids.join("\n"),
    hass
  );
};

const mergeTabs = memoizeOne(
  (pages: PageTab[], destinations: PageTab[]): PageTab[] =>
    destinations.length ? [...pages, ...destinations] : pages
);

/**
 * Every tab that can be in the strip: the pages of the sidebar, then the
 * settings pages and tools opened as tabs.
 */
export const computeStripTabs = (
  hass: HomeAssistant,
  surface = DEFAULT_SURFACE
): PageTab[] =>
  mergeTabs(
    computePageTabs(
      hass.panels,
      getDefaultPanelUrlPath(hass),
      Boolean(hass.user?.is_admin),
      hass.localize
    ),
    computeDestinationTabs(hass, surface)
  );

/** The tab selected for the location shown now (see `selectTabForLocation`). */
export const currentTabId = (
  hass: HomeAssistant,
  surface = DEFAULT_SURFACE
): string | undefined => {
  const closed = new Set(
    normalizeClosed(getStorage().getValue(CLOSED_STORAGE_KEY))
  );
  const openIds = computeDestinationTabs(hass, surface)
    .map((tab) => tab.urlPath)
    .filter((id) => !closed.has(id));
  return selectTabForLocation(openIds, currentPath(), hass.panelUrl);
};

export interface ChosenDestination {
  /** Where to go. Undefined when the destination could not be used. */
  route?: string;
  /** The destination had no open tab, so one was opened or reopened. */
  opened: boolean;
  /** The list of destinations is full, so no new tab was made. */
  full: boolean;
}

/**
 * What choosing a settings page or tool in the New tab catalog does: an open
 * tab for it is focused (nothing is added), a closed one is opened again and
 * one that was never opened is opened. Saved here so the wide strip and the
 * phone sheet share it. The caller navigates to `route`.
 */
export const chooseDestination = (
  kind: Exclude<DestinationKind, "page">,
  path: string,
  surface = DEFAULT_SURFACE
): ChosenDestination => {
  const storage = getStorage();
  const closed = normalizeClosed(storage.getValue(CLOSED_STORAGE_KEY));
  const listed = readDestinations(surface);
  const openIds = listed.filter((id) => !closed.includes(id));
  const choice = openDestination(openIds, closed, kind, path);
  if (choice.action === "none") {
    return { opened: false, full: false };
  }
  const route = tabRoute(choice.id);
  if (choice.action === "focus") {
    return { route, opened: false, full: false };
  }
  const added = withDestination(listed, choice.id);
  if (added.full) {
    return { route, opened: false, full: true };
  }
  if (added.added) {
    writeDestinations(surface, added.list);
  }
  if (choice.reopen) {
    storage.setValue(CLOSED_STORAGE_KEY, openTab(closed, choice.id));
  }
  return { route, opened: true, full: false };
};
