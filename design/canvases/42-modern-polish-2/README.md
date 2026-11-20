# Canvas 42: modern polish 2

Thirteen boards for the next modernising pass. They keep the app's own bold look (colour blocks, big numerals, floating pill bar) and push it further with shaped icons, pictures and bigger motion, while fixing how pages scroll and fit.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Phone | A list page at the top: a colour hero with a moving picture, the count as a huge numeral, coloured statistic tiles in one sideways row that fades at the edge, rows with shaped icons |
| `PhoneScrolled.dc.html` | Phone | The same page scrolled to the end: folded title bar, one scroller, an end space that clears the floating bar and the create pill |
| `PhoneSheet.dc.html` | Phone | A filter sheet: search bar with the pattern builder, title and buttons fixed, only the middle scrolls |
| `PhoneEditor.dc.html` | Phone | A detail page with long names and identifiers that wrap instead of being cut, wrapping chips, a floating save pill |
| `PhoneSearch.dc.html` | Phone | A settings tile page that gains a search bar, with matches found inside the listed pages |
| `Wide.dc.html` | Wide window | The list page on a wide window: sticky title bar, a table that scrolls inside its card, a 1200 px content limit |
| `Drama.dc.html` | Motion | Interactive. Five moments with pictures: arriving, an update finished, something failed, deleted, nothing here yet |
| `Pills.dc.html` | Motion | Interactive. Floating pills for page tools, selection actions and create. On a desktop they widen on hover and Filter opens its menu on hover |
| `AppHome.dc.html` | Whole app | The front door: the greeting in a tall colour scene with a lit window, scenes as coloured pills, areas as coloured tiles with a huge count |
| `AppEntity.dc.html` | Whole app | The sheet for one thing (a light): a header in the thing's colour, one giant slider, colour swatches, one main button |
| `AppEditor.dc.html` | Whole app | The automation editor as a path of colour blocks: When, Only if, Then, with a floating save pill |
| `AppUpdates.dc.html` | Whole app | Updates and backups: a run as a big ring with the percent, steps with ticks, backups and going back as colour tiles |
| `AppDashboard.dc.html` | Whole app | Dashboard cards: each kind in its own colour with a moving picture of its data and one large main button |

On the list boards the create button sits beside the floating bar, not above it, so it can never cover a row or a switch.

Review pictures of the boards are in `design/frames/42-modern-polish-2/`. They were rendered from the board markup with the default accent and are a still of each board after its arrival motion.

## Rules the boards agree on

1. One scroller per page. No scroller inside a scroller on the same axis.
2. Nothing is wider than the screen from 320 px upward.
3. The end of a page clears every fixed or floating thing.
4. Text wraps, or ends in three dots with the full text one tap away. It is never sliced.
5. A sideways row shows that it scrolls (a cut tile and a fade).
6. Sheets and dialogs keep their title and buttons on screen.
7. Every target is 48 px or taller.
8. Any page with more than eight rows, tiles or options has a search bar with the pattern builder beside it. Filter sheets too.
9. Nothing is removed. Every tool, filter, column, menu entry and setting that exists today stays reachable in the same number of presses or fewer.
10. Motion plays once where something real happened, follows the existing "Confirmation drama" setting and the animation settings, and is absent under reduced motion. The only ambient motion is the slow hero picture, which also stops under reduced motion.

## Tweaks

Every board declares the same two: `accent` (colour) and `motion` (on or off).

## Motion values

| Moment | Motion | Duration |
| --- | --- | --- |
| Arriving | Hero rises with a spring, three shapes spin in 120 ms apart, the numeral lands last, rows follow 70 ms apart | 0.6 to 1.1 s |
| Update finished | Badge pops, tick draws, two rings and six rays leave, words land | about 1.4 s |
| Failed | One red flash, one firm shake | 0.55 s |
| Deleted | Row tips and falls, rows below close the gap | 1.15 s |
| Empty | Picture floats three times, then rests | 7.2 s |
| Pill hover | Item widens to show its name, menu rises with a spring | 0.3 to 0.35 s |

Spring easing: `cubic-bezier(.2, 1.4, .3, 1)`.

## Status

Drawn on 20 November 2026. Building has started; nothing from this canvas has been seen in a browser yet.
