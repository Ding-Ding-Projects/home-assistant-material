# Backup self-check

After each backup the system checks that the backup opens and is complete, and raises a repair
when a copy is really wrong. It proves a backup opens and is complete, not that a restore would
succeed. Code: the backup component under `core/homeassistant/components/backup/`.

## Modes

A setting under Backup settings, "checking copies in other places", chooses:

| Mode | Behaviour |
| --- | --- |
| Light (default) | Remote copies are asked for, their reported size is compared, and the copy is opened and its first chunk read. No archive download. |
| Full | Remote copies are downloaded and hashed, but never above a size limit (1 GiB by default). |
| Off | Remote copies are not checked. |

A full check of one backup at one place stays available on demand ("Check this copy in full"),
behind a warning that states the download size.

## Why it changed

Originally every self-check fetched the whole archive again from every remote place and hashed
it: a full extra download after every backup, with no cap and no off switch, and a throttled
download raised a false "self-check failed" repair (`89f61a1cb`).

## Three kinds of copy

| Kind | Meaning | Checked |
| --- | --- | --- |
| Local | Core's own storage, or the Supervisor's local storage | In full, in every hosting mode |
| Network | A storage mount on the home network | In full in Light mode up to the size limit, lightly above it |
| Remote | Everything else, including cloud places | Light by default |

When a local copy exists, it is the one read in full. With no local copy, Light mode says "could
not check" with a reason, never a pass and never a failure.

## Results

Each place gets its own result: verified in full, present and size matches, size differs, content
differs, damaged, missing, could not be checked, or not checked. Throttling, timeouts and
provider errors are "could not be checked", not failures. A repair is raised only for a real
mismatch or a missing copy, and it names the place. One check runs at a time, and none while a
backup, upload or restore is running. Every reason has wording in English and Cantonese; an
unknown code becomes a readable sentence, never a raw token.

## The "0 of 4" fault, and how it was fixed

Build 519 told people running the full hosting mode that a backup made seconds ago "could not be
fully checked, 0 of 4 checks passed". The backup was fine; the check misjudged where it was.

1. First fix (`2e4885975`) decided the Supervisor's own storage was local when its location was
   empty. That was a guess.
2. On a real Supervisor the location is the text ".local", never empty, so the copy on the system
   was still classed as a network place. A backup over the 1 GiB limit was only checked lightly,
   and the same message appeared. The tests had passed because their pretend Supervisor used the
   same wrong guess.
3. Second fix (`c373e6a4c`) was read from a running Supervisor: one agent, "hassio.local",
   location ".local". The check now treats it as local by that location and name; the cloud
   location stays remote and any other location is a network place.

The hosted build 2026.11.1.521 could still read "0 of 4" in full hosting mode. The real fix
(`c373e6a4c`) is in build 2026.11.1.523, which the hosted instance now runs. In a real run of
523 a backup over 1 GiB passed the self-check, 4 of 4.

## The card refreshes itself

The self-check card on the Backups page used to stay stale until the page was reloaded. On main
(`c9e3a5e67`) it refreshes by itself when a new backup is checked. Build 523 has the stale card.
In a real run of build 2026.11.1.524 a backup passed its self-check 4 of 4 and the card refreshed
without a reload.

Backup counts on this card and on the Backups setup card read properly in Cantonese (`6db767de3`, on main, not built,
unit-tested only).

## Honest limits

- Providers expose no checksum through the backup agent interface, and the size they report comes
  from a record written at upload, so a light check mostly proves the copy exists and opens. Only a
  full download proves the bytes.
- No real cloud place and no real network mount have been used.

## Verification

- Proven on a throwaway full-hosting copy with the harshest setting (checks of other places off):
  a fresh backup on this system reads "passed", every check that applies passes, and the copy is
  "verified in full" with the size read equal to the size reported. Before the patch the same
  re-check came back light with no reference size. All proof is the service's own answers; nothing
  was seen in a browser.
- A real run of build 523: a backup over 1 GiB passed the self-check, 4 of 4. That confirms the
  fix on a real build; what was read (the service's answers or the page) was not recorded.
- A real run of build 524: a backup passed the self-check 4 of 4 and the card on the page
  refreshed without a reload.
- 45 tests pass in the self-check file, with the pretend Supervisor now carrying the real values.
- Not exercised: network mounts and cloud places on a real Supervisor.
- The Backups page's per-place results and the setting were added in `11e60d596` using a mocked
  backup; the full check and the settings update were not run against a real server.
