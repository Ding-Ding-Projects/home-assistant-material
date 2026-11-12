import { describe, expect, it } from "vitest";
import {
  destinationId,
  isRouteUnder,
  neighbourTab,
  openDestination,
  parseDestinationId,
  selectTabForLocation,
  tabForLocation,
  tabRoute,
  uniqueDestinations,
} from "../../../src/common/tabs/tab-destinations";

// One tab per destination, and a stored page id never changes.

describe("destinations", () => {
  it("keeps today's page ids unchanged", () => {
    expect(destinationId("page", "/lovelace/?x=1#y")).toBe("lovelace");
    expect(destinationId("page", "config")).toBe("config");
  });

  it("prefixes settings and tools so they never collide with a page", () => {
    expect(destinationId("settings", "/config/devices/")).toBe(
      "settings:config/devices"
    );
    expect(destinationId("tool", "history")).toBe("tool:history");
    expect(parseDestinationId("settings:config/devices")).toEqual({
      kind: "settings",
      path: "config/devices",
    });
    expect(parseDestinationId("map")).toEqual({ kind: "page", path: "map" });
  });

  it("refuses unusable paths", () => {
    expect(destinationId("page", "")).toBeUndefined();
    expect(destinationId("page", "/")).toBeUndefined();
    expect(destinationId("page", "__proto__")).toBeUndefined();
  });

  it("focuses an open tab instead of adding another", () => {
    expect(openDestination(["map"], [], "page", "/map")).toEqual({
      action: "focus",
      id: "map",
    });
  });

  it("opens a closed or new destination", () => {
    expect(openDestination([], ["map"], "page", "map")).toEqual({
      action: "open",
      id: "map",
      reopen: true,
    });
    expect(openDestination([], [], "tool", "history")).toEqual({
      action: "open",
      id: "tool:history",
      reopen: false,
    });
    expect(openDestination([], [], "page", "")).toEqual({ action: "none" });
  });

  it("finds the tab of a location", () => {
    expect(tabForLocation(["config", "map"], "/config/devices/dashboard")).toBe(
      "config"
    );
    expect(tabForLocation(["map"], "/lovelace/0")).toBeUndefined();
    expect(uniqueDestinations(["a", "a", "b"])).toEqual(["a", "b"]);
  });
});

describe("destination tabs and the location", () => {
  it("leads each tab to its own address", () => {
    expect(tabRoute("map")).toBe("/map");
    expect(tabRoute("settings:config/automation")).toBe("/config/automation");
    expect(tabRoute("tool:config/tools/converter")).toBe(
      "/config/tools/converter"
    );
  });

  it("matches a route to a destination by whole segments", () => {
    expect(isRouteUnder("/config/automation", "config/automation")).toBe(true);
    expect(
      isRouteUnder("/config/automation/edit/1", "/config/automation")
    ).toBe(true);
    // `automations` is another page, not a route below `automation`.
    expect(isRouteUnder("/config/automations", "config/automation")).toBe(
      false
    );
    expect(isRouteUnder("/config", "config/automation")).toBe(false);
    expect(isRouteUnder("/config", "")).toBe(false);
  });

  it("selects the destination tab that claims the location", () => {
    const open = ["config", "settings:config/automation"];
    expect(selectTabForLocation(open, "/config/automation", "config")).toBe(
      "settings:config/automation"
    );
    expect(
      selectTabForLocation(open, "/config/automation/edit/3", "config")
    ).toBe("settings:config/automation");
  });

  it("falls back to the Settings tab when no destination claims the route", () => {
    const open = ["config", "settings:config/automation"];
    expect(selectTabForLocation(open, "/config/devices", "config")).toBe(
      "config"
    );
    expect(selectTabForLocation([], "/config/automation", "config")).toBe(
      "config"
    );
    expect(selectTabForLocation(open, "/", undefined)).toBeUndefined();
  });

  it("lets the most specific open tab win", () => {
    const open = [
      "settings:config/tools",
      "tool:config/tools/yaml",
      "settings:config",
    ];
    expect(selectTabForLocation(open, "/config/tools/yaml", "config")).toBe(
      "tool:config/tools/yaml"
    );
    expect(selectTabForLocation(open, "/config/tools/state", "config")).toBe(
      "settings:config/tools"
    );
    // A closed destination is not in the open list, so it never claims a route.
    expect(
      selectTabForLocation(
        open.filter((id) => id !== "tool:config/tools/yaml"),
        "/config/tools/yaml",
        "config"
      )
    ).toBe("settings:config/tools");
  });

  it("goes to the next tab when one closes, else the previous one", () => {
    const order = ["a", "b", "c"];
    expect(neighbourTab(order, "b")).toBe("c");
    expect(neighbourTab(order, "c")).toBe("b");
    expect(neighbourTab(["a"], "a")).toBeUndefined();
    expect(neighbourTab(order, "missing")).toBeUndefined();
  });
});
