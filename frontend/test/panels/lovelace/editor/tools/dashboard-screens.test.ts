import { describe, expect, it } from "vitest";
import {
  customScreen,
  rotateScreen,
  SCREENS,
} from "../../../../../src/panels/lovelace/editor/tools/dashboard-screens";

describe("screen preview dimensions", () => {
  it("bounds custom frames without changing their aspect ratio", () => {
    const screen = customScreen("3840", "2160")!;
    expect(screen.width).toBe(3840);
    expect(screen.height).toBe(2160);
    expect(screen.width * screen.scale).toBe(400);
    expect(screen.height * screen.scale).toBe(225);
  });

  it.each([
    ["", "800"],
    ["240", ""],
    ["239", "800"],
    ["800", "3841"],
    ["390.5", "800"],
    ["390px", "800"],
    ["Infinity", "800"],
  ])("rejects invalid dimensions %s × %s", (width, height) => {
    expect(customScreen(width, height)).toBeUndefined();
  });

  it("rotates a copy and restores the original dimensions on a second rotation", () => {
    const original = { ...SCREENS[0] };
    const rotated = rotateScreen(SCREENS[0]);
    expect(rotated.width).toBe(original.height);
    expect(rotated.height).toBe(original.width);
    expect(SCREENS[0]).toEqual(original);
    expect(rotateScreen(rotated)).toEqual(original);
  });
});
