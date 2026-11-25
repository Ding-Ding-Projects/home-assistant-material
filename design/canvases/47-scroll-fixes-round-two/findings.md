# Canvas 47 survey findings

Round two of the frontend survey behind the boards in this folder. Only findings that held up against a second reviewer are listed, with that reviewer's note and, where it corrected the fix, the corrected fix.

## App shell and page layouts

10 held up; the first reviewer noticed 4 more that were not written up.

### Pages sheet on a short phone screen squeezes its list to nothing and clips the rows above it

`frontend/src/components/phone/ha-phone-bar.ts:2601`, scroll, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (rules 1 and 5: one scroller, sheets keep title and buttons on screen)`

**What happens.** #sheet (2588-2616) is a flex column with `max-height: calc(100dvh - var(--ha-phone-bar-room) - var(--ha-space-8) - safe-bottom)` and `overflow: hidden`. Only .list (2748-2752) has `overflow-y: auto; min-height: 0`. Every other child (grabber, header 44, quick tools about 68, search 48, `new-tab` row 56, gaps and padding) keeps its content height, about 280 px together. On a 667x375 or 360 px tall landscape phone the cap is 375-76-32 = about 267 px, so the flex algorithm shrinks .list to 0 px and the remaining fixed rows overflow the sheet, which cuts them off with overflow hidden. The same happens at 200 % text or in `both-languages` mode on a normal portrait phone. No element of the sheet scrolls to the open pages or the catalog.

**At phone and desktop width.** Phone in landscape (or large text): the Pages sheet opens as a strip showing only the grabber, header, quick tools and part of the search. The page cards and the New tab catalog list have zero height, so no page can be chosen. Desktop: not reachable, the sheet is phone only.

**Fix.** Make #sheet `overflow-y:auto` with `overscroll-behavior:contain`. Give .list a floor (`min-height`: `min(12rem`, 40dvh)) or set .list { `flex-shrink:0`; `overflow:visible` } under @media (`max-height:520px`), so the sheet becomes the one scroller.

**Second reviewer.** #sheet is a capped flex column with overflow hidden. Only .list has `min-height` 0 and scrolls, and there is no `max-height` or landscape media query. On a short screen .list shrinks to 0 and the fixed rows are clipped.

### Phone page title is forced onto one line with an ellipsis and the shrink-to-fit rule is overridden

`frontend/src/components/ha-top-app-bar-fixed.ts:203`, clip, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (rule 4: text wraps or has its full text reachable)`

**What happens.** The shared header styles (`common/motion/page-entry.ts`, 227-241) let a phone title shrink from 22 to 16 px with `clamp(16px, 14.5cqi, 22px)` and wrap at spaces. `ha-top-app-bar-fixed` loads them first and then sets `:host([narrow]) .main-title .page-title { font-size: 21px }` (line 110), which has the same specificity and wins, so the clamp never applies. Lines 198-205 then give `.page-title` and the slotted title `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`. The comment above says it ends in an ellipsis only at the smallest size, but the smallest size is never reached. The element has no title attribute, so the full text cannot be read anywhere. This frame is the header of History, Logbook, Map, Climate, Light, Security, Maintenance, Media browser, and the error and `not-found` screens with a toolbar.

**At phone and desktop width.** 320-360 px phone, `both-languages` mode, or text scale 130 % and up: a title such as 'Media browser / 媒體瀏覽' or a translated name ends in three dots beside the menu button and tools, and there is no way to read the rest. Desktop: unaffected (wide titles wrap).

**Fix.** Delete the `font-size: 21px` rule at line 110 so the shared clamp applies, and in the block at 198-205 replace `white-space: nowrap; text-overflow: ellipsis` with `white-space: normal; overflow-wrap: break-word; overflow: visible` (as `hass-subpage` already does), so the title wraps to two lines instead of being cut.

**Second reviewer.** `ha-top-app-bar-fixed` lists pageHeaderStyles first and its own css second. The own rule `:host([narrow]) .main-title .page-title {font-size:21px}` has the same specificity as the clamp rule and comes later, so it wins. The nowrap and ellipsis block at lines 198-205 is also confirmed, which cuts the title with no full text reachable.

### A toast message with a long unbroken word runs out of the toast surface

`frontend/src/components/ha-toast.ts:454`, clip, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (rule 4)`

**What happens.** `.message` is `flex: 1; min-width: 0` with no `overflow-wrap`. In the stacked layout used by `notification-manager`, `.toast.stacked` sets `overflow: visible; background-color: transparent` (about 396-404) and the dark surface is a `::before` sized to the box. Because `min-width` is 0, the message shrinks to the room left beside the buttons and a word with no break opportunity (an entity id such as `sensor.living_room_temperature_battery_level`, a URL, a service name with underscores) is painted past the right edge of the dark surface. The text colour is the light `on-neutral` colour, so beyond the surface it is light text on the page background.

**At phone and desktop width.** 390 px phone: a failure toast such as 'Failed to call `light.turn_on` for `light.kitchen_ceiling_spots_left'` leaves its last characters outside the dark pill, unreadable, and under the Undo or close button. Desktop: the same on a long id in a 350-560 px toast.

**Fix.** Add `overflow-wrap:anywhere` to .message. The `max-height` and scroll part is optional.

**Second reviewer.** `ha-toast.ts` has no `overflow-wrap` or `word-break` anywhere. .message has `min-width` 0, and the stacked toast paints its surface as a ::before with overflow visible, so an unbroken token spills outside the dark surface.

### Pages sheet and the closed-page undo toast ignore the on-screen keyboard

`frontend/src/components/phone/ha-phone-bar.ts:2588`, scroll, confidence low, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (PickerPopover: the sheet shrinks to the space above the keyboard)`

**What happens.** The bar itself rises with `--ha-phone-viewport-inset-bottom` (line 2455) and hides while a keyboard is up (_handleViewport, 577-600). #sheet (bottom at 2592-2597, `max-height` at 2601) and .toast (bottom at 2564-2567) use only `--ha-phone-bar-room` plus the safe area. The viewport meta has no `interactive-widget` setting, so on Android and iOS the keyboard overlays fixed content. With the Search pages field focused inside the sheet, the sheet stays 76 px above the layout bottom and its lower part, including the `open-page` cards, sits behind the keyboard. `max-height` uses 100dvh, which does not shrink for the keyboard either. The undo toast stays hidden behind the keyboard the same way.

**At phone and desktop width.** 390x667 phone: tap the sheet search, the keyboard covers everything below the search row, so typed matches cannot be seen or tapped without closing the keyboard. Desktop: not reachable.

**Fix.** Add `var(--ha-phone-viewport-inset-bottom`, 0px) to the bottom of #sheet and .toast, and subtract it in the #sheet `max-height` calc.

**Second reviewer.** Focusing the sheet search hides the bar, but `--ha-phone-bar-room` is not changed. #sheet and .toast are positioned only with `bar-room` and the safe area, and only the bar itself adds `--ha-phone-viewport-inset-bottom`. In the default resize mode the fixed sheet stays behind the keyboard.

### Not-found page content has only 16 px padding, so its buttons sit under the bottom bar and the tab strip

`frontend/src/layouts/hass-not-found-screen.ts:68`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (ShellErrorScreen: its end clears the bottom bar)`

**What happens.** `hass-router-page` appends `hass-not-found-screen` straight into the panel area (createNotFoundScreen, `hass-router-page.ts` 360-365), outside any `hass-subpage` or top app bar that would add the safe area. Its `.content` (62-70) is `min-height: 100%` with `padding: var(--ha-space-4)` only. On a phone the floating bar covers the bottom 76 px plus its gap, and on a wide window the page tab strip and pane gap cover the top. With `safe center` the card starts at the top edge of the panel, and the `hass-error-screen` without a toolbar (`hass-error-screen.ts:118`, `padding: 16px`) has the same gap. Nothing adds `--safe-area-inset-top` or `--safe-area-inset-bottom`.

**At phone and desktop width.** 390x667 phone with large text or `both-languages` mode: the card is taller than the visible area, scrolls, and its Go home and Search pages buttons end up behind the phone bar even when scrolled to the end. Desktop: with the strip on top the card's heading can sit under the tab strip in a short window.

**Fix.** Change the padding at line 68 to `padding: calc(var(--ha-space-4) + var(--safe-area-inset-top, 0px)) var(--ha-space-4) calc(var(--ha-space-4) + var(--safe-area-inset-bottom, 0px));` and the same on `hass-error-screen.ts` line 118.

**Second reviewer.** The `not-found` screen is created straight inside the panel area and its .content has only 16px padding. The main layout says pages and panels read `--safe-area-inset-top` and -bottom themselves (strip height, phone bar), and this screen does not. The error screen at line 118 has the same flaw.

### The create button sits in the same place as the toast stack, so a toast hides it

`frontend/src/layouts/hass-subpage.ts:585`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (ShellListToast)`

**What happens.** On a phone #fab is placed at `bottom: calc(16px + var(--safe-area-inset-bottom))` (`hass-subpage.ts` 585, `hass-tabs-subpage.ts` 1179). That safe area already holds the 76 px phone bar. The toast stack (`notification-manager.ts` styles) is placed at `safe-bottom + 16px + --ha-toast-bottom-bar-height` which is the same 92 px, centred and as wide as the screen minus 32 px on a phone, and it is a `top-layer` popover, so it paints above the button. The pages reserve scroll room for the toast (`--ha-toast-reserved-height`) but nothing lifts the fab. Warnings and errors have no timeout, so the covered button stays covered until the toast is dismissed. The 46 canvas note says this is 'as it does today', but it blocks the page's main action.

**At phone and desktop width.** 390 px phone: after a failed save or a Reconnecting notice, Create automation / Add device / Add helper is under the toast and cannot be tapped until the toast is closed. Desktop: unaffected, toasts are centred and the button is at the end.

**Fix.** Add `var(--ha-toast-reserved-height`, 0px) to the narrow bottom of #fab in `hass-subpage.ts` and `hass-tabs-subpage.ts` (line 1179). Check the pill dock in `hass-tabs-subpage-data-table.ts` separately, since that line was not verified.

**Second reviewer.** #fab is at 16px plus the `safe-area` bottom. The toast stack sits at about the same height (16px plus the bar height) and is a `top-layer` popover, so it paints over the button. Content padding reserves toast room but the fab is not lifted.

### The 'page closed, Undo' toast is drawn at the same spot as the notification toast stack

`frontend/src/components/phone/ha-phone-bar.ts:2560`, clip, confidence low, board reference `design/canvases/42-modern-polish-2/README.md (rule 3)`

**What happens.** The phone bar's own .toast (853-865) is a fixed element with `bottom: bar-room + 12px + safe-bottom` and no popover, so it is in the normal layer. `notification-manager's` stack is a `top-layer` popover (popover manual) placed at about the same height (`safe-bottom + 16px + phone bar height`). When both are showing, the stack covers the undo toast entirely and the Undo button cannot be pressed. The undo toast also does not set `--ha-toast-reserved-height`, so the page behind it is not given room to scroll clear. It also uses a 24 px radius, a `hard-coded` `0 4px 8px 3px rgba(0,0,0,0.15)` shadow and `primary-text` colours, a different shape from `ha-toast` (small radius, neutral surface).

**At phone and desktop width.** 390 px phone: close a page from the Pages sheet while a notification is showing, the Undo toast is hidden behind it for the notification's lifetime. With no other toast, the last row of the page behind sits under the undo toast.

**Fix.** The smaller change is to lift the undo toast above an active stack with `var(--ha-toast-reserved-height`, 0px). Routing Undo through the notification manager is a larger refactor and not required.

**Second reviewer.** The phone bar's .toast is a fixed `z-index` 8 element at `bar-room` plus 12px. The notification stack is a `top-layer` popover at about the same height, so it covers the Undo toast. The `hard-coded` shadow and 2xl radius are also visible.

### The sheet's grabber pill is styled by the page-card drag handle rule, so it is off centre and shows a grab cursor

`frontend/src/components/phone/ha-phone-bar.ts:2946`, modernize, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (PickerPopover: sheet with a centred grabber)`

**What happens.** The Pages sheet grabber is `<div class="handle" aria-hidden>` (line 949), styled at 2624-2630 with `align-self: center`. The reorder button inside each page card is `class="card-tool handle"` (line 1576) and its rule at 2946-2950 is also `.handle { touch-action: none; cursor: grab; margin-inline-end: auto; }`. The later rule applies to the grabber as well. In a column flex container an auto margin on the cross axis overrides `align-self`, so the 36x4 pill is pushed to the start edge instead of the middle. It also gets `cursor: grab` and `touch-action: none` although nothing can be dragged, and the `@queryAll(".handle")` at line 348 collects it with the real handles.

**At phone and desktop width.** Phone: the grabber at the top of the Pages sheet sits at the left edge of the sheet instead of centred, and swipe starts on it do not scroll the page behind. Desktop: not reachable.

**Fix.** Rename the sheet pill to `.grabber` (line 949 and the rule at 2624), or scope the second rule to `.card-tool.handle` at line 2946; update the queryAll if it must keep only the card handles.

**Second reviewer.** The grabber div (line 949) and the card reorder button (line 1576) both use class handle in one shadow root. The later rule at 2946 adds `margin-inline-end:auto`, `cursor:grab` and `touch-action:none` to the grabber. In a column flex the auto margin beats `align-self:center`, so the pill sits at the start edge.

### Toolbar chips, header buttons and Pages sheet controls are 44 px on touch, the boards say 48 px

`frontend/src/layouts/hass-tabs-subpage-data-table.ts:2783`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (rule 6)`

**What happens.** The boards agree on 'every target is 48 px or taller, or has a hit area that is' (canvas 42 rule 6, canvas 46 raises the pill buttons to 48). In the shell: list toolbar chips and the chips a page puts beside the search are `--ha-button-height: 44px` and `min-height: 44px` under `@media (pointer: coarse)` (`hass-tabs-subpage-data-table.ts` 2780-2792) and again for `.narrow-header-row` chips (2635); the phone header menu and back buttons are 44 x 44 (`ha-top-app-bar-fixed.ts` 115-117, same in `common/motion/page-entry.ts` 243-247); the Pages sheet has `.round`, `.card-tool` (44 x 44, `ha-phone-bar.ts` 2411, 2942), `.text-button`, `.group-toggle` and `.entry` rows at `min-height: 44px` (2647, 2860, 2986).

**At phone and desktop width.** 390 px phone: the Filters, Domain, Area chips, the menu or back button and the card tools of the Pages sheet are 4 px short of the 48 px target the design uses, and sit close together, so they are easy to `mis-tap`.

**Fix.** Set 48 px in those declarations: `--ha-button-height: 48px; min-width: 48px; min-height: 48px` at `hass-tabs-subpage-data-table.ts` 2635, 2783-2790; `width/height/--mdc-icon-button-size: 48px` at `ha-top-app-bar-fixed.ts` 115-117 (and `page-entry.ts`); and `44px` to `48px` for the listed `ha-phone-bar.ts` rules.

**Second reviewer.** The 44px values are confirmed in `hass-tabs-subpage-data-table.ts` (2635, 2783-2790), `ha-top-app-bar-fixed.ts` (115-117) and `ha-phone-bar.ts` (2411, 2647, 2860, 2942, 2986). Canvas 42 rule 6 says every target is 48px or taller.

### Notification and update count badge on the rail icon is about 9 px text at a fixed position

`frontend/src/components/ha-sidebar.ts:1287`, modernize, confidence low, board reference `design/canvases/42-modern-polish-2/README.md (rule 4, readable text)`

**What happens.** `ha-svg-icon + .badge` (1282-1289) sets `font-size: 0.65em`, which is roughly 9 px at the 14 px base, `padding: 0 var(--ha-space-1)`, `left: 30px` and `top: -4px`. That is below the 11 px floor used elsewhere for labels (the provenance stamp and the bar labels use `max(..., 11px)`), and the fixed `left: 30px` assumes the 88 px rail at scale 1: with a larger text scale the rail grows (`88px * var(--ha-font-size-scale)`) but the badge does not move with the icon. Counts of two digits are cramped in a pill of a few pixels.

**At phone and desktop width.** 390 px phone with the sidebar sheet or a desktop rail at 150 % text: the count on Notifications and Settings is hard to read and drifts off the icon corner. Desktop at 100 %: small but present.

**Fix.** Set `font-size` to `max(var(--ha-font-size-xs`, 11px), 11px) with `min-width` 16px. Keep the `left:30px` position unless it is confirmed to drift at larger text scales.

