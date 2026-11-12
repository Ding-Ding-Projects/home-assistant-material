import { describe, expect, it } from "vitest";
import {
  moveTab,
  moveWithinRegion,
  orderTabs,
  pinTab,
  togglePin,
  unpinTab,
} from "../../../src/common/tabs/tab-pins";

// The pinned region has its own order and a move never crosses its edge.

describe("pins", () => {
  it("pins at the end of the region without repeats", () => {
    expect(pinTab(["a"], "b")).toEqual(["a", "b"]);
    expect(pinTab(["a"], "a")).toEqual(["a"]);
    expect(unpinTab(["a", "b"], "a")).toEqual(["b"]);
    expect(togglePin(["a"], "a")).toEqual([]);
    expect(togglePin([], "a")).toEqual(["a"]);
  });

  it("puts the pinned region first, in its own order", () => {
    expect(
      orderTabs(["a", "b", "c", "d"], ["d", "c", "b", "a"], ["b", "a"])
    ).toEqual(["b", "a", "d", "c"]);
  });

  it("keeps a never-placed tab after the placed ones", () => {
    expect(orderTabs(["a", "b", "new"], ["b", "a"], [])).toEqual([
      "b",
      "a",
      "new",
    ]);
  });

  it("leaves out pinned ids that are not on offer", () => {
    expect(orderTabs(["a", "b"], [], ["gone", "b"])).toEqual(["b", "a"]);
  });

  it("moves inside a region", () => {
    const ordered = ["p1", "p2", "a", "b", "c"];
    const pinned = ["p1", "p2"];
    expect(moveTab(ordered, pinned, "p1", 1)).toEqual([
      "p2",
      "p1",
      "a",
      "b",
      "c",
    ]);
    expect(moveTab(ordered, pinned, "a", 4)).toEqual([
      "p1",
      "p2",
      "b",
      "c",
      "a",
    ]);
  });

  it("refuses to cross the pinned boundary", () => {
    const ordered = ["p1", "p2", "a", "b"];
    const pinned = ["p1", "p2"];
    expect(moveWithinRegion(ordered, pinned, "a", 0)).toEqual({
      ids: ordered,
      ok: false,
    });
    expect(moveWithinRegion(ordered, pinned, "p1", 3).ok).toBe(false);
    expect(moveWithinRegion(ordered, pinned, "zzz", 0).ok).toBe(false);
  });
});
