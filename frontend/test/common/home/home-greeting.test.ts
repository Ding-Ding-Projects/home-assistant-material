import { describe, expect, it } from "vitest";
import {
  greetingTime,
  homeFacts,
  homeScenes,
} from "../../../src/common/home/home-greeting";

// Protects the sentence at the top of Home: it must say only what the
// instance reports, and leave a part out when it cannot be known.

const entity = (entity_id: string, state: string, attributes = {}) =>
  ({ entity_id, state, attributes }) as any;

const states = (...list: any[]) =>
  Object.fromEntries(list.map((stateObj) => [stateObj.entity_id, stateObj]));

describe("greetingTime", () => {
  it.each([
    [4, "night"],
    [5, "morning"],
    [11, "morning"],
    [12, "afternoon"],
    [17, "afternoon"],
    [18, "evening"],
    [22, "evening"],
    [23, "night"],
    [0, "night"],
  ])("hour %i is %s", (hour, expected) => {
    expect(greetingTime(hour)).toBe(expected);
  });
});

describe("homeFacts", () => {
  it("counts lights that are on, without hidden or unavailable ones", () => {
    const facts = homeFacts(
      states(
        entity("light.a", "on"),
        entity("light.b", "off"),
        entity("light.hidden", "on"),
        entity("light.gone", "unavailable"),
        entity("switch.lightish", "on")
      ),
      { "light.hidden": { hidden: true } },
      {}
    );
    expect(facts.lightsOn).toBe(1);
  });

  it("says nothing about lights, locks or temperature a home does not have", () => {
    expect(homeFacts(states(entity("sensor.x", "5")), {}, {})).toEqual({});
  });

  it("takes the mean of the temperatures the areas point at", () => {
    const facts = homeFacts(
      states(
        entity("sensor.living", "21", { unit_of_measurement: "°C" }),
        entity("sensor.bed", "20", { unit_of_measurement: "°C" }),
        entity("sensor.attic", "unavailable", { unit_of_measurement: "°C" }),
        entity("sensor.other", "30", { unit_of_measurement: "°C" })
      ),
      {},
      {
        living: { temperature_entity_id: "sensor.living" },
        bed: { temperature_entity_id: "sensor.bed" },
        attic: { temperature_entity_id: "sensor.attic" },
        hall: { temperature_entity_id: null },
      }
    );
    expect(facts.inside).toEqual({ temperature: 20.5, unit: "°C" });
  });

  it("gives no temperature when the areas use different units", () => {
    const facts = homeFacts(
      states(
        entity("sensor.a", "21", { unit_of_measurement: "°C" }),
        entity("sensor.b", "70", { unit_of_measurement: "°F" })
      ),
      {},
      {
        a: { temperature_entity_id: "sensor.a" },
        b: { temperature_entity_id: "sensor.b" },
      }
    );
    expect(facts.inside).toBeUndefined();
  });

  it("counts a lock that is not locked as unlocked", () => {
    const facts = homeFacts(
      states(
        entity("lock.front", "locked"),
        entity("lock.back", "unlocked"),
        entity("lock.garage", "jammed")
      ),
      {},
      {}
    );
    expect(facts.locks).toEqual({ total: 3, unlocked: 2 });
  });
});

describe("homeScenes", () => {
  it("offers the most recently used scenes first, then by name", () => {
    const scenes = homeScenes(
      states(
        entity("scene.leaving", "unknown", { friendly_name: "Leaving" }),
        entity("scene.movie", "2026-11-09T20:00:00+00:00"),
        entity("scene.night", "2026-11-08T22:00:00+00:00"),
        entity("scene.away", "unknown", { friendly_name: "Away" }),
        entity("scene.hidden", "2026-11-10T08:00:00+00:00")
      ),
      { "scene.hidden": { hidden: true } }
    );
    expect(scenes).toEqual(["scene.movie", "scene.night", "scene.away"]);
  });
});
