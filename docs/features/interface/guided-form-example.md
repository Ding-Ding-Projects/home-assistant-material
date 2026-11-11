# Guided forms: worked example and practice control

State: built, not yet seen in a running build. No page uses it yet.

The information button `ha-setting-info` (see
[`information-buttons-and-starting-points.md`](information-buttons-and-starting-points.md))
explains what a setting reaches, what holds it and its default. Guided forms
also want a worked example and a place to try the rule. Two optional
properties add them. Every existing property keeps working unchanged.

## What the panel shows

- **Worked example.** A short list of pairs, each an input and the result the
  setting gives for it.
- **Try it here.** A sandbox control that behaves like the real one and
  checks the value live with the real rule. The panel says in words, above the
  control, that nothing you do there is saved and nothing is sent. A reset
  button returns the control to its starting value. The control also resets
  each time the panel opens.

## How a page supplies them

```ts
html`<ha-setting-info
  .hass=${this.hass}
  label="Session timeout"
  description="How long a sign-in lasts without activity."
  .example=${[
    { input: "30", result: "Signed out after 30 minutes of no activity." },
    { input: "500", result: "Pulled down to the highest value, 240." },
  ]}
  .practise=${{ type: "number", min: 5, max: 240, step: 5, initial: 30, unit: "min" }}
></ha-setting-info>`;
```

All text a page passes (`label`, `example` rows, `unit`, `placeholder`) is
already localized by the page. The messages the sandbox shows are localized by
the component under `ui.components.setting_info.practise_msg_*`.

### `example`

An array of `{ input, result }`. A row missing either part is not shown.

### `practise`

One of three specs, all in `practise-logic.ts`:

| `type` | Fields | Real rule it follows |
| --- | --- | --- |
| `switch` | `initial` | On or off. |
| `number` | `min`, `max`, `step`, `initial`, `unit` | Text that is not a number is refused. A value outside the range is pulled to the nearest end and the message names which end. A value between steps moves to the nearest step. |
| `text` | `rule`, `initial`, `placeholder` | `{ kind: "pattern", pattern, flags }` must match the whole value; `{ kind: "length", min, max }` counts characters. Empty text is refused first. A rule that is not a valid expression is reported, never silently accepted. |

The number control is a `ha-slider` with a `ha-input` beside it, so a person
can drag or type. The switch is a `ha-switch` and the text control is a
`ha-input`. No native control is used.

## Keyboard

The button opens the panel with Enter or Space. While it is open, Tab and
Shift+Tab stay inside the panel. Escape and the close button close it and put
the focus back on the information button. A click or focus outside also
closes it, without moving the focus.

## Nothing is saved or sent

`practise-logic.ts` is made of pure functions. It reads and writes no storage
and makes no network or Home Assistant call, and the component does not either.
The test `test/components/setting-info/practise-logic.test.ts` spies on
storage, `fetch` and `sendBeacon` and asserts none is called.

## Files

- `frontend/src/components/setting-info/ha-setting-info.ts`
- `frontend/src/components/setting-info/practise-logic.ts`
- `frontend/test/components/setting-info/practise-logic.test.ts`
- Strings: `ui.components.setting_info.*` in `en.json` and `yue-own.json`.

## Not covered

The element itself has no component test and has not been seen in a browser.
