import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  emptyLockStore,
  withLock,
  writeLocks,
} from "../../../src/common/locks/element-locks";
import {
  planEdgeClose,
  planTextClose,
  reportClose,
} from "../../../src/common/tabs/tab-close-plans";
import {
  createGroup,
  readGroups,
  writeGroups,
} from "../../../src/common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../../src/common/tabs/tab-locks";
import {
  closeTabsAction,
  moveAction,
  openEveryAction,
  readMenuState,
  removeFromGroupAction,
  togglePinAction,
  undoCloseAction,
  unlockKeyFor,
} from "../../../src/components/tabs/tab-menu-actions";
import type { PageTab } from "../../../src/components/tabs/tab-types";

// Each action must write exactly what the model expects, because the strip
// redraws from those stored lists and nothing else.

const KEYS = [
  "pageTabsClosed",
  "pageTabsOrder",
  "pageTabsPinned",
  "pageTabsGroups",
  "pageTabsAppearance",
  "elementLocks",
];

const tabs: PageTab[] = [
  { urlPath: "a", title: "Alpha" },
  { urlPath: "b", title: "Bravo" },
  { urlPath: "c", title: "Charlie" },
  { urlPath: "d", title: "Delta" },
];

const stored = (key: string) => getStorage().getValue(key);

describe("tab menu actions", () => {
  beforeEach(() =>
    KEYS.forEach((key) => getStorage().setValue(key, undefined))
  );

  it("reads the strip in saved order with each tab's state", () => {
    getStorage().setValue("pageTabsOrder", ["d", "a"]);
    getStorage().setValue("pageTabsPinned", ["c"]);
    getStorage().setValue("pageTabsClosed", ["b"]);
    const state = readMenuState("main", tabs, "a");
    expect(state.ordered).toEqual(["c", "d", "a", "b"]);
    expect(state.open).toEqual(["c", "d", "a"]);
    expect(state.planTabs.find((tab) => tab.id === "a")).toMatchObject({
      label: "Alpha",
      open: true,
      current: true,
      pinned: false,
      locked: false,
    });
    expect(state.planTabs.find((tab) => tab.id === "c")?.pinned).toBe(true);
    expect(state.planTabs.find((tab) => tab.id === "b")?.open).toBe(false);
  });

  it("pins a tab where it is, saving the shown order first", () => {
    getStorage().setValue("pageTabsOrder", ["d"]);
    const state = readMenuState("main", tabs);
    expect(togglePinAction(state, "b")).toEqual({ pinned: true });
    expect(stored("pageTabsPinned")).toEqual(["b"]);
    expect(stored("pageTabsOrder")).toEqual(["d", "a", "b", "c"]);
    expect(togglePinAction(readMenuState("main", tabs), "b")).toEqual({
      pinned: false,
    });
    expect(stored("pageTabsPinned")).toEqual([]);
  });

  it("takes a grouped tab out of its group when it is pinned", () => {
    writeGroups("main", createGroup([], { members: ["a", "b"] }).groups);
    togglePinAction(readMenuState("main", tabs), "b");
    expect(readGroups("main")[0].members).toEqual(["a"]);
    expect(stored("pageTabsPinned")).toEqual(["b"]);
  });

  it("closes tabs and undoes exactly those", () => {
    getStorage().setValue("pageTabsClosed", ["d"]);
    const state = readMenuState("main", tabs);
    closeTabsAction(state, ["a", "b"]);
    expect(stored("pageTabsClosed")).toEqual(["d", "a", "b"]);
    undoCloseAction(["a", "b"]);
    expect(stored("pageTabsClosed")).toEqual(["d"]);
  });

  it("opens every tab without touching the other lists", () => {
    getStorage().setValue("pageTabsClosed", ["a", "gone"]);
    getStorage().setValue("pageTabsPinned", ["b"]);
    getStorage().setValue("pageTabsOrder", ["c"]);
    const result = openEveryAction(readMenuState("main", tabs));
    expect(result.reopened).toEqual(["a"]);
    expect(stored("pageTabsClosed")).toEqual(["gone"]);
    expect(stored("pageTabsPinned")).toEqual(["b"]);
    expect(stored("pageTabsOrder")).toEqual(["c"]);
  });

  it("moves a tab among the open tabs and keeps closed tabs in place", () => {
    getStorage().setValue("pageTabsOrder", ["a", "b", "c", "d"]);
    getStorage().setValue("pageTabsClosed", ["b"]);
    const state = readMenuState("main", tabs);
    expect(moveAction(state, "c", "earlier")).toEqual({
      position: 1,
      total: 3,
    });
    expect(stored("pageTabsOrder")).toEqual(["c", "b", "a", "d"]);
  });

  it("moves a pinned tab in the pinned list, which the strip reads", () => {
    getStorage().setValue("pageTabsPinned", ["a", "b"]);
    const state = readMenuState("main", tabs);
    expect(state.ordered.slice(0, 2)).toEqual(["a", "b"]);
    expect(moveAction(state, "b", "earlier")).toEqual({
      position: 1,
      total: 4,
    });
    expect(stored("pageTabsPinned")).toEqual(["b", "a"]);
    expect(readMenuState("main", tabs).ordered.slice(0, 2)).toEqual(["b", "a"]);
    // Move to the end of the pinned region goes through the same list.
    expect(moveAction(readMenuState("main", tabs), "b", "end")).toBeDefined();
    expect(stored("pageTabsPinned")).toEqual(["a", "b"]);
  });

  it("steps a tab over a whole group, as the strip does", () => {
    getStorage().setValue("pageTabsOrder", ["a", "b", "c", "d"]);
    writeGroups("main", createGroup([], { members: ["b", "c"] }).groups);
    const state = readMenuState("main", tabs);
    expect(state.ordered).toEqual(["a", "b", "c", "d"]);
    expect(moveAction(state, "d", "earlier")).toBeDefined();
    // One step takes `d` past the whole group, not past one member of it.
    const after = readMenuState("main", tabs);
    expect(after.ordered).toEqual(["a", "d", "b", "c"]);
    expect(readGroups("main")[0].members).toEqual(["b", "c"]);
  });

  it("names a tab by its visible label, the one the person gave it", () => {
    getStorage().setValue("pageTabsAppearance", {
      main: { a: { label: "Home base" } },
    });
    const state = readMenuState("main", tabs);
    expect(state.labels.a).toBe("Home base");
    expect(state.planTabs.find((tab) => tab.id === "a")?.label).toBe(
      "Home base"
    );
  });

  it("refuses a move that would leave the pinned region", () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    getStorage().setValue("pageTabsOrder", ["a", "b", "c", "d"]);
    const state = readMenuState("main", tabs);
    expect(moveAction(state, "b", "earlier")).toBeUndefined();
    expect(moveAction(state, "b", "start")).toBeUndefined();
    expect(stored("pageTabsOrder")).toEqual(["a", "b", "c", "d"]);
  });

  it("removes a tab from its group", () => {
    writeGroups("main", createGroup([], { members: ["a", "b"] }).groups);
    removeFromGroupAction(readMenuState("main", tabs), "a");
    expect(readGroups("main")[0].members).toEqual(["b"]);
  });

  it("finds the key to unlock: the tab's own, or its group's", () => {
    const { groups, id } = createGroup([], { members: ["b"] });
    writeGroups("main", groups);
    writeLocks(withLock(emptyLockStore(), tabLockKey("main", "a"), true));
    expect(unlockKeyFor(readMenuState("main", tabs), "a")).toBe(
      tabLockKey("main", "a")
    );
    expect(unlockKeyFor(readMenuState("main", tabs), "c")).toBeUndefined();
    writeLocks(withLock(emptyLockStore(), groupLockKey("main", id), true));
    const state = readMenuState("main", tabs);
    expect(state.locks.b).toEqual({ locked: true, byGroup: true });
    expect(unlockKeyFor(state, "b")).toBe(groupLockKey("main", id));
  });
});

