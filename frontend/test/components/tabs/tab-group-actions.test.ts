import { beforeEach, describe, expect, it } from "vitest";
import { getStorage } from "../../../src/common/decorators/storage";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../../src/common/locks/element-locks";
import {
  layoutStrip,
  readGroups,
  writeGroups,
} from "../../../src/common/tabs/tab-groups";
import { groupLockKey } from "../../../src/common/tabs/tab-locks";
import {
  closeTabs,
  createGroupWithTabs,
  moveGroup,
  moveTabsToGroup,
  planGroupClose,
  planGroupMove,
  removeGroupKeepingTabs,
  togglePinTab,
} from "../../../src/components/tabs/tab-group-actions";
import {
  readGroupAppearance,
  setGroupAppearance,
  writeGroupAppearance,
} from "../../../src/components/tabs/tab-group-appearance-store";
import type { StripState } from "../../../src/components/tabs/tab-group-state";

// The picker and the group menu change saved state only through these
// functions. They protect the rules a person would otherwise lose a tab or a
// lock to: a pinned tab never joins a group, removing a group keeps its tabs
// open and takes its look and lock with it, closing a group never closes the
// page in use or a locked tab, and a group moves as one block.

const KEYS = [
  "pageTabsGroups",
  "pageTabsPinned",
  "pageTabsOrder",
  "pageTabsClosed",
  "pageTabsGroupAppearance",
  "elementLocks",
];

const group = (id: string, members: string[], collapsed = false) => ({
  id,
  name: id.toUpperCase(),
  colour: "blue" as const,
  collapsed,
  members,
});

beforeEach(() => KEYS.forEach((key) => getStorage().setValue(key, undefined)));

describe("moving tabs into and out of groups", () => {
  it("moves tabs in and out", () => {
    writeGroups("main", [group("g1", []), group("g2", ["z"])]);
    expect(moveTabsToGroup("main", ["a", "b"], "g1")).toEqual({
      moved: ["a", "b"],
      refused: [],
    });
    expect(readGroups("main")[0].members).toEqual(["a", "b"]);
    moveTabsToGroup("main", ["a"], "g2");
    expect(readGroups("main").map((g) => g.members)).toEqual([
      ["b"],
      ["z", "a"],
    ]);
    moveTabsToGroup("main", ["a", "b"], null);
    expect(readGroups("main").map((g) => g.members)).toEqual([[], ["z"]]);
  });

  it("refuses a pinned tab and says which one", () => {
    getStorage().setValue("pageTabsPinned", ["p"]);
    writeGroups("main", [group("g1", [])]);
    const result = moveTabsToGroup("main", ["a", "p"], "g1");
    expect(result).toEqual({ moved: ["a"], refused: ["p"] });
    expect(readGroups("main")[0].members).toEqual(["a"]);
  });

  it("moves nothing into a group that does not exist", () => {
    writeGroups("main", [group("g1", ["a"])]);
    expect(moveTabsToGroup("main", ["a"], "nope")).toEqual({
      moved: [],
      refused: ["a"],
    });
    expect(readGroups("main")[0].members).toEqual(["a"]);
  });

  it("makes a group with the tabs, leaving pinned ones out", () => {
    getStorage().setValue("pageTabsPinned", ["p"]);
    const result = createGroupWithTabs("main", {
      name: "  Home  ",
      colour: "green",
      tabIds: ["a", "p"],
    });
    expect(result).toEqual({ id: "g1", moved: ["a"], refused: ["p"] });
    expect(readGroups("main")).toEqual([
      {
        id: "g1",
        name: "Home",
        colour: "green",
        collapsed: false,
        members: ["a"],
      },
    ]);
  });
});

describe("removing a group", () => {
  it("keeps the tabs open and takes the look and the lock with it", () => {
    writeGroups("main", [group("g1", ["a", "b"]), group("g2", ["c"])]);
    writeGroupAppearance(
      setGroupAppearance(
        setGroupAppearance({}, "main", "g1", "shape", "pill"),
        "main",
        "g2",
        "shape",
        "square"
      )
    );
    writeLocks(withLock(readLocks(), groupLockKey("main", "g1"), true));
    removeGroupKeepingTabs("main", "g1");
    expect(readGroups("main").map((g) => g.id)).toEqual(["g2"]);
    expect(getStorage().getValue("pageTabsClosed")).toBeUndefined();
    expect(readGroupAppearance().main.g1).toBeUndefined();
    expect(readGroupAppearance().main.g2).toBeDefined();
    expect(readLocks().locked).toEqual([]);
  });
});

