import { describe, expect, it } from "vitest";
import {
  limitAfterItems,
  parseBarHeight,
  placeSheet,
  RequestToken,
  shouldRestoreFocus,
  versionListSignature,
} from "../../../src/components/history/version-picker-logic";

// The picker lives on phone pages that redraw often and open a keyboard. These
// tests protect the rules that keep "Show more" open, keep an old diff from
// winning, and keep the sheet inside what the person can see.
describe("Show more limit", () => {
  const first = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("keeps the limit when a new array holds the same versions", () => {
    const again = first.map((item) => ({ ...item }));
    expect(
      limitAfterItems(
        versionListSignature(first),
        versionListSignature(again),
        600,
        200
      )
    ).toBe(600);
  });

  it("goes back to one page when the first, last or length changes", () => {
    const signature = versionListSignature(first);
    for (const changed of [
      [{ id: "z" }, { id: "b" }, { id: "c" }],
      [{ id: "a" }, { id: "b" }, { id: "z" }],
      [{ id: "a" }, { id: "b" }],
    ]) {
      expect(
        limitAfterItems(signature, versionListSignature(changed), 600, 200)
      ).toBe(200);
    }
  });

  it("starts at one page the first time", () => {
    expect(
      limitAfterItems(undefined, versionListSignature(first), 200, 200)
    ).toBe(200);
    expect(versionListSignature([])).toBe("0");
  });
});

describe("request token", () => {
  it("accepts only the newest request", () => {
    const requests = new RequestToken();
    const slow = requests.begin();
    const fast = requests.begin();
    expect(requests.isCurrent(slow)).toBe(false);
    expect(requests.isCurrent(fast)).toBe(true);
  });

  it("makes every request stale after cancel", () => {
    const requests = new RequestToken();
    const pending = requests.begin();
    requests.cancel();
    expect(requests.isCurrent(pending)).toBe(false);
  });
});

describe("sheet placement", () => {
  it("rests above the bottom bar when nothing covers the page", () => {
    expect(
      placeSheet({
        layoutHeight: 800,
        viewportHeight: 800,
        viewportOffsetTop: 0,
        barHeight: 64,
        margin: 8,
      })
    ).toEqual({ overlap: 0, maxHeight: 712 });
  });

  it("lifts above the keyboard and ignores the hidden bar", () => {
    const placement = placeSheet({
      layoutHeight: 800,
      viewportHeight: 480,
      viewportOffsetTop: 0,
      barHeight: 64,
      margin: 8,
    });
    expect(placement.overlap).toBe(320);
    expect(placement.maxHeight).toBe(456);
  });

  it("allows for a visual viewport that was scrolled down", () => {
    expect(
      placeSheet({
        layoutHeight: 800,
        viewportHeight: 480,
        viewportOffsetTop: 100,
        barHeight: 0,
        margin: 8,
      }).overlap
    ).toBe(220);
  });

  it("never asks for more than the visible height on a tiny screen", () => {
    const placement = placeSheet({
      layoutHeight: 800,
      viewportHeight: 140,
      viewportOffsetTop: 0,
      barHeight: 0,
      margin: 8,
    });
    expect(placement.maxHeight).toBeLessThanOrEqual(124);
    expect(placement.maxHeight).toBeGreaterThan(0);
  });
});

describe("focus after closing", () => {
  it("returns only from inside the panel or from the page", () => {
    expect(shouldRestoreFocus(true, false)).toBe(true);
    expect(shouldRestoreFocus(false, true)).toBe(true);
    expect(shouldRestoreFocus(false, false)).toBe(false);
  });
});

describe("bar height signal", () => {
  it("reads pixels and falls back when nothing is published", () => {
    expect(parseBarHeight("64px", 10)).toBe(64);
    expect(parseBarHeight("0px", 10)).toBe(0);
    expect(parseBarHeight("", 10)).toBe(10);
    expect(parseBarHeight("garbage", 10)).toBe(10);
  });
});
