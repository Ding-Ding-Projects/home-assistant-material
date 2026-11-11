# Support tickets

Code: `frontend/src/panels/config/support/` (`ha-config-support.ts`, `ticket-view-logic.ts`) and
`frontend/src/common/locks/support-tickets.ts`.

## What it does

The Support page has a Tickets section. A person can:

- open a ticket with a title, what happened, which page it was about, and optionally a reference
  to the support bundle created on the same page;
- see every ticket in a list, newest first, with its status: open, waiting or closed;
- search the list with the shared search field (plain text or a `/pattern/flags` expression) and
  narrow it by status;
- open a ticket to read it, add notes, mark it waiting or open, close it and reopen it, or remove it.

Nobody receives or answers a ticket. The status changes only when the person changes it. There
is no timer and no canned reply.

## Where the data is kept

Tickets (number, title, details, time) stay in the existing ticket store. The status, page, notes
and bundle reference are kept beside them under their own storage key, `supportTicketExtras`, in
the same storage the tickets use, keyed by ticket number. Nothing is sent outside the instance
and no link opens. The page says so in a visible line.

The bundle reference holds only the file name, size and time of the bundle. The contents are
never stored with a ticket.

Stored data is checked on every read: unknown fields, bad statuses and empty notes are dropped.
Removing a ticket also removes its extras.

## Status moves

| From | Allowed to |
| --- | --- |
| open | waiting, closed |
| waiting | open, closed |
| closed | open |

Any other move is refused.

## Limits

Title 120 characters, details 1000, page 120, a note 500, 50 notes per ticket, 50 tickets.

## Failure modes

- Storage unavailable or cleared: the list starts empty; nothing breaks.
- A ticket with no saved extras is shown as open.
- A broken pattern in the search shows no tickets and the page says no ticket matches.

## Verification

Unit tests for the status moves, notes, search, ordering and stored-data checks are in
`frontend/test/panels/config/support/ticket-view-logic.test.ts`. The page itself was not seen in
a browser.
