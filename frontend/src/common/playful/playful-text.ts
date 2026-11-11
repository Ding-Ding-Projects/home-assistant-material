import type { Localize, ModeParts } from "../language-mode/language-mode";
import {
  fillPlaceholders,
  joinForMode,
  yueString,
} from "../language-mode/language-mode";
import type { LanguageMode } from "../preferences/personal-preferences";
import {
  FUNNY_LEVEL_MAX,
  FUNNY_LEVEL_MIN,
  getPersonalPreferences,
} from "../preferences/personal-preferences";

/**
 * Playful wording for the interface's own optional messages.
 *
 * A message may have a plain text under `key` and variants under
 * `key.level_1` to `key.level_5`, where 1 is fully serious and 5 is as
 * playful as it gets. A level without a variant uses the plain text, so a
 * message can be made playful one level at a time. Each language has its own
 * level. Facts never change with the level: numbers, names, errors and
 * warnings are written outside the variants (as placeholders) or are not made
 * playful at all.
 */

type Values = Record<string, string | number>;

export const clampLevel = (level: number): number =>
  Number.isFinite(level)
    ? Math.min(FUNNY_LEVEL_MAX, Math.max(FUNNY_LEVEL_MIN, Math.round(level)))
    : FUNNY_LEVEL_MAX;

export const playfulKey = (key: string, level: number): string =>
  `${key}.level_${clampLevel(level)}`;

/** True when localize gave a real translation and not an empty or echoed key. */
const found = (text: string | undefined, key: string): text is string =>
  !!text && text !== key;

/** The English text for a level: the variant, else the plain text. */
export const playfulEnglish = (
  localize: Localize,
  key: string,
  level: number,
  values?: Values
): string => {
  const variantKey = playfulKey(key, level);
  const variant = localize(variantKey, values);
  if (found(variant, variantKey)) {
    return variant;
  }
  const plain = localize(key, values);
  return found(plain, key) ? plain : "";
};

/** The Cantonese text for a level, or undefined when there is none. */
export const playfulCantonese = (
  key: string,
  level: number,
  values?: Values
): string | undefined => {
  const raw = yueString(playfulKey(key, level)) ?? yueString(key);
  return raw === undefined ? undefined : fillPlaceholders(raw, values);
};

export interface PlayfulLevels {
  english: number;
  cantonese: number;
}

/** The two texts for their own levels. */
export const playfulParts = (
  localize: Localize,
  key: string,
  levels: PlayfulLevels,
  values?: Values
): ModeParts => ({
  english: playfulEnglish(localize, key, levels.english, values),
  cantonese: playfulCantonese(key, levels.cantonese, values),
});

/** The levels in the current choices, School mode included. */
export const currentLevels = (): PlayfulLevels => {
  try {
    const prefs = getPersonalPreferences();
    return { english: prefs.funnyEnglish, cantonese: prefs.funnyCantonese };
  } catch (_err) {
    return { english: FUNNY_LEVEL_MIN, cantonese: FUNNY_LEVEL_MIN };
  }
};

/** A playful message in the chosen language mode, at the chosen levels. */
export const playfulText = (
  localize: Localize,
  key: string,
  mode: LanguageMode,
  levels: PlayfulLevels = currentLevels(),
  values?: Values,
  separator?: string
): string =>
  joinForMode(playfulParts(localize, key, levels, values), mode, separator);
