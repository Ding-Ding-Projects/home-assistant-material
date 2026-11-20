import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-spinner";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import type {
  SettingsChange,
  SettingsPreview,
  UndoInfo,
} from "../../../../data/integration_transfer";
import {
  applyEntrySettings,
  fetchEntrySettingsUndo,
  MAX_TRANSFER_FILE_BYTES,
  previewEntrySettings,
  undoEntrySettings,
} from "../../../../data/integration_transfer";
import {
  formatMadeAt,
  readSettingsFileHead,
  settingValueText,
} from "../../../../data/integration_transfer_file";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import type { EntrySettingsDialogParams } from "./show-transfer-dialogs";
import { TransferText } from "./transfer-text";

const KNOWN_ERRORS = new Set([
  "too_large",
  "not_json",
  "wrong_kind",
  "wrong_shape",
  "wrong_domain",
  "wrong_version",
  "password_required",
  "wrong_password",
  "damaged",
  "reload_failed",
  "entry_disabled",
  "no_changes",
  "nothing_to_undo",
  "confirmation_required",
]);

const errorCode = (err: unknown): string => {
  const code = (err as { code?: string } | undefined)?.code ?? "";
  return KNOWN_ERRORS.has(code) ? code : "unknown";
};

/**
 * Import settings into this one entry. A file only fits the integration it
 * names; every change is shown by name first, and nothing is applied until the
 * two keys and the slider. Sign-in values are never shown.
 */
