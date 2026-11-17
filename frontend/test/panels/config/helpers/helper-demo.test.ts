import { describe, expect, it } from "vitest";
import { HELPER_DOMAINS } from "../../../../src/panels/config/helpers/const";
import {
  counterCanStep,
  counterDemoConfig,
  counterStep,
  dateTimeDemoConfig,
  formatClock,
  hasHelperDemo,
  HELPER_DEMO_KINDS,
  moveSelection,
  numberDemoConfig,
  parseClockSeconds,
  parseDurationSeconds,
  scheduleNow,
  snapToStep,
  textDemoConfig,
  timerCancel,
  timerDemoConfig,
  timerIdle,
  timerPause,
  timerRemainingMs,
  timerStart,
  timerTick,
  truncateText,
  validateText,
} from "../../../../src/panels/config/helpers/demos/helper-demo";

// Protects the demos shown while a helper is being created: the numbers and
// states they show must follow the form's values, and a helper kind added
// later must not ship without a demo.

describe("a demo exists for every helper kind", () => {
  it("covers each domain the create dialog offers", () => {
    for (const domain of HELPER_DOMAINS) {
      expect(hasHelperDemo(domain), domain).toBe(true);
      expect(HELPER_DEMO_KINDS[domain], domain).toBeTruthy();
    }
    expect(Object.keys(HELPER_DEMO_KINDS).sort()).toEqual(
      [...HELPER_DOMAINS].sort()
    );
  });

  it("does not claim a demo for an integration helper", () => {
    expect(hasHelperDemo("group")).toBe(false);
  });
});

describe("number demo", () => {
  it("clamps and snaps to the step counted from the minimum", () => {
    expect(snapToStep(7, 0, 10, 5)).toBe(5);
    expect(snapToStep(8, 0, 10, 5)).toBe(10);
    expect(snapToStep(99, 0, 10, 5)).toBe(10);
    expect(snapToStep(-4, 2, 10, 2)).toBe(2);
    expect(snapToStep(3, 2, 10, 2)).toBe(4);
  });

  it("does not drift on decimal steps", () => {
    expect(snapToStep(0.3, 0, 1, 0.1)).toBe(0.3);
    expect(snapToStep(0.1 + 0.2, 0, 1, 0.1)).toBe(0.3);
  });

  it("never ends above a maximum that is not on a step", () => {
    expect(snapToStep(10, 0, 10, 3)).toBe(9);
  });

  it("reads the form values and survives half-typed ones", () => {
    const cfg = numberDemoConfig({
      min: "5",
      max: 50,
      step: 5,
      mode: "box",
      unit_of_measurement: "%",
    });
    expect(cfg).toMatchObject({ min: 5, max: 50, step: 5, mode: "box" });
    expect(cfg.unit).toBe("%");
    expect(cfg.initial).toBe(30);
    const broken = numberDemoConfig({ min: 10, max: 3, step: 0 });
    expect(broken.max).toBeGreaterThan(broken.min);
    expect(broken.step).toBe(1);
    expect(numberDemoConfig(undefined)).toMatchObject({
      min: 0,
      max: 100,
      step: 1,
      mode: "slider",
    });
  });
});

describe("counter demo", () => {
  const cfg = counterDemoConfig({
    minimum: 0,
    maximum: 5,
    step: 2,
    initial: 9,
  });

  it("clamps the starting value into the bounds", () => {
    expect(cfg.initial).toBe(5);
  });

  it("steps by the form's step and stops at the bounds", () => {
    expect(counterStep(1, 1, cfg)).toBe(3);
    expect(counterStep(5, 1, cfg)).toBe(5);
    expect(counterStep(1, -1, cfg)).toBe(0);
    expect(counterStep(0, -1, cfg)).toBe(0);
  });

  it("knows when a button has nothing left to do", () => {
    expect(counterCanStep(5, 1, cfg)).toBe(false);
    expect(counterCanStep(5, -1, cfg)).toBe(true);
    expect(counterCanStep(0, -1, cfg)).toBe(false);
  });

  it("has no limits when none are set", () => {
    const open = counterDemoConfig({ minimum: null, maximum: null });
    expect(counterStep(-100, -1, open)).toBe(-101);
    expect(counterStep(0.1, 1, counterDemoConfig({ step: 0.2 }))).toBe(0.3);
  });
});

describe("text demo", () => {
  it("cuts text to the maximum length by characters", () => {
    expect(truncateText("abcdef", 3)).toBe("abc");
    expect(truncateText("a😀b😀", 2)).toBe("a😀");
  });

  it("flags text shorter than the minimum, but not an empty field", () => {
    const cfg = textDemoConfig({ min: 4, max: 10 });
    expect(validateText("ab", cfg).tooShort).toBe(true);
    expect(validateText("abcd", cfg).tooShort).toBe(false);
    expect(validateText("", cfg).valid).toBe(true);
  });

  it("checks the whole text against the pattern", () => {
    const cfg = textDemoConfig({ pattern: "[a-z]+" });
    expect(validateText("abc", cfg).patternMismatch).toBe(false);
    expect(validateText("abc1", cfg).patternMismatch).toBe(true);
    expect(validateText("abc1", cfg).valid).toBe(false);
  });

  it("reports a pattern that does not compile instead of throwing", () => {
    const result = validateText("abc", { min: 0, pattern: "(" });
    expect(result.patternInvalid).toBe(true);
    expect(result.valid).toBe(true);
    const tooLong = validateText("abc", { min: 0, pattern: "a".repeat(501) });
    expect(tooLong.patternInvalid).toBe(true);
  });

  it("uses password mode from the form", () => {
    expect(textDemoConfig({ mode: "password" }).password).toBe(true);
    expect(textDemoConfig({}).password).toBe(false);
  });
});

