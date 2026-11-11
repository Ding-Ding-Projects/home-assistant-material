# Type scale

Code: `frontend/src/common/appearance/type-scale.ts`,
`frontend/src/components/appearance/ha-appearance-fonts.ts`.
Tests: `frontend/test/common/appearance/type-scale.test.ts`.

## What it does

The fonts dialog has a type scale section. A base size (the body size, 12 to 20 px) and a
ratio produce five steps: caption, body, title, headline and display. Caption is the base
divided by the ratio; title, headline and display are the base times the ratio once, twice
and three times.

- Ratio: 1.125, 1.2, 1.25, 1.333 or a custom value from 1.05 to 1.6.
- Each step can have its own size (8 to 96 px), which replaces the computed one until it is
  cleared with the button beside it.
- A live preview shows all five steps at their sizes, even while the scale is off.
- Reset fonts also turns the scale off and clears the choices.

## How it is applied

When the scale is on, the steps are set on the document root as theme size variables:

| Step     | Variable             |
| -------- | -------------------- |
| caption  | `--ha-font-size-s`   |
| body     | `--ha-font-size-m`   |
| title    | `--ha-font-size-xl`  |
| headline | `--ha-font-size-3xl` |
| display  | `--ha-font-size-5xl` |

Each value is `calc(<size>px * var(--ha-font-size-scale, 1))`, so it multiplies with the
Text size choice of the accessibility tools. The dialog says so. With the scale off nothing is
written and the theme's sizes hold. The theme sizes `--ha-font-size-xs`, `-l`, `-2xl` and
`-4xl` have no step of their own; while the scale is on they are written as the geometric
mean of the steps next to them (`xs` is the caption size times caption over body), so the
sizes from `xs` to `5xl` never shrink at any base, ratio or override.

## Storage and sanitising

The choice is kept in this browser under the key `typeScale`. All reading goes through
`normalizeTypeScale`: non-numbers, NaN and infinity fall back to the defaults, the ratio,
base and sizes are clamped and rounded, unknown keys are dropped and a value stored as JSON
text is parsed.

## Known limits

- The appearance bundle saved on the instance (`appearance-sync.ts`) does not yet include the
  type scale, so the choice stays on this device until that bundle carries it.
- `startTypeScale()` is called from `ha-accessibility-tools`, which the main layout keeps
  mounted, so a stored scale applies at startup and follows changes from other tabs.
- No Cantonese strings were added: the `ui.accessibility_tools` block has none yet.

## Verification

Built and unit tested. Not seen in a browser.
