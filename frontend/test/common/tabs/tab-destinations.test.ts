import { describe, expect, it } from "vitest";
import {
  destinationId,
  openDestination,
  parseDestinationId,
  tabForLocation,
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
