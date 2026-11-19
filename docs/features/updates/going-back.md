# Going back to an earlier build

The "Update history" card on Settings, System, Updates lists the Home Assistant Core builds this
browser has seen installed, and offers "Go back to build N" for each older one. Going back to an
older build always makes a backup first. The design board is
`design/canvases/38-progress-drafts-entities/Revert.dc.html`; the look of the games is
`design/canvases/38-progress-drafts-entities/Games.dc.html`.

## The rule

1. Going back makes a backup first. The "backup before updating" choice of the Updates page does
   not turn this off.
2. The older build is installed only after the backup is reported finished and its check passed.
   A backup that failed, was stopped, waited too long or cannot be checked means nothing is
   installed, and the page shows a red card with the reason, "Open Backups" and "Try again".
3. The rule is held by the Supervisor, not only by the page (see "Routes" below).
4. If another backup is already running, going back waits for it (up to two hours) and then makes
   its own.
5. The page shows two steps in order: "Backing up" (start time in 24-hour form, time running, a
   moving bar because the Supervisor reports no percentage, and "Stop before going back") and
   "Go back to build N".
6. The history line records which backup came first: "Went back to build 525 at 21:56 · backup
   21:54", or "no backup, by super confirmation".
7. The only way past the backup is the super confirmation, for one going back.

## What the Supervisor does

`HomeAssistantCore.update()` in `supervisor/supervisor/homeassistant/core.py` compares the
requested version with the installed one (`supervisor/supervisor/homeassistant/downgrade.py`).
When the requested version is older, or the two cannot be compared, it runs the child job
`home_assistant_core_downgrade_backup` before anything is pulled or installed:

- waits while any backup job is running, then starts a partial backup of Home Assistant;
- if another backup started in between, waits and tries again (three attempts);
- checks the finished backup: the archive opens, its metadata reads, the encrypted inner archive
  can be opened with its password, and its size is above zero;
- raises `homeassistant_downgrade_backup_error` with a reason (`failed`, `timed_out`,
  `check_failed`, `stopped`) for anything else. The installed build is then unchanged.

The stage is readable at `GET /core/downgrade_status`. `POST /core/downgrade_stop` asks a running
going back to stop before anything is installed; a backup already being written finishes first,
and then nothing is installed.

A backup restore installs the version stored in the backup; it calls the same update with
`restoring_backup=True` and does not make a further backup.

The check here is the Supervisor's own check of the archive. The backup integration's fuller
self-check (`core/homeassistant/components/backup/self_check.py`) runs inside Core and is not part
of this step.

## The pass to go back without a backup

`POST /core/downgrade_pass` with `version` and `skip_backup_holder` returns a pass. The pass:

- is made by the Supervisor, kept only in its memory, and lost when the Supervisor restarts;
- works once (any presented pass is spent, valid or not);
- is bound to that one older version and to the holder;
- lasts five minutes;
- is only issued for a version older than the installed one.

`POST /core/update` with `skip_backup_pass` and the same `skip_backup_holder` skips the backup
once. Without a valid pass the request is refused with `homeassistant_downgrade_skip_pass_error`
before anything starts.

When the request comes through Home Assistant's websocket (`supervisor/api`), Core replaces any
`skip_backup_holder` the page sent with the id of the signed-in user, so a pass issued to one user
cannot be used by another through the interface. That command already requires an administrator.

## The super confirmation

Five steps, in order, in one sitting: the two keys and the slider; win whack-a-mole (10 moles in 30
seconds, or 10 moles with no time limit); win four in a row against the home (a draw or a loss
means play again); spin a fair coin until it lands heads; click a cookie to 100. Leaving the page
or hiding the tab starts again from step 1. "Make a backup instead" is the primary button
throughout. Only after the fifth step does the page ask the Supervisor for a pass and start the
going back with it.

Each game is a set of real buttons of at least 44 px, works from the keyboard (keys 1 to 6 for the
holes, 1 to 7 for the columns, Space or Enter for the coin and cookie), writes its score, turn,
time and result as text in a live region, and shows the result without movement when reduced
motion is asked for by the system, the accessibility tools or low stimulation. Sounds are short
tones made by the page through the existing action sounds, so they follow the sound switch, the
volume, quiet hours and low stimulation. The coin uses one random bit from
`crypto.getRandomValues`. The game rules are plain functions in
`frontend/src/panels/config/core/updates/going-back/game-logic.ts`.

### Honest limits of the super confirmation

The games run in the browser. They are a deliberate speed bump for a person, not a security
barrier against someone who already controls an administrator session: such a person can call
`/core/downgrade_pass` directly. The real gates are an administrator sign-in, the two keys and the
pass the Supervisor issues. The history line records "no backup, by super confirmation" whenever
the pass was used.

## Routes

Covered (the Supervisor makes and checks the backup first):

- the "Go back to build N" button on the Updates page;
- `POST /core/update` and the legacy `POST /homeassistant/update` on the Supervisor API, from any
  caller, including the `ha core update --version` command line and apps with the manager role;
- the Core update entity's install action with a version, and the `hassio/update/core` websocket
  command, which both call the Supervisor;
- automatic updates, if one were ever to target an older version.

Not covered:

- a backup restore, which installs the backup's own version by design;
- installations without the Supervisor (container and core installations), where the page offers
  no going back at all and the operator replaces the image by hand;
- anyone with shell access to the host or the Supervisor container, or with the Supervisor's own
  token, who can do anything, including issuing a pass for any holder or replacing the image.

## State

Built and covered by unit tests (Supervisor, Core websocket proxy, and the frontend's game logic,
step order and going back view). Not yet seen in a browser, and no real going back has been run
against a real Supervisor. Reloading the page while the backup step runs does not stop it; use
"Stop before going back" first.
