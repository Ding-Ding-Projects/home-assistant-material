# Add from a file (ZIP archive) in the Marketplace

Built in batch 51, beside "Add from a GitHub link". A person uploads a ZIP of a repository
folder; the product works out what is inside, says what it found and, after confirmation, places
the chosen item. The archive does not need a `.git` folder.

## What it does

- **Detection reads marker files, not history.** An integration manifest, a dashboard card
  script, theme files, templates, blueprints, an app repository or an app are recognised through
  wrapper folders up to three deep, shallowest match first. A `.git` folder, when present, only
  adds the origin and the branch as information.
- **The browser checks first and sends nothing until Add.** It reads the archive's directory
  and unpacks only the small marker files. Code: `frontend/src/data/marketplace/archive-zip.ts`,
  `archive-detect.ts`, `archive-upload.ts`, `ha-marketplace-archive-found.ts`.
- **The server checks everything again** (`upload_archive.py`): the upload is at most 50 MiB, at
  most 20,000 entries, at most 100 MiB unpacked, with a bounded compression ratio; it refuses `..`,
  absolute paths, drive letters, symlinks, encrypted entries and ZIP64, and paths longer than
  512 characters or deeper than 32 levels.
- **A "Repository found" or "App found" dialog** lists each item, how it was recognised and what
  Add will do.

## The endpoint

`POST /api/marketplace/upload` (`upload.py`) is for administrators only and needs the
Marketplace warning to have been accepted by that user. One upload runs at a time. The form
carries `kind`, `source` and the archive as `file`. It answers 201 with the kind, name, path,
whether a restart is needed and the resource address. It never overwrites anything it did not
create, refuses the domains of built-in integrations, and runs the same follow-up steps as an
install.

## Security notes

**An uploaded archive can run code.** An integration, a card script or a panel runs with the
reach of the instance or the browser. Items that run code need the two-step confirmation. Apps are
recognised but not added from a file. Only add archives you trust.

## Limits and failure modes

- Apps are recognised and named, not installed from a file.
- A malformed or hostile archive is refused with a specific reason; nothing is written.
- Detection is by marker files: a repository with unusual layout may not be recognised.

## How it was verified

Server endpoint run for real on a throwaway instance: an integration archive was placed (201)
with its marker file and no `.git`, a repeat replaced it, a wrong path, a `../` entry, a built-in
domain and a non-archive were each refused (400), a request without a token got 401, and a theme
was placed. The detection rules pass the same 19 shared cases in both languages and 545
interface tests in the touched areas pass. Not confirmed: the refusal before the Marketplace
warning is accepted (the test account had already accepted it). The server view tests (pytest)
could not run on this machine, and the dialog has not been seen in a browser. State: server
endpoint run on a throwaway instance; dialog built, not yet seen in a running build.
