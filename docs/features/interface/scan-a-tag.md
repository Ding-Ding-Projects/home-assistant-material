# Scan a tag

A "Scan a tag" button in the New tag dialog, built in batch 46.

## What it does

It listens on this device's reader where the browser has one (Chrome on Android over a secure
address). A tag read here fills the ID field. A scan with the Home Assistant app is added by Home
Assistant itself, and the dialog says so.

## Limits and failure modes

- Safari and Chrome on an iPhone have no reader for web pages; the dialog says that too.
- A page that is not on a secure address cannot use the reader.

## How it was verified

Unit tested. Not seen in a browser and not tried with a real tag. State: built, unit tested,
not yet seen in a running build.
