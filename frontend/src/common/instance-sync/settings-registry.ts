/**
 * Which browser-storage keys are a person's own settings or saved content,
 * and so are saved on the instance for their account (the "settings bundle"),
 * and which are never sent anywhere.
 *
 * A key is synced only if a rule below names it. Everything else stays in the
 * browser, so a new key is private until someone decides otherwise. The
 * documented inventory is in `docs/features/instance-sync/README.md`; a test
 * checks that every key this project's source writes is classified here.
 */

export interface SyncedKeyRule {
  /** The whole key. */
  exact?: string;
  /** Every key that starts with this text. */
  prefix?: string;
  /** Every key that ends with this text. */
  suffix?: string;
  /**
   * "json": the stored text must be valid JSON. "text": any text, for the few
   * keys that hold a plain string written without JSON.
   */
  kind: "json" | "text";
  /** Dropped first when the bundle is too large for the instance. */
  bulky?: boolean;
  /** What the key holds. */
  holds: string;
}

export interface ExcludedKeyRule {
  exact?: string;
  prefix?: string;
  suffix?: string;
  pattern?: RegExp;
  reason: string;
}

/** Longest value kept for one key, in characters. */
export const SETTING_VALUE_MAX_CHARS = 400000;

/** Longest key name accepted from the instance. */
export const SETTING_KEY_MAX_CHARS = 200;

const SAFE_KEY = /^[A-Za-z0-9_.:/-]+$/;

