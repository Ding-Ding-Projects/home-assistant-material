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

## Verification

Started in a container made from these files: it starts clean, first-run setup has three steps,
and a forced error produced files and a commit in the problem log repository. The page that
lists problems has not been seen. The supervisor's own tests still expect the removed crash
reporter and need rewriting.
