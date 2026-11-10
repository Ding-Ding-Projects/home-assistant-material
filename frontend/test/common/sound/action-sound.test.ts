import { describe, expect, it } from "vitest";
import {
  CUE_TONES,
  gainForVolume,
  isQuietNow,
  silenceReason,
} from "../../../src/common/sound/action-sound";

// Protects the rule that sounds obey the switch, low stimulation and the
// volume, and that no cue can be loud enough to hurt.
describe("silenceReason", () => {
  const on = { soundEffects: true, soundVolume: 40, lowStimulation: false };
  it("plays when everything allows it", () => {
    expect(silenceReason(on)).toBeUndefined();
  });
  it("is silent when switched off", () => {
    expect(silenceReason({ ...on, soundEffects: false })).toBe("off");
  });
  it("is silent in low stimulation mode", () => {
    expect(silenceReason({ ...on, lowStimulation: true })).toBe(
      "low-stimulation"
    );
  });
  it("is silent at volume 0", () => {
    expect(silenceReason({ ...on, soundVolume: 0 })).toBe("volume-zero");
  });
});

describe("gainForVolume", () => {
  it("scales and stays below a quarter of full scale", () => {
    expect(gainForVolume(0)).toBe(0);
    expect(gainForVolume(100)).toBeCloseTo(0.25);
    expect(gainForVolume(500)).toBeCloseTo(0.25);
    expect(gainForVolume(-5)).toBe(0);
  });
});

describe("CUE_TONES", () => {
  it("keeps every cue short", () => {
    Object.values(CUE_TONES).forEach((tones) => {
      const end = Math.max(...tones.map((t) => t.start + t.duration));
      expect(end).toBeLessThan(0.5);
    });
  });
});

// Protects the overnight rule: a quiet period belongs to the day it starts on,
// so Friday 22:00 to 07:00 still silences Saturday at 06:00 but not Saturday at 08:00.
describe("quiet hours", () => {
  const quiet = {
    quietHours: true,
    quietFrom: "22:00",
    quietTo: "07:00",
    quietDays: [5],
  };
  // 2026-11-06 is a Friday, 2026-11-07 a Saturday.
  const at = (day: number, hour: number, minute = 0) =>
    new Date(2026, 10, day, hour, minute);
  it("is quiet late on a chosen day and early the next morning", () => {
    expect(isQuietNow(quiet, at(6, 22))).toBe(true);
    expect(isQuietNow(quiet, at(7, 6, 59))).toBe(true);
  });
  it("is not quiet outside the period or on other days", () => {
    expect(isQuietNow(quiet, at(7, 7))).toBe(false);
    expect(isQuietNow(quiet, at(6, 21, 59))).toBe(false);
    expect(isQuietNow(quiet, at(7, 22))).toBe(false);
  });
  it("is never quiet when switched off or when the times are equal", () => {
    expect(isQuietNow({ ...quiet, quietHours: false }, at(6, 23))).toBe(false);
    expect(isQuietNow({ ...quiet, quietTo: "22:00" }, at(6, 23))).toBe(false);
  });
  it("silences cues with its own reason", () => {
    const on = { soundEffects: true, soundVolume: 40, lowStimulation: false };
    expect(silenceReason({ ...on, ...quiet }, at(6, 23))).toBe("quiet-hours");
  });
});
