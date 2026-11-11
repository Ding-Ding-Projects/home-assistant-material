import { describe, expect, it } from "vitest";
import {
  createNavigationState,
  generatePlaceItems,
  isNavigableEntry,
  isWrappingMove,
  moveActiveIndex,
  navigationAfterQuery,
  navigationWithIndex,
  NO_ACTIVE_INDEX,
  optionPosition,
  spaceTogglesRow,
} from "../../../src/dialogs/quick-bar/quick-bar-navigation";

// A list as the search of everything shows it: section titles are plain
// strings, and rows can be disabled. Only rows that can be chosen may be active.
const rows = [
  "Settings",
  { id: "a" },
  { id: "b", disabled: true },
  { id: "c" },
  "Entities",
  { id: "d" },
  { id: "___no_items_available___" },
];

describe("isNavigableEntry", () => {
  it("skips titles, disabled rows and placeholders", () => {
    expect(rows.map(isNavigableEntry)).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
    ]);
    expect(isNavigableEntry(undefined)).toBe(false);
  });
});

describe("moveActiveIndex", () => {
  it("moves over titles and disabled rows", () => {
    expect(moveActiveIndex(rows, 1, "next")).toBe(3);
    expect(moveActiveIndex(rows, 3, "next")).toBe(5);
    expect(moveActiveIndex(rows, 5, "previous")).toBe(3);
  });

  it("starts at the first row going down and the last row going up", () => {
    expect(moveActiveIndex(rows, NO_ACTIVE_INDEX, "next")).toBe(1);
    expect(moveActiveIndex(rows, NO_ACTIVE_INDEX, "previous")).toBe(5);
  });

  it("wraps at both ends", () => {
    expect(moveActiveIndex(rows, 5, "next")).toBe(1);
    expect(moveActiveIndex(rows, 1, "previous")).toBe(5);
  });

  it("stays put at the ends when wrapping is off", () => {
    expect(moveActiveIndex(rows, 5, "next", false)).toBe(5);
    expect(moveActiveIndex(rows, 1, "previous", false)).toBe(1);
  });

  it("jumps to the first and last choosable row", () => {
    expect(moveActiveIndex(rows, 3, "first")).toBe(1);
    expect(moveActiveIndex(rows, 3, "last")).toBe(5);
  });

  it("reports no active row when nothing can be chosen", () => {
    const none = ["Settings", { id: "x", disabled: true }];
    for (const direction of ["next", "previous", "first", "last"] as const) {
      expect(moveActiveIndex(none, 0, direction)).toBe(NO_ACTIVE_INDEX);
    }
    expect(moveActiveIndex([], NO_ACTIVE_INDEX, "next")).toBe(NO_ACTIVE_INDEX);
  });

  it("keeps a single row active when it wraps onto itself", () => {
    const one = [{ id: "only" }];
    expect(moveActiveIndex(one, 0, "next")).toBe(0);
    expect(moveActiveIndex(one, 0, "previous")).toBe(0);
  });
});

describe("isWrappingMove", () => {
  it("is true only for moves that cross an end", () => {
    expect(isWrappingMove(rows, 5, "next")).toBe(true);
    expect(isWrappingMove(rows, 1, "previous")).toBe(true);
    expect(isWrappingMove(rows, NO_ACTIVE_INDEX, "previous")).toBe(true);
    expect(isWrappingMove(rows, 1, "next")).toBe(false);
    expect(isWrappingMove(rows, NO_ACTIVE_INDEX, "next")).toBe(false);
    expect(isWrappingMove(rows, 3, "first")).toBe(false);
  });
});

describe("navigation state", () => {
  it("forgets the active row when the query changes", () => {
    const active = navigationWithIndex(createNavigationState("sound"), 3);
    expect(active.index).toBe(3);
    const typed = navigationAfterQuery(active, "sounds");
    expect(typed).toEqual({ index: NO_ACTIVE_INDEX, query: "sounds" });
  });

  it("keeps the active row when the query is the same", () => {
    const active = navigationWithIndex(createNavigationState("sound"), 3);
    expect(navigationAfterQuery(active, "sound")).toBe(active);
  });
});

describe("optionPosition", () => {
  it("counts only rows that can be chosen", () => {
    expect(optionPosition(rows, 1)).toEqual({ position: 1, total: 3 });
    expect(optionPosition(rows, 5)).toEqual({ position: 3, total: 3 });
    expect(optionPosition(rows, 0)).toBeUndefined();
  });
});

describe("spaceTogglesRow", () => {
  it("leaves Space to the search while a query is typed", () => {
    expect(
      spaceTogglesRow({
        query: "dark mode",
        hasLiveControl: true,
        modifier: false,
      })
    ).toBe(false);
  });

  it("toggles on an empty search, and with Ctrl or Cmd always", () => {
    expect(
      spaceTogglesRow({ query: "", hasLiveControl: true, modifier: false })
    ).toBe(true);
    expect(
      spaceTogglesRow({ query: "dark", hasLiveControl: true, modifier: true })
    ).toBe(true);
  });

  it("never toggles a row without a switch", () => {
    expect(
      spaceTogglesRow({ query: "", hasLiveControl: false, modifier: true })
    ).toBe(false);
  });
});

describe("generatePlaceItems", () => {
  const t = (key: string) => key;

  it("offers the wording file and accessibility tools to everyone", () => {
    const items = generatePlaceItems(t, false);
    expect(items.map((item) => item.placeId)).toEqual([
      "personal_wording",
      "accessibility_tools",
    ]);
    expect(items[0].path).toBe("/profile/localization");
    expect(items[1].path).toBeUndefined();
  });

  it("adds the language mode row for people who can open the settings panel", () => {
    const items = generatePlaceItems(t, true);
    expect(items.map((item) => item.placeId)).toContain("language_mode");
    expect(items.find((item) => item.placeId === "language_mode")?.path).toBe(
      "/config/personal#language_mode"
    );
  });

  it("gives every entry words to search by", () => {
    for (const item of generatePlaceItems(t, true)) {
      expect(item.primary).toContain(item.placeId);
      expect(item.description).toContain(item.placeId);
      expect(item.id.startsWith("place________")).toBe(true);
    }
  });
});
