# Export and import integrations

Two related features on the Integrations pages, for administrators only:

1. **The list.** The Integrations page can export the list of installed integrations and import
   such a list from another system. The file names what is installed and the kinds of entity each
   integration makes. It carries no sign-in and no settings.
2. **One integration's settings.** Each entry's menu can export that entry's settings and import
   a settings file into the same entry, with Undo.

Neither import ever creates an entry. Importing a list only compares; importing settings only
changes the existing entry it was opened from.

The server part is the built-in `integration_transfer` integration
(`core/homeassistant/components/integration_transfer/`), set up by default. The interface is in
`frontend/src/panels/config/integrations/transfer/`, with the file checks in
`frontend/src/data/integration_transfer_file.ts`.

## The list

### Exporting

Integrations, More menu, **Export the list**. Two switches:

- **Names you gave** (off by default): adds the entry titles, such as "Kitchen hub". Off, only
  the integration's own name is written.
- **How many of each** (on by default): adds the number of devices and the number of entities of
  each kind. Off, only the kinds are written.

The preview is drawn from the same object that is saved, and the exact file text can be opened
under it. **Save file** downloads `integrations-list.json` in the browser; **Copy as text** copies
the same text. Nothing is sent anywhere.

### File format

```json
{
  "kind": "home-assistant-material/integrations-list",
  "format": 1,
  "build": "2026.11.2",
  "made_at": "2026-11-19T19:40:00+00:00",
  "names_included": false,
  "counts_included": true,
  "integrations": [
    {
      "domain": "mqtt",
      "name": "MQTT",
      "source": "built_in",
      "version": null,
      "entries": 1,
      "entity_kinds": ["cover", "light", "sensor", "switch"],
      "entity_counts": { "cover": 2, "light": 6, "sensor": 41, "switch": 9 },
      "devices": 12
    }
  ]
}
```

- `source` is `built_in` or `custom` (added by the owner); `version` is set for custom ones only.
- `titles` (a list of entry titles) appears only when **Names you gave** is on.
- `entity_counts` and `devices` appear only when **How many of each** is on.
- Ignored entries are not counted. Domains are listed in name order.

What the list never contains: entry data or options, unique ids, entity ids, device names, states,
addresses, sign-ins, or anything from the private Undo store described below.

### Importing

Integrations, More menu, **Import a list**, then choose a file. The file is checked in the
browser first and refused whole when it is over 1 MB, not JSON, of another `kind` or `format`, or
of the wrong shape (an unsafe domain name, a duplicate domain, a negative or fractional count, an
unknown `source`). Every string is shown as text; nothing named in the file is fetched, run or
used as a path. Unknown fields are dropped.

The domains are then sent to the server, which reports for each one whether this system knows it,
whether it can be set up through its own setup, and how many entries it has here. The server does
not look up any name that is not a plain domain (lowercase letters, digits and underscores, at
most 64 characters). The rows fall into three groups, which scroll sideways on a phone:

- **Not here yet**: known here, can be set up, no entry yet. Each row has **Set up**, which opens
  that integration's own setup through the same path as Add integration. One setup runs at a
  time.
- **Already here**: at least one entry exists here. After a setup closes, the comparison is asked
  again, so a row only moves here when an entry really exists.
- **Cannot add**: a custom integration that is not installed here, a domain this system does not
  know, or an integration that has no setup on this page.

## One integration's settings

### What counts as a sign-in

A key is treated as a sign-in, together with everything nested under it, when any of these hold
(names are compared lowercased, with `-` and spaces read as `_`):

- it is one of: `access_token`, `api_key`, `apikey`, `auth`, `authorization`, `client_id`,
  `client_secret`, `cloudhook_url`, `code`, `cookie`, `cookies`, `credential`, `credentials`,
  `email`, `key`, `login`, `pass`, `passcode`, `passphrase`, `passwd`, `password`, `pin`,
  `private_key`, `refresh_token`, `secret`, `session`, `token`, `user`, `username`, `webhook_id`;
- it ends with `_auth`, `_code`, `_credential`, `_credentials`, `_email`, `_id_token`, `_key`,
  `_login`, `_pass`, `_pin`, `_session`, `_token`, `_user`, `_username`, `_webhook_id` or
  `_cloudhook_url`;
- it contains `password`, `passwd`, `passphrase`, `secret`, `token`, `apikey`, `api_key`,
  `credential`, `cookie`, `private`, `webhook` or `cloudhook`;
- the integration's diagnostics module declares it in a module-level collection whose name
  contains `REDACT` (for example `TO_REDACT`).

The rule is deliberately broad: a false positive only leaves a harmless setting out of the file
(and keeps it as it is on the importing system), while a false negative would put a credential in
a plain file. Integrations that store sign-ins under unusual names not covered above would still
leak them into a plain export; the diagnostics redaction list is the second line for that case.

