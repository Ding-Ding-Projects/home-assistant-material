# Canvas 36: rich editors for every entity

Four boards for the rule that every action of every entity kind gets a visual editor made for it.

| Board | Page | What it shows |
| --- | --- | --- |
| `Main.dc.html` | Speak | Interactive. The Speak action redrawn: who speaks (speaker tiles), what is said (a tall message field with a count and "insert" chips), how it sounds (language and voice from the speech engine, a switch for remembering the sentence), a live sentence of what will happen, and a test button that says it really speaks |
| `Colour.dc.html` | Colour | Interactive. A light's colour is picked with a colour picker: hue and strength, warm-to-cool white inside the lamp's own range, shortcuts beside the picker, and the exact value that is stored |
| `Values.dc.html` | Every kind of value | The catalogue: which control each kind of value gets (colour, white temperature, level, bounded number, time and date, duration, one of a few, one of many, yes or no, a thing in the home, icon, media, place, words, extra settings), with a plain value box as the last resort |
| `Kinds.dc.html` | Every entity kind | What each entity kind's editor contains, and the same editor on a phone |

## Rules the boards carry

- The kind of value decides the control. A colour is never typed, a time is never a text box, a list of extra settings is never a blank dictionary.
- A control the targeted device cannot act on is not drawn. Limits, steps, modes, languages and voices come from the device or engine itself.
- A test button that really does something says so on the button, and nothing runs by itself.
- The code view stays one tap away and round-trips unchanged.
- On a phone the editor is one column with tiles two across and targets of 48 px or more; nothing is left out.

## Status

Design references. Nothing here is shipped behaviour until it is built and seen in a real build. The interactive boards were made without filming or rendering frames; they are reviewed by using them on the canvas.