export const SYNCED_KEY_RULES: SyncedKeyRule[] = [
  // Personal choices
  {
    exact: "personalPreferences",
    kind: "json",
    holds:
      "Personal preferences: language mode, funny levels, sound, narrator, attention modes, School mode",
  },
  {
    exact: "preferenceSchedules",
    kind: "json",
    holds: "Rules that change a preference by the clock",
  },
  {
    exact: "momentumLastPage",
    kind: "json",
    holds: "The page remembered by the momentum mode",
  },
  {
    exact: "lockKeypadShuffle",
    kind: "json",
    holds: "Whether the lock keypad shuffles its digits",
  },
  // Locks and the support desk
  {
    exact: "elementLocks",
    kind: "json",
    holds: "Every lock, with its PIN check data and wrong-try counters",
  },
  {
    exact: "supportTickets",
    kind: "json",
    holds: "Support desk tickets",
  },
  // Tabs, history, saved content
  { exact: "pageTabsClosed", kind: "json", holds: "Closed tabs" },
  { exact: "pageTabsOrder", kind: "json", holds: "Tab order" },
  { exact: "pageTabsPinned", kind: "json", holds: "Pinned tabs" },
  {
    exact: "localHistory",
    kind: "json",
    bulky: true,
    holds: "The journal of changes made to appearance, accessibility and tabs",
  },
  {
    exact: "regexLibrary",
    kind: "json",
    holds: "Saved regular expression patterns",
  },
  {
    exact: "ha-material-identity",
    kind: "json",
    bulky: true,
    holds: "App name and logo chosen by this person",
  },
  {
    exact: "ha-dismissed-notifications",
    kind: "json",
    holds: "Dismissed notifications",
  },
  {
    exact: "ha-material-release-notes-seen",
    kind: "json",
    holds: "Which release notes were already seen",
  },
  {
    prefix: "ha-split-panels:",
    kind: "json",
    holds: "Sizes of split panes, one key per pane",
  },
  {
    prefix: "list-layout:",
    kind: "json",
    holds: "Filter pane size and summary visibility of each list page",
  },
  {
    prefix: "guided-setup-draft:",
    kind: "json",
    holds: "Guided setup drafts (never passwords or keys)",
  },
  { exact: "google_setup_draft", kind: "json", holds: "Google setup draft" },
  {
    prefix: "energy-default-period-",
    kind: "text",
    holds: "Default period of an energy dashboard",
  },
  // Lists and tables
  { suffix: "-table-collapsed", kind: "json", holds: "Collapsed table groups" },
  { suffix: "-table-column-order", kind: "json", holds: "Table column order" },
  {
    suffix: "-table-hidden-columns",
    kind: "json",
    holds: "Hidden table columns",
  },
  {
    suffix: "-table-columns-ordering",
    kind: "json",
    holds: "Table column order",
  },
  { suffix: "-table-sort", kind: "json", holds: "Table sorting" },
  { suffix: "-table-sorting", kind: "json", holds: "Table sorting" },
  { suffix: "-table-grouping", kind: "json", holds: "Table grouping" },
  // Tool drafts and last choices
  {
    exact: "panel-dev-template-template",
    kind: "text",
    holds: "Template tool draft",
  },
  {
    exact: "panel-dev-template-split-position",
    kind: "text",
    holds: "Template tool split position",
  },
  {
    exact: "panel-dev-template-split-orientation",
    kind: "text",
    holds: "Template tool split orientation",
  },
  {
    exact: "automation-trace-left-view",
    kind: "text",
    holds: "Automation trace: left view",
  },
  {
    exact: "automation-trace-split-position",
    kind: "text",
    holds: "Automation trace: split position",
  },
  {
    exact: "script-trace-split-position",
    kind: "text",
    holds: "Script trace: split position",
  },
  {
    prefix: "devToolsShow",
    kind: "json",
    holds: "States tool: which columns are shown",
  },
  {
    exact: "assist_debug_language",
    kind: "json",
    holds: "Assist tool language",
  },
  { exact: "TtsMessage", kind: "json", holds: "Last text-to-speech message" },
  {
    exact: "ttsTryMessages",
    kind: "json",
    holds: "Text-to-speech try messages",
  },
  { exact: "cloudTtsTryMessage", kind: "json", holds: "Cloud TTS try message" },
  { exact: "cloudTtsTryTarget", kind: "json", holds: "Cloud TTS try target" },
  {
    exact: "AssistPipelineId",
    kind: "json",
    holds: "The Assist pipeline last picked",
  },
  {
    exact: "automation-recent-targets",
    kind: "json",
    holds: "Recently used automation targets",
  },
  {
    exact: "automation-recent-elements",
    kind: "json",
    holds: "Recently used automation elements",
  },
  {
    exact: "automation-sidebar-width",
    kind: "json",
    holds: "Automation editor sidebar width",
  },
  // Page choices
  {
    exact: "deSelectedCalendars",
    kind: "json",
    holds: "Calendars switched off",
  },
  {
    exact: "historyPickedValue",
    kind: "json",
    holds: "History page: picked targets",
  },
  {
    exact: "historySourceFilters",
    kind: "json",
    holds: "History page: source filters",
  },
  {
    exact: "logbookPickedValue",
    kind: "json",
    holds: "Logbook page: picked targets",
  },
  {
    exact: "logbookSourceFilters",
    kind: "json",
    holds: "Logbook page: source filters",
  },
  {
    prefix: "energy-devices-",
    kind: "json",
    holds: "Energy device cards: hidden items and chart type",
  },
  {
    exact: "dashboardSectionPreviewMode",
    kind: "json",
    holds: "Dashboard section preview mode",
  },
  {
    exact: "mediaBrowserPreferredLayout",
    kind: "json",
    holds: "Media browser layout",
  },
  {
    exact: "mediaBrowseEntityId",
    kind: "json",
    holds: "Media browser player picked",
  },
  { exact: "selectedTodoEntity", kind: "json", holds: "To-do list picked" },
];

