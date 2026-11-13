import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  DEFAULT_FLOAT,
  dockFor,
  dockOrientation,
  floatFor,
  floatFromPixels,
  floatPixels,
  isDockEdge,
  isVerticalDock,
  normalizeCollapse,
  normalizeFloat,
  withCollapsed,
  withFloat,
  normalizeDock,
  readDock,
  withDock,
  writeDock,
} from "../../../src/common/tabs/tab-dock";

// The dock edge is left by default and chosen per strip.

describe("dock", () => {
  beforeEach(() => getStorage().setValue("pageTabsEdge", undefined));

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

// Floating and collapsing. These protect what is stored and read back: a
// position off the window or a bad stored value must never hide the strip.
describe("floating strip position", () => {
  it("keeps only shares between 0 and 1 per strip", () => {
    expect(
      normalizeFloat({
        main: { x: 0.5, y: 2 },
        other: { x: "a", y: 0.2 },
        third: null,
      })
    ).toEqual({ main: { x: 0.5, y: 1 } });
  });

  it("uses the default position until one is chosen", () => {
    expect(floatFor({}, "main")).toEqual(DEFAULT_FLOAT);
    expect(floatFor(withFloat({}, "main", { x: 0.3, y: 0.4 }), "main")).toEqual(
      { x: 0.3, y: 0.4 }
    );
  });

  it("keeps a floating panel on screen whatever was stored", () => {
    const window = { width: 1000, height: 800 };
    const panel = { width: 200, height: 600 };
    expect(floatPixels({ x: 1, y: 1 }, panel, window)).toEqual({
      left: 792,
      top: 192,
    });
    expect(floatPixels({ x: 0, y: 0 }, panel, window)).toEqual({
      left: 8,
      top: 8,
    });
  });

  it("keeps the margin when the panel is larger than the window", () => {
    expect(
      floatPixels(
        { x: 0.5, y: 0.5 },
        { width: 2000, height: 2000 },
        { width: 1000, height: 800 }
      )
    ).toEqual({ left: 8, top: 8 });
  });

  it("turns pixels back into shares of the window", () => {
    expect(floatFromPixels(250, 200, { width: 1000, height: 800 })).toEqual({
      x: 0.25,
      y: 0.25,
    });
    expect(floatFromPixels(-50, 5000, { width: 1000, height: 800 })).toEqual({
      x: 0,
      y: 1,
    });
  });

  it("floats as a vertical strip", () => {
    expect(isVerticalDock("float")).toBe(true);
    expect(isDockEdge("float")).toBe(true);
  });
});

describe("collapsed strips", () => {
  it("stores only collapsed strips", () => {
    const collapsed = withCollapsed({}, "main", true);
    expect(collapsed).toEqual({ main: true });
    expect(withCollapsed(collapsed, "main", false)).toEqual({});
  });

  it("ignores anything but true", () => {
    expect(normalizeCollapse({ main: "yes", other: true })).toEqual({
      other: true,
    });
  });
});
