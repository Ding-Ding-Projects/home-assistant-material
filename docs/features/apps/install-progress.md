# App install progress and log terminal

Installing, updating, rebuilding or removing an app can take minutes. This page describes what the interface shows while that happens, where each number comes from, and what the log terminal can do.

It applies to hosting modes that run the Supervisor (the full mode). Without a Supervisor there is no app store and nothing here appears.

## What you see

- **On the app's store card**: a thin bar and the current step in words, while an install or update of that app is running.
- **On the app's page**: a progress card under the title with the app's icon, the bar, the steps, the time passed, how the work ended, and the log terminal underneath.
- **In the activity list**: installs, rebuilds and removals are listed with their step and percentage. **Show details** opens the same progress card with the terminal in a dialog, so it can be reopened at any time while the work runs. An update started from Settings, System, Updates already has its own row there (the update entity); the app page shows the same update's bar and terminal as well.

You can leave the page: the work and the progress keep going, and coming back shows them again. If the connection to Home Assistant drops and returns, the run is read again from the Supervisor, and the terminal says that the connection was lost.

## Where the numbers come from

The Supervisor describes every install, update, rebuild and removal as a job and sends a `job` event each time one changes. The interface subscribes to those events and, when it starts and after a reconnect, reads the Supervisor's job list. Nothing else is used.

| Shown | Source |
| --- | --- |
| Percentage | The job's `progress`, between 0 and 100. For an install or update it is the progress of pulling the image. |
| Step | Three steps: getting ready, downloading and unpacking the image, finishing. The Supervisor's own install job reports progress but, in the version tested, no stage. When it does send a stage (Downloading, Extracting, Pull complete) the interface uses it and shows it in words. A reported progress value means the pull has begun, and earlier steps count as done when their events were missed. |
| End | The job's `done` flag. A job that ends with entries in its `errors` list is a failure and shows the Supervisor's own message. |
| Time passed | The time since the run began, counted in the browser. |

Rules the interface keeps:

- **A percentage is shown only when the Supervisor reported one.** Until then, and for removals and rebuilds, which report none, the bar shows that it is working without a number.
- **Progress never goes down.** A late or repeated event cannot move the bar or the steps back.
- **A finished run stays finished.**
- **There is no Cancel button.** The Supervisor has no way to stop one of these jobs.
- **There is no list of layers.** The Supervisor does not send per-layer progress, so none is shown rather than invented.
- If a call fails before the Supervisor made a job (for example the machine is out of space), the run ends as failed with that error.

Several apps can install at once; each has its own run.

## The log terminal

The terminal is read only. It shows output and takes no commands. It has two kinds of lines: what the Supervisor reports about the job ("Stage: Downloading", "Progress: 41%", the end or the error), and, after the work ended and the app exists, the app's own log under an "App log" heading line (the same source as the app's Log tab, read every three seconds while the terminal is open). It keeps the newest 5,000 lines and says how many older lines were dropped.

| Feature | How |
| --- | --- |
| Follow | Follows the newest line. Scrolling up pauses; **Jump to newest** brings it back. The pause button pauses and resumes explicitly. |
| Wrap, times, text size | Switches in the toolbar: wrap lines, show times, smaller and larger text. They are remembered in this browser. |
| Search | The product's search field with the pattern workbench button. Plain text by default; `/pattern/flags` is a regular expression. An invalid or risky pattern is reported and never run. Shows "n of m", Next and Previous (or Enter and Shift+Enter) and marks every match. |
| Filter | **Show only matching lines** hides the rest. |
| Levels | Lines are marked and coloured as error, warning, info or debug when the line says so. Errors and warnings also carry an icon and the word, so colour is never the only signal. The level menu hides levels. |
| Colours | Colour codes from app logs are drawn by the same renderer as the logs page. |
| Copy | Copy all lines, copy the selection, copy one line (the button on a line, shown on hover or focus; tap a line to show it on a touch screen). |
| Download | The whole buffer as a text file or as JSON lines (time, source, level, text), named after the app and the time. Nothing is sent anywhere. |
| Keyboard | The pane takes focus. Arrow keys and Page Up and Page Down scroll, Home and End jump, Ctrl+F (or Cmd+F) focuses the search, Escape leaves the pane without closing the dialog. |
| Screen readers | A named, read only region. The newest error is announced once, not the stream. The bar is a progress bar with a spoken value, and a polite message announces step changes, not every percent. |

Right-click (or a long press) on the terminal opens the usual element menu, so its appearance can be edited and it can be locked. The terminal does not take over that event. The wording follows the language mode and the personal wording file like every other surface.

## Limits

- The app's own log is only read once the run ended without a failure and the app exists. Before it is started there may be no log yet; the terminal says so.
- Updates started elsewhere (another browser, the updates page) are picked up from the Supervisor's events, as long as the signed-in user may use the Supervisor.
- An update through the update entity keeps its own entry in the activity list; the app run adds no second one.
- Not seen: a removal reports no stage, so it shows a bar without a percentage.

## Where the code is

- `frontend/src/common/app-jobs/app-job-logic.ts` turns job events into the state the views show (tests in `frontend/test/common/app-jobs`).
- `frontend/src/data/hassio/app-job-tracker.ts` follows runs outside any page and reports to the activity list (tests in `frontend/test/data/hassio`).
- `frontend/src/components/app-job/ha-app-job-progress.ts` is the progress view, `frontend/src/panels/config/apps/dialogs/dialog-app-job-progress.ts` the dialog.
- `frontend/src/components/log-terminal/ha-log-terminal.ts` and `frontend/src/common/log-terminal/log-terminal-logic.ts` are the terminal and its rules (tests in `frontend/test/common/log-terminal`).
- `frontend/src/common/string/ansi-segments.ts` is the colour-code reader shared with the log renderer.
