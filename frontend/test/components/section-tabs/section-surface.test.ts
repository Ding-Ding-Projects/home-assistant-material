import { describe, expect, it } from "vitest";
import type { TabGroup } from "../../../src/common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../../src/common/tabs/tab-locks";
import {
  dropSectionTab,
  hideSections,
  moveSectionGroup,
  moveSectionTab,
  planSectionGroupHide,
  planSectionHide,
  restoreSections,
  sectionLayout,
  sectionMenuState,
  sectionMovesAvailable,
  sectionSurface,
} from "../../../src/components/section-tabs/section-surface";
import type { SectionTabsState } from "../../../src/components/section-tabs/section-tabs-model";

// What these protect: a settings surface must never be confused with the wide
// strip in the shared stores, groups must keep the pinned region whole and
// keep a move inside the group, and hiding many sections must never hide the
// open, pinned or locked ones nor act on an empty or unusable text.

const paths = ["a", "b", "c", "d", "e"];
const labels = {
  a: "Alpha",
  b: "Bravo",
  c: "Charlie",
  d: "Delta",
  e: "Echo",
};
const empty: SectionTabsState = { order: [], pinned: [], hidden: [] };

const group = (id: string, members: string[], collapsed = false): TabGroup => ({
  id,
  name: id.toUpperCase(),
  colour: "blue",
  collapsed,
  members,
});

describe("sectionSurface", () => {
  it("names a surface after its route and never as the wide strip", () => {
    expect(sectionSurface("/config/devices")).toBe("section:/config/devices");
    expect(sectionSurface("")).toBe("section:root");
    expect(sectionSurface(undefined)).toBe("section:root");
    expect(sectionSurface("main")).not.toBe("main");
  });

  it("keeps a long route within the limit and different from another", () => {
    const one = sectionSurface(`/config/${"x".repeat(200)}1`);
    const two = sectionSurface(`/config/${"x".repeat(200)}2`);
    expect(one.length).toBeLessThanOrEqual(80);
    expect(two.length).toBeLessThanOrEqual(80);
    expect(one).not.toBe(two);
    expect(one.startsWith("section:/config/")).toBe(true);
  });
});

describe("sectionLayout", () => {
  it("lists a group at the place of its first member, pinned first", () => {
    const layout = sectionLayout({
      paths,
      state: { ...empty, pinned: ["e"], order: ["e", "a", "b", "c", "d"] },
      groups: [group("g1", ["b", "c"])],
      activePath: "a",
    });
    expect(layout.segments.map((segment) => segment.kind)).toEqual([
      "pinned",
      "tab",
      "group",
      "tab",
    ]);
    expect(layout.all).toEqual(["e", "a", "b", "c", "d"]);
    expect(layout.hasGroups).toBe(true);
  });

  it("never puts a pinned section into a group", () => {
    const layout = sectionLayout({
      paths,
      state: { ...empty, pinned: ["b"], order: ["b", "a", "c", "d", "e"] },
      groups: [group("g1", ["b", "c"])],
    });
    const grouped = layout.segments.find((s) => s.kind === "group");
    expect(grouped && "ids" in grouped ? grouped.ids : []).toEqual(["c"]);
    expect(layout.pinned).toEqual(["b"]);
  });

  it("keeps hidden sections out of the row but in the full order", () => {
    const layout = sectionLayout({
      paths,
      state: { ...empty, hidden: ["b"] },
      groups: [group("g1", ["b", "c"])],
      activePath: "a",
    });
    expect(layout.shown).toEqual(["a", "c", "d", "e"]);
    expect(layout.all).toContain("b");
  });
});

describe("moves with groups", () => {
  const groups = [group("g1", ["b", "c"])];

  it("moves a section among its group members and past the edge out of the group", () => {
    const inside = moveSectionTab({
      paths,
      state: empty,
      groups,
      tabId: "b",
      kind: "later",
    });
    expect(inside.moved).toBe(true);
    expect(inside.groups[0].members).toEqual(["c", "b"]);
    const out = moveSectionTab({
      paths,
      state: empty,
      groups,
      tabId: "c",
      kind: "later",
    });
    expect(out.moved).toBe(true);
    // Past the last member it leaves the group.
    expect(out.groups[0].members).toEqual(["b"]);
  });

  it("keeps Move to start and end inside the group", () => {
    const result = moveSectionTab({
      paths,
      state: empty,
      groups,
      tabId: "c",
      kind: "start",
    });
    expect(result.groups[0].members).toEqual(["c", "b"]);
  });

  it("uses the plain move when there is no group", () => {
    const result = moveSectionTab({
      paths,
      state: empty,
      groups: [],
      tabId: "b",
      kind: "earlier",
    });
    expect(result.moved).toBe(true);
    expect(result.state.order.slice(0, 2)).toEqual(["b", "a"]);
    expect(result.position).toBe(1);
    expect(result.total).toBe(5);
  });

  it("refuses to cross the pinned edge", () => {
    const state = { ...empty, pinned: ["a"], order: paths };
    const result = moveSectionTab({
      paths,
      state,
      groups,
      tabId: "d",
      kind: "earlier",
    });
    expect(result.moved).toBe(true);
    const across = moveSectionTab({
      paths,
      state,
      groups: [],
      tabId: "b",
      kind: "earlier",
    });
    expect(across.moved).toBe(false);
    expect(across.blocked).toBe(true);
  });

  it("says which of the four moves would change something", () => {
    expect(
      sectionMovesAvailable({ paths, state: empty, groups, tabId: "a" })
    ).toEqual({ earlier: false, later: true, start: false, end: true });
  });

  it("joins a group when a section is dropped beside one of its members", () => {
    const result = dropSectionTab({
      paths,
      state: empty,
      groups,
      from: "d",
      to: "b",
      after: true,
    });
    expect(result.moved).toBe(true);
    expect(result.groups[0].members).toEqual(["b", "d", "c"]);
  });

  it("refuses a drop across the pinned edge", () => {
    const result = dropSectionTab({
      paths,
      state: { ...empty, pinned: ["a"], order: paths },
      groups,
      from: "d",
      to: "a",
      after: true,
    });
    expect(result.moved).toBe(false);
    expect(result.blocked).toBe(true);
  });

  it("moves a whole group", () => {
    const next = moveSectionGroup({
      paths,
      state: empty,
      groups: [group("g1", ["a", "b"])],
      groupId: "g1",
      move: "end",
    });
    expect(next?.order).toEqual(["c", "d", "e", "a", "b"]);
    expect(
      moveSectionGroup({
        paths,
        state: empty,
        groups: [group("g1", ["a", "b"])],
        groupId: "g1",
        move: "start",
      })
    ).toBeUndefined();
  });
});

