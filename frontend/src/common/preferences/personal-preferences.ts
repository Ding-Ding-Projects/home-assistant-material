import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { narrator } from "../narration/narrator";
import { attentionModes } from "./attention-modes";
import { focusSpotlight } from "./focus-spotlight";
import { oneThingAtATime } from "./one-thing";
import { safeGetStored, safeSetStored } from "./safe-storage";

/**
 * Personal preferences: language mode, the two playfulness levels, action
 * sounds and the attention modes.
 *
 * The choices live in this browser's storage. `applyPersonalPreferences`
 * turns them into attributes on the document element, a stylesheet in the
 * document head reads those attributes, and the spotlight and the sound
 * service read the stored values directly.
 */

export const PERSONAL_PREFERENCES_STORAGE_KEY = "personalPreferences";

export type LanguageMode = "english" | "cantonese" | "bilingual";

export const LANGUAGE_MODES: LanguageMode[] = [
  "english",
  "cantonese",
  "bilingual",
];

export type NarratorSpeakIn = "english" | "cantonese" | "both";

export const NARRATOR_SPEAK_IN: NarratorSpeakIn[] = [
  "english",
  "cantonese",
  "both",
];

export const NARRATOR_RATE_MIN = 0.5;
export const NARRATOR_RATE_MAX = 2;
export const NARRATOR_PITCH_MIN = 0.5;
export const NARRATOR_PITCH_MAX = 2;

/** What School mode can switch on while it is on; each has a real effect. */
export const SCHOOL_RULES = [
  "plain_english",
  "low_stimulation",
  "quiet_sounds",
  "no_emojis",
  "one_thing",
  "hide_developer_tools",
] as const;

export type SchoolRule = (typeof SCHOOL_RULES)[number];

export const SCHOOL_NAME_MAX = 40;

export const FUNNY_LEVEL_MIN = 1;
export const FUNNY_LEVEL_MAX = 5;
export const VOLUME_MIN = 0;
export const VOLUME_MAX = 100;

export interface PersonalPreferences {
  languageMode: LanguageMode;
  /** 1 is fully serious, 5 is as playful as it gets. */
  funnyEnglish: number;
  funnyCantonese: number;
  soundEffects: boolean;
  /** Loudness of action sounds, from 0 to 100. */
  soundVolume: number;
  /** Quieter colour, no non-essential motion, and no action sounds. */
  lowStimulation: boolean;
  /** Dims everything except the control that has the keyboard focus. */
  focusSpotlight: boolean;
  /** Silences action sounds between two times of day on chosen days. */
  quietHours: boolean;
  /** Start of quiet hours as "HH:MM", 24 hours. */
  quietFrom: string;
  /** End of quiet hours as "HH:MM", 24 hours. */
  quietTo: string;
  /** Days quiet hours start on, 0 is Sunday and 6 is Saturday. */
  quietDays: number[];
  /** Shows the time and how long this tab has been open. */
  timeAwareness: boolean;
  /** Offers to take you back to the page you were last on. */
  momentum: boolean;
  /** Shows one fitting emoji in dialogs that provide one. */
  dialogEmojis: boolean;
  /** Keeps one expansion panel open at a time among its siblings. */
  oneThingAtATime: boolean;
  /** A comfort setting in this browser, see `effectivePreferences`. */
  schoolMode: boolean;
  /** The name School mode is shown under. */
  schoolName: string;
  /** The rules School mode applies while it is on. */
  schoolRules: SchoolRule[];
  /** Reads the name of the focused or activated control aloud. */
  narratorEnabled: boolean;
  narratorSpeakIn: NarratorSpeakIn;
  /** The chosen voice by its URI, or empty to choose automatically. */
  narratorVoiceEnglish: string;
  narratorVoiceCantonese: string;
  /** Speech rate, 0.5 to 2. */
  narratorRate: number;
  /** Speech pitch, 0.5 to 2. */
  narratorPitch: number;
}

