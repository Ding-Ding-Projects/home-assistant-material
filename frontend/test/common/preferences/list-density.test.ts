import { describe, expect, it } from "vitest";
import {
  applyListDensity,
  DEFAULT_LIST_DENSITY,
  LIST_DENSITIES,
  LIST_DENSITY_VARIABLES,
  LIST_ROW_MIN_TOUCH_TARGET,
  normalizeListDensity,
} from "../../../src/common/preferences/list-density";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  normalizePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";

describe("list density", () => {
  it("defaults to compact", () => {
    expect(DEFAULT_LIST_DENSITY).toBe("compact");
    expect(DEFAULT_PERSONAL_PREFERENCES.listDensity).toBe("compact");
    expect(normalizePersonalPreferences({}).listDensity).toBe("compact");
  });

  it("keeps a valid stored value and falls back for an unknown one", () => {
    expect(
      normalizePersonalPreferences({ listDensity: "cosy" }).listDensity
    ).toBe("cosy");
    for (const bad of ["tiny", 3, null, undefined, {}]) {
      expect(normalizeListDensity(bad)).toBe("compact");
      expect(
        normalizePersonalPreferences({ listDensity: bad as any }).listDensity
      ).toBe("compact");
    }
  });

  it("sets the variables of each density on the root", () => {
    for (const density of LIST_DENSITIES) {
      const root = document.createElement("div");
      applyListDensity(density, root);
      for (const [name, value] of Object.entries(
        LIST_DENSITY_VARIABLES[density]
      )) {
        expect(root.style.getPropertyValue(name)).toBe(value);
      }
      expect(root.getAttribute("data-list-density")).toBe(density);
    }
  });

  it("uses the agreed sizes and never goes under the touch target", () => {
    expect(LIST_DENSITY_VARIABLES.compact["--ha-list-row-min"]).toBe("52px");
    expect(LIST_DENSITY_VARIABLES.compact["--ha-list-row-max"]).toBe("60px");
    expect(LIST_DENSITY_VARIABLES.comfortable["--ha-list-row-min"]).toBe(
      "64px"
    );
    expect(LIST_DENSITY_VARIABLES.comfortable["--ha-list-row-gap"]).toBe("8px");
    for (const density of LIST_DENSITIES) {
      expect(
        parseInt(LIST_DENSITY_VARIABLES[density]["--ha-list-row-min"], 10)
      ).toBeGreaterThanOrEqual(LIST_ROW_MIN_TOUCH_TARGET);
    }
  });
});
