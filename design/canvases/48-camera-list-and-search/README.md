# Canvas 48: camera recording, one folding row per camera, with search

A new design for the Camera recording settings page. Today every camera is a table row followed by all of its settings spread out underneath (how much to keep, live video around events, clip length, clips per hour, the recording check and what the camera is asked to show), so with three cameras the page is very long, a lone Pause button floats under each name, and there is no search. On these boards each camera is one folding row with a separate pause button, and one search field with the pattern workbench filters the whole page. Nothing is removed from a camera's settings; they are only folded. One canvas page per area, a title note per page and a note beside every board.

4 boards: 3 phone boards at 390 x 844 and 1 fluid wide board at 1280 px.

The two list boards have a `before` stage that reproduces today's page, marked "Today"; every other stage shows the new design. Every search field on these boards has the pattern workbench beside it and it works on the board; boards with a search have `pattern` and `pattern-invalid` stages.

## Camera list on a phone

Camera list on a phone: each camera on the Camera recording page becomes one folding row with a separate pause button, under one search field with the pattern workbench, and an open row holds every setting the camera has today.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `Main.dc.html` | Phone, 390 x 844 | `after` | after, open, search, no-match, pattern, pattern-invalid, before |
| `OpenPhone.dc.html` | Phone, 390 x 844 | `after` | after, all-day, light, paused, problem |

**Camera list, phone** (`Main.dc.html`). Shows the Camera recording page on a phone with three cameras in one place. Each camera is now one folding row: a disclosure button with a camera icon, the name, state pill and a short summary line, and a separate 48 px Pause or Resume button beside it. Opening a row shows newest, waiting and oldest, How much to keep, and every setting the camera has today, in today's order. A Search cameras field with the pattern workbench sits under the intro, with a camera count and Expand all. Before: every camera is a table row with all of its settings spread out underneath, and there is no search. Try: open Front Door DOORBELL and record a test clip; open Garage, then What counts as seen, and untick Automatic; type "drive" or "paused" in the search, or use ^(front|garage) in the workbench. Unbuilt: all of it, including remembering which rows are open after a refresh or reload. Tweaks: accent, motion, theme (dark or light), stage.

**One camera open, phone** (`OpenPhone.dc.html`). Shows the Camera recording page on a phone with one camera open inside the /config/recordings card, under its four stat tiles and the keep slider. Each camera is a folding row: a disclosure button with the name, state pill and one summary line, and a separate 48 px Pause or Resume button beside it. The open row gets a tonal surface and holds everything the camera has today, in today's order: newest, waiting and oldest; How much to keep; live video around events; the recording check; the before and after sliders; what counts as seen; and Keep what is watched. Rows fold and open with a short transition. Try: fold and open rows or use Collapse all; in the light stage untick Automatic and choose event sources; record a test clip on Front Door DOORBELL. Unbuilt: all of it, including remembering open rows across a refresh and a reload. Tweaks: accent, motion, theme (dark or light), stage.

## Camera list on a wide window

Camera list on a wide window: the folding rows carry columns for how much to keep, newest recording, waiting to copy and oldest kept, and an open row lays its settings out in two columns.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `ListWide.dc.html` | Wide, 1280 px, fluid | `after` | after, open, search, pattern, pattern-invalid, before |

**Camera list on a wide window** (`ListWide.dc.html`). Shows the Camera recording page on a wide window. Each camera is one folding row whose disclosure button carries columns: name and state pill, How much to keep, Newest recording, Waiting to copy and Oldest kept, with a separate Pause or Resume button at the end. One Search cameras field with the pattern workbench sits above, with a camera count and Expand all. Open, the settings sit in two columns: keep and live video on the left, the recording check and watched settings on the right. Before: a table row per camera with every setting spread out underneath and no search. Try: open Front Door DOORBELL and record a test clip; type "drive", build the pattern ^(front|garage), or type the broken pattern /(front/ to see its error while every camera stays listed; narrow the window below 860 px for stacked rows. Unbuilt: all of it, including remembering which rows are open across the 10 second refresh and a reload. Tweaks: accent, motion, theme (dark or light), stage.

## Many cameras and edge cases

Many cameras and edge cases: twelve cameras in two places with one search across both, long names at large text, the first load, the set-up card and the copy error.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `EdgePhone.dc.html` | Phone, 390 x 844 | `after` | after, search, pattern, pattern-invalid, long-names, loading, empty, error |

**Many cameras and two places, phone** (`EdgePhone.dc.html`). Shows the Camera recording page with twelve cameras in two places, "/config/recordings" and "NAS recordings", on a phone. Each place is a card with its stat tiles, space meter and keep slider, then one folding row per camera with a state pill, a one-line summary and a separate pause button; opening a row shows every setting the page has today. One search field with the pattern workbench filters both places by name, entity id, state, amount and place, and a place with no match says "No cameras here match." Other stages show text at 200% (bar and button labels at 150%) with the same camera names wrapping, the first-load skeleton, the set-up card and the copy error alert. Try: type "gar" in the search, open Garage and then "What counts as seen", press Expand all, then Pause all on the NAS card. Unbuilt: all of it; this is a new design. Tweaks: accent, motion, theme (dark or light), stage.

## Tweaks

Every board declares the same four Tweaks: `accent` (colour: `#98CBFF`, `#7DD3A8`, `#FFB874`, `#D0BCFF`; default `#98CBFF`), `motion` (on or off; default on), `theme` (`dark` or `light`; default `dark`) and `stage` (that board's stages; default `after`). With motion off there are no transitions or animations at all; with motion on, rows fold and open in 200 to 250 ms.

## Rules the boards carry

Phone first at 390 px with compact rows, 14 px body text and 16 px row titles. Every touch target is at least 48 x 48 px. The disclosure button carries `aria-expanded` and `aria-controls`, and the pause button sits beside it, not inside it, with the camera's name in its label. Tab reaches each disclosure button and each pause button; Enter or Space toggles. Times are 24-hour and dates read like "26 Aug". Text contrast is at least 4.5:1 in both themes. An invalid pattern shows its error and filters nothing. Icons are inline Material Design Icons paths; sample data is made up and stays the same across stages; no remote fonts, images or scripts.

## State

Design only; nothing on these boards is built yet, including remembering which rows are open across the page's 10 second refresh and a reload. Each board's script was run under Node for every stage in both themes with motion on and off, and every name used in a template was checked against what the script returns.
