import { describe, expect, it } from "vitest";
import {
  ringFromSteps,
  ringOffset,
} from "../../../../src/panels/config/core/updates/update-glance";

// Protects the progress ring of an update run: it fills only to the steps
// that really finished (never an invented percent), and its stroke offset
// stays inside an empty and a full ring.

describe("ringFromSteps", () => {
  it("fills to the finished steps out of all steps", () => {
    expect(ringFromSteps(1, 4)).toEqual({
      fraction: 0.25,
      finished: 1,
      total: 4,
    });
    expect(ringFromSteps(3, 3).fraction).toBe(1);
  });

  it("is an empty ring for a run with no steps", () => {
    expect(ringFromSteps(0, 0)).toEqual({ fraction: 0, finished: 0, total: 0 });
    expect(ringFromSteps(2, 0).fraction).toBe(0);
  });

  it("never shows more finished steps than there are", () => {
    expect(ringFromSteps(5, 3)).toEqual({ fraction: 1, finished: 3, total: 3 });
  });

  it("ignores values that are not counts", () => {
    expect(ringFromSteps(Number.NaN, 3)).toEqual({
      fraction: 0,
      finished: 0,
      total: 3,
    });
    expect(ringFromSteps(-1, 3).finished).toBe(0);
    expect(ringFromSteps(1, Number.POSITIVE_INFINITY).total).toBe(0);
  });
});

describe("ringOffset", () => {
  it("leaves the part of the circle that is not yet filled", () => {
    expect(ringOffset(0, 100)).toBe(100);
    expect(ringOffset(0.25, 100)).toBe(75);
    expect(ringOffset(1, 100)).toBe(0);
  });

  it("clamps to an empty or a full ring", () => {
    expect(ringOffset(-1, 100)).toBe(100);
    expect(ringOffset(2, 100)).toBe(0);
  });
});
