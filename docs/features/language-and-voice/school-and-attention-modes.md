# School mode, one thing at a time and attention modes

Code: `frontend/src/common/preferences/` (`personal-preferences.ts`, `one-thing.ts`,
`attention-modes.ts`, `focus-spotlight.ts`).

## What it does

- School mode is a switch with rules, each with a real effect (the rules are `SCHOOL_RULES` in
  `personal-preferences.ts`, one of them removes emojis), and a name of up to 40 characters.
- One thing at a time: when an expansion panel opens, the panels next to it in the same container close. A panel that sits alone is not touched.
- Attention modes: a small clock, an offer to go back to the page you were on, a focus
  spotlight and low stimulation.

## Limits

A shared School mode switch across other apps, and an unlock credential for it, are not built.

## Verification

Unit tests only. Nothing here has been seen in a running build.
