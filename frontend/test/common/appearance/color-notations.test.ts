import { describe, expect, it } from "vitest";
import {
  contrastReading,
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