**Second reviewer.** `ha-sidebar.ts` has the badge at `font-size` 0.65em (about 9px) and a fixed `left:30px`, which is below the 11px floor the project uses for labels. The issue is small.

## Dialogs, sheets and more-info

8 held up; the first reviewer noticed 5 more that were not written up.

### Setup 'in progress' and 'loading' steps keep 100 px of side padding, so the text is squeezed into a thin column on a phone

`frontend/src/dialogs/config-flow/step-flow-progress.ts:54`, clip, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (Dialogs and sheets, DialogFlowSteps)`

**What happens.** `step-flow-progress.ts:52-56` styles .content as `padding: 50px 100px; text-align: center`, and `step-flow-loading.ts:37-41` uses the identical rule. These two steps render the integration's own description text (renderShowFormProgressDescription / renderLoadingDescription), which can be several sentences long, plus a large spinner or progress ring. The dialog already supplies its own body padding, so the 100 px comes on top of it on both sides. Every other step in the flow (form, menu, abort, external) uses the shared configFlowContentStyles with no extra side padding. The 50 px top and bottom padding also adds 100 px of dead height inside a sheet that is already scrolling.

**At phone and desktop width.** 390 px phone: the dialog body is about 340 px wide, 200 px goes to padding, leaving about 140 px for the description, so each sentence breaks every two or three words into a tall narrow strip; at 320 px it is about 70 px and long words overflow. Desktop: no visible problem because the dialog is 560 px or wider.

**Fix.** In `step-flow-progress.ts:54` and `step-flow-loading.ts:39` replace `padding: 50px 100px;` with `padding: var(--ha-space-8) var(--ha-space-4); overflow-wrap: anywhere;` and keep the existing `text-align: center`. A phone then has about 300 px of text width.

**Second reviewer.** Confirmed: `step-flow-progress.ts:54` and `step-flow-loading.ts:39` both set padding 50px 100px, and the shared configFlowContentStyles adds no override. On a phone that leaves a very narrow text column. The fix is sound.

### Shared entity-sheet selectors and chips are 44 px tall, below the 48 px touch target used everywhere else in the sheet

`frontend/src/dialogs/more-info/components/more-info-board-style.ts:55`, modernize, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (DialogEntitySheet: foot tabs, tool rows and chips are 48 px)`

