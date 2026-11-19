# Cantonese on entity sheets, state words and stacked labels

Code: `frontend/src/common/language-mode/` (`entity-language-mode.ts`, `stacked-label.ts`,
`mode-format.ts`, `language-mode.ts`), `frontend/src/state/state-display-mixin.ts`,
`frontend/src/common/entity/compute_state_display.ts`,
`frontend/src/common/entity/compute_attribute_display.ts`,
`frontend/src/translations/yue-own.json`. Tests:
`frontend/test/common/language-mode/entity-language-mode.test.ts`,
`frontend/test/common/language-mode/stacked-label.test.ts`.

Three commits carry this work: `6e399887e` (Cantonese on entity sheets, Backups and the camera
timeline), `44d5a60e5` (both-language mode fits on a phone; Backups pages) and `6db767de3` (state
words, attribute names and weekdays follow the language mode). The language modes themselves are
described in [`language-modes.md`](language-modes.md).

## Which build has it

| Commit | In which build | State |
| --- | --- | --- |
| `6e399887e` | Build 2026.11.1.525 (built from `44d5a60e5`) | Published, being verified, not live |
| `44d5a60e5` | Build 2026.11.1.525 | Published, being verified, not live |
| `6db767de3` | None | On main, not built |
| `71824ce14`, `a3cb56d37` | None yet: a release for `a3cb56d37` was dispatched on 18 November | Being built and verified, not live |

The hosted instance runs build 2026.11.1.524, which has none of this. The release dispatched for
`a3cb56d37` will be the first build to carry `6db767de3` and the later commits.

## Later additions (`71824ce14`, `a3cb56d37`)

- `71824ce14`: words an integration supplies itself (a fan mode that says "Off") borrow the common
  Cantonese word when the English is exactly the same; groups, schedules, calendars and cameras
  gained Cantonese states.
- `a3cb56d37`: ten page captions gained Cantonese (backups, integrations, entities, devices,
  scenes, scripts, areas, helpers, automations, dashboards). The blueprint, energy, application
  credentials, roles and zone captions stay English, because the Cantonese file has no block for
  them. The same commit carries Cantonese on about 57 settings pages, with the tests
  `settings-pages-cantonese.test.ts` and `rich-values.test.ts`.

## Cantonese on entity sheets, Backups and the camera timeline (`6e399887e`)

In Cantonese mode an entity sheet used to answer in English for almost everything except its one
line of purpose. About 240 control labels now have Cantonese: lights, covers, locks, fans, climate,
media players, alarms, vacuums, timers, weather, the details table and the related list.

Relative times such as "5 minutes ago" follow the mode. They use the browser's own Hong Kong
Cantonese wording (the `zh-HK` language tag), so no time phrase is written by hand.

The camera timeline, the Backups overview and its dialogs, and a few lines on the Updates page
follow the mode as well.

## Both languages on a phone (`44d5a60e5`)

With English and Cantonese shown together, the four tabs at the foot of an entity sheet wrapped onto
two rows and took a third of the screen at 320 px. Each tab now stacks the English with the
Cantonese smaller beneath it (`renderStackedLabel` with `stackedLabelStyles`): one row, 44 px
targets, and a 61 px bar in every mode.

- Segmented buttons no longer split a word in half.
- The camera timeline's range chips read 1 h, 6 h and 24 h on one row.
- Rows in the related list reach 44 px.

The Backups pages get their Cantonese: the page title, "Set up backups", "Back up now", "My
backups", the backup types, and the Filters and More labels that every list page shares.

`6db767de3` extends the stacked labels to the fan speed buttons and the sensor range chips, which
still wrapped in both-language mode after `44d5a60e5`.

## State words and attribute names (`6db767de3`)

Words such as On, Off, Open, Closed, Home and Heating come from the server's translation bundle
for the one language chosen in the profile, so they were the last text on lists and tiles that
spoke only English.

### How it works

The functions that build `hass.formatEntityState`, `formatEntityAttributeName` and
`formatEntityAttributeValue` look the words up through a `localize` function, with keys such as
`component.<domain>.entity_component.<device class>.state.<state>`. Neither those functions nor
their callers changed. Instead, the `localize` function they receive is wrapped once
(`createEntityModeLocalize`, reached through `entityModeLocalize`). The wrapper answers the same
keys from the `yue_entity` block of `yue-own.json`, which mirrors the server keys one to one. The
order of lookup (integration key, device class, domain default) is unchanged because it stays in
the callers.

- **English:** exactly what the original lookup returns. English mode is unchanged.
- **Cantonese:** the Cantonese word, or the English word when the table has none.
- **Both:** English first, then the Cantonese word, or a single word when the two are equal.

The wrapper is never applied twice, so a format function that calls another one does not join the
words twice. The chosen mode is read from browser storage at most twice a second; a change of mode
clears the remembered value.

### The table

The `yue_entity` block holds 463 entries (counted from `yue-own.json` on 18 November 2026; the
commit says "about 460"): state words for 25 domains, the domain defaults and attribute names. A
test reads the server's own `strings.json` word lists for the listed domains and fails when:

- a server state word or attribute name has no Cantonese entry;
- a Cantonese entry has no server word behind it;
- an entry is English text, unless it is one of the abbreviations kept on purpose (GPS, HS, ID,
  RGB, RGBW, RGBWW, XY);
- a domain is neither covered nor listed as having no words. Two domains are listed: scenes and
  buttons, whose state is a date (the last time they were activated or pressed).

The test that reads the server word lists is skipped when the server sources are not present in
the checkout.

### Speed

Formatting 5,000 states took 2.3 ms in English and 3.2 ms in Cantonese (from the commit). A test
formats 5,000 states in each mode and fails when Cantonese or both modes cost more than four times
English plus 20 ms; the limit is loose on purpose, to catch an accidental storage read on every
call rather than noise. Another test checks that the wrapped lookup gives the same English text as
the unwrapped one for 200 entities.

### Weekdays

Weekday names in the weather sheet follow the mode: the usual name in English, the Hong Kong
Cantonese name in Cantonese and both modes (`mode-format.ts`).

## What stays English

- State words and attribute names the table does not have, including integration-specific text.
- Lookups that carry arguments, and lookups whose English text is missing (those must keep falling
  through to the next key).
- Numbers, units, dates and durations, which pass through unchanged.
- A handful of sentences whose blanks are filled with links or buttons (`6e399887e`).
- Pages written by the upstream project that this work does not reach.

## Verification

- `6e399887e`: not seen in a browser.
- `44d5a60e5`: seen in a browser at 390 and 320 px.
- `6db767de3`: written and unit-tested only; not seen in a browser.
- Build 525, which carries the first two commits, is published and being verified; no result is
  recorded yet.
- `71824ce14`: in English mode 1,474 texts on the dashboard, lists and sheets were compared with the
  published build in a browser, and none changed.
- Integration look of 18 November, on a local build of the tree (not a released build), 390 px,
  dark: English mode read the same as the 525 image on the dashboard, Entities, the light sheet and
  the climate sheet. In Cantonese and both modes, eight pages (dashboard, Entities, Devices,
  Automations, Integrations, Settings home, Logs, Release notes) and thirteen kinds of entity sheet
  showed no overflow, no cut text and no page errors, and state words showed in Cantonese and in
  both languages. Attribute names and weekdays were not recorded as seen; sorting and filtering
  Entities by state was not tried; no door sheet was opened.
- None of the Cantonese has been read by a native reader.
