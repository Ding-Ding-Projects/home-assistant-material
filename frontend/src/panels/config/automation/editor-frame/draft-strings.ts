import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.editor_drafts.";

/** Readable English used when a translation key has not been added yet. */
export const DRAFT_STRING_FALLBACK = {
  saving: "Saving draft",
  saved: "Draft saved {time}",
  not_saved: "Draft not saved",
  offer_title: "You have unsaved changes from {time}",
  offer_more: "{count} more imported items are waiting.",
  offer_live_changed:
    "This item changed after you started editing. Check the differences before you save.",
  continue: "Continue editing",
  see_changes: "See what changed",
  hide_changes: "Hide changes",
  discard: "Discard",
  no_changes: "No differences.",
  history: "Draft history",
  history_empty: "No autosaves yet.",
  history_hint:
    "Restoring puts that version in the editor. Nothing live changes until you press Save.",
  history_error: "The draft history could not be read or restored.",
  restore: "Restore",
  restored: "Draft restored. Press Save to keep it.",
  close: "Close",
  export_download: "Download as file",
  export_copy: "Copy to clipboard",
  export_copied: "Copied to clipboard",
  export_several: "Export selected",
  export_nothing: "Select at least one item to export.",
  private_title: "This file contains private details",
  private_body:
    "It appears to hold: {items}. Anyone who gets the file can read them.",
  export_anyway: "Export anyway",
  cancel: "Cancel",
  private_webhook: "webhook ids",
  private_secret: "fields named like passwords, tokens or API keys",
  private_location: "coordinates",
  import_title: "Import from YAML",
  import_hint:
    "Choose a file or paste YAML holding one item or a list. Blueprint files and whole configuration files are not supported. Nothing is saved or run until you open an item and press Save.",
  import_choose_file: "Choose a YAML file",
  import_paste_label: "Or paste YAML",
  import_check: "Check",
  import_open: "Open in editor",
  import_open_many: "Import {count} items as drafts",
  import_replace: "Replace the existing item",
  import_replace_hint: "Overwrites the saved item when you press Save.",
  import_new_id: "Its id is already used, so it is imported as a new item.",
  import_missing: "Not in this home: {items}",
  import_summary:
    "{triggers} triggers, {conditions} conditions, {actions} actions",
  import_refused_invalid_yaml: "That is not valid YAML: {detail}",
  import_refused_empty: "There is nothing to import.",
  import_refused_not_config:
    "That is not a valid {kind} configuration: {detail}",
  import_still_on:
    "Saved, but it is switched on. It could not be turned off automatically.",
  turn_off: "Turn off",
  import_scene_note:
    "The server does not check scenes. Only the entity ids and states in the file were checked here.",
  import_scene_entities_not_mapping:
    "The entities must be a mapping of entity id to state.",
  import_scene_bad_entity: "{entity} is not an entity id.",
  import_scene_bad_state: "The state of {entity} is not readable.",
  import_imported_many:
    "Imported {count} items as drafts. They stay off until you open each one, save and enable it.",
} as const;

export type DraftStringKey = keyof typeof DRAFT_STRING_FALLBACK;

const fill = (text: string, vars?: Record<string, string | number>): string =>
  vars
    ? text.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match
      )
    : text;

/** Localized text for a draft, export or import string. */
export const draftText = (
  hass: HomeAssistant,
  key: DraftStringKey,
  vars?: Record<string, string | number>
): string => {
  const localize = hass.localize as unknown as (
    key: string,
    vars?: Record<string, string | number>
  ) => string;
  return (
    localize(`${PREFIX}${key}`, vars) || fill(DRAFT_STRING_FALLBACK[key], vars)
  );
};
