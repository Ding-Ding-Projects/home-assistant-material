# Appearance sync and device-local personal wording

## Where each choice is stored

Appearance choices, including per-element appearance and reading options, are saved on the instance for the signed-in account. The browser caches them. When copies differ, the newer validated appearance setting wins. The status indicator reports save failures without displaying a server response or stored value.

A personal wording import is validated in the browser. Its entries stay in this browser for the signed-in account. To use the same wording on another device, import the file there. Clearing the import restores the shipped labels on this browser. Current clients do not request, upload, overwrite or delete a wording copy saved on the instance by an earlier release.

## Changing accounts

The browser records which signed-in account owns the cached choices. On an account change, previous personal wording and appearance are cleared before restoring the new account’s choices. A cache carrying an old sync timestamp and no owner is cleared as well. A cache from before ownership was recorded, with no sync timestamps, is claimed once by the first account to sign in.

## Verification

The frontend instance-sync tests use distinct synthetic accounts and wording. They check that signed-in clients subscribe to appearance and settings, that a wording import creates no server subscription or upload, and that an account switch discards the former account’s local wording.
