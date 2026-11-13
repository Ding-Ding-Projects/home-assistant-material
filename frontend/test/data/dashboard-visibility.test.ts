import { describe, expect, it } from "vitest";
import {
  dashboardConditionsMet,
  getDashboardConditions,
  hiddenDashboardPaths,
  isPanelShownNow,
  removeDashboardConditions,
  setDashboardConditions,
  visiblePanels,
} from "../../src/data/dashboard-visibility";
import type { VisibilityCondition } from "../../src/panels/lovelace/common/validate-condition";

const on: VisibilityCondition = {
  condition: "state",
  entity: "input_boolean.guest",
  state: "on",
};

const makeHass = (guest: string, map?: Record<string, VisibilityCondition[]>) =>
  ({
    states: { "input_boolean.guest": { state: guest, attributes: {} } },
    user: { id: "u1", is_admin: true },
    locale: { language: "en", time_zone: "local" },
    config: {},
    entities: {},
    devices: {},
    areas: {},
    panelUrl: "lovelace",
    systemData: map ? { dashboard_visibility: map } : {},
    panels: {
      lovelace: { url_path: "lovelace" },
      "dashboard-a": { url_path: "dashboard-a" },
      "dashboard-b": { url_path: "dashboard-b" },
    },
  }) as any;

describe("dashboard visibility map", () => {
  it("reads conditions and tolerates bad data", () => {
    expect(getDashboardConditions(undefined, "x")).toEqual([]);
    expect(getDashboardConditions({ x: [on] }, "x")).toEqual([on]);
    expect(getDashboardConditions({ x: "nope" } as any, "x")).toEqual([]);
    expect(getDashboardConditions({}, "toString")).toEqual([]);
  });

  it("writes immutably and drops empty lists", () => {
    const original = { a: [on] };
    const next = setDashboardConditions(original, "b", [on]);
    expect(next).toEqual({ a: [on], b: [on] });
    expect(original).toEqual({ a: [on] });
    expect(setDashboardConditions(next, "a", [])).toEqual({ b: [on] });
    expect(removeDashboardConditions({ a: [on] }, "a")).toEqual({});
    expect(setDashboardConditions({ a: [] }, "b", [on])).toEqual({ b: [on] });
  });

  it("evaluates conditions against live state", () => {
    const map = { "dashboard-a": [on] };
    expect(dashboardConditionsMet(map, "dashboard-a", makeHass("on"))).toBe(
      true
    );
    expect(dashboardConditionsMet(map, "dashboard-a", makeHass("off"))).toBe(
      false
    );
    expect(dashboardConditionsMet(map, "dashboard-b", makeHass("off"))).toBe(
      true
    );
  });

  it("supports groups with not", () => {
    const map = {
      "dashboard-a": [{ condition: "not", conditions: [on] } as any],
    };
    expect(dashboardConditionsMet(map, "dashboard-a", makeHass("on"))).toBe(
      false
    );
    expect(dashboardConditionsMet(map, "dashboard-a", makeHass("off"))).toBe(
      true
    );
  });

  it("never hides kept dashboards", () => {
    const map = { lovelace: [on], "dashboard-a": [on] };
    const hass = makeHass("off");
    expect(hiddenDashboardPaths(map, hass)).toEqual([
      "dashboard-a",
      "lovelace",
    ]);
    expect(hiddenDashboardPaths(map, hass, ["lovelace"])).toEqual([
      "dashboard-a",
    ]);
    expect(isPanelShownNow(map, "lovelace", hass, ["lovelace"])).toBe(true);
  });
});

describe("visiblePanels", () => {
  it("returns the same object while nothing is hidden", () => {
    const hass = makeHass("on", { "dashboard-a": [on] });
    expect(visiblePanels(hass)).toBe(hass.panels);
    expect(visiblePanels(makeHass("off"))).toBeDefined();
  });

  it("drops hidden dashboards and keeps a stable result", () => {
    const map = { "dashboard-a": [on] };
    const hass = makeHass("off", map);
    const first = visiblePanels(hass, "lovelace");
    expect(Object.keys(first)).toEqual(["lovelace", "dashboard-b"]);
    expect(visiblePanels({ ...hass }, "lovelace")).toBe(first);
  });

  it("keeps the dashboard in use and the default", () => {
    const map = { lovelace: [on], "dashboard-a": [on] };
    const hass = { ...makeHass("off", map), panelUrl: "dashboard-a" };
    expect(Object.keys(visiblePanels(hass, "lovelace"))).toEqual([
      "lovelace",
      "dashboard-a",
      "dashboard-b",
    ]);
  });
});
