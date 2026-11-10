import type { HassEntities, HassEntity } from "home-assistant-js-websocket";

/**
 * What the large cards on the Home page show, read from the instance: the
 * lights of the room that has the most of them, the first thermostat, and
 * the locks.
 */

interface EntityEntry {
  area_id?: string | null;
  device_id?: string | null;
  hidden?: boolean;
}

interface DeviceEntry {
  area_id?: string | null;
}

const UNKNOWN = new Set(["unavailable", "unknown"]);

/** The area an entity is in: its own, or the one of its device. */
export const areaOf = (
  entityId: string,
  entities: Record<string, EntityEntry | undefined>,
  devices: Record<string, DeviceEntry | undefined>
): string | undefined => {
  const entry = entities[entityId];
  if (!entry) {
    return undefined;
  }
  return (
    entry.area_id ||
    (entry.device_id ? devices[entry.device_id]?.area_id : undefined) ||
    undefined
  );
};

const shown = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  domain: string
): HassEntity[] =>
  Object.values(states).filter(
    (stateObj) =>
      stateObj.entity_id.startsWith(`${domain}.`) &&
      !entities[stateObj.entity_id]?.hidden &&
      !UNKNOWN.has(stateObj.state)
  );

const canDim = (light: HassEntity): boolean => {
  const modes = light.attributes.supported_color_modes;
  return Array.isArray(modes) && modes.some((mode) => mode !== "onoff");
};

export interface RoomLights {
  areaId: string;
  lights: string[];
  on: string[];
  /** Lights whose brightness can be set. */
  dimmable: string[];
  /** Mean brightness of the dimmable lights that are on, 0 to 100. */
  brightness?: number;
}

/** The lights of every area, by area. */
export const lightsByArea = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  devices: Record<string, DeviceEntry | undefined>
): Record<string, HassEntity[]> => {
  const byArea: Record<string, HassEntity[]> = {};
  shown(states, entities, "light").forEach((light) => {
    const area = areaOf(light.entity_id, entities, devices);
    if (area) {
      (byArea[area] ??= []).push(light);
    }
  });
  return byArea;
};

/** The room to feature: the one with the most lights, the first by id on a tie. */
export const featuredRoom = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>,
  devices: Record<string, DeviceEntry | undefined>
): RoomLights | undefined => {
  const byArea = lightsByArea(states, entities, devices);
  const areaId = Object.keys(byArea).sort(
    (a, b) => byArea[b].length - byArea[a].length || a.localeCompare(b)
  )[0];
  if (!areaId) {
    return undefined;
  }
  const lights = byArea[areaId];
  const on = lights.filter((light) => light.state === "on");
  const dimmable = lights.filter(canDim);
  const levels = on
    .filter(canDim)
    .map((light) => Number(light.attributes.brightness))
    .filter((level) => Number.isFinite(level));
  return {
    areaId,
    lights: lights.map((light) => light.entity_id),
    on: on.map((light) => light.entity_id),
    dimmable: dimmable.map((light) => light.entity_id),
    brightness: levels.length
      ? Math.round(
          (levels.reduce((sum, level) => sum + level, 0) /
            levels.length /
            255) *
            100
        )
      : undefined,
  };
};

/** The thermostat to feature: the first one, by id. */
export const featuredClimate = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>
): string | undefined =>
  shown(states, entities, "climate")
    .map((climate) => climate.entity_id)
    .sort()[0];

export interface LockFacts {
  locks: string[];
  unlocked: string[];
}

export const lockFacts = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>
): LockFacts | undefined => {
  const locks = shown(states, entities, "lock");
  if (!locks.length) {
    return undefined;
  }
  return {
    locks: locks.map((lock) => lock.entity_id),
    unlocked: locks
      .filter((lock) => lock.state !== "locked")
      .map((lock) => lock.entity_id),
  };
};

/** The media player that is playing now, the first by id. */
export const playingMedia = (
  states: HassEntities,
  entities: Record<string, EntityEntry | undefined>
): string | undefined =>
  shown(states, entities, "media_player")
    .filter((player) => player.state === "playing" || player.state === "paused")
    .map((player) => player.entity_id)
    .sort()[0];
