import { describe, expect, it } from "vitest";
import type { HistoryResult } from "../../src/data/history";
import {
  addComparisonToHistory,
  computeCompareShiftMs,
} from "../../src/data/history";

describe("computeCompareShiftMs", () => {
  it("returns the shift for each period", () => {
    expect(computeCompareShiftMs("previous", 6)).toBe(6 * 3_600_000);
    expect(computeCompareShiftMs("day", 6)).toBe(24 * 3_600_000);
    expect(computeCompareShiftMs("week", 6)).toBe(7 * 24 * 3_600_000);
  });

  it("returns nothing for an unknown period or an unbounded window", () => {
    expect(computeCompareShiftMs(undefined, 6)).toBeUndefined();
    expect(computeCompareShiftMs("month", 6)).toBeUndefined();
    expect(computeCompareShiftMs("day", 0)).toBeUndefined();
    expect(computeCompareShiftMs("day", 24 * 40)).toBeUndefined();
  });
});

const line = (
  entityId: string,
  times: number[],
  unit = "°C"
): HistoryResult => ({
  timeline: [],
  line: [
    {
      unit,
      identifier: unit,
      data: [
        {
          domain: entityId.split(".")[0],
          name: entityId,
          entity_id: entityId,
          states: times.map((t) => ({ state: "1", last_changed: t })),
        },
      ],
    },
  ],
});

describe("addComparisonToHistory", () => {
  it("adds a shifted, marked copy next to the real series", () => {
    const current = line("sensor.a", [100, 200]);
    const earlier = line("sensor.a", [10, 20]);
    const result = addComparisonToHistory(current, earlier, 90);
    const data = result.line[0].data;
    expect(data).toHaveLength(2);
    expect(data[0].compare).toBeUndefined();
    expect(data[1].compare).toBe(true);
    expect(data[1].states.map((s) => s.last_changed)).toEqual([100, 110]);
    // The inputs are not changed.
    expect(current.line[0].data).toHaveLength(1);
    expect(earlier.line[0].data[0].states[0].last_changed).toBe(10);
  });

  it("skips entities without a real series, other units and multi-line domains", () => {
    const current = line("sensor.a", [100]);
    expect(
      addComparisonToHistory(current, line("sensor.b", [10]), 90).line[0].data
    ).toHaveLength(1);
    expect(
      addComparisonToHistory(current, line("sensor.a", [10], "%"), 90).line[0]
        .data
    ).toHaveLength(1);
    const climate = line("climate.a", [100]);
    expect(
      addComparisonToHistory(climate, line("climate.a", [10]), 90).line[0].data
    ).toHaveLength(1);
  });

  it("returns the current result when there is no earlier data", () => {
    const current = line("sensor.a", [100]);
    expect(
      addComparisonToHistory(current, { line: [], timeline: [] }, 90)
    ).toBe(current);
  });
});
