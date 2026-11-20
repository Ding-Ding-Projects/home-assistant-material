import { mdiFileUploadOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import {
  domainToName,
  fetchIntegrationManifest,
} from "../../../../data/integration";
import type {
  DomainHere,
  IntegrationsList,
  IntegrationsListRow,
} from "../../../../data/integration_transfer";
import {
  compareIntegrationDomains,
  MAX_TRANSFER_FILE_BYTES,
} from "../../../../data/integration_transfer";
import type {
  CannotAddReason,
  FileRefusal,
  ImportGroups,
} from "../../../../data/integration_transfer_file";
import {
  formatMadeAt,
  groupImportedList,
  readIntegrationsList,
} from "../../../../data/integration_transfer_file";
import { showConfigFlowDialog } from "../../../../dialogs/config-flow/show-dialog-config-flow";
import type { HomeAssistant } from "../../../../types";
import { TransferText } from "./transfer-text";

type Group = "not_here" | "already_here" | "cannot_add";

const GROUPS: Group[] = ["not_here", "already_here", "cannot_add"];

/**
 * Import a list of integrations and compare it with this system. Importing
 * changes nothing; each "Set up" opens that integration's own setup, one at a
 * time, and the comparison is asked again afterwards, so a row only moves to
 * "Already here" when an entry really exists.
 */
@customElement("dialog-integrations-list-import")
export class DialogIntegrationsListImport extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _fileName?: string;

  @state() private _list?: IntegrationsList;

  @state() private _refusal?: FileRefusal | "read_failed";

  @state() private _here?: Record<string, DomainHere>;

  @state() private _checkFailed = false;

  @state() private _group: Group = "not_here";

  @state() private _settingUp?: string;

  @query("input[type=file]") private _input?: HTMLInputElement;

  private _text = new TransferText(this, () => this.hass);

  public showDialog(): void {
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._fileName = undefined;
    this._list = undefined;
    this._refusal = undefined;
    this._here = undefined;
    this._group = "not_here";
    this._settingUp = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._text.t(key, values);
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("list_import.title")}
        @closed=${this._dialogClosed}
      >
        <input
          type="file"
          accept=".json,application/json"
          tabindex="-1"
          aria-hidden="true"
          @change=${this._fileChosen}
        />
        <div class="file">
          <ha-svg-icon .path=${mdiFileUploadOutline}></ha-svg-icon>
          <div class="file-text">
            ${
              this._fileName
                ? html`<div class="file-name">${this._fileName}</div>`
                : nothing
            }
            ${
              this._list
                ? html`<div class="file-from">
                    ${this._t("list_import.from", {
                      build: this._list.build,
                      made: formatMadeAt(
                        this._list.made_at,
                        this.hass.locale.language
                      ),
                      count: this._list.integrations.length,
                    })}
                  </div>`
                : nothing
            }
          </div>
          <ha-button appearance="filled" @click=${this._choose}>
            ${this._t("choose_file")}
          </ha-button>
        </div>
        ${this._renderBody()}
        <p class="note">${this._t("list_import.nothing_added")}</p>
        <ha-dialog-footer slot="footer">
          <ha-button slot="primaryAction" @click=${this.closeDialog}>
            ${this._t("close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderBody() {
    if (this._refusal) {
      return html`<ha-alert
        alert-type="error"
        .title=${this._t("list_import.not_a_list")}
      >
        ${this._t("list_import.not_a_list_text")}
        ${this._t(`list_import.${this._refusal}`)}
      </ha-alert>`;
    }
    if (!this._list) {
      return nothing;
    }
    if (this._checkFailed) {
      return html`<ha-alert alert-type="error"
        >${this._t("list_import.check_failed")}</ha-alert
      >`;
    }
    if (!this._here) {
      return html`<div class="loading">
        <ha-spinner size="small"></ha-spinner>${this._t("list_import.checking")}
      </div>`;
    }
    const groups = groupImportedList(this._list.integrations, this._here);
    const counts: Record<Group, number> = {
      not_here: groups.notHere.length,
      already_here: groups.alreadyHere.length,
      cannot_add: groups.cannotAdd.length,
    };
    return html`
      <div class="groups" role="tablist">
        ${GROUPS.map(
          (group) =>
            html`<button
              role="tab"
              class="group ${group === this._group ? "selected" : ""}"
              aria-selected=${group === this._group ? "true" : "false"}
              .group=${group}
              @click=${this._pickGroup}
            >
              <span>${this._t(`list_import.${group}`)}</span>
              <span class="count">${counts[group]}</span>
            </button>`
        )}
      </div>
      <ul class="rows" role="tabpanel">
        ${this._renderGroup(groups)}
      </ul>
    `;
  }

  private _renderGroup(groups: ImportGroups) {
    const items =
      this._group === "not_here"
        ? groups.notHere.map((row) => ({ row, reason: undefined }))
        : this._group === "already_here"
          ? groups.alreadyHere.map((row) => ({ row, reason: undefined }))
          : groups.cannotAdd;
    if (!items.length) {
      return html`<li class="empty">${this._t("list_import.empty_group")}</li>`;
    }
    return items.map(({ row, reason }) => this._renderRow(row, reason));
  }

  // The file's own name is only ever shown as text, after this system's name.
  private _name(row: IntegrationsListRow): string {
    const known = this._here?.[row.domain]?.known;
    const here = known ? domainToName(this.hass.localize, row.domain) : "";
    return here && here !== row.domain ? here : row.name || row.domain;
  }

  private _renderRow(row: IntegrationsListRow, reason?: CannotAddReason) {
    const name = this._name(row);
    return html`<li class="row">
      <span class="avatar" aria-hidden="true"
        >${reason ? "?" : name.charAt(0).toUpperCase()}</span
      >
      <div class="row-text">
        <div class="row-name">${name}</div>
        <div class="row-sub">
          ${
            reason
              ? this._t(`list_import.${reason}`)
              : row.entity_kinds.join(" · ")
          }
        </div>
      </div>
      ${
        this._group === "not_here"
          ? html`<ha-button
              appearance="filled"
              .disabled=${this._settingUp !== undefined}
              .domain=${row.domain}
              @click=${this._setUp}
            >
              ${this._t("list_import.set_up")}
            </ha-button>`
          : nothing
      }
    </li>`;
  }

  private _pickGroup(ev: Event): void {
    this._group = (ev.currentTarget as HTMLElement & { group: Group }).group;
  }

  private _choose(): void {
    this._input?.click();
  }

  private async _fileChosen(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (!file) {
      return;
    }
    this._fileName = file.name;
    this._list = undefined;
    this._here = undefined;
    this._refusal = undefined;
    this._checkFailed = false;
    if (file.size > MAX_TRANSFER_FILE_BYTES) {
      this._refusal = "too_large";
      return;
    }
    let text: string;
    try {
      text = await file.text();
    } catch (_err: unknown) {
      this._refusal = "read_failed";
      return;
    }
    const result = readIntegrationsList(text);
    if (!result.ok) {
      this._refusal = result.reason;
      return;
    }
    this._list = result.value;
    this._group = "not_here";
    await this._compare();
  }

  private async _compare(): Promise<void> {
    if (!this._list) {
      return;
    }
    try {
      const result = await compareIntegrationDomains(
        this.hass,
        this._list.integrations.map((row) => row.domain)
      );
      this._here = result.domains;
      this._checkFailed = false;
    } catch (_err: unknown) {
      this._checkFailed = true;
    }
  }

  private async _setUp(ev: Event): Promise<void> {
    if (this._settingUp !== undefined) {
      return;
    }
    const domain = (ev.currentTarget as HTMLElement & { domain: string })
      .domain;
    this._settingUp = domain;
    let manifest;
    try {
      manifest = await fetchIntegrationManifest(this.hass, domain);
    } catch (_err: unknown) {
      manifest = undefined;
    }
    showConfigFlowDialog(this, {
      startFlowHandler: domain,
      manifest,
      dialogClosedCallback: () => {
        this._settingUp = undefined;
        this._compare();
      },
    });
  }

  static styles = css`
    input[type="file"] {
      display: none;
    }
    .file {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      flex-wrap: wrap;
    }
    .file-text {
      flex: 1;
      min-width: 160px;
      overflow-wrap: anywhere;
    }
    .file-name {
      font-weight: var(--ha-font-weight-medium);
    }
    .file-from {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    ha-button {
      min-height: 48px;
    }
    ha-alert {
      display: block;
      margin-top: var(--ha-space-3);
    }
    /* The chips wrap onto a second line on a narrow screen rather than run
       past the edge, so every group and its count stays in view. */
    .groups {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-3);
      padding-bottom: var(--ha-space-1);
    }
    .group {
      flex: 0 1 auto;
      max-width: 100%;
      min-height: 48px;
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--outline-color, var(--divider-color));
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      cursor: pointer;
    }
    .group.selected {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color);
    }
    .count {
      font-weight: var(--ha-font-weight-bold);
    }
    .rows {
      list-style: none;
      padding: 0;
      margin: var(--ha-space-3) 0 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 56px;
    }
    .avatar {
      flex: 0 0 40px;
      height: 40px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      background: var(--secondary-background-color);
      font-weight: var(--ha-font-weight-bold);
    }
    .row-text {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .row-sub,
    .empty {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .loading {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
      margin-top: var(--ha-space-3);
    }
    .note {
      margin: var(--ha-space-3) 0 0;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-integrations-list-import": DialogIntegrationsListImport;
  }
}
