import { describe, expect, it } from "vitest";
import {
  countPreview,
  hiddenSelectedCount,
  invertSelection,
  invertVisible,
  nextConfirmStep,
  pruneSelection,
  selectRange,
  selectVisible,
  splitAlreadyGone,
  toggleSelected,
} from "../../../src/components/bulk/bulk-selection";

// Protects the selection rules of every list that adopts the bulk bar, and
// above all the two-step confirmation: a destructive action must never run
// on the first click, and nothing may run when it would change nothing.

const ids = ["a", "b", "c", "d", "e"];

describe("selection", () => {
  it("toggles one id", () => {
    expect(toggleSelected(["a"], "b")).toEqual(["a", "b"]);
    expect(toggleSelected(["a", "b"], "a")).toEqual(["b"]);
  });

  it("selects a range in either direction and keeps earlier picks", () => {
    expect(selectRange(ids, ["e"], "b", "d")).toEqual(["e", "b", "c", "d"]);
    expect(selectRange(ids, [], "d", "b")).toEqual(["b", "c", "d"]);
  });

  it("acts as a plain click without a usable anchor", () => {
    expect(selectRange(ids, ["a"], undefined, "c")).toEqual(["a", "c"]);
    expect(selectRange(ids, ["a"], "gone", "c")).toEqual(["a", "c"]);
  });

  it("inverts within the listed ids and prunes vanished ones", () => {
    expect(invertSelection(ids, ["a", "c"])).toEqual(["b", "d", "e"]);
    expect(pruneSelection(["a", "zz"], ids)).toEqual(["a"]);
  });
});

describe("items that are already gone", () => {
  it("separates what still exists from what someone else deleted", () => {
    expect(splitAlreadyGone(["a", "b", "c"], new Set(["a", "c", "z"]))).toEqual(
      { present: ["a", "c"], gone: ["b"] }
    );
  });

  it("reports nothing gone when everything exists", () => {
    expect(splitAlreadyGone(["a"], new Set(["a"]))).toEqual({
      present: ["a"],
      gone: [],
    });
  });
});

describe("preview and confirmation", () => {
  it("counts each kind", () => {
    expect(
      countPreview([
        { kind: "change", text: "" },
        { kind: "skip", text: "" },
        { kind: "change", text: "" },
        { kind: "warning", text: "" },
      ])
    ).toEqual({ change: 2, same: 0, skip: 1, warning: 1 });
  });

  it("asks twice for a destructive action, once otherwise", () => {
    expect(nextConfirmStep(true, false, 3)).toBe("ask-again");
    expect(nextConfirmStep(true, true, 3)).toBe("run");
    expect(nextConfirmStep(false, false, 3)).toBe("run");
  });

  it("never runs when nothing would change", () => {
    expect(nextConfirmStep(false, false, 0)).toBe("blocked");
    expect(nextConfirmStep(true, true, 0)).toBe("blocked");
  });
});

describe("selection under a filter", () => {
  const visible = ["a", "b", "c"];

  it("selects the shown rows and keeps a hidden selection", () => {
    expect(selectVisible(visible, ["x"])).toEqual(["x", "a", "b", "c"]);
    expect(selectVisible(visible, ["a"])).toEqual(["a", "b", "c"]);
  });

  it("inverts the shown rows and keeps a hidden selection", () => {
    expect(invertVisible(visible, ["x", "a"])).toEqual(["x", "b", "c"]);
  });

  it("counts the selected rows the filter hides", () => {
    expect(hiddenSelectedCount(visible, ["x", "a", "y"])).toBe(2);
    expect(hiddenSelectedCount(visible, [])).toBe(0);
  });
});
