import { describe, expect, it } from "vitest";
import { summariseLights } from "../../../src/panels/light/light-summary";
import { summariseRoomLights } from "../../../src/panels/light/room-lights";

// Protects the Lights page: the count at the top (hidden and unavailable
// lights are not counted, an area found through a device counts) and a room's
// brightness (only dimmable lights that are on).

const light = (entity_id: string, state: string, attributes = {}) =>
  ({ entity_id, state, attributes }) as any;

describe("summariseLights", () => {
  it("counts lights that are on, all lights and their areas", () => {
    const states = Object.fromEntries(
      [
        light("light.a", "on"),
        light("light.b", "off"),
        light("light.c", "on"),
        light("light.hidden", "on"),
        light("light.gone", "unavailable"),
        light("switch.x", "on"),
      ].map((stateObj) => [stateObj.entity_id, stateObj])
    );
    const summary = summariseLights(
      states,
      {
        "light.a": { area_id: "living" },
        "light.b": { device_id: "d1" },
        "light.c": {},
        "light.hidden": { hidden: true, area_id: "attic" },
      },
      { d1: { area_id: "kitchen" } }
    );
    expect(summary).toEqual({
      on: ["light.a", "light.c"],
      total: 3,
      areas: 2,
    });
  });
});

describe("summariseRoomLights", () => {
  it("averages the brightness of dimmable lights that are on", () => {
    const dim = { supported_color_modes: ["brightness"] };
    const room = summariseRoomLights([
      light("light.a", "on", { ...dim, brightness: 255 }),
      light("light.b", "on", { ...dim, brightness: 128 }),
      light("light.c", "off", dim),
      light("light.d", "on", { supported_color_modes: ["onoff"] }),
    ]);
    expect(room.on).toEqual(["light.a", "light.b", "light.d"]);
    expect(room.dimmable).toEqual(["light.a", "light.b", "light.c"]);
    expect(room.brightness).toBe(75);
  });

  it("gives no brightness when no dimmable light is on", () => {
    expect(
      summariseRoomLights([light("light.a", "off", {})]).brightness
    ).toBeUndefined();
  });
});
