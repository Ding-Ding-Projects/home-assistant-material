import { mdiDownload } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../../common/dom/fire_event";
import "../../../../../components/ha-switch";
import type { HaSwitch } from "../../../../../components/ha-switch";
import "../../../../../components/item/ha-list-item-base";
import "../../../../../components/list/ha-list-base";
import type { HomeAssistant } from "../../../../../types";
import { showConfirmationDialog } from "../../../../../dialogs/generic/show-dialog-box";
import { showChangeBackupEncryptionKeyDialog } from "../../dialogs/show-dialog-change-backup-encryption-key";
import { showSetBackupEncryptionKeyDialog } from "../../dialogs/show-dialog-set-backup-encryption-key";

import { downloadEmergencyKit } from "../../../../../data/backup";
import { showShowBackupEncryptionKeyDialog } from "../../dialogs/show-dialog-show-backup-encryption-key";

@customElement("ha-backup-config-encryption-key")
class HaBackupConfigEncryptionKey extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public value?: string | null;

  private get _value() {
    return this.value ?? "";
  }

  protected render() {
    const enabled = !!this._value;
    return html`
      <ha-list-base>
        <ha-list-item-base>
          <span slot="headline">
            ${this.hass.localize(
              "ui.panel.config.backup.encryption_key.encrypt_backups"
            )}
          </span>
          <span slot="supporting-text">
            ${this.hass.localize(
              enabled
                ? "ui.panel.config.backup.encryption_key.encrypt_backups_on_description"
                : "ui.panel.config.backup.encryption_key.encrypt_backups_off_description"
            )}
          </span>
          <ha-switch
            slot="end"
            .checked=${enabled}
            @change=${this._toggled}
          ></ha-switch>
        </ha-list-item-base>
        ${enabled ? this._renderKeyActions() : nothing}
      </ha-list-base>
    `;
  }

  private _renderKeyActions() {
    return html`
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.download_emergency_kit"
          )}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.download_emergency_kit_description"
          )}
        </span>
        <ha-button
          appearance="plain"
          slot="end"
          @click=${this._download}
          size="s"
        >
          <ha-svg-icon .path=${mdiDownload} slot="start"></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.download_emergency_kit_action"
          )}
        </ha-button>
      </ha-list-item-base>
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.show_encryption_key"
          )}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.show_encryption_key_description"
          )}
        </span>
        <ha-button appearance="plain" slot="end" @click=${this._show} size="s">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.show_encryption_key_action"
          )}
        </ha-button>
      </ha-list-item-base>
      <ha-list-item-base>
        <span slot="headline">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.change_encryption_key"
          )}
        </span>
        <span slot="supporting-text">
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.change_encryption_key_description"
          )}
        </span>
        <ha-button
          appearance="plain"
          variant="danger"
          size="s"
          slot="end"
          @click=${this._change}
        >
          ${this.hass.localize(
            "ui.panel.config.backup.encryption_key.change_encryption_key_action"
          )}
        </ha-button>
      </ha-list-item-base>
    `;
  }

  private async _toggled(ev: Event) {
    const target = ev.target as HaSwitch;
    const wantsOn = target.checked;
    // The switch follows the stored value, never the click.
    target.checked = !!this._value;
    if (wantsOn === !!this._value) {
      return;
    }
    if (wantsOn) {
      this._set();
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.backup.encryption_key.turn_off_title"
      ),
      text: this.hass.localize(
        "ui.panel.config.backup.encryption_key.turn_off_text"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.backup.encryption_key.turn_off_action"
      ),
      destructive: true,
    });
    if (confirmed) {
      fireEvent(this, "value-changed", { value: null });
    }
  }

  private _download() {
    if (!this._value) {
      return;
    }
    downloadEmergencyKit(this.hass, this._value);
  }

  private _show() {
    showShowBackupEncryptionKeyDialog(this, { currentKey: this._value });
  }

  private _change() {
    showChangeBackupEncryptionKeyDialog(this, {
      currentKey: this._value,
      saveKey: (key) => {
        fireEvent(this, "value-changed", { value: key });
      },
    });
  }

  private _set() {
    showSetBackupEncryptionKeyDialog(this, {
      saveKey: (key) => {
        fireEvent(this, "value-changed", { value: key });
      },
    });
  }

  static styles = css`
    ha-list-base {
      --ha-row-item-padding-inline: 0;
    }
    ha-list-item-base::part(headline),
    ha-list-item-base::part(supporting-text) {
      white-space: wrap;
    }
    ha-button[size="s"] ha-svg-icon {
      --mdc-icon-size: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-config-encryption-key": HaBackupConfigEncryptionKey;
  }
}
