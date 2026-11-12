import { describe, expect, it } from "vitest";
import type { SectionTabsState } from "../../../src/components/section-tabs/section-tabs-model";
import {
  dropSection,
  hiddenSections,
  hideSection,
  moveSection,
  nextTabIndex,
  orderSections,
  planOverflow,
  planSlots,
  readSectionState,
  sectionMoveForKey,
  sectionShortcutForKey,
  sectionTabDomId,
  showEverySection,
  showSection,
  slotsForWidth,
  togglePinned,
  visibleSections,
  writeSectionState,
} from "../../../src/components/section-tabs/section-tabs-model";

const empty = (): SectionTabsState => ({ order: [], pinned: [], hidden: [] });
const paths = ["a", "b", "c", "d"];
const items = paths.map((path) => ({ path }));
const names = (list: { path: string }[]) => list.map((item) => item.path);

describe("saved state per surface", () => {
  it("reads an unknown or malformed surface as empty", () => {
    expect(readSectionState(undefined, "/config")).toEqual(empty());
    expect(readSectionState({ "/config": 5 }, "/config")).toEqual(empty());
    expect(
      readSectionState({ "/config": { order: ["a", 1, "a"] } }, "/config")
    ).toEqual({ order: ["a"], pinned: [], hidden: [] });
  });

  it("keeps each surface apart and drops an emptied one", () => {
    let store = writeSectionState({}, "/one", { ...empty(), pinned: ["a"] });
    store = writeSectionState(store, "/two", { ...empty(), hidden: ["b"] });
    expect(readSectionState(store, "/one").pinned).toEqual(["a"]);
    expect(readSectionState(store, "/two").hidden).toEqual(["b"]);
    store = writeSectionState(store, "/one", empty());
    expect(Object.keys(store)).toEqual(["/two"]);
  });

  it("does not read the prototype as a surface", () => {
    expect(readSectionState({}, "toString")).toEqual(empty());
  });
});

describe("order with pins", () => {
  it("keeps page order when nothing is saved", () => {
    expect(names(orderSections(items, empty()))).toEqual(paths);
  });

  it("puts pinned first and lets a new tab follow the placed ones", () => {
    const state = { order: ["c", "a"], pinned: ["d"], hidden: [] };
    expect(names(orderSections(items, state))).toEqual(["d", "c", "a", "b"]);
  });
});

describe("hide and restore", () => {
  it("never hides the open tab", () => {
    const result = hideSection(empty(), "b", "b");
    expect(result.hidden).toBe(false);
    expect(result.state.hidden).toEqual([]);
  });

  it("hides a tab, keeps the open one in view and restores them all", () => {
    const hidden = hideSection(empty(), "c", "a").state;
    expect(names(visibleSections(items, hidden, "a"))).toEqual(["a", "b", "d"]);
    expect(names(hiddenSections(items, hidden, "a"))).toEqual(["c"]);
    // The page of a hidden tab can still be the open one.
    expect(names(visibleSections(items, hidden, "c"))).toContain("c");
    expect(showEverySection(hidden).hidden).toEqual([]);
    expect(showSection({ ...hidden, hidden: ["c", "d"] }, "c").hidden).toEqual([
      "d",
    ]);
  });
});

describe("pinning", () => {
  it("pins to the end of the pinned region and unpins to the start of the rest", () => {
    let state = togglePinned(paths, empty(), "c");
    expect(state.pinned).toEqual(["c"]);
    expect(names(orderSections(items, state))).toEqual(["c", "a", "b", "d"]);
    state = togglePinned(paths, state, "d");
    expect(names(orderSections(items, state))).toEqual(["c", "d", "a", "b"]);
    state = togglePinned(paths, state, "c");
    expect(state.pinned).toEqual(["d"]);
    expect(names(orderSections(items, state))).toEqual(["d", "c", "a", "b"]);
  });
});

describe("moving", () => {
  it("moves inside the region and steps over hidden neighbours", () => {
    const state = { order: [], pinned: [], hidden: ["b"] };
    const result = moveSection(paths, state, "c", "earlier");
    expect(names(orderSections(items, result.state))).toEqual([
      "c",
      "a",
      "b",
      "d",
    ]);
    expect(result.moved).toBe(true);
  });

  it("sends a tab to the start or end of its region", () => {
    const state = { order: [], pinned: ["d"], hidden: [] };
    expect(
      names(orderSections(items, moveSection(paths, state, "c", "start").state))
    ).toEqual(["d", "c", "a", "b"]);
    expect(
      names(orderSections(items, moveSection(paths, state, "a", "end").state))
    ).toEqual(["d", "b", "c", "a"]);
  });

  it("refuses to cross the pinned boundary and says so", () => {
    const state = { order: [], pinned: ["a"], hidden: [] };
    const up = moveSection(paths, state, "b", "earlier");
    expect(up).toMatchObject({ moved: false, blocked: true });
    const down = moveSection(paths, state, "a", "later");
    expect(down).toMatchObject({ moved: false, blocked: true });
    // The very first and last tab of the whole row simply stay.
    expect(moveSection(paths, state, "a", "earlier")).toMatchObject({
      moved: false,
      blocked: false,
    });
    expect(moveSection(paths, state, "d", "later")).toMatchObject({
      moved: false,
      blocked: false,
    });
  });

  it("drops a tab before or after another", () => {
    const state = empty();
    expect(
      names(
        orderSections(items, dropSection(paths, state, "a", "c", true).state)
      )
    ).toEqual(["b", "c", "a", "d"]);
    expect(
      names(
        orderSections(items, dropSection(paths, state, "d", "b", false).state)
      )
    ).toEqual(["a", "d", "b", "c"]);
    expect(dropSection(paths, state, "a", "a", true).moved).toBe(false);
  });

  it("refuses a drop across the pinned boundary", () => {
    const state = { order: [], pinned: ["a"], hidden: [] };
    expect(dropSection(paths, state, "c", "a", true)).toMatchObject({
      moved: false,
      blocked: true,
    });
  });
});

