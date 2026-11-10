import { describe, expect, it } from "vitest";
import {
  contrast,
  contrastGrade,
  formatColor,
  hsvToRgb,
  nearestNamed,
  parseColor,
  rgbToHsv,
  rgbToLab,
  rgbToOklch,
} from "../../../src/common/color/translate-color";

// Protects the colour translator: the numbers it writes are what other
// software reads, so they are checked against published values and against
// what a browser computes for the same colour.

describe("formatColor", () => {
  it("writes one colour in every notation", () => {
    expect(formatColor({ r: 0, g: 99, b: 155, a: 1 })).toEqual({
      hex: "#00639B",
      hex8: "#00639BFF",
      rgb: "rgb(0 99 155 / 100%)",
      hsl: "hsl(202 100% 30% / 100%)",
      hsv: "hsv(202 100% 61%)",
      hwb: "hwb(202 0% 39% / 100%)",
      // The two below are what Chrome computes for this colour.
      oklch: "oklch(48.1% 0.118 243.8 / 100%)",
      lab: "lab(39.5 -8.2 -38 / 100%)",
      cmyk: "100 36 0 39",
    });
  });

  it("carries alpha", () => {
    const formats = formatColor({ r: 255, g: 0, b: 0, a: 0.5 });
    expect(formats.hex8).toBe("#FF000080");
    expect(formats.rgb).toBe("rgb(255 0 0 / 50%)");
  });
});

describe("conversions", () => {
  it("match published OKLCH and CIELAB values", () => {
    const [l, c, h] = rgbToOklch(255, 0, 0);
    expect(l).toBeCloseTo(0.628, 3);
    expect(c).toBeCloseTo(0.2577, 3);
    expect(h).toBeCloseTo(29.23, 1);
    const [ll, la, lb] = rgbToLab(255, 255, 255);
    expect(ll).toBeCloseTo(100, 1);
    expect(la).toBeCloseTo(0, 1);
    expect(lb).toBeCloseTo(0, 1);
    expect(rgbToOklch(128, 128, 128)[1]).toBeCloseTo(0, 3);
  });

  it("go to HSV and back for every corner of the cube", () => {
    for (const r of [0, 255]) {
      for (const g of [0, 255]) {
        for (const b of [0, 255]) {
          expect(hsvToRgb(rgbToHsv(r, g, b))).toEqual([r, g, b]);
        }
      }
    }
    expect(hsvToRgb(rgbToHsv(0, 99, 155))).toEqual([0, 99, 155]);
  });
});

describe("parseColor", () => {
  it("reads hex in every length", () => {
    expect(parseColor("#00639b")).toEqual({ r: 0, g: 99, b: 155, a: 1 });
    expect(parseColor("f00")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("#ff000080")?.a).toBeCloseTo(0.502, 3);
    expect(parseColor("#f008")?.a).toBeCloseTo(0.533, 3);
  });

  it("reads rgb() and hsl()", () => {
    expect(parseColor("rgb(0 99 155)")).toEqual({ r: 0, g: 99, b: 155, a: 1 });
    expect(parseColor("rgba(0, 99, 155, 0.5)")).toEqual({
      r: 0,
      g: 99,
      b: 155,
      a: 0.5,
    });
    expect(parseColor("hsl(0 100% 50%)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("hsl(120 100% 25% / 40%)")).toEqual({
      r: 0,
      g: 128,
      b: 0,
      a: 0.4,
    });
  });

  it("does not guess", () => {
    expect(parseColor("ocean")).toBeUndefined();
    expect(parseColor("#12")).toBeUndefined();
    expect(parseColor("rgb(1 2)")).toBeUndefined();
    expect(parseColor("hsl(10 20 30)")).toBeUndefined();
  });
});

describe("contrast", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrast([0, 99, 155], [0, 99, 155])).toBe(1);
  });

  it("grades by the WCAG thresholds", () => {
    expect(contrastGrade(contrast([255, 255, 255], [0, 99, 155]))).toBe("all");
    expect(contrastGrade(3.2)).toBe("large");
    expect(contrastGrade(2.9)).toBe("none");
  });
});

describe("nearestNamed", () => {
  it("names an exact match and the closest otherwise", () => {
    expect(nearestNamed(70, 130, 180)).toEqual({
      name: "steelblue",
      hex: "#4682B4",
      exact: true,
    });
    expect(nearestNamed(255, 2, 1).name).toBe("red");
    expect(nearestNamed(255, 2, 1).exact).toBe(false);
  });
});
