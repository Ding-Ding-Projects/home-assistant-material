# Command search by keyboard

Command search (Ctrl+Shift+F, or Cmd+Shift+F) lists pages, commands, settings, entities, devices and areas. Every row can now be reached and used without a pointer.

## Keys

| Key                | What it does                                                                                                                                                                       |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Down, Up           | Move the active row. Moving past the last row continues at the first, and Up from nothing goes to the last. Section titles, disabled rows and the "nothing found" row are skipped. |
| Home, End          | Jump to the first or last row that can be chosen.                                                                                                                                  |
| Page Up, Page Down | Move a page at a time.                                                                                                                                                             |
| Enter              | Runs the default action of the active row. Ctrl or Cmd with Enter opens it in a new tab, or switches a setting in place.                                                           |
| Space              | Switches the live switch of the active row on or off, for personal settings and for entities that can be toggled. See below.                                                       |
| Escape             | Closes the search. While text is typed, the search field handles Escape first.                                                                                                     |

Typing a query forgets the active row, so a new list never starts with a row from the old one selected.

## Space and the search field

The search field keeps keyboard focus while you move through the rows, so Space is also a character in a query with several words. Space therefore switches the active row only when the field is empty. Ctrl or Cmd with Space always switches the active row, even with text typed. A row without a switch ignores Space.

## The active row

The active row has a background from the shared list, a 2 px ring in the primary colour, and is scrolled into view. A polite status line, hidden from sight and read by screen readers, says the label and place of the row ("Action sounds, 2 of 14") when the active row changes and says "turned on" or "turned off" after a switch changes.

The shared list already marks its rows as a list box with options. The search field cannot name the active option with `aria-activedescendant`, because the field and the rows live in different shadow roots, and an id reference cannot cross that boundary. The status line stands in for it.

## Places that already exist

Three entries open places that were already built. They sit in the Settings group and are found by plain words and by a pattern such as `/wording|vocabulary/i`, tested against the label, the description and the caption.

| Entry                 | Opens                                                                                          | Who sees it                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Personal wording file | The card on the localization page of the profile, where a file is chosen, replaced or cleared. | Everyone                                                                  |
| Accessibility tools   | The accessibility panel, the same as Alt+A.                                                    | Everyone                                                                  |
| Language mode         | The Language mode row of the personal settings.                                                | People who can open the settings panel, because that row only lives there |

The accessibility panel belongs to the main layout, which the dialog sits outside of. The entry closes the search and then sends the Alt+A key press the layout already listens for.

## Language

All new text follows the language mode and has a Cantonese counterpart.

## Where it lives

- `frontend/src/dialogs/quick-bar/quick-bar-navigation.ts` holds the row rules: which rows can be active, moving with a wrap, resetting on a new query, the position text, when Space toggles, and the three place entries.
- `frontend/src/dialogs/quick-bar/ha-quick-bar.ts` listens for the keys before the shared list, draws the ring and says the active row.
- `frontend/test/dialogs/quick-bar/quick-bar-navigation.test.ts` covers wrapping, skipped rows, the reset, positions, Space and the entries.

## Not done

- The ring and the status line were not seen in a browser.
- The accessibility entry depends on the Alt+A shortcut of the main layout.
- `aria-activedescendant` is not possible across the shadow roots, as described above.

## Verification

The row rules are covered by unit tests. The dialog was not opened in a browser for this change.
