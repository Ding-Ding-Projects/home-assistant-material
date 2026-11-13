# Animation and transitions (motion editor)

A page under Personal settings, built in batch 48.

## What it does

Profiles, a master switch, a speed control, nine element kinds that can each be timed, a curve
editor and a live preview. Seven shared components read a timing token and keep their old timing
as the fallback, so a missing value changes nothing.

## Reduced motion always wins

The system reduced-motion setting and the accessibility tool's reduced-motion option switch motion
off whatever the page says. There is no way to override them from this page.

## Limits and failure modes

- Per-row entrance animation is not done (rows are virtualised); hover lift on cards is not done.
- The page changes timing only; it never changes what an action does.

## How it was verified

Seen in published build 371 (the page opened and drew correctly in the headless pass). The effect
on the seven components, and the reduced-motion paths, are unit tested and have not been watched
moving. State: built, page seen in published build 371.