export const EXCLUDED_KEY_RULES: ExcludedKeyRule[] = [
  {
    exact: "hassTokens",
    reason: "Sign-in tokens. They never leave this browser.",
  },
  {
    pattern: /token/i,
    reason: "Anything named like a token is a credential and is never synced.",
  },
  {
    pattern: /secret|password|passwd|api[-_]?key|credential(?!s-table)/i,
    reason:
      "Anything named like a secret, password or key is never synced. Table layouts of a credentials list are not secrets.",
  },
  {
    prefix: "tools-debug-console-",
    reason:
      "Console commands and choices can hold values typed by the person, such as keys, and pasting protection is a safeguard of this browser.",
  },
  {
    prefix: "panel-dev-action-state-",
    reason: "The last action data can carry keys passed to services.",
  },
  {
    prefix: "panel-dev-mqtt-",
    reason: "Topics and payloads can carry credentials typed by the person.",
  },
  {
    prefix: "instanceSync.",
    reason: "The sync's own bookkeeping (owner, ages).",
  },
  {
    exact: "elementAppearance",
    reason: "Already saved on the instance by the appearance sync.",
  },
  {
    exact: "readingOptions",
    reason: "Already saved on the instance by the appearance sync.",
  },
  {
    exact: "accessibilityTools",
    reason: "Already saved on the instance by the appearance sync.",
  },
  {
    exact: "personalVocabulary",
    reason: "Already saved on the instance by the personal wording sync.",
  },
  {
    exact: "selectedTheme",
    reason: "Already saved on the instance as the account's theme.",
  },
  {
    exact: "selectedLanguage",
    reason:
      "A language choice for this browser. The account's language is already on the instance.",
  },
  {
    exact: "dockedSidebar",
    reason: "Depends on this device's screen.",
  },
  { exact: "vibrate", reason: "Depends on this device's hardware." },
  {
    exact: "disableViewTransition",
    reason: "A debug choice about this browser's rendering speed.",
  },
  {
    exact: "debugSafeAreaTool",
    reason: "A debug tool that simulates this device's screen.",
  },
  {
    exact: "debugSafeArea",
    reason: "The simulated screen sizes of this device.",
  },
  { exact: "debugConnection", reason: "A per-browser diagnostic switch." },
  {
    exact: "suspendWhenHidden",
    reason: "Power behaviour of this browser tab.",
  },
  { exact: "enableShortcuts", reason: "Depends on this device's keyboard." },
  {
    exact: "defaultPanel",
    reason: "Old key. The default panel is already saved on the instance.",
  },
  {
    exact: "sidebarPanelOrder",
    reason: "Old key. Sidebar order is already saved on the instance.",
  },
  {
    exact: "sidebarHiddenPanels",
    reason: "Old key. Sidebar choices are already saved on the instance.",
  },
  {
    exact: "preferenceDefaults",
    reason: "Shared defaults belong to the instance, not to the account.",
  },
  {
    exact: "sharedPreferenceDefaultsCache",
    reason: "A cache of what the instance shares. It is rebuilt.",
  },
  { exact: "ha-version", reason: "A cache used to detect a stale build." },
  {
    exact: "ha-material-identity-launch",
    reason: "Derived from the name in effect. It is rebuilt.",
  },
  { exact: "devTrace", reason: "A one-time hand-off between two pages." },
  {
    prefix: "onboarding-restore-",
    reason: "State of a restore before anyone has signed in.",
  },
  {
    suffix: "-table-search",
    reason: "A search typed in a table. Kept for the tab session only.",
  },
];

const matches = (
  rule: { exact?: string; prefix?: string; suffix?: string },
  key: string
): boolean =>
  (rule.exact !== undefined && key === rule.exact) ||
  (rule.prefix !== undefined && key.startsWith(rule.prefix)) ||
  (rule.suffix !== undefined && key.endsWith(rule.suffix));

/** The rule that makes a key synced, or undefined if it is not synced. */
export const syncedRuleFor = (key: string): SyncedKeyRule | undefined => {
  if (
    typeof key !== "string" ||
    key.length === 0 ||
    key.length > SETTING_KEY_MAX_CHARS ||
    !SAFE_KEY.test(key)
  ) {
    return undefined;
  }
  // Exclusions always win, so a key can never be both.
  if (
    EXCLUDED_KEY_RULES.some(
      (rule) => matches(rule, key) || rule.pattern?.test(key)
    )
  ) {
    return undefined;
  }
  return SYNCED_KEY_RULES.find((rule) => matches(rule, key));
};

export const isSyncedKey = (key: string): boolean =>
  syncedRuleFor(key) !== undefined;

/** The reason a key is not synced, when a rule says so. */
export const exclusionReasonFor = (key: string): string | undefined =>
  EXCLUDED_KEY_RULES.find(
    (rule) => matches(rule, key) || rule.pattern?.test(key)
  )?.reason;
