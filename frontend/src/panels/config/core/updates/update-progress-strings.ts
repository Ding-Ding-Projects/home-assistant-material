/**
 * Labels of the update progress block. They are looked up under
 * `ui.panel.config.updates.progress`; this table is the readable English used
 * until a translation for a key exists, so the block works before the
 * translation files carry these keys.
 */

export const PROGRESS_PREFIX = "ui.panel.config.updates.progress";

export const PROGRESS_FALLBACK: Record<string, string> = {
  "title.core": "Core",
  "title.supervisor": "Supervisor",
  "title.os": "Operating System",
  "stage.backup": "Backup",
  "stage.download": "Download",
  "stage.extract": "Unpack",
  "stage.install": "Install",
  "stage.restart": "Restart",
  "stage.check": "Check version",
  "stage_state.waiting": "waiting",
  "stage_state.running": "running",
  "stage_state.done": "done",
  "stage_state.failed": "failed",
  "stage_state.skipped": "skipped",
  "stage_note.backup_skipped": "No backup asked for",
  "stage_note.backup_skipped_choice": "Skipped by your choice",
  "stage_note.backup_skipped_kind": "No backup for this kind",
  "stage_note.restart_os": "Takes effect after a restart",
  bar_label: "Progress of the update for {name}",
  percent_value: "{percent} percent",
  no_percentage: "No percentage from this device",
  stage_announce: "{name}: {stage}",
  started: "Started {time}",
  elapsed: "Running for {elapsed}",
  estimate: "About {minutes} min left (estimate)",
  queue_place: "{position} of {total}",
  queue_after: "{position} of {total}, after {name}",
  waiting_alone: "Restarts the system, so it goes alone",
  waiting_one_at_a_time: "Only one update runs at a time",
  waiting_for: "Waiting for {name} to finish",
  result_done: "Updated from {from} to {to}",
  result_done_unknown_from: "Updated to {to}",
  result_duration: "Took {elapsed}",
  result_finished_at: "Finished {time}",
  whats_new: "What's new",
  result_failed: "The update did not finish",
  result_failed_at: "It stopped at: {stage}",
  result_reason: "Reason: {reason}",
  result_reason_unknown: "No reason was reported",
  next_steps: "What you can do",
  next_retry: "Press Update to try again once the cause is fixed.",
  next_backup:
    "If something is broken, restore the backup made before the update.",
  next_log: "The log below shows the last lines.",
  "output.title": "Live output",
  "output.show_all": "Show all",
  "output.show_less": "Show less",
  "output.copy": "Copy",
  "output.copied": "Copied",
  "output.follow": "Follow the end",
  "output.empty": "Nothing has been logged yet.",
  "output.none": "This kind of update has no log to show.",
  "output.unavailable":
    "The log cannot be read right now. It returns when Home Assistant is back.",
  "output.masked_note": "Passwords and tokens are hidden.",
  "output.last_lines": "Last lines of the log",
  "output.region": "Log output of the update for {name}",
};

/** Replaces `{name}` placeholders. */
export const fillPlaceholders = (
  text: string,
  values?: Record<string, string | number>
): string =>
  values
    ? text.replace(/\{(\w+)\}/g, (match, key: string) =>
        key in values ? String(values[key]) : match
      )
    : text;

export type ProgressText = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * Builds the label function of the block from a function that looks a full
 * translation key up and returns an empty text when it has none.
 */
export const makeProgressText =
  (
    lookup: (
      fullKey: string,
      values?: Record<string, string | number>
    ) => string
  ): ProgressText =>
  (key, values) => {
    const found = lookup(`${PROGRESS_PREFIX}.${key}`, values);
    if (found) {
      return found;
    }
    return fillPlaceholders(PROGRESS_FALLBACK[key] ?? key, values);
  };
