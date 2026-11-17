/**
 * The look and motion of the two-key confirmation, as pure functions.
 *
 * Nothing here decides whether the confirmation counts: that stays in
 * `two-key.ts` and in the component. These functions only choose how strongly
 * the guard looks and moves for a given slider level, for the person's
 * "Confirmation drama" choice, and for reduced motion.
 */

/** How strongly the confirmation looks and moves. */
export type ConfirmationDrama = "off" | "calm" | "standard" | "dramatic";

export const CONFIRMATION_DRAMA_LEVELS: ConfirmationDrama[] = [
  "off",
  "calm",
  "standard",
  "dramatic",
];

export const DEFAULT_CONFIRMATION_DRAMA: ConfirmationDrama = "dramatic";

/** Anything that is not one of the four choices reads as the default. */
export const normalizeConfirmationDrama = (
  value: unknown,
  fallback: ConfirmationDrama = DEFAULT_CONFIRMATION_DRAMA
): ConfirmationDrama =>
  CONFIRMATION_DRAMA_LEVELS.includes(value as ConfirmationDrama)
    ? (value as ConfirmationDrama)
    : fallback;

/** The colour step of the core between the keys. */
export type CoreStage = "locked" | "keyed" | "armed" | "warm" | "hot";

/** Grey with no key, amber while armed, then orange and red past 1/3 and 2/3. */
export const confirmStage = (keysTurned: number, level: number): CoreStage => {
  if (keysTurned <= 0) {
    return "locked";
  }
  if (keysTurned === 1) {
    return "keyed";
  }
  if (level > 2 / 3) {
    return "hot";
  }
  if (level > 1 / 3) {
    return "warm";
  }
  return "armed";
};

export type StatusId =
  | "turn_both"
  | "one_turned"
  | "armed"
  | "keep_going"
  | "almost"
  | "last_chance"
  | "confirmed";

/** The words under the title. `level` runs from 0 to 1. */
export const confirmStatus = (state: {
  keysTurned: number;
  level: number;
  done: boolean;
}): StatusId => {
  if (state.done) {
    return "confirmed";
  }
  if (state.keysTurned <= 0) {
    return "turn_both";
  }
  if (state.keysTurned === 1) {
    return "one_turned";
  }
  if (state.level <= 0) {
    return "armed";
  }
  if (state.level < 0.5) {
    return "keep_going";
  }
  if (state.level < 0.9) {
    return "almost";
  }
  return "last_chance";
};

export type CoreLabel = "locked" | "armed" | "release";

export const coreLabel = (armed: boolean, level: number): CoreLabel => {
  if (!armed) {
    return "locked";
  }
  return level >= 1 ? "release" : "armed";
};

/** Which effects a drama choice allows, and how strongly the level scales them. */
export interface DramaProfile {
  /** Multiplies the slider level; 0 means no effect is scaled at all. */
  gain: number;
  /** The dialog content shakes at high levels. */
  shake: boolean;
  /** The "cannot be undone" tag flickers at high levels. */
  flicker: boolean;
  /** A faint scan line sweeps. */
  scan: boolean;
  /** The rings spin and pulse. */
  spin: boolean;
  /** The single white flash on confirm. */
  flash: boolean;
  /** The shockwave rings on confirm. */
  shockwave: boolean;
}

const STILL: DramaProfile = {
  gain: 0,
  shake: false,
  flicker: false,
  scan: false,
  spin: false,
  flash: false,
  shockwave: false,
};

const PROFILES: Record<ConfirmationDrama, DramaProfile> = {
  off: STILL,
  calm: {
    gain: 0.5,
    shake: false,
    flicker: false,
    scan: false,
    spin: true,
    flash: false,
    shockwave: true,
  },
  standard: {
    gain: 1,
    shake: true,
    flicker: true,
    scan: true,
    spin: true,
    flash: true,
    shockwave: true,
  },
  dramatic: {
    gain: 1.4,
    shake: true,
    flicker: true,
    scan: true,
    spin: true,
    flash: true,
    shockwave: true,
  },
};

/** Reduced motion and Off both mean: nothing moves, everything is still shown. */
export const dramaProfile = (
  drama: ConfirmationDrama,
  reducedMotion: boolean
): DramaProfile => (reducedMotion ? STILL : PROFILES[drama]);

export type DramaClass = "still" | ConfirmationDrama;

/** The class the component carries: `still` whenever nothing may move. */
export const dramaClass = (
  drama: ConfirmationDrama,
  reducedMotion: boolean
): DramaClass => (reducedMotion || drama === "off" ? "still" : drama);

/** Above these scaled levels the content shakes and the tag flickers. */
export const SHAKE_FROM = 0.25;
export const FLICKER_FROM = 0.5;

export interface EffectFlags {
  shake: boolean;
  flicker: boolean;
}

export const effectFlags = (
  level: number,
  profile: DramaProfile
): EffectFlags => {
  const hot = level * profile.gain;
  return {
    shake: profile.shake && hot > SHAKE_FROM,
    flicker: profile.flicker && hot > FLICKER_FROM,
  };
};

/** The slider percentage as a level from 0 to 1, held to its bounds. */
export const levelOf = (percent: number): number =>
  Math.min(1, Math.max(0, percent / 100));

/** True when a new haptic or sound tick is due while sliding. */
export const SLIDE_TICK_MS = 110;

export const slideTickDue = (
  lastTickAt: number,
  lastPercent: number,
  percent: number,
  now: number
): boolean =>
  percent > lastPercent &&
  Math.floor(percent / 10) > Math.floor(lastPercent / 10) &&
  now - lastTickAt >= SLIDE_TICK_MS;
