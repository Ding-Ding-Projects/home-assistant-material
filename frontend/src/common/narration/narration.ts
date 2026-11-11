import type {
  NarratorSpeakIn,
  PersonalPreferences,
} from "../preferences/personal-preferences";
import type { SilenceReason } from "../sound/action-sound";
import { silenceReason } from "../sound/action-sound";

/**
 * The pure parts of the spoken narrator: which words to speak, in which
 * language, with which voice, and when to stay silent. The browser's own
 * speech synthesis does the speaking, see `narrator.ts`.
 */

export type SpeechLanguage = "en" | "yue";

export interface SpeechPart {
  text: string;
  language: SpeechLanguage;
}

/** Language tag handed to the speech engine for each language. */
export const SPEECH_LANG_TAG: Record<SpeechLanguage, string> = {
  en: "en",
  yue: "zh-HK",
};

const CJK = /[㐀-鿿豈-﫿]/;

export const containsCantonese = (text: string): boolean => CJK.test(text);

/** Longest name that is read aloud. A longer one is cut at a word. */
export const MAX_SPOKEN_LENGTH = 120;

const clean = (text: string | null | undefined): string => {
  const flat = (text ?? "").replace(/\s+/g, " ").trim();
  if (flat.length <= MAX_SPOKEN_LENGTH) {
    return flat;
  }
  const cut = flat.slice(0, MAX_SPOKEN_LENGTH);
  const space = cut.lastIndexOf(" ");
  return (space > 40 ? cut.slice(0, space) : cut).trim();
};

/**
 * Splits a name into the pieces the language mode joined together: two
 * languages sit on separate lines or after " · ".
 */
export const splitSegments = (text: string): string[] =>
  text
    .split(/\n|\s·\s/)
    .map((segment) => segment.trim())
    .filter(Boolean);

/**
 * What to speak for a text, given the "speak in" choice. English keeps the
 * pieces without Chinese characters, Cantonese keeps the pieces with them,
 * and both keeps everything, one piece at a time. An empty result means the
 * text has nothing in the chosen language, so nothing is spoken.
 */
export const selectSpeech = (
  text: string,
  speakIn: NarratorSpeakIn
): SpeechPart[] => {
  const parts: SpeechPart[] = splitSegments(text).map((segment) => ({
    text: segment,
    language: containsCantonese(segment) ? "yue" : "en",
  }));
  if (speakIn === "english") {
    return parts.filter((part) => part.language === "en");
  }
  if (speakIn === "cantonese") {
    return parts.filter((part) => part.language === "yue");
  }
  return parts;
};

export interface VoiceInfo {
  voiceURI: string;
  name: string;
  lang: string;
  default?: boolean;
  /** True when the voice runs on this device; a network voice sends text out. */
  localService: boolean;
}

/**
 * Three-letter (ISO 639-2) language codes that some engines report, mapped
 * to the two-letter code the rest of the page uses. `yue` has no two-letter
 * form and stays as it is.
 */
const THREE_LETTER: Record<string, string> = {
  eng: "en",
  zho: "zh",
  chi: "zh",
  cmn: "zh",
  deu: "de",
  ger: "de",
  fra: "fr",
  fre: "fr",
  spa: "es",
  ita: "it",
  nld: "nl",
  dut: "nl",
  por: "pt",
  rus: "ru",
  jpn: "ja",
  kor: "ko",
  swe: "sv",
  nor: "no",
  nob: "nb",
  nno: "nn",
  dan: "da",
  fin: "fi",
  pol: "pl",
  ces: "cs",
  cze: "cs",
  tur: "tr",
  ell: "el",
  gre: "el",
  heb: "he",
  ara: "ar",
  hin: "hi",
  ukr: "uk",
  hun: "hu",
  ron: "ro",
  rum: "ro",
  cat: "ca",
};

/** Three-letter region codes that some engines report, mapped to two letters. */
const THREE_LETTER_REGION: Record<string, string> = {
  hkg: "hk",
  twn: "tw",
  chn: "cn",
  sgp: "sg",
  mac: "mo",
  usa: "us",
  gbr: "gb",
  aus: "au",
  can: "ca",
  irl: "ie",
  nzl: "nz",
  ind: "in",
  zaf: "za",
  deu: "de",
  aut: "at",
  che: "ch",
  fra: "fr",
  bel: "be",
  esp: "es",
  mex: "mx",
  arg: "ar",
  prt: "pt",
  bra: "br",
  ita: "it",
  nld: "nl",
  nor: "no",
  swe: "se",
  dnk: "dk",
  fin: "fi",
  pol: "pl",
  rus: "ru",
  jpn: "jp",
  kor: "kr",
};

/**
 * Splits a language tag into lower-case subtags, using `-` for `_`, and maps
 * a three-letter language code or region code to its two-letter form.
 */
