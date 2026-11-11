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

The Cantonese copy covers this project's own surfaces only. Pages that upstream wrote have no
Cantonese text. A native review of the Cantonese copy is still to do (`../../ROADMAP.md`).

## Verification

Checked by unit tests only. Nothing here has been seen in a running build.
