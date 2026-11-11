import { mdiDownload } from "@mdi/js";
import { html } from "lit";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import { downloadEmergencyKit } from "../../../../data/backup";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";

// Asks before the stored key is removed. The emergency kit is offered inside
// the confirmation, so the key can be saved first; the key itself is never
// rendered here.
export const confirmTurnOffEncryption = (
  host: HTMLElement,
  hass: HomeAssistant,
  currentKey: string,
  cloudWillBeRemoved: boolean
): Promise<boolean> => {
  const download = () => downloadEmergencyKit(hass, currentKey);
  return showConfirmationDialog(host, {
    title: hass.localize(
      "ui.panel.config.backup.encryption_key.turn_off_title"
    ),
    text: html`
      <p>
        ${hass.localize("ui.panel.config.backup.encryption_key.turn_off_text")}
      </p>
      ${
        cloudWillBeRemoved
          ? html`<p>
              ${hass.localize(
                "ui.panel.config.backup.encryption_key.turn_off_cloud_text"
              )}
            </p>`
          : ""
      }
      <p>
        ${hass.localize(
          "ui.panel.config.backup.encryption_key.turn_off_save_key_text"
        )}
      </p>
      <ha-button appearance="plain" size="s" @click=${download}>
        <ha-svg-icon .path=${mdiDownload} slot="start"></ha-svg-icon>
        ${hass.localize(
          "ui.panel.config.backup.encryption_key.download_emergency_kit_action"
        )}
      </ha-button>
    `,
    confirmText: hass.localize(
      "ui.panel.config.backup.encryption_key.turn_off_action"
    ),
    destructive: true,
  });
};