describe("what overflows", () => {
  const widths = [100, 100, 100, 100, 100];
  const none = widths.map(() => false);

  it("shows everything that fits", () => {
    expect(planOverflow(widths, none, 500, 48)).toEqual(widths.map(() => true));
  });

  it("ends the row at the first tab that does not fit", () => {
    // 260 room minus 48 for the control leaves room for two.
    expect(planOverflow(widths, none, 260, 48)).toEqual([
      true,
      true,
      false,
      false,
      false,
    ]);
  });

  it("keeps the open and pinned tabs in view when others overflow", () => {
    const required = [true, false, false, false, true];
    const plan = planOverflow(widths, required, 260, 48);
    expect(plan[0]).toBe(true);
    expect(plan[4]).toBe(true);
    expect(plan.filter(Boolean)).toHaveLength(2);
  });

  it("counts the gaps and never shows nothing", () => {
    expect(planOverflow([100, 100], none.slice(0, 2), 208, 0, 8)).toEqual([
      true,
      true,
    ]);
    expect(planOverflow([100, 100], none.slice(0, 2), 150, 0, 8)).toEqual([
      true,
      false,
    ]);
    expect(planOverflow([500], [false], 100, 48)).toEqual([true]);
  });

  it("plans the phone bar by slots", () => {
    expect(slotsForWidth(320)).toBe(4);
    expect(slotsForWidth(360)).toBe(5);
    expect(slotsForWidth(100)).toBe(2);
    expect(planSlots([false, false, false, false, false], 5)).toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
    // Five tabs, four slots: three tabs and the "More" entry.
    expect(planSlots([false, false, false, false, true], 4)).toEqual([
      true,
      true,
      false,
      false,
      true,
    ]);
  });
});

describe("keys", () => {
  it("moves focus with arrows, Home and End and follows the direction", () => {
    expect(nextTabIndex("ArrowRight", 0, 3)).toBe(1);
    expect(nextTabIndex("ArrowRight", 2, 3)).toBe(0);
    expect(nextTabIndex("ArrowLeft", 0, 3)).toBe(2);
    expect(nextTabIndex("ArrowRight", 0, 3, true)).toBe(2);
    expect(nextTabIndex("Home", 2, 3)).toBe(0);
    expect(nextTabIndex("End", 0, 3)).toBe(2);
    expect(nextTabIndex("a", 0, 3)).toBeUndefined();
    expect(nextTabIndex("End", 0, 0)).toBeUndefined();
  });

  const key = (extra: object) => ({
    key: "ArrowLeft",
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    ...extra,
  });

  it("reorders with Alt and the arrows, and only with Alt", () => {
    expect(sectionMoveForKey(key({ altKey: true }))).toBe("earlier");
    expect(sectionMoveForKey(key({ altKey: true, key: "ArrowRight" }))).toBe(
      "later"
    );
    expect(sectionMoveForKey(key({ altKey: true, key: "Home" }))).toBe("start");
    expect(sectionMoveForKey(key({ altKey: true, key: "End" }))).toBe("end");
    expect(sectionMoveForKey(key({}))).toBeUndefined();
    expect(sectionMoveForKey(key({ altKey: true, shiftKey: true }))).toBe(
      undefined
    );
  });

  it("pins and hides with Alt and Shift", () => {
    const base = { altKey: true, shiftKey: true, ctrlKey: false };
    expect(sectionShortcutForKey({ ...base, key: "P", code: "KeyP" })).toBe(
      "pin"
    );
    expect(sectionShortcutForKey({ ...base, key: "H", code: "KeyH" })).toBe(
      "hide"
    );
    expect(
      sectionShortcutForKey({ ...base, shiftKey: false, key: "p" })
    ).toBeUndefined();
  });
});

describe("tab ids", () => {
  it("never gives two paths the same id", () => {
    expect(sectionTabDomId("/config/a-b")).not.toBe(
      sectionTabDomId("/config/a/b")
    );
    expect(sectionTabDomId("/config/a")).toMatch(/^section-tab-[\w-]+$/);
  });
});
