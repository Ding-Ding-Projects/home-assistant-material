import { describe, expect, it } from "vitest";
import type { TabGroup } from "../../../src/common/tabs/tab-groups";
import { layoutStrip } from "../../../src/common/tabs/tab-groups";
import {
  applyChange,
  flattenSegments,
  groupStepTarget,
  joinGroup,
  leaveGroup,
  mergeVisible,
  moveGroupNear,
  moveTabNear,
  moveTabToEnd,
  planKeyboardMove,
} from "../../../src/components/tabs/tab-strip-moves";

const group = (id: string, members: string[], collapsed = false): TabGroup => ({
  id,
  name: id,
  colour: "blue",
  collapsed,
  members,
});

const strip = (
  visible: string[],
  groups: TabGroup[] = [],
  pinned: string[] = [],
  order: string[] = visible
) => ({
  segments: layoutStrip({ visible, order, pinned, groups }),
  context: { groups, pinned },
});

describe("mergeVisible", () => {
  it("refills the visible slots and keeps hidden tabs where they were", () => {
    expect(
      mergeVisible(["a", "x", "b", "y", "c"], ["a", "b", "c"], ["c", "a", "b"])
    ).toEqual(["c", "x", "a", "y", "b"]);
  });

  it("falls back to the new order when the sets differ", () => {
    expect(mergeVisible(["a", "b"], ["a"], ["b"])).toEqual(["b", "a"]);
  });
});