describe("closing the tabs of a group", () => {
  it("keeps the page in use, locked tabs and closed tabs out of the plan", () => {
    const plan = planGroupClose([
      { id: "a", label: "A", open: true, current: false },
      { id: "b", label: "B", open: true, current: true },
      { id: "c", label: "C", open: true, current: false, locked: true },
      { id: "d", label: "D", open: false, current: false },
    ]);
    expect(plan.ids).toEqual(["a"]);
    expect(plan.protected).toEqual([
      { id: "b", reasons: ["current"] },
      { id: "c", reasons: ["locked"] },
    ]);
  });

  it("saves the closed tabs of the wide strip only", () => {
    getStorage().setValue("pageTabsClosed", ["x"]);
    closeTabs("main", ["a", "x"]);
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["x", "a"]);
    closeTabs("other", ["q"]);
    expect(getStorage().getValue("pageTabsClosed")).toEqual(["x", "a"]);
  });
});

describe("moving a group", () => {
  const strip = (
    groups = [group("g1", ["b", "c"])],
    closed: string[] = []
  ): StripState => {
    const ids = ["a", "b", "c", "d", ...closed];
    return {
      surface: "main",
      tabs: ids.map((id) => ({ id, label: id, open: !closed.includes(id) })),
      openIds: ids.filter((id) => !closed.includes(id)),
      pinned: [],
      closed,
      order: [],
      groups,
    };
  };
  const segments = (state: StripState) =>
    layoutStrip({
      visible: state.openIds,
      order: state.order,
      pinned: state.pinned,
      groups: state.groups,
    });

  it("moves as one block, never splitting its tabs", () => {
    const state = strip();
    expect(planGroupMove(segments(state), "g1", "right")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(planGroupMove(segments(state), "g1", "left")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
    expect(planGroupMove(segments(state), "g1", "end")).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
    expect(planGroupMove(segments(state), "g1", "start")).toEqual([
      "b",
      "c",
      "a",
      "d",
    ]);
  });

  it("left means the screen's left in a right-to-left strip", () => {
    const state = strip();
    expect(planGroupMove(segments(state), "g1", "left", true)).toEqual([
      "a",
      "d",
      "b",
      "c",
    ]);
  });

  it("says nothing moved when the group is already there", () => {
    const state = strip([group("g1", ["a"])]);
    expect(planGroupMove(segments(state), "g1", "left")).toBeUndefined();
    expect(planGroupMove(segments(state), "g1", "start")).toBeUndefined();
    expect(planGroupMove(segments(state), "missing", "right")).toBeUndefined();
  });

  it("saves the order and keeps closed tabs after it", () => {
    const state = strip([group("g1", ["b", "c"])], ["e"]);
    expect(moveGroup(state, "g1", "end")).toBe(true);
    expect(getStorage().getValue("pageTabsOrder")).toEqual([
      "a",
      "d",
      "b",
      "c",
      "e",
    ]);
    expect(moveGroup(strip([group("g1", ["a"])]), "g1", "left")).toBe(false);
  });

  it("leaves a closed tab in its own slot, as a drag on the strip would", () => {
    // `x` is closed and sits between `a` and the group in the saved order.
    getStorage().setValue("pageTabsOrder", ["a", "x", "b", "c", "d"]);
    const ids = ["a", "b", "c", "d", "x"];
    const state: StripState = {
      surface: "main",
      tabs: ids.map((id) => ({ id, label: id, open: id !== "x" })),
      openIds: ["a", "b", "c", "d"],
      pinned: [],
      closed: ["x"],
      order: ["a", "x", "b", "c", "d"],
      groups: [group("g1", ["b", "c"])],
    };
    expect(moveGroup(state, "g1", "end")).toBe(true);
    expect(getStorage().getValue("pageTabsOrder")).toEqual([
      "a",
      "x",
      "d",
      "b",
      "c",
    ]);
  });
});

describe("pinning from a search result", () => {
  const state = (): StripState => ({
    surface: "main",
    tabs: ["a", "b"].map((id) => ({ id, label: id, open: true })),
    openIds: ["a", "b"],
    pinned: [],
    closed: [],
    order: [],
    groups: [group("g1", ["a", "b"])],
  });

  it("takes the tab out of its group when it is pinned", () => {
    expect(togglePinTab(state(), "a")).toBe(true);
    expect(getStorage().getValue("pageTabsPinned")).toEqual(["a"]);
    expect(readGroups("main")).toEqual([]);
    expect(getStorage().getValue("pageTabsOrder")).toEqual(["a", "b"]);
  });

  it("unpins without touching the groups", () => {
    getStorage().setValue("pageTabsPinned", ["a"]);
    writeGroups("main", [group("g1", ["b"])]);
    const pinned = { ...state(), pinned: ["a"] };
    expect(togglePinTab(pinned, "a")).toBe(false);
    expect(getStorage().getValue("pageTabsPinned")).toEqual([]);
    expect(readGroups("main")[0].members).toEqual(["b"]);
  });

  it("changes nothing on a strip that keeps no pin list", () => {
    const other = { ...state(), surface: "side" };
    expect(togglePinTab(other, "a")).toBe(false);
    expect(getStorage().getValue("pageTabsPinned")).toBeUndefined();
  });
});
