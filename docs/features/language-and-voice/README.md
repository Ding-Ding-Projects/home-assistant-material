# Language and voice

| File | Feature | State (current state: `../../../ROADMAP.md`) |
| --- | --- | --- |
| [`language-modes.md`](language-modes.md) | Language mode, Cantonese copy, playfulness, dialog emoji switch | The three modes seen in published build 131; playfulness and the emoji switch not yet seen |
| [`entity-words-and-stacked-labels.md`](entity-words-and-stacked-labels.md) | Cantonese on entity sheets, Backups and the camera timeline; state words, attribute names and weekdays following the mode; stacked labels in both-language mode | Partly in build 525 (being verified); state words on main, not built |
| [`narrator-and-read-aloud.md`](narrator-and-read-aloud.md) | Spoken narrator, read aloud, action sounds | Built, not yet seen in a running build |
| [`school-and-attention-modes.md`](school-and-attention-modes.md) | School mode, one thing at a time, attention modes | Built, not yet seen in a running build |

| [`schedules-and-shared-defaults.md`](schedules-and-shared-defaults.md) | Time rules for personal settings, defaults an administrator sets for everyone | Partly built (not seen) |
| [`dim-sum-surprise.md`](dim-sum-surprise.md) | A dim sum dish that sometimes drops by at start, always on, from the public photo catalogue | Built and seen in a development build (draw forced) |
| [`saved-on-the-instance.md`](saved-on-the-instance.md) | Appearance and personal wording saved on the instance for the signed-in account | Built, not yet seen in a running build |

All of these are choices on Settings, Personal settings (`frontend/src/panels/config/personal/`),
kept in this browser by `frontend/src/common/preferences/`; appearance and personal wording are
also saved on the instance.
