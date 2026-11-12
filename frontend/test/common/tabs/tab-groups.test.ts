import { describe, expect, it } from "vitest";
import {
  createGroup,
  groupOf,
  isHiddenByCollapse,
  layoutStrip,
  moveTabToGroup,
  normalizeGroups,
  normalizeGroupStore,
  recolourGroup,
  removeGroup,
  renameGroup,
  reorderSegments,
  segmentKey,
  setGroupCollapsed,
  toggleGroupCollapsed,
  ungroupTabs,
} from "../../../src/common/tabs/tab-groups";

// Groups must survive a restart exactly, never split the pinned region and
// keep every tab in at most one group.

describe("group editing", () => {
  it("creates, renames and recolours", () => {
    const { groups, id } = createGroup([], {
      name: " Home ",
      members: ["a", "b"],
    });
    expect(id).toBe("g1");
    expect(groups).toEqual([
      {
        id: "g1",
        name: "Home",
        colour: "blue",
        collapsed: false,
        members: ["a", "b"],
      },
    ]);
    const renamed = renameGroup(groups, id, "Rooms");
    expect(renamed[0].name).toBe("Rooms");
    expect(renameGroup(groups, id, "   ")[0].name).toBe("Home");
    expect(recolourGroup(groups, id, "#ABC")[0].colour).toBe("#abc");
    expect(recolourGroup(groups, id, "red;x")[0].colour).toBe("blue");
  });

  it("never reuses an id and takes tabs from earlier groups", () => {
    const first = createGroup([], { members: ["a", "b"] });
    const second = createGroup(first.groups, { members: ["b"] });
    expect(second.id).toBe("g2");
    expect(second.groups[0].members).toEqual(["a"]);
    const third = createGroup(removeGroup(second.groups, "g1"), {});
    expect(third.id).toBe("g3");
    expect(new Set(third.groups.map((g) => g.id)).size).toBe(
      third.groups.length
    );
  });

  it("refuses pinned tabs as members", () => {
    const { groups } = createGroup([], { members: ["a", "p"] }, ["p"]);
    expect(groups[0].members).toEqual(["a"]);
    expect(moveTabToGroup(groups, "p", "g1", { pinned: ["p"] })).toEqual(
      groups
    );
  });

  it("collapses and expands", () => {
    const { groups } = createGroup([], { members: ["a"] });
    const collapsed = setGroupCollapsed(groups, "g1", true);
    expect(isHiddenByCollapse(collapsed, "a")).toBe(true);
    expect(toggleGroupCollapsed(collapsed, "g1")[0].collapsed).toBe(false);
    expect(isHiddenByCollapse(collapsed, "other")).toBe(false);
  });

  it("moves into, between and out of groups", () => {
    let groups = createGroup([], { members: ["a", "b"] }).groups;
    groups = createGroup(groups, { members: ["c"] }).groups;
    groups = moveTabToGroup(groups, "a", "g2", { index: 0 });
    expect(groups[0].members).toEqual(["b"]);
    expect(groups[1].members).toEqual(["a", "c"]);
    groups = moveTabToGroup(groups, "a", null);
    expect(groupOf(groups, "a")).toBeUndefined();
    // An unknown group changes nothing.
    expect(moveTabToGroup(groups, "b", "nope")).toEqual(groups);
  });

  it("removing a group keeps its tabs ungrouped", () => {
    const { groups } = createGroup([], { members: ["a"] });
    expect(removeGroup(groups, "g1")).toEqual([]);
    expect(ungroupTabs(groups, ["a"])[0].members).toEqual([]);
  });
});

