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

The automation feature has a remote setting and a push, so dashboards follow
it: `dashboard_repos/set_remote` sets or removes `origin` of one dashboard
repository (same address rules as automations: `https://`, `ssh://`, `git@` or
an absolute path, with no credentials in it), and `dashboard_repos/push` sends
it, with every view's history, never forced. Nothing is ever pushed or fetched
unless a remote is set and a push is requested. The interface for these two
commands is not built yet.

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
| `dashboard_repos/set_remote`, `dashboard_repos/push` | Remote and push, as for automations. |

Restoring writes the configuration back through Lovelace's own save, so open
dashboards update, and the save makes a new commit "Restored to `<id>`".
History is never rewritten or deleted. A restored tab that was deleted is
added at the end and, being a new view, starts a new key.

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
(the whole dashboard with all its tabs, or only the one tab).

## Verification

`core/tests/components/dashboard_repos/test_repos.py` uses real Git. It covers
first save, unchanged save, one-view change, rename, reorder, delete, keys,
reading back versions, diffs, notes, unsafe input, and cloning one dashboard
repository into a fresh folder to read every tab's content and history.
