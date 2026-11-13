# Light sliders, energy colours and the colour picker

Built in batch 52.

- The light card has sliders.
- Energy sources and devices can each have a colour. The colours are stored as `colors` in the
  energy preferences on the server.
- A rainbow control opens the full colour picker.

## Limits and failure modes

- The server refuses a value that is not a colour.
- A source without a chosen colour keeps its default.

## How it was verified

On a throwaway instance, energy colours were saved, read back and cleared, and a value that was
not a colour was refused. The cards and the picker were not seen in a browser. State: server part
run for real; interface built, unit tested, not yet seen in a running build.
