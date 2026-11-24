# Install a package file (.hapkg) in the Marketplace

A package is one file that carries an item for Home Assistant together with a manifest that
describes it and lists a checksum for every file. A person drags the file onto the Marketplace page
and it installs, without typing a repository link. It builds on
[add from a file](add-from-a-file.md) and uses the same dialog, the same server endpoint and the
same install steps. A plain `.zip` archive keeps working as before.

## What it does

- **Drag and drop.** Dragging a file over the Marketplace page shows a cover over the whole panel
  that says "Drop a package to install". Dropping a `.hapkg` or `.zip` file opens the "Add from a
  file" dialog for that file. Any other file, or more than one file, is refused with a message and
  nothing is opened. Only administrators can install; for others a drop only shows a message.
  The cover does not animate when the system asks for reduced motion.
- **A button for people who cannot drag.** The menu of the Marketplace page has "Install from a
  package file". It opens an ordinary file chooser (`.hapkg` and `.zip`), so it works with a
  keyboard and on a phone. The "Add from a file" dialog also has its own chooser.
- **The browser checks first.** The dialog reads the manifest, checks every file against its
  checksum on this device and shows the title, version, source repository, how many files were
  verified and the address the package updates from. Add stays unavailable when a check fails.
  Nothing is sent to Home Assistant until Add.
- **The server checks everything again** before it writes a file, with the same limits as an
  upload of a ZIP archive.

## The package format

A package is a ZIP archive with the extension `.hapkg`. The root holds `hapkg.json` and the folder
of the item. For an integration that is `custom_components/<domain>/...`; the other kinds follow
the layouts that [add from a file](add-from-a-file.md) recognises.

```json
{
  "format": 1,
  "kind": "integration",
  "domain": "demo_x",
  "version": "1.2.0",
  "title": "Demo X",
  "description": "Shows what a package looks like.",
  "source": {
    "repository": "Ding-Ding-Projects/home-assistant-integrations",
    "path": "integrations/demo_x"
  },
  "update_url": "https://github.com/Ding-Ding-Projects/home-assistant-integrations/releases/latest/download/index.json",
  "files": {
    "custom_components/demo_x/__init__.py": "<sha256 in hex>",
    "custom_components/demo_x/manifest.json": "<sha256 in hex>"
  }
}
```

| Field | Rule |
| --- | --- |
| `format` | Must be `1`. Any other value is refused. |
| `kind` | `integration`, `plugin`, `theme`, `template` or `blueprint`. It must match what the archive holds. |
| `domain` (integration) or `name` | The domain of an integration, the name of anything else. For an integration it must match the domain that was detected. |
| `version` | Required text, at most 64 characters. |
| `title`, `description` | Optional. The title falls back to the domain or name. |
| `source` | Optional. `repository` as `owner/name` and a relative `path`. Shown in the dialog and recorded. |
| `update_url` | Optional, plain `https` only. See automatic updates below. |
| `files` | Required. Every file of the package except `hapkg.json`, each with the lowercase SHA-256 of its content. |

The check refuses a package when a listed file is missing, a listed file does not match its
checksum, or the archive holds a file the manifest does not list. Each case has its own
translated message.

What is recorded at install time, in the marker file the upload already writes: the version, the
source, the update address and whether automatic updates are on. A newer upload of the same item
may replace it only through the normal install confirmation.

## Automatic updates

A package that names an `update_url` is checked for newer versions on the existing Marketplace
schedule (every six hours) and on demand. Only the address recorded when the package was
installed is ever used for that package.

- **The index** is a JSON list (or an object with a `packages` list) of entries with `domain`,
  `kind`, `title`, `version`, `url` (an `https` download of the `.hapkg`), `sha256` (of the
  `.hapkg` file) and optionally `notes`. The monorepo publishes one with each release, pointing at
  the release assets.
- **An update entity** shows the newer version in Settings, Updates, with the notes of the index
  as release notes. The update can be installed from there.
- **"Update automatically"** is a switch per package, on by default for packages with an update
  address. When it is on and a newer version appears, the file is downloaded over https (with the
  same size limit as an upload), its SHA-256 is checked against the index, and then it goes
  through exactly the checks of a dropped package. In addition the kind and domain must match what
  is installed, and an older version is refused. For an integration the existing
  restart-required repair is raised; Home Assistant is never restarted by this.
  When the switch is off, an update is only offered.
- **A failed update changes nothing.** The installed version stays, a repair that stays until it
  succeeds names the exact reason, and the next scheduled check tries again. There is no retry
  loop.
- The Marketplace page lists packages installed from a file on the Installed tab, with the version,
  the switch and the state: up to date, update available with notes, updating, restart needed, or
  failed with the reason.

Updates are tracked for integrations, dashboard cards and themes, which keep a marker file.
Templates and blueprints are single files without one, so they install but are not tracked.

## Security notes

**A package can run code.** An integration runs with the reach of Home Assistant and a dashboard card
with the reach of the browser. The checksums only prove that the file is the one the manifest
describes, not that the author is trustworthy: whoever wrote the manifest wrote the checksums.
Only install packages from people you trust. Automatic updates mean new code from the same
address installs without a prompt; turn the switch off for a package you want to review first.

## Limits

- Same limits as an upload of a ZIP archive: 50 MiB, 20,000 entries, 100 MiB unpacked, no links,
  no encrypted entries.
- The manifest is at most 2 MiB.
- Apps and app repositories are not installed from a file.
- `update_url` and every download address must be plain `https`; a redirect to anything else is
  refused.

## Where it lives

Server: `upload_package.py` (manifest rules), `upload.py` (install, shared by drops and updates),
`package_updates.py` (index, download, install), `update.py` and `switch.py` (entities),
`websocket/packages.py` (the list on the Installed tab). Browser:
`frontend/src/data/marketplace/archive-package.ts`, `archive-upload.ts`,
`ha-marketplace-package-drop.ts`, `ha-marketplace-installed-packages.ts`.

## How it was verified

Server: new tests for a good package, a bad checksum, an unlisted file, a missing file, an unknown
format, a wrong kind and domain, a plain ZIP, a non-https update address, and for updates a newer
version found, an automatic install, a refused download checksum, a refused file checksum, a
refused downgrade, a refused domain change and the switch keeping its choice. Browser: unit tests
for the manifest rules and for inspecting a package. Not confirmed: the drop cover, the menu
entry, the Installed tab cards and the dialog have not been seen in a running browser, the
panel tests need the browser test setup and were not run, and no update has been run against the
real published index.
