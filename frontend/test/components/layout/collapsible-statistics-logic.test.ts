import { describe, expect, it } from "vitest";
import {
  MAX_STATISTICS,
  formatStatisticValue,
  limitStatistics,
  parseStoredCollapsed,
  statisticsStorageKey,
  summaryLine,
  toStoredState,
} from "../../../src/components/layout/collapsible-statistics-logic";

// Protects the statistics strip: a damaged stored value must never hide the
// numbers, each page keeps its own choice, and a page can never push more than
// five numbers into the strip.

describe("parseStoredCollapsed", () => {
  it("is expanded when nothing was stored", () => {
    expect(parseStoredCollapsed(undefined)).toBe(false);
    expect(parseStoredCollapsed(null)).toBe(false);
  });

  it("reads the two values this strip writes", () => {
    expect(parseStoredCollapsed("collapsed")).toBe(true);
    expect(parseStoredCollapsed("expanded")).toBe(false);
  });

  it("stays expanded for corrupt storage", () => {
    expect(parseStoredCollapsed("{not json")).toBe(false);
    expect(parseStoredCollapsed(42)).toBe(false);
    expect(parseStoredCollapsed({ collapsed: true })).toBe(false);
    expect(parseStoredCollapsed("")).toBe(false);
  });

  it("round-trips through the stored value", () => {
    expect(parseStoredCollapsed(toStoredState(true))).toBe(true);
    expect(parseStoredCollapsed(toStoredState(false))).toBe(false);
  });
});

describe("statisticsStorageKey", () => {
  it("gives each page its own key", () => {
    const a = statisticsStorageKey("/config/tags");
    const b = statisticsStorageKey("/config/labels");
    expect(a).toBeDefined();
    expect(a).not.toBe(b);
  });

  it("gives no key for an unknown page", () => {
    expect(statisticsStorageKey(undefined)).toBeUndefined();
    expect(statisticsStorageKey(null)).toBeUndefined();
    expect(statisticsStorageKey("  ")).toBeUndefined();
  });
});

describe("limitStatistics", () => {
  it("keeps at most five, in order", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      label: `Item ${i}`,
      value: i,
    }));
    const kept = limitStatistics(many);
    expect(kept).toHaveLength(MAX_STATISTICS);
    expect(kept.map((s) => s.label)).toEqual([
      "Item 0",
      "Item 1",
      "Item 2",
      "Item 3",
      "Item 4",
    ]);
  });

  it("drops entries that are not a labelled number", () => {
    const kept = limitStatistics([
      { label: "Total", value: 3 },
      { label: "", value: 1 },
      { label: "Bad", value: Number.NaN },
      null,
      "text",
      { label: "Shown", value: "2 of 3" },
    ]);
    expect(kept.map((s) => s.label)).toEqual(["Total", "Shown"]);
  });

  it("gives nothing when the input is not a list", () => {
    expect(limitStatistics(undefined)).toEqual([]);
    expect(limitStatistics({})).toEqual([]);
  });
});

describe("summaryLine", () => {
  it("joins every label and number on one line", () => {
    expect(
      summaryLine([
        { label: "Total", value: 12 },
        { label: "Shown", value: 4 },
      ])
    ).toBe("Total 12 · Shown 4");
  });

  it("formats numbers and leaves text as it is", () => {
    expect(formatStatisticValue(1234, "en")).toBe("1,234");
    expect(formatStatisticValue("4 of 9")).toBe("4 of 9");
  });
});
