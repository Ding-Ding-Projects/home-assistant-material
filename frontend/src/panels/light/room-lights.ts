import type { HassEntity } from "home-assistant-js-websocket";

export interface RoomLightsSummary {
  lights: string[];
  on: string[];
  /** Lights whose brightness can be set. */
  dimmable: string[];
  /** Mean brightness of the dimmable lights that are on, 0 to 100. */
  brightness?: number;
}

const canDim = (light: HassEntity): boolean => {
  const modes = light.attributes.supported_color_modes;
  return Array.isArray(modes) && modes.some((mode) => mode !== "onoff");
};

/** The lights of one room: which are on, which can be dimmed, and how bright they are. */
export const summariseRoomLights = (
  lights: HassEntity[]
): RoomLightsSummary => {
  const on = lights.filter((light) => light.state === "on");
  const levels = on
    .filter(canDim)
    .map((light) => Number(light.attributes.brightness))
    .filter((level) => Number.isFinite(level));
  return {
    lights: lights.map((light) => light.entity_id),
    on: on.map((light) => light.entity_id),
    dimmable: lights.filter(canDim).map((light) => light.entity_id),
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
