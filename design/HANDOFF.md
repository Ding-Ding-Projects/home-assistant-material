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

## Pass 2 (9 November 2026), complete as a design pass

Pass 2 replaces pass 1 after the owner's review. Direction: one calm floating pane, a slim rail,
quiet pill tabs, a single expressive hero card per screen, large type, fewer and larger cards.

- 48 artboards on 8 canvas pages. `canvas/canvas.json` lists every board with its page and frame.
- Sources are `source/*.src.html`. `source/inline-assets.mjs` expands the shared frame, list rows,
  switches and icons and writes the artboards to `canvas/`.
- `frames/` holds a headless Chrome render of each artboard at its native size. They render the
  design files, not the product.
- Type: Google Sans Flex with Roboto Flex as fallback, Roboto Mono for code, all under the SIL Open
  Font License. Icons: Material Design Icons, the set the frontend already ships.
- Nothing here is implemented in the product yet. `docs/feature-status.md` tracks implementation.

### Required feature to board map

| Feature | Board |
| --- | --- |
| Material Design 3 conformance, workflow navigation | Main, Energy, Settings, Phone, Tokens |
| Motion with a reduced-motion path | Settings (Motion), Accessibility, Tokens |
| Live charts | Energy |
| Practical first-run wizard | Onboarding |
| Language modes, playfulness sliders, dialog emoji switch | Language |
| Personal wording file, drop to apply | Vocabulary |
| Spoken narrator, action sounds | Narration |
| School mode, focus modes | Modes |
| Scheduled and external settings sources | Schedule |
| Renaming the app, logo customization | Identity |
| Dim sum surprise, public photo source | DimSum, Ladder (photo slots stay empty in the design) |
| Per-element appearance editor | AppearanceType, AppearanceLayers |
| Infinite colour picker and translator | ColorPicker |
| Font customization | Fonts |
| Accessibility tools, sizing without clipping | Accessibility |
| Overlays and panels, collapsible filters and statistics | Panels |
| Tabs, every tab open, New tab catalog | Main (tab bar), Tabs |
| Command palette | CommandPalette |
| Pattern builder on every search surface | Regex, and the builder button on every search field |
| Context menus with working shortcuts | ContextMenu |
| Rich controls wherever a value is shown | CommandPalette, Bulk, Minecraft |
| Guided forms, per-control information buttons | GuidedForm, Settings |
| Settings that explain themselves | Settings |
| Extension support | Extensions |
| Starting points for blank editors | BlankEditor |
| Two-key confirmation | SuperConfirm |
| Element locks | Locks |
| Unlock ladder | Ladder |
| Support Tickets | SupportTickets |
| Built-in authenticator, QR pairing | Authenticator, QrPairing |
| Free by default, honest when paid | About |
| Local version history | History |
| Export in every format | Export |
| Bulk actions | Bulk |
| Changelog viewer | Changelog |
| Offline help articles | Docs |
| Rendered provider text | ReleaseNotes |
| Notifications and their centre | Notifications |
| File converter | Converter |
| Base64 toolkit | Base64 |
| Minecraft server manager, world generator | Minecraft, WorldGen |
| Local Ollama suite | Ollama |
| External editor hand-off, publishing to a forge | Handoff |
| Drawing and annotation | Drawing |
| Progress where it started, recovery where it broke | Progress |
| Front-screen version and updated-at | Main (footer), About |
| Updates from this project | About, Progress, ReleaseNotes |

Not drawn, with the reason:

- Windows virtual disk manager: the product is a web application served from Linux and has no
  Windows host to manage disks on.
- Browser-extension download hand-off: there is no browser extension in this product.
- Job document wording: applies to job-related products only.
- Frameless window title bar: applies to installed desktop applications; this product runs in a
  browser or in the companion apps, which draw their own window.

### Design guidance used

The Stageshow skill, pinned copy at commit `299140fafd08df55a9c234e610c3f64af3f45531`. A fresh install
was not possible in the session that made this pass, so the pinned copy was read. Rules applied:
restraint, one hero per screen, hierarchy from proportion and space, icons only from the product's
own set, real words where the eye lands, no empty bands, no cut controls. Its rules for animated
marketing demos (cursor choreography, loops, crops that bleed off a stage) do not fit product
screens and were not applied. No gold example was copied: none shows a full application screen.

### Review record

Each batch was rendered to frames, read, fixed and re-rendered before it was published.

- Batch 1 (everyday screens): base rule was resetting button and link styles; empty band above the
  footer on Home; Settings board too short; wizard said a finished scan was still running.
- Appearance: both editor boards were too short and cut their last row.
- Navigation: the guided form cut its buttons; the starting-point cards wrapped to a second row;
  the pattern workbench left an empty band.
- Safety: a button modifier clashed with the icon tile class and stacked a label under its icon;
  the dish game's answer buttons overflowed their card.
- Tools: the world generator's button count disagreed with the selected area; a nested button in
  the account list.
- System: the About board's second column wrapped below the first.

Open after this pass:

- Photo slots (dim sum, camera snapshot, help article screenshot) are labelled placeholders. They
  take real pictures only from the product or the public photo catalogue.
- Dark theme is drawn for Energy only. The tokens define the full dark scheme.
- Cantonese copy on the Language, Narration and Docs boards needs a native review.
- No motion was filmed: the boards are stills.
