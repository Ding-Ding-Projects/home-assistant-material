# "Needs you" card, page tops and number tiles

Built in batches 46 and 48 from the everyday and protocol boards.

## What it does

- **Home greeting and "Needs you".** A greeting line, and a card for what waits for a person: unlocked
  locks, pending updates, repairs and open doors, from real data. Big-number and lit tiles.
- **Page tops.** The lights, security, energy and climate pages start with a header of their own.
  Security has a Locks list.
- **Number tiles on protocol pages.** Tiles with real numbers from the instance. MQTT rates
  are measured by the page itself after Listen is pressed.
- **Assistants.** One assistant's pipeline strip with a real last-run time.
- **Entity dialogs.** The state is shown once; the timer has labelled buttons and +5 minutes;
  counter and person were drawn too.

## Limits and failure modes

- Where the instance cannot report a figure, the tile is left out rather than invented.
- Analytics switches are not built; analytics is deliberately a no-op in this product.
- The "Needs you" card lists only what the instance knows about.

## How it was verified

Seen in published build 371: the greeting and the "Needs you" card on the home page. The page
tops, number tiles, the MQTT rates and the dialogs are built and unit tested, not yet seen.
