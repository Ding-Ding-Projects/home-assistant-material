import { describe, expect, it } from "vitest";
import {
  areaOf,
  featuredClimate,
  featuredRoom,
  lockFacts,
  playingMedia,
  recentHomeChanges,
} from "../../../src/common/home/home-hero";

// Protects the large cards on Home: which room is featured, what its
// lights add up to, and that an area is found through an entity's device.

const entity = (entity_id: string, state: string, attributes = {}) =>
  ({ entity_id, state, attributes }) as any;

const states = (...list: any[]) =>
  Object.fromEntries(list.map((stateObj) => [stateObj.entity_id, stateObj]));

const dim = { supported_color_modes: ["brightness"] };

describe("areaOf", () => {
  it("uses the entity's area, then its device's", () => {
    const entities = {
      "light.a": { area_id: "living" },
      "light.b": { device_id: "d1" },
      "light.c": {},
    };
    const devices = { d1: { area_id: "kitchen" } };
    expect(areaOf("light.a", entities, devices)).toBe("living");
    expect(areaOf("light.b", entities, devices)).toBe("kitchen");
    expect(areaOf("light.c", entities, devices)).toBeUndefined();
    expect(areaOf("light.none", entities, devices)).toBeUndefined();
  });
});

describe("featuredRoom", () => {
  const entities = {
    "light.ceiling": { area_id: "living" },
    "light.shelf": { area_id: "living" },
    "light.lamp": { area_id: "living" },
    "light.counter": { area_id: "kitchen" },
    "light.hidden": { area_id: "kitchen", hidden: true },
    "light.loose": {},
  };

  it("features the room with the most lights and adds them up", () => {
    const room = featuredRoom(
      states(
        entity("light.ceiling", "on", { ...dim, brightness: 255 }),
        entity("light.shelf", "on", { ...dim, brightness: 153 }),
        entity("light.lamp", "off", dim),
        entity("light.counter", "on"),
        entity("light.hidden", "on"),
        entity("light.loose", "on")
      ),
      entities,
      {}
    );
    expect(room).toEqual({
      areaId: "living",
      lights: ["light.ceiling", "light.shelf", "light.lamp"],
      on: ["light.ceiling", "light.shelf"],
      dimmable: ["light.ceiling", "light.shelf", "light.lamp"],
      brightness: 80,
    });
  });

  it("gives no brightness when no light that is on can be dimmed", () => {
    const room = featuredRoom(
      states(
        entity("light.ceiling", "on", { supported_color_modes: ["onoff"] }),
        entity("light.shelf", "off", dim)
      ),
      entities,
      {}
    );
    expect(room?.brightness).toBeUndefined();
    expect(room?.dimmable).toEqual(["light.shelf"]);
  });

  it("features nothing when no light is in an area", () => {
    expect(
      featuredRoom(states(entity("light.loose", "on")), entities, {})
    ).toBe(undefined);
  });
});

describe("the other cards", () => {
  it("picks the first thermostat by id", () => {
    expect(
      featuredClimate(
        states(
          entity("climate.upstairs", "heat"),
          entity("climate.downstairs", "off"),
          entity("climate.gone", "unavailable")
        ),
        {}
      )
    ).toBe("climate.downstairs");
  });

  it("lists the locks that are not locked", () => {
    expect(
      lockFacts(
        states(
          entity("lock.front", "locked"),
          entity("lock.back", "unlocking")
        ),
        {}
      )
    ).toEqual({
      locks: ["lock.front", "lock.back"],
      unlocked: ["lock.back"],
    });
    expect(lockFacts(states(entity("light.a", "on")), {})).toBeUndefined();
  });

  it("finds a player that is playing or paused", () => {
    expect(
      playingMedia(
        states(
          entity("media_player.tv", "off"),
          entity("media_player.kitchen", "paused")
        ),
        {}
      )
    ).toBe("media_player.kitchen");
  });
});

describe("recentHomeChanges", () => {
  it("shows five newest visible state changes and retains recorded cause", () => {
    const events = Array.from({ length: 8 }, (_, when) => ({
      when,
      entity_id: "light.hall",
      state: "on",
      context_entity_id: "automation.arrive",
    }));
    const visible = states(
      entity("light.hall", "off"),
      entity("lock.secret", "locked")
    );
    const result = recentHomeChanges(
      [
        ...events,
        { when: 99, entity_id: "light.gone", state: "off" },
        { when: 98, entity_id: "lock.secret", state: "locked" },
        { when: 97, entity_id: "light.hall" },
      ],
      visible,
      { "lock.secret": { hidden: true } }
    );
    expect(result.map((row) => row.when)).toEqual([7, 6, 5, 4, 3]);
    expect(result[0].context_entity_id).toBe("automation.arrive");
  });
});
