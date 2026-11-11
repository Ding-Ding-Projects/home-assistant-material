# Settings saved on the instance

Every personal setting and every piece of saved content that this interface
used to keep only in the browser is saved on the instance for the signed-in
account, and loaded again on every device. The browser copy stays as a fast
cache that every feature reads as before.

Three values are saved this way, each as frontend user data of the account:

| User-data key | What it holds | Code |
| --- | --- | --- |
| `appearance` | Element appearance, reading options, accessibility tools | `frontend/src/common/appearance/appearance-sync.ts` |
| `personal_wording` | The private vocabulary file | `frontend/src/common/vocabulary/wording-sync.ts` |
| `settings_bundle` | Every other setting and saved content in the table below | `frontend/src/common/instance-sync/settings-bundle.ts` |

All three use the same machinery (`user-data-sync.ts`): the newer copy wins
(a tie goes to the instance), a value that exists only in the browser is
uploaded and never dropped, an invalid instance copy is replaced, a value above
768 KiB is refused, and the owner check (`sync-owner.ts`) clears the cache when
a different account signs in on the same browser.

## How the settings bundle works

- **One generic layer, keyed by storage key.** `settings-registry.ts` lists the
  keys and key patterns (exact, prefix or suffix) that are synced. A key that no
  rule names stays in the browser, so a new key is private until it is added.
- **Per key.** The bundle holds one entry per key: the stored text exactly as the
  browser holds it, and the time it last changed here. Merging is per key, so a
  key that only one side holds is kept. A key the person removed leaves a
  removal notice for 30 days so the removal reaches other devices and an old
  copy cannot bring the value back.
- **Local changes** are found by comparing the registered keys with what this tab
  last saw, on the `storage` event, when the page is hidden or left, and every
  two seconds. That catches writes that raise no event (such as assigning a
  property on `localStorage`). A value written by another tab, or put in place
  from the instance, is never taken for a change made here. Changes are sent
  after a short delay (800 ms), once.
- **Incoming values** are checked first: the key must match a rule, the entry must
  have the expected shape and a sane time, the text must be at most 400,000
  characters and, for JSON keys, valid JSON. Names such as `__proto__` never
  match. Then each key is written to browser storage and a `storage` event is
  dispatched, which the storage decorator and the features that already listen
  for another tab's change (appearance, identity, the page tabs, the lock
  store and others) use to show the new value without a reload. Features that
  read a key only when they open (the tool drafts, table layouts) show it the
  next time they open.
- **Size.** If the whole bundle would be larger than the limit, the largest
  optional (bulky) keys stay only in this browser, then the largest of the rest,
  and the personal settings page says which. Removal notices are never dropped.
  Nothing is removed from the browser.
- **Failure.** A failed save shows "Could not save: only in this browser" with a
  retry. No value or error text is kept, logged or put in a status.
- **Another account.** If a different account signs in, every mirrored key and
  the bundle's ages are cleared before anything reads or uploads them. Sign-in
  tokens are untouched.

## Locks

Locks (`elementLocks`), the lock keypad option and the support desk tickets are
synced. The lock records hold salted PIN check data, wrong-try counters and, for
authenticator locks, the authenticator (one-time code) secret. They are the
account's own data and, as the product has always said, a lock is a speed bump
and not security. They are never logged, never listed in history and never
included in exports.

Two things follow from saving them with the account:

- The one-time code secret is saved on the instance with the account and
  reaches every device that signs in as that account. The lock wizard says so
  at the step that shows the secret. It cannot be kept out of the saved copy
  without breaking the lock on other devices.
- The PIN check data (a salted hash) is saved with the account, so a short PIN
  can be guessed by anyone who can read the instance's files.

Values read back are clamped: a stored wait time is never believed beyond the
longest wait the code sets (5 minutes), and a stored lock that asks for more
than 1,000,000 hashing rounds (or fewer than 1,000) is refused.

### The way back from a lock

Clearing a browser's stored data no longer removes a lock, because the lock is
saved on the instance and returns the next time the account signs in. The way
out needs file access to the instance (the File editor add-on or SSH) and is
done by its owner:

1. Stop Home Assistant. It keeps the file in memory and rewrites it, so an edit
   made while it runs is lost.
2. Open `.storage/frontend.user_data_<user id>` in the configuration folder.
   The underscore after `user_data` is part of the name; the user id is the
   account's id.
3. In `data` > `settings_bundle` > `data`, replace the `elementLocks` entry with
   a removal notice, typing exactly this form, where the number is the current
   time in milliseconds plus 60000 (for example `1700000060000`):

   ```json
   "elementLocks": {"v": null, "t": 1700000060000}
   ```

4. Save the file and start Home Assistant again.

Every device that syncs then adopts the removal and drops the lock, so no
browser has to be cleared. If a browser still shows the lock, clear this
site's stored data in it. Deleting the entry instead of replacing it is not
enough while any browser still holds the lock: that browser uploads it again.
`settings-bundle.test.ts` checks that a bundle carrying this notice removes the
lock on a device that still holds it and that the device does not upload it
back.

## Inventory

Synced (56 rules; some cover many keys, for example every table):

