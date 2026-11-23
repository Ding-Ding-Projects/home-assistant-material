# Entity sheets, list rows and tiles for every entity kind

Every kind of entity has a list row, a detail sheet and a tile, each with a first control chosen
for that kind. Three passes: `80af39d52`, `218279a85`, `d94590113`. Design: board 38 (every entity
kind, with the first control named for twenty-four groups of kinds). Earlier groundwork was the
rich editors in `a1312548c`.

## Control a live entity from a list

In **History**, open **Sources** and select one entity directly. Its current-state control is
labelled with that entity's name. A switch changes the live entity through its normal service.
The chart continues to show the samples recorded in the selected time range. Choosing another
entity creates a fresh control. A device, area or multi-entity selection can still be graphed.
Choose one entity as the source to operate it. [History guide](../history/README.md)

In **Developer tools → States**, filter the results to the entity you want. The row control
sends the entity's normal action, which can operate a connected device. The separate **Set state**
form edits the state representation in Home Assistant. A sensor's value remains readable in the
table. A removed or unavailable entity has no live action. Existing confirmations apply to
actions that require them. On a narrow screen the control sits below the name and identifier.

## Read a card without opening its editor

In the **Tags** card view, use **Show more details** to read or copy the tag ID, name,
description and last scan time when available. In **Areas**, the same button shows the area ID,
floor and aliases. Use the area link to navigate and the pencil to edit. The link also acts as
the drag handle when changing the order or moving an area between floors. Opening details sends
no service call. Each card keeps its own open state while it remains in the list.

The revised local frontend was exercised on a synthetic installation in English, Cantonese and
bilingual mode at 360 and 1440 px. The 24 browser cases covered keyboard activation, live state,
historical samples, filtering and card interactions. The width check measured each line of the
entity ID against the switch. There were zero intersections in the revised build. See the
[release and verification handoff](../../../HANDOFF.md#build-548-verification-22-november-2026).

## Pass 1: put every kind on screen and use it

One entity of each of 60 kinds was put in front of a phone-size window and used with a real
pointer: 129 detail sheets, 129 list rows, 89 tiles, 207 actions in the automation editor and 512
triggers and conditions. Eight faults were found and fixed:

- Buttons had no Press control, and remotes no power control.
- The row of mode choices on a thermostat or vacuum ran off the right edge; it wraps.
- A media player's cover picture took 320 px of a phone; it is smaller.
- 67 list rows were taller than 60 px because an empty area showed a dash on its own line.
- "Above" and "below" for a number were plain boxes; they are sliders with the entity's own limits.
- Hero numbers in sheets were up to 57 px on a phone; they are capped at 28 px.
- A lock's control was a 168 px square; on a phone it is a 64 px pill.

## Pass 2

- The lock is a slide to unlock, with Enter on the thumb for keyboards, so a thumb brushing it no
  longer opens a door.
- Lights and covers get one wide bar instead of a tall tower. Fans get a row of levels. A select
  with five options or fewer shows them as tiles.
- Trackers and zones get their map. Assistant and speech entities say what they are for.
- A test reads the list of entity platforms and fails if one has no first control or if any type
  in a sheet goes over 28 px.

## Pass 3

- A sheet title no longer breaks a word in half; controls start right under the header.
- Every button on a sheet is at least 44 px to hit, without looking bigger.
- Valves, covers and remotes use a compact row instead of the tall toggle. Long select lists open
  as a searchable sheet. Trackers and zones show their map first. List rows keep the name on one
  line.

## Later changes

- **A sheet is as tall as what is in it** (`17fce491f`). On a phone a sheet used to rent the whole
  screen for a single switch. Switches, input booleans, sirens and plain fans get the compact 56 px
  switch; valve, cover and script buttons are visible in the light theme.
- **Cantonese.** The sheets speak Cantonese for this project's own wording, plus the tabs and the
  headings (a large addition to `yue-own.json`).
- **A test guards the helper kinds.** The coverage test now also checks the fifteen helper kinds;
  removing the zone mapping was watched turning it red.
- **First look in a browser (`ecc3e18ef`).** The script sheet's Run button was a blank rectangle
  with no word on it; the label is back. A sheet shrank the moment you left the Details tab,
  because the saved height was thrown away; it holds now. Disabled sheet buttons get a thin
  outline in the light theme, because their fill was 1.24 to 1 against white.
- **Height changes glide** instead of jumping (`c9e3a5e67`). Build 523 still jumps between tabs.
  Tested; the glide is in build 524 but was not recorded as seen in its real run.
- **More Cantonese** (`6e399887e`, in build 525). About 240 control labels on the sheets, the
  details table, the related list and relative times such as "5 minutes ago" follow the language
  mode. See
  [`../language-and-voice/entity-words-and-stacked-labels.md`](../language-and-voice/entity-words-and-stacked-labels.md).
- **Both-language tab bar** (`44d5a60e5`, in build 525). The four tabs at the foot of a sheet
  stack English over smaller Cantonese: one row, 44 px targets, a 61 px bar in every mode, instead
  of two rows taking a third of a 320 px screen. Related list rows reach 44 px. Seen in a browser
  at 390 and 320 px.
- **State words follow the mode** (`6db767de3`, on main, not built). On, Off, Open, Closed and
  similar words, attribute names and weekday names in the weather sheet follow the language mode.
- **History tab glide** (`6db767de3`, on main, not built). The History tab no longer jumps a
  second time when its content arrives. Fan speed buttons and sensor range chips stack the two
  languages on one row. Unit-tested only.

## Verification

- Pass 3 was checked in a real browser at 390 px: 118 of 119 tiles open the right sheet, 33
  actions hold after close and reopen, and the 37 triggers and conditions that would not save now
  do.
- Pass 1: nine new tests pass.
- Not run: the light theme and wide windows, tile tap actions, and save then reopen for the other
  actions tried in pass 1. After pass 3, touch targets on a few controls may still be under 44 px
  in places the test did not reach (pass 2 recorded some as still under 44 px; pass 3 addressed
  sheet buttons; inferred, not re-measured everywhere).
- Not seen: most sheets in both-language mode (stated at `ecc3e18ef`). The tab bar in
  both-language mode was seen at 390 and 320 px (`44d5a60e5`); the other sheet controls in that
  mode were not recorded as seen.
- Differences from the board recorded after pass 1 and not stated as fixed since: a media player
  shows volume before transport, the humidifier ring and one numeral are still large, and the
  light and cover bars were tall (pass 2 changed these to wide bars; not re-measured against the
  board).
