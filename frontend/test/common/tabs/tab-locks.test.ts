import { describe, expect, it } from "vitest";
import {
  emptyLockStore,
  normalizeLockStore,
  withLock,
} from "../../../src/common/locks/element-locks";
import { createGroup } from "../../../src/common/tabs/tab-groups";
import {
  groupLockKey,
  isGroupLocked,
  isTabLocked,
  lockedTabIds,
  staleLockKeys,
  tabLockKey,
  tabLockState,
} from "../../../src/common/tabs/tab-locks";

// A tab lock is an ordinary lock record under a stable key. These protect the
// keys and the rule that a group lock locks its tabs.

describe("tab locks", () => {
  const groups = createGroup([], { members: ["a", "b"] }).groups;

  it("builds stable keys", () => {
    expect(tabLockKey("main", "light")).toBe("tab:main:light");
    expect(tabLockKey(undefined, "light")).toBe("tab:main:light");
    expect(groupLockKey("main", "g1")).toBe("tabgroup:main:g1");
  });

  it("locks a tab by its own key", () => {
    const store = withLock(emptyLockStore(), tabLockKey("main", "a"), true);
    expect(tabLockState(store, "main", "a", groups)).toEqual({
      locked: true,
      reasons: ["tab"],
    });
    expect(isTabLocked(store, "main", "b", groups)).toBe(false);
    expect(isTabLocked(store, "other", "a", groups)).toBe(false);
  });

  it("a group lock locks its members", () => {
    const store = withLock(emptyLockStore(), groupLockKey("main", "g1"), true);
    expect(isGroupLocked(store, "main", "g1")).toBe(true);
    expect(lockedTabIds(store, "main", ["a", "b", "c"], groups)).toEqual([
      "a",
      "b",
    ]);
    const both = withLock(store, tabLockKey("main", "a"), true);
    expect(tabLockState(both, "main", "a", groups).reasons).toEqual([
      "tab",
      "group",
    ]);
  });

  it("survives the lock store's own validation", () => {
    const store = withLock(emptyLockStore(), tabLockKey("main", "a"), true);
    expect(
      normalizeLockStore(JSON.parse(JSON.stringify(store))).locked
    ).toEqual(["tab:main:a"]);
  });

  it("lists the keys of tabs and groups that are gone", () => {
    let store = withLock(emptyLockStore(), tabLockKey("main", "a"), true);
    store = withLock(store, groupLockKey("main", "g1"), true);
    store = withLock(store, tabLockKey("main", "z"), true);
    expect(
      staleLockKeys(store, "main", { tabIds: ["a"], groupIds: ["g1"] })
    ).toEqual(["tab:main:a", "tabgroup:main:g1"]);
  });
});
