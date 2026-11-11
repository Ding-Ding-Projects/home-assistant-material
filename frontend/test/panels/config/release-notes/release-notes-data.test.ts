import { describe, expect, it } from "vitest";
import {
  dayAsText,
  entryKey,
  filterNoteDays,
  newKeys,
  notePage,
  toNoteDays,
} from "../../../../src/panels/config/release-notes/release-notes-data";

// Protects the rules the release notes page rests on: "Fixed" is read from
// the text and nothing else, a note links only when its first word names a
// page, and nothing is marked new on a first visit.

const days = toNoteDays([
  {
    date: "2026-11-10",
    items: [
      { text: "Fixed: the rail no longer jumps." },
      { text: "Dashboards can be exported.", commit: "abc1234" },
    ],
  },
  { date: "2026-11-09", items: [{ text: "The theme picker is wider." }] },
]);

const all = () => true;

describe("toNoteDays", () => {
  it("derives Fixed from the text and links only a named page", () => {
    expect(days[0].entries[0].fixed).toBe(true);
    expect(days[0].entries[1].fixed).toBe(false);
    expect(days[0].entries[1].page).toBe("/config/lovelace/dashboards");
    expect(days[1].entries[0].page).toBeUndefined();
    expect(notePage("The dashboards are faster.")).toBeUndefined();
  });
});

describe("new entries", () => {
  it("marks nothing on a first visit and only unseen entries later", () => {
    expect(newKeys(days, undefined).size).toBe(0);
    const seen = new Set([days[1].entries[0].key]);
    const fresh = newKeys(days, seen);
    expect(fresh.size).toBe(2);
    expect(fresh.has(days[1].entries[0].key)).toBe(false);
  });

  it("gives the same key to the same entry and another to another day", () => {
    expect(entryKey("2026-11-10", "x")).toBe(entryKey("2026-11-10", "x"));
    expect(entryKey("2026-11-10", "x")).not.toBe(entryKey("2026-11-09", "x"));
  });
});

describe("filterNoteDays", () => {
  it("keeps only fixed or new entries and drops empty days", () => {
    expect(filterNoteDays(days, "fixed", new Set(), all)).toHaveLength(1);
    const isNew = new Set([days[1].entries[0].key]);
    const result = filterNoteDays(days, "new", isNew, all);
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe("2026-11-09");
  });
});

describe("dayAsText", () => {
  it("writes the heading and one line for each note", () => {
    expect(dayAsText("10 November 2026", days[0].entries)).toBe(
      "10 November 2026\n- Fixed: the rail no longer jumps.\n- Dashboards can be exported."
    );
  });
});
