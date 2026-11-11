# Notification severity

The notifications page (Settings, Notifications) shows how urgent each persistent notification is, lets you filter by it, and keeps the existing buttons and Undo.

## How severity is decided

The instance reports no severity field, so the interface never guesses from the words of a title or message. Severity comes only from an explicit marker at the start of the notification id:

| Marker at the start of the id | Severity |
| --- | --- |
| `error.`, `error_`, `error-`, `error:` | Error |
| `warning` followed by the same separators | Warning |
| `info` followed by the same separators | Information |
| `update_fail...` (an update failure) | Error |
| `repair_` or `repairs_` (a repair) | Warning |
| `system_` (a system source) | Information |
| anything else | Neutral |

An explicit level always wins over a source. Matching is case-insensitive. The logic lives in `frontend/src/panels/config/notifications/notification-insight.ts`.

## What you see

- A coloured edge on the start side of the row, an icon and the severity word, so colour is never the only signal. Neutral rows have no coloured edge.
- The icon and word mix the severity colour with the text colour, so they stay readable on the card in light and dark themes.
- Severity chips beside the search. Choose one or more to show only those severities; choose none to show all. A hidden notification is also removed from a bulk selection.
- Notifications are sorted most urgent first, then newest first.

## Actions

Each row keeps its action buttons: the links in the message that point inside the interface (or a named web host), and a dismiss button. Dismissed notifications are kept in this browser for 30 days and can be put back with Undo.

## Not covered

Toasts and the notification manager are unchanged. This page was not viewed in a browser while it was written; verify it in the running interface.
