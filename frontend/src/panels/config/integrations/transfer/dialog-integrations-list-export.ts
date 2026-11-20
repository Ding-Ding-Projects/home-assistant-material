import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-settings-row";
import "../../../../components/ha-spinner";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import type {
  IntegrationsList,
  IntegrationsListRow,
} from "../../../../data/integration_transfer";
import { fetchIntegrationsList } from "../../../../data/integration_transfer";
import {
  countEntityKinds,
  formatMadeAt,
  integrationsListText,
} from "../../../../data/integration_transfer_file";
import type { HomeAssistant } from "../../../../types";
import { showToast } from "../../../../util/toast";
import { saveTextFile, TransferText } from "./transfer-text";

/** How many rows the preview shows before "more". */
const FIRST_ROWS = 3;

/**
 * Export the list of installed integrations. The preview is drawn from the
 * same object that is saved, and the exact file text can be opened below it.
 */
@customElement("dialog-integrations-list-export")
export class DialogIntegrationsListExport extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _titles = false;

  @state() private _counts = true;

  @state() private _list?: IntegrationsList;

  @state() private _error = false;

  @state() private _showAll = false;

  private _text = new TransferText(this, () => this.hass);

  private _request = 0;

  public showDialog(): void {
    this._open = true;
    this._titles = false;
    this._counts = true;
    this._showAll = false;
    this._load();
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._list = undefined;
    this._error = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private async _load(): Promise<void> {
    const request = ++this._request;
    this._error = false;
    try {
      const list = await fetchIntegrationsList(
        this.hass,
        this._titles,
        this._counts
      );
      if (request === this._request) {
        this._list = list;
      }
    } catch (_err: unknown) {
      if (request === this._request) {
        this._list = undefined;
        this._error = true;
      }
    }
  }

  private _toggleTitles(ev: Event): void {
    this._titles = (ev.target as HaSwitch).checked;
    this._load();
  }

  private _toggleCounts(ev: Event): void {
    this._counts = (ev.target as HaSwitch).checked;
    this._load();
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }
    const t = (key: string, values?: Record<string, string | number>) =>
      this._text.t(key, values);
    const list = this._list;
    const fileText = list ? integrationsListText(list) : "";
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${t("list_export.title")}
        @closed=${this._dialogClosed}
      >
        ${
          list
            ? html`<p class="summary">
                ${t("list_export.summary", {
                  integrations: list.integrations.length,
                  kinds: countEntityKinds(list),
                })}
              </p>`
            : nothing
        }
        <ha-settings-row wrap-heading>
          <span slot="heading">${t("list_export.names")}</span>
          <span slot="description">${t("list_export.names_description")}</span>
          <ha-switch
            .accessibleLabel=${t("list_export.names")}
            .checked=${this._titles}
            @change=${this._toggleTitles}
          ></ha-switch>
        </ha-settings-row>
        <ha-settings-row wrap-heading>
          <span slot="heading">${t("list_export.counts")}</span>
          <span slot="description">${t("list_export.counts_description")}</span>
          <ha-switch
            .accessibleLabel=${t("list_export.counts")}
            .checked=${this._counts}
            @change=${this._toggleCounts}
          ></ha-switch>
        </ha-settings-row>
        <h3 class="overline">${t("list_export.what_goes_in")}</h3>
        ${
          this._error
            ? html`<ha-alert alert-type="error"
                >${t("list_export.failed")}</ha-alert
              >`
            : list
              ? this._renderPreview(list, fileText)
              : html`<div class="loading">
                  <ha-spinner size="small"></ha-spinner>${t("loading")}
                </div>`
        }
        <p class="note">${t("list_export.truth")}</p>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            .disabled=${!list}
            @click=${this._copy}
          >
            ${t("list_export.copy")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .disabled=${!list}
            @click=${this._save}
          >
            ${t("save_file")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _renderPreview(list: IntegrationsList, fileText: string) {
    const t = (key: string, values?: Record<string, string | number>) =>
      this._text.t(key, values);
    const rows = this._showAll
      ? list.integrations
      : list.integrations.slice(0, FIRST_ROWS);
    const hidden = list.integrations.length - rows.length;
    return html`
      <div class="preview">
        <div class="mono">${t("list_export.build", { build: list.build })}</div>
        <div class="mono">
          ${t("list_export.made", {
            made: formatMadeAt(list.made_at, this.hass.locale.language),
          })}
        </div>
        <ul>
          ${rows.map((row) => this._renderRow(row))}
        </ul>
        ${
          hidden > 0
            ? html`<ha-button
                appearance="plain"
                size="small"
                class="more"
                @click=${this._toggleAll}
                >${t("list_export.more", { count: hidden })}</ha-button
              >`
            : this._showAll && list.integrations.length > FIRST_ROWS
              ? html`<ha-button
                  appearance="plain"
                  size="small"
                  class="more"
                  @click=${this._toggleAll}
                  >${t("list_export.fewer")}</ha-button
                >`
              : nothing
        }
      </div>
      <details class="file-text">
        <summary>${t("list_export.file_text")}</summary>
        <pre>${fileText}</pre>
      </details>
    `;
  }

  private _renderRow(row: IntegrationsListRow) {
    const t = (key: string, values?: Record<string, string | number>) =>
      this._text.t(key, values);
    const source =
      row.source === "built_in"
        ? t("list_export.built_in")
        : [t("list_export.added_by_you"), row.version]
            .filter(Boolean)
            .join(" · ");
    const kinds = row.entity_kinds.length
      ? row.entity_kinds
          .map((kind) =>
            row.entity_counts ? `${kind} ${row.entity_counts[kind] ?? 0}` : kind
          )
          .join(" · ")
      : t("list_export.no_entities");
    return html`<li>
      <div class="row-head">
        ${row.domain} · ${source} ·
        ${t("list_export.entries", { count: row.entries })}
        ${
          row.devices !== undefined
            ? html` · ${t("list_export.devices", { count: row.devices })}`
            : nothing
        }
      </div>
      ${
        row.titles?.length
          ? html`<div class="row-sub">${row.titles.join(" · ")}</div>`
          : nothing
      }
      <div class="row-sub">${kinds}</div>
    </li>`;
  }

  private _toggleAll(): void {
    this._showAll = !this._showAll;
  }

  private _save(): void {
    if (!this._list) {
      return;
    }
    saveTextFile(integrationsListText(this._list), "integrations-list.json");
    showToast(this, { message: this._text.t("list_export.saved") });
  }

  private async _copy(): Promise<void> {
    if (!this._list) {
      return;
    }
    try {
      await copyToClipboard(integrationsListText(this._list), this);
      showToast(this, { message: this._text.t("list_export.copied") });
    } catch (_err: unknown) {
      showToast(this, { message: this._text.t("list_export.copy_failed") });
    }
  }

  static styles = css`
    .summary {
      margin: 0 0 var(--ha-space-2);
      color: var(--secondary-text-color);
    }
    ha-settings-row {
      padding: 0;
      min-height: 48px;
    }
    ha-switch {
      min-height: 48px;
      display: flex;
      align-items: center;
    }
    .overline {
      margin: var(--ha-space-4) 0 var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
    }
    .preview {
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      padding: var(--ha-space-3);
      overflow-wrap: anywhere;
    }
    .mono,
    pre {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .mono {
      color: var(--secondary-text-color);
    }
    ul {
      list-style: none;
      padding: 0;
      margin: var(--ha-space-2) 0 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .row-head {
      font-weight: var(--ha-font-weight-medium);
    }
    .row-sub {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .more {
      margin-top: var(--ha-space-1);
    }
    ha-button {
      min-height: 48px;
    }
    details {
      margin-top: var(--ha-space-2);
    }
    summary {
      min-height: 48px;
      display: flex;
      align-items: center;
      cursor: pointer;
    }
    pre {
      max-height: 240px;
      overflow: auto;
      margin: 0;
      padding: var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
      background: var(--secondary-background-color);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .loading {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
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
    "dialog-integrations-list-export": DialogIntegrationsListExport;
  }
}
