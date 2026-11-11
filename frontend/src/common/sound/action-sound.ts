import type { PersonalPreferences } from "../preferences/personal-preferences";
import { getPersonalPreferences } from "../preferences/personal-preferences";
import { scheduleZoneNow } from "../preferences/preference-schedule-store";

/**
 * Action sound effects: short tones made with the browser's audio engine, so
 * no audio file is shipped. Every cue goes through `playActionCue`, which
 * obeys the stored sound switch, the volume, and low stimulation mode.
 *
 * Sound is only a hint. The visible result is always complete without it,
 * and a device that cannot play audio is ignored without any message.
 */

export type ActionCue =
  "toggle-on" | "toggle-off" | "success" | "refused" | "reset" | "sample";

interface Tone {
  /** Frequency in hertz. */
  frequency: number;
  /** Start offset in seconds. */
  start: number;
  /** Length in seconds. */
  duration: number;
}

/** What each cue sounds like. Kept short and soft on purpose. */
export const CUE_TONES: Record<ActionCue, Tone[]> = {
  "toggle-on": [{ frequency: 660, start: 0, duration: 0.07 }],
  "toggle-off": [{ frequency: 440, start: 0, duration: 0.07 }],
  success: [
    { frequency: 523.25, start: 0, duration: 0.08 },
    { frequency: 783.99, start: 0.09, duration: 0.12 },
  ],
  refused: [
    { frequency: 330, start: 0, duration: 0.09 },
    { frequency: 247, start: 0.1, duration: 0.14 },
  ],
  reset: [
    { frequency: 587.33, start: 0, duration: 0.07 },
    { frequency: 440, start: 0.08, duration: 0.1 },
  ],
  sample: [
    { frequency: 523.25, start: 0, duration: 0.09 },
    { frequency: 659.25, start: 0.1, duration: 0.09 },
    { frequency: 783.99, start: 0.2, duration: 0.14 },
  ],
};

/** Peak gain for a volume from 0 to 100. Stays well below full scale. */
export const gainForVolume = (volume: number): number =>
  (Math.min(100, Math.max(0, volume)) / 100) * 0.25;

/** Why a cue would be silent, or undefined when it would play. */
export type SilenceReason =
  "off" | "low-stimulation" | "quiet-hours" | "volume-zero";

const minutesOf = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

/**
 * True when `now` falls inside quiet hours. A day in `quietDays` is the day
 * the quiet period starts on, so 22:00 to 07:00 on Friday runs into Saturday.
 */
export const isQuietNow = (
  preferences: Pick<
    PersonalPreferences,
    "quietHours" | "quietFrom" | "quietTo" | "quietDays"
  >,
  now: Date = new Date()
): boolean => {
  if (!preferences.quietHours) {
    return false;
  }
  const from = minutesOf(preferences.quietFrom);
  const to = minutesOf(preferences.quietTo);
  if (from === to) {
    return false;
  }
  const minute = now.getHours() * 60 + now.getMinutes();
  const today = now.getDay();
  const yesterday = (today + 6) % 7;
  if (from < to) {
    return (
      preferences.quietDays.includes(today) && minute >= from && minute < to
    );
  }
  return (
    (preferences.quietDays.includes(today) && minute >= from) ||
    (preferences.quietDays.includes(yesterday) && minute < to)
  );
};

export const silenceReason = (
  preferences: Pick<
    PersonalPreferences,
    "soundEffects" | "soundVolume" | "lowStimulation"
  > &
    Partial<
      Pick<
        PersonalPreferences,
        "quietHours" | "quietFrom" | "quietTo" | "quietDays"
      >
    >,
  now: Date = new Date()
): SilenceReason | undefined => {
  if (!preferences.soundEffects) {
    return "off";
  }
  if (preferences.lowStimulation) {
    return "low-stimulation";
  }
  if (
    preferences.quietHours &&
    preferences.quietFrom &&
    preferences.quietTo &&
    preferences.quietDays &&
    isQuietNow(
      {
        quietHours: preferences.quietHours,
        quietFrom: preferences.quietFrom,
        quietTo: preferences.quietTo,
        quietDays: preferences.quietDays,
      },
      now
    )
  ) {
    return "quiet-hours";
  }
  if (preferences.soundVolume <= 0) {
    return "volume-zero";
  }
  return undefined;
};

let context: AudioContext | undefined;

const getContext = (): AudioContext | undefined => {
  if (context) {
    return context;
  }
  const audioContextClass: typeof AudioContext | undefined =
    typeof window !== "undefined"
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext)
      : undefined;
  if (!audioContextClass) {
    return undefined;
  }
  try {
    context = new audioContextClass();
  } catch (_err) {
    context = undefined;
  }
  return context;
};

/**
 * Plays one cue. Returns true when tones were started and false when the
 * cue was silent for any reason. Never throws and never waits.
 */
export const playActionCue = (cue: ActionCue): boolean => {
  // Quiet hours run on the same clock as schedules: the profile's time zone.
  if (silenceReason(getPersonalPreferences(), scheduleZoneNow())) {
    return false;
  }
  const ctx = getContext();
  if (!ctx) {
    return false;
  }
  try {
    if (ctx.state === "suspended") {
      ctx.resume().catch(() => undefined);
    }
    const peak = gainForVolume(getPersonalPreferences().soundVolume);
    const now = ctx.currentTime;
    CUE_TONES[cue].forEach((tone) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = tone.frequency;
      const begin = now + tone.start;
      const end = begin + tone.duration;
      gain.gain.setValueAtTime(0.0001, begin);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(peak, 0.0002),
        begin + 0.01
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, end);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(begin);
      osc.stop(end + 0.02);
    });
    return true;
  } catch (_err) {
    return false;
  }
};
