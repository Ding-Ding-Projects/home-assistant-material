# Named palette, gamut chips and hue strip

The colour tools share four additions that help a person choose and understand a colour.

- **Where:** the Colour tool (`frontend/src/panels/config/tools/colour/tools-colour.ts`) and the colour picker inside the appearance editor (`frontend/src/components/appearance/ha-appearance-color-picker.ts`).
- **Logic:** `frontend/src/common/color/named-palette.ts`, tested in `frontend/test/common/color/named-palette.test.ts`.

## Named palette

48 named colours: twelve Material families (red, orange, amber, yellow, lime, green, teal, cyan, blue, indigo, purple, pink) in four tones each (light, regular, dark, deepest). Every colour has a stable id such as `red_500`, a hex value and a translation key (`ui.common.color_palette.name_<id>`). The names exist in English and Cantonese.

The grid shows every colour as a button. The accessible name is the localized colour name, the button that matches the current colour is marked as pressed, and every button is at least 44 px square so it works on a phone. Choosing a colour sets it at once.

A "nearest named colour" line states which palette colour is closest to the current colour, or that the colour is exactly that palette colour. The distance is measured in CIE Lab space with the existing helpers from `lab.ts` and `convert-color.ts`. The older line that names the closest web colour name stays.

## Gamut chips

Three chips, sRGB, Display P3 and Outside, show where the current colour sits, with one sentence below that explains what it means for screens. Display P3 is approximated from the same D65 XYZ values as the Lab helpers, so it is a close estimate and not a colour-managed measurement. Both pickers work with opaque hex colours, which are always inside sRGB; the other two states appear for values that come from wider colour spaces. The functions `gamutOfRgb` (components that may lie beyond 0 to 255) and `gamutOfLab` give the answer for any such value.

## Hue strip

A rainbow strip for hue picking. Drag or tap it, or use the keyboard: the arrow keys change the hue by 1 degree (10 with Shift), Page Up and Page Down by 30 degrees, Home and End go to the ends. It is a slider with a spoken value. A soft light moves across it slowly; when the system asks for reduced motion the strip stays still. The existing hue slider stays as well.

## Limits

- The Display P3 test is an approximation.
- Nothing here sends data anywhere; the palette is part of the interface.
- Nothing here has been seen in a browser yet; it is covered by the unit tests of the logic and by type and lint checks.
