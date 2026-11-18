import type { HassConfig } from "home-assistant-js-websocket";
import type { FrontendLocaleData } from "../../data/translation";
import { resolveTimeZone } from "../datetime/resolve-time-zone";
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

const weekdayFormats = new Map<string, Intl.DateTimeFormat>();

const weekdayShortFormat = (language: string, timeZone: string) => {
  const id = `${language}|${timeZone}`;
  let format = weekdayFormats.get(id);
  if (!format) {
    format = new Intl.DateTimeFormat(language, { weekday: "short", timeZone });
    weekdayFormats.set(id, format);
  }
  return format;
};

/**
 * The short weekday name ("Mon") for the language mode. English mode gives
 * exactly what `formatDateWeekdayShort` gives; Cantonese mode and both mode
 * add the Hong Kong Cantonese name.
 */
export const formatWeekdayShortForMode = (
  date: Date,
  locale: FrontendLocaleData,
  config: HassConfig,
  mode: LanguageMode = currentLanguageMode()
): string => {
  const timeZone = resolveTimeZone(locale.time_zone, config.time_zone);
  return formatForMode(
    (language) => weekdayShortFormat(language, timeZone).format(date),
    locale.language,
    mode
  );
};
