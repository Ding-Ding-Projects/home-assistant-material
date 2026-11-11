import { describe, expect, it } from "vitest";
import {
  DIVIDER_STEP,
  DIVIDER_STEP_LARGE,
  clampSize,
  maxStartSize,
  parseStoredSize,
  parseStoredState,
  shouldStack,
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
