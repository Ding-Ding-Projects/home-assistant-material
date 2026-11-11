import { describe, expect, it } from "vitest";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  effectivePreferences,
  normalizePersonalPreferences,
  schoolHeldFields,
} from "../../../src/common/preferences/personal-preferences";
import { panelsToClose } from "../../../src/common/preferences/one-thing";

// Protects the rule that School mode only overlays the stored choices: the
// stored values must come back unchanged when the mode is off, and a rule that
// is not chosen must not touch its fields.
describe("School mode overlay", () => {
  const stored = normalizePersonalPreferences({
    languageMode: "bilingual",
    funnyEnglish: 4,
    funnyCantonese: 3,
    soundEffects: true,
    schoolMode: true,
    schoolRules: ["plain_english", "quiet_sounds"],
  });

  it("applies the chosen rules and nothing else", () => {
    const effective = effectivePreferences(stored);
    expect(effective.languageMode).toBe("english");
    expect(effective.funnyEnglish).toBe(1);
    expect(effective.funnyCantonese).toBe(1);
    expect(effective.soundEffects).toBe(false);
    expect(effective.lowStimulation).toBe(false);
    expect(stored.languageMode).toBe("bilingual");
  });

  it("changes nothing while the mode is off", () => {
    const off = { ...stored, schoolMode: false };
    expect(effectivePreferences(off)).toBe(off);
    expect(schoolHeldFields(off).size).toBe(0);
  });

  it("names the fields it holds", () => {
    expect(schoolHeldFields(stored)).toEqual(
      new Set([
        "languageMode",
        "funnyEnglish",
        "funnyCantonese",
        "soundEffects",
      ])
    );
  });

  it("drops unknown rules from stored data", () => {
    const result = normalizePersonalPreferences({
      schoolRules: ["quiet_sounds", "hack"],
    } as never);
    expect(result.schoolRules).toEqual(["quiet_sounds"]);
    expect(normalizePersonalPreferences({ schoolName: "   " }).schoolName).toBe(
      DEFAULT_PERSONAL_PREFERENCES.schoolName
    );
  });
});

describe("panelsToClose", () => {
  it("closes only the other open panels", () => {
    const a = { expanded: true };
    const b = { expanded: true };
    const c = { expanded: false };
    expect(panelsToClose([a, b, c], b)).toEqual([a]);
  });
});
