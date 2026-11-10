# Design handoff

## Pass 1 (9 November 2026), superseded

- Artboards drawn: `Main.dc.html` (overview, light) and `EnergyDark.dc.html` (energy, dark).
- Owner review: too cluttered, not modern enough, and the required product features appear only
  in small pieces. Pass 2 replaces both boards.
- Six further boards are reserved in `canvas.json` and not drawn yet.
- Design guidance: the Stageshow skill, pinned copy at commit `299140fafd08df55a9c234e610c3f64af3f45531`.
  A fresh install was not possible in the session that made this pass, so the pinned copy was read.
  Rules applied: restraint, framing, hierarchy, icons from the product's own set. Its filming and
  rehearsal steps have not been run; no frames were rendered in this pass.

## Pass 2 (9 November 2026), in progress

Pass 2 replaces pass 1 after the owner's review. Direction: one calm floating pane, a slim rail,
quiet pill tabs, a single expressive hero card per screen, large type, fewer and larger cards.

- Canvas pages: everyday screens, language and voice, appearance, navigation and search, safety
  and locks, records and history, built-in tools, system and tokens.
- Sources are `source/*.src.html`. `source/inline-assets.mjs` expands the shared frame, list rows,
  switches and icons and writes the artboards to `canvas/`.
- `frames/` holds a headless Chrome render of each artboard at its native size, used for review.
  They render the design files, not the product.
- Type: Google Sans Flex with Roboto Flex as fallback, both under the SIL Open Font License.
- Icons: Material Design Icons, the set the frontend already ships.

Boards drawn so far are listed in `canvas/canvas.json`. Each later batch appends to this file.

### Review notes, batch 1

- Home: fixed button and link styles that were being reset by the base rule; trimmed the empty band
  above the footer.
- Settings: board height raised so the last rail item and the footer are whole.
- First-run wizard: the active step no longer says the scan is running after it has finished.
