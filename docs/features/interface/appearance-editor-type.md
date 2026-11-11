# Appearance editor: type

The appearance editor (pick any element, then edit its look) has a Text section for type. Every control applies to the picked element as you change it, and is saved with that element's appearance, either for that one element or for every element of its kind.

## Controls

| Control | Control type | Range or choices | Reset |
| --- | --- | --- | --- |
| Text colour | colour picker | any colour | yes |
| Typeface | select | the typefaces the fonts dialog offers, plus the theme's | yes |
| Weight | select | Light to Extra bold | yes |
| Italic | switch | on or off | yes |
| Line height | slider | 0.8 to 2.4 times the size | yes |
| Letter spacing | slider | -0.05 to 0.3 em | yes |
| Capitals | select | as typed, all capitals, all lowercase, each word capitalised | yes |
| Alignment | select | start, centre, end, justified | yes |
| Maximum lines | slider | 1 to 10 | yes |

A reset button appears beside a field once it has a value. Resetting returns that field to the theme. "Reset this" clears every choice for the element, and Undo steps back.

The typeface list is read from the list the fonts dialog uses, so a typeface added there appears here. Only bundled or device typefaces are offered; nothing is fetched from the internet.

## Small text warning

If the element's text size multiplied by the Size choice is below 12 px, the Text section shows a warning. It is a notice only; the choice is still applied.

## Maximum lines

The limit is applied to the picked element itself, so pick the text block (a title or a description) rather than a card that contains several blocks. Text beyond the limit is cut off.

## Storage

Fields live in `ElementAppearance` (`frontend/src/common/appearance/element-appearance.ts`), stored in this browser and synced to your account like the other appearance choices. The field definitions, ranges, sanitising and styles are in `frontend/src/components/appearance/appearance-type-fields.ts`.

The stored shape only gained optional fields: `italic`, `lineHeight`, `letterSpacing`, `textTransform`, `textAlign` and `maxLines`, and `fontFamily` also accepts the key of a typeface from the fonts dialog. Data saved earlier loads unchanged. On load, numbers outside their range are clamped, and unknown weights, typefaces, capitals and alignments are dropped.

## Verification

`frontend/test/components/appearance/appearance-type-fields.test.ts` covers clamping, dropped unknown values, loading older stored data, the styles written and the small-text check. The editor itself was not looked at in a browser.
