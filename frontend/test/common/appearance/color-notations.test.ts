import { describe, expect, it } from "vitest";
import {
  contrastReading,
  parseTypedColor,
  toLch,
  toNamed,
  toOklab,
} from "../../../src/common/appearance/color-notations";

// The colour picker tells a person whether a colour is readable on its
// surface. These protect that reading, and the two notations built here.

describe("contrastReading", () => {
  it("gives 21 to 1 for black on white and 1 to 1 for the same colour", () => {
    expect(contrastReading("#000000", "#ffffff")?.ratio).toBeCloseTo(21, 5);
    expect(contrastReading("#336699", "#336699")?.ratio).toBeCloseTo(1, 5);
  });

  it("grades by the WCAG thresholds", () => {
    // #767676 on white is the well-known 4.54 to 1 limit.
    expect(contrastReading("#767676", "#ffffff")?.grade).toBe("all");
    // #949494 on white is about 3 to 1: large text only.
    expect(contrastReading("#949494", "#ffffff")?.grade).toBe("large");
    expect(contrastReading("#cccccc", "#ffffff")?.grade).toBe("none");
  });

  it("is the same in both directions and refuses what it cannot read", () => {
    expect(contrastReading("#123456", "#fedcba")?.ratio).toBeCloseTo(
      contrastReading("#fedcba", "#123456")!.ratio,
      10
    );
    expect(contrastReading("not a colour", "#ffffff")).toBeUndefined();
  });
});

describe("parseTypedColor", () => {
  it("needs a # for short hex so words are not read as colours", () => {
    expect(parseTypedColor("bad")).toBeUndefined();
    expect(parseTypedColor("face")).toBeUndefined();
    expect(parseTypedColor("#bad")).toMatchObject({ r: 187, g: 170, b: 221 });
    expect(parseTypedColor("#face")?.a).toBeCloseTo(0.933, 2);
  });

  it("still reads a full hex value pasted without the #", () => {
    expect(parseTypedColor("336699")).toMatchObject({ r: 51, g: 102, b: 153 });
    expect(parseTypedColor("33669")).toBeUndefined();
  });

  it("refuses a non-numeric alpha or channel", () => {
    expect(parseTypedColor("rgb(1 2 3 / abc)")).toBeUndefined();
    expect(parseTypedColor("rgb(1 2x 3)")).toBeUndefined();
    expect(parseTypedColor("rgb(1 2 3 / 50%)")?.a).toBeCloseTo(0.5, 5);
  });

  it("converts the hue unit instead of reading it as degrees", () => {
    const degrees = parseTypedColor("hsl(180 100% 50%)");
    expect(parseTypedColor("hsl(0.5turn 100% 50%)")).toEqual(degrees);
    expect(parseTypedColor("hsl(200grad 100% 50%)")).toEqual(degrees);
    const radians = parseTypedColor(`hsl(${Math.PI}rad 100% 50%)`);
    expect(radians).toEqual(degrees);
    expect(parseTypedColor("hsl(1furlong 100% 50%)")).toBeUndefined();
  });
});

describe("notations", () => {
  it("writes white and black in OKLab and LCH", () => {
    expect(toOklab(255, 255, 255)).toBe("oklab(100% 0 0)");
    expect(toLch(0, 0, 0)).toBe("lch(0 0 0)");
  });

  it("names an exact CSS colour plainly and a near one with a tilde", () => {
    expect(toNamed(255, 0, 0)).toBe("red");
    expect(toNamed(254, 1, 1)).toBe("≈ red");
  });
});
