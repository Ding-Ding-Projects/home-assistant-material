# Dashboard history

Every dashboard kept in storage has its own Git repository, every tab (view) of
a dashboard has its own repository, and every dashboard and every tab has its
own history manager page.

## Design

### Layout on disk

Under the configuration folder, next to `automation_repos`:

```text
dashboard_repos/<dashboard id>/.git          the dashboard repository
dashboard_repos/<dashboard id>/dashboard.yaml  settings, and the keys of the views in order
dashboard_repos/<dashboard id>/meta.json     key, title and path of each view
dashboard_repos/<dashboard id>/views.lock    the commit each view repository is at
dashboard_repos/<dashboard id>/views/<key>/view.yaml   one view, tracked as an ordinary file
dashboard_repos/<dashboard id>/_removed/<key>/         a deleted view
dashboard_repos/<dashboard id>/.views/<key>.git        the repository of one view (ignored)
dashboard_repos/_removed/<id>-<UTC time>/    the repository of a deleted dashboard
```

The dashboard id is the dashboard's URL path. The default dashboard uses the
reserved id `_default`. Ids and view keys must match
`[A-Za-z0-9][A-Za-z0-9_-]{0,63}`, so nothing can contain a dot, a slash or a
leading dash. Anything else is refused.

### What was built: separate Git directories, not submodules

Git submodules and plain nested repositories both fail the requirement that
one clone or push of a dashboard repository carries every tab. A nested
repository is only recorded as a pinned commit in its parent, so the parent
does not hold its content or history. Bundles under `views/<key>.bundle` would
be rewritten on every save and grow without bound.

Instead, each view repository keeps its Git directory in `.views/<key>.git`
and uses `views/<key>/` as its working folder, with no `.git` inside it (every
Git call passes `--git-dir` and `--work-tree`). Because of that:

- The dashboard repository tracks `views/<key>/view.yaml` as an ordinary file,
  so every commit of the dashboard contains the full content of every tab.
  `.views/` is ignored by the dashboard repository.
- After each save, the history of every changed view is fetched into the
  dashboard repository as the branch `view/<key>`. The view's real commits
  (not copies) live in the dashboard repository's object store.
- `views.lock` lists `<key> <commit of the view repository>`, so the
  dashboard history and each view history can be matched.

A single clone of the dashboard repository therefore holds the content of
every tab in `main` and every tab's history in `origin/view/<key>`. A push
sends `HEAD:refs/heads/main` and `refs/heads/view/*`.

Limits, stated plainly:

- The `view/<key>` branches have unrelated histories next to `main`. They are
  read with `git log origin/view/<key>`; they are not merged into `main`.
- A clone has the history of each view but not the view repositories as
  working repositories (`.views/` is ignored). Reading history from a clone
  works with plain Git. The history manager on the instance uses the real view
  repositories.
- The view repositories and branches are never rewritten, force-pushed or
  deleted.

### Remote and push

`dashboard_repos/set_remote` sets or removes `origin` of one dashboard
repository, and `dashboard_repos/push` sends it, with every view's history,
never forced. Nothing is ever pushed or fetched unless a remote is set and a
push is requested. The history page has a Remote section for both (see
Interface).

The address rule is stricter than the one the automation repositories use. An
address is accepted only as:

- `https://host/path`
- `ssh://host/path`
- `git@host:path`

with an optional port, and with no user name or password (so `ssh://git@host/x`
is refused; use the `git@host:path` form), no query string, no fragment, no
space or control character, and at most 500 characters. A bare local path is
refused when setting a remote. A bare local path that was stored earlier keeps
working, and is shown as it is.

The address is never handed back with anything that could hold a secret. When
the stored address does not follow the rule (it was set before the rule was
tightened), status reports `remote: null` and `remote_unsafe: true`, and a push
is refused until the address is removed or set again. The text of a failed push
is cut down to one line, the address and any user information are removed from
it, and the result carries the time of the push. The last push (time, result,
masked error) is kept in the repository's `.git` folder, outside the history,
and returned by `dashboard_repos/status` as `last_push`.

### What the history keeps, and forgetting it

A dashboard configuration can hold secrets typed into cards: an address with a
token in an iframe card, a webhook id. Every save commits them, so they are in
every old version, in backups of the configuration folder, and in everything
a push sends to a remote. Going back to an old version brings old values back.
The history page says so beside the Restore action and in the Remote section.

`dashboard_repos/forget` is the way out. It deletes the whole repository of
one dashboard, with every tab's history, for good, and starts again from the
dashboard as it is now. The interface asks for a confirmation that says what
is deleted. Copies already pushed to a remote are not changed, and anything
still typed into a card is in the new first version.

When a dashboard is deleted, its repository is moved to
`dashboard_repos/_removed/<id>-<UTC time>/` (a repository found at start-up
with no matching dashboard is moved the same way). A new dashboard with the
same address starts with an empty history. The moved folder is never read
again by this feature; delete it by hand to remove its secrets.

### Stable view keys

Views have no id. The key of a view is its `path` when that is a safe name
that is not already used, otherwise a generated `view-<8 hex>`. The key is
kept in `meta.json` inside the repository, not in the person's dashboard
configuration. On every save the views are matched to the known ones:

1. by `path`;
2. by `title`, the nearest position first;
3. by position alone, which is how a rename is followed.

Behaviour:

- **Rename:** the key and repository stay; the commit says "Rename view A to B".
- **Reorder:** keys stay; the dashboard commit says "Reorder views".
- **Delete:** the working folder moves to `_removed/<key>/`, its repository
  and history stay, and the dashboard commit says "Remove view X". A key is
  never reused.
- **New view:** a new repository with a first commit "Add view X".
- A delete and an add in the same save at the same position is read as a
  rename. This is the limit of matching without an id.

