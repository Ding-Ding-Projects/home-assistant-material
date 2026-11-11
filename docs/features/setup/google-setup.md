# Google setup

Code: `core/homeassistant/components/google_setup/`, `frontend/src/panels/config/google-setup/`.

## What it does

A page under Settings sets Google up once for every Google integration:

1. Drop a service account key file. It is used once to switch on the Google services the
   integrations need (Drive, Calendar, Gmail, Sheets, Tasks, Photos, YouTube, Nest, Assistant,
   Pub/Sub) through the Service Usage API, with a tick for each. The key is held in memory for
   that request only and is never stored.
2. The page shows the return address with a copy button and the exact console page where the
   OAuth client is created. That step is manual; Google offers no way to create the client by
   interface. Console links open only on a click.
3. Drop the downloaded client file. It is parsed and kept as an application
   credential shared by the Google integrations.
4. Sign in with Google once.

## Server commands (administrators only)

`google_setup/status` and `google_setup/enable_apis`. The only two hosts contacted are the
Google token host and the Service Usage host.

## Security

Key contents are never logged or displayed; error messages are fixed strings that do not contain
key material. A debug log could once have contained the key file; that is fixed, and secrets are
masked more widely in all setup wizards.

## Verification

Server commands were driven on a running copy on 10 November 2026: status, and a bad key
refused without being echoed or logged. Enabling services with a real key, the client file, the
sign-in and the status page for connected Google integrations have not been exercised, and the
page has not been seen. Not built: guidance for the separate paid registration that Nest needs.
