import type { HassEntities } from "home-assistant-js-websocket";
import type { EnergyPreferences } from "../../data/energy";

const UNKNOWN = new Set(["unavailable", "unknown"]);

const usable = (
  states: HassEntities,
  entityId: string | undefined
): boolean => {
  const stateObj = entityId ? states[entityId] : undefined;
  return (
    !!stateObj &&
    !UNKNOWN.has(stateObj.state) &&
    Number.isFinite(Number(stateObj.state)) &&
    !!stateObj.attributes.unit_of_measurement
  );
};

/**
 * The sensor that tells how much power the home uses now: the one the energy
 * setup names for the home, else the first grid sensor that reports.
 * Undefined when the setup names none that is reporting.
 */
export const powerSensor = (
  prefs: EnergyPreferences,
  states: HassEntities
): string | undefined => {
  for (const type of ["home", "grid"] as const) {
    for (const source of prefs.energy_sources) {
      if (source.type === type && usable(states, source.stat_rate)) {
        return source.stat_rate;
      }
    }
  }
  return undefined;
};
