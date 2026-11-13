# Extensions page and progress for app jobs

Built in batch 48.

## Extensions

A page for dashboard resources and custom panels with **recorded consent**: each one is listed
with what it is, and a person's consent is recorded before it is used. Running a resource or a panel
means running code in the browser, so consent matters. Consent is a record, not a sandbox.

Not built: enabling or disabling a resource from this page (the resource has no such field).

## Progress for app jobs

Progress shows the failed step, a Start again button and Copy details. Not built: resuming a job
part way, because the Supervisor cannot.

## Limits and failure modes

- Check what Copy details contains before pasting it anywhere.
- Start again restarts the job from the beginning.

## How it was verified

Unit tested. Not seen in a browser. State: built, unit tested, not yet seen in a running build.
