# Entity sheets, list rows and tiles for every entity kind

Every kind of entity has a list row, a detail sheet and a tile, each with a first control chosen
for that kind. Three passes: `80af39d52`, `218279a85`, `d94590113`. Design: board 38 (every entity
kind, with the first control named for twenty-four groups of kinds). Earlier groundwork was the
rich editors in `a1312548c`.

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

## Verification

- Pass 3 was checked in a real browser at 390 px: 118 of 119 tiles open the right sheet, 33
  actions hold after close and reopen, and the 37 triggers and conditions that would not save now
  do.
- Pass 1: nine new tests pass.
- Not run: the light theme and wide windows, tile tap actions, and save then reopen for the other
  actions tried in pass 1. After pass 3, touch targets on a few controls may still be under 44 px
  in places the test did not reach (pass 2 recorded some as still under 44 px; pass 3 addressed
  sheet buttons; inferred, not re-measured everywhere).
- Differences from the board recorded after pass 1 and not stated as fixed since: a media player
  shows volume before transport, the humidifier ring and one numeral are still large, and the
  light and cover bars were tall (pass 2 changed these to wide bars; not re-measured against the
  board).
