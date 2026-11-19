import { describe, expect, it } from "vitest";
import en from "../../../src/translations/en.json";
import {
  flattenStrings,
  hasCantoneseBlock,
  yueString,
} from "../../../src/common/language-mode/language-mode";

// A hand-written list of strings the settings pages show. The block check in
// language-mode.test.ts only looks inside listed blocks, so a page whose
// block was dropped from the list would pass it while going back to English.
const REQUIRED = [
  "ui.components.data-table.no-data",
  "ui.components.subpage-data-table.select_all",
  "ui.components.subpage-data-table.select_rule.title",
  "ui.status_screens.not_found_title",
  "ui.init.error.title",
  "ui.notification_toast.connection_lost",
  "ui.panel.config.integrations.search",
  "ui.panel.config.integrations.config_entry.state.loaded",
  "ui.panel.config.entities.picker.headers.entity",
  "ui.panel.config.devices.picker.summary",
  "ui.panel.config.devices.data_table.manufacturer",
  "ui.panel.config.automation.picker.add_automation",
  "ui.panel.config.script.picker.add_script",
  "ui.panel.config.scene.picker.add_scene",
  "ui.panel.config.helpers.picker.create_helper",
  "ui.panel.config.helpers.types.timer",
  "ui.panel.config.areas.picker.add_area",
  "ui.panel.config.labels.add_label",
  "ui.panel.config.logs.search",
  "ui.panel.config.release_notes.title",
  "ui.panel.config.notifications.search",
  "ui.panel.config.apps.installed.add_app",
  "ui.panel.config.apps.store.title",
  "ui.panel.config.apps.dashboard.start",
  "ui.panel.config.extensions.title",
  "ui.panel.config.tag.add_tag",
  "ui.panel.config.support.tickets_title",
  "ui.panel.config.problem_log.title",
  "ui.panel.config.help_page.title",
  "ui.panel.config.guided_setup.title",
  "ui.panel.config.activity_record.title",
  "ui.panel.config.automation_history.title",
  "ui.panel.config.dashboard_history.title",
  "ui.panel.config.ollama.models",
  "ui.panel.config.person.add_person",
  "ui.panel.config.users.picker.add_user",
];

describe("the settings pages in Cantonese", () => {
  const english = flattenStrings(en);

  it("has Cantonese for the strings each page shows", () => {
    REQUIRED.forEach((key) => {
      expect(english[key], key).toBeTypeOf("string");
      expect(yueString(key), key).toBeTypeOf("string");
      expect(hasCantoneseBlock(key), key).toBe(true);
    });
  });
});
