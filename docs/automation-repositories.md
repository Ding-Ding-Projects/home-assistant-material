# Automation repositories

Every automation has its own Git repository. All of them sit inside one master repository, which
records the commit each automation is at. Saving an automation commits it. One push commits every
automation that changed, then the master, and sends them to their remotes where a remote is set.

This is the `automation_repos` integration in `core/homeassistant/components/automation_repos/`.
It loads with the default configuration and needs nothing set up.

## Where things are

Inside the configuration folder:

```
automation_repos/
  .git/                         the master repository
  manifest.json                 which commit each automation is at
  snapshots/<name>.yaml         a copy of each automation at that commit
  automations/
    <name>/.git/                one repository per automation
    <name>/automation.yaml
```

`<name>` is the automation's id when the id is plain letters, digits, `_` and `-`. Any other id
becomes a hash, so an id can never name a folder outside this one. The master repository tracks
`manifest.json` and `snapshots/`; it ignores `automations/`, because each folder there is its own
repository. Cloning the master alone is enough to bring every automation back.

## What happens when

| When | What |
| --- | --- |
| An automation is saved in the editor | Its repository gets a commit if the automation changed. The message names the parts that changed, for example `Evening lights: change mode, triggers`. |
| Push (the `automation_repos/push` command) | 1. Every automation is checked; one that does not load is left out and named in the result. 2. Each automation that changed is committed. 3. `manifest.json` and `snapshots/` are written and the master is committed. 4. Each repository that has a remote is pushed to it. Never forced. |
| A version is opened | The automation is read back from that commit, exactly as it was saved. |

## Commands

All are websocket commands and need an administrator.

| Command | Fields | Returns |
| --- | --- | --- |
| `automation_repos/status` | | Every automation with its repository, head commit, number of commits, whether it has changes waiting, and its remote; the same for the master |
| `automation_repos/history` | `automation_id`, `limit` (1 to 500, default 100) | Commits, newest first |
| `automation_repos/version` | `automation_id`, `sha` | The automation at that commit |
| `automation_repos/diff` | `automation_id`, `old`, `new` (left out: compared with now) | The difference as text |
| `automation_repos/push` | `message`, `automation_ids` (left out: all) | What was committed, left out, and pushed |
| `automation_repos/set_remote` | `automation_id` (left out: the master), `url` (left out: remove) | |
| `automation_repos/record` | `automation_id`, `message` | The new commit, or the error `not_found` for an automation that is not in the file |
| `automation_repos/archives` | | The histories of deleted automations that were set aside (`name`, `automation`, `archived_at`) |
| `automation_repos/restore_archive` | `name` | Brings a set-aside history back; refused when that automation already has a history |

Errors carry a code (`git_error`, `automations_unreadable`, `not_found`) that the interface shows as
a localized sentence, with the server text as detail.

## Losing no history

- A deleted automation's repository is moved to `_removed/`, never deleted. A missing, empty or
  id-less automations file, which a save in progress can briefly look like, archives nothing until
  the same file state is seen again at least 15 seconds later. An automation that is loaded right
  now is never archived, even when a truncated file leaves it out. One pass moves at most half of
  the known repositories (at least one); the rest follows in later passes.
- The history page lists set-aside histories and brings one back.
- Forgetting a history renames its folder aside before deleting it, so a stopped removal never
  leaves a half repository under the automation's name.
- The text last recorded for each automation is remembered, so a reload starts no Git process for
  an automation that did not change, and the status reads heads and remotes from the repository
  files. The status also returns the reason the last save of an automation was not committed.
- A push commits under the recorder lock, then sends outside it. Each remote has its own lock, a
  push covers only the repositories that were ticked, and one push stops starting new sends after
  300 seconds.

## Safety

- The automations file is read without secrets. If it refers to one, reading fails and nothing
  is committed, so a password cannot end up in a commit.
- A version is named only by a commit id. A remote must start with `https://`, `ssh://`, `git@`
  or `/` and cannot carry a user name, a password, an option or a command.
- Git runs without the machine's own settings, without hooks and without ever waiting for a
  password. Each call has a time limit: 30 seconds, 60 for a remote.
- A push to a remote that needs a password fails and is reported; nothing is stored to make it
  succeed. Use a remote the system can already reach, such as an SSH key in the configuration
  folder's home.

## What has been checked

- 20 tests with real Git (`core/tests/components/automation_repos/test_repos.py`): one commit per
  change, separate histories, exact read-back, push order, a broken automation left out, a
  removed automation, remotes that work and that fail, and refusal of unsafe ids, commit names
  and remote addresses.
- In a running instance: the integration loaded, a push committed two automations and the
  master, and two saves through the editor's own API each became a commit.
- **Not checked**: a push to a real remote host, the integration as part of a built image (it was
  loaded into a running image as a custom integration), and the core project's own test runner.
