# Canvas 49: 3D printer status and control cards

Two new built-in dashboard cards, offered in the Add to dashboard dialog: "3D printer status" and "3D printer controls". Each is set up by picking one printer (a device). The cards find that printer's entities by the integration's entity keys (the community Bambu Lab integration, domain `bambu_lab`), so nothing is picked entity by entity, and anything a printer does not have is left out: a single-nozzle printer shows one nozzle, and a printer without a chamber sensor shows no chamber.

The status card shows the stage, the job, progress with layers left and time left, problems, and the temperature of each nozzle, the bed and the chamber. The control card gathers every printer control into six groups. Both sit inside the app's Material 3 dashboard and use its tokens, with a look of their own: a progress bar drawn as thin layer lines, a big percentage, temperature tiles with current and target, and a stage chip with a quiet pulsing dot.

4 boards: 3 phone boards at 390 x 844 and 1 fluid wide board at 1280 px. One canvas page per subject, a title note per page and a note beside every board.

This is a new design, so no board has a `before` stage. The search field in the Add to dashboard dialog has the pattern workbench beside it and it works on the board; that board has `pattern` and `pattern-invalid` stages.

## Status card

Status card: a new dashboard card that shows one 3D printer's stage, job, progress, layers left, time left, problems and temperatures, in every state from printing to offline.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `Main.dc.html` | Phone, 390 x 844 | `after` | after, single, heating, problem, finished, idle, offline, choose |

**3D printer status card, phone** (`Main.dc.html`). Shows the new 3D printer status card on a phone dashboard, above a room card for context. The card shows the printer name, model and online dot, a stage chip with a quiet pulsing dot, a short note beside the chip only when it adds something (print speed, or since when it is paused), the job with its cover image, a big percentage, a progress bar drawn as 40 thin layer lines, layers left, time left and finish time, a problems panel or a quiet "No problems" line, and temperature tiles for each nozzle, the bed and the chamber with current, target and a heating, cooling or at-target mark. The H2D chamber tile shows its target; single-nozzle printers show one nozzle and no chamber. The offline stage is greyed and shows no live values. Try: tap the card header to see where it leads; tap the two top bar buttons; in the problem stage collapse the problems panel and tap "What this means"; in the choose stage pick a printer and press "Show this printer". Unbuilt: all of it, this is a new design. Tweaks: accent, motion (off also stops the pulsing dot), theme (dark or light), stage.

## Control card

Control card: a new dashboard card that gathers every control of one 3D printer into six tidy groups, with a confirmation before stopping a print.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `ControlsPhone.dc.html` | Phone, 390 x 844 | `after` | after, paused, stop-confirm, idle, single, offline |

**3D printer control card, phone** (`ControlsPhone.dc.html`). Shows the new 3D printer controls card on a phone dashboard. One card per printer, with six collapsible groups: Print (Pause or Resume, and Stop, which always asks first), Speed (Silent, Standard, Sport, Ludicrous), Temperature (a stepper per nozzle, bed and chamber with the current reading and a heating, cooling or at target mark; the first raise from Off jumps to a usable target), Fans (slider plus switch each), Lights, and More (airduct mode, camera, prompt sound, silence buzzer, force refresh). Parts a printer lacks are left out: the single stage has no buzzer button, and rack buttons appear only on printers with a hotend rack, so neither sample shows them. Try: tap Stop and answer the sheet; raise the right nozzle target and watch the mark change; drag a fan to zero, then switch it back on. Unbuilt: all of it; this is a new card. Tweaks: accent, motion, theme (dark or light), stage.

## Adding and setting up the cards

Adding and setting up the cards: both cards in the Add to dashboard dialog, and the card editors with a printer picker and switches for what to show.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `AddCardPhone.dc.html` | Phone, 390 x 844 | `after` | after, pattern, pattern-invalid, status-editor, control-editor, no-printer |

**Adding the cards, phone** (`AddCardPhone.dc.html`). Shows how the two new 3D printer cards are added and set up on a phone. The Add to dashboard dialog lists "3D printer status" and "3D printer controls" with picture-only previews drawn exactly like the cards on the other boards; its search has the pattern workbench beside it. Add opens the card editor: a short preview window that stays on top and moves to the part a setting changes, a printer picker listing only supported printers, and switches for what to show. With no supported printer, the editor says so, links to adding an integration and keeps Save off. Try: clear the search to see every card, or apply ^3d printer (status|controls)$ in the workbench. Add the status card, pick Office P1S, turn Chamber temperature off, then press Show all. In the control editor, hide groups, then press Stop in the preview. Unbuilt: all of it; both cards, the dialog entries and the editors are new. Tweaks: accent, motion, theme (dark or light), stage.

## Wide dashboard

Wide dashboard: the status and control cards for one printer side by side, with a second printer's status card in its own section below.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `DashboardWide.dc.html` | Wide, 1280 px, fluid | `after` | after, problem, idle, offline |

**Both cards on a wide dashboard** (`DashboardWide.dc.html`). Shows a wide dashboard with the Workshop H2D status and control cards side by side and the Office P1S status card in its own section below. The status card has a stage chip with a quiet pulsing dot, a big percentage, a bar of thin layer lines, time left, problems, and temperature tiles with current, target and a heating or cooling mark; the active nozzle stays marked while idle. The control card groups Print, Speed, Temperature, Fans, Lights and More in a grid that folds to one column at phone width. When the printer is offline every control is truly disabled and the reason stays readable. Try: press Pause then Resume and watch the status card follow, with focus staying on the button; press Stop and answer the confirmation; raise the left nozzle target or drag a fan slider. Unbuilt: all of it; both cards, the printer lookup by entity keys and the link between controls and status are new. Tweaks: accent, motion, theme (dark or light), stage.

## Tweaks

Every board declares the same four Tweaks: `accent` (colour: `#98CBFF`, `#7DD3A8`, `#FFB874`, `#D0BCFF`; default `#98CBFF`), `motion` (on or off; default on), `theme` (`dark` or `light`; default `dark`) and `stage` (that board's stages; default `after`). With motion off there are no transitions or animations at all, and the pulsing dot on the stage chip stops.

## Sample data

"Workshop H2D" (model H2D, two nozzles) is printing "Bracket v3": 62%, layer 236 of 380, 1 h 24 min left, done at 21:47, left nozzle 218 of 220 °C (active), right nozzle 38 °C with no target, bed 65 of 65 °C, chamber 34 °C, speed Standard. "Office P1S" (one nozzle) is idle: nozzle 26 °C, bed 24 °C. The problem stages show the stage "Paused: filament runout" with two sample items from the printer's health messages. All of it is made up; times are 24-hour.

## State

Design only; none of this is built yet. Both cards, their entries in the Add to dashboard dialog, the card editors and the printer lookup by entity keys are all new. Each board's script was checked under Node for every stage in both themes with motion on and off.
