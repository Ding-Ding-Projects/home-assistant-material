# Language modes

Code: `frontend/src/common/language-mode/`, `frontend/src/common/playful/`,
`frontend/src/translations/yue-own.json`.

## What it does

Language mode chooses English, Cantonese or both for the text this project writes itself.
Both shows each label in the two languages. It reaches Personal settings, the tabs and the
search of everything, the phone bar, the locks and the wording card. Text written by the
upstream project stays in the language chosen in the profile.

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