describe("choice demo", () => {
  it("wraps the selection in both directions", () => {
    expect(moveSelection(2, 1, 3)).toBe(0);
    expect(moveSelection(0, -1, 3)).toBe(2);
    expect(moveSelection(-1, 1, 3)).toBe(0);
    expect(moveSelection(0, 1, 0)).toBe(-1);
  });
});

describe("date and time demo", () => {
  it("follows the form and defaults to a date", () => {
    expect(dateTimeDemoConfig({ has_time: true, has_date: false })).toEqual({
      hasDate: false,
      hasTime: true,
    });
    expect(dateTimeDemoConfig({ has_time: true, has_date: true })).toEqual({
      hasDate: true,
      hasTime: true,
    });
    expect(dateTimeDemoConfig({})).toEqual({ hasDate: true, hasTime: false });
  });
});

describe("timer demo", () => {
  it("reads every duration shape the form can hold", () => {
    expect(parseDurationSeconds("0:05:00")).toBe(300);
    expect(parseDurationSeconds("01:30")).toBe(90);
    expect(parseDurationSeconds(45)).toBe(45);
    expect(parseDurationSeconds({ hours: 1, minutes: "2", seconds: 3 })).toBe(
      3723
    );
    expect(parseDurationSeconds("nonsense")).toBe(0);
    expect(parseDurationSeconds(undefined)).toBe(0);
  });

  it("counts from a fallback when no duration is set yet", () => {
    expect(timerDemoConfig({ duration: "0:00:30" })).toEqual({
      seconds: 30,
      usedFallback: false,
    });
    expect(timerDemoConfig({}).usedFallback).toBe(true);
  });

  it("counts down, pauses without losing time, and resumes", () => {
    const duration = 60_000;
    const started = timerStart(timerIdle(duration), duration, 1000);
    expect(started.status).toBe("active");
    expect(timerRemainingMs(started, 21_000)).toBe(40_000);

    const paused = timerPause(started, 21_000);
    expect(paused.status).toBe("paused");
    expect(timerRemainingMs(paused, 999_000)).toBe(40_000);

    const resumed = timerStart(paused, duration, 100_000);
    expect(timerRemainingMs(resumed, 110_000)).toBe(30_000);
  });

  it("finishes at zero and can be started again from the full duration", () => {
    const duration = 5000;
    const started = timerStart(timerIdle(duration), duration, 0);
    expect(timerTick(started, 4999).status).toBe("active");
    const done = timerTick(started, 5000);
    expect(done).toEqual({ status: "finished", remainingMs: 0, endsAt: null });
    const again = timerStart(done, duration, 9000);
    expect(timerRemainingMs(again, 9000)).toBe(5000);
  });

  it("cancel returns to the full duration", () => {
    expect(timerCancel(7000)).toEqual(timerIdle(7000));
  });

  it("formats the face as mm:ss and rounds a part of a second up", () => {
    expect(formatClock(65_000)).toBe("01:05");
    expect(formatClock(59_001)).toBe("01:00");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(3_725_000)).toBe("1:02:05");
  });
});

describe("schedule demo", () => {
  // 2024-01-08 was a Monday.
  const monday = (h: number, m = 0) => new Date(2024, 0, 8, h, m, 0);
  const config = {
    monday: [
      { from: "07:00:00", to: "09:30:00" },
      { from: "18:00", to: "24:00:00" },
    ],
  };

  it("is on inside a block and says when it ends", () => {
    expect(scheduleNow(config, monday(8))).toEqual({
      on: true,
      changesAt: 9 * 3600 + 30 * 60,
    });
  });

  it("is off between blocks and says when the next starts", () => {
    expect(scheduleNow(config, monday(12))).toEqual({
      on: false,
      changesAt: 18 * 3600,
    });
  });

  it("treats the end of a block as off and 24:00 as the end of the day", () => {
    expect(scheduleNow(config, monday(9, 30)).on).toBe(false);
    expect(scheduleNow(config, monday(23, 59)).on).toBe(true);
  });

  it("is off on a day with no blocks", () => {
    expect(scheduleNow(config, new Date(2024, 0, 9, 8))).toEqual({
      on: false,
      changesAt: null,
    });
    expect(scheduleNow(undefined, monday(8)).on).toBe(false);
  });

  it("ignores blocks that cannot be read", () => {
    const bad = {
      monday: [
        { from: "x", to: "y" },
        { from: "10:00", to: "09:00" },
      ],
    };
    expect(scheduleNow(bad, monday(10)).on).toBe(false);
    expect(parseClockSeconds("25:00")).toBeNull();
    expect(parseClockSeconds("24:00:00")).toBe(86400);
  });
});
