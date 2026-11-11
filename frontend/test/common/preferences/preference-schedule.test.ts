import { describe, expect, it } from "vitest";
import {
  applyOverlay,
  evaluateSchedules,
  findConflicts,
  nextChange,
  overlaySignature,
  ruleApplies,
  ruleProblem,
  rulesOverlap,
  sanitizeRule,
  sanitizeSchedules,
  zoneParts,
  type ScheduleRule,
} from "../../../src/common/preferences/preference-schedule";
import {
  DEFAULT_PERSONAL_PREFERENCES,
  effectivePreferences,
  normalizePersonalPreferences,
  schoolHeldFields,
} from "../../../src/common/preferences/personal-preferences";

const TORONTO = "America/Toronto";

const rule = (partial: Partial<ScheduleRule> = {}): ScheduleRule => ({
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

describe("sanitizing stored rules", () => {
  it("keeps a valid rule and cleans its parts", () => {
    const result = sanitizeRule({
      ...rule(),
      name: "  Calm‮  nights\u0000 ",
      days: [3, 3, 9, -1, "x", 1],
    });
    expect(result?.name).toBe("Calm nights");
    expect(result?.days).toEqual([1, 3]);
  });

  it("drops a rule with a value its preference cannot take", () => {
    expect(
      sanitizeRule({ ...rule(), preference: "languageMode", value: true })
    ).toBeUndefined();
    expect(
      sanitizeRule({ ...rule(), preference: "soundEffects", value: "english" })
    ).toBeUndefined();
  });

  it("drops unknown preferences, bad times and missing ids", () => {
    expect(
      sanitizeRule({ ...rule(), preference: "schoolMode" })
    ).toBeUndefined();
    expect(sanitizeRule({ ...rule(), from: "24:00" })).toBeUndefined();
    expect(sanitizeRule({ ...rule(), to: "7:00" })).toBeUndefined();
    expect(sanitizeRule({ ...rule(), id: "" })).toBeUndefined();
    expect(sanitizeRule("text")).toBeUndefined();
  });

  it("drops repeated ids, non-lists and anything past the cap", () => {
    expect(sanitizeSchedules("x")).toEqual([]);
    expect(sanitizeSchedules([rule(), rule()])).toHaveLength(1);
    const many = Array.from({ length: 80 }, (_, i) => rule({ id: `r${i}` }));
    expect(sanitizeSchedules(many)).toHaveLength(30);
  });

  it("reports what is wrong while a rule is edited", () => {
    expect(ruleProblem(rule({ days: [] }))).toBe("no_days");
    expect(ruleProblem(rule({ from: "" }))).toBe("invalid_time");
    expect(ruleProblem(rule({ value: "english" }))).toBe("no_value");
    expect(ruleProblem(rule())).toBeUndefined();
  });
});

describe("when a rule applies", () => {
  it("covers a same-day range and excludes its end", () => {
    const r = rule({ from: "09:00", to: "17:00", days: [1] });
    expect(ruleApplies(r, { day: 1, minute: 9 * 60 })).toBe(true);
    expect(ruleApplies(r, { day: 1, minute: 17 * 60 - 1 })).toBe(true);
    expect(ruleApplies(r, { day: 1, minute: 17 * 60 })).toBe(false);
    expect(ruleApplies(r, { day: 2, minute: 10 * 60 })).toBe(false);
  });

  it("runs an overnight range into the next day", () => {
    const r = rule({ from: "22:00", to: "07:00", days: [5] });
    expect(ruleApplies(r, { day: 5, minute: 22 * 60 })).toBe(true);
    expect(ruleApplies(r, { day: 6, minute: 6 * 60 + 59 })).toBe(true);
    expect(ruleApplies(r, { day: 6, minute: 7 * 60 })).toBe(false);
    expect(ruleApplies(r, { day: 5, minute: 6 * 60 })).toBe(false);
    // Sunday morning belongs to Saturday, which is not chosen.
    expect(ruleApplies(r, { day: 0, minute: 3 * 60 })).toBe(false);
  });

  it("wraps from Saturday night to Sunday morning", () => {
    const r = rule({ from: "23:00", to: "02:00", days: [6] });
    expect(ruleApplies(r, { day: 0, minute: 60 })).toBe(true);
  });

  it("covers whole days when start and end are the same", () => {
    const r = rule({ from: "00:00", to: "00:00", days: [0] });
    expect(ruleApplies(r, { day: 0, minute: 0 })).toBe(true);
    expect(ruleApplies(r, { day: 0, minute: 23 * 60 + 59 })).toBe(true);
    expect(ruleApplies(r, { day: 1, minute: 0 })).toBe(false);
  });

  it("never applies while turned off", () => {
    expect(ruleApplies(rule({ enabled: false }), { day: 1, minute: 0 })).toBe(
      false
    );
  });
});

describe("reading the wall clock of a time zone", () => {
  it("gives the weekday and minute in that zone", () => {
    // 03:30 UTC on Monday is 23:30 on Sunday in Toronto (daylight time).
    expect(zoneParts(new Date("2026-06-01T03:30:00Z"), TORONTO)).toEqual({
      day: 0,
      minute: 23 * 60 + 30,
    });
    expect(zoneParts(new Date("2026-06-01T03:30:00Z"), "UTC")).toEqual({
      day: 1,
      minute: 3 * 60 + 30,
    });
  });

  it("reads midnight as 00:00 and not 24:00", () => {
    expect(zoneParts(new Date("2026-06-01T04:00:00Z"), TORONTO)).toEqual({
      day: 1,
      minute: 0,
    });
  });

  it("falls back to the browser zone for a name it does not know", () => {
    const date = new Date("2026-06-01T12:00:00Z");
    expect(zoneParts(date, "Not/AZone")).toEqual({
      day: date.getDay(),
      minute: date.getHours() * 60 + date.getMinutes(),
    });
  });
});

describe("daylight saving days", () => {
  // Saturday night 22:00 to Sunday 07:00, starting on Saturday.
  const night = [rule({ days: [6] })];
  const at = (iso: string) => evaluateSchedules(night, new Date(iso), TORONTO);

  it("follows the wall clock when the clocks go forward", () => {
    // 02:00 on 8 March 2026 becomes 03:00 at 07:00 UTC.
    expect(at("2026-03-08T06:59:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-03-08T08:00:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-03-08T10:59:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-03-08T11:00:00Z").overlay.lowStimulation).toBeUndefined();
  });

  it("follows the wall clock when the clocks go back", () => {
    // 02:00 on 1 November 2026 becomes 01:00 at 06:00 UTC: 01:30 happens twice.
    expect(at("2026-11-01T05:30:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-11-01T06:30:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-11-01T11:59:00Z").overlay.lowStimulation).toBe(true);
    expect(at("2026-11-01T12:00:00Z").overlay.lowStimulation).toBeUndefined();
  });
});

describe("evaluating several rules", () => {
  const now = new Date("2026-06-03T15:00:00Z"); // Wednesday 11:00 in Toronto

  it("lets the first applying rule decide a preference", () => {
    const rules = [
      rule({ id: "a", value: true, from: "09:00", to: "12:00" }),
      rule({ id: "b", value: false, from: "10:00", to: "14:00" }),
    ];
    const result = evaluateSchedules(rules, now, TORONTO);
    expect(result.overlay.lowStimulation).toBe(true);
    expect(result.deciding.lowStimulation?.ruleId).toBe("a");
    expect(result.overridden).toEqual({ b: "a" });
  });

  it("does not call two rules with the same value a conflict", () => {
    const rules = [
      rule({ id: "a", from: "09:00", to: "12:00" }),
      rule({ id: "b", from: "10:00", to: "14:00" }),
    ];
    expect(evaluateSchedules(rules, now, TORONTO).overridden).toEqual({});
  });

  it("keeps preferences apart and skips rules that do not apply", () => {
    const rules = [
      rule({ id: "a", preference: "soundEffects", value: false }),
      rule({
        id: "b",
        preference: "languageMode",
        value: "cantonese",
        days: [1],
      }),
      rule({ id: "c", preference: "momentum", enabled: false }),
    ];
    const result = evaluateSchedules(
      [{ ...rules[0], from: "09:00", to: "12:00" }, rules[1], rules[2]],
      now,
      TORONTO
    );
    expect(result.overlay).toEqual({ soundEffects: false });
  });

  it("leaves out a field School mode holds and says so", () => {
    const rules = [
      rule({
        id: "a",
        preference: "soundEffects",
        value: true,
        from: "09:00",
        to: "12:00",
      }),
    ];
    const result = evaluateSchedules(
      rules,
      now,
      TORONTO,
      new Set(["soundEffects"])
    );
    expect(result.overlay).toEqual({});
    expect(result.heldBySchool.a).toEqual({
      preference: "soundEffects",
      value: true,
    });
  });
});

describe("laying schedules under School mode", () => {
  const stored = normalizePersonalPreferences({
    soundEffects: false,
    lowStimulation: false,
    schoolMode: true,
    schoolRules: ["quiet_sounds"],
  });

  it("lets the schedule change a field School mode does not hold", () => {
    const overlay = { lowStimulation: true } as const;
    const result = effectivePreferences(applyOverlay(stored, overlay));
    expect(result.lowStimulation).toBe(true);
    expect(stored.lowStimulation).toBe(false);
  });

  it("lets School mode win on a field it holds", () => {
    const held = schoolHeldFields(stored);
    const rules = [
      rule({
        preference: "soundEffects",
        value: true,
        from: "00:00",
        to: "00:00",
      }),
    ];
    const { overlay } = evaluateSchedules(
      rules,
      new Date("2026-06-03T15:00:00Z"),
      TORONTO,
      held
    );
    expect(
      effectivePreferences(applyOverlay(stored, overlay)).soundEffects
    ).toBe(false);
    // Even a value that slipped into the overlay is put right by School mode.
    expect(
      effectivePreferences(applyOverlay(stored, { soundEffects: true }))
        .soundEffects
    ).toBe(false);
  });

  it("never changes the stored choice", () => {
    const before = JSON.stringify(DEFAULT_PERSONAL_PREFERENCES);
    applyOverlay(DEFAULT_PERSONAL_PREFERENCES, { lowStimulation: true });
    expect(JSON.stringify(DEFAULT_PERSONAL_PREFERENCES)).toBe(before);
  });

  it("returns the same object when there is nothing to lay over", () => {
    expect(applyOverlay(stored, {})).toBe(stored);
  });
});

describe("overlap and conflicts", () => {
  it("finds an overlap that wraps past Saturday", () => {
    const a = rule({ id: "a", from: "23:00", to: "02:00", days: [6] });
    const b = rule({ id: "b", from: "01:00", to: "03:00", days: [0] });
    const c = rule({ id: "c", from: "02:00", to: "03:00", days: [0] });
    expect(rulesOverlap(a, b)).toBe(true);
    expect(rulesOverlap(a, c)).toBe(false);
  });

  it("treats back to back ranges as not overlapping", () => {
    const a = rule({ id: "a", from: "08:00", to: "12:00" });
    const b = rule({ id: "b", from: "12:00", to: "16:00" });
    expect(rulesOverlap(a, b)).toBe(false);
  });

  it("names the earlier rule that wins, only for another value", () => {
    const rules = [
      rule({ id: "a", value: true }),
      rule({ id: "b", value: false, from: "23:00", to: "01:00" }),
      rule({ id: "c", value: true, from: "23:00", to: "01:00" }),
      rule({ id: "d", preference: "momentum", value: false }),
    ];
    // c has the value of a, but b sits between them and gives the other one.
    expect(findConflicts(rules)).toEqual({ b: ["a"], c: ["b"] });
  });

  it("ignores rules that are turned off", () => {
    const rules = [
      rule({ id: "a", value: true, enabled: false }),
      rule({ id: "b", value: false }),
    ];
    expect(findConflicts(rules)).toEqual({});
  });
});

describe("the next change", () => {
  const evening = [
    rule({ id: "a", from: "19:00", to: "23:00", preference: "lowStimulation" }),
  ];

  it("finds when the rule starts", () => {
    const now = new Date("2026-06-03T15:00:00Z"); // 11:00 in Toronto
    const next = nextChange(evening, now, TORONTO, "lowStimulation");
    expect(next?.value).toBe(true);
    expect(zoneParts(next!.at, TORONTO).minute).toBe(19 * 60);
  });

  it("finds when the rule stops and goes back to the stored choice", () => {
    const now = new Date("2026-06-03T23:30:00Z"); // 19:30 in Toronto
    const next = nextChange(evening, now, TORONTO, "lowStimulation");
    expect(next?.value).toBeUndefined();
    expect(zoneParts(next!.at, TORONTO).minute).toBe(23 * 60);
  });

  it("gives nothing when no rule is for the preference or none changes", () => {
    const now = new Date("2026-06-03T15:00:00Z");
    expect(nextChange(evening, now, TORONTO, "momentum")).toBeUndefined();
    expect(
      nextChange(
        [rule({ from: "00:00", to: "00:00" })],
        now,
        TORONTO,
        "lowStimulation"
      )
    ).toBeUndefined();
    expect(
      nextChange(
        evening,
        now,
        TORONTO,
        "lowStimulation",
        new Set(["lowStimulation"])
      )
    ).toBeUndefined();
  });
});

describe("overlay signature", () => {
  it("is stable and differs when a value differs", () => {
    expect(overlaySignature({})).toBe("");
    expect(overlaySignature({ lowStimulation: true })).not.toBe(
      overlaySignature({ lowStimulation: false })
    );
    expect(overlaySignature({ momentum: true, lowStimulation: true })).toBe(
      overlaySignature({ lowStimulation: true, momentum: true })
    );
  });
});
