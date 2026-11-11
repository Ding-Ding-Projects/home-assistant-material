# Guided setup

Code: `core/homeassistant/components/guided_setup/`, `frontend/src/panels/config/guided-setup/`,
`frontend/src/data/guided_setup.ts`, `frontend/src/dialogs/config-flow/step-flow-guidance.ts`.

## What it does

Some integrations can only be set up by writing YAML. Guided setup creates them from Settings,
Guided setup, or from Add integration, with a step-by-step form, a review of what will be
written, and a note saying whether a reload or a restart follows. The setup dialogs of other
integrations gain a short guidance note with a link to the documentation, which opens inside
the interface.

The list holds 240 integrations. 223 get drawn fields (text, numbers, switches, choices,
templates, durations, entity pickers, and a first step asking which kind of item to add where
an integration has several). 17 get one YAML box that is checked against the integration's own
rules before saving: 8 because a package they need is not in the image, the rest because their
options are named by the person. About one field in sixteen inside the drawn forms is still a
YAML box.

## Server commands (administrators only)

`guided_setup/catalog`, `form`, `validate`, `save` and `delete`. Saved items are files in
`<configuration folder>/guided_setup/*.yaml`, merged by `core/homeassistant/config.py`.

## Failure modes

An invalid value is refused with the field named. A package missing from the image is stated
before the form opens. Line-by-line YAML errors are not yet shown.

## Verification

Run in a container made from this repository's files: it starts and the list holds 240
integrations. Checking and saving were run through the interface's own connection for two
integrations and wrote the expected files. The wizard, the saved file and the reload have not
been seen in the interface.
