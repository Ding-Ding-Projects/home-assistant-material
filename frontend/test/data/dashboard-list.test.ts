import { describe, expect, it } from "vitest";

import {
  listDashboards,
  neighbourDashboard,
} from "../../src/data/dashboard-list";
import { classifySwipe } from "../../src/panels/lovelace/common/dashboard-swipe";
import {
  configForDuplicate,
  duplicateDashboardUrlPath,
} from "../../src/panels/config/lovelace/dashboards/duplicate-dashboard";

const panel = (
  url_path: string,
  component_name = "lovelace",
  title = url_path
) => ({
  url_path,
  component_name,
  title,
  icon: null,
  config: null,
});

const hass = (extra: Record<string, unknown> = {}) =>
  ({
    panels: {
      lovelace: panel("lovelace", "lovelace", "Overview"),
      "dashboard-energy": panel("dashboard-energy", "lovelace", "Energy"),
      "dashboard-cameras": panel("dashboard-cameras", "lovelace", "Cameras"),
      map: panel("map", "map", "Map"),
    },
    localize: () => "",
    states: {},
    user: undefined,
    systemData: undefined,
    ...extra,
  }) as any;

describe("listDashboards", () => {
  it("lists dashboards only, default first and the rest by title", () => {
    expect(
      listDashboards(hass(), "lovelace").map((item) => item.urlPath)
    ).toEqual(["lovelace", "dashboard-cameras", "dashboard-energy"]);
  });

  it("leaves out a dashboard whose conditions fail, but not the current one", () => {
    const conditions = {
      "dashboard-energy": [
        { condition: "state", entity: "input_boolean.x", state: "on" },
      ],
    };
    const h = hass({ systemData: { dashboard_visibility: conditions } });
    expect(listDashboards(h, "lovelace").map((i) => i.urlPath)).toEqual([
      "lovelace",
      "dashboard-cameras",
    ]);
    expect(
      listDashboards(h, "lovelace", "dashboard-energy").map((i) => i.urlPath)
    ).toContain("dashboard-energy");
  });
});

describe("neighbourDashboard", () => {
  const list = [{ urlPath: "a" }, { urlPath: "b" }, { urlPath: "c" }];
  it("finds the next and previous one and stops at both ends", () => {
    expect(neighbourDashboard(list, "b", "next")).toBe("c");
    expect(neighbourDashboard(list, "b", "previous")).toBe("a");
    expect(neighbourDashboard(list, "c", "next")).toBeUndefined();
    expect(neighbourDashboard(list, "a", "previous")).toBeUndefined();
    expect(neighbourDashboard(list, "zzz", "next")).toBeUndefined();
  });
});

describe("classifySwipe", () => {
  it("accepts a long, quick, mostly sideways drag", () => {
    expect(classifySwipe(-120, 10, 300)).toBe("next");
    expect(classifySwipe(120, -20, 300)).toBe("previous");
  });

  it("ignores short, slow or diagonal drags", () => {
    expect(classifySwipe(-40, 0, 200)).toBeUndefined();
    expect(classifySwipe(-120, 10, 1500)).toBeUndefined();
    expect(classifySwipe(-120, 90, 300)).toBeUndefined();
  });
});

describe("duplicating a dashboard", () => {
  it("makes an address with a hyphen that nobody uses", () => {
    expect(duplicateDashboardUrlPath("Guest", new Set())).toBe(
      "dashboard-guest"
    );
    expect(
      duplicateDashboardUrlPath("Guest", new Set(["dashboard-guest"]))
    ).toBe("dashboard-guest-2");
    expect(duplicateDashboardUrlPath("Home, copy", new Set())).toBe(
      "home-copy"
    );
  });

  it("copies the whole dashboard or one view without sharing objects", () => {
    const config = {
      views: [
        { title: "A", cards: [{ type: "x" }] },
        { title: "B", cards: [{ type: "y" }] },
      ],
    } as any;
    const whole = configForDuplicate(config, "dashboard", 0) as any;
    expect(whole.views).toHaveLength(2);
    whole.views[0].cards[0].type = "changed";
    expect(config.views[0].cards[0].type).toBe("x");
    const one = configForDuplicate(config, "view", 1) as any;
    expect(one.views).toEqual([{ title: "B", cards: [{ type: "y" }] }]);
    expect(() => configForDuplicate(config, "view", 5)).toThrow();
  });
});