export const languageSubtags = (tag: string): string[] => {
  const parts = (tag || "").toLowerCase().split(/[-_]/).filter(Boolean);
  if (parts.length) {
    parts[0] = THREE_LETTER[parts[0]] ?? parts[0];
  }
  for (let i = 1; i < parts.length; i++) {
    if (parts[i].length === 3) {
      parts[i] = THREE_LETTER_REGION[parts[i]] ?? parts[i];
    }
  }
  return parts;
};

export const voiceMatchesLanguage = (
  voice: Pick<VoiceInfo, "lang">,
  language: SpeechLanguage
): boolean => {
  const [primary, ...rest] = languageSubtags(voice.lang);
  if (language === "yue") {
    return (
      primary === "yue" ||
      (primary === "zh" && (rest.includes("hk") || rest.includes("yue")))
    );
  }
  return primary === "en";
};

/**
 * The voices that run on this device and speak a language tag, best first:
 * a full match (`de-AT`) before a same-language match (`de-DE`), then the
 * engine's default voice. A network voice is never offered.
 */
export const localVoicesForTag = <T extends VoiceInfo>(
  voices: T[],
  tag: string
): T[] => {
  const wanted = languageSubtags(tag);
  if (!wanted.length) {
    return [];
  }
  const score = (voice: T): number => {
    const have = languageSubtags(voice.lang);
    if (have[0] !== wanted[0]) {
      return -1;
    }
    const exact = wanted.length > 1 && have.join("-") === wanted.join("-");
    return (exact ? 2 : 0) + (voice.default ? 1 : 0);
  };
  return voices
    .filter((voice) => voice.localService === true && score(voice) >= 0)
    .sort((a, b) => score(b) - score(a));
};

/**
 * The voices that can speak a language, best first. Only voices that run on
 * this device are offered: a network voice would send the spoken text to a
 * server, and the narrator promises that nothing leaves the device.
 */
export const voicesFor = <T extends VoiceInfo>(
  voices: T[],
  language: SpeechLanguage
): T[] =>
  voices
    .filter(
      (voice) =>
        voice.localService === true && voiceMatchesLanguage(voice, language)
    )
    .sort((a, b) => Number(!!b.default) - Number(!!a.default));

/**
 * The voice to use: the chosen one when it still exists and speaks the
 * language, otherwise the best match. Undefined when none matches.
 */
export const pickVoice = <T extends VoiceInfo>(
  voices: T[],
  language: SpeechLanguage,
  preferredUri: string
): T | undefined => {
  const matching = voicesFor(voices, language);
  return (
    matching.find((voice) => voice.voiceURI === preferredUri) ?? matching[0]
  );
};

const INTERACTIVE_TAGS = new Set(["button", "a", "summary"]);
const INTERACTIVE_ROLES = new Set([
  "button",
  "link",
  "tab",
  "menuitem",
  "option",
  "switch",
  "checkbox",
  "radio",
]);

/**
 * The name of a control, the way a screen reader would find it, and never
 * the value of a field. Empty when the element has no name of its own.
 */
export const accessibleNameOf = (el: Element): string => {
  const aria = clean(el.getAttribute("aria-label"));
  if (aria) {
    return aria;
  }
  const labelledBy = el.getAttribute("aria-labelledby");
  if (labelledBy) {
    const root = el.getRootNode() as Partial<Document>;
    const named = clean(
      labelledBy
        .split(/\s+/)
        .map((id) => root.getElementById?.(id)?.textContent ?? "")
        .join(" ")
    );
    if (named) {
      return named;
    }
  }
  const label = (el as { label?: unknown }).label;
  if (typeof label === "string" && clean(label)) {
    return clean(label);
  }
  const attributeName = clean(
    el.getAttribute("title") ||
      el.getAttribute("placeholder") ||
      el.getAttribute("alt")
  );
  if (attributeName) {
    return attributeName;
  }
  const role = el.getAttribute("role");
  if (
    INTERACTIVE_TAGS.has(el.localName) ||
    (role !== null && INTERACTIVE_ROLES.has(role))
  ) {
    return clean(el.textContent);
  }
  return "";
};

/** The first name found along the path an event took, nearest first. */
export const nameFromPath = (path: EventTarget[], limit = 6): string => {
  let seen = 0;
  for (const target of path) {
    if (!(target instanceof Element)) {
      continue;
    }
    const name = accessibleNameOf(target);
    if (name) {
      return name;
    }
    seen += 1;
    if (seen >= limit) {
      break;
    }
  }
  return "";
};

/**
 * Why the narrator would be silent, or undefined when it would speak. It
 * follows the sound switch, low stimulation and quiet hours. The sound
 * volume does not apply: the narrator has its own rate and pitch.
 */
export const narratorSilence = (
  preferences: Pick<
    PersonalPreferences,
    | "soundEffects"
    | "lowStimulation"
    | "quietHours"
    | "quietFrom"
    | "quietTo"
    | "quietDays"
  >,
  now: Date = new Date()
): Exclude<SilenceReason, "volume-zero"> | undefined =>
  silenceReason({ ...preferences, soundVolume: 1 }, now) as
    Exclude<SilenceReason, "volume-zero"> | undefined;
