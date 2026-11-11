# Restoring official Home Assistant backups

This product restores backups made by official Home Assistant Container and Core installs, and
its own backups can be restored by official builds of the same release. This page records what
was really restored, the version rule, and what has not been exercised.

## What was restored for real

Restores were done through the real interface (first-run page and Settings, System, Backups) in a
headless browser, then checked over the WebSocket API: version, both users sign in, entities
(including a renamed helper and its area), helpers, automation, script, scene, dashboard and
history.

| Official version | Protection | Result |
| --- | --- | --- |
| 2026.11.1 | plain | restored, first run and Settings |
| 2026.11.1 | encrypted | wrong key refused with a message, right key restored |
| 2025.1.4 | plain | restored, database schema migrated 48 to 53 |
| 2024.6.4 | plain (old `backup.json` without version or protected keys) | restored, schema migrated 43 to 53 |
| Supervisor-style full backup (crafted from the 2026.11.1 file) | plain | config restored, add-ons and folders listed as unsupported |
| Legacy securetar v1 (crafted, Supervisor key derivation) | encrypted | wrong key refused, right key restored |

Backups with the inner archive named `./homeassistant.tar.gz` (older Supervisor releases),
newer-release backups, four-part versions and free-text names were fixed afterwards; the test
suite and a run against the saved fixture files cover them (see Verification).

## Rules

- **Member names.** The outer archive may name members `backup.json` and `homeassistant.tar[.gz]`
  with or without a leading `./`. Both spellings are found. A wrong password is still reported as
  wrong; an archive with no core archive at all gets its own error and is not reported as a wrong
  password.
- **Version rule.** Only the core release (year.month.patch) counts. The build number this product
  appends as a fourth part (`2026.11.1.119`) and beta or dev suffixes are ignored. A backup is
  accepted when its year.month is the same as or older than the release this product is based on,
  so a later patch of the same month (an official `2026.11.2` backup) is accepted: patch releases
  do not change the storage formats a restore depends on. This is an assumption about upstream
  release practice, not checked per release. A newer year.month (including its betas and dev
  builds) is refused. A version that cannot be parsed is not refused.
- **Pre-check.** The version is checked before the restore is scheduled, so the interface shows
  "this backup was made by a newer version (X); update first" and core is not stopped. The startup
  restore applies the same rule as the last line of defence.
- **Backups made here** record the three-part base version in `backup.json`
  (`homeassistant.version`), so an official build of that release accepts them. The build number
  is not written anywhere in the metadata.
- **Names.** The display name of an uploaded backup is cleaned rather than refused: path
  separators become `-`, a drive-like prefix loses its colon, the text is trimmed and limited to
  200 characters, and an empty name becomes "Backup". The on-disk file name is derived from the
  cleaned name and stays safe.
- **Interface.** A refused restore of an unprotected backup shows the reason on the first-run page
  and in the Settings dialog; a key is asked for only when the backup is protected. The first-run
  restore page no longer lists "Created" and "Content" twice.

## Verification

- Server tests under `core/tests/components/backup/` and `core/tests/test_backup_restore.py`.
- A script that runs the fixed functions against the ten fixture files from the verification run.
  This was done without a running instance and was not seen through the interface.

## Not exercised

- A real Home Assistant OS or Supervised backup, add-on restore and folder restore (not possible in
  Container installs).
- Cloud-stored backups and the Home Assistant Cloud key flow.
- Backups from schemas before 2024.6 and large databases with long migrations.
- Encrypted backups made by official 2025.x releases (one 2026.11.1 encrypted file and a crafted
  legacy file were used).
- Restoring database only or settings only.
