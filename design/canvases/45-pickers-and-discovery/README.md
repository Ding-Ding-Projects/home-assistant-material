# Canvas 45: pickers, card editor and 3D printer discovery

Boards for three surfaces (25 November 2026), one canvas page per surface. Each page has a title note, and every board has its own note beside it saying what it shows, what to try and what is not built yet.

18 boards: 15 phone boards at 390 x 844 and one fluid 1280 px board per page.

## Filter pickers

| Board | Size | Default stage | What it shows |
| --- | --- | --- | --- |
| `FilterPicker.dc.html` | Phone, 390 x 844 | `normal` | Normal stage. Every type has its icon in a tonal circle. The search field is pinned above the list with a match count and a clear button; the Any chip clears the selection. Types that were selected when the list opened sit at the top; a type ticked now stays where it is until the list is opened again, so rows never jump under a finger. Try: tick rows, type "se", press Any. Unbuilt: all of it; today this is a plain checkbox list. |
| `FilterPickerNoMatch.dc.html` | Phone, 390 x 844 | `no-match` | Empty stage: the search matches no type. The selection is kept and said to be kept. Try: Clear search, or delete the text. Unbuilt: all of it. |
| `FilterPickerLoading.dc.html` | Phone, 390 x 844 | `loading` | Loading stage: placeholder rows in the shape of the real rows, the match count hidden until there is something to count. Reduced motion or the motion tweak stops the shimmer. Unbuilt: all of it. |
| `FilterPickerError.dc.html` | Phone, 390 x 844 | `error` | Error stage: the list could not be read. The current filter stays applied. Try: Try again returns to the list. Unbuilt: all of it. |
| `FilterPickerWide.dc.html` | Wide, 1280 px, fluid | `normal` | Wide window: the same picker as a side panel beside the entities table. Removing a chip above the table unticks the type in the panel. The stage tweak shows no-match, loading and error here too. Below about 880 px the table moves under the panel. Unbuilt: all of it; the table rows are 12 sample entities. |

## Card editor

| Board | Size | Default stage | What it shows |
| --- | --- | --- | --- |
| `TileEditor.dc.html` | Phone, 390 x 844 | `config` | Normal stage. Bottom sheet with the header, Search this dialog, the four tabs and a compact live preview pinned above the form. Only the form scrolls, and Cancel and Save stay in a footer that never covers a field. Try: change the name or color and watch the preview, switch tabs, search "color". Unbuilt: the pinned preview and footer layout; the search here filters the Config tab only, the built search should cover all four tabs. |
| `TileEditorNoEntity.dc.html` | Phone, 390 x 844 | `no-entity` | Empty stage: a new card with no entity. The preview says what is missing and Save is off. Try: tap the Entity field to pick the sample entity. Unbuilt: the empty preview message. |
| `TileEditorLoading.dc.html` | Phone, 390 x 844 | `loading` | Loading stage: the configuration is being read. Header, search and tabs are already in place so nothing shifts when the form arrives. Unbuilt: placeholder rows. |
| `TileEditorError.dc.html` | Phone, 390 x 844 | `error` | Error stage: the saved entity no longer exists. The message is at the top of the form, the field is marked and Save is off until another entity is picked. Try: tap the Entity field. Unbuilt: the message placement and the marked preview. |
| `StackEditor.dc.html` | Phone, 390 x 844 | `stack` | Vertical stack card: the cards in the stack are a scrolling strip of numbered tabs with Add at the end, then move earlier, move later and remove for the chosen card, then that card's own form. Try: pick a card, move it, add one, remove one. Unbuilt: the strip and its three buttons as drawn; the child form shown is the Tile form for every card. |
| `TileEditorWide.dc.html` | Wide, 1280 px, fluid | `config` | Wide window: a dialog with the form on the left and the preview on the right, so the preview never pushes the form down. The stage tweak shows no-entity, loading, error and stack. Under about 900 px the preview moves above the form. Unbuilt: the two-column layout. |

## 3D printer discovery

