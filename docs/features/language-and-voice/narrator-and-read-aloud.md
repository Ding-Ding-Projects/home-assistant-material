# Narrator, read aloud and sounds

Code: `frontend/src/common/narration/`, `frontend/src/common/accessibility/accessibility-tools.ts`,
`frontend/src/common/sound/action-sound.ts`.

## What it does

- Narrator: off by default. It reads the name of the focused control with the browser's speech
  service.
- Read aloud: reads a page, or the text of an element chosen from the menu.
- Action sounds: short sounds for actions, with a volume and quiet hours.

## Privacy

Both the narrator and read aloud use only a voice that runs on the device (`localService` is
true). If the device has no such voice, they stay silent, so spoken text is never sent to a
speech service anywhere else. Cantonese speech needs a Cantonese voice installed on the device.

## Verification

Unit tests only. Read aloud was not heard working because the test browser has no speech voices.
The sounds have not been heard.
