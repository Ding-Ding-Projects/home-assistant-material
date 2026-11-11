import { describe, expect, it } from "vitest";
import {
  DIVIDER_STEP,
  DIVIDER_STEP_LARGE,
  clampSize,
  maxStartSize,
  parseStoredRatio,
  parseStoredSize,
  parseStoredState,
  resolveStoredSize,
  shouldRestoreFiltersOpen,
  shouldStack,
  sizeToRatio,
  sizeForDrag,
  sizeForKey,
  toPercent,
} from "../../../src/components/layout/split-panels-logic";

// Protects the split layout: a divider must never be dragged or restored to a
// size that hides a side, and the arrow keys must follow the page direction.

describe("clampSize", () => {
  it("keeps a size inside the limits", () => {
    expect(clampSize(50, 100, 300)).toBe(100);
    expect(clampSize(500, 100, 300)).toBe(300);
    expect(clampSize(200, 100, 300)).toBe(200);
  });

  it("lets the minimum win when the limits cross", () => {
    expect(clampSize(250, 200, 120)).toBe(200);
  });

  it("falls back to the minimum for a size that is not a number", () => {
    expect(clampSize(Number.NaN, 120, 300)).toBe(120);
    expect(clampSize(Number.POSITIVE_INFINITY, 120, 300)).toBe(120);
  });
});

describe("maxStartSize", () => {
  it("leaves room for the end side and the divider", () => {
    expect(maxStartSize(1000, 240, 12)).toBe(748);
  });

  it("never goes below zero", () => {
    expect(maxStartSize(100, 240, 12)).toBe(0);
  });
});

describe("shouldStack", () => {
  it("stacks under the limit and not at it", () => {
    expect(shouldStack(500, 720)).toBe(true);
    expect(shouldStack(720, 720)).toBe(false);
  });

  it("does not stack before the width is known", () => {
    expect(shouldStack(0, 720)).toBe(false);
  });
});

describe("toPercent", () => {
  it("rounds to a whole percentage and stays within 0 to 100", () => {
    expect(toPercent(250, 1000)).toBe(25);
    expect(toPercent(2000, 1000)).toBe(100);
    expect(toPercent(10, 0)).toBe(0);
  });
});

describe("stored values", () => {
  it("accepts a sensible size", () => {
    expect(parseStoredSize(320)).toBe(320);
    expect(parseStoredSize(0)).toBe(0);
  });

  it("drops damaged sizes", () => {
    expect(parseStoredSize("320")).toBeUndefined();
    expect(parseStoredSize(-5)).toBeUndefined();
    expect(parseStoredSize(Number.NaN)).toBeUndefined();
    expect(parseStoredSize(1e9)).toBeUndefined();
    expect(parseStoredSize(null)).toBeUndefined();
  });

  it("reads a stored state and rejects a malformed one", () => {
    expect(parseStoredState({ size: 300, collapsed: "end" })).toEqual({
      size: 300,
      collapsed: "end",
    });
    expect(
      parseStoredState({ size: 300, collapsed: "middle" })
    ).toBeUndefined();
    expect(parseStoredState({ size: "300", collapsed: "" })).toBeUndefined();
    expect(parseStoredState("nonsense")).toBeUndefined();
    expect(parseStoredState(undefined)).toBeUndefined();
  });
});

describe("sizeForKey", () => {
  const base = {
    current: 300,
    min: 200,
    max: 600,
    defaultSize: 320,
    rtl: false,
    shift: false,
  };

  it("moves by a small step, and a large one with Shift", () => {
    expect(sizeForKey("ArrowRight", base)).toBe(300 + DIVIDER_STEP);
    expect(sizeForKey("ArrowLeft", base)).toBe(300 - DIVIDER_STEP);
    expect(sizeForKey("ArrowRight", { ...base, shift: true })).toBe(
      300 + DIVIDER_STEP_LARGE
    );
  });

  it("swaps the arrows in a right-to-left page", () => {
    expect(sizeForKey("ArrowRight", { ...base, rtl: true })).toBe(
      300 - DIVIDER_STEP
    );
    expect(sizeForKey("ArrowLeft", { ...base, rtl: true })).toBe(
      300 + DIVIDER_STEP
    );
  });

  it("stops at the limits", () => {
    expect(sizeForKey("ArrowLeft", { ...base, current: 205 })).toBe(200);
    expect(sizeForKey("ArrowRight", { ...base, current: 595 })).toBe(600);
  });

  it("goes to the limits with Home and End and back to the default with Enter", () => {
    expect(sizeForKey("Home", base)).toBe(200);
    expect(sizeForKey("End", base)).toBe(600);
    expect(sizeForKey("Enter", base)).toBe(320);
  });

  it("ignores keys it does not use", () => {
    expect(sizeForKey("a", base)).toBeUndefined();
    expect(sizeForKey("ArrowUp", base)).toBeUndefined();
  });
});

describe("sizeForDrag", () => {
  it("grows the start side when dragged toward the end", () => {
    expect(sizeForDrag(300, 40, false, 200, 600)).toBe(340);
    expect(sizeForDrag(300, 40, true, 200, 600)).toBe(260);
  });

  it("stays within the limits", () => {
    expect(sizeForDrag(300, -500, false, 200, 600)).toBe(200);
    expect(sizeForDrag(300, 900, false, 200, 600)).toBe(600);
  });
});

describe("stored share of the container", () => {
  it("turns a size into a share and back", () => {
    expect(sizeToRatio(250, 1000)).toBe(0.25);
    expect(resolveStoredSize({ size: 0, ratio: 0.25 }, 800)).toBe(200);
  });

  it("gives no share for an unknown container or an empty size", () => {
    expect(sizeToRatio(250, 0)).toBeUndefined();
    expect(sizeToRatio(0, 1000)).toBeUndefined();
    expect(sizeToRatio(Number.NaN, 1000)).toBeUndefined();
  });

  it("keeps reading a record with pixels only", () => {
    const state = parseStoredState({ size: 320, collapsed: "" });
    expect(state).toEqual({ size: 320, collapsed: "" });
    // No share: the pixel value is used whatever the container width is
    expect(resolveStoredSize(state!, 1600)).toBe(320);
  });

  it("reads a record with a share and drops a damaged share", () => {
    expect(
      parseStoredState({ size: 300, ratio: 0.4, collapsed: "end" })
    ).toEqual({ size: 300, ratio: 0.4, collapsed: "end" });
    expect(parseStoredRatio(0)).toBeUndefined();
    expect(parseStoredRatio(1.5)).toBeUndefined();
    expect(parseStoredRatio("0.4")).toBeUndefined();
    // A damaged share with good pixels falls back to the pixels
    const state = parseStoredState({ size: 300, ratio: 7, collapsed: "" });
    expect(resolveStoredSize(state!, 1000)).toBe(300);
    // Neither: nothing to restore
    expect(parseStoredState({ ratio: 7, collapsed: "" })).toBeUndefined();
  });
});

describe("shouldRestoreFiltersOpen", () => {
  it("restores an open choice only where the side pane is shown", () => {
    expect(shouldRestoreFiltersOpen("", true)).toBe(true);
    expect(shouldRestoreFiltersOpen("", false)).toBe(false);
    expect(shouldRestoreFiltersOpen("start", true)).toBe(false);
  });
});

describe("a pane width that is stored too wide", () => {
  it("is clamped to what the container allows", () => {
    expect(clampSize(900, 200, 560)).toBe(560);
    expect(clampSize(900, 200, maxStartSize(700, 240, 12))).toBe(448);
  });
});
