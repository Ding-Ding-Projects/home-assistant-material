import { describe, expect, it } from "vitest";
import type { TabGroup } from "../../../src/common/tabs/tab-groups";
import {
  groupIdOf,
  phoneListing,
  planPhoneDrop,
  planPhoneMove,
} from "../../../src/components/phone/phone-groups";
import type { PhoneChangeInput } from "../../../src/components/phone/phone-groups";
import type { PhonePage } from "../../../src/components/phone/phone-page-actions";
import {
  pageActions,
  planMove,
} from "../../../src/components/phone/phone-page-actions";

// The Pages sheet lists the pinned pages, then the groups, then the pages in
// no group, and every move writes what the wide strip writes. These protect
// the rules that keep the two in agreement: a move stays inside a section, a
// drop beside a grouped page joins the group and beside a loose one leaves
// it, the pinned edge is never crossed, and closed pages keep their places.

const group = (id: string, members: string[], collapsed = false): TabGroup => ({
  id,
  name: id.toUpperCase(),
  colour: "blue",
  collapsed,
  members,
});

const input = (over: Partial<PhoneChangeInput> = {}): PhoneChangeInput => ({
  all: ["p", "q", "a", "b", "c", "d", "e"],
  visible: ["p", "q", "a", "b", "c", "d", "e"],
  order: ["p", "q", "a", "b", "c", "d", "e"],
  pinned: ["p", "q"],
  groups: [group("g1", ["b", "c"])],
  ...over,
});

describe("phoneListing", () => {
  it("lists the pinned pages, then each group, then the pages in no group", () => {
    expect(phoneListing(input())).toEqual({
      pinned: ["p", "q"],
      groups: [{ group: group("g1", ["b", "c"]), ids: ["b", "c"] }],
      loose: ["a", "d", "e"],
    });
  });

  it("never lists a pinned page inside a group", () => {
    const listing = phoneListing(input({ groups: [group("g1", ["p", "c"])] }));
    expect(listing.pinned).toEqual(["p", "q"]);
    expect(listing.groups[0].ids).toEqual(["c"]);
  });

  it("leaves out a group with no page listed, as a search does", () => {
    const listing = phoneListing(input({ visible: ["a", "d"] }));
    expect(listing.groups).toEqual([]);
    expect(listing.loose).toEqual(["a", "d"]);
  });

  it("finds the group of a page and none for a pinned page", () => {
    const groups = [group("g1", ["b", "p"])];
    expect(groupIdOf(groups, ["p"], "b")).toBe("g1");
    expect(groupIdOf(groups, ["p"], "p")).toBeUndefined();
    expect(groupIdOf(groups, ["p"], "a")).toBeUndefined();
  });
});

describe("planPhoneMove", () => {
  it("moves a page of a group among that group only", () => {
    const plan = planPhoneMove(input(), "b", "down");
    expect(plan).toMatchObject({ groups: [{ id: "g1", members: ["c", "b"] }] });
    expect(planPhoneMove(input(), "b", "up")).toEqual({ blocked: "at_top" });
    expect(planPhoneMove(input(), "c", "bottom")).toEqual({
      blocked: "at_bottom",
    });
  });

  it("moves a page in no group among the pages in no group, over a group", () => {
    const plan = planPhoneMove(input(), "a", "down");
    expect(plan).not.toHaveProperty("blocked");
    // The group stays whole and keeps its members; only the order changes.
    expect(plan).toMatchObject({ order: ["p", "q", "b", "c", "d", "a", "e"] });
    expect((plan as { groups?: unknown }).groups).toBeUndefined();
  });

  it("moves pinned pages among pinned pages and saves the pinned list", () => {
    const plan = planPhoneMove(input(), "p", "down");
    expect(plan).toMatchObject({ pinned: ["q", "p"] });
    expect(planPhoneMove(input(), "q", "bottom")).toEqual({
      blocked: "at_bottom",
    });
    expect(planPhoneMove(input(), "p", "up")).toEqual({ blocked: "at_top" });
  });

  it("goes to the top and the bottom of its own section", () => {
    expect(planPhoneMove(input(), "e", "top")).toMatchObject({
      order: ["p", "q", "e", "a", "b", "c", "d"],
    });
    expect(planPhoneMove(input(), "a", "bottom")).toMatchObject({
      order: ["p", "q", "b", "c", "d", "e", "a"],
    });
  });

  it("keeps a closed page in its own place", () => {
    // d is closed: a moves over e, the next open page, and d keeps its slot.
    const plan = planPhoneMove(
      input({ visible: ["p", "q", "a", "b", "c", "e"] }),
      "a",
      "down"
    );
    expect(plan).toMatchObject({ order: ["p", "q", "b", "c", "e", "d", "a"] });
  });

  it("says the place among the open pages", () => {
    const plan = planPhoneMove(input(), "a", "down") as {
      position: number;
      total: number;
    };
    expect(plan.total).toBe(7);
    expect(plan.position).toBe(6);
  });

  it("returns nothing for a page that is not listed", () => {
    expect(planPhoneMove(input(), "zzz", "up")).toBeUndefined();
  });
});

