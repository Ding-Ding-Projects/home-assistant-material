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
  "ui.components.empty-state.",
  "ui.components.top_bar_search.",
  "ui.components.action-editors.",
  "ui.components.automation-editors.",
  "ui.panel.config.updates.progress.",
  "ui.panel.config.updates.backup_choice.",
  "ui.panel.config.backup.overview.progress_detail.",
  "ui.panel.config.backup.overview.progress.heading.",
  "ui.panel.config.editor_drafts.",
  "ui.panel.config.automation.editor.triggers.type.time_pattern.mode",
  "ui.panel.config.automation.editor.triggers.type.time_pattern.value",
  "ui.panel.config.automation.editor.triggers.type.time_pattern.expression",
  "ui.panel.config.backup.hosting.",
  "ui.panel.config.backup.self_check.",
  "ui.panel.config.backup.pointers.",
  "ui.panel.config.backup.delete_proof.",
  "ui.panel.config.integrations.transfer.",
  // Page captions: the settings home tiles, page titles and tab labels.
  "ui.panel.config.backup.caption",
  "ui.panel.config.integrations.caption",
  "ui.panel.config.entities.caption",
  "ui.panel.config.devices.caption",
  "ui.panel.config.scene.caption",
  "ui.panel.config.script.caption",
  "ui.panel.config.blueprint.caption",
  "ui.panel.config.areas.caption",
  "ui.panel.config.helpers.caption",
  "ui.panel.config.automation.caption",
  "ui.panel.config.lovelace.caption",
  "ui.panel.history.comparison.",
  "ui.panel.config.personal.",
  "ui.panel.config.device_health.",
  "ui.panel.config.helpers.demo.",
  "ui.panel.config.cloud_host.",
  "ui.panel.config.tools.nav.",
  "ui.components.web-rtc-player.state.",
  "ui.components.camera_timeline.not_kept_by_choice",
  "ui.components.camera_timeline.on_this_system",
  "ui.components.camera_timeline.in_registry",
  "ui.panel.config.backup.agents.registry_",
  "ui.panel.config.camera_recording.",
  // The Linked tab of the media page.
  "ui.panel.media-browser.tabs.",
  "ui.panel.media-browser.linked.",
  "ui.panel.config.defenders.",
  // Single strings, not whole blocks: the settings home banners and the apps page.
  "ui.panel.config.dashboard.",
  "ui.panel.config.updates.check_updates",
  // The strings of the Updates page itself, one block of keys at a time.
  "ui.panel.config.updates.caption",
  "ui.panel.config.updates.check_now",
  "ui.panel.config.updates.whats_new",
  "ui.panel.config.updates.ready",
  "ui.panel.config.updates.all_current",
  "ui.panel.config.updates.auto_",
  "ui.panel.config.updates.backups_",
  "ui.panel.config.updates.before_updating",
  "ui.panel.config.updates.beta_",
  "ui.panel.config.updates.current",
  "ui.panel.config.updates.notes",
  "ui.panel.config.updates.show_",
  "ui.panel.config.updates.row_",
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
  "ui.panel.config.updates.history.",
  "ui.panel.config.updates.usb.",
  "ui.panel.config.updates.build_notes.",
  "ui.panel.config.system_dashboard.restart_homeassistant",
  "ui.panel.config.areas.room_wizard.",
  // The navigation rail, the panel names and the notification drawer.
  "ui.sidebar.",
  "panel.",
  "ui.notification_drawer.",
  // The common action buttons and words.
  "ui.common.",
  // The home page cards.
  "ui.panel.lovelace.cards.home_hero.",
  "ui.panel.lovelace.cards.home_greeting.",
  "ui.panel.lovelace.cards.away_digest.",
  "ui.panel.lovelace.cards.lights_summary.",
  "ui.panel.lovelace.cards.security_locks.",
  "ui.panel.lovelace.cards.security_alarm.",
  "ui.panel.lovelace.cards.dashboards_list.",
  "ui.panel.lovelace.cards.room_lights.",
  "ui.panel.config.lovelace.resources.detail.",
  "ui.panel.config.apps.info.needs_os_title",
  "ui.panel.config.apps.info.no_store_text",
  "ui.panel.config.apps.info.compare_methods",
  // The backup pages, the camera timeline and the general settings page: exact keys and
  // blocks this project added.
  "ui.components.camera_timeline.",
  "ui.panel.config.backup.backups.bulk.",
  "ui.panel.config.backup.dialogs.restore.refused",
  "ui.panel.config.backup.dialogs.onboarding.encryption.description",
  "ui.panel.config.backup.dialogs.onboarding.encryption.key_description",
  "ui.panel.config.backup.dialogs.generate.sync.needs_encryption_alert.",
  "ui.panel.config.backup.encryption_key.encrypt_backups",
  "ui.panel.config.backup.encryption_key.turn_off_",
  "ui.panel.config.backup.overview.hero_eyebrow",
  "ui.panel.config.backup.overview.header",
  "ui.panel.config.backup.overview.new_backup",
  "ui.panel.config.backup.overview.onboarding.",
  "ui.panel.config.backup.overview.backups.title",
  "ui.panel.config.backup.overview.backups.total_size",
  "ui.panel.config.backup.overview.backups.show_all",
  "ui.panel.config.backup.overview.backups.automatic",
  "ui.panel.config.backup.overview.backups.manual",
  "ui.panel.config.backup.overview.backups.app_update",
  "ui.panel.config.backup.backups.header",
  "ui.panel.config.backup.type.",
  "ui.components.subpage-data-table.filters",
  "ui.components.subpage-data-table.more",
  "ui.panel.config.backup.overview.latest.",
  "ui.panel.config.backup.overview.locations.empty",
  "ui.panel.config.backup.overview.settings_button",
  "ui.panel.config.backup.overview.summary.last_any_backup_description",
  "ui.panel.config.backup.overview.summary.more_information",
  "ui.replaced_dialogs.backup_download_failed",
  "ui.bulk.preview_hidden",
  "ui.update_progress.dismiss",
  "ui.panel.config.core.section.core.core_config.discard_button",
  "ui.panel.config.core.section.core.core_config.location_hint",
  "ui.panel.config.core.section.core.core_config.no_home_zone",
  "ui.panel.config.core.section.core.core_config.summary",
  "ui.panel.config.automation.editor.quick_add",
  "ui.panel.config.automation.editor.actions.type.event.event_data_template",
  "ui.dim_sum.",
  "ui.entity_sheet.",
  // The strings the entity sheets add to the dialog, kept to exact keys or
  // whole blocks this project owns so the rest of each upstream block stays English.
  "ui.components.camera_timeline.clip.",
  "ui.components.camera_timeline.record.",
  "ui.components.camera_timeline.back_10",
  "ui.components.camera_timeline.download",
  "ui.components.camera_timeline.forward_10",
  "ui.components.camera_timeline.not_recorded_here",
  "ui.components.camera_timeline.play_failed",
  "ui.components.camera_timeline.recorded",
  "ui.card.automation.",
  // The control labels and words the entity sheets show, one whole block each.
  "ui.dialogs.more_info_control.",
  "ui.card.alarm_control_panel.",
  "ui.card.button.",
  "ui.card.climate.",
  "ui.card.common.",
  "ui.card.counter.",
  "ui.card.cover.",
  "ui.card.fan.",
  "ui.card.humidifier.",
  "ui.card.lawn_mower.",
  "ui.card.light.",
  "ui.card.lock.",
  "ui.card.media_player.",
  "ui.card.scene.",
  "ui.card.script.",
  "ui.card.text.",
  "ui.card.timer.",
  "ui.card.vacuum.",
  "ui.card.valve.",
  "ui.card.water_heater.",
  "ui.card.weather.",
  "ui.components.climate-control.",
  "ui.components.siren.",
  "ui.components.related-items.",
  "ui.components.history_charts.",
  "ui.components.relative_time.never",
  "ui.dialogs.entity_registry.editor.entity_disabled",
  "ui.dialogs.entity_registry.editor.unavailable",
  "ui.dialogs.entity_registry.faq",
  "ui.dialogs.entity_registry.no_unique_id",
  "ui.dialogs.vacuum_segment_mapping.",
  "ui.panel.config.common.multiselect.failed",
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
  "ui.panel.config.tools.tabs.action_history.search",
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
  "ui.panel.config.automation.editor.frame.",
  "ui.panel.config.automation.editor.helper_panel.",
  "ui.panel.config.automation.editor.dry_run_replay.",
  "ui.panel.config.guided_setup.no_entries",
  "ui.panel.config.guided_setup.can_set_up",
  "ui.panel.config.guided_setup.domain_level",
  "ui.panel.config.guided_setup.show_more",
  "ui.panel.profile.passkeys.",
  "ui.panel.profile.refresh_tokens.header",
  "ui.page_tools.footer.",
  // The settings pages: the shared table, status screens and tips, then each
  // page's own blocks. Single keys where the rest of an upstream block is
  // shown elsewhere and stays English.
  "ui.components.data-table.",
  "ui.components.subpage-data-table.",
  "ui.status_screens.",
  "ui.tips.",
  "ui.init.",
  "ui.errors.supervisor.",
  "ui.errors.config.",
  "ui.notification_toast.",
  "ui.panel.config.generic.headers.",
  "ui.panel.config.tips.",
  "ui.panel.config.category.editor.",
  "ui.panel.config.automation.picker.",
  "ui.panel.config.script.picker.",
  "ui.panel.config.scene.picker.",
  "ui.panel.config.helpers.picker.",
  "ui.panel.config.helpers.types.",
  "ui.panel.config.devices.picker.",
  "ui.panel.config.devices.data_table.",
  "ui.panel.config.entities.picker.",
  "ui.panel.config.areas.picker.",
  "ui.panel.config.labels.",
  "ui.panel.config.integrations.filters",
  "ui.panel.config.integrations.filter_attention",
  "ui.panel.config.integrations.disabled",
  "ui.panel.config.integrations.ignore.ignored",
  "ui.panel.config.integrations.summary",
  "ui.panel.config.integrations.search",
  "ui.panel.config.integrations.discovered_label",
  "ui.panel.config.integrations.discovered_title",
  "ui.panel.config.integrations.discovered_review",
  "ui.panel.config.integrations.configured",
  "ui.panel.config.integrations.none_found",
  "ui.panel.config.integrations.none_found_detail",
  "ui.panel.config.integrations.add_integration",
  "ui.panel.config.integrations.none",
  "ui.panel.config.integrations.no_integrations",
  "ui.panel.config.integrations.no_disabled_integrations",
  "ui.panel.config.integrations.no_ignored_integrations",
  "ui.panel.config.integrations.confirm_new",
  "ui.panel.config.integrations.config_flow.supported_brand_flow",
  "ui.panel.config.integrations.config_flow.error",
  "ui.panel.config.integrations.config_flow.no_config_flow",
  "ui.panel.config.integrations.config_entry.",
  "ui.panel.config.google_setup.open_from_integrations",
  "ui.panel.config.lovelace.dashboards.dialog_new.",
  "ui.panel.config.updates.no_area",
  "ui.panel.config.logs.",
  "ui.panel.config.release_notes.",
  "ui.panel.config.notifications.",
  "ui.panel.config.lovelace.resources.confirm_delete",
  "ui.panel.config.lovelace.resources.types.",
  "ui.panel.config.extensions.",
  "ui.panel.config.tag.",
  "ui.panel.config.problem_log.",
  "ui.panel.config.ttc.",
  "ui.panel.lovelace.cards.ttc.",
  "ui.panel.lovelace.editor.card.ttc",
  "ui.panel.config.help_page.",
  "ui.panel.config.support.",
  "ui.panel.config.person.",
  "ui.panel.config.users.",
  "ui.panel.config.guided_setup.",
  "ui.panel.config.activity_record.",
  "ui.panel.config.dashboard_history.",
  "ui.panel.config.ollama.",
  "ui.panel.config.automation_history.",
  "ui.panel.config.apps.",
  // The entity state words and attribute names. These keys are not English
  // keys: they mirror the backend's `component.<domain>.entity_component`
  // lookup keys, see `entity-language-mode.ts`.
  "yue_entity.",
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