describe("hiding many sections", () => {
  const input = (
    over: Partial<Parameters<typeof planSectionHide>[0]> = {}
  ) => ({
    paths,
    labels,
    state: empty,
    groups: [] as TabGroup[],
    activePath: "a",
    locks: { locked: [] as string[] },
    surface: "section:/config/x",
    ...over,
  });

  it("hides what contains the text and protects the open, pinned and locked ones", () => {
    const plan = planSectionHide(
      input({
        state: { ...empty, pinned: ["c"], order: ["c", "a", "b", "d", "e"] },
        locks: { locked: [tabLockKey("section:/config/x", "d")] },
      }),
      "containing",
      "l"
    );
    // Alpha (open), Charlie (pinned) and Delta (locked) hold an "l"; none of
    // the others does, so nothing hides.
    expect(plan.ids).toEqual([]);
    expect(plan.protected.map((item) => item.id).sort()).toEqual([
      "a",
      "c",
      "d",
    ]);
    expect(plan.matchMode).toBe("text");
  });

  it("matches the visible label only, never the address", () => {
    const plan = planSectionHide(
      input({ activePath: "e" }),
      "containing",
      "alpha"
    );
    expect(plan.ids).toEqual(["a"]);
    const byAddress = planSectionHide(
      input({
        activePath: "e",
        labels: { ...labels, a: "Other" },
      }),
      "containing",
      "alpha"
    );
    expect(byAddress.ids).toEqual([]);
  });

  it("hides nothing for an empty text or an unusable pattern", () => {
    expect(planSectionHide(input(), "not_containing", "  ").blocked).toBe(
      "empty"
    );
    const invalid = planSectionHide(input(), "containing", "/(/");
    expect(invalid.blocked).toBe("invalid");
    expect(invalid.ids).toEqual([]);
  });

  it("reads a pattern in the text", () => {
    const plan = planSectionHide(
      input({ activePath: "e" }),
      "containing",
      "/^(alpha|bravo)$/i"
    );
    expect(plan.ids).toEqual(["a", "b"]);
    expect(plan.matchMode).toBe("pattern");
  });

  it("plans the sections before or after one, keeping that one", () => {
    const plan = planSectionHide(input({ activePath: "a" }), "to_end", "", "c");
    expect(plan.ids).toEqual(["d", "e"]);
    expect(plan.protected.map((item) => item.id)).toEqual(["c"]);
  });

  it("plans the sections of one group, keeping the open and the locked", () => {
    const plan = planSectionGroupHide(
      input({
        groups: [group("g1", ["a", "b", "c"])],
        locks: { locked: [tabLockKey("section:/config/x", "c")] },
      }),
      "g1"
    );
    expect(plan.ids).toEqual(["b"]);
    expect(plan.protected.map((item) => item.id).sort()).toEqual(["a", "c"]);
  });

  it("counts a section locked through its group as locked", () => {
    const plan = planSectionHide(
      input({
        activePath: "e",
        groups: [group("g1", ["a", "b"])],
        locks: { locked: [groupLockKey("section:/config/x", "g1")] },
      }),
      "containing",
      "alpha"
    );
    expect(plan.ids).toEqual([]);
    expect(plan.protected[0]).toEqual({ id: "a", reasons: ["locked"] });
  });

  it("hides, never the open one, and restores for Undo", () => {
    const hidden = hideSections(empty, ["a", "b", "c"], "a");
    expect(hidden.hidden).toEqual(["b", "c"]);
    expect(hidden.state.hidden).toEqual(["b", "c"]);
    expect(restoreSections(hidden.state, ["b"]).hidden).toEqual(["c"]);
    expect(hideSections(hidden.state, ["b"], "a").hidden).toEqual([]);
  });
});

describe("sectionMenuState", () => {
  it("reads hidden sections as closed tabs and carries lock and look", () => {
    const state = sectionMenuState({
      surface: "section:/config/x",
      paths,
      labels,
      state: {
        ...empty,
        hidden: ["b"],
        pinned: ["c"],
        order: ["c", "a", "b", "d", "e"],
      },
      groups: [group("g1", ["d", "e"])],
      activePath: "a",
      locks: { locked: [groupLockKey("section:/config/x", "g1")] },
      appearance: { "section:/config/x": { a: { label: "First" } } },
    });
    expect(state.closed).toEqual(["b"]);
    expect(state.open).toEqual(["c", "a", "d", "e"]);
    expect(state.pinned).toEqual(["c"]);
    expect(state.labels.a).toBe("First");
    expect(state.locks.d).toEqual({ locked: true, byGroup: true });
    expect(state.locks.a.locked).toBe(false);
    expect(state.planTabs.find((tab) => tab.id === "a")?.current).toBe(true);
  });
});
