import { describe, expect, it } from "vitest";
import {
  STATISTIC_CLEAR_KEY,
  limitStatistics,
  nextStatisticSelection,
  showingCounts,
  statisticTone,
  withFilterKeys,
} from "../../../src/components/layout/collapsible-statistics-logic";

// Protects the statistic tiles that filter: pressing toggles, the total only
// clears, a tile gets a key only when the page has a matching filter, and the
// "Showing N of M" line appears only while a tile is held.

describe("nextStatisticSelection", () => {
  it("holds a tile that was pressed", () => {
    expect(nextStatisticSelection(undefined, "unavailable")).toBe(
      "unavailable"
    );
  });

  it("switches to another tile when a different one is pressed", () => {
    expect(nextStatisticSelection("unavailable", "disabled")).toBe("disabled");
  });

  it("lets go of the held tile when it is pressed again", () => {
    expect(nextStatisticSelection("disabled", "disabled")).toBeUndefined();
  });

  it("never holds the clear key and always lets go", () => {
    expect(nextStatisticSelection(undefined, STATISTIC_CLEAR_KEY)).toBe(
      undefined
    );
    expect(nextStatisticSelection("disabled", STATISTIC_CLEAR_KEY)).toBe(
      undefined
    );
  });
});

describe("withFilterKeys", () => {
  const items = [
    { id: "total", label: "Total", value: 10 },
    { id: "shown", label: "Shown", value: 4 },
    { id: "unavailable", label: "Unavailable", value: 2 },
    { id: "disabled", label: "Disabled", value: 1 },
  ];

  it("makes the total clear everything and keys only the named tiles", () => {
    const result = withFilterKeys(items, ["unavailable"]);
    expect(result.map((item) => item.filterKey)).toEqual([
      STATISTIC_CLEAR_KEY,
      undefined,
      "unavailable",
      undefined,
    ]);
  });

  it("keeps every tile as text when the page has no matching filter", () => {
    const result = withFilterKeys(items, []);
    expect(result.filter((item) => item.filterKey)).toHaveLength(1);
  });

  it("survives the cleaning the strip applies to what a page supplies", () => {
    const cleaned = limitStatistics(withFilterKeys(items, ["disabled"]));
    expect(cleaned.find((item) => item.id === "disabled")?.filterKey).toBe(
      "disabled"
    );
    expect(cleaned.find((item) => item.id === "shown")?.filterKey).toBe(
      undefined
    );
  });
});

describe("showingCounts", () => {
  const items = [
    { id: "total", label: "Total", value: 10 },
    { id: "shown", label: "Shown", value: 4 },
  ];

  it("reports shown and total only while a tile is held", () => {
    expect(showingCounts(items, "disabled")).toEqual({ shown: 4, total: 10 });
    expect(showingCounts(items, undefined)).toBeUndefined();
  });

  it("reports nothing when the strip lacks one of the two numbers", () => {
    expect(showingCounts([items[0]], "disabled")).toBeUndefined();
  });
});

describe("statisticTone", () => {
  it("gives each meaning its own tone and falls back to neutral", () => {
    expect(statisticTone("attention")).toBe("warning");
    expect(statisticTone("disabled")).toBe("quiet");
    expect(statisticTone("shown")).toBe("primary");
    expect(statisticTone("something-else")).toBe("neutral");
    expect(statisticTone(undefined)).toBe("neutral");
  });
});