### Exporting

Entry menu, **Export its settings**. The page shows how many options and other settings are
included and names the sign-ins that are left out. **Save file** downloads `<domain>-settings.json`
with the options and data, every sign-in removed, and `left_out` listing the dotted names (never
the values) of what was removed.

With **Sign-ins** turned on (only after the two keys and the slider), the file is always locked.
The password must be typed twice, be 14 characters or more and pass the same strength check as the
container registry storage lock. The file is then `<domain>-settings-locked.json`:

- a random 256-bit key is wrapped by a key derived from the password with Argon2id (256 MiB,
  8 passes, 4 lanes) and a random salt;
- the full options and data are sealed with AES-256-GCM using the existing primitives in
  `registry_storage/crypto.py` (`wrap_vault_key`, `seal_bytes`); no new cryptography was written;
- the file keeps `kind`, `format`, `domain` and the entry version in the clear so a mismatch is
  refused before any password is asked for; everything else is in the sealed part.

**The password travels over the authenticated WebSocket connection.** The locked export command
(`integration_transfer/settings/export_locked`) and the preview and apply commands for a locked
file carry the password in the message. This differs from the container registry storage setup,
which takes its password through a config flow. The password is used in memory for that one call
and is never stored, logged or returned; error responses carry only a short code. Routing these
through a flow so that no WebSocket command carries the password was not done.

### Importing

Entry menu, **Import its settings**, then choose a file:

1. The browser checks the size (1 MB), `kind`, `format` and that the file names this entry's
   integration. A locked file asks for its password.
2. **Preview** (`integration_transfer/settings/preview`) checks everything again on the server,
   including that the file was made for the same entry version, and returns every change by name:
   old and new values for ordinary settings (with any sign-in nested inside a value removed),
   `changed` for sign-ins, and `kept as it is here` for sign-ins the file does not carry. Nothing
   is changed.
3. **Apply N changes** needs the two keys and the slider
   (`integration_transfer/settings/apply`, with `confirmed`). The server works out the changes
   again, refuses a file with no changes or a disabled entry, saves the entry's current data and
   options for Undo, updates the entry and reloads it. If the reload fails or the entry is not
   loaded afterwards, the previous settings are put back, the entry is reloaded again, and the
   import is refused with `reload_failed`, so a refused import changes nothing.
4. **Undo** (`integration_transfer/settings/undo`) puts back the saved settings and reloads.

Options in the file replace the entry's options; data in the file replaces the entry's data, except
that sign-ins the file does not carry are kept as they are here, at every level. Settings that
exist here but not in the file are removed and shown as removed in the preview.

### The Undo store

`.storage/integration_transfer.undo`, written with private file permissions. It holds, per entry,
the data and options as they were before the latest import (one record per entry), including
sign-ins, so it is as sensitive as the config entries file. A record is removed when Undo is used
or when the entry is deleted. The list export never reads it.

## WebSocket commands

All require an administrator.

| Command | Purpose |
| --- | --- |
| `integration_transfer/list` | The list, with `titles` (default off) and `counts` (default on) |
| `integration_transfer/compare` | What this system knows about each of up to 2000 domains |
| `integration_transfer/settings/export` | One entry's settings without sign-ins |
| `integration_transfer/settings/export_locked` | One entry's full settings, locked; needs `password`, `password_confirm` and `confirmed` |
| `integration_transfer/settings/preview` | The changes a file would make |
| `integration_transfer/settings/apply` | Apply a file; needs `confirmed` |
| `integration_transfer/settings/undo` | Put back the settings from before the latest import |
| `integration_transfer/settings/undo_info` | Whether Undo is available for an entry |

Error codes: `confirmation_required`, `password_too_weak`, `password_mismatch`,
`password_required`, `wrong_password`, `damaged`, `not_json`, `too_large`, `wrong_kind`,
`wrong_shape`, `wrong_domain`, `wrong_version`, `no_changes`, `entry_disabled`, `reload_failed`,
`nothing_to_undo`, `not_found`.

## Differences from the design board

- The board's settings export groups non-option settings as "Address and port", which is specific
  to MQTT. The page shows "Other settings" for all integrations.
- The board says "Sign-ins in the file: None: you will sign in again". Sign-ins missing from a file
  are kept as they are on this system, so the page says "None: the ones here are kept".
- A third "Cannot add" reason exists for integrations this system knows but cannot set up from the
  page (configured in YAML only).
- A settings file made for another version of the entry's stored settings is refused.

## Verified

- Python files compile; the sign-in rule tests were run on their own. The WebSocket tests in
  `core/tests/components/integration_transfer/` were written against the project's fixtures but
  have not been run, because the Home Assistant test environment is not available on the build
  host.
- The file checks and grouping are covered by `frontend/test/data/integration_transfer_file.test.ts`
  and pass.
- Not yet seen in a browser or on a running instance.
