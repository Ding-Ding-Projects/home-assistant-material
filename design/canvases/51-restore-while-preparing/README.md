# Canvas 51: restore a backup while the first start is preparing

Today the first start shows "Preparing Home Assistant" with a progress bar, the logs and the network check for many minutes, and a backup can be restored only after that finishes, from the welcome step. This canvas draws a card on that same preparing page, "Restore a backup while you wait": upload a backup while the page is still preparing, check its details, enter the encryption key if it has one, and press Continue. The restore is then queued on the server and carries on by itself, so the person can close the page or walk away and come back to the sign-in screen. One canvas page per screen size, a title note per page and a note beside every board.

3 boards: 2 phone boards at 390 x 844 and 1 fluid wide board at 1280 px.

The default stage of every board shows the new design. `Main.dc.html` also has a `before` stage that reproduces today's page, marked "Today". None of these boards has a search field.

## On a phone

On a phone: the first-start preparing page gains a card to upload and check a backup while Home Assistant is still preparing, and after Continue the restore is queued and carries on by itself through to the sign-in screen.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `Main.dc.html` | Phone, 390 x 844 | `after` | after, uploading, details, protected, wrong-key, upload-error, before |
| `QueuedPhone.dc.html` | Phone, 390 x 844 | `after` | after, restoring, starting, done, failed, cancelled |

**Preparing page with a backup, phone** (`Main.dc.html`). Shows the first-start "Preparing Home Assistant" page on a phone. The new design adds a card, "Restore a backup while you wait": choose a .tar file, watch it upload with size, speed and time left, check the backup details, enter the encryption key if it is protected, then tap Continue. The restore is queued, the card lists the four steps that follow, and the page can be closed. Preparing progress, logs and the network check stay, folded under Show details. Before: only the logo, the progress bar and the logs; a backup can be restored only after preparing finishes. Try: tap Choose backup file and let the upload run to the details; on the protected stage type K7QD-M2XR-9TBW and tap Check key, or a wrong key; tap Continue, then Cancel restore and Keep restore. The uploading stage holds at 31%. Unbuilt: all of it; the upload and the key check are simulated on the board. Tweaks: accent, motion, theme (dark or light), stage.

**Restore queued, away from the phone** (`QueuedPhone.dc.html`). Shows the first-start page after Continue, when a backup restore is queued and the person walks away. The page becomes a calm summary: the queued backup, a message that it carries on without you, and a real ordered list of four steps (preparing, restoring, starting, ready to sign in), each with its state written as text and its own progress. Cancel restore asks first and works only until the restore starts. When finished it moves to the sign-in screen with a "Restored from" note; a failure says what went wrong and offers Try again or Set up without the backup, which removes the uploaded backup only after you confirm. Try: press Cancel restore and confirm, then choose another file to see the upload progress; open Show details for the logs and network check; on the failed stage press Set up without the backup, then Back to the restore. Unbuilt: all of it, including the server-side queue. Tweaks: accent, motion, theme (dark or light), stage.

## On a wide window

On a wide window: the same preparing page in two columns, with progress, logs and the network check on the left and the backup card with a drop zone, upload progress, details and Continue on the right.

| Board | Size | Default stage | Stages |
| --- | --- | --- | --- |
| `LandingWide.dc.html` | Wide, 1280 x 860, fluid | `after` | after, uploading, details, queued, done |

**Preparing page with a backup, wide window** (`LandingWide.dc.html`). Shows the first-start preparing page on a wide window with a backup card beside it. The left column keeps today's progress bar, folded logs and the compact network check; the right column adds "Restore a backup while you wait" with a drop zone and Choose backup file, a live upload bar with Cancel, the backup details, and Continue. Continue queues the restore and shows an ordered step list with each state as text and a Cancel restore button; the done stage is the sign-in screen with the restored note. Preparing progress never goes backwards and the log only grows. The language picker and Help sit below; the columns stack at phone width. Try: choose a file and watch the upload finish (played at five times real speed), press Continue then Cancel restore, open Show details and read the added log lines. Unbuilt: all of it; the protected-key, failure and network-problem states are not on this board. Tweaks: accent, motion, theme (dark or light), stage.

## Tweaks

Every board declares the same four Tweaks: `accent` (colour: `#98CBFF`, `#7DD3A8`, `#FFB874`, `#D0BCFF`; default `#98CBFF`), `motion` (on or off; default on), `theme` (`dark` or `light`; default `dark`) and `stage` (that board's stages; default `after`).

## State

Design only; none of it is built yet, including the upload during preparing, the key check and the server-side restore queue. Each board's script was checked under Node for every stage in both themes with motion on and off.
