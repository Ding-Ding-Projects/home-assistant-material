import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  normalizePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";
import { worthSpotlight } from "../../../src/common/preferences/focus-spotlight";

// Protects what is read back from browser storage: a hand-edited or old
// value must never reach the interface as an out-of-range level or a wrong type.
describe("normalizePersonalPreferences", () => {
  it("returns the defaults for nothing stored", () => {
    expect(normalizePersonalPreferences(undefined)).toEqual(
      DEFAULT_PERSONAL_PREFERENCES
    );
    expect(normalizePersonalPreferences(null)).toEqual(
      DEFAULT_PERSONAL_PREFERENCES
    );
  });

  it("keeps valid values", () => {
    const stored = {
      languageMode: "bilingual" as const,
      funnyEnglish: 2,
      funnyCantonese: 3,
      soundEffects: false,
      soundVolume: 80,
      lowStimulation: true,
      focusSpotlight: true,
      quietHours: true,
      quietFrom: "21:30",
      quietTo: "06:15",
      quietDays: [0, 4],
    };
    expect(normalizePersonalPreferences(stored)).toEqual(stored);
  });

  it("clamps levels and rounds", () => {
    const result = normalizePersonalPreferences({
      funnyEnglish: 99,
      funnyCantonese: -4,
      soundVolume: 41.6,
    });
    expect(result.funnyEnglish).toBe(5);
    expect(result.funnyCantonese).toBe(1);
    expect(result.soundVolume).toBe(42);
  });

  it("falls back for values of the wrong type", () => {
    const result = normalizePersonalPreferences({
      languageMode: "klingon",
      funnyEnglish: "3",
      soundEffects: "yes",
    } as never);
    expect(result.languageMode).toBe("english");
    expect(result.funnyEnglish).toBe(5);
    expect(result.soundEffects).toBe(true);
  });
});

describe("quiet hours values", () => {
  it("drops invalid times and days", () => {
    const result = normalizePersonalPreferences({
      quietFrom: "25:00",
      quietTo: "7:00",
      quietDays: [1, 1, 9, -1, 3, "x"] as unknown as number[],
    });
    expect(result.quietFrom).toBe("22:00");
    expect(result.quietTo).toBe("07:00");
    expect(result.quietDays).toEqual([1, 3]);
  });
});

describe("worthSpotlight", () => {
  const view = { width: 1000, height: 1000 };
  it("is true for a small control", () => {
    expect(worthSpotlight({ width: 100, height: 40 }, view)).toBe(true);
  });
  it("is false for an empty or window-sized element", () => {
    expect(worthSpotlight({ width: 0, height: 0 }, view)).toBe(false);
    expect(worthSpotlight({ width: 1000, height: 900 }, view)).toBe(false);
  });
});
