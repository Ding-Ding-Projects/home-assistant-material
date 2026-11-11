# Support page

Settings, Support (`/config/support`). Drawn to the board `SupportTickets`, with one addition that
is not on the board: a support bundle.

## What it does

- **Tickets.** A person can open a ticket, see its status move on with the clock, and remove it.
  Tickets live in this browser's storage only. No request is made, there is no account and
  nobody reads them. It uses the same ticket logic as the support desk that the lock prompt opens
  (`frontend/src/common/locks/support-tickets.ts`).
- **Where your locks are kept.** Locks are kept in this browser's stored data for this address
  (`elementLocks`), not on the server. The page shows the address, lets the person copy it and
  explains the three steps that clear this site's stored data. The board shows a server folder
  and an "Open that folder" button; neither applies to this build, so neither is drawn. The page
  never deletes anything itself.
- **Support bundle (addition).** A button builds a plain text summary: version, state, safe and
  recovery mode, language, time zone, browser, loaded integrations, and the recorded problems
  (title, count, last seen, level, logger, version). It is built in the page from the frontend's
  own configuration and the existing `problem_log/list` command. Every free-text value goes
  through `redactDetails`. Problem messages and tracebacks are never included. The text is shown in
  full, and is copied or saved as `support-bundle.txt` only when a button is pressed. Where it goes
  after that is the person's decision; the page links to no outside site.

## Failure modes

- If the problem log cannot be read, the bundle says so and is still made.
- If copying is blocked by the browser, a fallback copy is tried; if that fails nothing is copied.
- Large lists are capped (25 problems, 400 integration names) and the rest is counted.

## Security

Nothing leaves the instance. The bundle excludes credentials, addresses, names of people, devices
or places, and dashboard contents. A ticket never needs a PIN or password and the form says so.

## Verification

Unit tests for the bundle text (`frontend/test/panels/config/support/support-bundle.test.ts`).
The page itself has not been opened in a browser.
