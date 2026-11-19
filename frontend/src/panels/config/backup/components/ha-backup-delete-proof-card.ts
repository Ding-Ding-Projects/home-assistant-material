import { mdiLock } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { resolveTimeZone } from "../../../../common/datetime/resolve-time-zone";
import { fireEvent } from "../../../../common/dom/fire_event";
import { modeText } from "../../../../common/language-mode/language-mode";
import "../../../../components/ha-card";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type {
  BackupContent,
  BackupDeleteProofMark,
} from "../../../../data/backup";
import {
  DELETE_PROOF_CONFIRMATION_ERROR,
  formatMarkedTime,
  setBackupDeleteProof,
} from "../../../../data/backup_delete_proof";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";

declare global {
  interface HASSDomEvents {
    "backup-delete-proof-changed": {
      deleteProof: BackupDeleteProofMark | undefined;
    };
  }
}

/**
 * The delete proof switch of one backup, with who marked it and when, and how
 * many copies it covers. Turning it on needs nothing more; turning it off asks
 * with the two keys and the slider, and the backend refuses the change without
 * that confirmation.
 */
@customElement("ha-backup-delete-proof-card")
class HaBackupDeleteProofCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public backup!: BackupContent;

  @state() private _busy = false;

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(
      this.hass.localize,
      `ui.panel.config.backup.delete_proof.${key}` as any,
      values
    );
  }

  protected render() {
    const mark = this.backup.delete_proof;
    const isAdmin = !!this.hass.user?.is_admin;
    const copies = Object.keys(this.backup.agents).length;
    return html`
      <ha-card>
        <div class="row main">
          <span class="icon ${mark ? "on" : ""}" aria-hidden="true">
            <ha-svg-icon .path=${mdiLock}></ha-svg-icon>
          </span>
          <div class="text">
            <div class="headline" id="delete-proof-label">
              ${this._t("label")}
            </div>
            <div class="supporting">
              ${isAdmin ? this._t("description") : this._t("admin_only")}
            </div>
          </div>
          <ha-switch
            aria-labelledby="delete-proof-label"
            .checked=${!!mark}
            .disabled=${!isAdmin || this._busy}
            @change=${this._toggle}
          ></ha-switch>
        </div>
        ${
          mark
            ? html`
                <div class="row">
                  <span class="label">${this._t("marked")}</span>
                  <span class="value mono">${this._markedText(mark)}</span>
                </div>
                <div class="row">
                  <span class="label">${this._t("copies")}</span>
                  <span class="value">
                    ${this._t("copies_value", { count: copies })}
                  </span>
                </div>
                <div class="row note" role="status">
                  ${this._t("delete_off")}
                </div>
              `
            : nothing
        }
      </ha-card>
    `;
  }

  private _markedText(mark: BackupDeleteProofMark): string {
    const time = formatMarkedTime(
      mark.marked_at,
      this.hass.locale.language,
      resolveTimeZone(this.hass.locale.time_zone, this.hass.config.time_zone)
    );
    const who =
      mark.marked_by && mark.marked_by === this.hass.user?.id
        ? this._t("by_you")
        : mark.marked_by_name || this._t("by_unknown");
    return this._t("marked_value", { time, who });
  }

  private async _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement;
    const turnOn = target.checked;
    // The switch shows the stored state until the change is stored
    target.checked = !turnOn;
    if (turnOn) {
      await this._change(true, false);
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("turn_off_title"),
      text: html`<p>${this._t("turn_off_text", { name: this.backup.name })}</p>
        <p>${this._t("turn_off_hint")}</p>`,
      confirmText: this._t("turn_off_action"),
      dismissText: this._t("keep_action"),
      destructive: true,
    });
    if (confirmed) {
      await this._change(false, true);
    }
  }

  private async _change(turnOn: boolean, confirmed: boolean) {
    this._busy = true;
    try {
      const result = await setBackupDeleteProof(
        this.hass,
        this.backup.backup_id,
        turnOn,
        confirmed
      );
      fireEvent(this, "backup-delete-proof-changed", {
        deleteProof: result.delete_proof ?? undefined,
      });
      fireEvent(this, "ha-refresh-backup-info");
      showToast(this, {
        message: this._t(turnOn ? "turned_on" : "turned_off", {
          name: this.backup.name,
        }),
      });
    } catch (err: any) {
      showToast(this, {
        message: this._t("change_failed", {
          error:
            err?.code === DELETE_PROOF_CONFIRMATION_ERROR
              ? this._t("needs_confirmation")
              : err?.message || String(err),
        }),
        duration: 8000,
        dismissable: true,
      });
    } finally {
      this._busy = false;
    }
  }

  static styles = css`
    ha-card {
      padding: 0 var(--ha-space-4);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 52px;
      border-top: 1px solid var(--divider-color);
    }
    .row.main {
      min-height: 60px;
      border-top: none;
    }
    .icon {
      flex: none;
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      border-radius: var(--ha-border-radius-md, 10px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      --mdc-icon-size: 16px;
    }
    .icon.on {
      background: rgb(from var(--warning-color) r g b / 0.18);
      color: var(--warning-color);
    }
    .text {
      flex: 1;
      min-width: 0;
      padding: var(--ha-space-2) 0;
    }
    .headline {
      font-weight: var(--ha-font-weight-medium);
    }
    .supporting,
    .label,
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .label {
      flex: 1;
      font-size: var(--ha-font-size-m);
    }
    .value {
      text-align: end;
      overflow-wrap: anywhere;
    }
    .mono {
      font-family: var(--ha-font-family-code, monospace);
      font-size: var(--ha-font-size-s);
    }
    .note {
      padding: var(--ha-space-2) 0;
    }
    ha-switch {
      flex: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-delete-proof-card": HaBackupDeleteProofCard;
  }
}
