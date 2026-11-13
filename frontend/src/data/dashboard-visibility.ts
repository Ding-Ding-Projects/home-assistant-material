import type { Connection } from "home-assistant-js-websocket";
import memoizeOne from "memoize-one";
import type {
  Condition,
  ConditionHass,
  VisibilityCondition,
} from "../panels/lovelace/common/validate-condition";
import { checkConditionsMet } from "../panels/lovelace/common/validate-condition";
import type { HomeAssistant } from "../types";
import { fetchFrontendSystemData, saveFrontendSystemData } from "./frontend";

/**
 * "Show only when" conditions for whole dashboards, keyed by the dashboard's
 * URL path. They are kept in the shared frontend system data (only
 * administrators can save it) because the dashboard collection itself has a
 * fixed schema. They only decide whether a dashboard is listed in navigation;
 * they never block opening a dashboard by its address.
 */
export type DashboardVisibilityMap = Record<string, VisibilityCondition[]>;

const hasOwn = (map: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(map, key);

/** The conditions saved for a dashboard; an empty list when there are none. */
export const getDashboardConditions = (
  map: DashboardVisibilityMap | undefined,
  urlPath: string
): VisibilityCondition[] => {
  if (!map || typeof map !== "object" || !hasOwn(map, urlPath)) {
    return [];
  }
  const conditions = map[urlPath];
  return Array.isArray(conditions) ? conditions : [];
};

/**
 * A copy of the map with a dashboard's conditions replaced. An empty list
 * removes the entry, so the map never holds empty lists. Never mutates.
 */
export const setDashboardConditions = (
  map: DashboardVisibilityMap | undefined,
  urlPath: string,
  conditions: VisibilityCondition[]
): DashboardVisibilityMap => {
  const next: DashboardVisibilityMap = {};
  Object.keys(map ?? {}).forEach((key) => {
    if (key !== urlPath && Array.isArray(map![key]) && map![key].length) {
      next[key] = map![key];
    }
  });
  if (conditions.length) {
    next[urlPath] = conditions;
  }
  return next;
};

/** The map without a dashboard (used when the dashboard is deleted). */
export const removeDashboardConditions = (
  map: DashboardVisibilityMap | undefined,
  urlPath: string
): DashboardVisibilityMap => setDashboardConditions(map, urlPath, []);

/** Whether a dashboard's own conditions hold now (true when it has none). */
export const dashboardConditionsMet = (
  map: DashboardVisibilityMap | undefined,
  urlPath: string,
  hass: ConditionHass
): boolean => {
  const conditions = getDashboardConditions(map, urlPath);
  return (
    !conditions.length ||
    checkConditionsMet(conditions as Condition[], hass, {})
  );
};

/**
 * The dashboards whose conditions fail now. `keep` lists paths that must never
 * be hidden (the default dashboard and the one being used).
 */
export const hiddenDashboardPaths = (
  map: DashboardVisibilityMap | undefined,
  hass: ConditionHass,
  keep: readonly (string | undefined)[] = []
): string[] => {
  if (!map || typeof map !== "object") {
    return [];
  }
  return Object.keys(map)
    .filter(
      (urlPath) =>
        !keep.includes(urlPath) && !dashboardConditionsMet(map, urlPath, hass)
    )
    .sort();
};

/** Whether a panel is shown in navigation now. */
export const isPanelShownNow = (
  map: DashboardVisibilityMap | undefined,
  urlPath: string,
  hass: ConditionHass,
  keep: readonly (string | undefined)[] = []
): boolean =>
  keep.includes(urlPath) || dashboardConditionsMet(map, urlPath, hass);

/**
 * Saves one dashboard's conditions into the shared system data, keeping every
 * other value there (it reads the stored value first, so a stale local copy
 * never overwrites a newer one). An empty list removes the entry.
 */
export const saveDashboardConditions = async (
  conn: Connection,
  urlPath: string,
  conditions: VisibilityCondition[]
): Promise<void> => {
  const stored = (await fetchFrontendSystemData(conn, "core")) ?? {};
  const next = setDashboardConditions(
    stored.dashboard_visibility,
    urlPath,
    conditions
  );
  const { dashboard_visibility: _old, ...rest } = stored;
  await saveFrontendSystemData(
    conn,
    "core",
    Object.keys(next).length ? { ...rest, dashboard_visibility: next } : rest
  );
};

const filterPanels = memoizeOne(
  (panels: HomeAssistant["panels"], hiddenKey: string) => {
    const hidden = new Set(hiddenKey.split("\n"));
    return Object.fromEntries(
      Object.entries(panels).filter(([, panel]) => !hidden.has(panel.url_path))
    ) as HomeAssistant["panels"];
  }
);

/**
 * `hass.panels` without the dashboards whose "show only when" conditions fail
 * now. Returns the very same object while nothing is hidden, and the same
 * filtered object while the hidden set stays the same, so the lists built from
 * it only recompute when a dashboard actually appears or disappears. The
 * default dashboard and the one being used are never removed.
 */
export const visiblePanels = (
  hass: Pick<HomeAssistant, "panels" | "systemData" | "panelUrl"> &
    ConditionHass,
  defaultPanel?: string
): HomeAssistant["panels"] => {
  const map = hass.systemData?.dashboard_visibility;
  if (!hass.panels || !map || !Object.keys(map).length) {
    return hass.panels;
  }
  const hidden = hiddenDashboardPaths(map, hass, [defaultPanel, hass.panelUrl]);
  return hidden.length
    ? filterPanels(hass.panels, hidden.join("\n"))
    : hass.panels;
};
