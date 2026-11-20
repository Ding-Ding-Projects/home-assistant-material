import { describe, expect, it } from "vitest";
import {
  dimSumClearance,
  isFloatingControlBox,
} from "../../../src/components/dim-sum/dim-sum-clearance";

// A 390 x 800 phone: the card is 52 px tall and spans x 16 to 374, and asks
// to sit 92 px above the bottom edge (16 px over a 76 px phone bar).
const phone = {
  base: 92,
  cardHeight: 52,
  cardLeft: 16,
  cardRight: 374,
  viewportHeight: 800,
};

const box = (top: number, bottom: number, left: number, right: number) => ({
  top,
  bottom,
  left,
  right,
});

describe("dimSumClearance", () => {
  it("keeps the asked position when nothing floats in the way", () => {
    expect(dimSumClearance({ ...phone, floating: [] })).toBe(92);
  });

  it("rises above a create button it would cover, so the button keeps its tap", () => {
    // A 56 px create button 16 px above the phone bar: y 652 to 708.
    const fab = box(652, 708, 318, 374);
    expect(dimSumClearance({ ...phone, floating: [fab] })).toBe(800 - 652 + 8);
  });

  it("rises past a dock stacked on top of the create button", () => {
    const fab = box(652, 708, 318, 374);
    const dock = box(588, 640, 16, 300);
    // Above the button the card still meets the dock, so it rises again.
    expect(dimSumClearance({ ...phone, floating: [fab, dock] })).toBe(
      800 - 588 + 8
    );
  });

  it("ignores a control that is not under the card's columns", () => {
    const aside = box(652, 708, 380, 390);
    expect(dimSumClearance({ ...phone, floating: [aside] })).toBe(92);
  });

  it("ignores a control the card already clears", () => {
    const below = box(724, 800, 12, 378);
    expect(dimSumClearance({ ...phone, floating: [below] })).toBe(92);
  });

  it("never leaves the top of the screen", () => {
    // An expanded card 400 px tall cannot rise above a 300 px tall control
    // without leaving the screen, so it stops 8 px under the top edge.
    const tall = box(300, 600, 16, 374);
    expect(
      dimSumClearance({ ...phone, cardHeight: 400, floating: [tall] })
    ).toBe(800 - 400 - 8);
  });

  it("treats non-finite input as no offset", () => {
    expect(dimSumClearance({ ...phone, base: Number.NaN, floating: [] })).toBe(
      0
    );
  });
});

describe("isFloatingControlBox", () => {
  it("counts a small control in the lower half", () => {
    expect(isFloatingControlBox(box(652, 708, 318, 374), 800)).toBe(true);
  });

  it("does not count a whole page or sheet", () => {
    expect(isFloatingControlBox(box(0, 800, 0, 390), 800)).toBe(false);
  });

  it("does not count a header in the top half", () => {
    expect(isFloatingControlBox(box(0, 56, 0, 390), 800)).toBe(false);
  });

  it("does not count an empty box", () => {
    expect(isFloatingControlBox(box(700, 700, 0, 390), 800)).toBe(false);
  });
});
