import { describe, expect, it } from "vitest";
import {
  addKindForKey,
  drawnPositionOfInserted,
  gapInsertIndex,
  groupAtGap,
  hasGapAfter,
  insertAt,
  insertManyAt,
} from "../../../../../src/panels/config/automation/tools/add-step-slots";
import {
  drawnIndexes,
  withGroup,
} from "../../../../../src/panels/config/automation/tools/trigger-groups";

const grouped = (name: string) => ({ trigger: "state", editor_group: name });

describe("gaps between drawn rows", () => {
  it("draws a gap after every drawn row except the last", () => {
    expect([0, 1, 2].map((i) => hasGapAfter(i, 3))).toEqual([
      true,
      true,
      false,
    ]);
    expect(hasGapAfter(0, 1)).toBe(false);
    expect(hasGapAfter(-1, 3)).toBe(false);
  });

  it("maps a gap to the real index when a group is folded", () => {
    // Rows: 0 plain, 1 and 2 in a folded group, 3 plain.
    const triggers = [{}, grouped("g"), grouped("g"), {}];
    const drawn = drawnIndexes(triggers, new Set(["g"]));
    expect(drawn).toEqual([0, 3]);
    // The only gap is after row 0: the step lands in front of the folded group.
    expect(gapInsertIndex(drawn, 0)).toBe(1);
    expect(groupAtGap(triggers, 1)).toBeUndefined();
  });

  it("maps a gap in a chunk of a long list to the same index", () => {
    const drawn = [0, 1, 2, 3];
    expect(drawn.map((_, i) => gapInsertIndex(drawn, i))).toEqual([1, 2, 3, 4]);
  });

  it("finds the drawn position of an inserted row", () => {
    const drawn = [0, 3, 4];
    expect(drawnPositionOfInserted(drawn, 1)).toBe(1);
    expect(drawnPositionOfInserted(drawn, 4)).toBe(2);
    expect(drawnPositionOfInserted(drawn, 0)).toBe(0);
  });
});

describe("inserting steps", () => {
  it("inserts at an index and keeps the original untouched", () => {
    const items = ["a", "b", "c"];
    expect(insertAt(items, 1, "x")).toEqual(["a", "x", "b", "c"]);
    expect(items).toEqual(["a", "b", "c"]);
  });

  it("keeps the index inside the list", () => {
    expect(insertAt(["a"], -4, "x")).toEqual(["x", "a"]);
    expect(insertAt(["a"], 9, "x")).toEqual(["a", "x"]);
  });

  it("inserts several steps in order", () => {
    expect(insertManyAt(["a", "b"], 1, ["x", "y"])).toEqual([
      "a",
      "x",
      "y",
      "b",
    ]);
  });
});

describe("trigger groups at a gap", () => {
  const triggers = [{}, grouped("g"), grouped("g"), grouped("h"), {}];

  it("joins the group when both neighbours share it", () => {
    expect(groupAtGap(triggers, 2)).toBe("g");
    const joined = withGroup({ trigger: "sun" }, groupAtGap(triggers, 2));
    expect(joined).toEqual({ trigger: "sun", editor_group: "g" });
  });

  it("stays outside at the edge of a group or between two groups", () => {
    expect(groupAtGap(triggers, 1)).toBeUndefined();
    expect(groupAtGap(triggers, 3)).toBeUndefined();
    expect(groupAtGap(triggers, 4)).toBeUndefined();
  });

  it("has no group at the ends of the list", () => {
    expect(groupAtGap(triggers, 0)).toBeUndefined();
    expect(groupAtGap(triggers, 5)).toBeUndefined();
  });
});

describe("keys that add a step", () => {
  const press = (key: string, extra: Record<string, unknown> = {}) =>
    addKindForKey({ key, ...extra });

  it("maps T, C and A", () => {
    expect(press("t")).toBe("trigger");
    expect(press("c")).toBe("condition");
    expect(press("a")).toBe("action");
  });

  it("ignores other keys", () => {
    expect(press("e")).toBeUndefined();
    expect(press("Enter")).toBeUndefined();
  });

  it("ignores a key with Ctrl, Alt, Meta or Shift", () => {
    for (const mod of ["ctrlKey", "altKey", "metaKey", "shiftKey"]) {
      expect(press("c", { [mod]: true })).toBeUndefined();
    }
  });

  it("ignores a held key and input method composition", () => {
    expect(press("t", { repeat: true })).toBeUndefined();
    expect(press("t", { isComposing: true })).toBeUndefined();
  });

  it("uses the physical key on a keyboard without these letters", () => {
    expect(press("е", { code: "KeyT" })).toBe("trigger");
    expect(press("Dead", { code: "KeyA" })).toBe("action");
    // A latin key never falls back to its physical position.
    expect(press("x", { code: "KeyT" })).toBeUndefined();
  });
});
