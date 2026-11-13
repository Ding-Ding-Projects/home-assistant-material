import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  parseColor,
} from "../../../../../src/panels/lovelace/editor/tools/contrast";
import {
  activeThemeColors,
  nearestReadable,
  rgbaToHex,
} from "../../../../../src/panels/lovelace/editor/tools/dark-readability";

// The fix offered for hard-to-read text must really reach the contrast the
// check asks for, and keep the colour close to what the person chose.

const rgba = (value: string) => parseColor(value)!;

describe("dark readability fix", () => {
  it("moves a dim colour toward white until it reaches the required contrast", () => {
    const background = rgba("rgb(28, 28, 30)");
    const dim = rgba("rgb(90, 90, 100)");
    expect(contrastRatio(dim, background)).toBeLessThan(4.5);
    const fixed = nearestReadable(dim, background, 4.5);
    const fixedColor = rgba(
      `rgb(${parseInt(fixed.slice(1, 3), 16)}, ${parseInt(fixed.slice(3, 5), 16)}, ${parseInt(fixed.slice(5, 7), 16)})`
    );
    expect(contrastRatio(fixedColor, background)).toBeGreaterThanOrEqual(4.5);
    // It stays as close as it can to the colour that was chosen.
    expect(fixedColor.r).toBeLessThan(200);
  });

  it("moves toward black on a light background", () => {
    const fixed = nearestReadable(
      rgba("rgb(200, 200, 200)"),
      rgba("rgb(255, 255, 255)"),
      4.5
    );
    expect(parseInt(fixed.slice(1, 3), 16)).toBeLessThan(200);
  });

  it("writes colours as six digit hex", () => {
    expect(rgbaToHex({ r: 255, g: 0, b: 16.4, a: 1 })).toBe("#ff0010");
  });
});

describe("theme colours in use", () => {
  it("combines the theme with the colours of the current mode", () => {
    const themes = {
      theme: "Night",
      darkMode: true,
      default_theme: "default",
      themes: {
        Night: {
          "primary-color": "#112233",
          "text-primary-color": "#ffffff",
          "accent-color": "#ff0000",
          "primary-text-color": "#222222",
          modes: { dark: { "primary-text-color": "#334455" } },
        },
      },
    };
    const result = activeThemeColors({ themes } as any);
    expect(result?.theme).toBe("Night");
    expect(result?.colors["primary-text-color"]).toBe("#334455");
  });

  it("has nothing for the default theme", () => {
    expect(
      activeThemeColors({
        themes: {
          theme: "default",
          darkMode: true,
          default_theme: "default",
          themes: {},
        },
      } as any)
    ).toBeUndefined();
  });
});
