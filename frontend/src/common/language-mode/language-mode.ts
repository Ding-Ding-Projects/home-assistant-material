import type { LanguageMode } from "../preferences/personal-preferences";
import { getPersonalPreferences } from "../preferences/personal-preferences";
import yueSource from "../../translations/yue-own.json";

/**
 * Language mode for the text this project wrote itself.
 *
 * The interface's own translation loading is not touched. Beside it sits a
 * small second source of Cantonese strings (`translations/yue-own.json`) that
 * covers only the blocks listed in `YUE_PREFIXES`. A component asks for a
 * string through `modeText`, which reads the chosen language mode:
 *
 * - English: the normal translation, unchanged.
 * - Cantonese: the Cantonese string, or the English one when there is none.
 * - Both: English first, then the Cantonese string after a separator. When
 *   there is no Cantonese string, or it is the same text, only one is shown.
 *
 * Everything outside those blocks stays English in every mode.
 */

/** The translation blocks the Cantonese source covers. */
export const YUE_PREFIXES = [
  "ui.panel.config.personal.",
  "ui.dim_sum.",
  "ui.phone.",
  "ui.locks.",
  "ui.personal_wording.",
  "ui.drop_upload.",
  "ui.components.media-browser.file_management.",
  "ui.personal_prefs.",
  "ui.page_tabs.",
  "ui.dialogs.quick-bar.",
  "ui.components.section_tabs.",
  "ui.components.setting_info.",
  "ui.common.color_palette.",
  "ui.panel.config.core.section.core.general_help.",
  "ui.components.split_panels.",
  "ui.components.editor_save_bar.",
  "ui.components.starting_points.",
  "ui.components.collapsible-statistics.",
  "ui.components.draft_recovery.",
  "ui.notification_toast.more_waiting",
  "ui.instance_sync.",
  "ui.activity.",
  "ui.app_job.",
  "ui.panel.config.identity.",
  "ui.panel.profile.authenticator.",
  "ui.panel.lovelace.import_export.summary.",
  "ui.panel.page-onboarding.integration.skip",
  "ui.panel.page-onboarding.integration.status_needs_input",
  "ui.panel.page-onboarding.integration.status_failed",
  "ui.panel.page-onboarding.integration.set_up_item",
  "ui.panel.page-onboarding.integration.result_",
  "ui.panel.page-onboarding.integration.reason_",
  "ui.panel.page-onboarding.integration.live_summary",
  "ui.panel.config.google_setup.nest_progress",
  "ui.panel.config.google_setup.nest_privacy",
  "ui.panel.config.google_setup.nest_address",
  "ui.panel.config.google_setup.nest_step_",
  "ui.panel.config.google_setup.nest_project_",
  "ui.panel.config.google_setup.nest_client_",
  "ui.panel.config.guided_setup.save_close",
  "ui.panel.config.guided_setup.leave_text",
  "ui.panel.config.automation.editor.search.",
] as const;

export type Localize = (
  key: any,
  values?: Record<string, string | number>
) => string;

type Values = Record<string, string | number>;

/** Writes nested objects as dotted keys, the way translations are looked up. */
export const flattenStrings = (
  tree: unknown,
  prefix = "",
  into: Record<string, string> = {}
): Record<string, string> => {
  if (tree && typeof tree === "object") {
    for (const [name, value] of Object.entries(tree)) {
      const key = prefix ? `${prefix}.${name}` : name;
      if (typeof value === "string") {
        into[key] = value;
      } else {
        flattenStrings(value, key, into);
      }
    }
  }
  return into;
};

let yueStrings: Record<string, string> = flattenStrings(yueSource);

/** Replaces the Cantonese strings. Used by tests only. */
export const setYueStringsForTest = (strings: Record<string, string>) => {
  yueStrings = strings;
};

/** The Cantonese string for a key, or undefined when there is none. */
export const yueString = (key: string): string | undefined =>
  yueStrings[key] || undefined;

/** Every Cantonese key, for tests and tooling. */
export const yueKeys = (): string[] => Object.keys(yueStrings);

/**
 * Fills `{name}` placeholders. Cantonese strings are written without plural
 * or select rules, so nothing more is needed. An unknown placeholder is left
 * as written so a mistake is visible instead of silent.
 */
export const fillPlaceholders = (template: string, values?: Values): string =>
  template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    values && name in values ? String(values[name]) : whole
  );

export const BILINGUAL_SEPARATOR = " · ";

/** The chosen mode; English when the browser storage cannot be read. */
export const currentLanguageMode = (): LanguageMode => {
  try {
    return getPersonalPreferences().languageMode ?? "english";
  } catch (_err) {
    return "english";
  }
};

/**
 * Removes the closing full stops (`.` and `。`) so a sentence can sit inside
 * another. Dots inside the text, such as the one in "1.5", are kept.
 */
export const stripFullStops = (text: string): string =>
  text
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.。\s]+$/, "");

/** True when two texts differ only by closing full stops and spacing. */
export const sameIgnoringPunctuation = (a: string, b: string): boolean =>
  stripFullStops(a).replace(/\s/g, "") === stripFullStops(b).replace(/\s/g, "");

export interface ModeParts {
  english: string;
  cantonese?: string;
}

/** The two texts for a key, with the Cantonese one only when it exists. */
export const textParts = (
  localize: Localize,
  key: string,
  values?: Values
): ModeParts => {
  const english = localize(key, values);
  const raw = yueString(key);
  return {
    english,
    cantonese: raw === undefined ? undefined : fillPlaceholders(raw, values),
  };
};

/** Picks what to show for a mode from the two texts. */
export const joinForMode = (
  parts: ModeParts,
  mode: LanguageMode,
  separator = BILINGUAL_SEPARATOR
): string => {
  const { english, cantonese } = parts;
  if (cantonese === undefined || mode === "english") {
    return english;
  }
  if (mode === "cantonese") {
    return cantonese;
  }
  return sameIgnoringPunctuation(cantonese, english)
    ? english
    : `${english}${separator}${cantonese}`;
};

/** A string in the chosen language mode. */
export const modeText = (
  localize: Localize,
  key: string,
  values?: Values,
  mode: LanguageMode = currentLanguageMode(),
  separator = BILINGUAL_SEPARATOR
): string => joinForMode(textParts(localize, key, values), mode, separator);

/**
 * Wraps a localize function so every string it returns follows the language
 * mode. Components that only receive a localize function can use the result
 * in place of the original with no other change.
 */
export const withLanguageMode =
  (localize: Localize): Localize =>
  (key, values) =>
    modeText(localize, key, values);

/** True when a key belongs to a block the Cantonese source covers. */
export const hasCantoneseBlock = (key: string): boolean =>
  YUE_PREFIXES.some((prefix) => key.startsWith(prefix));