export const DEFAULT_PERSONAL_PREFERENCES: PersonalPreferences = {
  languageMode: "english",
  funnyEnglish: 5,
  funnyCantonese: 5,
  soundEffects: true,
  soundVolume: 40,
  lowStimulation: false,
  focusSpotlight: false,
  quietHours: false,
  quietFrom: "22:00",
  quietTo: "07:00",
  quietDays: [0, 1, 2, 3, 4, 5, 6],
  timeAwareness: false,
  momentum: false,
  dialogEmojis: true,
  oneThingAtATime: false,
  schoolMode: false,
  schoolName: "School mode",
  schoolRules: ["plain_english", "low_stimulation", "quiet_sounds"],
  narratorEnabled: false,
  narratorSpeakIn: "both",
  narratorVoiceEnglish: "",
  narratorVoiceCantonese: "",
  narratorRate: 1,
  narratorPitch: 1,
};

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const asTime = (value: unknown, fallback: string) =>
  typeof value === "string" && TIME_PATTERN.test(value) ? value : fallback;

const asDays = (value: unknown, fallback: number[]) =>
  Array.isArray(value)
    ? [
        ...new Set(
          value.filter(
            (day): day is number =>
              typeof day === "number" &&
              Number.isInteger(day) &&
              day >= 0 &&
              day <= 6
          )
        ),
      ].sort((a, b) => a - b)
    : fallback;

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const clampTenth = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value * 10) / 10))
    : fallback;

const asText = (value: unknown, fallback: string) =>
  typeof value === "string" && value.length <= 300 ? value : fallback;

const asBool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

const asRules = (value: unknown, fallback: SchoolRule[]): SchoolRule[] =>
  Array.isArray(value)
    ? SCHOOL_RULES.filter((rule) => value.includes(rule))
    : fallback;

const asName = (value: unknown, fallback: string) =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, SCHOOL_NAME_MAX)
    : fallback;

/** Fills gaps and drops anything that is not a valid stored value. */
export const normalizePersonalPreferences = (
  stored?: Partial<PersonalPreferences> | null
): PersonalPreferences => {
  const d = DEFAULT_PERSONAL_PREFERENCES;
  const source: Partial<Record<keyof PersonalPreferences, unknown>> =
    stored && typeof stored === "object" ? stored : {};
  return {
    languageMode: LANGUAGE_MODES.includes(source.languageMode as LanguageMode)
      ? (source.languageMode as LanguageMode)
      : d.languageMode,
    funnyEnglish: clampInt(
      source.funnyEnglish,
      FUNNY_LEVEL_MIN,
      FUNNY_LEVEL_MAX,
      d.funnyEnglish
    ),
    funnyCantonese: clampInt(
      source.funnyCantonese,
      FUNNY_LEVEL_MIN,
      FUNNY_LEVEL_MAX,
      d.funnyCantonese
    ),
    soundEffects: asBool(source.soundEffects, d.soundEffects),
    soundVolume: clampInt(
      source.soundVolume,
      VOLUME_MIN,
      VOLUME_MAX,
      d.soundVolume
    ),
    lowStimulation: asBool(source.lowStimulation, d.lowStimulation),
    focusSpotlight: asBool(source.focusSpotlight, d.focusSpotlight),
    quietHours: asBool(source.quietHours, d.quietHours),
    quietFrom: asTime(source.quietFrom, d.quietFrom),
    quietTo: asTime(source.quietTo, d.quietTo),
    quietDays: asDays(source.quietDays, d.quietDays),
    timeAwareness: asBool(source.timeAwareness, d.timeAwareness),
    momentum: asBool(source.momentum, d.momentum),
    dialogEmojis: asBool(source.dialogEmojis, d.dialogEmojis),
    oneThingAtATime: asBool(source.oneThingAtATime, d.oneThingAtATime),
    schoolMode: asBool(source.schoolMode, d.schoolMode),
    schoolName: asName(source.schoolName, d.schoolName),
    schoolRules: asRules(source.schoolRules, d.schoolRules),
    narratorEnabled: asBool(source.narratorEnabled, d.narratorEnabled),
    narratorSpeakIn: NARRATOR_SPEAK_IN.includes(
      source.narratorSpeakIn as NarratorSpeakIn
    )
      ? (source.narratorSpeakIn as NarratorSpeakIn)
      : d.narratorSpeakIn,
    narratorVoiceEnglish: asText(
      source.narratorVoiceEnglish,
      d.narratorVoiceEnglish
    ),
    narratorVoiceCantonese: asText(
      source.narratorVoiceCantonese,
      d.narratorVoiceCantonese
    ),
    narratorRate: clampTenth(
      source.narratorRate,
      NARRATOR_RATE_MIN,
      NARRATOR_RATE_MAX,
      d.narratorRate
    ),
    narratorPitch: clampTenth(
      source.narratorPitch,
      NARRATOR_PITCH_MIN,
      NARRATOR_PITCH_MAX,
      d.narratorPitch
    ),
  };
};

