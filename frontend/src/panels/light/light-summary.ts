import type { HassEntities } from "home-assistant-js-websocket";
import { areaOf } from "../../common/home/home-hero";

export interface LightSummary {
  /** Lights that are on. */
  on: string[];
  /** All the lights that report a state. */
  total: number;
  /** In how many areas the lights are. */
  areas: number;
}

interface EntityEntry {
  hidden?: boolean;
  area_id?: string | null;
  device_id?: string | null;
}

interface DeviceEntry {
  area_id?: string | null;
}

const UNKNOWN = new Set(["unavailable", "unknown"]);

/** What the lights page says about the lights: how many are on, of how many, in how many areas. */
export const summariseLights = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  devices: Record<string, DeviceEntry | undefined>
): LightSummary => {
  const lights = Object.values(states).filter(
    (stateObj) =>
      stateObj.entity_id.startsWith("light.") &&
      !entities[stateObj.entity_id]?.hidden &&
      !UNKNOWN.has(stateObj.state)
  );
  const areas = new Set<string>();
  for (const light of lights) {
    const area = areaOf(light.entity_id, entities, devices);
    if (area) {
      areas.add(area);
    }
  }
  return {
    on: lights
      .filter((light) => light.state === "on")
      .map((light) => light.entity_id),
    total: lights.length,
    areas: areas.size,
  };
};
