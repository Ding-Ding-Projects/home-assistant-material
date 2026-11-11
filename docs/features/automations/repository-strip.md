# Repository strip

The automation editor shows a short strip about the Git repository of the automation that is open.
The repository page lists its commits and sends them to the remote.

## What the strip shows

| Item | Where it comes from |
| --- | --- |
| Current commit (short id) and its time | `automation_repos/status` gives the head; `automation_repos/history` with a limit of 1 gives the time. No time is shown if the call fails or the newest commit is not the head. |
| Matches or differs from the live configuration | The `dirty` field of the status. Not shown when the automation has no commit yet. |
| Number of saved versions | The `commits` field of the status. |
| Remote | The host only. A user name, password, port or path is never shown. A folder remote has no host, so nothing is shown for it. A remote the server marked unsafe is hidden. |
| Commits not pushed | Shown only if the status reports a whole `unpushed` number. The current server does not report one, so today it is never shown and never guessed. |

Two buttons open the repository page of this automation and the history list filtered to it. Both
go through the editor, which asks before leaving unsaved changes. If the history manager is not
installed, there is no strip.

The strip is `ha-automation-repo-strip`, mounted by `ha-automation-status-bar`. The formatting is in
`repo-strip-logic.ts`.

## Repository page

`ha-config-automation-repo` shows one automation: its commit list with search, one commit at a time
with its changes, and the remote as a host only. Push asks first, commits anything waiting for this
automation, sends it, and shows the reply of the server: how many automations were committed and
repositories pushed, plus any reason a save was skipped and any push error, in the server's words.

## Not available

- Pull. The instance has no pull command, only push, so the page does not offer one.
- Unpushed commit count (see above).

## Verification

Unit tests for the formatting: `frontend/test/panels/config/automation/repo-strip-logic.test.ts`
(matching and diverged states, no remote, host extraction without credentials, unpushed count).
The interface was not opened in a browser.
