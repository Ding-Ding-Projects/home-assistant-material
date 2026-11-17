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
  "ui.panel.config.backup.hosting.",
  "ui.panel.history.comparison.",
  "ui.panel.config.personal.",
  // Single strings, not whole blocks: the settings home banners and the apps page.
  "ui.panel.config.dashboard.",
  "ui.panel.config.updates.check_updates",
  // The strings of the Updates page itself, one block of keys at a time.
  "ui.panel.config.updates.caption",
  "ui.panel.config.updates.check_now",
  "ui.panel.config.updates.ready",
  "ui.panel.config.updates.all_current",
  "ui.panel.config.updates.auto_",
  "ui.panel.config.updates.backups_",
  "ui.panel.config.updates.before_updating",
  "ui.panel.config.updates.beta_",
  "ui.panel.config.updates.current",
  "ui.panel.config.updates.notes",
  "ui.panel.config.updates.show_",
  "ui.panel.config.updates.skipped",
  "ui.panel.config.updates.title_",
  "ui.panel.config.updates.up_to_date",
  "ui.panel.config.updates.update_in_progress",
  "ui.panel.config.updates.version_change",
  "ui.panel.config.updates.join_beta",
  "ui.panel.config.updates.leave_beta",
  "ui.panel.config.updates.build_data.",
  "ui.panel.config.updates.queue.",
  "ui.panel.config.updates.coming_soon.",
  "ui.panel.config.updates.compare.",
  "ui.panel.config.updates.usb.",
  "ui.panel.config.updates.build_notes.",
  "ui.panel.config.system_dashboard.restart_homeassistant",
  // The navigation rail, the panel names and the notification drawer.
  "ui.sidebar.",
  "panel.",
  "ui.notification_drawer.",
  // The common action buttons and words.
  "ui.common.",
  // The home page cards.
  "ui.panel.lovelace.cards.home_hero.",
  "ui.panel.lovelace.cards.home_greeting.",
  "ui.panel.lovelace.cards.lights_summary.",
  "ui.panel.lovelace.cards.security_locks.",
  "ui.panel.lovelace.cards.security_alarm.",
  "ui.panel.lovelace.cards.dashboards_list.",
  "ui.panel.lovelace.cards.room_lights.",
  "ui.panel.config.lovelace.resources.detail.",
  "ui.panel.config.apps.info.needs_os_title",
  "ui.panel.config.apps.info.no_store_text",
  "ui.panel.config.apps.info.compare_methods",
  "ui.panel.config.automation.editor.quick_add",
  "ui.panel.config.automation.editor.actions.type.event.event_data_template",
  "ui.dim_sum.",
  "ui.phone.",
  "ui.locks.",
  "ui.personal_wording.",
  "ui.drop_upload.",
  "ui.components.media-browser.file_management.",
  // The media picker's details and the media browser's own additions.
  "ui.components.selectors.media.details",
  "ui.components.selectors.media.copy_id",
  "ui.components.selectors.media.copy_type",
  "ui.components.media-browser.selection_mode",
  "ui.components.media-browser.playback_mode",
  "ui.components.media-browser.shortcuts.",
  "ui.components.media-browser.breadcrumbs",
  "ui.components.media-browser.location_level",
  "ui.components.media-browser.search.provider_scope",
  "ui.components.media-browser.filter.loaded_scope",
  "ui.personal_prefs.",
  "ui.page_tabs.",
  "ui.dialogs.quick-bar.",
  "ui.dialogs.two_key.",
  "ui.components.section_tabs.",
  "ui.components.setting_info.",
  "ui.common.color_palette.",
  "ui.panel.config.core.section.core.general_help.",
  "ui.components.split_panels.",
  "ui.components.editor_save_bar.",
  "ui.components.object-editor.",
  "ui.components.action-field-adapter.",
  "ui.components.string_builder.composition_heading",
  "ui.components.string_builder.insert_help",
  "ui.panel.config.tools.tabs.converter.error_image_timeout",
  "ui.components.starting_points.",
  "ui.components.collapsible-statistics.",
  "ui.components.draft_recovery.",
  "ui.notification_toast.more_waiting",
  "ui.instance_sync.",
  "ui.activity.",
  "ui.problems.",
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
  "ui.panel.config.guided_setup.no_entries",
  "ui.panel.config.guided_setup.can_set_up",
  "ui.panel.config.guided_setup.domain_level",
  "ui.panel.config.guided_setup.show_more",
  "ui.panel.profile.passkeys.",
  "ui.panel.profile.refresh_tokens.header",
  "ui.page_tools.footer.",
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

/** Gives one string of a sentence in the language being built. */
export type PartText = ((key: string, values?: Values) => string) & {
  /** True while the Cantonese sentence is being built. */
  cantonese: boolean;
};

/**
 * Builds a sentence that is put together from several strings. The sentence is
 * built once per language, each time from that language's own strings and
 * values, and the two sentences are then joined for the mode. Use it instead of
 * putting the result of one mode text inside another: that would carry the
 * other language into the sentence. A string without Cantonese is given in
 * English in the Cantonese sentence, and two identical sentences show once.
 */
export const composeForMode = (
  localize: Localize,
  build: (part: PartText) => string,
  mode: LanguageMode = currentLanguageMode(),
  separator = BILINGUAL_SEPARATOR
): string => {
  const english = build(
    Object.assign((key: string, values?: Values) => localize(key, values), {
      cantonese: false,
    })
  );
  if (mode === "english") {
    return english;
  }
  const cantonese = build(
    Object.assign(
      (key: string, values?: Values) => {
        const raw = yueString(key);
        return raw === undefined
          ? localize(key, values)
          : fillPlaceholders(raw, values);
      },
      { cantonese: true }
    )
  );
  return joinForMode({ english, cantonese }, mode, separator);
};

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
