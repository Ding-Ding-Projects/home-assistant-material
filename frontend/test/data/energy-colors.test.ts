import { afterEach, describe, expect, it } from "vitest";
import {
  getEnergyColorOverride,
  normalizeEnergyColors,
  resolveEnergyColor,
  setEnergyColorOverrides,
  withEnergyColor,
} from "../../src/data/energy-colors";

describe("energy colors", () => {
  afterEach(() => setEnergyColorOverrides(undefined));

  it("keeps only #rrggbb entries", () => {
    expect(
      normalizeEnergyColors({
        "sensor.a": "#E0A32A",
        "sensor.b": "red",
        "sensor.c": "#fff",
        "sensor.d": 5,
      })
    ).toEqual({ "sensor.a": "#e0a32a" });
    expect(normalizeEnergyColors(undefined)).toEqual({});
    expect(normalizeEnergyColors("nope")).toEqual({});
  });

  it("resolves a chosen color or falls back to the theme color", () => {
    setEnergyColorOverrides({ "sensor.solar": "#e0a32a" });
    expect(resolveEnergyColor("sensor.solar", "#112233")).toBe("#e0a32a");
    expect(resolveEnergyColor("sensor.grid", "#112233")).toBe("#112233");
    expect(resolveEnergyColor(undefined, "#112233")).toBe("#112233");
    expect(getEnergyColorOverride("sensor.grid")).toBeUndefined();
  });

  it("sets and clears one entry without touching the others", () => {
    const start = { "sensor.a": "#111111" };
    expect(withEnergyColor(start, "sensor.b", "#222222")).toEqual({
      "sensor.a": "#111111",
      "sensor.b": "#222222",
    });
    expect(withEnergyColor(start, "sensor.a")).toEqual({});
    expect(withEnergyColor(start, "sensor.a", "bad")).toEqual({});
    expect(start).toEqual({ "sensor.a": "#111111" });
  });
});
