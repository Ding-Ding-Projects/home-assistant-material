import { describe, expect, it } from "vitest";
import {
  cleanGroupName,
  drawnIndexes,
  groupSegments,
  groupSelected,
  realIndex,
  setSegmentGroup,
  suggestGroupName,
  triggerGroupOf,
} from "../../../../../src/panels/config/automation/tools/trigger-groups";

const t = (id: string, group?: string) => ({
  trigger: "state",
  id,
  ...(group ? { editor_group: group } : {}),
});

describe("trigger groups", () => {
  it("cleans names", () => {
    expect(cleanGroupName("  Arriving  ")).toBe("Arriving");
    expect(cleanGroupName("a\nb")).toBe("a b");
    expect(cleanGroupName("")).toBeUndefined();
    expect(cleanGroupName(5)).toBeUndefined();
    expect(cleanGroupName("x".repeat(100))).toHaveLength(60);
    expect(triggerGroupOf({ editor_group: "A" })).toBe("A");
    expect(triggerGroupOf("text")).toBeUndefined();
  });

  it("splits the flat list into runs", () => {
    const list = [t("a"), t("b", "G"), t("c", "G"), t("d"), t("e", "G")];
    expect(groupSegments(list)).toEqual([
      { name: undefined, start: 0, end: 1 },
      { name: "G", start: 1, end: 3 },
      { name: undefined, start: 3, end: 4 },
      { name: "G", start: 4, end: 5 },
    ]);
  });

  it("groups the selected triggers where the first one was", () => {
    const list = [t("a"), t("b"), t("c"), t("d")];
    const next = groupSelected(list, [3, 1], "Away");
    expect(next.map((x) => x.id)).toEqual(["a", "b", "d", "c"]);
    expect(next.map((x) => triggerGroupOf(x))).toEqual([
      undefined,
      "Away",
      "Away",
      undefined,
    ]);
    // The input list is never changed.
    expect(list.every((x) => !("editor_group" in x))).toBe(true);
  });

  it("changes nothing without a name or a selection", () => {
    const list = [t("a"), t("b")];
    expect(groupSelected(list, [], "G")).toEqual(list);
    expect(groupSelected(list, [0], "  ")).toEqual(list);
    expect(groupSelected(list, [9], "G")).toEqual(list);
  });

  it("renames and ungroups one run", () => {
    const list = [t("a", "G"), t("b", "G"), t("c", "H")];
    const renamed = setSegmentGroup(list, { start: 0, end: 2 }, "New");
    expect(renamed.map(triggerGroupOf)).toEqual(["New", "New", "H"]);
    const ungrouped = setSegmentGroup(list, { start: 0, end: 2 }, undefined);
    expect(ungrouped.map(triggerGroupOf)).toEqual([undefined, undefined, "H"]);
    expect("editor_group" in ungrouped[0]).toBe(false);
  });

  it("suggests an unused name", () => {
    expect(suggestGroupName([], "Group")).toBe("Group");
    expect(suggestGroupName([t("a", "Group")], "Group")).toBe("Group 2");
    expect(
      suggestGroupName([t("a", "Group"), t("b", "Group 2")], "Group")
    ).toBe("Group 3");
  });

  it("maps indexes of drawn rows back to the whole list", () => {
    const list = [t("a"), t("b", "G"), t("c", "G"), t("d")];
    const drawn = drawnIndexes(list, new Set(["G"]));
    expect(drawn).toEqual([0, 3]);
    expect(realIndex(drawn, 1, list.length)).toBe(3);
    expect(realIndex(drawn, 2, list.length)).toBe(4);
    expect(drawnIndexes(list, new Set())).toEqual([0, 1, 2, 3]);
  });
});
