import type { LocalizeFunc } from "../translations/localize";
import type { LanguageMode } from "../preferences/personal-preferences";
import { currentLanguageMode, joinForMode, yueString } from "./language-mode";

/**
 * Language mode for entity state words and attribute names.
 *
 * Words such as "On", "Open", "Fan mode" or "Heating" come from the backend
 * translation bundle for the one language the person chose. The functions that
 * build `hass.formatEntityState`, `formatEntityAttributeName` and
 * `formatEntityAttributeValue` look them up through a `localize` function with
 * keys of the form `component.<domain>.entity_component.<device class>.state.<state>`.
 *
 * Instead of touching those functions or any caller, the `localize` function
 * they receive is wrapped once, see `createEntityModeLocalize`. The wrapped
 * function answers the same keys from `yue_entity` in `yue-own.json`, which
 * mirrors the backend keys one to one. The lookup order (integration key, device
 * class, domain default) is untouched because it stays in the callers.
 *
 * - English: exactly what the original `localize` returns.
 * - Cantonese: the Cantonese word, or the English one when there is none.
 * - Both: English first, then the Cantonese word, or one of them when equal.
 *
 * Only these keys are changed, so numbers, units, dates and durations pass
 * through exactly as before.
 */

const ENTITY_COMPONENT = ".entity_component.";
const DEFAULT_STATE_PREFIX = "state.default.";
const ATTRIBUTE_NAMES_PREFIX = "ui.components.attributes.names.";

const keyCache = new Map<string, string>();

/**
 * The Cantonese key that belongs to a translation key the format functions
 * look up, or undefined when the key is not one of the entity words.
 */
export const entityYueKey = (key: string): string | undefined => {
  const cached = keyCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let mapped: string | undefined;
  if (key.startsWith("component.")) {
    const at = key.indexOf(ENTITY_COMPONENT);
    if (at > 0) {
      mapped = `yue_entity.${key.slice("component.".length, at)}.${key.slice(
        at + ENTITY_COMPONENT.length
      )}`;
    }
  } else if (key.startsWith(DEFAULT_STATE_PREFIX)) {
    mapped = `yue_entity.default.${key.slice(DEFAULT_STATE_PREFIX.length)}`;
  } else if (key.startsWith(ATTRIBUTE_NAMES_PREFIX)) {
    mapped = `yue_entity.attribute_names.${key.slice(
      ATTRIBUTE_NAMES_PREFIX.length
    )}`;
  }
  if (mapped !== undefined) {
    keyCache.set(key, mapped);
  }
  return mapped;
};

// Integration keys: `component.<platform>.entity.<domain>.<translation key>.state.<state>`
// (and `.state_attributes.<attribute>.state.<value>`). Integrations often word
// a state as the generic entity component does ("Off"), so the generic key
// answers for them, but only when it says exactly the same English text.
const INTEGRATION_KEY =
  /^component\.[^.]+\.entity\.([^.]+)\.[^.]+\.((?:state\.|state_attributes\.[^.]+\.state\.).+)$/;

/** The generic entity component key that an integration key may share words with. */
export const genericEntityKey = (key: string): string | undefined => {
  const match = INTEGRATION_KEY.exec(key);
  return match
    ? `component.${match[1]}.entity_component._.${match[2]}`
    : undefined;
};

// The stored mode is read from browser storage, which is far too slow to do
// for every row of every list. The answer is kept for a moment, and callers
// that know the mode changed (see `refreshEntityLanguageMode`) drop it.
const MODE_MAX_AGE_MS = 500;

let cachedMode: LanguageMode = "english";
let cachedAt: number | undefined;

/** The chosen language mode, read from storage at most twice a second. */
export const currentEntityLanguageMode = (): LanguageMode => {
  const now = Date.now();
  if (cachedAt === undefined || now - cachedAt > MODE_MAX_AGE_MS) {
    cachedMode = currentLanguageMode();
    cachedAt = now;
  }
  return cachedMode;
};

/** Forgets the remembered mode so the next call reads it again. */
export const refreshEntityLanguageMode = (): void => {
  cachedAt = undefined;
};

const wrappedFunctions = new WeakSet<LocalizeFunc>();
const wrappedByOriginal = new WeakMap<LocalizeFunc, LocalizeFunc>();

/**
 * Wraps the translation function the entity format functions use, so the
 * entity words follow the language mode. The mode is read on every call, so
 * the same wrapped function keeps working when the mode changes.
 */
export const createEntityModeLocalize = (
  localize: LocalizeFunc,
  getMode: () => LanguageMode = currentEntityLanguageMode
): LocalizeFunc => {
  // One result per key and mode. The English text of a key never changes for
  // one `localize` function, so the joined text can be kept as well.
  const cantonese = new Map<string, string>();
  const bilingual = new Map<string, string>();

  // The arguments are passed on exactly as they came, so the English text is
  // whatever the original function returns for that very call.
  const wrapped = ((key: string, ...rest: unknown[]) => {
    const english = (localize as (...args: unknown[]) => string)(key, ...rest);
    if (rest.length > 0 || english === "") {
      // A missing English word must keep falling through to the next lookup.
      return english;
    }
    const mode = getMode();
    if (mode === "english") {
      return english;
    }
    const memo = mode === "cantonese" ? cantonese : bilingual;
    const known = memo.get(key);
    if (known !== undefined) {
      return known;
    }
    let yueKey = entityYueKey(key);
    if (yueKey === undefined) {
      const generic = genericEntityKey(key);
      if (
        generic !== undefined &&
        (localize as (...args: unknown[]) => string)(generic) === english
      ) {
        yueKey = entityYueKey(generic);
      }
    }
    const yue = yueKey === undefined ? undefined : yueString(yueKey);
    const text =
      yue === undefined
        ? english
        : joinForMode({ english, cantonese: yue }, mode);
    memo.set(key, text);
    return text;
  }) as LocalizeFunc;
  wrappedFunctions.add(wrapped);
  return wrapped;
};

/**
 * The mode-aware version of a `localize` function, made once per function.
 * A function that is already mode-aware is returned as it is, so the text is
 * never joined twice when one format function calls another.
 */
export const entityModeLocalize = (localize: LocalizeFunc): LocalizeFunc => {
  if (wrappedFunctions.has(localize)) {
    return localize;
  }
  let wrapped = wrappedByOriginal.get(localize);
  if (!wrapped) {
    wrapped = createEntityModeLocalize(localize);
    wrappedByOriginal.set(localize, wrapped);
  }
  return wrapped;
};