### When commits happen

On every save of a stored dashboard (the `lovelace_updated` event that
`LovelaceStorage.async_save` already fires; Lovelace is not changed), each view
whose content changed gets one commit, then the dashboard gets one. Existing
dashboards get their first commit when Home Assistant has started.
Dashboards written in YAML and generated dashboards have no stored
configuration and are skipped (listed as such in the status). A save that
changes nothing makes no commit. Messages are generated from the change
(`Home: change cards`, `Add view X`, `Change settings: title`).

Saves are coalesced: commits run one at a time, and a commit reads the newest
saved configuration when its turn comes, so a storm of saves while one commit
is waiting or running leaves at most one more commit waiting per dashboard.
The listener never raises.

Every view and the settings are written out and size-checked before the first
commit, so one view over 2 MB refuses the whole save with nothing half
recorded. Keys are compared lower-cased, so two views whose paths differ only
by case never share a folder on a disk that ignores case. Names, keys and
commit ids are matched in full (not "up to a trailing newline").

A failure to commit never blocks the save: it is logged once and reported in
`dashboard_repos/status` as `error`.

### Websocket commands (admin only)

| Command | Purpose |
| --- | --- |
| `dashboard_repos/status` | Every dashboard, its views, removed views, remote and last error. |
| `dashboard_repos/history` | Commits of a dashboard, or of one view (`view_key`). |
| `dashboard_repos/version` | The configuration at a commit, as data and YAML. |
| `dashboard_repos/diff` | The difference between two commits, as text. |
| `dashboard_repos/restore` | Put a dashboard or a view back to a commit. |
| `dashboard_repos/forget` | Delete the whole history of a dashboard and start it again. |
| `dashboard_repos/set_remote`, `dashboard_repos/push` | Remote and push, with the stricter address rule above. |

Restoring first waits for any save still queued and commits the current
state ("Before restoring to `<id>`"), so going back never loses it. When that
cannot be done the command refuses with the error code
`current_state_not_recorded`, and the interface asks again with a second
confirmation; only then does it send `without_saving_current`. One tab is put
back by its key only, using the keys recorded at that commit of the current
state, never its position or title. When no tab has the key any more the tab
is added at the end as a new tab, and the result says so (`new_view`). The
restored configuration is checked (a dashboard of views, each within the size
limit) before it is saved. It is written back through Lovelace's own save, so
open dashboards update, and the result carries the commit it made, so the
page reloads when the server reports it. History is never rewritten.

Error codes: `git_error`, `dashboard_not_found` (no such dashboard),
`not_storage_dashboard` (it exists but is not edited in the interface),
`dashboard_changed`, `save_failed` (the dashboard's own save failed),
`current_state_not_recorded`. Restoring one tab into a dashboard that has no
stored configuration is refused. The interface shows each known code as a
localized sentence with the server text as detail, and offers Retry for
`dashboard_changed`. A push no longer holds the commit queue: each dashboard
has its own push lock, and a second push waits, then says it is still running.
Replacing a remote asks first and says what stays on the old one. A failure at
start-up on one dashboard no longer stops the others.

### Safety

Git is run with argument lists, never a shell, with hooks disabled, signing
off, and no global or system configuration, by the same helper as the
automation repositories. Ids, keys and commits are validated before use.
Configurations over 2 MB, dashboards over 100 views and diffs over 200 000
characters are bounded.

## Interface

`/config/dashboard_history?dashboard=<id>&view=<key>&commit=<sha>`

Without `dashboard`, the page lists the dashboards with a link to the history
of each dashboard and each tab. With one, it shows the commits (searchable),
the changes and the content of the selected commit, a comparison with another
commit and a restore with a confirmation that states exactly what is replaced
(the whole dashboard with all its tabs, or only the one tab, or a new tab when
the tab no longer exists). A warning about secrets typed into cards sits next
to Restore.

Below the commits, an admin sees:

- **Remote**: the current address (never with credentials), a field to set or
  clear it that checks the same rule as the server in the browser (the server
  stays the authority), the same warning about secrets, a plain statement of
  what Push now sends (this dashboard's configuration, every tab and every old
  version, including anything typed into cards), the Push now button with a
  confirmation, the result, and the time of the last push. Nothing contacts a
  remote unless an address is set and the button is pressed. Pushes are never
  forced.
- **Forget this dashboard's history** (whole-dashboard view only), with a
  confirmation.

Not built: a screen to list or delete the `_removed` archives.

## Verification

`core/tests/components/dashboard_repos/test_repos.py` uses real Git. It covers
first save, unchanged save, one-view change, rename, reorder, delete, keys,
reading back versions, diffs, notes, unsafe input, and cloning one dashboard
repository into a fresh folder to read every tab's content and history.

`core/tests/components/dashboard_repos/test_repos.py` also covers: names,
keys and commit ids that end in a newline, one oversized view or oversized
settings recording nothing, a deleted dashboard's history not being adopted by
a new one, forgetting, hostile remote addresses (credentials in every scheme,
query strings, fragments, bare paths, option-like and `ext::` strings, an
embedded newline, over-long addresses), credentials set earlier never being
shown or used, push errors and the last push, restoring by key only and adding
a new tab when the key is gone, rejecting a configuration that cannot be
recorded, keys that differ only by case, and the commit queue (a burst becomes
one commit, a save during a commit queues one more, a failing commit is not
raised). `frontend/test/data/dashboard_repos.test.ts` checks the browser copy
of the address rule against the same list.

### Run on a real instance

On 10 November 2026 the server commands were driven on a running copy: two saves, the history, a restore, and deleting an archived history. The interface page, setting a remote and pushing have not been seen, and no push to a real remote has been made.