/** The choices as the person made them, before School mode is applied. */
export const getStoredPreferences = (): PersonalPreferences =>
  normalizePersonalPreferences(
    safeGetStored<Partial<PersonalPreferences>>(
      PERSONAL_PREFERENCES_STORAGE_KEY
    )
  );

/**
 * The preference fields that School mode takes over, by the rule that does
 * it. While the mode is on these fields read as the rule says, whatever is
 * stored; the stored choice itself is never changed, so it comes back when
 * the mode is turned off.
 */
export const SCHOOL_RULE_FIELDS: Record<
  SchoolRule,
  (keyof PersonalPreferences)[]
> = {
  plain_english: ["languageMode", "funnyEnglish", "funnyCantonese"],
  low_stimulation: ["lowStimulation"],
  quiet_sounds: ["soundEffects"],
  no_emojis: ["dialogEmojis"],
  one_thing: ["oneThingAtATime"],
  // Only hides an entry; there is no preference field to hold.
  hide_developer_tools: [],
};

/** The fields School mode holds fixed right now. */
export const schoolHeldFields = (
  preferences: PersonalPreferences
): Set<keyof PersonalPreferences> =>
  new Set(
    preferences.schoolMode
      ? preferences.schoolRules.flatMap((rule) => SCHOOL_RULE_FIELDS[rule])
      : []
  );

/** The choices with the rules of School mode laid over them. */
export const effectivePreferences = (
  preferences: PersonalPreferences
): PersonalPreferences => {
  if (!preferences.schoolMode) {
    return preferences;
  }
  const rules = new Set(preferences.schoolRules);
  return {
    ...preferences,
    languageMode: rules.has("plain_english")
      ? "english"
      : preferences.languageMode,
    funnyEnglish: rules.has("plain_english")
      ? FUNNY_LEVEL_MIN
      : preferences.funnyEnglish,
    funnyCantonese: rules.has("plain_english")
      ? FUNNY_LEVEL_MIN
      : preferences.funnyCantonese,
    lowStimulation: rules.has("low_stimulation")
      ? true
      : preferences.lowStimulation,
    soundEffects: rules.has("quiet_sounds") ? false : preferences.soundEffects,
    dialogEmojis: rules.has("no_emojis") ? false : preferences.dialogEmojis,
    oneThingAtATime: rules.has("one_thing")
      ? true
      : preferences.oneThingAtATime,
  };
};

/** True while School mode is on and its rule to leave out Developer tools is chosen. */
export const isDeveloperToolsHidden = (
  preferences: PersonalPreferences
): boolean =>
  preferences.schoolMode &&
  preferences.schoolRules.includes("hide_developer_tools");

/** The stored choices as everything else in the interface reads them. */
export const getPersonalPreferences = (): PersonalPreferences =>
  effectivePreferences(getStoredPreferences());

