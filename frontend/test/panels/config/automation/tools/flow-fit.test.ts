import { describe, expect, it } from "vitest";
import {
  FLOW_MIN_FIT,
  fitScale,
  stepZoom,
} from "../../../../../src/panels/config/automation/tools/flow-fit";

describe("fitScale", () => {
  it("fits a graph wider than a phone canvas to its width", () => {
    // 552 wide graph on a 358 wide canvas
    expect(fitScale(358, 600, 552, 116)).toBeCloseTo(358 / 552, 5);
  });

  it("never enlarges a graph that already fits", () => {
    expect(fitScale(900, 600, 552, 116)).toBe(1);
  });

  it("does not shrink below the readable floor", () => {
    expect(fitScale(100, 600, 2000, 116)).toBe(FLOW_MIN_FIT);
  });

  it("fits the height too when asked", () => {
    expect(fitScale(800, 200, 400, 800, "both")).toBeCloseTo(0.4, 5);
    expect(fitScale(800, 400, 400, 800, "both")).toBeCloseTo(0.5, 5);
  });

  it("returns 100% when nothing is measured yet", () => {
    expect(fitScale(0, 0, 552, 116)).toBe(1);
  });
});

describe("stepZoom", () => {
  it("steps from an arbitrary fitted scale to the next fixed step", () => {
    expect(stepZoom(0.65, 1)).toBe(0.75);
    expect(stepZoom(0.65, -1)).toBe(0.5);
  });

  it("stops at both ends", () => {
    expect(stepZoom(1.5, 1)).toBe(1.5);
    expect(stepZoom(0.5, -1)).toBe(0.5);
  });
});
