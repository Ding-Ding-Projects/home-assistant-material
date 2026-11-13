import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  exclusionReasonFor,
  isSyncedKey,
  syncedRuleFor,
} from "../../../src/common/instance-sync/settings-registry";

// The registry decides which browser keys leave this browser. A key that is
// not named is private by default, so these protect two things: every key a
// person's setting or saved content lives in is synced (and listed here by
// hand, because a rule can only catch what is written wrongly, never what was
// forgotten), and nothing that could let one account read another's data or
// act as a sign-in ever is.

const MUST_SYNC = [
  "elementLocks",
  "supportTickets",
  "supportTicketExtras",
  "typeScale",
  "lockKeypadShuffle",
  "personalPreferences",
  "preferenceSchedules",
  "momentumLastPage",
  "pageTabsClosed",
  "pageTabsOrder",
  "pageTabsPinned",
  "pageTabsSeen",
  "pageTabsGroups",
  "pageTabsDestinations",
  "pageTabsEdge",
  "pageTabsAppearance",
  "pageTabsGroupAppearance",
  "sectionTabs",
  "localHistory",
  "regexLibrary",
  "ha-material-identity",
  "ha-dismissed-notifications",
  "ha-material-release-notes-seen",
  "ha-split-panels:ollama-models",
  "list-layout:/config/automation",
  "list-layout:/config/automation:summary",
  "guided-setup-draft:zha:settings",
  "google_setup_draft",
  "energy-default-period-energy_dashboard",
  "automation-table-collapsed",
  "devices-table-column-order",
  "entities-table-hidden-columns",
  "marketplace-dashboard-table-columns-ordering",
  "automation-table-sort",
  "marketplace-dashboard-table-sorting",
  "automation-table-grouping",
  "panel-dev-template-template",
  "devToolsShowAttributes",
  "application-credentials-table-column-order",
  "assist_debug_language",
  "TtsMessage",
  "AssistPipelineId",
  "automation-recent-targets",
  "deSelectedCalendars",
  "historyPickedValue",
  "energy-devices-hidden-stats",
  "mediaBrowserPreferredLayout",
  "selectedTodoEntity",
];

const MUST_STAY = [
  "hassTokens",
  "authToken",
  "instanceSync.owner",
  "instanceSync.settingsTimes",
  "instanceSync.appearance",
  "elementAppearance",
  "readingOptions",
  "accessibilityTools",
  "personalVocabulary",
  "selectedTheme",
  "selectedLanguage",
  "dockedSidebar",
  "vibrate",
  "ha-version",
  "sharedPreferenceDefaultsCache",
  "devTrace",
  "automation-table-search",
  "debugSafeArea",
  "panel-dev-mqtt-topic-ls",
  "panel-dev-action-state-yaml-mode",
  "tools-debug-console-history-abc123",
  "tools-debug-console-allow-pasting-abc123",
  "my-api-key",
  "some_password_note",
  "client-secret",
  "unknown-new-key",
];

describe("settings registry", () => {
  it("syncs every setting and saved content listed by hand", () => {
    for (const key of MUST_SYNC) {
      expect(isSyncedKey(key), key).toBe(true);
    }
  });

  it("keeps tokens, bookkeeping, other syncs' keys and unknown keys in the browser", () => {
    for (const key of MUST_STAY) {
      expect(isSyncedKey(key), key).toBe(false);
    }
  });

  it("never lets a key be both synced and excluded", () => {
    // `elementAppearance` is named by no synced rule; a key that matched a
    // synced prefix and an exclusion is refused because exclusions win.
    expect(syncedRuleFor("energy-default-period-token")).toBeUndefined();
    expect(exclusionReasonFor("hassTokens")).toBeTruthy();
    expect(exclusionReasonFor("automation-table-search")).toBeTruthy();
  });

  it("refuses hostile key names", () => {
    for (const key of [
      "__proto__",
      "constructor",
      "toString",
      "",
      "elementLocks ",
      "elementLocks\n",
      `ha-split-panels:${"a".repeat(300)}`,
      "list-layout:<script>",
    ]) {
      expect(isSyncedKey(key), JSON.stringify(key)).toBe(false);
    }
  });

  it("classifies every key a component stores with the storage decorator", () => {
    const keys = new Set<string>();
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(file);
        } else if (file.endsWith(".ts")) {
          const text = fs.readFileSync(file, "utf8");
          for (const match of text.matchAll(/@storage\(\{([\s\S]*?)\}\)/g)) {
            const body = match[1];
            if (/storage:\s*"sessionStorage"/.test(body)) {
              continue;
            }
            const key = /key:\s*"([^"]+)"/.exec(body)?.[1];
            if (key) {
              keys.add(key);
            }
          }
        }
      }
    };
    walk(path.resolve(__dirname, "../../../src"));
    expect(keys.size).toBeGreaterThan(40);
    const unclassified = [...keys].filter(
      (key) => !isSyncedKey(key) && exclusionReasonFor(key) === undefined
    );
    expect(unclassified).toEqual([]);
    // It reads every source file, which takes longer than the default limit
    // when the whole suite runs at once.
  }, 60000);
});
