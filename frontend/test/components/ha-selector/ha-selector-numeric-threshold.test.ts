import { describe, expect, it } from "vitest";
import { getDefaultThresholdUnit } from "../../../src/components/ha-selector/ha-selector-numeric-threshold";

describe("getDefaultThresholdUnit", () => {
  it("uses the first unit", () => {
    expect(getDefaultThresholdUnit(["°C", "°F"])).toBe("°C");
  });

  it("skips a leading null so the server never sees a missing unit", () => {
    expect(getDefaultThresholdUnit([null, "W", "kW"])).toBe("W");
  });

  it("prefers the base unit over a smaller one listed first", () => {
    expect(getDefaultThresholdUnit(["mW", "W", "kW"])).toBe("W");
    expect(getDefaultThresholdUnit(["mm", "cm", "m"])).toBe("m");
    expect(getDefaultThresholdUnit(["bar", "psi"])).toBe("bar");
  });

  it("returns undefined for an empty or missing list", () => {
    expect(getDefaultThresholdUnit([])).toBeUndefined();
    expect(getDefaultThresholdUnit(undefined)).toBeUndefined();
  });
});