**What happens.** moreInfoBoardStyle sets `.segmented button { min-height: 44px }` (line 55) and `.chip { min-height: 44px }` (line 82). Every entity control that imports it (alarm, automation, calendar, climate, configurator, default, image, vacuum and others) inherits both. The same 44 px is repeated in controls that do not import it: `more-info-water_heater.ts:264` and `more-info-humidifier.ts:273` (mode chips), `more-info-sensor.ts:412` (range chips), `more-info-time.ts:468` (hour and minute step buttons, with 80 px width), `more-info-date.ts:432-434` (day cells, `max-width` 44 px), and `more-info-media_player.ts:901` (`--ha-icon-button-size: 44px` on the volume buttons). `ha-more-info-dialog.ts:1719` already forces `--ha-button-height: 48px` for the sheet and the tabs, tools and chips in the dialog shell are 48 px, so these are the remaining small ones. The same file also `hard-codes` the legacy blue `rgba(3, 169, 244, 0.2)` fallback (line 95) and a `0 1px 3px rgba(0,0,0,0.2)` shadow (line 62) that other controls copy (`water_heater.ts:280`, `humidifier.ts:289`).

**At phone and desktop width.** 390 px phone: the climate and vacuum mode selectors, the alarm and sensor chips, the time stepper arrows and the media volume buttons are 4 px shorter than the Done, tab and tool targets right beside them, which is easy to `mis-tap` with a thumb. Desktop: slightly uneven row heights between the shell and the body.

**Fix.** Set `min-height` to 48px in `more-info-board-style.ts` (segmented button and chip), `water_heater`, humidifier, sensor and time, and set `--ha-icon-button-size` to 48px in `media_player`. For the date grid raise only `min-height` to 48px and keep `width:100%` with the existing `max-width`, so the 7-column grid cannot overflow a narrow body. Replace the rgba fallback with the token.

**Second reviewer.** Confirmed: `board-style` lines 55 and 82, plus `water_heater`, humidifier, sensor, time, date and `media_player`, are still 44px. The dialog tabs and tools were already raised to 48px in round one (`dialog.ts` lines 1818, 1885, 1952), so these are the leftovers.

### The remove badge on a favourite (light colours, cover and valve positions, timer presets) is a 20 px button

`frontend/src/dialogs/more-info/components/ha-more-info-favorites.ts:226`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md`

**What happens.** In edit mode every favourite shows a `<button class="delete">` (render lines 117-125) styled in lines 220-236 as `width: 20px; height: 20px; padding: 0; --mdc-icon-size: 12px`, placed 6 px outside the favourite's corner. It is the only way to delete a favourite. It is far under the 48 px target, its minus icon is 12 px, and it overlaps the favourite bubble's own tap area, so a thumb aimed at it often hits the bubble. The same component is used by the light colour, cover position, valve position and timer preset editors.

**At phone and desktop width.** 390 px phone: removing a saved light colour or a cover position is a fiddly 20 px tap that often selects or drags the favourite instead; the shaking animation in edit mode makes it harder still. Desktop: fine with a mouse.

**Fix.** Keep the 20 px visible badge and add a larger hit area: after the `.delete` rule add `.delete::before { content: ""; position: absolute; inset: -14px; }` so the clickable area is 48 px, and make `.delete` `position: absolute` (already is) with `z-index: 1` so it wins over the bubble. Raise the badge to 24 px and the icon to 16 px.

**Second reviewer.** Confirmed: .delete is 20x20 with a 12px icon, and the delete button is the only way to remove a favourite in edit mode. The hit area is far under 48px. Because the button follows the item in the DOM, an enlarged ::before will win over the bubble.

### Details rows (tap to copy) are 40 px and Related rows are 44 px tall

`frontend/src/dialogs/more-info/ha-more-info-details.ts:318`, modernize, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (DialogEntitySheet)`

**What happens.** `ha-more-info-details.ts:316-321` sets `--ha-row-item-min-height: 40px` with `--ha-row-item-padding-block: var(--ha-space-2)` on every `ha-list-item-button`. Each of those rows is a button that copies its value (line 215, @`click=$`{`this._copyValue`}). `ha-more-info-related.ts:266-271` does the same with 44 px, and each of its rows is a link that navigates to another entity, device or area. The sheet's tabs, tools and chips beside them are 48 px.

**At phone and desktop width.** 390 px phone: scrolling the Details tab with a thumb and tapping a row to copy an id or a value often hits the neighbouring row, because rows are 40 px apart; Related rows are 44 px. Desktop: denser than the rest of the sheet but still usable.

**Fix.** Set `--ha-row-item-min-height: 48px` in both files (`ha-more-info-details.ts:318` and `ha-more-info-related.ts:268`).

**Second reviewer.** Confirmed: `ha-more-info-details.ts:318` sets `--ha-row-item-min-height` 40px and `ha-more-info-related.ts:268` sets 44px on tappable rows, below the sheet's 48px.

### Foot tabs of the entity sheet cannot grow or scroll, so long or two-language labels spill over the next tab

`frontend/src/dialogs/more-info/ha-more-info-dialog.ts:1764`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (DialogEntitySheet, foot tabs)`

**What happens.** With tabs at the foot, `.tabs` is `flex-wrap: nowrap` (line 1759) and each `.tab` is `flex: 1 1 0; min-width: 0; padding: 0 var(--ha-space-1)` (lines 1764-1768) with no overflow rule. In `both-language` mode renderStackedLabel renders `.stacked-label { white-space: nowrap }` (`common/language-mode/stacked-label.ts:64-72`), so a label such as a long word plus its translation cannot shrink or wrap. A sheet shows up to five tabs (Details, History, Settings, Related and others). Once a label is wider than its share of the row, `min-width: 0` lets the pill shrink under its own text and the label paints over the neighbouring tab, with nothing to scroll.

**At phone and desktop width.** 390 px phone, bilingual mode or a long translation: with five tabs each pill is about 62 px wide, so a label such as 'Attributes / Attribute' is cut or overlaps the next pill and the `active-tab` highlight no longer matches its text. At 320 px it affects most languages. Desktop: not visible, the sheet is wide.

**Fix.** In the `tabs-at-foot` rules add `overflow-x`: auto and `scrollbar-width`: none to .tabs, and change .tab to flex: 1 0 auto with `min-width`: 48px.

**Second reviewer.** Confirmed: foot tabs use flex: 1 1 0 with `min-width`: 0 and nowrap, and the stacked label is `white-space`: nowrap. A long or bilingual label overflows into the neighbouring tab. Round one only raised tab height and did not touch this.

### Vacuum 'Cleaning by area' button has a fixed 48 px height with clipped, ellipsised text and a stock look

`frontend/src/dialogs/more-info/controls/more-info-vacuum.ts:559`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (rules on text that must stay readable)`