describe("moveTabNear", () => {
  it("reorders loose tabs", () => {
    const { segments, context } = strip(["a", "b", "c"]);
    expect(moveTabNear(segments, context, "a", "c", true)?.visible).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("refuses to cross the pinned boundary but reorders inside it", () => {
    const { segments, context } = strip(["p", "q", "a"], [], ["p", "q"]);
    expect(moveTabNear(segments, context, "a", "p", false)).toBeUndefined();
    expect(moveTabNear(segments, context, "p", "a", true)).toBeUndefined();
    const change = moveTabNear(segments, context, "q", "p", false);
    expect(change?.visible).toEqual(["q", "p", "a"]);
    expect(change?.pinned).toEqual(["q", "p"]);
  });

  it("joins a group at the place of the target member", () => {
    const g = group("g1", ["b", "c"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    const change = moveTabNear(segments, context, "a", "c", false);
    expect(change?.kind).toBe("join");
    expect(change?.visible).toEqual(["b", "a", "c"]);
    expect(change?.groups?.[0].members).toEqual(["b", "a", "c"]);
  });

  it("leaves a group when dropped on a loose tab", () => {
    const g = group("g1", ["a", "b"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    const change = moveTabNear(segments, context, "a", "c", true);
    expect(change?.kind).toBe("leave");
    expect(change?.visible).toEqual(["b", "c", "a"]);
    expect(change?.groups?.[0].members).toEqual(["b"]);
  });

  it("reorders inside one group", () => {
    const g = group("g1", ["a", "b", "c"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    const change = moveTabNear(segments, context, "a", "c", true);
    expect(change?.kind).toBe("reorder");
    expect(change?.groups?.[0].members).toEqual(["b", "c", "a"]);
  });

  it("keeps hidden members in the group list when a visible member moves", () => {
    const g = group("g1", ["a", "x", "b"]);
    const { segments, context } = strip(["a", "b"], [g]);
    const change = moveTabNear(segments, context, "a", "b", true);
    expect(change?.groups?.[0].members).toEqual(["b", "x", "a"]);
  });
});

describe("joinGroup and moveTabToEnd", () => {
  it("joins a group at its start or end", () => {
    const g = group("g1", ["b", "c"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    expect(
      joinGroup(segments, context, "a", "g1", "start")?.groups?.[0].members
    ).toEqual(["a", "b", "c"]);
    expect(
      joinGroup(segments, context, "a", "g1", "end")?.groups?.[0].members
    ).toEqual(["b", "c", "a"]);
  });

  it("never lets a pinned tab join a group", () => {
    const g = group("g1", ["b"]);
    const { segments, context } = strip(["p", "b"], [g], ["p"]);
    expect(joinGroup(segments, context, "p", "g1")).toBeUndefined();
  });

  it("moves a grouped tab out to the end of the strip", () => {
    const g = group("g1", ["a", "b"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    const change = moveTabToEnd(segments, context, "a");
    expect(change?.visible).toEqual(["b", "c", "a"]);
    expect(change?.groups?.[0].members).toEqual(["b"]);
  });
});

describe("moveGroupNear", () => {
  it("moves a whole group beside a loose tab", () => {
    const g = group("g1", ["a", "b"]);
    const { segments } = strip(["a", "b", "c"], [g]);
    expect(moveGroupNear(segments, "g1", "tab:c", true)?.visible).toEqual([
      "c",
      "a",
      "b",
    ]);
  });

  it("changes nothing when the group is already there", () => {
    const g = group("g1", ["a", "b"]);
    const { segments } = strip(["a", "b", "c"], [g]);
    expect(moveGroupNear(segments, "g1", "tab:c", false)).toBeUndefined();
  });
});

describe("planKeyboardMove", () => {
  it("steps a loose tab over a whole group", () => {
    const g = group("g1", ["b", "c"]);
    const { segments, context } = strip(["a", "b", "c", "d"], [g]);
    expect(planKeyboardMove(segments, context, "a", true)?.visible).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("moves among the members of a group and out past its end", () => {
    const g = group("g1", ["a", "b"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    const inside = planKeyboardMove(segments, context, "a", true);
    expect(inside?.groups?.[0].members).toEqual(["b", "a"]);
    const out = planKeyboardMove(segments, context, "b", true);
    expect(out?.kind).toBe("leave");
    expect(out?.visible).toEqual(["a", "b", "c"]);
    expect(out?.groups?.[0].members).toEqual(["a"]);
    const outBack = planKeyboardMove(segments, context, "a", false);
    expect(outBack?.visible).toEqual(["a", "b", "c"]);
    expect(outBack?.groups?.[0].members).toEqual(["b"]);
  });

  it("does nothing at the ends of the strip", () => {
    const { segments, context } = strip(["a", "b"]);
    expect(planKeyboardMove(segments, context, "a", false)).toBeUndefined();
    expect(planKeyboardMove(segments, context, "b", true)).toBeUndefined();
  });

  it("moves a pinned tab only inside the pinned region", () => {
    const { segments, context } = strip(["p", "q", "a"], [], ["p", "q"]);
    expect(planKeyboardMove(segments, context, "q", true)).toBeUndefined();
    expect(planKeyboardMove(segments, context, "p", true)?.pinned).toEqual([
      "q",
      "p",
    ]);
  });
});

describe("groupStepTarget", () => {
  const g1 = group("g1", ["b"]);
  const g2 = group("g2", ["d"]);

  it("finds the next and previous group in strip order", () => {
    const { segments } = strip(["a", "b", "c", "d", "e"], [g1, g2]);
    expect(groupStepTarget(segments, "a", true)).toEqual({ groupId: "g1" });
    expect(groupStepTarget(segments, "e", false)).toEqual({ groupId: "g2" });
    expect(groupStepTarget(segments, "b", true)).toEqual({ groupId: "g2" });
  });

  it("leaves the group when there is no further group", () => {
    const { segments } = strip(["a", "b", "c", "d"], [g1, g2]);
    expect(groupStepTarget(segments, "d", true)).toEqual({ groupId: null });
    expect(groupStepTarget(segments, "b", false)).toEqual({ groupId: null });
  });

  it("has no target for a loose tab with no group that way, or a pinned tab", () => {
    const { segments } = strip(["p", "a", "b"], [g1], ["p"]);
    expect(groupStepTarget(segments, "p", true)).toBeUndefined();
    expect(groupStepTarget(segments, "a", false)).toBeUndefined();
  });

  it("leaveGroup puts the tab on the chosen side of its group", () => {
    const g = group("g1", ["a", "b"]);
    const { segments, context } = strip(["a", "b", "c"], [g]);
    expect(leaveGroup(segments, context, "a", false)?.visible).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(leaveGroup(segments, context, "b", true)?.visible).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("applyChange", () => {
  it("keeps closed tabs in their saved slots", () => {
    const { segments, context } = strip(["a", "b"], [], [], ["a", "x", "b"]);
    const change = moveTabNear(segments, context, "a", "b", true)!;
    const result = applyChange({
      fullOrder: ["a", "x", "b"],
      visibleBefore: flattenSegments(segments),
      change,
    });
    expect(result.order).toEqual(["b", "x", "a"]);
  });

  it("gives the same layout after saving and loading again", () => {
    const g = group("g1", ["b", "c"]);
    const first = strip(["a", "b", "c", "d"], [g]);
    const change = moveTabNear(first.segments, first.context, "a", "c", false)!;
    const result = applyChange({
      fullOrder: ["a", "b", "c", "d"],
      visibleBefore: flattenSegments(first.segments),
      change,
    });
    const after = layoutStrip({
      visible: ["a", "b", "c", "d"],
      order: result.order,
      pinned: [],
      groups: result.groups ?? [g],
    });
    expect(flattenSegments(after)).toEqual(change.visible);
  });
});
