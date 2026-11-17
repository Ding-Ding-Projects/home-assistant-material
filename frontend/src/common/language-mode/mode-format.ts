import type { LanguageMode } from "../preferences/personal-preferences";
import { currentLanguageMode, joinForMode } from "./language-mode";

/** The language tag used for every Cantonese date, time and number. */
export const CANTONESE_FORMAT_LANGUAGE = "zh-HK";

/**
 * Formats a value (a date, a time) for the language mode. `format` receives
 * the language to format in. English mode uses `language`, Cantonese mode uses
 * Hong Kong Cantonese, and the bilingual mode gives both, once each. Use it
 * for every date on a page so one page never writes a date two ways.
 */
export const formatForMode = (
  format: (language: string) => string,
  language: string,
  mode: LanguageMode = currentLanguageMode()
): string =>
  joinForMode(
    {
      english: format(language),
      cantonese: format(CANTONESE_FORMAT_LANGUAGE),
    },
    mode
  );