**What happens.** `.clean-areas-button` (lines 550-577) is `height: 48px; padding: 6px 10px; overflow: hidden` and holds two stacked lines (a 12 px label and a 14 px value at `line-height: 1.4`) whose paragraphs are `white-space: nowrap; text-overflow: ellipsis` (lines 611-618), with no title attribute. The text already uses all 48 px at default size, so any text scaling or a bilingual second line is cut vertically, and a long translation is cut horizontally with no way to read it. It also keeps the old stock treatment: `text-align: left` (not logical, wrong in `right-to-left`), a 10 px gap, a flat `--disabled-color` overlay, and an `outline: none` focus style drawn only as a 2 px `box-shadow`.

**At phone and desktop width.** 390 px phone with a larger system font or `both-language` mode: the 'Cleaning' and 'By area' lines are cut at the top or bottom of the button and a long translation ends in three dots; `right-to-left` layouts align the text to the wrong side. Desktop: fine at default size.

**Fix.** Use `min-height`: 48px and drop overflow: hidden on the button and .content. Let the paragraphs wrap with `white-space`: normal and `overflow-wrap`: anywhere. Change `text-align`: left to start. Keep the existing ::before overlay unless it breaks, since a restyle is outside the clip scope.

**Second reviewer.** Confirmed: the button is height 48px with overflow hidden. Its two lines at `line-height` 1.4 are about 36px plus 12px padding, which is already exactly 48px. Larger text or a bilingual label is cut. The p elements are nowrap with an ellipsis and `text-align` is left, not start.

### Logbook tab scrolls inside a 250 px box nested in the sheet, and its 'Show more' link is a bare text link

`frontend/src/dialogs/more-info/ha-more-info-logbook.ts:81`, scroll, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (DialogNotifications: one scroller on phones)`

**What happens.** `ha-more-info-logbook.ts:79-83` sets `--logbook-max-height: 250px` for every window wider than 450 px and taller than 500 px (it is only unset in the narrow rule at lines 84-88). On a tablet, a large phone in landscape or a desktop, the logbook is therefore a second scroller inside the sheet's own `.content { overflow: auto }`, so the wheel or a swipe over the list scrolls the 250 px box while the rest of the sheet (history above, tabs below) needs the pointer to be moved off it. The 'Show more' link (render lines 45-47) and the history equivalent (`ha-more-info-history.ts:297-300`) are plain inline `<a>` elements about 18 px tall with only a colour rule, and the header rows (`.header`) have no minimum height.

**At phone and desktop width.** Tablet or landscape phone 768 px wide: the last 250 px of the logbook trap the scroll gesture and the link to the full logbook is a thin text link that is hard to hit with a finger. 390 px phone: link only. Desktop: nested scrollbar.

**Fix.** Keep `--logbook-max-height` as it is. Only add .header > a { display: `inline-flex`; `align-items`: center; `min-height`: 48px; } in `ha-more-info-logbook.ts` and the matching header link rule in `ha-more-info-history.ts`.

**Second reviewer.** Only the `link-target` half is real. The 250px logbook cap is already removed for widths up to 450px or heights up to 500px, which covers portrait and landscape phones, so a phone does not get a nested scroll trap. On wider screens the cap is intentional. The 'Show more' links are plain text about 18px tall.

### Assist chat in the entity sheet forces 400 px of height, which is taller than the sheet in landscape

`frontend/src/dialogs/more-info/controls/more-info-conversation.ts:117`, scroll, confidence low, board reference `design/canvases/42-modern-polish-2/README.md`

**What happens.** `ha-assist-chat { flex: 1; min-height: 400px }` (lines 114-118) sits inside the sheet's `.content` scroller (`ha-more-info-dialog.ts:1696-1706`). The sheet's height is `100dvh - max(safe-area-top, 48px)`, minus the 79 px header and the 60 px foot tabs. In a landscape phone (about 390 px tall) the chat's 400 px minimum is taller than the whole sheet, so the chat is a nested scroller whose message box and text input sit below the fold of the outer scroller.

**At phone and desktop width.** Landscape 844 x 390 phone: opening a conversation entity shows the chat header and the first message only; the text input is below the fold and the user has to scroll the sheet, then scroll inside the chat. Portrait 390 x 844: fine.

**Fix.** Use `min-height`: `min(400px`, 60dvh) as proposed.

**Second reviewer.** Confirmed: `ha-assist-chat` has `min-height` 400px, which is taller than the usable sheet area on a landscape phone about 390px tall. The text input then sits below the fold and the sheet scrolls around a nested chat scroller.

## Pickers, menus, lists and data tables

7 held up; the first reviewer noticed 4 more that were not written up.

### Quick-control state value is cut at 16ch with no way to read it

`frontend/src/components/entity/ha-entity-quick-controls.ts:632`, clip, confidence high

**What happens.** `.value` (lines 626-633) is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 16ch`. The span rendered in _renderMain (formatEntityState output, lines ~168 and ~203) has no `title`. Long formatted states (weather conditions, media titles, enum sensors, 'Partly cloudy', localised text) end in an ellipsis and nothing exposes the rest.

**At phone and desktop width.** At 390 px a table row or `quick-controls` strip shows `e.g`. 'Partly `clou...'` and a person cannot read the full state without opening `more-info`; on desktop hover shows nothing either.

**Fix.** Add `title=${formattedState}` to both `<span class="value">` renders, and raise `max-width` to `min(24ch, 40vw)` (or let it wrap to two lines with `line-clamp`) so common states fit.

**Second reviewer.** Confirmed at `ha-entity-quick-controls.ts:626-633`: .value is `nowrap/ellipsis` with `max-width` 16ch, and both span renders (main and `slider-only` branch) lack a title. The component is used in `quick-bar`, tables and `area/device` pages. Not in survey46.

### Object selector rows truncate label and description with no tooltip or wrap

`frontend/src/components/ha-selector/ha-selector-object.ts:738`, clip, confidence high

**What happens.** Lines 738-742 force `ha-list-item-base .label, .description` to `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. The label is the ' · '-joined field values (lines ~296-300) and the description is another formatted field (lines ~302-311). The divs at lines 316-330 carry no title attribute. Items such as `action/condition/service-data` entries are routinely longer than one line.

**At phone and desktop width.** At 390 px (and in narrow dialogs on desktop) each object row, with two end icon buttons taking ~96 px, shows only a few words followed by an ellipsis; the cut text cannot be read except by opening the editor.

**Fix.** Allow the label to wrap to two lines (`display:-webkit-box; -webkit-line-clamp:2; white-space:normal; overflow-wrap:anywhere`) and add `title=${label}` / `title=${description}` on the two slotted divs.

**Second reviewer.** Confirmed at `ha-selector-object.ts:738-742`: label and description are `nowrap/ellipsis`, and the slotted divs at ~316-330 have no title. No ancestor wraps them. Not in survey46.

### Customize-columns dialog still uses legacy ha-list-item with a 24 px drag handle

`frontend/src/components/data-table/dialog-data-table-settings.ts:333`, modernize, confidence medium

**What happens.** The dialog renders `<ha-list><ha-list-item graphic="icon" noninteractive hasMeta>` (lines 159-191) styled with `--mdc-list-side-padding: 12px; overflow: visible` (line 333). The drag handle is a bare 24 px `ha-svg-icon` in the graphic slot, and the visibility `ha-icon-button` is pulled in with `margin: -12px` (line ~345) so its box is only 24 px of layout. The filter panes already moved to `ha-list-item-option` / `ha-list-selectable`.

**At phone and desktop width.** At 390 px reordering columns by touch means dragging a 24 px icon; long column titles are cut by the legacy item with no title, and the eye toggle sits tight against the edge.

**Fix.** Rebuild rows with `ha-list-item-base` (as `ha-selector-object` does) with a 48 px handle target (padding 12 px) and the eye button in the end slot at normal size; drop the -12px margin hack and add `title` to the headline.

**Second reviewer.** Confirmed: `dialog-data-table-settings.ts` uses legacy `ha-list/ha-list-item` with a bare 24px `ha-svg-icon` handle, plus the `margin:-12px` `icon-button` hack at ~line 350. Low severity modernization. Not in survey46. Rebuilding with `ha-list-item-base` is a reasonable fix, but the handle needs a real 48px hit area.

### Clickable label chips and the +N overflow trigger in rows are 20 px tall

`frontend/src/components/data-table/ha-data-table-labels.ts:233`, modernize, confidence medium

**What happens.** Host is `height: 22px` (line 233) and every chip is `<ha-label dense>`, whose host height is 20 px (`ha-label.ts` line 134). Chips get `role=button/tabindex=0` when `clickable` (lines 189-193) and the '+N' dropdown trigger is the same dense label. There is no enlarged hit area, unlike `ha-filter-pane-chip` and `ha-entity-quick-row-actions` which add 44-48 px invisible areas.

**At phone and desktop width.** On a 390 px row card, tapping a label to filter by it, or the +N menu, needs a 20 px target; neighbouring `row-open` taps are easy to hit by mistake.

**Fix.** Add an ::after `hit-area` (`position:relative`; `inset:-14px` -4px) to the clickable `ha-label` and the +N trigger inside `ha-data-table-labels`, or use the `non-dense` label under (pointer: coarse). Note that the viewport has `overflow:hidden` and height 22px, so an overhanging ::after may be clipped. Verify, or enlarge the row padding instead.

**Second reviewer.** Confirmed: `ha-label` dense is 20px (`ha-label.ts:134`) and the clickable chips and +N trigger have no enlarged hit area. On phones, `ha-script-picker` passes `clickable` unconditionally, so the small target is live there. `ha-automation-picker` already sets clickable=!narrow, so it is unaffected on phones. The +N trigger is also affected in both pickers. Medium severity.

### Slider-mode number input is fixed at 40 px wide

`frontend/src/components/ha-selector/ha-selector-number.ts:187`, clip, confidence medium

**What happens.** `ha-input::part(wa-input) { width: 40px }` (lines 187-189) sets the native input width next to the slider; the unit is added in `slot=end` (render, ~line 150) and spinners are removed (`withoutSpinButtons`). Values such as 1000, -273.15, 22.5 or a range like 0-65535 need 5-7 characters.

**At phone and desktop width.** At 390 px and on desktop the typed value is clipped inside the field (`e.g`. '-27' for -273.15), so a person cannot check what they entered; the slider takes the rest of the row.

**Fix.** Use `min-width:40px` with a `content-based` width, for example `width:9ch` with `max-width:40%`, since only the input part is sized and the unit is in a separate end slot.

**Second reviewer.** Confirmed at `ha-selector-number.ts:187-189`: `ha-input::part(wa-input`){`width:40px`} applies in slider mode (!isBox) and is not overridden. Values longer than ~3-4 characters will clip. Not in survey46.

