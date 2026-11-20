# Canvas 42: today's look, polished

The owner's decisions for this canvas, 20 November 2026:

1. The interface stays close to how it looks today, with a modern polish. It is not a new look.
2. Dramatic animations and graphics are for actions only: something finished, failed, was deleted or was saved. Pages get transitions only.
3. Nothing is removed.
4. Dashboard cards stay as they are.

An earlier draft of this canvas drew a bolder look. Those boards were removed. Every board below was drawn from a real picture of today's build and then polished.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Today, polished | The automations list: same title bar, tabs, summary line, chips and rows; names wrap, tools in one small floating pill beside Create |
| `AppHome.dc.html` | Today, polished | The front door: same greeting, scene pills, needs-you block, summaries and three-across areas |
| `AppEntity.dc.html` | Today, polished | The sheet for one thing: same header, slider, mode row, colours and tabs |
| `AppEditor.dc.html` | Today, polished | The automation editor: same mode switch, numbered cards and action bar; each step says its live state |
| `AppUpdates.dc.html` | Today, polished | Updates: same cards; one main button, plain-words state for automatic updates |
| `QuickSearch.dc.html` | Quick controls and details | Wherever a thing is listed it can be controlled in place: toggle, slider, colour button, value. Risky things ask first |
| `QuickAction.dc.html` | Quick controls and details | "Run a quick action": guided steps or YAML, runs once, kept only if asked |
| `MoreDetails.dc.html` | Quick controls and details | "Show more details" in place: identity, raw state, every attribute, with edit behind a confirmation |
| `Drama.dc.html` | Action moments and pills | Interactive. The moments for actions: finished, failed, deleted |
| `Pills.dc.html` | Action moments and pills | Interactive. Floating tool pills on a desktop that open on hover |
| `Site.dc.html` | Project site | The project's public site in its own look: welcome as a slim band, a live newest-build line, a real capture, a short what-is-new row |

## Rules the boards agree on

1. One scroller per page.
2. Nothing is wider than the screen from 320 px upward.
3. The end of a page clears every fixed or floating thing.
4. Text wraps, or ends in three dots with the full text reachable. It is never sliced.
5. Sheets and dialogs keep their title and buttons on screen.
6. Every target is 48 px or taller, or has a hit area that is.
7. A control shown in place does exactly what the full page does, through the same call. Locks, alarms, doors and covers ask first with the app's own confirmation.
8. A quick action is never saved unless the person asks.
9. Setting a state or attribute by hand says plainly that the device is not told, and asks first.
10. Motion follows the existing motion settings and is absent under reduced motion and low stimulation.

## Tweaks

Every board declares the same two: `accent` (colour) and `motion` (on or off).

## Review pictures

`design/frames/42-modern-polish-2/` holds a rendered picture of every board, taken from the board markup with the default accent after its entry transition.

## Status

Drawn on 20 November 2026. The polish and repairs on the first page are built and waiting for a browser check. The quick controls, the quick action, "Show more details" and the site polish are not built yet.