/** Fired on the window when a change could not be kept in browser storage. */
export const PERSONAL_PREFERENCES_NOT_SAVED_EVENT =
  "personal-preferences-not-saved";

/** True when the browser storage now holds exactly this value. */
const storedAs = (value: unknown): boolean => {
  try {
    return (
      getStorage().storage.getItem(PERSONAL_PREFERENCES_STORAGE_KEY) ===
      JSON.stringify(value)
    );
  } catch (_err) {
    return false;
  }
};

/**
 * Saves a change on top of the stored choices. `saved` is false when browser
 * storage is blocked or full: the choice still applies until the page is
 * closed, but it will not be there next time, and the caller should say so.
 */
export const savePersonalPreferences = (
  change: Partial<PersonalPreferences>
): { preferences: PersonalPreferences; saved: boolean } => {
  const next = normalizePersonalPreferences({
    ...getStoredPreferences(),
    ...change,
  });
  const saved =
    safeSetStored(PERSONAL_PREFERENCES_STORAGE_KEY, next) && storedAs(next);
  return { preferences: next, saved };
};

/**
 * Saves a change on top of the stored choices and returns the result. When
 * the change cannot be kept, the window gets a
 * `personal-preferences-not-saved` event.
 */
export const updatePersonalPreferences = (
  change: Partial<PersonalPreferences>
): PersonalPreferences => {
  const { preferences, saved } = savePersonalPreferences(change);
  if (!saved && typeof window !== "undefined") {
    window.dispatchEvent(new Event(PERSONAL_PREFERENCES_NOT_SAVED_EVENT));
  }
  return preferences;
};

/** Removes every stored choice, so the defaults apply again. */
export const resetPersonalPreferences = (): PersonalPreferences => {
  safeSetStored(PERSONAL_PREFERENCES_STORAGE_KEY, undefined);
  return getStoredPreferences();
};

/** Calls back when the stored choices change, in this tab or another. */
export const subscribePersonalPreferences = (
  callback: (preferences: PersonalPreferences) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(PERSONAL_PREFERENCES_STORAGE_KEY, () =>
    callback(getPersonalPreferences())
  );
const STYLE_ID = "ha-personal-preferences";

// Low stimulation shortens every animation that uses the theme's duration
// tokens and softens colour for the whole document. The spotlight is drawn
// by its own element, see focus-spotlight.ts.
const STYLES = `
html[data-low-stimulation] {
  --ha-animation-duration-instant: 1ms !important;
  --ha-animation-duration-fast: 1ms !important;
  --ha-animation-duration-normal: 1ms !important;
  --ha-animation-duration-slow: 1ms !important;
  scroll-behavior: auto !important;
}
html[data-low-stimulation] body {
  filter: saturate(0.6);
}
`;

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
};

/** Writes the choices to the document so stylesheets and consumers see them. */
export const applyPersonalPreferences = (
  preferences: PersonalPreferences
): void => {
  ensureStyles();
  const root = document.documentElement;
  root.setAttribute("data-language-mode", preferences.languageMode);
  root.setAttribute("data-funny-english", String(preferences.funnyEnglish));
  root.setAttribute("data-funny-cantonese", String(preferences.funnyCantonese));
  if (preferences.lowStimulation) {
    root.setAttribute("data-low-stimulation", "");
  } else {
    root.removeAttribute("data-low-stimulation");
  }
  focusSpotlight.setEnabled(preferences.focusSpotlight);
  attentionModes.apply(preferences);
  narrator.setEnabled(preferences.narratorEnabled);
  oneThingAtATime.setEnabled(preferences.oneThingAtATime);
};

let initialized = false;

/**
 * Applies the stored choices now and again whenever they change. Safe to
 * call more than once.
 */
export const initPersonalPreferences = (): void => {
  if (initialized) {
    return;
  }
  initialized = true;
  applyPersonalPreferences(getPersonalPreferences());
  subscribePersonalPreferences(applyPersonalPreferences);
};
