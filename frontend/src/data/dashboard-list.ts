import { isPanelShownNow } from "./dashboard-visibility";
import { getPanelIcon, getPanelTitle, LOVELACE_PANEL } from "./panel";
import type { HomeAssistant } from "../types";

/**
 * The dashboards a person can open, taken from the panels the server gave
 * them. A dashboard whose "show only when" conditions do not hold now is left
 * out, except the default one and the one being looked at.
 */

export interface ListedDashboard {
  urlPath: string;
  title: string;
  icon?: string;
  isDefault: boolean;
}

export const listDashboards = (
  hass: Pick<
    HomeAssistant,
    "panels" | "localize" | "systemData" | "states" | "user"
  > &
    Parameters<typeof isPanelShownNow>[2],
  defaultPanel: string | undefined,
  current?: string
): ListedDashboard[] => {
  const items: ListedDashboard[] = [];
  Object.values(hass.panels ?? {}).forEach((panel) => {
    if (panel.component_name !== LOVELACE_PANEL) {
      return;
    }
    if (
      !isPanelShownNow(
        hass.systemData?.dashboard_visibility,
        panel.url_path,
        hass,
        [defaultPanel, current]
      )
    ) {
      return;
    }
    items.push({
      urlPath: panel.url_path,
      title: getPanelTitle(hass, panel) || panel.url_path,
      icon: getPanelIcon(panel),
      isDefault: panel.url_path === defaultPanel,
    });
  });
  return items.sort((a, b) =>
    a.isDefault === b.isDefault
      ? a.title.localeCompare(b.title)
      : a.isDefault
        ? -1
        : 1
  );
};

/** The dashboard before or after the current one, or undefined at either end. */
export const neighbourDashboard = (
  dashboards: readonly { urlPath: string }[],
  current: string,
  direction: "previous" | "next"
): string | undefined => {
  const index = dashboards.findIndex((item) => item.urlPath === current);
  if (index < 0) {
    return undefined;
  }
  return dashboards[index + (direction === "next" ? 1 : -1)]?.urlPath;
};
