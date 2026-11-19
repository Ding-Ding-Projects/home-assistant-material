# Search from the top bar

The search of a page lives in the page's top bar instead of at the top of its content. On a long
page the top of the content scrolls away; the top bar never does. Design: canvas 40
(`design/canvases/40-search-top-bar`, `a5e08cb1a`). Build: `19767b529`, `02dd3f9b4`, `92fb942bc`,
`28cd39810`, `c9e3a5e67`.

Code: `frontend/src/components/ha-top-bar-search.ts` draws the control. The subpage layouts
(`frontend/src/layouts/hass-subpage.ts`, `hass-tabs-subpage.ts`, `hass-tabs-subpage-data-table.ts`)
host it for any page that opts in with the `searchable` property. The matching itself stays in
each page's own file, so every page keeps its own words, its own pattern builder state and its
own results.

## What it does

- **At rest** the control is one 44 px button in the top bar. **Open**, it is a 40 px field with
  the pattern builder, a count, previous and next, and a close button.
- **On a settings page such as Personal settings** it opens in the bar, leaves the page where it
  is, marks the matches and steps between them, across tabs too. Closing it leaves the page where
  it is and keeps the words that were typed.
- **On a list page** it filters the rows in place and shows a count ("n of total" in the bar; on
  a phone it is the same bar field as on a wide window).
- **At wide width** the bar keeps to one row and the field is a fixed 360 px. The pattern builder
  opens holding the words already typed. A reload with a search in the address shows the button
  as holding that search. The summary line under a list title stays on one line.
- **Focus.** The field takes focus when it opens. Before `090bf8e62` it did not, so typing the word
  "language" started the voice assistant instead of searching.
- **Language.** The count, "no matches" and "found in" speak Cantonese in Cantonese mode, and the
  "found in" line wraps instead of being cut off (`c9e3a5e67`).
- **Keyboard (rule on the board).** The slash key opens it, Escape closes it and Enter goes to
  the next match. Whether each of these is built exactly as drawn was not recorded in a commit
  body; check before relying on it.

## Pages that use it

| Commit | Pages |
| --- | --- |
| `19767b529` | Personal settings (a search that jumps to and marks matches); list pages at wide width |
| `02dd3f9b4` | Release notes, notifications, support, extensions, logs, scenes, tags, the apps pages (installed and available), sidebar labels and the integrations page |
| `92fb942bc` | The problem log and the help page; "n of total" in the bar on logs and integrations |
| `28cd39810` | Developer tools tabs (state, statistics, action history, converter, YAML), list pages on a phone, Settings home, automation history and its repository page, the activity record, dashboard history, guided setup, the Ollama page, the defender Guards list, and the "What changed" list on the Updates page |

Two pages changed how they behave. Automation history had two search fields and now has one that
filters both lists. The developer tools page shell was replaced by the standard page shell plus a
small event route (`tools-search.ts`), so each tab drives the bar and keeps its own words; the
commit calls this the riskiest edit in the batch.

## Fixes from looking at the pages (`c9e3a5e67`)

- A search on Personal settings no longer matches help text nobody can see.
- Release notes search marks the words it finds and steps through them; before, it matched
  without marking or stepping.
- A stray dark box in the developer tools state header is gone.

## Later changes (`6db767de3`, on main, not built)

- **Short words are matched as written.** A list search used to fall back to a typo-forgiving
  match when nothing matched exactly, so typing "light" found "midnight", which has no "light" in
  it to mark. The forgiving match now waits for every word typed to have six letters or more
  (`FUZZY_MIN_TERM_LENGTH` in `frontend/src/components/data-table/sort-filter-worker.ts`).
- **Developer tools remember the search per tab.** Each developer tools tab keeps its own search
  text (`frontend/src/panels/config/tools/ha-panel-tools.ts`).
- **Settings home shows a count** in the top bar search: how many settings the search shows out of
  how many there are (`frontend/src/panels/config/dashboard/ha-config-dashboard.ts`).

These are unit-tested only and not seen in a browser.

## Pages that keep their own field

Search fields inside dialogs, pickers, filter panes, editors, the log terminal, the network
graphs and the tab catalog were not moved. The commit records name no reason, and no list of the
remaining pages exists in them. Inferred, not read from a record: each of those searches sits
inside something that has no page top bar of its own, so the top bar has nothing to hold. The
registered list of every search field is `frontend/src/common/regex/search-surfaces.ts`; a test
fails when a field is added without an entry there. Treat any page not named in the table above
as still having its search in the content until you have checked.

## Failure modes

- A page that opts in but does not report its matches shows no count.
- A page that does not opt in keeps the old field in its content; nothing hides it.

## Verification

- Unit tests: `frontend/test/components/ha-top-bar-search.test.ts` (73 lines at its creation).
- Seen in a real run of build 523: the top bar search on Personal settings.
- Seen in a browser at phone width for most of the pages added in `02dd3f9b4`; every moved page
  was looked at in a browser before `c9e3a5e67` (the build used for that look is not recorded).
- Seen working in a real run of build 2026.11.1.524 (built from `c9e3a5e67`, so it contains
  `92fb942bc` and `28cd39810` too): release notes search marking the words it finds and stepping
  through them, and the developer tools tabs after their page shell was replaced.
- Not seen: stepping with Enter read back, the apps pages with a Supervisor, and each page moved
  in `92fb942bc` and `28cd39810` one by one on a released image (the 524 run does not record them
  page by page).
- Integration look of 18 November, on a local build of the tree (not a released build): searching
  Entities for "light" in both-language mode at 390 px returned 15 rows, each containing the word,
  so the shorter-word rule of `6db767de3` held there. At 1440 px in light theme the Entities top
  bar showed two search icons side by side (one beside the title, one in the tool group); this was
  not compared with build 525 or the board and is an open question. The Settings home search count
  was not identified, developer tools search per tab was not tried, and Personal settings with the
  top bar search open and the field width at 360 px were not seen.
