import type { TemplateResult } from "lit";
import { html } from "lit";
import type { LanguageMode } from "../preferences/personal-preferences";
import type { ModeParts } from "./language-mode";
import { sameIgnoringPunctuation } from "./language-mode";

export const ENGLISH_LANG_TAG = "en";
export const CANTONESE_LANG_TAG = "yue-Hant-HK";

export interface LangSpan {
  text: string;
  lang: string;
}

/**
 * The pieces to show for a mode, each with its own language tag, so a screen
 * reader switches voice for the Cantonese part. Mirrors `joinForMode`.
 */
export const spansForMode = (
  parts: ModeParts,
  mode: LanguageMode
): LangSpan[] => {
  const english: LangSpan = { text: parts.english, lang: ENGLISH_LANG_TAG };
  if (parts.cantonese === undefined || mode === "english") {
    return [english];
  }
  const cantonese: LangSpan = {
    text: parts.cantonese,
    lang: CANTONESE_LANG_TAG,
  };
  if (mode === "cantonese") {
    return [cantonese];
  }
  return sameIgnoringPunctuation(parts.cantonese, parts.english)
    ? [english]
    : [english, cantonese];
};

/**
 * Renders the pieces as separate spans with `lang` attributes. Pass a
 * separator such as " · " (default) to sit between two languages.
 */
export const renderBilingual = (
  parts: ModeParts,
  mode: LanguageMode,
  separator = " · "
): TemplateResult => {
  const spans = spansForMode(parts, mode);
  return html`${spans.map(
    (span, index) =>
      html`${index > 0 ? separator : ""}<span lang=${span.lang}
          >${span.text}</span
        >`
  )}`;
};
