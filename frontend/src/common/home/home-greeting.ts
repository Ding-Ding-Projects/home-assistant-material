import type { HassEntities } from "home-assistant-js-websocket";

/**
 * What the Home page says at its top: a greeting for the time of day and
 * one sentence about the home, made from what the instance reports now.
 * Nothing here is made up: a part that cannot be known is left out.
 */

export type GreetingTime = "morning" | "afternoon" | "evening" | "night";

/** Which greeting fits an hour of the day, 0 to 23. */
export const greetingTime = (hour: number): GreetingTime => {
  if (hour >= 5 && hour < 12) {
    return "morning";
  }
  if (hour >= 12 && hour < 18) {
    return "afternoon";
  }
  if (hour >= 18 && hour < 23) {
    return "evening";
  }
  return "night";
};

export interface HomeFacts {
  /** Lights that are on, or undefined when the home has no lights. */
  lightsOn?: number;
  /** The mean of the temperatures the areas report, with its unit. */
  inside?: { temperature: number; unit: string };
  /** Locks in the home and how many are not locked. */
  locks?: { total: number; unlocked: number };
}

interface EntityEntry {
  hidden?: boolean;
}

interface AreaEntry {
  temperature_entity_id?: string | null;
}

const UNKNOWN = new Set(["unavailable", "unknown"]);

export const homeFacts = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  areas: Record<string, AreaEntry | undefined>
): HomeFacts => {
  const facts: HomeFacts = {};
  const shown = (domain: string) =>
    Object.values(states).filter(
      (stateObj) =>
        stateObj.entity_id.startsWith(`${domain}.`) &&
        !entities[stateObj.entity_id]?.hidden &&
        !UNKNOWN.has(stateObj.state)
    );

  const lights = shown("light");
  if (lights.length) {
    facts.lightsOn = lights.filter((light) => light.state === "on").length;
  }

  const readings = Object.values(areas)
    .map((area) => area?.temperature_entity_id)
    .filter((id): id is string => !!id)
    .map((id) => states[id])
    .filter(
      (stateObj) =>
        stateObj &&
        !UNKNOWN.has(stateObj.state) &&
        Number.isFinite(Number(stateObj.state))
    );
  const units = new Set(
    readings.map((stateObj) => stateObj.attributes.unit_of_measurement)
  );
  // A mean of readings in different units would mean nothing.
  if (readings.length && units.size === 1) {
    const unit = readings[0].attributes.unit_of_measurement;
    if (typeof unit === "string" && unit) {
      facts.inside = {
        temperature:
          readings.reduce((sum, stateObj) => sum + Number(stateObj.state), 0) /
          readings.length,
        unit,
      };
    }
  }

  const locks = shown("lock");
  if (locks.length) {
    facts.locks = {
      total: locks.length,
      unlocked: locks.filter((lock) => lock.state !== "locked").length,
    };
  }
  return facts;
};

/**
 * Scenes to offer on the Home page: the ones used most recently first,
 * then by name. A scene's state is when it was last activated.
 */
export const homeScenes = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  limit = 3
): string[] =>
  Object.values(states)
    .filter(
      (stateObj) =>
        stateObj.entity_id.startsWith("scene.") &&
        !entities[stateObj.entity_id]?.hidden &&
        stateObj.state !== "unavailable"
    )
    .sort((a, b) => {
      const aTime = Date.parse(a.state) || 0;
      const bTime = Date.parse(b.state) || 0;
      if (aTime !== bTime) {
        return bTime - aTime;
      }
      return String(a.attributes.friendly_name ?? a.entity_id).localeCompare(
        String(b.attributes.friendly_name ?? b.entity_id)
      );
    })
    .slice(0, limit)
    .map((stateObj) => stateObj.entity_id);
