import { describe, expect, it } from "vitest";
import { limitStatistics } from "../../../src/components/layout/collapsible-statistics-logic";
import { buildListStatistics } from "../../../src/components/layout/list-statistics";

// Protects what the list pages put in their statistics strip: the labels come
// from the shared keys, the numbers are what the page counted, and the strip
// never holds more than the five numbers it can show.

const localize = (key: string) => key.split(".").pop()!;

describe("buildListStatistics", () => {
  it("gives the total and the number shown", () => {
    expect(buildListStatistics(localize, { total: 12, shown: 4 })).toEqual([
      { id: "total", label: "total", value: 12 },
      { id: "shown", label: "shown", value: 4 },
    ]);
  });

  it("adds the counts of the page and the selection, in that order", () => {
    const items = buildListStatistics(localize, {
      total: 10,
      shown: 10,
      selected: 3,
      extras: [
        { key: "disabled", value: 2 },
        { key: "unavailable", value: 1 },
      ],
    });
    expect(items.map((item) => [item.id, item.value])).toEqual([
      ["total", 10],
      ["shown", 10],
      ["disabled", 2],
      ["unavailable", 1],
      ["selected", 3],
    ]);
    // Exactly what the strip can show
    expect(limitStatistics(items)).toHaveLength(5);
  });

  it("shows the selection only while something is selected", () => {
    expect(
      buildListStatistics(localize, { total: 1, shown: 1, selected: 0 }).some(
        (item) => item.id === "selected"
      )
    ).toBe(false);
  });

  it("keeps at most two page counts so the selection is never cut off", () => {
    const items = buildListStatistics(localize, {
      total: 1,
      shown: 1,
      selected: 1,
      extras: [
        { key: "disabled", value: 1 },
        { key: "unavailable", value: 1 },
        { key: "attention", value: 1 },
      ],
    });
    expect(items).toHaveLength(5);
    expect(items[items.length - 1].id).toBe("selected");
    expect(items.some((item) => item.id === "attention")).toBe(false);
  });

  it("never reports a total below what is shown", () => {
    expect(buildListStatistics(localize, { total: 3, shown: 5 })[0].value).toBe(
      5
    );
  });

  it("asks for the label of every statistic under the shared keys", () => {
    const keys: string[] = [];
    buildListStatistics(
      (key) => {
        keys.push(key);
        return key;
      },
      {
        total: 1,
        shown: 1,
        selected: 1,
        extras: [{ key: "turned_off", value: 1 }],
      }
    );
    expect(
      keys.every((key) =>
        key.startsWith("ui.components.collapsible-statistics.")
      )
    ).toBe(true);
  });
});
