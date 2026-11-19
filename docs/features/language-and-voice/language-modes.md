# Language modes

Code: `frontend/src/common/language-mode/`, `frontend/src/common/playful/`,
`frontend/src/translations/yue-own.json`.

## What it does

Language mode chooses English, Cantonese or both for the text this project writes itself.
Both shows each label in the two languages. It reaches Personal settings, the tabs and the
search of everything, the phone bar, the locks and the wording card. Text written by the
upstream project stays in the language chosen in the profile.

Since `a3cb56d37` the page title, the tab labels and the breadcrumb of every tabbed settings page
follow the mode too (`frontend/src/layouts/hass-tabs-subpage.ts`, through the language mode
controller). Before, the tab row and the title stayed English in Cantonese and both-language modes
while the rest of the page changed. Switching the mode changes an open page without a reload.

Two playfulness levels (one per language) change real messages. A switch controls whether
dialogs that provide one show a fitting emoji (`frontend/src/dialogs/generic/dialog-box.ts`).

## Limits

The Cantonese copy covers this project's own surfaces, plus the parts of upstream pages listed in
[`entity-words-and-stacked-labels.md`](entity-words-and-stacked-labels.md): entity sheets, the
Backups pages, the camera timeline, relative times, entity state words, attribute names and
weekdays. Other pages that upstream wrote have no Cantonese text. A native review of the Cantonese
copy is still to do (`../../../ROADMAP.md`).

## Verification

The three modes were seen in published build 131 on 12 November 2026 at 1440, 390 and 320 px
(recorded in `../../../ROADMAP.md`). The later additions are verified only as stated in
[`entity-words-and-stacked-labels.md`](entity-words-and-stacked-labels.md).

The integration look of 18 November, on a local build of the tree (not a released build), saw the
tabbed page titles and tab labels follow the mode (for example "Entities · 實體" with both-language
tabs at 1440 px in light theme, and the Automations tabs at 390 px in dark theme), and a mode switch
made from a second tab change the open page without a reload. Still English in Cantonese and both
modes: the sidebar page names, the Backup Manager state "Idle", and the Automations top bar title at
390 px. The release for `a3cb56d37` was dispatched and is not yet verified.