describe("restoring groups", () => {
  it("round-trips through JSON", () => {
    let groups = createGroup([], {
      name: "A",
      colour: "red",
      members: ["x", "y"],
    }).groups;
    groups = setGroupCollapsed(groups, "g1", true);
    expect(normalizeGroups(JSON.parse(JSON.stringify(groups)))).toEqual(groups);
  });

  it("validates hostile data", () => {
    const raw = JSON.parse(
      JSON.stringify([
        {
          id: "g1",
          name: 5,
          colour: "expression(1)",
          members: ["a", "a", 3],
          extra: 1,
        },
        { id: "g1", members: ["z"] },
        { id: "__proto__", members: [] },
        { id: "g2", members: ["a", "b"] },
        "text",
      ])
    );
    expect(normalizeGroups(raw)).toEqual([
      { id: "g1", name: "", colour: "blue", collapsed: false, members: ["a"] },
      { id: "g2", name: "", colour: "blue", collapsed: false, members: ["b"] },
    ]);
    const store = JSON.parse(
      JSON.stringify({ main: raw, empty: [] }).replace(
        "{",
        `{"__proto__":${JSON.stringify(raw)},`
      )
    );
    expect(normalizeGroupStore(store)).toEqual({ main: normalizeGroups(raw) });
  });
});

describe("layoutStrip", () => {
  const groups = createGroup([], { name: "G", members: ["c", "e"] }).groups;
  const base = {
    visible: ["a", "b", "c", "d", "e", "p"],
    order: [],
    pinned: ["p"],
    groups,
  };

  it("lists the pinned region, then tabs and groups in page order", () => {
    const keys = layoutStrip(base).map(segmentKey);
    expect(keys).toEqual(["pinned", "tab:a", "tab:b", "group:g1", "tab:d"]);
  });

  it("places a group where its first member sits", () => {
    const keys = layoutStrip({ ...base, order: ["e", "a", "b", "c", "d"] }).map(
      segmentKey
    );
    expect(keys).toEqual(["pinned", "group:g1", "tab:a", "tab:b", "tab:d"]);
  });

  it("lists only visible members and skips a group with none", () => {
    const segments = layoutStrip({ ...base, visible: ["a", "c", "p"] });
    const group = segments.find((s) => s.kind === "group");
    expect(group && group.kind === "group" ? group.ids : []).toEqual(["c"]);
    expect(layoutStrip({ ...base, visible: ["a"] }).map(segmentKey)).toEqual([
      "tab:a",
    ]);
  });

  it("never puts a pinned tab in a group, even from stale data", () => {
    const stale = [{ ...groups[0], members: ["p", "c"] }];
    const segments = layoutStrip({ ...base, groups: stale });
    expect(segments[0]).toEqual({ kind: "pinned", ids: ["p"] });
    const group = segments.find((s) => s.kind === "group");
    expect(group && group.kind === "group" ? group.ids : []).toEqual(["c"]);
  });

  it("keeps collapsed members listed so a search can reveal them", () => {
    const collapsed = setGroupCollapsed(groups, "g1", true);
    const group = layoutStrip({ ...base, groups: collapsed }).find(
      (s) => s.kind === "group"
    );
    expect(group && group.kind === "group" ? group.ids : []).toEqual([
      "c",
      "e",
    ]);
    // Laying out does not change the saved preference.
    expect(collapsed[0].collapsed).toBe(true);
  });
});

describe("reorderSegments", () => {
  const groups = createGroup([], { members: ["c", "e"] }).groups;
  const segments = layoutStrip({
    visible: ["a", "b", "c", "d", "e", "p"],
    order: [],
    pinned: ["p"],
    groups,
  });

  it("moves a whole group and the result lays out the same after a restart", () => {
    const order = reorderSegments(segments, "group:g1", "tab:a", false);
    expect(order).toEqual(["p", "c", "e", "a", "b", "d"]);
    const again = layoutStrip({
      visible: ["a", "b", "c", "d", "e", "p"],
      order,
      pinned: ["p"],
      groups,
    });
    expect(again.map(segmentKey)).toEqual([
      "pinned",
      "group:g1",
      "tab:a",
      "tab:b",
      "tab:d",
    ]);
  });

  it("moves a tab after another and ignores unknown or pinned keys", () => {
    expect(reorderSegments(segments, "tab:a", "tab:b", true)).toEqual([
      "p",
      "b",
      "a",
      "c",
      "e",
      "d",
    ]);
    expect(reorderSegments(segments, "pinned", "tab:a", false)).toEqual([
      "p",
      "a",
      "b",
      "c",
      "e",
      "d",
    ]);
    expect(reorderSegments(segments, "tab:zzz", "tab:a", false)).toEqual([
      "p",
      "a",
      "b",
      "c",
      "e",
      "d",
    ]);
  });
});
