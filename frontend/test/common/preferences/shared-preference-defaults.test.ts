import { beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  getPersonalPreferences,
  getPreferenceDefaults,
  getStoredPreferences,
  resetPersonalPreferences,
  savePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";
import {
  sanitizeSharedDefaults,
  setSharedDefaults,
} from "../../../src/common/preferences/shared-preference-defaults";

describe("validating shared defaults", () => {
  it("keeps valid values of known fields", () => {
    expect(
      sanitizeSharedDefaults({
        languageMode: "bilingual",
        lowStimulation: true,
        soundVolume: 20,
      })
    ).toEqual({
      languageMode: "bilingual",
      lowStimulation: true,
      soundVolume: 20,
    });
  });

  it("drops wrong types, out of range numbers and unknown or private fields", () => {
    expect(
      sanitizeSharedDefaults({
        languageMode: "klingon",
        funnyEnglish: 9,
        soundVolume: 20.5,
        dialogEmojis: "yes",
        schoolMode: true,
        narratorVoiceEnglish: "x",
        extra: 1,
      })
    ).toEqual({});
    expect(sanitizeSharedDefaults(null)).toEqual({});
    expect(sanitizeSharedDefaults([1, 2])).toEqual({});
    expect(sanitizeSharedDefaults("text")).toEqual({});
  });
});

// Protects the rule that a shared default is only a default: a choice made in
// this browser still wins, and a setting left alone follows the default.
describe("shared defaults under personal choices", () => {
  beforeEach(() => {
    setSharedDefaults({});
    resetPersonalPreferences();
  });

  it("applies to a setting nobody chose", () => {
    setSharedDefaults({ lowStimulation: true });
    expect(getPreferenceDefaults().lowStimulation).toBe(true);
    expect(getStoredPreferences().lowStimulation).toBe(true);
    expect(getPersonalPreferences().lowStimulation).toBe(true);
    setSharedDefaults({});
    expect(getStoredPreferences().lowStimulation).toBe(
      DEFAULT_PERSONAL_PREFERENCES.lowStimulation
    );
  });

  it("loses to a choice made in this browser", () => {
    setSharedDefaults({ lowStimulation: true });
    savePersonalPreferences({ lowStimulation: false });
    setSharedDefaults({ lowStimulation: true, soundEffects: false });
    expect(getStoredPreferences().lowStimulation).toBe(false);
    expect(getStoredPreferences().soundEffects).toBe(false);
  });

  it("goes back to following the default when the choice is set to it", () => {
    setSharedDefaults({ momentum: true });
    savePersonalPreferences({ momentum: false });
    expect(getStoredPreferences().momentum).toBe(false);
    savePersonalPreferences({ momentum: true });
    setSharedDefaults({ momentum: false });
    expect(getStoredPreferences().momentum).toBe(false);
  });

  it("does not freeze untouched settings when another one is saved", () => {
    savePersonalPreferences({ funnyEnglish: 2 });
    setSharedDefaults({ dialogEmojis: false });
    expect(getStoredPreferences().funnyEnglish).toBe(2);
    expect(getStoredPreferences().dialogEmojis).toBe(false);
  });
});
