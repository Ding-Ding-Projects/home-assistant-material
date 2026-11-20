# No data sent out, and the problem log

Code: `core/homeassistant/components/problem_log/`, `frontend/src/panels/config/problem-log/`,
`frontend/src/data/problem_log.ts`; edits to vendored folders are in `../../material-changes.md`.

## What it does

Nothing about the installation is sent out. The analytics integration, its page and its
first-run step are gone, the supervisor's crash reports and diagnostics are off and cannot be
turned on, and the buttons that reported an issue or gave feedback are removed.

Problems are kept on the system instead. Settings, System, Problem log lists every warning and
error, one entry per problem with a count and when it was first and last seen. They are files
in a Git repository in the configuration folder (`problem_log`), written with passwords,
tokens, addresses and other private values removed. At most 500 files are kept, commits are
made at most once a minute, and nothing leaves the system unless the person adds a remote.

An installation set up by an earlier build no longer logs an error about analytics at start.

## Sending the problem log to a private repository

Code: `send_manager.py`, `send_host.py`, `send_files.py`, `send_redact.py`, `send_wording.py`
and `send_websocket.py` in `core/homeassistant/components/problem_log/`;
`ha-problem-log-send.ts` and `problem-log-send-logic.ts` in
`frontend/src/panels/config/problem-log/`; `frontend/src/data/problem_log_send.ts`.

Off until the owner turns it on, and only an admin can change anything. The settings card has
three steps: sign in, where to send, and wording. The only host this feature contacts is GitHub
(`api.github.com`, and `github.com` for the code sign-in), and only after the owner has started
something. The sign-in is kept in a private store and never appears in a command result, an
event, a log line or a sent file.

### Signing in, and the client ID

There are two ways to sign in. A **token** is pasted on the page: a classic token with the
`repo` permission can list and make private repositories; a fine-grained token for one
repository, with read and write access to Contents, can only send there, so its address is
typed instead of chosen. **Signing in with a code** shows a short code that the owner types on
`github.com/login/device` and approves.

The code sign-in needs the client ID of a GitHub OAuth app. None is built in, on purpose: the
approval page names the app that asks, and a public project must not make that page name an
app the owner did not make. The owner makes one on GitHub under Settings, Developer settings,
OAuth Apps, New OAuth App, ticks **Enable Device Flow**, and copies its Client ID into the
setting. A client ID is not a secret; it only names the app. The page and the server both check
its shape (10 to 40 letters, digits, dots, hyphens or underscores). Until one is set, the page
leads with the token and says that the code route needs the ID. While a code is waiting, the
page repeats: "GitHub will name the app that asks. Check it is the one you expect before
approving."

### Choosing or making the repository

After signing in, the page lists the owner's repositories with a search field. The server reads
`GET /user/repos` (affiliation owner and organization member, newest first, 100 a page, at most
500), keeps the list in memory for five minutes, and filters it by the typed text; a pattern
such as `/log$/` is matched on the page instead. The sign-in is never returned with the list.

- Private repositories can be chosen. Public ones are listed as "Public · cannot be used" and
  cannot be chosen; the server refuses them too, whatever the page sends.
- A private repository that already holds files can be chosen. If its `README.md` was not
  written by this feature, the problem log goes in a folder of its own, `problem-log/`, and the
  repository's own files are left alone. The README this feature writes starts with the line
  `<!-- problem-log: home-assistant-material -->`; a README from an earlier build is recognised
  by its opening sentence. An empty repository, or one with that README, gets the files at its
  root. The README is only searched for that marker; nothing in it is acted on.
- **Or make a new one**: a name (default `home-problem-log`, up to 100 letters, digits, dots,
  hyphens and underscores), on the account or on an organization from the list, behind the
  confirmation with the two keys and the slider. It is made with `private: true`, no template,
  no first commit, and a one-line description saying what writes there. It is then read back,
  and used only if GitHub reports it as private. A name already in use, or a sign-in without the
  `repo` permission (or, for a fine-grained token, without permission to make repositories),
  gives a plain message.
- Typing an address by hand still works, as a fallback.

Whether the repository is private is read from GitHub again before every send. If it has become
public, nothing is sent and the page says why.

### Wording

When a personal wording file is loaded in this browser, the page offers "Use my wording file in
what is sent", off by default. Turning it on sends the already checked entries once to the
server, which checks them again with the same limits (256 KiB, keys up to 160 characters, values
up to 1000, no control characters, no unsafe keys) and keeps them in a private store,
`.storage/problem_log.send_wording`, which is left out of backups. The problem log is not a
config entry, so the store is not part of the integrations export. Turning the switch off
deletes the stored copy. The entries are never logged, returned or written to the repository as
a list.

When it is on, the wording applies only to this feature's own text: the headings and labels of
the Markdown files, the README, and the commit subject. It never touches a log line, a
traceback, a logger name, code, an identifier, a path, an integration name, or anything inside
a fenced block, and the problem titles in `problems/index.json` stay exact. The replacement
follows the browser's rules: the longest key wins, case matters, whole words only, and a key
next to `_`, `/`, `\`, `@` or inside `word.word` is left alone. Hiding runs over the whole file
after the wording is placed in the fixed phrases, so a wording value can never carry a private
name out.

### What is hidden, and what is never rewritten

Hidden before anything leaves: passwords, tokens and keys, values from `secrets.yaml`, web
addresses with sign-ins and query strings, network addresses, host names, places and
coordinates, people's names, and the names given to things, which are shown as stable labels
such as "camera 2".

The names of programs are never rewritten, so the log can be read:

- Logger names and module paths (`homeassistant.components.recorder.db_schema`), file paths in
  tracebacks, the logger, build and integration lines this feature writes, and the program
  fields of `problems/index.json` are set aside before names are looked for.
- The product's own name, every integration domain and name the loader knows, and common
  library names (`dbus_fast`, `sqlalchemy`, `aiohttp` and others) are never treated as a name
  somebody gave a thing. `system.md` holds only the build, versions and integration domains and
  is not passed through name hiding; it is still checked for the sign-in and for secrets.
- A thing's name is replaced where it appears as given (case matters) or as its slug
  (`front_door`), as a whole word or phrase. A name shorter than four characters, or equal to an
  ordinary word such as "sun", "update" or "device", is only replaced in quotes or as a
  `friendly_name` field. People's and places' names are still matched in any case.
- A value from `secrets.yaml` of eight characters or more is removed wherever it appears; a
  shorter one only where it stands on its own, so it cannot cut a library name in half.
- The host name `homeassistant`, the default on the operating system, is not hidden as a host
  name, since it is also the product's module name; `homeassistant.local` is still hidden.

Entity ids (`binary_sensor.front_window`) are replaced by the label of their entity wherever they
appear, including inside quoted dictionaries and lists in an automation's condition dump, and
also for entities that no longer exist: `['binary_sensor.front_window']` becomes
`['[binary sensor 1]']`. A file name such as `sensor.py` is not mistaken for an entity id.

## Verification

Started in a container made from these files: it starts clean, first-run setup has three steps,
and a forced error produced files and a commit in the problem log repository. The page that
lists problems has not been seen. The supervisor's own tests still expect the removed crash
reporter and need rewriting.

Choosing, making and wording (2026-11-19): the hiding, file layout and wording rules were run
with their tests outside Home Assistant (the pure modules only). The tests that need a running
Home Assistant (`test_send.py`) were written but not run, no request reached GitHub, and the
page has not been seen in a browser.
