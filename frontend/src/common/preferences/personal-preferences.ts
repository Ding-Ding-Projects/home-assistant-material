import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { focusSpotlight } from "./focus-spotlight";

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
}

export const DEFAULT_PERSONAL_PREFERENCES: PersonalPreferences = {
  languageMode: "english",
  funnyEnglish: 5,
  funnyCantonese: 5,
  soundEffects: true,
  soundVolume: 40,
  lowStimulation: false,
  focusSpotlight: false,
};

const clampInt = (
  value: unknown,
  min: number,
  max: number,
  fallback: number
) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.round(value)))
    : fallback;

const asBool = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

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
  };
};

/** The stored choices, as they are now. */
export const getPersonalPreferences = (): PersonalPreferences =>
  normalizePersonalPreferences(
    getStorage().getValue<Partial<PersonalPreferences>>(
      PERSONAL_PREFERENCES_STORAGE_KEY
    )
  );

/** Saves a change on top of the stored choices and returns the result. */
export const updatePersonalPreferences = (
  change: Partial<PersonalPreferences>
): PersonalPreferences => {
  const next = normalizePersonalPreferences({
    ...getPersonalPreferences(),
    ...change,
  });
  getStorage().setValue(PERSONAL_PREFERENCES_STORAGE_KEY, next);
  return next;
};

/** Removes every stored choice, so the defaults apply again. */
export const resetPersonalPreferences = (): PersonalPreferences => {
  getStorage().setValue(PERSONAL_PREFERENCES_STORAGE_KEY, undefined);
  return getPersonalPreferences();
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
