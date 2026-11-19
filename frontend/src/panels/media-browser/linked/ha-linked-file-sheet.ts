import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import { fireEvent } from "../../../common/dom/fire_event";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import {
  renderStackedLabel,
  stackedLabelStyles,
} from "../../../common/language-mode/stacked-label";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-adaptive-dialog";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type {
  LinkedFetchRule,
  LinkedFile,
  LinkedFileSettings,
} from "../../../data/linked_media";
import { removeLinkedFile, updateLinkedFile } from "../../../data/linked_media";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { linkedFailureText, linkedUsedByText } from "./linked-text";

const MIN_SIZE_MB = 1;
const MAX_SIZE_MB = 2000;

/** The sheet of one linked file: how it is fetched, its size limit and what is stored. */
@customElement("ha-linked-file-sheet")
export class HaLinkedFileSheet extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public file?: LinkedFile;

  @property({ type: Boolean }) public open = false;

  @state() private _error = false;

  private _lang = new LanguageModeController(this);

  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._modeLocalize(
      `ui.panel.media-browser.linked.${key}` as any,
      values
    );
  }

  protected render(): TemplateResult {
    const file = this.file;
    const isAdmin = !!this.hass.user?.is_admin;
    return html`
      <ha-adaptive-dialog
        .open=${this.open}
        header-title=${file?.name ?? this._l("sheet.title")}
        header-subtitle=${file?.host ?? ""}
        @closed=${this._closed}
      >
        ${file ? this._renderBody(file, isAdmin) : nothing}
      </ha-adaptive-dialog>
    `;
  }

  private _renderBody(file: LinkedFile, isAdmin: boolean): TemplateResult {
    const stored = file.status.stored_bytes;
    const lastUsed = file.last_used_at
      ? `${this._dateTime(file.last_used_at)} · ${this._l("sheet.by", {
          name: linkedUsedByText(
            this.hass,
            this._modeLocalize,
            file.last_used_by ?? "player"
          ),
        })}`
      : this._l("sheet.never");
    return html`
      <div class="body">
        ${
          this._error
            ? html`<ha-alert alert-type="error"
                >${this._l("sheet.save_failed")}</ha-alert
              >`
            : nothing
        }
        <div class="field">
          <span class="label">${this._l("sheet.fetch")}</span>
          <ha-button-toggle-group
            full-width
            .disabled=${!isAdmin}
            .active=${file.fetch}
            .buttons=${[
              { label: this._l("sheet.each_time"), value: "each_time" },
              { label: this._l("sheet.keep"), value: "keep" },
            ]}
            @value-changed=${this._fetchChanged}
          ></ha-button-toggle-group>
        </div>
        <div class="field">
          <ha-input
            type="number"
            .label=${this._l("sheet.max_size")}
            .value=${String(file.max_size_mb)}
            min=${MIN_SIZE_MB}
            max=${MAX_SIZE_MB}
            .disabled=${!isAdmin}
            @change=${this._sizeChanged}
          >
            <span slot="end" class="unit">MB</span>
          </ha-input>
        </div>
        <label class="row switch-row">
          <span class="text">
            <span>${this._l("add_dialog.home_network")}</span>
            <span class="secondary"
              >${this._l("add_dialog.home_network_hint")}</span
            >
          </span>
          <ha-switch
            .checked=${file.home_network}
            .disabled=${!isAdmin}
            @change=${this._homeNetworkChanged}
          ></ha-switch>
        </label>
        <div class="row">
          <span class="label">${this._l("sheet.last_used")}</span>
          <span class="value">${lastUsed}</span>
        </div>
        ${
          file.last_failure_at
            ? html`<div class="row">
                <span class="label">${this._l("sheet.last_failure")}</span>
                <span class="value error"
                  >${this._dateTime(file.last_failure_at)} ·
                  ${linkedFailureText(this._modeLocalize, file)}</span
                >
              </div>`
            : nothing
        }
        <div class="row">
          <span class="label">${this._l("sheet.stored_here")}</span>
          <span class="value"
            >${stored ? bytesToString(stored, 1) : this._l("sheet.nothing")}</span
          >
        </div>
        ${
          isAdmin && file.address
            ? html`<div class="row">
                  <span class="label">${this._l("sheet.address")}</span>
                  <span class="value address">${file.address}</span>
                </div>
                ${
                  file.address_hidden
                    ? html`<p class="secondary">
                        ${this._l("sheet.address_hidden_note")}
                      </p>`
                    : nothing
                }`
            : nothing
        }
        ${
          isAdmin
            ? html`<ha-button
                variant="danger"
                appearance="plain"
                @click=${this._remove}
                >${renderStackedLabel(this._l("sheet.remove"))}</ha-button
              >`
            : nothing
        }
      </div>
    `;
  }

  private _dateTime(value: string): string {
    return formatDateTime(new Date(value), this.hass.locale, this.hass.config);
  }

  private async _save(settings: LinkedFileSettings): Promise<void> {
    if (!this.file) {
      return;
    }
    this._error = false;
    try {
      await updateLinkedFile(this.hass, this.file.id, settings);
      fireEvent(this, "linked-file-changed");
    } catch (_err) {
      this._error = true;
    }
  }

  private _fetchChanged(ev: CustomEvent<{ value: string }>): void {
    const value = ev.detail.value as LinkedFetchRule;
    if (value !== this.file?.fetch) {
      this._save({ fetch: value });
    }
  }

  private _sizeChanged(ev: Event): void {
    const value = Math.round(Number((ev.target as HaInput).value));
    if (
      Number.isFinite(value) &&
      value >= MIN_SIZE_MB &&
      value <= MAX_SIZE_MB &&
      value !== this.file?.max_size_mb
    ) {
      this._save({ max_size_mb: value });
    }
  }

  private _homeNetworkChanged(ev: Event): void {
    this._save({ home_network: (ev.target as HaSwitch).checked });
  }

  private async _remove(): Promise<void> {
    const file = this.file;
    if (!file) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("sheet.remove_confirm_title", { name: file.name }),
      text: this._l("sheet.remove_confirm_text"),
      confirmText: this._l("sheet.remove"),
      dismissText: this._modeLocalize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await removeLinkedFile(this.hass, file.id);
      fireEvent(this, "linked-file-changed");
      this.open = false;
    } catch (_err) {
      this._error = true;
    }
  }

  private _closed(): void {
    this._error = false;
    fireEvent(this, "linked-sheet-closed");
  }

  static get styles(): CSSResultGroup {
    return [
      stackedLabelStyles,
      css`
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          min-height: 48px;
        }
        .switch-row {
          cursor: pointer;
        }
        .text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .label {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .value {
          text-align: end;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .value.error {
          color: var(--error-color);
        }
        .address {
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-s);
        }
        .secondary {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .unit {
          color: var(--secondary-text-color);
        }
        ha-button {
          align-self: flex-start;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-linked-file-sheet": HaLinkedFileSheet;
  }
}
