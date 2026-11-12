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
    const tabs: PageTab[] = [];
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
      const tab = toTab(panel, title || panel.url_path);
      if (isDefault) {
        tabs.unshift(tab);
      } else {
        tabs.push(tab);
      }
    });
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