| Board | Size | Default stage | What it shows |
| --- | --- | --- | --- |
| `PrinterDiscovered.dc.html` | Phone, 390 x 844 | `discovered` | Normal stage. A Bambu Lab printer found on the network: name, model, masked serial and address. Try: Show reveals the sample serial, Add opens the access code step, Ignore leaves the none-found stage. All data is made up (192.0.2.x addresses, sample serials). Unbuilt: the masked serial with Show. |
| `PrinterAccessCode.dc.html` | Phone, 390 x 844 | `access-code` | Step 2 of 3: the access code, where to find it on the printer, a show or hide button and a character count. Try: type 8 characters and press Connect; it connects, then lands on the printer list with a confirmation. Fewer than 8 characters gives a plain message. Unbuilt: the step bar and the character count. |
| `PrinterWrongCode.dc.html` | Phone, 390 x 844 | `wrong-code` | Error stage: the printer refused the code. The field is marked and the message says where to look. Typing again clears the error. Unbuilt: nothing beyond the step itself. |
| `PrinterSearching.dc.html` | Phone, 390 x 844 | `searching` | Loading stage: looking for printers, with a progress bar and a placeholder card. The refresh button in the top bar runs this search and ends on the discovered card. Unbuilt: the placeholder card. |
| `PrinterNoneFound.dc.html` | Phone, 390 x 844 | `none-found` | Empty stage: nothing answered. Says what has to be true for a printer to be found and offers Search again or Add by address. Unbuilt: the Add by address path beyond the access code step. |
| `PrinterMoved.dc.html` | Phone, 390 x 844 | `moved` | The printer list after an address change: a notification card and a toast "Printer moved to a new address and reconnected", the old and new address, and "Auto-bound by serial" on each printer. Try: Simulate an address change, Dismiss. Unbuilt: the notification card; the toast and the tag are the parts to build first. |
| `PrinterDiscoveryWide.dc.html` | Wide, 1280 px, fluid | `discovered` | Wide window: discovered devices on the left, the printer list on the right, the access code step as a centred dialog and the toast at the bottom right. The stage tweak shows every stage. Under about 800 px the two columns stack. Unbuilt: the two-column page. |

## Tweaks

Every board declares the same four Tweaks with the same names and defaults:

| Tweak | Values | Default |
| --- | --- | --- |
| `accent` | Colour: `#98CBFF`, `#9BD6A4`, `#F2C744`, `#D4BEE6` | `#98CBFF` |
| `motion` | On or off | On |
| `theme` | `dark`, `light` | `dark` |
| `stage` | The stages of that surface | The stage in the table above |

The boards for one surface are the same page with a different default `stage`, so any board can be switched to any other stage of its surface. Stages per surface: filter picker `normal`, `no-match`, `loading`, `error`; card editor `config`, `no-entity`, `loading`, `error`, `stack`; printer discovery `discovered`, `access-code`, `wrong-code`, `searching`, `none-found`, `moved`.

In the light theme the accent is darkened for contrast on light surfaces; in the dark theme it is used as chosen. Reduced motion stops every animation whatever the motion switch says.

## Rules the boards carry

- Colours are the Material Design 3 light and dark tokens from `design/source/m3.css`, copied into each board so a board stays one self-contained page. No remote fonts, images or scripts.
- Every control is at least 48 px tall or has a 48 px touch area; type sizes stay within the Material Design 3 scale (22 px titles, 16 px body, 12 to 13 px supporting text).
- Domain icons are the Material Design Icons paths from `@mdi/js`, the same set the frontend uses.
- Filter picker: rows selected when the list opened are grouped at the top; a row ticked afterwards keeps its place until the list is opened again.
- Card editor: only the form scrolls. The header, search, tabs and preview stay above it and Cancel and Save stay in a footer below it, so no field is ever hidden behind a button.
- Printer discovery uses made-up data only: addresses in 192.0.2.0/24 (reserved for documentation), sample serial numbers and no real access code. The serial number is masked until Show is pressed.

## State

Design only; nothing here is built yet. The boards reference `support.js`, which belongs to the design canvas and is not copied here. They have not been opened in the canvas or a browser: each board's script was run under Node for every stage in both themes, and every name used in a template was checked against the values the script returns, but the rendered layout has not been looked at.

Known gaps: the search in the card editor filters the Config tab only (the built search should cover all four tabs); the stack editor shows the Tile form for every card in the stack; the Style, Visibility and Layout tabs are short samples; Add by address on the printer page goes straight to the access code step; no board has Cantonese or two-language text.
