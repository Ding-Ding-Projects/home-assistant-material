import { describe, expect, it } from "vitest";
import {
  CUE_TONES,
  gainForVolume,
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
