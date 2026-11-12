import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  dockFor,
  dockOrientation,
  isVerticalDock,
  normalizeDock,
  readDock,
  withDock,
  writeDock,
} from "../../../src/common/tabs/tab-dock";

// The dock edge is left by default and chosen per strip.

describe("dock", () => {
  beforeEach(() => getStorage().setValue("pageTabsDock", undefined));

  it("defaults to the left edge for every strip", () => {
    expect(dockFor({}, "main")).toBe("left");
    expect(dockFor({}, undefined)).toBe("left");
    expect(readDock("settings")).toBe("left");
  });

  it("keeps a choice per strip and drops the default", () => {
    let store = withDock({}, "main", "bottom");
    store = withDock(store, "settings", "right");
    expect(dockFor(store, "main")).toBe("bottom");
    expect(dockFor(store, "settings")).toBe("right");
    expect(withDock(store, "main", "left")).toEqual({ settings: "right" });
    expect(withDock(store, "main", "diagonal")).toEqual({ settings: "right" });
  });

  it("validates stored data", () => {
    const hostile = JSON.parse(
      '{"main":"top","a":"nope","__proto__":"left","b":3}'
    );
    expect(normalizeDock(hostile)).toEqual({ main: "top" });
    expect(normalizeDock("x")).toEqual({});
  });

  it("persists through storage", () => {
    writeDock("main", "top");
    expect(readDock("main")).toBe("top");
    writeDock("main", "left");
    expect(readDock("main")).toBe("left");
  });

  it("tells the axis", () => {
    expect(isVerticalDock("left")).toBe(true);
    expect(isVerticalDock("top")).toBe(false);
    expect(dockOrientation("right")).toBe("vertical");
    expect(dockOrientation("bottom")).toBe("horizontal");
  });
});
