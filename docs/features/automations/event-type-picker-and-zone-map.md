# Trigger and condition editor details: event types, zone map, timers and thresholds

Small but visible changes to the automation editor, from `23225de03`, `ecc3e18ef` and
`090bf8e62`, with `02dd3f9b4` for the map on the newer zone editors.

Code: `frontend/src/panels/config/automation/trigger/` (`event-type-items.ts`,
`types/ha-automation-trigger-event.ts`, `types/ha-automation-trigger-zone.ts`),
`frontend/src/panels/config/automation/ha-automation-zone-map.ts`,
`frontend/src/components/ha-selector/ha-selector-numeric-threshold.ts`,
`frontend/src/panels/config/automation/ha-automation-picker.ts`.

## What changed

- **Event type is a searchable picker.** The event trigger's type is chosen from a list of known
  event types with a search field instead of typed from memory.
- **Zone triggers and conditions show a small map**, so the zone being tested can be seen. The
  newer zone editors got the same map in `02dd3f9b4`. The map was not seen on screen in a
  browser.
- **A timer trigger writes its duration properly.** It used to write the duration as text, which
  the server refuses; it now writes it in the accepted form.
- **A threshold trigger no longer sends nothing.** When its first unit choice was "none", the
  editor sent the server no unit. It now picks a real unit (`ecc3e18ef`). A power threshold
  defaulted to milliwatts; its default unit is corrected (`090bf8e62`).
- **The first field of the bottom sheet could not be tapped**, because the sheet's drag handle
  covered it. Fixed in `090bf8e62`, whose title records that taps now land; found in a browser look.
- **The automation list no longer calls every new-style trigger "Unknown trigger"**
  (`090bf8e62`). Its description in the list is now worked out for the new kinds (how, exactly, is not
  stated in the commit record).
- **Light recording and camera pages** follow the language mode; see
  [`../camera-recording/event-clips-and-live-recording.md`](../camera-recording/event-clips-and-live-recording.md).

## One test against the server's own descriptions

A test (`frontend/test/components/automation-editors-yaml.test.ts`, 133 lines when added) reads
the server's own trigger and condition descriptions and checks every editor against them, so an
editor that writes a field the server does not describe, or omits a required one, fails the test.
Four entries were removed from the allow-list in `23225de03`
(`all-integrations.allow.ts`).

## Failure modes

- A trigger or condition the server describes but no editor claims falls back to the old rows.
- The zone map needs the zone's position; a zone with none shows no map (inferred, not read from
  a record).

## Verification

- The tests above, plus `event-type-items.test.ts` and `ha-selector-numeric-threshold.test.ts`.
- Seen in a browser look (`ecc3e18ef`, `090bf8e62`): taps landing on the editor sheet, the
  threshold unit, the list description.
- Not seen: saving triggers through the editor end to end at the time of `ecc3e18ef`, and the zone
  map.
