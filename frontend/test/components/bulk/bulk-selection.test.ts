import { describe, expect, it } from "vitest";
import {
  countPreview,
  invertSelection,
  nextConfirmStep,
  pruneSelection,
  selectRange,
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

describe("preview and confirmation", () => {
  it("counts each kind", () => {
    expect(
      countPreview([
        { kind: "change", text: "" },
        { kind: "skip", text: "" },
        { kind: "change", text: "" },
      ])
    ).toEqual({ change: 2, same: 0, skip: 1 });
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