### Name and state-content pickers keep MDC field look with hard-coded black line, whitesmoke and a broken focus transition

`frontend/src/components/entity/ha-entity-name-picker.ts:652`, modernize, confidence medium

**What happens.** `.field` (lines 649-659) uses `var(--mdc-text-field-fill-color, whitesmoke)`, the underline uses `rgba(0,0,0,0.42)` fallbacks (lines 668-678) and `--mdc-theme-primary` (line 683); the focus animation is written `transform: height 180ms ...` (line 671), which is invalid so the 1 px to 2 px change snaps. `ha-entity-state-content-picker.ts` has the identical block at lines 521-552. The restore icon button is 36 px (`.restore`, line ~696) with no larger hit area. Round one flagged the same typo only in `ha-picker-field.ts`.

**At phone and desktop width.** In dark themes the field can show a light grey slab and a black underline that is barely visible; the button to restore the default name is a 36 px target at 390 px.

**Fix.** Replace with tokens already used by `ha-picker-field` (`--ha-color-fill-neutral-quiet-resting`, `--ha-color-border-neutral-normal`, `--primary-color`), change `transform:` to `transition:`, and give `.restore` a 48 px hit area; apply to both files.

**Second reviewer.** Confirmed in `ha-entity-name-picker.ts:649-683` (whitesmoke fallback, `rgba(0`,0,0,.42) underline, `--mdc-theme-primary`, invalid `transform: height ...` transition, .restore 36px). The identical block also exists in `ha-entity-state-content-picker.ts` (~lines 522-548). Both are used from selectors. Not in survey46, which only covered `ha-picker-field`.

### Statistics picker label spacing uses an invalid margin-bottom declaration

`frontend/src/components/entity/ha-statistics-picker.ts:194`, modernize, confidence high

**What happens.** `label { display:block; margin-bottom: 0 0 8px; }` (lines 192-195) is invalid CSS (`margin-bottom` takes one value) so it is dropped; the label sits directly on the first picker, and `ha-statistic-picker` uses a hard 8px top margin (line 190) instead of the space tokens used by `ha-entities-picker's` neighbours.

**At phone and desktop width.** On the `energy/statistics` settings forms the label touches the first field at 390 px and desktop, unlike other `multi-pickers` (`ha-entity-state-content-picker` uses `margin: 0 0 var(--ha-space-2)`).

**Fix.** Use `margin: 0 0 var(--ha-space-2)` for label and `margin-top: var(--ha-space-2)` for the pickers.

**Second reviewer.** Confirmed at `ha-statistics-picker.ts:192-195`: `margin-bottom: 0 0 8px` is invalid CSS and is dropped. The label renders when a label is set, via `ha-selector-statistic`. Cosmetic only, but valid and the fix is trivial.

## Settings pages

8 held up; the first reviewer noticed 6 more that were not written up.

### Person names are cut to one line with an ellipsis and no way to read them

`frontend/src/panels/config/person/ha-config-person.ts:527`, clip, confidence high

**What happens.** .name is nowrap + overflow hidden + `text-overflow` ellipsis at xl size (markup at line 258) with no title attribute and no wrap. The row card has no tap target that reveals the name, so a long full name is lost.

**At phone and desktop width.** At 390 px the card also holds an avatar and an edit button, so a name over about 16 characters ends in an ellipsis that cannot be read anywhere. On desktop the card is narrow in a grid and long names cut too.

**Fix.** Add `title=$`{`person.name`} on the .name span and let it wrap to two lines (`display:-webkit-box`; -`webkit-line-clamp:2`) instead of nowrap.

**Second reviewer.** Confirmed: .name is `nowrap/ellipsis` at xl size, span at line 258 has no title, and no other place shows the full name on the card.

### Role names are cut to one line with no tooltip

`frontend/src/panels/config/roles/ha-config-roles.ts:579`, clip, confidence high

**What happens.** .name is nowrap + ellipsis (markup at line 192) inside a flex .text with `min-width` 0. No title attribute, no wrap, so long role names cannot be read.

**At phone and desktop width.** At 390 px the tile, people count and any row actions leave about 150 px, so most custom role names truncate with no way to see the rest. Same on narrow desktop cards.

**Fix.** Add `title=$`{`role.name`} to the span and allow `two-line` wrapping with a line clamp.

**Second reviewer.** Confirmed: .name nowrap + ellipsis (line 579) with markup at line 192 and no title attribute.

### Network mount address (server and share path) is truncated with no tooltip

`frontend/src/panels/config/storage/ha-config-section-storage.ts:696`, clip, confidence high

**What happens.** `.mount-address` is nowrap + ellipsis (used at line 403) and shows `supervisorMountDescription(mount`), `i.e`. host plus share path. There is no title attribute and no wrap, and it is the only place the address is shown on the row.

**At phone and desktop width.** At 390 px a path like //`nas.local/backups/home-assistant` is cut `mid-share`, so a person cannot tell which of several mounts to remove or fix. On desktop long NFS paths also cut.

**Fix.** Add `title=$`{`supervisorMountDescription(mount`)} and allow wrapping with `overflow-wrap:anywhere` (a `two-line` clamp is fine).

**Second reviewer.** Confirmed: `.mount-address` is nowrap + ellipsis (line 696), used at line 403 with no title, and it is the only place the address shows on the row.

### Discovered and add-integration card names cut to one line with no tooltip

`frontend/src/panels/config/integrations/ha-integration-action-card.ts:84`, clip, confidence high

