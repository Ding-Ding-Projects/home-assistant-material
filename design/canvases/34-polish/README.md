# Canvas 34: full interface polish

Six boards that set the direction for modernising every page, not one feature.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Front door | The home page on a wide window, dark. One loud greeting, an amber block only when something needs the person, area tiles with big numerals |
| `Settings.dc.html` | Settings | The Settings front on a wide window, light. Search is the hero, the most used places are large tiles with live counts, the rest are compact rows |
| `Lists.dc.html` | Lists and tables | A list page (automations) on a wide window, dark. The title carries the count, the statistics are tiles that also filter, one filter row, tall rounded rows |
| `Motion.dc.html` | Motion | Interactive. Six moments that earn dramatic motion: arriving on a page, a count changing, saved, deleted, an update finishing, an error |
| `PhoneHome.dc.html` | Phone boards | The front door on a phone, light |
| `PhoneSettings.dc.html` | Phone boards | The Settings front on a phone, dark |

## The rules the boards agree on

- Every page has **one** loud thing. Everything else goes quiet.
- Type is Roboto Flex at weight 800, widened and tight for headings. Counts are big numerals, never small grey text.
- Radii: 48 on a hero, 32 on blocks, 20 to 28 on rows and tiles.
- A statistics tile is also a filter. Nothing on a list page is decoration.
- Nothing is removed on a phone: tiles go two across, extra toolbar actions move behind More, every target is 48 px or taller.
- Motion is used only where something real happened. It scales with the existing "Confirmation drama" preference (Off, Calm, Standard, Dramatic), nothing loops, and under reduced motion the final state simply appears.

## Motion values

| Moment | Motion | Duration |
| --- | --- | --- |
| Arriving on a page | Hero rises 34 px with a spring, tiles follow 70 ms apart | 0.55 to 0.6 s |
| A count changes | Numeral swells to 1.5x, tilts 4 degrees, settles | 0.6 s |
| Saved | Tick draws itself, tile pops, one ring leaves | 0.8 s in total |
| Deleted | Row shudders, slides away, rows below close the gap | 0.9 s |
| An update finishes | Ring closes, one green flash, one ring leaves | about 1.6 s |
| Error | One firm shake and a colour change; the words say what happened | 0.5 s |

Spring easing: `cubic-bezier(.2, 1.5, .3, 1)`.

## How the motion board was made

The motion board follows the Stageshow skill, used from a pinned local copy at commit `299140f` rather than a fresh network install. The parts read were the plan in `SKILL.md`, the craft headings, and `review.md`. Its rules about camera moves, captions and exported video did not apply, because this is an interactive board and not a film. The frames could not be filmed or reviewed as rendered pictures in this pass: the canvas offers no rendering route here, so the motion is reviewed by pressing the buttons on the board.

## Status

These are design references. Nothing here is shipped behaviour until the product pages are rebuilt from them and checked in a real build.
