import { describe, expect, it } from "vitest";
import { computeLogbookStats } from "../../../src/panels/logbook/logbook-stats";

// Protects the three facts on the Activity page: the count, the busiest hour
// and the things that appear most. A wrong tie-break or an hour counted in
// UTC instead of local time would be silent.

const at = (hour: number) => new Date(2026, 10, 9, hour, 30).getTime() / 1000;

describe("computeLogbookStats", () => {
  it("counts entries, finds the busiest local hour and ranks things", () => {
    const stats = computeLogbookStats([
      { when: at(17), entity_id: "light.a", name: "A" },
      { when: at(17), entity_id: "light.a", name: "A" },
      { when: at(17), entity_id: "lock.b", name: "B" },
      { when: at(9), entity_id: "light.a", name: "A" },
      { when: at(9), entity_id: "sensor.c" },
    ]);
    expect(stats.total).toBe(5);
    expect(stats.busiestHour).toEqual({ hour: 17, count: 3 });
    expect(stats.mostActive.map((thing) => [thing.key, thing.count])).toEqual([
      ["light.a", 3],
      ["lock.b", 1],
      ["sensor.c", 1],
    ]);
  });

  it("says nothing about an empty list", () => {
    const stats = computeLogbookStats([]);
    expect(stats).toEqual({ total: 0, busiestHour: undefined, mostActive: [] });
  });

  it("keeps only as many things as asked for", () => {
    const stats = computeLogbookStats(
      [
        { when: at(1), entity_id: "a.a" },
        { when: at(1), entity_id: "b.b" },
        { when: at(1), entity_id: "c.c" },
      ],
      2
    );
    expect(stats.mostActive).toHaveLength(2);
  });
});
