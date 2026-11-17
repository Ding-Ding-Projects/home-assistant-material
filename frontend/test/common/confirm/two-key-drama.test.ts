import { describe, expect, it } from "vitest";
import {
  CONFIRMATION_DRAMA_LEVELS,
  confirmStage,
  confirmStatus,
  coreLabel,
  DEFAULT_CONFIRMATION_DRAMA,
  dramaClass,
  dramaProfile,
  effectFlags,
  normalizeConfirmationDrama,
  slideTickDue,
} from "../../../src/common/confirm/two-key-drama";

// Protects how the two-key guard looks and moves: the colour step and the
// words follow the slider, the person's drama choice and reduced motion decide
// what moves, and a damaged stored choice can never switch anything on.

describe("colour step", () => {
  it("is grey with no key, amber with a key and when armed", () => {
    expect(confirmStage(0, 0)).toBe("locked");
    expect(confirmStage(1, 0.9)).toBe("keyed");
    expect(confirmStage(2, 0)).toBe("armed");
  });

  it("turns orange past a third and red past two thirds", () => {
    expect(confirmStage(2, 1 / 3)).toBe("armed");
    expect(confirmStage(2, 0.4)).toBe("warm");
    expect(confirmStage(2, 2 / 3)).toBe("warm");
    expect(confirmStage(2, 0.7)).toBe("hot");
  });
});

describe("status words", () => {
  const at = (keysTurned: number, level: number, done = false) =>
    confirmStatus({ keysTurned, level, done });

  it("asks for the keys first", () => {
    expect(at(0, 0)).toBe("turn_both");
    expect(at(1, 0)).toBe("one_turned");
  });

  it("follows the slider once both keys are turned", () => {
    expect(at(2, 0)).toBe("armed");
    expect(at(2, 0.3)).toBe("keep_going");
    expect(at(2, 0.6)).toBe("almost");
    expect(at(2, 0.95)).toBe("last_chance");
  });

  it("says confirmed once it is done, whatever the level", () => {
    expect(at(2, 1, true)).toBe("confirmed");
    expect(at(0, 0, true)).toBe("confirmed");
  });

  it("names the core by whether it is armed and at the end", () => {
    expect(coreLabel(false, 0.5)).toBe("locked");
    expect(coreLabel(true, 0.5)).toBe("armed");
    expect(coreLabel(true, 1)).toBe("release");
  });
});

describe("confirmation drama", () => {
  it("reads anything but the four choices as the default", () => {
    CONFIRMATION_DRAMA_LEVELS.forEach((level) =>
      expect(normalizeConfirmationDrama(level)).toBe(level)
    );
    expect(normalizeConfirmationDrama("loud")).toBe(DEFAULT_CONFIRMATION_DRAMA);
    expect(normalizeConfirmationDrama(undefined)).toBe(
      DEFAULT_CONFIRMATION_DRAMA
    );
    expect(normalizeConfirmationDrama(3, "calm")).toBe("calm");
  });

  it("is dramatic by default", () => {
    expect(DEFAULT_CONFIRMATION_DRAMA).toBe("dramatic");
  });

  it("allows shaking and flicker only for standard and dramatic", () => {
    expect(dramaProfile("calm", false).shake).toBe(false);
    expect(dramaProfile("calm", false).flicker).toBe(false);
    expect(dramaProfile("calm", false).flash).toBe(false);
    expect(dramaProfile("standard", false).shake).toBe(true);
    expect(dramaProfile("dramatic", false).flash).toBe(true);
    expect(dramaProfile("dramatic", false).gain).toBeGreaterThan(
      dramaProfile("standard", false).gain
    );
  });

  it("gives still for Off and for reduced motion, whatever the choice", () => {
    expect(dramaClass("dramatic", true)).toBe("still");
    expect(dramaClass("off", false)).toBe("still");
    expect(dramaClass("calm", false)).toBe("calm");
    CONFIRMATION_DRAMA_LEVELS.forEach((level) => {
      const profile = dramaProfile(level, true);
      expect(profile.gain).toBe(0);
      expect(
        profile.shake ||
          profile.flicker ||
          profile.scan ||
          profile.spin ||
          profile.flash ||
          profile.shockwave
      ).toBe(false);
    });
    expect(dramaProfile("off", false)).toEqual(dramaProfile("off", true));
  });
});

describe("effect switches", () => {
  it("shakes above a quarter and flickers above a half of the scaled level", () => {
    const profile = dramaProfile("standard", false);
    expect(effectFlags(0.2, profile)).toEqual({ shake: false, flicker: false });
    expect(effectFlags(0.3, profile)).toEqual({ shake: true, flicker: false });
    expect(effectFlags(0.6, profile)).toEqual({ shake: true, flicker: true });
  });

  it("starts sooner when the drama is higher", () => {
    expect(effectFlags(0.2, dramaProfile("dramatic", false)).shake).toBe(true);
    expect(effectFlags(0.2, dramaProfile("standard", false)).shake).toBe(false);
  });

  it("never switches anything on while nothing may move", () => {
    expect(effectFlags(1, dramaProfile("dramatic", true))).toEqual({
      shake: false,
      flicker: false,
    });
  });
});

describe("slide ticks", () => {
  it("ticks once for each tenth, rising, and not faster than the limit", () => {
    expect(slideTickDue(0, 9, 10, 1000)).toBe(true);
    expect(slideTickDue(0, 10, 15, 1000)).toBe(false);
    expect(slideTickDue(950, 9, 10, 1000)).toBe(false);
    expect(slideTickDue(0, 50, 40, 1000)).toBe(false);
  });
});
