import { describe, expect, it } from "vitest";
import type { Statistics } from "../../../../../src/data/recorder";
import { computeEnergyTotalCost } from "../../../../../src/panels/lovelace/cards/energy/energy-total-cost";

const stat = (changes: number[]) =>
  changes.map((change, i) => ({ start: i, end: i + 1, change }));

const stats = {
  "sensor.cost": stat([1, 2]),
  "sensor.comp": stat([0.5]),
  "sensor.gas_cost": stat([4]),
} as unknown as Statistics;

describe("computeEnergyTotalCost", () => {
  it("adds costs and subtracts compensation", () => {
    const cost = computeEnergyTotalCost(
      {
        energy_sources: [
          {
            type: "grid",
            stat_energy_from: "sensor.in",
            stat_energy_to: "sensor.out",
            stat_cost: "sensor.cost",
            stat_compensation: "sensor.comp",
          },
          {
            type: "gas",
            stat_energy_from: "sensor.gas",
            stat_cost: "sensor.gas_cost",
          },
        ],
      } as never,
      { cost_sensors: {} },
      stats
    );
    expect(cost).toBe(3 - 0.5 + 4);
  });

  it("uses the cost sensor the energy info names", () => {
    const cost = computeEnergyTotalCost(
      {
        energy_sources: [
          {
            type: "grid",
            stat_energy_from: "sensor.in",
            stat_cost: null,
          },
        ],
      } as never,
      { cost_sensors: { "sensor.in": "sensor.cost" } },
      stats
    );
    expect(cost).toBe(3);
  });

  it("returns nothing when no cost is configured or recorded", () => {
    expect(
      computeEnergyTotalCost(
        {
          energy_sources: [
            { type: "grid", stat_energy_from: "sensor.in", stat_cost: null },
            { type: "solar", stat_energy_from: "sensor.sun" },
          ],
        } as never,
        { cost_sensors: {} },
        stats
      )
    ).toBeUndefined();
    expect(
      computeEnergyTotalCost(
        {
          energy_sources: [
            {
              type: "grid",
              stat_energy_from: "sensor.in",
              stat_cost: "sensor.missing",
            },
          ],
        } as never,
        { cost_sensors: {} },
        stats
      )
    ).toBeUndefined();
  });
});
