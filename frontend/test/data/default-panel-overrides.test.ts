import { describe, expect, it } from "vitest";
import {
  computeDeviceKind,
  normalizeOverrides,
  pickDefaultPanel,
  setOverride,
} from "../../src/data/default-panel-overrides";

describe("computeDeviceKind", () => {
  it("uses the screen condition breakpoints", () => {
    expect(computeDeviceKind(375, false)).toBe("phone");
    expect(computeDeviceKind(767, false)).toBe("phone");
    expect(computeDeviceKind(768, false)).toBe("tablet");
    expect(computeDeviceKind(1023, false)).toBe("tablet");
    expect(computeDeviceKind(1024, false)).toBe("desktop");
    expect(computeDeviceKind(2560, false)).toBe("desktop");
  });

  it("is a wall panel whenever the wall panel settings are on", () => {
    expect(computeDeviceKind(375, true)).toBe("wall_panel");
    expect(computeDeviceKind(1920, true)).toBe("wall_panel");
  });
});

describe("normalizeOverrides", () => {
  it("keeps only known kinds with a path", () => {
    expect(
      normalizeOverrides({
        phone: "map",
        tablet: "",
        desktop: 5,
        fridge: "x",
      })
    ).toEqual({ phone: "map" });
  });

  it("copes with anything that is not an object", () => {
    expect(normalizeOverrides(null)).toEqual({});
    expect(normalizeOverrides("phone")).toEqual({});
    expect(normalizeOverrides(["map"])).toEqual({});
  });
});

describe("pickDefaultPanel", () => {
  const overrides = { phone: "phone-board", wall_panel: "wall" };

  it("lets a person's own choice win over everything", () => {
    expect(
      pickDefaultPanel({
        personal: "mine",
        everyone: "home",
        overrides,
        kind: "phone",
      })
    ).toBe("mine");
  });

  it("uses the override for the kind of device", () => {
    expect(
      pickDefaultPanel({ everyone: "home", overrides, kind: "phone" })
    ).toBe("phone-board");
  });

  it("falls back to the dashboard for everyone", () => {
    expect(
      pickDefaultPanel({ everyone: "home", overrides, kind: "desktop" })
    ).toBe("home");
    expect(pickDefaultPanel({ everyone: "home", kind: "phone" })).toBe("home");
  });

  it("ignores an override whose dashboard no longer exists", () => {
    expect(
      pickDefaultPanel({
        everyone: "home",
        overrides,
        kind: "phone",
        knownPanels: { home: {} },
      })
    ).toBe("home");
    expect(
      pickDefaultPanel({
        everyone: "home",
        overrides,
        kind: "phone",
        knownPanels: { home: {}, "phone-board": {} },
      })
    ).toBe("phone-board");
  });

  it("returns nothing when nothing is set", () => {
    expect(pickDefaultPanel({ kind: "tablet" })).toBeUndefined();
  });
});

describe("setOverride", () => {
  it("sets and clears one kind without touching the others", () => {
    const set = setOverride({ phone: "a" }, "tablet", "b");
    expect(set).toEqual({ phone: "a", tablet: "b" });
    expect(setOverride(set, "phone", undefined)).toEqual({ tablet: "b" });
  });
});
