import { describe, expect, it } from "vitest";
import {
  inNightWindow,
  nextViewKey,
  normalizeWallPanel,
} from "../../../../../src/panels/lovelace/editor/tools/wall-panel";

describe("wall panel", () => {
  it("is off by default and clamps bad values", () => {
    const s = normalizeWallPanel({
      screensaver: { enabled: true, minutes: 9999 },
      night: { from: "25:00", darkness: 500 },
    });
    expect(s.rotation.enabled).toBe(false);
    expect(s.screensaver.minutes).toBe(120);
    expect(s.night.from).toBe("22:00");
    expect(s.night.darkness).toBe(90);
    expect(normalizeWallPanel("junk").screensaver.enabled).toBe(false);
  });

  it("handles a night window that crosses midnight", () => {
    expect(inNightWindow(23 * 60, "22:00", "07:00")).toBe(true);
    expect(inNightWindow(3 * 60, "22:00", "07:00")).toBe(true);
    expect(inNightWindow(12 * 60, "22:00", "07:00")).toBe(false);
    expect(inNightWindow(8 * 60, "08:00", "09:00")).toBe(true);
    expect(inNightWindow(8 * 60, "08:00", "08:00")).toBe(false);
  });

  it("rotates round the list", () => {
    expect(nextViewKey(["a", "b", "c"], "c")).toBe("a");
    expect(nextViewKey(["a", "b"], undefined)).toBe("a");
    expect(nextViewKey(["a"], "a")).toBeUndefined();
  });
});
