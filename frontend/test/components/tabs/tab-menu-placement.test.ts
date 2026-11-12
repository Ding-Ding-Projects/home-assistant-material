import { describe, expect, it } from "vitest";
import {
  EDGE_GAP,
  placeBeside,
  SHEET_WIDTH,
} from "../../../src/components/tabs/tab-menu-placement";

// A popup stays beside its tab and inside the screen, and becomes a sheet on
// a phone, which includes the 320 pixel width.

const size = { width: 280, height: 400 };
const screen = { width: 1200, height: 800 };

describe("popup placement", () => {
  it("is a sheet below the phone width, at 320 pixels too", () => {
    const placement = placeBeside(
      { left: 10, top: 10, width: 80, height: 40 },
      size,
      { width: 320, height: 640 },
      "top"
    );
    expect(placement.sheet).toBe(true);
    expect(placement.maxWidth).toBe(320);
    expect(SHEET_WIDTH).toBeGreaterThan(320);
  });

  it("opens below a strip docked to the top", () => {
    const placement = placeBeside(
      { left: 100, top: 0, width: 120, height: 40 },
      size,
      screen,
      "top"
    );
    expect(placement).toMatchObject({ sheet: false, left: 100, top: 48 });
  });

  it("opens above a strip docked to the bottom", () => {
    const placement = placeBeside(
      { left: 100, top: 760, width: 120, height: 40 },
      size,
      screen,
      "bottom"
    );
    expect(placement.top).toBe(760 - 400 - EDGE_GAP);
  });

  it("opens beside a vertical strip and flips when there is no room", () => {
    const rightOf = placeBeside(
      { left: 0, top: 100, width: 200, height: 40 },
      size,
      screen,
      "left"
    );
    expect(rightOf.left).toBe(208);
    const flipped = placeBeside(
      { left: 1000, top: 100, width: 190, height: 40 },
      size,
      screen,
      "left"
    );
    expect(flipped.left).toBe(1000 - 280 - EDGE_GAP);
  });

  it("keeps the popup inside the screen", () => {
    const placement = placeBeside(
      { left: 1180, top: 790, width: 100, height: 40 },
      size,
      screen,
      "top"
    );
    expect(placement.left).toBeLessThanOrEqual(1200 - 280 - EDGE_GAP);
    expect(placement.top + 400).toBeLessThanOrEqual(800 - EDGE_GAP);
  });

  it("bounds a tall popup by the screen height", () => {
    const placement = placeBeside(
      { left: 100, top: 0, width: 100, height: 40 },
      { width: 280, height: 2000 },
      { width: 800, height: 500 },
      "top"
    );
    expect(placement.maxHeight).toBe(500 - 2 * EDGE_GAP);
    expect(placement.top).toBeGreaterThanOrEqual(EDGE_GAP);
  });
});
