import { describe, expect, it } from "vitest";
import type { TabMenuInput } from "../../../src/components/tabs/tab-menu-entries";
import {
  applyOpenOrder,
  moveTarget,
  planMove,
  stripMenuEntries,
  tabMenuEntries,
} from "../../../src/components/tabs/tab-menu-entries";

// The menu is built from this list, so these protect what is offered in each
// state of a tab and the words that follow the direction of the strip.

const input = (change: Partial<TabMenuInput> = {}): TabMenuInput => ({
  tabId: "b",
  openIds: ["a", "b", "c"],
  pinnedIds: [],
  locked: false,
  grouped: false,
  hasClosed: false,
  customised: false,
  dock: "top",
  ...change,
});

const ids = (change?: Partial<TabMenuInput>) =>
  tabMenuEntries(input(change)).map((entry) => entry.id);

const entry = (id: string, change?: Partial<TabMenuInput>) =>
  tabMenuEntries(input(change)).find((item) => item.id === id);

describe("tab menu entries", () => {
  it("lists every entry of an ordinary middle tab in order", () => {
    expect(ids()).toEqual([
      "pin",
      "close",
      "close_others",
      "close_to_start",
      "close_to_end",
      "close_containing",
      "close_not_containing",
      "move_into_group",
      "new_group",
      "move_earlier",
      "move_later",
      "move_start",
      "move_end",
      "edit_appearance",
      "lock",
    ]);
    tabMenuEntries(input()).forEach((item) => expect(item.enabled).toBe(true));
  });

  it("offers Unpin for a pinned tab and keeps it out of groups", () => {
    const pinned = { pinnedIds: ["b"], openIds: ["b", "a", "c"] };
    expect(entry("unpin", pinned)).toBeDefined();
    expect(entry("pin", pinned)).toBeUndefined();
    expect(entry("move_into_group", pinned)?.enabled).toBe(false);
    expect(entry("new_group", pinned)?.enabled).toBe(false);
  });

  it("disables what a first tab cannot do", () => {
    const first = { tabId: "a" };
    expect(entry("close_to_start", first)?.enabled).toBe(false);
    expect(entry("close_to_end", first)?.enabled).toBe(true);
    expect(entry("move_earlier", first)?.enabled).toBe(false);
    expect(entry("move_start", first)?.enabled).toBe(false);
    expect(entry("move_later", first)?.enabled).toBe(true);
    expect(entry("move_end", first)?.enabled).toBe(true);
  });

  it("disables what a last tab cannot do", () => {
    const last = { tabId: "c" };
    expect(entry("close_to_end", last)?.enabled).toBe(false);
    expect(entry("close_to_start", last)?.enabled).toBe(true);
    expect(entry("move_later", last)?.enabled).toBe(false);
    expect(entry("move_end", last)?.enabled).toBe(false);
  });

  it("disables everything that needs another tab when the tab is alone", () => {
    const alone = { openIds: ["b"] };
    expect(entry("close", alone)?.enabled).toBe(true);
    [
      "close_others",
      "close_to_start",
      "close_to_end",
      "move_earlier",
      "move_later",
      "move_start",
      "move_end",
    ].forEach((id) => expect(entry(id, alone)?.enabled).toBe(false));
  });

  it("offers Open every tab only while a tab is closed", () => {
    expect(ids({ hasClosed: false })).not.toContain("open_every");
    expect(ids({ hasClosed: true })).toContain("open_every");
  });

  it("offers Remove from group only for a grouped tab", () => {
    expect(ids({ grouped: false })).not.toContain("remove_from_group");
    expect(ids({ grouped: true })).toContain("remove_from_group");
    expect(
      ids({ grouped: true }).filter((id) => id === "move_into_group")
    ).toHaveLength(1);
  });

  it("says a grouped tab moves to the edge of its group, and trusts the planner", () => {
    expect(entry("move_start", { grouped: true })?.labelKey).toBe(
      "ui.page_tabs.menu.move_to_group_start"
    );
    expect(entry("move_end", { grouped: true })?.labelKey).toBe(
      "ui.page_tabs.menu.move_to_group_end"
    );
    expect(entry("move_start")?.labelKey).toBe(
      "ui.page_tabs.menu.move_to_start"
    );
    // The flat order says the middle tab can go to the start; the planner,
    // which knows the tab is first in its group, says it cannot.
    expect(
      entry("move_start", { grouped: true, moves: { start: false } })?.enabled
    ).toBe(false);
  });

  it("offers Reset tab appearance only for a changed look", () => {
    expect(ids({ customised: false })).not.toContain("reset_appearance");
    expect(ids({ customised: true })).toContain("reset_appearance");
  });

  it("words the close and move entries for the direction of the strip", () => {
    const key = (id: string, change: Partial<TabMenuInput>) =>
      entry(id, change)?.labelKey;
    expect(key("close_to_start", { dock: "top" })).toBe(
      "ui.page_tabs.menu.close_left"
    );
    expect(key("close_to_end", { dock: "bottom" })).toBe(
      "ui.page_tabs.menu.close_right"
    );
    expect(key("close_to_start", { dock: "top", rtl: true })).toBe(
      "ui.page_tabs.menu.close_right"
    );
    expect(key("close_to_start", { dock: "left" })).toBe(
      "ui.page_tabs.menu.close_above"
    );
    expect(key("close_to_end", { dock: "right" })).toBe(
      "ui.page_tabs.menu.close_below"
    );
    expect(key("move_earlier", { dock: "left" })).toBe(
      "ui.page_tabs.menu.move_up"
    );
    expect(key("move_later", { dock: "left" })).toBe(
      "ui.page_tabs.menu.move_down"
    );
    expect(key("move_earlier", { dock: "top" })).toBe(
      "ui.page_tabs.menu.move_left"
    );
    expect(key("move_later", { dock: "top", rtl: true })).toBe(
      "ui.page_tabs.menu.move_left"
    );
  });

  it("offers a locked tab only Unlock and what closes nothing", () => {
    const locked = tabMenuEntries(input({ locked: true }));
    expect(locked.some((item) => item.destructive)).toBe(false);
    expect(locked.map((item) => item.id)).toEqual([
      "pin",
      "move_into_group",
      "new_group",
      "move_earlier",
      "move_later",
      "move_start",
      "move_end",
      "edit_appearance",
      "unlock",
    ]);
    expect(entry("lock", { locked: true })).toBeUndefined();
    expect(entry("unlock", { locked: true })?.labelKey).toBe(
      "ui.page_tabs.menu.unlock_tab"
    );
    expect(
      entry("unlock", { locked: true, lockedByGroup: true })?.labelKey
    ).toBe("ui.page_tabs.menu.unlock_group");
  });

  it("marks only the close entries as destructive", () => {
    const destructive = tabMenuEntries(input())
      .filter((item) => item.destructive)
      .map((item) => item.id);
    expect(destructive).toEqual([
      "close",
      "close_others",
      "close_to_start",
      "close_to_end",
      "close_containing",
      "close_not_containing",
    ]);
  });

  it("never lets a move cross the edge of the pinned region", () => {
    const base = { openIds: ["p", "a", "b"], pinnedIds: ["p"] };
    expect(entry("move_earlier", { ...base, tabId: "a" })?.enabled).toBe(false);
    expect(entry("move_start", { ...base, tabId: "a" })?.enabled).toBe(false);
    expect(entry("move_later", { ...base, tabId: "a" })?.enabled).toBe(true);
    expect(entry("move_later", { ...base, tabId: "p" })?.enabled).toBe(false);
    expect(entry("move_end", { ...base, tabId: "p" })?.enabled).toBe(false);
  });
});