**What happens.** h3 (rendered at line 50 from `this.label`) is nowrap + overflow hidden + ellipsis with `max-width` 100%, with no title attribute. Used for every `discovered-device` and action card via `ha-config-flow-card`.

**At phone and desktop width.** On a `two-column` phone grid (about 170 px per card) names like Philips Hue Bridge - Living Room are cut and cannot be read; desktop cards cut long discovered device names too.

**Fix.** Add `title=$`{`this.label`} on the h3 and clamp to two lines (`white-space:normal`; `display:-webkit-box`; -`webkit-line-clamp:2`).

**Second reviewer.** Confirmed: h3 is nowrap + ellipsis (line 84) with no title, rendered at line 50 from `this.label`.

### Expose-entity list is sized from 100vh, so its last rows sit under the phone browser bar

`frontend/src/panels/config/voice-assistants/dialog-expose-entity.ts:319`, scroll, confidence high

**What happens.** In the narrow media query the `lit-virtualizer` height is `calc(100vh` - 210px - safe insets). 100vh on a phone is the tall viewport that includes the area behind the collapsing browser bars, and no dvh fallback is declared. The dialog footer buttons are outside the list, so the list is taller than the space left.

**At phone and desktop width.** At 390 px in a mobile browser the bottom of the entity list and the footer's Expose button are partly hidden by the browser toolbar, and the last rows cannot be scrolled into view.

**Fix.** Keep the 100vh declaration, then add a second declaration with 100dvh in place of 100vh.

**Second reviewer.** Confirmed: the narrow media query sizes `lit-virtualizer` with `calc(100vh` - 210px ...) and no dvh fallback. The dialog is `ha-dialog`, which already uses 100dvh elsewhere, so 100dvh is supported.

### Helper type picker list uses 100vh on phones with no dynamic-viewport fallback

`frontend/src/panels/config/helpers/dialog-helper-detail.ts:514`, scroll, confidence medium

**What happens.** Under `max-width` 450px / `max-height` 500px the `ha-list` height is `calc(100vh` - 184px - `safe-area` insets). The same dialog uses fixed `calc(60vh` - 184px) on larger screens at line 504, which goes negative or tiny on short landscape windows before the media query catches it.

**At phone and desktop width.** On a phone browser the bottom helper types (the last entries of the list) are covered by the browser bar and unreachable until the bar collapses; in short desktop windows between 500 and 700 px high the list is only a few rows tall.

**Fix.** Only add a 100dvh declaration after the 100vh one in the narrow media query. Leave the desktop `calc(60vh` - 184px) unchanged.

**Second reviewer.** Confirmed: the narrow media query uses `calc(100vh` - 184px ...) with no dvh fallback. The desktop part of the proposed fix is unnecessary because the `max-height:500px` query already catches short windows.

### Logs dialog sizes the log box from 100vh

`frontend/src/panels/config/logs/dialog-logs.ts:120`, scroll, confidence high

**What happens.** `--error-log-card-height` is `max(80px`, `calc(100vh` - 320px)) and `calc(100vh` - 368px) with the alert. This is the dialog's own override of the card height, separate from the `page-level` box already reported in `error-log-card.ts`, and has no dvh fallback.

**At phone and desktop width.** At 390 px in a mobile browser the newest log lines (the end of the box) start below the browser toolbar, so the lines a person opens the dialog to read are out of reach until the bar collapses.

**Fix.** Add 100dvh variants after each 100vh declaration. Also change the `error-log-card` fallback so the base value follows the same rule.

**Second reviewer.** Confirmed: `dialog-logs.ts` lines 120 and 123 set `--error-log-card-height` from 100vh. This is a separate override from the one reported in `error-log-card.ts`, so it is not a duplicate of the survey46 entry.

### Automation search bar panel is capped by 100vh minus a fixed 160px

`frontend/src/panels/config/automation/search/ha-automation-search-bar.ts:563`, scroll, confidence medium

**What happens.** .bar has `max-height` `calc(100vh` - 160px) and `overflow-y` auto, with the filter chips and results below it. When the phone keyboard opens, 100vh does not shrink, so the capped height still extends under the keyboard and the browser bar.

**At phone and desktop width.** At 390 px the search field, filters and bottom results are partly hidden behind the keyboard and the lowest filter chips cannot be reached while typing.

**Fix.** Add `max-height`: `calc(100dvh` - 160px) after the existing 100vh declaration.

**Second reviewer.** Confirmed: .bar has `max-height` `calc(100vh` - 160px) with `overflow-y:auto` at line 563, and 100vh ignores the collapsing browser bar and the keyboard. It is medium severity.

## Dashboards and cards

8 held up; the first reviewer noticed 5 more that were not written up.

### Narrow media card: pause and stop buttons keep 40 px because the selector list is missing a comma

`frontend/src/panels/lovelace/cards/hui-media-control-card.ts:845`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (touch targets 48 px)`

**What happens.** Lines 843-848 read `.narrow ha-icon-button[action="media_play"], .narrow ha-icon-button[action="media_play_pause"], .narrow ha-icon-button[action="media_pause"] .narrow ha-icon-button[action="media_stop"]`. There is no comma after the `media_pause` line, so the last two parts merge into one descendant selector that can never match. In narrow mode play and `play_pause` get 50 px while pause and stop stay at the 40 px set at 838-841, which is under the 48 px touch target and visibly smaller than the play button they replace when playback toggles. The wide rule at 748-758 has the same 44 px base for the secondary controls.

**At phone and desktop width.** 390 px phone: when media plays, the main button shrinks from 50 px to 40 px as it flips from play to pause, and stop is 40 px. Desktop: wide layout is unaffected.

**Fix.** Add the missing comma after `.narrow ha-icon-button[action="media_pause"]` (line 845-846) and format the list as four separate selectors. Raise the base `.narrow ha-icon-button` size at 838 from 40px to 48px.

**Second reviewer.** Confirmed at `hui-media-control-card.ts` 843-848: no comma after the `media_pause` selector, so `media_pause` and `media_stop` merge into a dead descendant selector and stay at the 40px base set at 838-841. Not covered in round one.

### Dashboard view ends under the phone toast strip and dim sum card because only safe-area is reserved

`frontend/src/panels/lovelace/hui-root.ts:2363`, scroll, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (rule 3: the end of a page clears every fixed or floating thing)`

**What happens.** `hui-view-container` (2346-2366) pads its end with `--view-container-inset-bottom` (the `safe-area` inset) plus `--view-container-padding-bottom`, which is only set by the card selection bar. Unlike `hass-subpage` (558-566) and `ha-top-app-bar-fixed` (296-300), it never adds `--ha-toast-reserved-height` or `--ha-dim-sum-reserved-height`. The sticky view footer in `hui-view-footer.ts:208-212` also sits at `bottom: var(--row-gap)`, which is 8 px, not above the floating bottom controls.

**At phone and desktop width.** 390 px phone: while a toast or the dim sum card shows, the last card row of every dashboard, and a sticky footer card, are covered with no way to scroll them clear. Desktop: no effect, the reserves are 0.

**Fix.** In `hui-root.ts` at 2363 change `padding-bottom` to `calc(var(--view-container-inset-bottom) + var(--view-container-padding-bottom, 0px) + var(--ha-toast-reserved-height, 0px) + var(--ha-dim-sum-reserved-height, 0px))`. In `hui-view-footer.ts:210` change sticky bottom to `calc(var(--row-gap) + var(--ha-toast-reserved-height, 0px) + var(--ha-dim-sum-reserved-height, 0px))`.

**Second reviewer.** `hui-view-container` `padding-bottom` (`hui-root.ts` ~2363) has only the `safe-area` inset and `--view-container-padding-bottom`. `hui-root.ts` never references the toast or `dim-sum` `reserved-height` variables, while `ha-top-app-bar-fixed.ts:296-300` does. The sticky footer at `hui-view-footer.ts:208-212` uses bottom: `var(--row-gap`) only. Fix is sound; the footer part is lower impact.

### Starting card is a bare 100vh tall, so it runs below the visible screen on phone browsers

