import { describe, expect, it } from "vitest";
import {
  hex2rgb,
  lab2rgb,
  rgb2lab,
} from "../../../src/common/color/convert-color";
import {
  COLOR_NAME_KEY_PREFIX,
  gamutOfLab,
  gamutOfRgb,
  NAMED_PALETTE,
  nearestNamedByLab,
  nearestNamedColour,
} from "../../../src/common/color/named-palette";

describe("named palette", () => {
  it("holds 48 distinct named colours with label keys", () => {
    expect(NAMED_PALETTE).toHaveLength(48);
    expect(new Set(NAMED_PALETTE.map((c) => c.id)).size).toBe(48);
    expect(new Set(NAMED_PALETTE.map((c) => c.hex)).size).toBe(48);
    NAMED_PALETTE.forEach((colour) => {
      expect(colour.hex).toMatch(/^#[0-9a-f]{6}$/);
      expect(colour.labelKey).toBe(`${COLOR_NAME_KEY_PREFIX}${colour.id}`);
    });
  });
});

describe("nearestNamedColour", () => {
  it("finds every palette colour from its own value, at distance zero", () => {
    NAMED_PALETTE.forEach((colour) => {
      const result = nearestNamedColour(hex2rgb(colour.hex));
      expect(result.colour.id).toBe(colour.id);
      expect(result.distance).toBeCloseTo(0, 6);
    });
  });

  it("finds the closest named colour for in-between colours", () => {
    // One step off Material red 500.
    expect(nearestNamedColour(hex2rgb("#f44337")).colour.id).toBe("red_500");
    // A blue between Material blue 500 and 700, nearer to 500.
    expect(nearestNamedColour(hex2rgb("#2a8ae8")).colour.id).toBe("blue_500");
    // A very dark green.
    expect(nearestNamedColour(hex2rgb("#1c5f22")).colour.id).toBe("green_900");
    // Pure white is nearer the palest tone of a light family than any dark one.
    const white = nearestNamedColour([255, 255, 255]);
    expect(white.distance).toBeGreaterThan(0);
    expect(white.colour.tone).toBe(300);
  });

  it("names neutrals as greys, never as the nearest tinted family", () => {
    // Pure black used to be called "Deepest teal" because that was the nearest.
    expect(nearestNamedColour([0, 0, 0]).nameId).toBe("neutral_black");
    expect(nearestNamedColour([255, 255, 255]).nameId).toBe("neutral_white");
    expect(nearestNamedColour([128, 128, 128]).nameId).toBe("neutral_grey");
    expect(nearestNamedColour([60, 60, 60]).nameId).toBe("neutral_dark_grey");
    expect(nearestNamedColour([200, 200, 200]).nameId).toBe(
      "neutral_light_grey"
    );
  });

  it("keeps the palette name for tinted colours and exact matches", () => {
    expect(nearestNamedColour(hex2rgb("#f44337")).nameId).toBe("red_500");
    NAMED_PALETTE.forEach((colour) => {
      expect(nearestNamedColour(hex2rgb(colour.hex)).nameId).toBe(colour.id);
    });
  });

  it("measures in Lab space", () => {
    const lab = rgb2lab(hex2rgb("#4caf50"));
    expect(nearestNamedByLab(lab).colour.id).toBe("green_500");
  });
});

describe("gamut", () => {
  it("puts ordinary colours inside sRGB", () => {
    expect(gamutOfRgb([0, 0, 0])).toBe("srgb");
    expect(gamutOfRgb([255, 255, 255])).toBe("srgb");
    expect(gamutOfRgb([255, 0, 0])).toBe("srgb");
    expect(gamutOfLab(rgb2lab([20, 120, 220]))).toBe("srgb");
    expect(gamutOfLab([50, 0, 0])).toBe("srgb");
  });

  it("finds colours beyond sRGB but inside Display P3", () => {
    // A little beyond sRGB red: the unclamped result of a vivid Lab colour.
    expect(gamutOfRgb([-10, 128, 128])).toBe("p3");
    expect(gamutOfLab([50, 80, 60])).toBe("p3");
  });

  it("finds colours beyond Display P3", () => {
    expect(gamutOfRgb([-200, 255, 0])).toBe("outside");
    expect(gamutOfLab([50, 120, 90])).toBe("outside");
  });

  it("agrees with the unrounded Lab conversion at the edge", () => {
    // A colour that comes back from Lab with a component below 0 is outside.
    const rgb = lab2rgb([50, 100, 60]);
    expect(Math.min(...rgb) < 0 || Math.max(...rgb) > 255).toBe(true);
    expect(gamutOfLab([50, 100, 60])).not.toBe("srgb");
  });
});
