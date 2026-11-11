# Guided setup: save and resume, and jumping to a step

Code: `frontend/src/panels/config/guided-setup/guided-setup-logic.ts`,
`frontend/src/panels/config/guided-setup/ha-guided-setup-wizard.ts`.
Tests: `frontend/test/panels/config/guided-setup/guided-setup-resume.test.ts`.

## What it does

- **Save and close.** On the options and review steps of a drawn form that holds something,
  Save and close keeps the setup as a draft and leaves without asking. Closing in any other
  way asks first and also keeps the draft.
- **Resume or start again.** Opening the same integration again shows "You have an unfinished
  setup" with Resume and Start again. Resume returns to the options with the saved values;
  Start again deletes the draft.
- **Step list.** The steps are listed on the side on a wide screen and as a strip across the
  top on a phone. A step that was already visited can be selected. The review step can only
  be selected while the options have no problem. The current step and steps not reached yet
  are not selectable. After saving, only the last step remains.
- **Skip.** When no option is required, Skip, use defaults goes straight to the review.

## What is stored

The draft lives in this browser's `localStorage` under `guided-setup-draft:<integration>:<target>`,
format version 1: the step, the chosen kind, the target and the values. It is kept 14 days;
an older draft, a draft of another version, a damaged draft or one dated in the future is
ignored and removed. A password, key or token field is never stored, neither is a free-form
YAML value, and any key whose name looks like a secret is dropped at any depth. The names of
the dropped fields are kept so the wizard can ask for them again. Forms that are a single
YAML box never get a draft. If browser storage is blocked, the wizard works as before without
drafts.

## Failure modes

A draft is per browser, not per account: it is not available on another device. Entries that
are edited (not created) have no draft.

## Verification

Unit tests cover the round trip, secrets being dropped, a version mismatch, the 14 day limit,
unreachable storage and the jump rules. The wizard itself has not been seen in a browser.
