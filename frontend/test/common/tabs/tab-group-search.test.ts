import { describe, expect, it } from "vitest";
import type { GroupCloseTab } from "../../../src/common/tabs/tab-group-search";
import {
  filterGroupItems,
  planGroupClose,
  tabGroupOf,
} from "../../../src/common/tabs/tab-group-search";

// Group search filters one group and may close tabs, so these protect its
// guards: a broken pattern hides nothing and closes nothing, pinned tabs close
// only when asked for, and a group never touches the tabs of another.

const tab = (
  id: string,
  title: string,
  extra: Partial<GroupCloseTab> = {}
): GroupCloseTab => ({
  id,
  texts: [title, id],
  open: true,
  current: false,
  pinned: false,
  ...extra,
});

const tabs = [
  tab("lovelace", "Overview", { pinned: true, current: true }),
  tab("light", "Lights", { pinned: true }),
  tab("climate", "Climate"),
  tab("lamp", "Lamps"),
  tab("map", "Map", { open: false }),
  tab("energy", "Energy"),
];

describe("tabGroupOf", () => {
  it("puts pinned tabs first and everything else in pages", () => {
    expect(tabGroupOf(true)).toBe("pinned");
    expect(tabGroupOf(false)).toBe("pages");
  });
});

describe("filterGroupItems", () => {
  const items = ["Lights", "Climate", "Lamps"];
  const texts = (item: string) => [item];

  it("filters one list by plain text, ignoring case", () => {
    expect(filterGroupItems(items, "LI", texts)).toEqual(["Lights", "Climate"]);
  });

  it("filters by a regular expression", () => {
    expect(filterGroupItems(items, "/^L/", texts)).toEqual(["Lights", "Lamps"]);
  });

  it("keeps every item for an empty search", () => {
    expect(filterGroupItems(items, "  ", texts)).toEqual(items);
  });

  it("keeps every item for a pattern that cannot be used", () => {
    expect(filterGroupItems(items, "/(/", texts)).toEqual(items);
    expect(filterGroupItems(items, "/(a+)+$/", texts)).toEqual(items);
  });

  it("returns an empty list when nothing matches", () => {
    expect(filterGroupItems(items, "zzz", texts)).toEqual([]);
  });

  it("returns a copy, never the list it was given", () => {
    expect(filterGroupItems(items, "", texts)).not.toBe(items);
  });
});

describe("planGroupClose", () => {
  it("closes only the open matching tabs of the pages group", () => {
    // "li" matches Lights (pinned) and Climate (page); Map is closed.
    expect(planGroupClose(tabs, "pages", "li")).toEqual({ ids: ["climate"] });
  });

  it("never closes a pinned tab from the pages group", () => {
    expect(planGroupClose(tabs, "pages", "/./").ids).toEqual([
      "climate",
      "lamp",
      "energy",
    ]);
  });

  it("closes nothing in the pinned group unless pinned tabs are asked for", () => {
    expect(planGroupClose(tabs, "pinned", "lights")).toEqual({
      ids: [],
      blocked: "pinned",
    });
    expect(
      planGroupClose(tabs, "pinned", "lights", { includePinned: true })
    ).toEqual({ ids: ["light"] });
  });

  it("never closes the tab in use, even when asked", () => {
    expect(
      planGroupClose(tabs, "pinned", "overview", { includePinned: true }).ids
    ).toEqual([]);
  });

  it("closes nothing for an empty search", () => {
    expect(planGroupClose(tabs, "pages", "")).toEqual({
      ids: [],
      blocked: "empty",
    });
  });

  it("closes nothing for a pattern that cannot be used", () => {
    expect(planGroupClose(tabs, "pages", "/(/")).toEqual({
      ids: [],
      blocked: "invalid",
    });
  });

  it("closes nothing when the search matches no tab of the group", () => {
    expect(planGroupClose(tabs, "pages", "zzz")).toEqual({ ids: [] });
  });

  it("never closes anything in the settings or tools groups", () => {
    expect(planGroupClose(tabs, "settings", "li")).toEqual({
      ids: [],
      blocked: "not_tabs",
    });
    expect(planGroupClose(tabs, "tools", "li").blocked).toBe("not_tabs");
  });
});