/**
 * True when a value is rich content, such as a link template, rather than
 * text. The translation system then returns a list of parts, not a string.
 */
const hasRichValue = (values?: Values): boolean =>
  !!values &&
  Object.values(values as Record<string, unknown>).some(
    (value) => typeof value === "object" && value !== null
  );

/**
 * Fills `{name}` placeholders into a list of parts, so a rich value stays the
 * object it is and is drawn as such. Text placeholders become text.
 */
export const fillPlaceholderParts = (
  template: string,
  values: Record<string, unknown>
): unknown[] =>
  template
    .split(/\{(\w+)\}/)
    .map((part, index) =>
      index % 2 === 0
        ? part
        : part in values
          ? typeof values[part] === "object" && values[part] !== null
            ? values[part]
            : String(values[part])
          : `{${part}}`
    )
    .filter((part) => part !== "");

/** A string in the chosen language mode. */
export const modeText = (
  localize: Localize,
  key: string,
  values?: Values,
  mode: LanguageMode = currentLanguageMode(),
  separator = BILINGUAL_SEPARATOR
): string => {
  if (!hasRichValue(values)) {
    return joinForMode(textParts(localize, key, values), mode, separator);
  }
  // With rich values the result is a list of parts that templates draw. The
  // Cantonese parts are built the same way, and both mode puts the two lists
  // one after the other.
  const english: unknown = localize(key, values);
  const raw = yueString(key);
  if (raw === undefined || mode === "english") {
    return english as string;
  }
  const cantonese = fillPlaceholderParts(
    raw,
    values as Record<string, unknown>
  );
  if (mode === "cantonese") {
    return cantonese as unknown as string;
  }
  return [
    ...(Array.isArray(english) ? english : [english]),
    separator,
    ...cantonese,
  ] as unknown as string;
};

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
