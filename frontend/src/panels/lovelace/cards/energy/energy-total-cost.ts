import type {
  EnergyInfo,
  EnergyPreferences,
  GasSourceTypeEnergyPreference,
  GridSourceTypeEnergyPreference,
  WaterSourceTypeEnergyPreference,
} from "../../../../data/energy";
import type { Statistics } from "../../../../data/recorder";
import { calculateStatisticSumGrowth } from "../../../../data/recorder";

/**
 * The cost for a period, from the cost statistics the energy configuration
 * already names: what was paid for grid, gas and water, minus what was
 * earned for returned energy. Nothing is estimated. When no source has a cost
 * statistic, or none of them has data in the period, there is no cost and
 * `undefined` is returned so the caller shows no tile.
 */
export const computeEnergyTotalCost = (
  prefs: Pick<EnergyPreferences, "energy_sources">,
  info: Pick<EnergyInfo, "cost_sensors">,
  stats: Statistics
): number | undefined => {
  let total = 0;
  let found = false;

  const add = (statId: string | null | undefined, sign: 1 | -1) => {
    if (!statId) {
      return;
    }
    const growth = calculateStatisticSumGrowth(stats[statId]);
    if (growth !== null) {
      total += sign * growth;
      found = true;
    }
  };

  for (const source of prefs.energy_sources) {
    if (source.type === "grid") {
      const grid = source as GridSourceTypeEnergyPreference;
      if (grid.stat_energy_from) {
        add(grid.stat_cost || info.cost_sensors[grid.stat_energy_from], 1);
      }
      if (grid.stat_energy_to) {
        add(
          grid.stat_compensation || info.cost_sensors[grid.stat_energy_to],
          -1
        );
      }
    } else if (source.type === "gas" || source.type === "water") {
      const flow = source as
        GasSourceTypeEnergyPreference | WaterSourceTypeEnergyPreference;
      add(flow.stat_cost || info.cost_sensors[flow.stat_energy_from], 1);
    }
  }

  return found ? total : undefined;
};
