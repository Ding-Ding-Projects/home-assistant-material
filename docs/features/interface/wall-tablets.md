# Wall tablets

Built in batch 52: a mode for tablets mounted on a wall, and a server integration, `wall_tablet`.

## Wall tablet mode

- Burn-in drift: the picture moves slightly over time.
- Lockdown with a PIN to leave it.
- Wake on motion, where the device allows.
- An opt-in screen wake lock.

## The `wall_tablet` integration

An internal integration in the default set (`core/homeassistant/components/wall_tablet/`). A
tablet announces itself, and the interface can list tablets, send a command and forget one.
Websocket commands: announce, list, command, forget. Services: `wall_tablet.wake`, `sleep`,
`reload` and `navigate` (with a required `path`; each takes an optional `tablet_id`).

## Limits and failure modes

- A path starting with two slashes is refused, so a command cannot send a tablet to another site.
- The wake lock and motion wake depend on what the browser offers.
- Settings for wall tablets are part of the page that holds them, not their own page yet.
- Not built: home-screen widgets and car actions, which need the native phone apps that are not in
  this repository.

## How it was verified

On a throwaway instance with the changed server files mounted, the instance started with
`wall_tablet` loaded and its four services; list, command and forget answered; a path starting
with two slashes was refused. The first run found that the navigate service was registered without
its first argument, which made set-up fail and left the websocket commands missing; fixed before
the push. The interface was not seen. State: server run for real, interface built, unit tested,
not yet seen in a running build.
