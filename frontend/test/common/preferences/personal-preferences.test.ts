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
    expect(normalizePersonalPreferences(stored)).toEqual({
      ...DEFAULT_PERSONAL_PREFERENCES,
      ...stored,
    });
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

// Protects the narrator and attention mode values read back from storage: the
// narrator must stay off unless it was turned on, and a bad rate or voice
// must never reach the speech engine.
describe("narrator and attention mode values", () => {
  it("keeps the narrator off and the modes off by default", () => {
    const result = normalizePersonalPreferences({});
    expect(result.narratorEnabled).toBe(false);
    expect(result.timeAwareness).toBe(false);
    expect(result.momentum).toBe(false);
    expect(result.narratorSpeakIn).toBe("both");
    expect(result.narratorRate).toBe(1);
  });

  it("keeps valid narrator choices and rounds to a tenth", () => {
    const result = normalizePersonalPreferences({
      narratorEnabled: true,
      narratorSpeakIn: "cantonese",
      narratorVoiceEnglish: "voice-a",
      narratorRate: 1.26,
      narratorPitch: 0.8,
    });
    expect(result.narratorEnabled).toBe(true);
    expect(result.narratorSpeakIn).toBe("cantonese");
    expect(result.narratorVoiceEnglish).toBe("voice-a");
    expect(result.narratorRate).toBe(1.3);
    expect(result.narratorPitch).toBe(0.8);
  });

  it("clamps the rate and pitch and drops bad values", () => {
    const result = normalizePersonalPreferences({
      narratorRate: 9,
      narratorPitch: -1,
      narratorSpeakIn: "klingon",
      narratorVoiceCantonese: 5,
      narratorEnabled: "yes",
    } as never);
    expect(result.narratorRate).toBe(2);
    expect(result.narratorPitch).toBe(0.5);
    expect(result.narratorSpeakIn).toBe("both");
    expect(result.narratorVoiceCantonese).toBe("");
    expect(result.narratorEnabled).toBe(false);
  });
});
