# Link confirmation

Code: `frontend/src/panels/my/` (`ha-panel-my.ts`, `my-redirect-plan.ts`).

## What it does

A link that opens a page of this interface from outside now asks first. It shows where the link
goes and what it passes on, and does nothing until the person chooses. A crafted link name can
no longer leave the page blank.

## Verification

Unit tests only. Not seen in a running build.
