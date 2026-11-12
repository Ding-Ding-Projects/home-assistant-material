import { describe, expect, it } from "vitest";
import { placePanel } from "../../../src/components/locks/lock-text";

const bottomOf = (placed: { top: number; maxHeight: number }) =>
  placed.top + placed.maxHeight;

describe("placePanel", () => {
  it("opens under an anchor that is high on the screen", () => {
    const placed = placePanel({ left: 100, top: 100, bottom: 140 }, 1440, 900);
    expect(placed.top).toBe(148);
    expect(placed.left).toBe(100);
  });

  it("opens above an anchor that is low on the screen", () => {
    const placed = placePanel({ left: 100, top: 800, bottom: 840 }, 1440, 900);
    expect(placed.top).toBeLessThan(800);
    expect(bottomOf(placed)).toBeLessThanOrEqual(900);
  });

  it("keeps the panel inside the window for any anchor position", () => {
    for (const viewportHeight of [400, 600, 900]) {
      for (let top = -200; top <= viewportHeight + 400; top += 50) {
        const placed = placePanel(
          { left: 1500, top, bottom: top + 40 },
          1440,
          viewportHeight,
          640
        );
        expect(placed.top).toBeGreaterThanOrEqual(8);
        expect(placed.left).toBeGreaterThanOrEqual(8);
        expect(placed.left + placed.width).toBeLessThanOrEqual(1440 - 8);
        expect(bottomOf(placed)).toBeLessThanOrEqual(viewportHeight);
      }
    }
  });

  it("centres the panel when there is no anchor", () => {
    const placed = placePanel(undefined, 1000, 800, 400);
    expect(placed.left).toBe(300);
    expect(placed.top).toBe(32);
  });
});
