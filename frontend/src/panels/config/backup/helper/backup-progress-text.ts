import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.backup.overview.progress_detail.";

/**
 * English wording for the progress card. It is the fallback used whenever a
 * translation key has not been added to the translation files yet.
 */
export const PROGRESS_TEXT: Record<string, string> = {
  "stage.create.home_assistant": "Home Assistant settings and database",
  "stage.create.apps": "Apps",
  "stage.create.folders": "Folders and media",
  "stage.create.await_restarts": "Waiting for apps to restart",
  "stage.create.upload": "Uploading to locations",
  "stage.create.cleaning_up": "Removing old backups",
  "stage.receive.receive_file": "Receiving the backup file",
  "stage.receive.upload": "Uploading to locations",
  "stage.restore.download_from_agent": "Getting the backup from its location",
  "stage.restore.repositories": "App sources and container settings",
  "stage.restore.home_assistant": "Home Assistant settings and database",
  "stage.restore.remove_delta": "Removing apps that are not in the backup",
  "stage.restore.apps": "Apps",
  "stage.restore.folders": "Folders and media",
  "stage.restore.await_restarts": "Waiting for apps to restart",
  "stage.restore.restart_check": "Restarting and checking Home Assistant",
  "state.waiting": "Waiting",
  "state.running": "Running",
  "state.done": "Done",
  "state.failed": "Failed",
  "state.skipped": "Not needed",
  "overall.step": "Step {step} of {steps}",
  "overall.uploading_to": "Uploading to {names}",
  "overall.upload_percent": "{percent}% uploaded",
  "overall.elapsed": "Elapsed {time}",
  "overall.restore_note":
    "Home Assistant may restart during a restore. This page reconnects by itself.",
  "stage.started": "Started {time}",
  "stage.took": "Took {time}",
  "stage.started_approx": "Seen from {time}",
  "bytes.of": "{done} of {total}",
  "bytes.speed": "{speed}/s",
  "bytes.eta": "About {time} left (estimate)",
  "bytes.no_progress":
    "This location does not report progress. It shows as done when it finishes.",
  "bytes.preparing": "Waiting for the first data to be sent",
  "location.waiting_for_report": "Waiting for this location",
  "log.title": "Output",
  "log.show_all": "Show all",
  "log.show_less": "Show less",
  "log.copy": "Copy",
  "log.copied": "Copied",
  "log.follow": "Follow",
  "log.empty": "No output has been written yet.",
  "log.unavailable":
    "No output source is available for this operation on this system.",
  "log.sources": "Sources: {sources}",
  "log.masked_note": "Tokens, passwords, keys and signed addresses are hidden.",
  "button.running.create": "Backup running",
  "button.running.receive": "Upload running",
  "button.running.restore": "Restore running",
  "button.no_cancel": "This operation cannot be cancelled",
  "result.success.create": "Backup completed",
  "result.success.receive": "Upload completed",
  "result.success.restore": "Restore completed",
  "result.failed.create": "Backup failed",
  "result.failed.receive": "Upload failed",
  "result.failed.restore": "Restore failed",
  "result.duration": "Took {time}",
  "result.failed_at": "Failed during: {stage}",
  "result.reason": "Reason: {reason}",
  "result.location_failed": "Did not finish",
  "result.location_error": "Reason: {reason}",
  "result.retry_hint":
    "Create a new backup to try again. If one location keeps failing, check its settings.",
  "result.last_lines": "Last output lines",
  "result.dismiss": "Dismiss",
  "result.stored_in": "Stored in",
  "result.self_check_pending":
    "The automatic check of this backup runs after it is saved.",
  "result.self_check": "Backup check",
  "a11y.progress": "{name} progress",
  "a11y.stage_changed": "{stage}: {state}",
};

const interpolate = (
  text: string,
  params?: Record<string, string | number>
): string =>
  params
    ? text.replace(/\{(\w+)\}/g, (match, name) =>
        name in params ? String(params[name]) : match
      )
    : text;

/** Localized text for the card, falling back to readable English. */
export const progressText = (
  hass: Pick<HomeAssistant, "localize">,
  key: string,
  params?: Record<string, string | number>
): string => {
  const localized = hass.localize((PREFIX + key) as any, params as any);
  return localized || interpolate(PROGRESS_TEXT[key] ?? key, params);
};
