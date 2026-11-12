import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearReveals,
  effectiveCollapsed,
  inCollapsedGroup,
  isRevealed,
  revealTabForSession,
  subscribeReveals,
  visibleMembers,
} from "../../../src/components/tabs/tab-search-reveal";

// A search result inside a collapsed group is shown by revealing the tab for
// this visit. These protect the rule that the person's saved collapsed
// preference is never changed by a search.

const group = {
  id: "g1",
  name: "Kitchen",
  colour: "blue" as const,
  collapsed: true,
  members: ["a", "b"],
};

beforeEach(() => clearReveals());

describe("revealing a tab of a collapsed group", () => {
  it("shows the tab without changing the group", () => {
    const before = JSON.stringify(group);
    expect(effectiveCollapsed("main", group)).toBe(true);
    expect(visibleMembers("main", group)).toEqual([]);
    revealTabForSession("main", "b");
    expect(effectiveCollapsed("main", group)).toBe(false);
    expect(visibleMembers("main", group)).toEqual(["b"]);
    expect(group.collapsed).toBe(true);
    expect(JSON.stringify(group)).toBe(before);
  });

  it("keeps each strip apart and can be cleared", () => {
    revealTabForSession("main", "a");
    expect(isRevealed("side", "a")).toBe(false);
    clearReveals("main");
    expect(isRevealed("main", "a")).toBe(false);
    expect(effectiveCollapsed("main", group)).toBe(true);
  });

  it("an open group lists all its members and tells listeners about changes", () => {
    const open = { ...group, collapsed: false };
    expect(visibleMembers("main", open)).toEqual(["a", "b"]);
    const listener = vi.fn();
    const stop = subscribeReveals(listener);
    revealTabForSession("main", "a");
    revealTabForSession("main", "a");
    expect(listener).toHaveBeenCalledTimes(1);
    stop();
    revealTabForSession("main", "b");
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("names a tab in a collapsed group for the note beside a result", () => {
    expect(inCollapsedGroup([group], "a")).toBe(true);
    expect(inCollapsedGroup([group], "z")).toBe(false);
    expect(inCollapsedGroup([{ ...group, collapsed: false }], "a")).toBe(false);
  });
});
