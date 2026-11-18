import { describe, expect, it } from "vitest";
import {
  numericStateRange,
  thresholdNumberSelector,
} from "../../../../src/panels/config/automation/numeric-state-range";
import type { HomeAssistant } from "../../../../src/types";

const hass = (states: Record<string, any>) =>
  ({
    states: Object.fromEntries(
      Object.entries(states).map(([id, attributes]) => [
        id,
        { entity_id: id, state: "1", attributes },
      ])
    ),
  }) as unknown as HomeAssistant;

describe("numericStateRange", () => {
  it("takes a number entity's own limits", () => {
    const h = hass({
      "number.a": { min: 0, max: 40, step: 2, unit_of_measurement: "°C" },
    });
    expect(numericStateRange(h, "number.a")).toEqual({
      min: 0,
      max: 40,
      step: 2,
      unit: "°C",
    });
  });

  it("merges several entities and drops a unit they disagree on", () => {
    const h = hass({
      "number.a": { min: 0, max: 40, step: 1, unit_of_measurement: "°C" },
      "number.b": { min: -10, max: 100, step: 0.5, unit_of_measurement: "%" },
    });
    expect(numericStateRange(h, ["number.a", "number.b"])).toEqual({
      min: -10,
      max: 100,
      step: 0.5,
      unit: undefined,
    });
  });

  it("gives no range when one entity cannot report one", () => {
    const h = hass({
      "number.a": { min: 0, max: 40 },
      "sensor.t": { unit_of_measurement: "W" },
    });
    expect(numericStateRange(h, ["number.a", "sensor.t"])).toBeUndefined();
  });

  it("reads a percent sensor and a climate attribute", () => {
    const h = hass({
      "sensor.b": { device_class: "battery", unit_of_measurement: "%" },
      "climate.c": { min_temp: 7, max_temp: 35, target_temp_step: 1 },
    });
    expect(numericStateRange(h, "sensor.b")?.max).toBe(100);
    expect(numericStateRange(h, "climate.c", "temperature")).toMatchObject({
      min: 7,
      max: 35,
      step: 1,
    });
  });

  it("uses a slider only when a range is known", () => {
    expect(thresholdNumberSelector().number.mode).toBe("box");
    expect(
      thresholdNumberSelector({ min: 0, max: 10, step: 1 }).number.mode
    ).toBe("slider");
  });
});