`frontend/src/panels/lovelace/cards/hui-starting-card.ts:64`, scroll, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md`

**What happens.** `:host { height: calc(100vh - var(--header-height)); }` uses the large viewport. It is a fixed height with no overflow handling, and its .content (68-75) centres the spinner and the description with `justify-content: center`, so with a long bilingual description the text can exceed the box and spill out of the top of the centred column.

**At phone and desktop width.** 390 px phone browser with the address bar showing: the card is 56-80 px taller than the visible area, so the centred spinner and message sit low and the page gets a stray scroll. Desktop: fine.

**Fix.** After line 64 add `height: calc(100dvh - var(--header-height));` and keep `height`, not `min-height`, because `.content { height: 100% }` needs a definite parent height; add `justify-content: safe center;` to .content.

**Second reviewer.** `hui-starting-card.ts:64` uses a bare 100vh height; `hui-root` already uses a 100dvh override for the same issue. Minor impact. Corrected fix: keep `height` (not `min-height`) so .content's `height:100%` still resolves, and add `height: calc(100dvh - var(--header-height))` after the vh line.

### Calendar, entities, heading, thermostat and humidifier titles are cut off with no way to read them

`frontend/src/panels/lovelace/cards/hui-calendar-card.ts:330`, clip, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (cut text needs a way to read it)`

**What happens.** `hui-calendar-card` .header (323-332) sets `text-overflow: ellipsis; white-space: nowrap` but no `overflow: hidden`, so there is no ellipsis at all: the long title runs under the card edge and `ha-card's` `overflow: hidden` (319) cuts it `mid-letter`. `hui-entities-card` `.card-header` .name (290-294, render at 228-240), `hui-heading-card` .heading (237-249, render at 129-133), and the .title of `hui-thermostat-card` (143) and `hui-humidifier-card` (144, style 215-229) ellipsise but have no title attribute, unlike `hui-statistic-card` (241) and `hui-entity-card` (179) which do.

**At phone and desktop width.** 390 px phone with a title such as a bilingual room name: the calendar title is chopped without an ellipsis; the other four show an ellipsis and the full text is unreadable except by editing the card. Desktop: same on narrow columns.

**Fix.** `hui-calendar-card.ts:330` add `overflow: hidden;` and render `<div class="header" .title=${this._config.title}>`. Add `.title=${...}` to the entities card .name div, the heading card `h2/h3` (lines 130 and 132), and the thermostat and humidifier `<p class="title">`.

**Second reviewer.** Confirmed: `hui-calendar-card` .header has nowrap and `text-overflow` but no `overflow:hidden` (320-330), so it clips without an ellipsis. `hui-entities-card` .name (render ~240) has no title attribute. `hui-thermostat-card` and `hui-humidifier-card` .title have no title= either. Low severity but valid.

### To-do card add button is 32 px and the reorder handle 24 px on touch

`frontend/src/panels/lovelace/cards/hui-todo-list-card.ts:1061`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (touch targets 48 px)`

**What happens.** `.addRow ha-icon-button { --ha-icon-button-size: 32px }` (1060-1062) and `.handle { height: 24px; padding: 0 4px }` (1161-1166) are the only way to add an item or drag one, and neither has a `coarse-pointer` override. The list row itself is `min-height` 40px (1097).

**At phone and desktop width.** 390 px phone: the plus button is 32 px and the drag handle is 24 px tall and about 32 px wide, so adding and reordering is a precision tap; neighbouring delete buttons are close by. Desktop: fine.

**Fix.** Add `@media (pointer: coarse) { .addRow ha-icon-button { --ha-icon-button-size: 48px; } .handle { height: 48px; display: flex; align-items: center; padding: 0 12px; } ha-check-list-item { min-height: 48px; } }` after line 1166.

**Second reviewer.** Confirmed in `hui-todo-list-card.ts`: .addRow `ha-icon-button` is 32px (1060) and .handle is 24px tall with 4px padding (1161-1166). There is no pointer: coarse rule anywhere in the file.

### To-do card shows a blank list while items load, and its empty state is bare text

`frontend/src/panels/lovelace/cards/hui-todo-list-card.ts:553`, modernize, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (empty, loading, error states)`

**What happens.** The render at 553-560 outputs `nothing` while `this._items` is undefined, so the card is just the title and add row until the websocket subscription answers. When loaded and empty it prints a plain `<p class="empty">` (556) with no icon, styled by `.empty` at 1087.

**At phone and desktop width.** 390 px phone on a slow link: the card appears empty with no sign it is loading, then jumps in height. Desktop: same.

**Fix.** Line 553: when `!this._items` render `<ha-spinner size="small">` in a centred 96 px `min-height` block. Replace the empty paragraph with a centred block holding a 32 px checklist icon in `--secondary-text-color` above the existing text.

**Second reviewer.** Render returns nothing while _items is undefined, and the empty state is a bare paragraph. Minor polish, but accurate at the cited area.

### Edit-mode menu buttons on badges and cards are 24 px and 32 px with no touch size

`frontend/src/panels/lovelace/components/hui-badge-edit-mode.ts:302`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (touch targets 48 px)`

**What happens.** `hui-badge-edit-mode` .more `ha-icon-button` is 24 px with 16 px icon (299-304), the edit pencil `ha-svg-icon` is 16 px plus 4 px padding (283-289); `hui-card-edit-mode's` menu button is 32 px (505) and edit icon 20 px plus 8 px padding (493-495). Both hang -6 to -10 px outside their box. Neither file has a `coarse-pointer` rule. The related graph card header arrows are also 24 px: `hui-history-graph-card.ts:528`, `hui-statistics-graph-card.ts:492`, `hui-logbook-card.ts:455`.

**At phone and desktop width.** 390 px phone in edit mode: the `three-dot` menu on a badge is a 24 px target, and on a card 32 px, sitting at the card corner next to the drag area; `mis-taps` open the editor instead. Desktop: fine.

**Fix.** Add `@media (pointer: coarse)` rules in `hui-badge-edit-mode.ts` and `hui-card-edit-mode.ts` raising the menu button hit area to 48px (keep the visual circle with a smaller inner icon). Verify the `graph-card` arrow line numbers before touching those files.

**Second reviewer.** Confirmed: `hui-badge-edit-mode` .more `ha-icon-button` is 24px (302) and `hui-card-edit-mode's` menu button is 32px (505). Neither file has a `coarse-pointer` rule. The `graph-card` header arrow part was not verified, so the fix should be limited to the two `edit-mode` files unless checked.

### Picture glance entity buttons are 40 px wide columns with a 12 px state line

`frontend/src/panels/lovelace/cards/hui-picture-glance-card.ts:412`, modernize, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (touch targets 48 px)`

**What happens.** `ha-icon-button` is 40 px (396), .wrapper is a fixed `width: 40px` (419-423), and the state text under it is `line-height: 12px` in `--ha-font-size-s` with nowrap ellipsis (401-410). Round one covered the row wrapping at 409; the size of the targets and the clipped state label were not covered.

**At phone and desktop width.** 390 px phone: each entity target is 40 px, under 48 px, and states such as a long bilingual value (`Unavailable` or a temperature with unit) are cut to a few letters with no tooltip.

**Fix.** Under `@media (pointer: coarse)` set `ha-icon-button` to 48px and `.wrapper { width: auto; min-width: 48px; max-width: 72px }`; set `.state { line-height: 16px }` and add a title attribute with the full state text.

**Second reviewer.** Confirmed: `ha-icon-button` is 40px (396), .wrapper is a fixed 40px wide column (419-423), and .state has `line-height` 12px with ellipsis and no title attribute (the title= at 305 is on a different element). Round one only handled the row wrapping at 409. Corrected fix: give the touch size only under pointer: coarse and make the wrapper `min-width` rather than a fixed width.

## Other panels

7 held up; the first reviewer noticed 6 more that were not written up.

### Security alert rows cut the entity name and area with an ellipsis and give no way to read the rest

`frontend/src/panels/security/components/security-alerts-editor.ts:262`, clip, confidence high, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (text cut with an ellipsis needs a way to read it)`

**What happens.** Each row is a drag handle, a 24 px state badge, the heading and description slots, a fixed `width: 118px` severity select (line 276) and a 40 px delete button, all in one flex row. The heading and description slots are `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` (lines 262-267) and the template at lines 123-128 sets no title attribute, so the name is the only flexible part and nothing exposes the full text.

**At phone and desktop width.** 390 px: after the fixed controls, handle and gaps (about 250 px) only about 100 px is left for the entity name, so most names read as a few letters and an ellipsis and two alerts can look identical. Desktop: long names are still cut inside a narrow settings card.

**Fix.** On a narrow screen (container or media query at 600 px) let the heading wrap: `white-space: normal; overflow-wrap: anywhere;` and wrap the select below the text with `flex-wrap: wrap`. Also add `title=${primary}` on the heading span and `title=${secondary}` on the description span for the wide case.

