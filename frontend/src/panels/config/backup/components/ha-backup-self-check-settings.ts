import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { modeText } from "../../../../common/language-mode/language-mode";
import "../../../../components/ha-button-toggle-group";
import "../../../../components/ha-card";
import "../../../../components/input/ha-input";
import type {
  BackupSelfCheckConfigInfo,
  BackupSelfCheckRemoteMode,
} from "../../../../data/backup";
import {
  fetchBackupSelfCheckConfig,
  updateBackupSelfCheckConfig,
} from "../../../../data/backup";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.backup.self_check.settings";

const MODES: BackupSelfCheckRemoteMode[] = ["light", "full", "off"];

const GIB = 1024 ** 3;

/**
 * How copies of a backup in other places are checked: lightly, in full or
 * not at all, and the size above which a full download never starts by
 * itself. An older Core does not have the setting, and then nothing is shown.
 */
@customElement("ha-backup-self-check-settings")
class HaBackupSelfCheckSettings extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _info?: BackupSelfCheckConfigInfo;

  @state() private _error = false;

  @state() private _saving = false;

  public connectedCallback(): void {
    super.connectedCallback();
    this._load();
  }

  private async _load() {
    try {
      this._info = await fetchBackupSelfCheckConfig(this.hass);
    } catch (_err) {
      // An older Core, or a person who is not an administrator.
      this._info = undefined;
    }
  }

  private _t(key: string, values?: Record<string, string | number>) {
    return modeText(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  protected render() {
    const info = this._info;
    if (!info) {
      return nothing;
    }
    const mode = info.config.remote_mode;
    const limit = info.config.max_full_download_bytes;
    return html`
      <ha-card id="self-check">
        <div class="card-header">${this._t("title")}</div>
        <div class="card-content">
          <p class="help">${this._t("description")}</p>
          <ha-button-toggle-group
            size="s"
            full-width
            .buttons=${MODES.map((value) => ({
              value,
              label: this._t(`mode.${value}`),
            }))}
            .active=${mode}
            .disabled=${this._saving}
            @value-changed=${this._modeChanged}
          ></ha-button-toggle-group>
          <p class="help" aria-live="polite">${this._t(`help.${mode}`)}</p>
          ${
            mode === "full"
              ? html`<ha-input
                  type="number"
                  min="0"
                  step="0.5"
                  .label=${this._t("limit")}
                  .hint=${this._t("limit_help")}
                  .value=${limit ? String(limit / GIB) : ""}
                  .disabled=${this._saving}
                  @change=${this._limitChanged}
                ></ha-input>`
              : nothing
          }
          ${
            this._error
              ? html`<p class="error" role="alert">${this._t("error")}</p>`
              : nothing
          }
        </div>
      </ha-card>
    `;
  }

  private async _modeChanged(ev: CustomEvent<{ value: string }>) {
    ev.stopPropagation();
    const mode = ev.detail.value as BackupSelfCheckRemoteMode;
    if (!this._info || mode === this._info.config.remote_mode) {
      return;
    }
    await this._save({ remote_mode: mode });
  }

  private async _limitChanged(ev: Event) {
    const raw = (ev.currentTarget as HTMLInputElement).value.trim();
    const gib = raw === "" ? undefined : Number(raw);
    if (gib !== undefined && (!Number.isFinite(gib) || gib <= 0)) {
      this._error = true;
      return;
    }
    await this._save({
      max_full_download_bytes:
        gib === undefined ? null : Math.max(1, Math.round(gib * GIB)),
    });
  }

  private async _save(
    changes: Parameters<typeof updateBackupSelfCheckConfig>[1]
  ) {
    this._saving = true;
    this._error = false;
    try {
      const { config } = await updateBackupSelfCheckConfig(this.hass, changes);
      this._info = this._info ? { ...this._info, config } : this._info;
    } catch (_err) {
      this._error = true;
    } finally {
      this._saving = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-card {
          scroll-margin-top: 16px;
        }
        .card-content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        p {
          margin: 0;
        }
        .help {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
        }
        .error {
          color: var(--error-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-self-check-settings": HaBackupSelfCheckSettings;
  }
}