describe("strip menu entries", () => {
  it("lists the four edges and floating with the current one marked", () => {
    (["left", "right", "top", "bottom", "float"] as const).forEach((dock) => {
      const entries = stripMenuEntries({ dock, hasClosed: false });
      const docks = entries.filter((item) => item.id.startsWith("dock_"));
      expect(docks.map((item) => item.id)).toEqual([
        "dock_left",
        "dock_right",
        "dock_top",
        "dock_bottom",
        "dock_float",
      ]);
      expect(
        docks.filter((item) => item.checked).map((item) => item.id)
      ).toEqual([`dock_${dock}`]);
    });
  });

  it("offers to collapse an expanded strip and to expand a collapsed one", () => {
    const ids = (collapsed: boolean) =>
      stripMenuEntries({ dock: "left", hasClosed: false, collapsed }).map(
        (item) => item.id
      );
    expect(ids(false)).toContain("collapse_strip");
    expect(ids(false)).not.toContain("expand_strip");
    expect(ids(true)).toContain("expand_strip");
    expect(ids(true)).not.toContain("collapse_strip");
  });

  it("offers the new tab, new group and appearance entries", () => {
    const entries = stripMenuEntries({ dock: "left", hasClosed: false }).map(
      (item) => item.id
    );
    expect(entries).toContain("new_tab");
    expect(entries).toContain("new_group");
    expect(entries).toContain("edit_strip_appearance");
    expect(entries).not.toContain("open_every");
  });

  it("offers Open every tab while a tab is closed", () => {
    expect(
      stripMenuEntries({ dock: "left", hasClosed: true }).map((item) => item.id)
    ).toContain("open_every");
  });

  it("disables the close by text entries when no tab is open", () => {
    const entries = stripMenuEntries({
      dock: "left",
      hasClosed: true,
      hasOpen: false,
    });
    expect(
      entries.find((item) => item.id === "close_containing")?.enabled
    ).toBe(false);
  });
});

describe("moves", () => {
  it("finds the place a move would take", () => {
    const open = ["a", "b", "c"];
    expect(moveTarget(open, [], "b", "earlier")).toBe(0);
    expect(moveTarget(open, [], "b", "later")).toBe(2);
    expect(moveTarget(open, [], "a", "start")).toBeUndefined();
    expect(moveTarget(open, [], "z", "end")).toBeUndefined();
    expect(moveTarget(["p", "a", "b"], ["p"], "b", "start")).toBe(1);
    expect(moveTarget(["p", "q", "a"], ["p", "q"], "p", "end")).toBe(1);
  });

  it("keeps closed tabs in their places when open tabs move", () => {
    expect(
      applyOpenOrder(["a", "x", "b", "c"], ["a", "b", "c"], ["a", "c", "b"])
    ).toEqual(["a", "x", "c", "b"]);
    expect(
      planMove(["a", "x", "b", "c"], ["a", "b", "c"], [], "c", "earlier")
    ).toEqual({ order: ["a", "x", "c", "b"], position: 1 });
  });

  it("refuses a move across the pinned edge", () => {
    expect(
      planMove(["p", "a"], ["p", "a"], ["p"], "a", "earlier")
    ).toBeUndefined();
  });
});