**Second reviewer.** Confirmed: heading and description slots are nowrap with ellipsis (lines 262-267), the select is a fixed 118px, and no title attribute is set. The row has little room on a phone and the full name is unreadable. The panel is reachable and takes narrow.

### Delete button and severity menu in the security alert row are under the 48 px touch target

`frontend/src/panels/security/components/security-alerts-editor.ts:273`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (touch targets are at least 48 px)`

**What happens.** `ha-icon-button { --ha-icon-button-size: 40px }` (line 272-274) sets the delete button to 40 px and `--control-select-menu-height: 42px` (line 277) sets the severity menu to 42 px. The drag handle beside them is already 48 px tall (lines 241-244), so the row mixes sizes and the two controls that change data are the smallest.

**At phone and desktop width.** 390 px: the delete button is easy to miss and the severity select is easy to hit by mistake while scrolling a list of alerts; they sit 8 px apart.

**Fix.** Set `--ha-icon-button-size: 48px` and `--control-select-menu-height: 48px`, keep the row `min-height` at 48 px, and keep the 8 px gap.

**Second reviewer.** Confirmed: `ha-icon-button` size is 40px and the select menu height is 42px, while the handle beside them is 48px. Both are under the 48px target.

### Onboarding step rail squeezes every step into an equal narrow column and breaks step names in the middle of words

`frontend/src/onboarding/ha-onboarding.ts:641`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (no horizontal overflow at 320-390 px, nothing cut)`

**What happens.** `.stepper` is `grid-template-columns: repeat(auto-fit, minmax(0, 1fr))` (lines 641-648), so with the onboarding steps each column is 1/n of the card content width. At `max-width` 450px (lines 703-708) the items turn into centred columns and `.step-name` has `overflow-wrap: anywhere` (line 693), which breaks a name at any letter when the column is too narrow. The summary line that says what was chosen is `display: none` on phones (line 706), so completed steps lose their only description.

**At phone and desktop width.** 390 px: the card content is about 310 px wide, so each step column is about 60 px and names such as Integrations or the longer translated names split `mid-word` across two or three lines; finished steps no longer show their summary. Desktop: fine.

**Fix.** In the 450px query use a `single-column` list (`grid-template-columns: 1fr`, `flex-direction: row`, `text-align: start`) or a horizontally scrolling rail with `grid-auto-flow: column; grid-auto-columns: minmax(96px, 1fr); overflow-x: auto`, and change `overflow-wrap: anywhere` to `overflow-wrap: break-word` on `.step-name`. Keep .summary visible, wrapped, in the list layout.

**Second reviewer.** Confirmed: the stepper uses equal 1fr columns, `.step-name` uses `overflow-wrap:anywhere`, and below 450px the items turn into columns and the summary is hidden. Names can break `mid-word` at 390px. The fix is plausible.

### Onboarding language picker is styled with dead legacy select variables and hard-coded greys

`frontend/src/onboarding/ha-onboarding.ts:740`, modernize, confidence high, board reference `design/canvases/42-modern-polish-2/README.md (use tokens, no legacy mwc/mdc widgets, 48 px targets)`

**What happens.** `ha-language-picker` (lines 740-754) sets `--mdc-select-fill-color`, `--mdc-select-label-ink-color: var(--primary-text-color, #212121)`, `--mdc-select-ink-color`, `--mdc-select-idle-line-color`, `--mdc-select-hover-line-color`, `--mdc-select-dropdown-icon-color` and `--mdc-shape-small: 0`. `ha-select.ts` and `ha-language-picker.ts` do not read any `--mdc-select-*` variable, so none of it applies, and the box keeps `border-radius: var(--ha-border-radius-sm)` with `overflow: hidden` and a fixed `width: 200px` and 40 px height, the stock Home Assistant look on the first screen a person sees.

**At phone and desktop width.** 390 px: a 40 px, 4 `px-radius` picker below a 28 `px-radius` card, under the 48 px touch target; the same on desktop.

**Fix.** Remove the dead `--mdc-select`-* lines and `overflow:hidden`, then set width: `min(100%`, 240px) and `border-radius`: `var(--ha-border-radius-pill`). Raise the control height through whatever the picker actually renders (check the `ha-select` or `combo-box` internals for a real height or `min-height` variable) instead of `--ha-select-height`, which nothing consumes.

**Second reviewer.** The six `--mdc-select`-* lines are mostly dead: `ha-select.ts` and `ha-language-picker.ts` do not read them, and the only reader found is `ha-combo-box-item's` label ink colour. The `overflow:hidden`, 200px width and 4px radius are real. But `--ha-select-height` is not read by any component in components/, so the suggested fix would not change the height.

### Calendar previous and next buttons are 32 px, and the month-grid day numbers are about 26 px tap targets

`frontend/src/panels/calendar/ha-full-calendar.ts:761`, modernize, confidence medium, board reference `design/canvases/42-modern-polish-2/README.md (touch targets are at least 48 px)`

**What happens.** `.prev, .next { --ha-icon-button-size: 32px }` (lines 760-763) applies to the arrows at lines 247-256 and 294-303. `.ha-fc-day-number` (lines 838-846) is a clickable number with 3 px padding and `.ha-fc-day-number-today` is 26 px tall (lines 848-857). Both are the main ways to move and to open a day.

**At phone and desktop width.** 390 px: the arrows used to change month are 32 px with 8 px of space to the Today button, and tapping a date number needs about 26 px accuracy; `mis-taps` change the month or open the wrong day.

**Fix.** Use `--ha-icon-button-size: 48px` for .prev and .next (keep the header row `flex-wrap`), and give `.ha-fc-day-number` `min-width: 32px; min-height: 32px` with `display: inline-flex; align-items: center; justify-content: center`, so the whole cell stays the 48 px target through the cell padding.

**Second reviewer.** Confirmed: .prev and .next set `--ha-icon-button-size` to 32px (lines 760-763). The month nav is a primary control and is under the 48px target on phones.

### Discover rows cut the package description to one line, and the numbers are hidden on phones with no replacement

`frontend/src/panels/marketplace/components/ha-marketplace-discover.ts:289`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (text cut with an ellipsis needs a way to read it)`

**What happens.** .description is `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` (lines 288-293) and the row carries no title attribute. Below 600 px `.numbers` is `display: none` (lines 327-330), so stars and downloads disappear instead of moving. The h3 section title (lines 223-227) is also nowrap with an ellipsis next to the See all link.

**At phone and desktop width.** 390 px: the `one-line` description is cut after about 30 characters, so a person cannot tell similar packages apart before opening each one, and has no popularity numbers to help. Desktop: long descriptions still end in an ellipsis with no hover text.

**Fix.** Use two lines: `display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; white-space: normal;` plus `title=${description}` on the element, and on narrow screens move `.numbers` under the text in the row (`flex-wrap: wrap; flex-basis: 100%`) instead of hiding it.

**Second reviewer.** Confirmed: .description is nowrap with ellipsis, the row sets no title attribute, and .numbers is `display:none` below 600px. The `round-one` survey does not cover this file.

### Logbook cause chain names are one line with an ellipsis and no title, so the cause of an event cannot be read

`frontend/src/panels/logbook/ha-logbook-chain.ts:452`, clip, confidence medium, board reference `design/canvases/46-scroll-fixes-and-polish/README.md (text cut with an ellipsis needs a way to read it)`

**What happens.** `.chain-content .name` is `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` (lines 452-457) and the spans at lines 138, 194, 264 and 299 render `${cause.name}` or `${item.name}` with no title attribute. The chain is the explanation of why something happened, and its rows are 32 px nodes plus a flexible column inside a dialog or a card. The Most active rows in `ha-logbook-stats.ts` (`.name`, lines 145-149, rendered at line 78) have the same cut with no title.

**At phone and desktop width.** 390 px: after the 32 px node and padding only about 220 px is left, so automation, script and device names such as a long automation title read as the first words and an ellipsis, and two different causes can look the same.

**Fix.** Let the name wrap to two lines (`white-space: normal; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2`) and add `title=${name}` to each .name span in `ha-logbook-chain.ts` and `ha-logbook-stats.ts`.

**Second reviewer.** Confirmed: `.chain-content` .name is nowrap with ellipsis and `ha-logbook-chain.ts` has no title attribute. Cause names are cut with no way to read the rest.
