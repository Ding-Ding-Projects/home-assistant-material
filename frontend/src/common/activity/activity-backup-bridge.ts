import type { ManagerStateEvent } from "../../data/backup_manager";
import type { HomeAssistant } from "../../types";
import { trackActivityAnnouncements } from "./activity-announcer";
import { activityStore, finishActivity, startActivity } from "./activity-store";

/**
 * Mirrors the backup manager's state into the shared activity list. It only
 * reads events the backup page already receives. The server reports a stage
 * but no amount of work, so the activity is shown as running with no
 * percentage.
 */

type Mode = "create_backup" | "restore_backup" | "receive_backup";

let current: { id: string; mode: Mode } | undefined;

const MODE_KEY: Record<Mode, string> = {
  create_backup: "create",
  restore_backup: "restore",
  receive_backup: "receive",
};

const label = (hass: Pick<HomeAssistant, "localize">, mode: Mode) =>
  hass.localize(`ui.activity.backup.${MODE_KEY[mode]}` as any);

export const reportBackupManagerEvent = (
  hass: Pick<HomeAssistant, "localize">,
  event: ManagerStateEvent
): void => {
  if (current && !activityStore.get(current.id)) {
    current = undefined;
  }
  if (event.manager_state === "idle" || event.manager_state === "blocked") {
    // The page also reports the end of a run as a state change to idle.
    if (current && activityStore.get(current.id)?.state === "running") {
      finishActivity(current.id, "done", {
        message: label(hass, current.mode),
      });
    }
    current = undefined;
    return;
  }
  const mode = event.manager_state;
  if (event.state === "in_progress" || event.state === "core_restart") {
    if (!current || current.mode !== mode) {
      trackActivityAnnouncements(hass.localize as any);
      current = {
        id: startActivity({
          title: label(hass, mode),
          kind: "backup",
          openPath: "/config/backup",
        }),
        mode,
      };
    }
    return;
  }
  if (current && current.mode === mode) {
    if (event.state === "completed") {
      finishActivity(current.id, "done", { message: label(hass, mode) });
    } else {
      finishActivity(current.id, "failed", {
        message: hass.localize("ui.activity.backup.failed_changed" as any),
        details: event.reason ?? undefined,
      });
    }
    current = undefined;
  }
};

/**
 * Called when the page stops watching. The backup carries on in the server,
 * but nothing here can see it any more, so the entry is removed instead of
 * showing a state that nobody is updating.
 */
export const releaseBackupActivity = (): void => {
  if (current && activityStore.get(current.id)?.state === "running") {
    activityStore.dismiss(current.id);
  }
  current = undefined;
};
