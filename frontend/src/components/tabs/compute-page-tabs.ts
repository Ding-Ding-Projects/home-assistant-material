import { mdiCog } from "@mdi/js";
import memoizeOne from "memoize-one";
import { modeText } from "../../common/language-mode/language-mode";
import type { LanguageMode } from "../../common/preferences/personal-preferences";
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

interface SortEntry {
  panel: PanelInfo;
  tab: PageTab;
  /** The English name: the default order is the same in every language mode. */
  sortName: string;
}

const comparePanels = (
  defaultPanel: string,
  a: SortEntry,
  b: SortEntry
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
    a.sortName.localeCompare(b.sortName) ||
    a.panel.url_path.localeCompare(b.panel.url_path)
  );
};

export const computePageTabs = memoizeOne(
  (
    panels: HomeAssistant["panels"],
    defaultPanel: string,
    isAdmin: boolean,
    localize: HomeAssistant["localize"],
    // Passed by the caller, so a change of language mode computes the tabs
    // again. Left out, the names are in English as before.
    mode: LanguageMode = "english"
  ): PageTab[] => {
    if (!panels) {
      return [];
    }
    // The page names follow the language mode, as they do in the sidebar.
    const modeLocalize = ((key: string, values?: Record<string, string>) =>
      modeText(localize, key, values, mode)) as HomeAssistant["localize"];
    const toTab = (panel: PanelInfo, title: string): PageTab => ({
      urlPath: panel.url_path,
      title,
      icon: getPanelIcon(panel),
      iconPath: getPanelIconPath(panel),
    });
    // The server lists panels in the order they were registered, which is not
    // the same after every start. The pages are sorted here so the default
    // order is the same on every load, as the sidebar's is.
    const entries: SortEntry[] = [];
    Object.values(panels).forEach((panel) => {
      if (
        FIXED_PANELS.includes(panel.url_path) ||
        SYSTEM_PANELS.includes(panel.url_path)
      ) {
        return;
      }
      const isDefault = panel.url_path === defaultPanel;
      const title = getPanelTitle({ localize: modeLocalize }, panel);
      if (!isDefault && (!title || panel.show_in_sidebar === false)) {
        return;
      }
      entries.push({
        panel,
        tab: toTab(panel, title || panel.url_path),
        sortName: getPanelTitle({ localize }, panel) || panel.url_path,
      });
    });
    entries.sort((a, b) => comparePanels(defaultPanel, a, b));
    const tabs: PageTab[] = entries.map((entry) => entry.tab);
    if (isAdmin && panels.config) {
      tabs.push({
        urlPath: "config",
        title: modeLocalize("panel.config"),
        iconPath: mdiCog,
      });
    }
    return tabs;
  }
);