| Key or pattern | What it holds | Synced |
| --- | --- | --- |
| `personalPreferences` | Language mode, funny levels, sound, narrator, attention modes, School mode | Yes |
| `preferenceSchedules` | Rules that change a preference by the clock | Yes |
| `momentumLastPage` | Page remembered by the momentum mode | Yes |
| `lockKeypadShuffle` | Lock keypad shuffles digits | Yes |
| `elementLocks` | Every lock, PIN check data, counters | Yes |
| `supportTickets` | Support desk tickets | Yes |
| `pageTabsClosed`, `pageTabsOrder`, `pageTabsPinned` | Closed, ordered and pinned tabs | Yes |
| `localHistory` | Journal of appearance, accessibility and tab changes | Yes, bulky |
| `regexLibrary` | Saved regular expression patterns | Yes |
| `ha-material-identity` | App name and logo this person chose | Yes, bulky |
| `ha-dismissed-notifications` | Dismissed notifications | Yes |
| `ha-material-release-notes-seen` | Release notes already seen | Yes |
| `ha-split-panels:*` | Split pane sizes | Yes |
| `list-layout:*` | Filter pane size and summary of each list page | Yes |
| `guided-setup-draft:*`, `google_setup_draft` | Setup drafts (never passwords or keys) | Yes |
| `energy-default-period-*` | Default period of an energy dashboard | Yes |
| `*-table-collapsed`, `*-table-column-order`, `*-table-hidden-columns`, `*-table-columns-ordering`, `*-table-sort`, `*-table-sorting`, `*-table-grouping` | Table layout of each list | Yes |
| `panel-dev-template-template`, `panel-dev-template-split-position`, `panel-dev-template-split-orientation` | Template tool draft and layout | Yes |
| `automation-trace-left-view`, `automation-trace-split-position`, `script-trace-split-position` | Trace page layout | Yes |
| `devToolsShow*`, `assist_debug_language` | Developer tool last choices | Yes |
| `TtsMessage`, `ttsTryMessages`, `cloudTtsTryMessage`, `cloudTtsTryTarget`, `AssistPipelineId` | Voice tool drafts and picks | Yes |
| `automation-recent-targets`, `automation-recent-elements`, `automation-sidebar-width` | Automation editor memory | Yes |
| `deSelectedCalendars`, `historyPickedValue`, `historySourceFilters`, `logbookPickedValue`, `logbookSourceFilters`, `energy-devices-*`, `dashboardSectionPreviewMode`, `mediaBrowserPreferredLayout`, `mediaBrowseEntityId`, `selectedTodoEntity` | Page choices | Yes |

Not synced in the bundle (27 rules), with the reason:

| Key or pattern | Reason |
| --- | --- |
| `hassTokens`, anything containing `token` | Sign-in credentials. They never leave this browser. |
| `instanceSync.*` | The sync's own bookkeeping (owner, ages). |
| `elementAppearance`, `readingOptions`, `accessibilityTools` | Already saved by the `appearance` sync. |
| `personalVocabulary` | Already saved by the `personal_wording` sync. |
| `selectedTheme` | Already saved on the instance as the account's theme. |
| `selectedLanguage` | Language choice of this browser; the account's language is already on the instance. |
| `dockedSidebar`, `vibrate`, `enableShortcuts`, `suspendWhenHidden`, `debugConnection` | Depend on this device or browser. |
| `disableViewTransition`, `debugSafeAreaTool`, `debugSafeArea` | Debug choices about this browser's rendering and screen. |
| `defaultPanel`, `sidebarPanelOrder`, `sidebarHiddenPanels` | Old keys; these choices are already saved on the instance. |
| `preferenceDefaults` | Shared defaults belong to the instance, not to one account. |
| `sharedPreferenceDefaultsCache`, `ha-version`, `ha-material-identity-launch` | Caches that are rebuilt. |
| `devTrace` | One-time hand-off between two pages, can be very large. |
| `onboarding-restore-*` | State of a restore before anyone has signed in. |
| `*-table-search` | A search typed in a table, kept for the tab session. |
| `tools-debug-console-*`, `panel-dev-action-state-*`, `panel-dev-mqtt-*` | Can hold keys or credentials typed by the person. |
| Any key named like a secret, password, API key or credential (`credential` followed by `s-table` is allowed, for table layouts) | Never synced, whatever it holds. |
| Every `sessionStorage` key | Per tab by design. |

`frontend/test/common/instance-sync/settings-registry.test.ts` checks that every
key stored with the storage decorator is classified and that the two hand-written
lists above (must sync, must stay) hold.

## Several devices and builds

- Every device that uses an account should run the same build. A build from
  before the entity condition of schedule rules existed ignores the condition,
  so an older tab or phone reads such a rule as a plain clock rule, and when it
  saves `preferenceSchedules` (a synced key) it writes the list back without
  the condition, for every device. Reload old tabs after an update.
- Each save replaces the whole bundle. A key changed on two devices at once ends
  with the newer one; `elementLocks` is one key, so two locks added offline on
  two devices end up as one set.
- A save that needs a lock or tabs to be loaded from the instance is checked
  against the account first: if another account signs in on the same browser,
  the tab that is still open for the first account stops and sends nothing.

## Not covered

- Translations in `yue-own.json` for the sentences that used to say a setting was
  kept only in this browser are separate and need the same correction.
- A key written by a newer version of the interface that this version does not
  know is ignored, and is not sent back.
