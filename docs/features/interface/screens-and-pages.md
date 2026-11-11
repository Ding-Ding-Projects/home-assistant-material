# Status screens, maintenance, name and logo, release notes, backup encryption default

## Status screens and not-found

The starting, connection lost, no-access, loading and error screens are redrawn
(`frontend/src/layouts/ha-init-page.ts`, `hass-error-screen.ts`, `hass-loading-screen.ts`), and
unknown pages under Settings show a not-found screen (`hass-not-found-screen.ts`,
`frontend/src/panels/notfound/`).

## Maintenance

`frontend/src/panels/maintenance/` opens with what needs the person and counts one row per
device.

## Name and logo

Settings, name and logo (`frontend/src/panels/config/identity/`,
`frontend/src/common/identity/`) renames the app and sets its logo in this browser only. About
keeps the product name, and so does every file, update and diagnostic.

## Release notes

`frontend/src/panels/config/release-notes/` lists the changelog by day with a filter for fixed
and new items and links to the page a note is about when its first word names one.

## Backups: encryption off by default

A storage location that needs encryption is off while encryption is off, and a stored key is
never replaced or removed without asking (`frontend/src/panels/config/backup/`).

## Verification

All of this is checked by lint, the type check and unit tests only. None of it has been seen in
a running build.
