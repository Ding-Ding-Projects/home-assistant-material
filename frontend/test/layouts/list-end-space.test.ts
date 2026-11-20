import { describe, expect, it } from "vitest";
import {
  listEndSpace,
  nextFolded,
  shouldStackDock,
} from "../../src/layouts/list-end-space";

// Protects the room kept free at the end of a list: the last row must always
// scroll clear of the floating pills, the create button and a page's bulk
// bar, and the large title must fold and unfold without flickering.

describe("listEndSpace", () => {
  it("keeps no room when nothing floats", () => {
    expect(listEndSpace({})).toBe(0);
    expect(listEndSpace({ dock: 0, fab: 0 })).toBe(0);
  });

  it("counts the tallest of the dock and the button side by side", () => {
    // 16 offset + 60 button + 16 air
    expect(listEndSpace({ dock: 60, fab: 60 })).toBe(92);
    expect(listEndSpace({ dock: 48, fab: 72 })).toBe(104);
  });

  it("counts both when the dock rides above the button", () => {
    // 16 offset + 60 dock + 12 gap + 56 button + 16 air
    expect(listEndSpace({ dock: 60, fab: 56, stacked: true })).toBe(160);
  });

  it("keeps the bulk bar's room when it is the tallest", () => {
    expect(listEndSpace({ fab: 56, bulkBar: 176 })).toBe(208);
  });

  it("ignores sizes that are not real numbers", () => {
    expect(listEndSpace({ dock: Number.NaN, fab: -4 })).toBe(0);
    expect(listEndSpace({ dock: 60.2 })).toBe(93);
  });
});

describe("shouldStackDock", () => {
  it("stacks when the pill and the button do not fit side by side", () => {
    expect(shouldStackDock(320, 112, 200)).toBe(true);
    expect(shouldStackDock(390, 112, 200)).toBe(false);
  });

  it("never stacks without a button or a pill", () => {
    expect(shouldStackDock(320, 300, 0)).toBe(false);
    expect(shouldStackDock(320, 0, 300)).toBe(false);
  });
});

describe("nextFolded", () => {
  it("folds only past the threshold", () => {
    expect(nextFolded(false, 10)).toBe(false);
    expect(nextFolded(false, 25)).toBe(true);
  });

  it("stays folded until the list is back at the very top", () => {
    expect(nextFolded(true, 10)).toBe(true);
    expect(nextFolded(true, 0)).toBe(false);
  });
});
