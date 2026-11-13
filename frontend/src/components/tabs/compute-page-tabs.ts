import { mdiCog } from "@mdi/js";
import memoizeOne from "memoize-one";
import {
  FIXED_PANELS,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
  SYSTEM_PANELS,
} from "../../data/panel";
import type { HomeAssistant, PanelInfo } from "../../types";
import type { PageTab } from "./tab-types";

/** Built-in pages that come first after the dashboards, as in the sidebar. */
const BUILT_IN_RANK: Record<string, number> = {
  energy: 1,
  map: 2,
  logbook: 3,
  history: 4,
};

const comparePanels = (
  defaultPanel: string,
  a: { panel: PanelInfo; tab: PageTab },
  b: { panel: PanelInfo; tab: PageTab }
): number => {
  if (a.panel.url_path === defaultPanel) {
    return -1;
  }
  if (b.panel.url_path === defaultPanel) {
    return 1;
  }
  const aLovelace = a.panel.component_name === "lovelace";
  const bLovelace = b.panel.component_name === "lovelace";
  if (aLovelace !== bLovelace) {
    return aLovelace ? -1 : 1;
  }
  if (!aLovelace) {
    const aRank = BUILT_IN_RANK[a.panel.url_path];
    const bRank = BUILT_IN_RANK[b.panel.url_path];
    if (aRank !== undefined || bRank !== undefined) {
      if (aRank === undefined) {
        return 1;
      }
      if (bRank === undefined) {
        return -1;
      }
      return aRank - bRank;
    }
  }
  return (
    a.tab.title.localeCompare(b.tab.title) ||
    a.panel.url_path.localeCompare(b.panel.url_path)
  );
};

export const computePageTabs = memoizeOne(
  (
    panels: HomeAssistant["panels"],
    defaultPanel: string,
    isAdmin: boolean,
    localize: HomeAssistant["localize"]
  ): PageTab[] => {
    if (!panels) {
      return [];
    }
    const toTab = (panel: PanelInfo, title: string): PageTab => ({
      urlPath: panel.url_path,
      title,
      icon: getPanelIcon(panel),
      iconPath: getPanelIconPath(panel),
    });
    // The server lists panels in the order they were registered, which is not
    // the same after every start. The pages are sorted here so the default
    // order is the same on every load, as the sidebar's is.
    const entries: { panel: PanelInfo; tab: PageTab }[] = [];
    Object.values(panels).forEach((panel) => {
      if (
        FIXED_PANELS.includes(panel.url_path) ||
        SYSTEM_PANELS.includes(panel.url_path)
      ) {
        return;
      }
      const isDefault = panel.url_path === defaultPanel;
      const title = getPanelTitle({ localize }, panel);
      if (!isDefault && (!title || panel.show_in_sidebar === false)) {
        return;
      }
      entries.push({ panel, tab: toTab(panel, title || panel.url_path) });
    });
    entries.sort((a, b) => comparePanels(defaultPanel, a, b));
    const tabs: PageTab[] = entries.map((entry) => entry.tab);
    if (isAdmin && panels.config) {
      tabs.push({
        urlPath: "config",
        title: localize("panel.config"),
        iconPath: mdiCog,
      });
    }
    return tabs;
  }
);
