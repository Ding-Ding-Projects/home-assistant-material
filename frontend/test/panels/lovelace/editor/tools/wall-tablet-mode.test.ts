import { describe, expect, it } from "vitest";
import {
  normalizeWallPanel,
  tabletIdFromName,
} from "../../../../../src/panels/lovelace/editor/tools/wall-panel";
import {
  isInterfacePath,
  motionTurnedOn,
} from "../../../../../src/panels/lovelace/editor/tools/wall-tablet-mode";

describe("wall tablet mode", () => {
  it("is off by default and drops bad values", () => {
    expect(normalizeWallPanel(null).kiosk.enabled).toBe(false);
    const kiosk = normalizeWallPanel({
      kiosk: { enabled: true, name: "  Hall  ", motionEntity: "not an id" },
    }).kiosk;
    expect(kiosk.name).toBe("Hall");
    expect(kiosk.motionEntity).toBe("");
    expect(
      normalizeWallPanel({ kiosk: { motionEntity: "binary_sensor.hall" } })
        .kiosk.motionEntity
    ).toBe("binary_sensor.hall");
  });

  it("makes a safe tablet identifier from a name", () => {
    expect(tabletIdFromName("Hall iPad")).toBe("hall-ipad");
    expect(tabletIdFromName("  Küche / 2 ")).toBe("kuche-2");
    expect(tabletIdFromName("厨房")).toBe("");
  });

  it("wakes only when motion turns on after a first reading", () => {
    expect(motionTurnedOn(undefined, "on")).toBe(false);
    expect(motionTurnedOn("off", "on")).toBe(true);
    expect(motionTurnedOn("unavailable", "on")).toBe(true);
    expect(motionTurnedOn("on", "on")).toBe(false);
    expect(motionTurnedOn("on", "off")).toBe(false);
  });

  it("only follows paths inside the interface", () => {
    expect(isInterfacePath("/lovelace/home")).toBe(true);
    expect(isInterfacePath("//example.com")).toBe(false);
    expect(isInterfacePath("https://example.com")).toBe(false);
    expect(isInterfacePath(undefined)).toBe(false);
  });
});
