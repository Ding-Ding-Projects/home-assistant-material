# Design handoff: polish pass

Written 10 November 2026 for the design tool that does the next pass. It lists what was built
in code today without a board to match, what an audit found, and what each surface needs from
design. The design tool commits its own work to this repository after reading this; the code
side then builds from those files.

## Who owns what

| Area | Owner | Rule |
| --- | --- | --- |
| `design/` (boards, `canvas.json`, frames, sources) | The design tool | Add and change boards here and commit them. Keep at most 15 boards on a canvas. Rebuild `frames/` for every board that changes. |
| `frontend/`, `core/`, everything else | The code side | Not changed by the design pass. |
| `docs/feature-status.md` | The code side | A board is a proposal. Nothing is called built until it has been seen in a running build. |

Every commit to `main` publishes a release. Commits that touch only `design/`, `docs/` or
Markdown files skip the builds, so a design-only commit is cheap. Fetch and rebase before
committing; the code side commits to `main` too. On Windows, never commit with `git add -A`
(see "Cloning on Windows" in the README).

## Hard limits for every board

- Fits a phone 320 px wide and a desktop window, in light and dark.
- No remote fonts, images or scripts; a board is one self-contained page.
- Uses the tokens in `source/m3.css`. A new token is added there, once, not inline.
- Every action reachable by touch and by keyboard. Nothing that needs hover or a right-click
  only.
- Text shown in English; say where a Cantonese or two-language version changes the layout.
- Locks are described as a speed bump for fun. No board may call them security.

## Surfaces built today that have no matching board, or outgrew theirs

Each of these exists in code. None has been seen in a running build yet. They were laid out
by hand to work, not to look finished, and are the main subject of this pass.

| Surface | Where in code | What design should decide |
| --- | --- | --- |
| Pattern workbench on a phone | `frontend/src/components/regex/ha-regex-workbench.ts` | It now takes the whole visible screen below 700 px and follows the keyboard. Needs a phone layout: order of the title, mode switch, switches for the eight flags, the pattern field, the row of eight tabs (it scrolls sideways today and the last ones are cut off), and a footer that holds a note and four buttons without wrapping badly. |
| Menu of an element, opened by touch and hold | `frontend/src/components/appearance/ha-appearance-tools.ts` | On a phone: a bottom sheet or an anchored menu, how the search at its top behaves with the keyboard up, and what shows that a hold has been recognised (600 ms). |
| Lock wizard | `frontend/src/components/locks/ha-lock-wizard.ts` | Steps: the target, one of six ways in, creating each credential in order, how long an unlock lasts, the plain disclosure and the recovery line, confirm. Anchored beside the element, not a modal. Needs the phone version and the progress indicator. |
| Unlock prompt and PIN keypad | `ha-lock-prompt.ts`, `ha-lock-pin-entry.ts` | Keypad with large keys, Clear, Backspace, Cancel, Submit, an optional shuffled layout, manual entry beside it, ordered steps for more than one credential, the wait after wrong tries, and the recovery line. |
| List of locks | `ha-lock-list.ts`, inside the Lock tool of the page tools | Rows with Unlock, Lock again, Edit, Remove; search with the pattern workbench; how older shared-PIN locks are told apart. |
| Personal settings | `frontend/src/panels/config/personal/ha-config-section-personal.ts` | Groups by task, a search, each row with its explanation, default, "what it reaches today" line and reset, a preview card, Reset all. Language mode and the two playfulness levels only change the preview today; the board should show how that is said without looking broken. |
| Guided setup list | `frontend/src/panels/config/guided-setup/ha-config-guided-setup.ts` | A searchable list of about 240 integrations that have no setup screen, and the entries already made here with edit and remove. |
| Guided setup wizard | `ha-guided-setup-wizard.ts` | Steps: About, Options, Review (the YAML that will be written), Done (reload or restart). Most integrations show one YAML box today; the board should cover both the drawn form and the single box, and field-level errors. |
| Guidance note in setup dialogs | `frontend/src/dialogs/config-flow/step-flow-guidance.ts` | A collapsed note per step: what the step is for, what is needed first, a link to the documentation. Should not push the form down on a phone. |
| Developer tools on the rail | `frontend/src/components/ha-sidebar.ts` | A new item directly above Settings. Check its icon, order and the selected state against the rail board, collapsed and expanded. |
| Media search with the workbench | `frontend/src/components/media-player/ha-media-player-browse.ts` | The field now has the workbench button beside a Search button and a filter menu; on a phone the row is tight. |

## Found by the audit and not yet built

These need a design decision before code. Paths are where the gap is.

1. On a phone there is no tab bar, so the search of everything, the accessibility panel and
   the New tab list cannot be reached by touch (`layouts/home-assistant-main.ts` draws the tab
   bar only on wide screens). Decide where they live on a phone: the drawer, the page tools,
   or a bottom bar.
2. Tabs on a phone: how open pages are shown, switched and closed with one hand.
3. The pick tool for appearance (choose an element by pointing) previews on hover; on touch
   the first tap selects blindly. Needs a touch flow with a confirm step.
4. 22 places still use the browser's own blocking alert, confirm or prompt boxes. They should
   become the project's toasts and dialogs; a board of the replacements would settle the
   wording and the placement.
5. About 15 destructive confirmations do not use the two-step confirmation (energy sources,
   Matter fabrics, Thread reset, turning off a second sign-in step, deleting application
   credentials). A board should show the two-step flow on a phone.
6. Locks not built: on tabs and tab groups, on single appearance values, in bulk; locked
   items in search results; the support desk reached from "Forgotten your password?"; a QR
   code when a one-time code is set up; locked on start.
7. Pattern workbench gaps against the reference tool: other pattern dialects and converting
   between them, a step-by-step trace, searching files with a preview, encoding controls,
   help for each feature, a layout the person can rearrange.
8. Settings controls not built: emoji in dialogs, language mode and playfulness reaching real
   text, quiet hours for sounds, scheduled settings, the appearance editors on every element.

## Boards that already exist for these subjects

Start from these and extend them; do not start over.

| Subject | Canvas |
| --- | --- |
| Tabs, command search, pattern workbench, context menus, guided forms, confirmation, locks, support, authenticator | `canvases/10-features` |
| Language, wording, narration, modes, schedules, appearance editors, accessibility, panels, tokens | `canvases/09-features` |
| Settings home and the settings pages | `canvases/03-settings`, `canvases/04-settings` |
| Integrations and their dialogs | `canvases/03-settings`, `canvases/08-dialogs` |
| Phone layout | `canvases/01-everyday` |
| Developer tools | `canvases/06-tools` |

## What to hand back

For each surface above: a board for the phone and one for a wide window, light and dark where
they differ, with the states that matter (empty, filled, error, waiting, locked). Add one line
to `design/HANDOFF.md` per board added or changed. If a surface should work differently from
how it was built, say so on the board; the code follows the board.

## Where to look at the running thing

`compose.yaml` and `host.bat` start the published image. The interface work listed here is in
builds after 2026.11.1.50; `docs/feature-status.md` says which rows have been seen running.
