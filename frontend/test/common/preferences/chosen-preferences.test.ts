import { beforeEach, describe, expect, it } from "vitest";
import {
  followDefaultPreferences,
  getChosenPreferenceKeys,
  getStoredPreferences,
  PERSONAL_PREFERENCES_STORAGE_KEY,
  resetPersonalPreferences,
  savePersonalPreferences,
} from "../../../src/common/preferences/personal-preferences";
import { safeSetStored } from "../../../src/common/preferences/safe-storage";
import { setSharedDefaults } from "../../../src/common/preferences/shared-preference-defaults";
import {
  evaluateSchedules,
  findConflicts,
  nextChange,
  type ScheduleRule,
} from "../../../src/common/preferences/preference-schedule";

// A choice a person made must never change by itself: not when a shared default
// is set, not when it is removed, not at an unrelated save.
describe("a chosen setting stays chosen", () => {
  beforeEach(() => {
    setSharedDefaults({});
    resetPersonalPreferences();
  });

  it("keeps a choice equal to the default when a shared default is set", () => {
    // momentum defaults to false; the person picks false on purpose.
    savePersonalPreferences({ momentum: false });
    expect(getChosenPreferenceKeys()).toContain("momentum");
    setSharedDefaults({ momentum: true });
    expect(getStoredPreferences().momentum).toBe(false);
  });

  it("keeps a choice equal to the shared default when that default is removed", () => {
    setSharedDefaults({ lowStimulation: true });
    savePersonalPreferences({ lowStimulation: true });
    setSharedDefaults({});
    expect(getStoredPreferences().lowStimulation).toBe(true);
  });

  it("keeps old stored keys at an unrelated save", () => {
    // The shape older versions wrote: every key, most of them at the default.
    safeSetStored(PERSONAL_PREFERENCES_STORAGE_KEY, {
      momentum: false,
      soundEffects: true,
      funnyEnglish: 5,
    });
    savePersonalPreferences({ funnyCantonese: 2 });
    expect(getChosenPreferenceKeys().sort()).toEqual(
      ["funnyCantonese", "funnyEnglish", "momentum", "soundEffects"].sort()
    );
    setSharedDefaults({ momentum: true, soundEffects: false, funnyEnglish: 1 });
    const stored = getStoredPreferences();
    expect(stored.momentum).toBe(false);
    expect(stored.soundEffects).toBe(true);
    expect(stored.funnyEnglish).toBe(5);
  });

  it("follows a shared default again only after the row is reset", () => {
    savePersonalPreferences({ momentum: false });
    followDefaultPreferences(["momentum"]);
    expect(getChosenPreferenceKeys()).not.toContain("momentum");
    setSharedDefaults({ momentum: true });
    expect(getStoredPreferences().momentum).toBe(true);
  });

  it("does not choose settings that were never touched", () => {
    savePersonalPreferences({ funnyEnglish: 2 });
    expect(getChosenPreferenceKeys()).toEqual(["funnyEnglish"]);
  });
});

const rule = (partial: Partial<ScheduleRule>): ScheduleRule => ({
  id: "r1",
  name: "",
  enabled: true,
  preference: "lowStimulation",
  value: true,
  from: "22:00",
  to: "07:00",
  days: [0, 1, 2, 3, 4, 5, 6],
  ...partial,
});

describe("schedule edge cases", () => {
  it("accepts a rule id of __proto__ without touching prototypes", () => {
    const rules = [
      rule({ id: "__proto__", value: true }),
      rule({ id: "b", value: false }),
    ];
    const evaluation = evaluateSchedules(
      rules,
      new Date("2026-03-04T23:00:00Z"),
      "UTC"
    );
    expect(Object.getPrototypeOf(evaluation.overridden)).toBeNull();
    expect(evaluation.overridden.b).toBe("__proto__");
    expect(Object.getPrototypeOf(findConflicts(rules))).toBeNull();
    expect(({} as Record<string, unknown>).b).toBeUndefined();
  });

  it("finds a Saturday-only rule from a Monday", () => {
    const rules = [rule({ id: "sat", from: "09:00", to: "11:00", days: [6] })];
    // 2026-03-02 is a Monday.
    const change = nextChange(
      rules,
      new Date("2026-03-02T12:00:00Z"),
      "UTC",
      "lowStimulation"
    );
    expect(change?.at.toISOString()).toBe("2026-03-07T09:00:00.000Z");
    expect(change?.value).toBe(true);
  });

  it("finds the end of a rule running into the next day", () => {
    const rules = [rule({ id: "night", from: "22:00", to: "07:00" })];
    const change = nextChange(
      rules,
      new Date("2026-03-04T23:30:00Z"),
      "UTC",
      "lowStimulation"
    );
    expect(change?.at.toISOString()).toBe("2026-03-05T07:00:00.000Z");
    expect(change?.value).toBeUndefined();
  });
});
