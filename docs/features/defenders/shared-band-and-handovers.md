# Shared band and handovers

AC Defender is the brother and Heat Defender the sister. When both look after the same unit they
know each other (design: canvas 39, `32d3a7134`; built in `d78560d34`).

- One comfort band for the room, which both respect.
- They hand the room to each other in plain words instead of fighting over the remote.
- One shared log.
- Each page shows the other defender on top.
- A comfort band bar on each page shows her floor, the shared band and the safety mark
  (`b62a3e0ef`).

The arbiter that holds one band per room lives in `ac_defender/arbiter.py`, and the sibling logic
in `ac_defender/siblings.py`.

## What the first real run found

The two were caught arguing over the thermostat: the sister put the heating back on while her
brother insisted he was "putting it back". Fixed in `b62a3e0ef`:

- She now only ever restores "off", or her cap while the room is under it, and never touches
  cooling.
- When the brother is held back, he says he is waiting for his sister.

## What the whole-day test found

A test that plays a whole day with both on one unit (`7cd4d5189`) found that the shared log said
AC Defender had stopped when it was not even running. That was fixed. The sibling row also
gained an Open link to the other defender's page. See
[`guard-descriptions-and-reasons.md`](guard-descriptions-and-reasons.md).

## Failure modes (inferred from the design, not read from a commit record)

- If only one defender is set up for a unit, there is no band to share and it acts alone.
- Band errors show as plain messages, not raw errors.

## Verification

Seen once in a real Home Assistant instance, which found the quarrel above. After the fix the band
bar and the waiting message were seen. Not seen with a real air conditioner and heater on the same
unit.
