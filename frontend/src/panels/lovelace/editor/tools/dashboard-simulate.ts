import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

/**
 * Pure helpers for the dashboard state simulator. They build a copy of the
 * entity states with a situation applied (night, away, alarm). The copy is
 * only ever handed to preview cards; nothing is written to the server.
 */

export type SimulationPreset = "now" | "night" | "away" | "alarm";

export const SIMULATION_PRESETS: SimulationPreset[] = [
  "now",
  "night",
  "away",
  "alarm",
];

export interface StateOverride {
  entityId: string;
  state: string;
}

const withState = (
  entity: HassEntity,
  state: string,
  attributes: Record<string, unknown> = {}
): HassEntity => ({
  ...entity,
  state,
  attributes: { ...entity.attributes, ...attributes },
});

const domainOf = (entityId: string): string => entityId.split(".")[0];

/** The state a preset forces on one entity, or undefined when it leaves it alone. */
const presetChange = (
  preset: SimulationPreset,
  entity: HassEntity
): { state: string; attributes?: Record<string, unknown> } | undefined => {
  const domain = domainOf(entity.entity_id);
  switch (preset) {
    case "night":
      if (entity.entity_id === "sun.sun") {
        return {
          state: "below_horizon",
          attributes: { elevation: -20 },
        };
      }
      return undefined;
    case "away":
      if (domain === "person" || domain === "device_tracker") {
        return { state: "not_home" };
      }
      return undefined;
    case "alarm":
      if (domain === "alarm_control_panel") {
        return { state: "triggered" };
      }
      return undefined;
    default:
      return undefined;
  }
};

export interface Simulation {
  states: HassEntities;
  /** Entity IDs whose state differs from the real one, in order. */
  changed: string[];
}

/**
 * A copy of the states with a preset and any manual overrides applied.
 * Overrides win over the preset. Entities that do not exist are skipped.
 */
export const simulateStates = (
  states: HassEntities,
  preset: SimulationPreset,
  overrides: StateOverride[] = []
): Simulation => {
  const result: HassEntities = { ...states };
  const changed = new Set<string>();
  if (preset !== "now") {
    Object.values(states).forEach((entity) => {
      const change = presetChange(preset, entity);
      if (change && change.state !== entity.state) {
        result[entity.entity_id] = withState(
          entity,
          change.state,
          change.attributes
        );
        changed.add(entity.entity_id);
      }
    });
  }
  overrides.forEach(({ entityId, state }) => {
    const entity = states[entityId];
    if (entity && state) {
      result[entityId] = withState(entity, state);
      if (state !== entity.state) {
        changed.add(entityId);
      } else {
        changed.delete(entityId);
      }
    }
  });
  return { states: result, changed: [...changed] };
};

/** The entities in `changed` that the given entity list uses. */
export const changedAmong = (changed: string[], used: string[]): string[] => {
  const set = new Set(used);
  return changed.filter((id) => set.has(id));
};