@customElement("dialog-entry-settings-import")
export class DialogEntrySettingsImport extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: EntrySettingsDialogParams;

  @state() private _open = false;

  @state() private _fileName?: string;

  @state() private _locked = false;

  @state() private _password = "";

  @state() private _preview?: SettingsPreview;

  @state() private _error?: string;

  @state() private _busy = false;

  @state() private _applied?: number;

  @state() private _undo?: UndoInfo;

  @query("input[type=file]") private _input?: HTMLInputElement;

  // Kept only while the dialog is open, to send for the preview and the apply.
  private _content?: string;

  private _text = new TransferText(this, () => this.hass);

  public showDialog(params: EntrySettingsDialogParams): void {
    this._params = params;
    this._open = true;
    this._loadUndo();
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._reset();
    this._undo = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _reset(): void {
    this._fileName = undefined;
    this._content = undefined;
    this._locked = false;
    this._password = "";
    this._preview = undefined;
    this._error = undefined;
    this._applied = undefined;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._text.t(key, values);
  }

  private async _loadUndo(): Promise<void> {
    if (!this._params) {
      return;
    }
    try {
      this._undo = await fetchEntrySettingsUndo(
        this.hass,
        this._params.entry.entry_id
      );
    } catch (_err: unknown) {
      this._undo = undefined;
    }
  }

  private get _changeCount(): number {
    return (this._preview?.changes ?? []).filter(
      (change) => change.change !== "kept"
    ).length;
  }

  protected render() {
    if (!this._params || !this._open) {
      return nothing;
    }
    const count = this._changeCount;
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("settings_import.title")}
        header-subtitle=${`${this._params.integrationName} · ${this._params.entry.title}`}
        @closed=${this._dialogClosed}
      >
        <input
          type="file"
          accept=".json,application/json"
          tabindex="-1"
          aria-hidden="true"
          @change=${this._fileChosen}
        />
        <p class="note">${this._t("settings_import.only_this_entry")}</p>
        <div class="file">
          <span class="file-name">${this._fileName ?? ""}</span>
          <ha-button appearance="filled" @click=${this._choose}>
            ${this._t("choose_file")}
          </ha-button>
        </div>
        ${
          this._locked && !this._preview
            ? html`<ha-input
                  type="password"
                  password-toggle
                  autocomplete="off"
                  .label=${this._t("settings_import.password")}
                  .value=${this._password}
                  .disabled=${this._busy}
                  @input=${this._passwordInput}
                ></ha-input>
                <ha-button
                  class="show"
                  .disabled=${this._busy || !this._password}
                  @click=${this._loadPreview}
                  >${this._t("settings_import.show_changes")}</ha-button
                >`
            : nothing
        }
        ${
          this._busy
            ? html`<div class="loading">
                <ha-spinner size="small"></ha-spinner>${this._t("loading")}
              </div>`
            : nothing
        }
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${this._renderApplied()} ${this._renderPreview()}
        ${
          this._undo?.available && this._applied === undefined
            ? html`<ha-button
                appearance="plain"
                class="undo"
                .disabled=${this._busy}
                @click=${this._undoImport}
              >
                ${this._t("settings_import.undo_last", {
                  time: formatMadeAt(
                    this._undo.saved_at ?? "",
                    this.hass.locale.language
                  ),
                })}
              </ha-button>`
            : nothing
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this._applied === undefined ? this._t("cancel") : this._t("close")}
          </ha-button>
          ${
            this._applied === undefined
              ? html`<ha-button
                  slot="primaryAction"
                  .disabled=${this._busy || !this._preview || count === 0}
                  @click=${this._apply}
                >
                  ${this._t("settings_import.apply", { count })}
                </ha-button>`
              : nothing
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderApplied() {
    if (this._applied === undefined) {
      return nothing;
    }
    return html`<ha-alert alert-type="success">
      ${this._t("settings_import.applied", { count: this._applied })}
      <ha-button
        slot="action"
        appearance="plain"
        .disabled=${this._busy}
        @click=${this._undoImport}
        >${this._t("settings_import.undo")}</ha-button
      >
    </ha-alert>`;
  }

  private _renderPreview() {
    const preview = this._preview;
    if (!preview || !this._params || this._applied !== undefined) {
      return nothing;
    }
    const count = this._changeCount;
    const signins = preview.signins_in_file.length;
    return html`
      <div class="summary">
        <div class="row">
          <span>${this._t("settings_import.file_for")}</span>
          <span class="value">${this._params.integrationName}</span>
        </div>
        <div class="row">
          <span>${this._t("settings_import.will_change")}</span>
          <span class="value"
            >${this._t("settings_import.change_count", { count })}</span
          >
        </div>
        <div class="row">
          <span>${this._t("settings_import.signins_in_file")}</span>
          <span class="value"
            >${
              signins
                ? this._t("settings_import.signins_some", { count: signins })
                : this._t("settings_import.signins_none")
            }</span
          >
        </div>
      </div>
      ${
        preview.changes.length
          ? html`<ul class="changes">
              ${preview.changes.map((change) => this._renderChange(change))}
            </ul>`
          : html`<p class="note">${this._t("settings_import.no_changes")}</p>`
      }
      <p class="note">${this._t("settings_import.apply_note")}</p>
    `;
  }

  private _renderChange(change: SettingsChange) {
    let text: string;
    if (change.signin) {
      text =
        change.change === "kept"
          ? this._t("settings_import.kept")
          : this._t("settings_import.changed");
    } else if (change.change === "added") {
      text = this._t("settings_import.added", {
        value: settingValueText(change.new),
      });
    } else if (change.change === "removed") {
      text = this._t("settings_import.removed", {
        value: settingValueText(change.old),
      });
    } else {
      text = this._t("settings_import.old_to_new", {
        old: settingValueText(change.old),
        new: settingValueText(change.new),
      });
    }
    return html`<li>
      <span class="name">${change.name}</span>
      <span class="what">${text}</span>
    </li>`;
  }

  private _choose(): void {
    this._input?.click();
  }

  private _passwordInput(ev: Event): void {
    this._password = (ev.target as HaInput).value ?? "";
  }

  private async _fileChosen(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file || !this._params) {
      return;
    }
    this._reset();
    this._fileName = file.name;
    if (file.size > MAX_TRANSFER_FILE_BYTES) {
      this._error = this._t("settings_import.errors.too_large");
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (_err: unknown) {
      this._error = this._t("settings_import.errors.unknown");
      return;
    }
    const head = readSettingsFileHead(text);
    if (!head.ok) {
      this._error = this._t(`settings_import.errors.${head.reason}`);
      return;
    }
    if (head.value.domain !== this._params.entry.domain) {
      this._error = this._t("settings_import.errors.wrong_domain");
      return;
    }
    this._content = text;
    this._locked = head.value.locked;
    if (!this._locked) {
      await this._loadPreview();
    }
  }

  private async _loadPreview(): Promise<void> {
    if (!this._params || this._content === undefined) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      this._preview = await previewEntrySettings(
        this.hass,
        this._params.entry.entry_id,
        this._content,
        this._locked ? this._password : undefined
      );
      this._undo = this._preview.undo;
    } catch (err: unknown) {
      this._preview = undefined;
      this._error = this._t(`settings_import.errors.${errorCode(err)}`);
    } finally {
      this._busy = false;
    }
  }

  private async _apply(): Promise<void> {
    if (!this._params || this._content === undefined || !this._preview) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("settings_import.confirm_title"),
      text: this._t("settings_import.confirm_text", {
        title: this._params.entry.title,
      }),
      confirmText: this._t("settings_import.confirm_action"),
      dismissText: this._t("cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      const result = await applyEntrySettings(
        this.hass,
        this._params.entry.entry_id,
        this._content,
        this._locked ? this._password : undefined
      );
      this._applied = result.changed;
      this._undo = result.undo;
      this._content = undefined;
      this._password = "";
    } catch (err: unknown) {
      this._error = this._t(`settings_import.errors.${errorCode(err)}`);
    } finally {
      this._busy = false;
    }
  }

  private async _undoImport(): Promise<void> {
    if (!this._params) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      const result = await undoEntrySettings(
        this.hass,
        this._params.entry.entry_id
      );
      this._undo = result.undo;
      this._reset();
      showToast(this, { message: this._t("settings_import.undone") });
    } catch (err: unknown) {
      this._error = this._t(`settings_import.errors.${errorCode(err)}`);
    } finally {
      this._busy = false;
    }
  }

  static styles = css`
    input[type="file"] {
      display: none;
    }
    .note {
      margin: var(--ha-space-2) 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .file {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      flex-wrap: wrap;
    }
    .file-name {
      flex: 1;
      min-width: 120px;
      overflow-wrap: anywhere;
      font-weight: var(--ha-font-weight-medium);
    }
    ha-button {
      min-height: 48px;
    }
    ha-input,
    .show,
    .undo,
    ha-alert {
      display: block;
      margin-top: var(--ha-space-3);
    }
    .summary {
      margin-top: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      padding: 0 var(--ha-space-3);
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 48px;
      flex-wrap: wrap;
    }
    .row + .row {
      border-top: 1px solid var(--divider-color);
    }
    .value {
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .changes {
      list-style: none;
      margin: var(--ha-space-3) 0 0;
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-md);
      background: var(--secondary-background-color);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      max-height: 240px;
      overflow: auto;
    }
    .changes li {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      padding: var(--ha-space-1) 0;
      overflow-wrap: anywhere;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
    }
    .what {
      color: var(--secondary-text-color);
    }
    .loading {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-entry-settings-import": DialogEntrySettingsImport;
  }
}
