# Accessibility spacing, fonts and the colour picker

Code: `frontend/src/common/accessibility/accessibility-tools.ts`,
`frontend/src/components/appearance/` (`ha-appearance-fonts.ts`, `ha-appearance-color-picker.ts`).

## What it does

- Accessibility has line spacing and letter spacing beside text size, contrast, reduced motion,
  focus ring and larger targets. Choices are kept in the browser.
- A fonts dialog lists only typefaces that ship with the app or are on the device, and fixes were made for a font that is not on the device, for narrow
  screens and for focus.
- The appearance editor has its own colour picker. A typed colour is applied when typing
  finishes, not at every letter, and a drag is stored a few times instead of at every move.

## Verification

The accessibility panel with text size and contrast was seen earlier
(`../../screenshots/accessibility.png`, `contrast.png`). Spacing, the fonts dialog and the
picker are built and not seen in a running build.
