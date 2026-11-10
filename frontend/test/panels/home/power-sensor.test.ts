import { describe, expect, it } from "vitest";
import { powerSensor } from "../../../src/panels/home/power-sensor";

// Protects "Power right now" on Home: the home's own sensor wins over the
// grid's, and a sensor that is unavailable, not a number, or has no unit is
// never shown as a reading.

const sensor = (state: string, unit?: string) =>
  ({ state, attributes: unit ? { unit_of_measurement: unit } : {} }) as any;

const prefs = (...sources: any[]) => ({ energy_sources: sources }) as any;

describe("powerSensor", () => {
  it("prefers the home sensor, then the grid", () => {
    const states = {
      "sensor.home": sensor("2400", "W"),
      "sensor.grid": sensor("700", "W"),
    };
    expect(
      powerSensor(
        prefs(
          { type: "grid", stat_rate: "sensor.grid" },
          { type: "home", stat_rate: "sensor.home" }
        ),
        states
      )
    ).toBe("sensor.home");
    expect(
      powerSensor(prefs({ type: "grid", stat_rate: "sensor.grid" }), states)
    ).toBe("sensor.grid");
  });

  it("skips sensors that cannot be read", () => {
    const states = {
      "sensor.a": sensor("unavailable", "W"),
      "sensor.b": sensor("abc", "W"),
      "sensor.c": sensor("5"),
    };
    expect(
      powerSensor(
        prefs(
          { type: "home", stat_rate: "sensor.a" },
          { type: "home", stat_rate: "sensor.b" },
          { type: "grid", stat_rate: "sensor.c" },
          { type: "solar", stat_rate: "sensor.missing" }
        ),
        states
      )
    ).toBeUndefined();
  });
});