describe("planPhoneDrop", () => {
  it("joins a group when dropped beside one of its pages", () => {
    const plan = planPhoneDrop(input(), "d", "b", true);
    expect(plan).toMatchObject({
      groups: [{ id: "g1", members: ["b", "d", "c"] }],
    });
  });

  it("leaves its group when dropped beside a page in no group", () => {
    const plan = planPhoneDrop(input(), "c", "e", true);
    expect(plan).toMatchObject({ groups: [{ id: "g1", members: ["b"] }] });
    expect((plan as { order: string[] }).order.indexOf("c")).toBeGreaterThan(
      (plan as { order: string[] }).order.indexOf("e")
    );
  });

  it("reorders inside a group", () => {
    expect(planPhoneDrop(input(), "c", "b", false)).toMatchObject({
      groups: [{ id: "g1", members: ["c", "b"] }],
    });
  });

  it("refuses to cross the pinned edge in both directions", () => {
    expect(planPhoneDrop(input(), "a", "p", false)).toEqual({ blocked: true });
    expect(planPhoneDrop(input(), "p", "a", true)).toEqual({ blocked: true });
  });

  it("changes nothing when a page lands where it is", () => {
    expect(planPhoneDrop(input(), "a", "a", true)).toBeUndefined();
  });
});

describe("pageActions with the sheet's features", () => {
  const pages: PhonePage[] = [
    { id: "p", title: "P", open: true, pinned: true, locked: false },
    {
      id: "b",
      title: "B",
      open: true,
      pinned: false,
      locked: false,
      groupId: "g1",
    },
    {
      id: "c",
      title: "C",
      open: true,
      pinned: false,
      locked: true,
      groupId: "g1",
    },
    { id: "a", title: "A", open: true, pinned: false, locked: false },
  ];
  const all = { locks: true, groups: true, appearance: true };

  it("lists lock, group and appearance entries after the pin entry", () => {
    expect(pageActions(pages, "a", undefined, all).map((e) => e.id)).toEqual([
      "pin",
      "lock",
      "move_into_group",
      "edit_appearance",
      "close",
      "close_others",
      "close_above",
      "close_below",
      "move_up",
      "move_down",
      "move_top",
      "move_bottom",
    ]);
  });

  it("offers Remove from group only to a page in a group, and Unlock to a locked one", () => {
    const ids = (id: string) =>
      pageActions(pages, id, undefined, all).map((e) => e.id);
    expect(ids("b")).toContain("remove_from_group");
    expect(ids("a")).not.toContain("remove_from_group");
    expect(ids("c")).toContain("unlock");
    expect(ids("c")).not.toContain("lock");
  });

  it("does not let a pinned page join a group, and says why", () => {
    const entry = pageActions(pages, "p", undefined, all).find(
      (e) => e.id === "move_into_group"
    )!;
    expect(entry.enabled).toBe(false);
    expect(entry.reason).toBe("pinned");
  });

  it("does not close a locked page", () => {
    const close = pageActions(pages, "c", undefined, all).find(
      (e) => e.id === "close"
    )!;
    expect(close.enabled).toBe(false);
    expect(close.reason).toBe("locked");
  });

  it("keeps the move enabling inside the page's own group", () => {
    // b is first in its group and a is outside it: b cannot move up.
    expect(planMove(pages, "b", "up")).toEqual({ blocked: "at_top" });
    expect(planMove(pages, "c", "up").order).toBeDefined();
    const entry = pageActions(pages, "c", undefined, all).find(
      (e) => e.id === "move_down"
    )!;
    expect(entry.enabled).toBe(false);
  });

  it("leaves the older list alone when no feature is asked for", () => {
    expect(pageActions(pages, "a").map((e) => e.id)).toEqual([
      "pin",
      "close",
      "close_others",
      "close_above",
      "close_below",
      "move_up",
      "move_down",
      "move_top",
      "move_bottom",
    ]);
  });
});
