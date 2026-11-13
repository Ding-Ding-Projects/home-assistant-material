import { describe, expect, it } from "vitest";
import {
  compose,
  contrastRatio,
  parseColor,
  requiredContrast,
} from "../../../../../src/panels/lovelace/editor/tools/contrast";

describe("contrast", () => {
  it("parses computed colours", () => {
    expect(parseColor("rgb(255, 0, 0)")).toEqual({ r: 255, g: 0, b: 0, a: 1 });
    expect(parseColor("rgba(0, 0, 0, 0.5)")?.a).toBe(0.5);
    expect(parseColor("color(srgb 1 1 1 / 50%)")).toEqual({
      r: 255,
      g: 255,
      b: 255,
      a: 0.5,
    });
    expect(parseColor("linear-gradient(red, blue)")).toBeUndefined();
  });

  it("computes the WCAG ratio", () => {
    const black = { r: 0, g: 0, b: 0, a: 1 };
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
  });

  it("layers transparent colours", () => {
    const out = compose(
      { r: 0, g: 0, b: 0, a: 0.5 },
      { r: 255, g: 255, b: 255, a: 1 }
    );
    expect(out.a).toBe(1);
    expect(Math.round(out.r)).toBe(128);
  });

  it("asks less of large text", () => {
    expect(requiredContrast(14, 400)).toBe(4.5);
    expect(requiredContrast(24, 400)).toBe(3);
    expect(requiredContrast(19, 700)).toBe(3);
  });
});