describe("close previews", () => {
  beforeEach(() =>
    KEYS.forEach((key) => getStorage().setValue(key, undefined))
  );

  it("shows pinned, locked and current tabs as protected", () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    writeLocks(withLock(emptyLockStore(), tabLockKey("main", "b"), true));
    const state = readMenuState("main", tabs, "c");
    const plan = planTextClose(state.planTabs, "a", "containing");
    // Every tab name here contains the letter a.
    expect(plan.ids).toEqual(["d"]);
    expect(plan.protected).toEqual([
      { id: "a", reasons: ["pinned"] },
      { id: "b", reasons: ["locked"] },
      { id: "c", reasons: ["current"] },
    ]);
    expect(plan.matchMode).toBe("text");
  });

  it("includes pinned tabs only when asked, and never the current one", () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    const state = readMenuState("main", tabs, "a");
    const plain = planEdgeClose(state.planTabs, "d", "others");
    expect(plain.ids).toEqual(["b", "c"]);
    expect(plain.protected.map((item) => item.id)).toEqual(["a"]);
    const withPinned = planEdgeClose(state.planTabs, "d", "others", {
      includePinned: true,
    });
    // The page in use stays protected either way.
    expect(withPinned.ids).toEqual(["b", "c"]);
  });

  it("closes nothing for an empty text or an unusable pattern", () => {
    const state = readMenuState("main", tabs);
    expect(planTextClose(state.planTabs, "  ", "containing").blocked).toBe(
      "empty"
    );
    expect(planTextClose(state.planTabs, "/(/", "not_containing").blocked).toBe(
      "invalid"
    );
  });

  it("matches the visible label only", () => {
    const state = readMenuState("main", tabs);
    // The address of the tab is "b", the label is "Bravo".
    expect(planTextClose(state.planTabs, "zzz", "containing").ids).toEqual([]);
    expect(planTextClose(state.planTabs, "Bravo", "containing").ids).toEqual([
      "b",
    ]);
  });

  it("reports the tabs that did not close", () => {
    const state = readMenuState("main", tabs);
    const plan = planEdgeClose(state.planTabs, "a", "to_end");
    closeTabsAction(state, plan.ids);
    const after = readMenuState("main", tabs);
    expect(reportClose(plan, after.open)).toEqual({
      closed: ["b", "c", "d"],
      failed: [],
    });
    expect(reportClose(plan, ["a", "c"]).failed).toEqual(["c"]);
  });
});
