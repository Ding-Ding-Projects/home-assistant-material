import { describe, expect, it } from "vitest";
import { clipToCovers } from "../../../src/common/problems/covers";

// A bar at the bottom of the window, from y 800 to 880.
const bar = [{ top: 800, bottom: 880, left: 0, right: 760 }];

describe("clipToCovers", () => {
  it("leaves a box above the bar alone", () => {
    const box = { top: 100, left: 20, width: 300, height: 80 };
    expect(clipToCovers(box, bar)).toEqual(box);
  });

  it("cuts a box that reaches under the bar", () => {
    const cut = clipToCovers(
      { top: 700, left: 20, width: 300, height: 200 },
      bar
    );
    expect(cut?.top).toBe(700);
    expect(cut!.top + cut!.height).toBeLessThan(800);
  });

  it("drops a box whose top edge is under the bar", () => {
    expect(
      clipToCovers({ top: 810, left: 20, width: 300, height: 60 }, bar)
    ).toBeUndefined();
  });

  it("ignores a bar that is beside the box", () => {
    const box = { top: 790, left: 800, width: 100, height: 60 };
    expect(clipToCovers(box, bar)).toEqual(box);
  });
});
