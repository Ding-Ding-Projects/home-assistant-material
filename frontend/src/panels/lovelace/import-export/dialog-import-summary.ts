import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-switch";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type { ImportVisibility } from "./dashboard-actions";
import {
  DEFAULT_IMPORT_VISIBILITY,
  previewDashboardUrlPath,
} from "./dashboard-actions";
import type { Capped } from "./dashboard-file";
import type { ImportSummaryDialogParams } from "./show-dialog-import-summary";

const T = "ui.panel.lovelace.import_export.summary";

/**
 * Shows what a file holds before anything is made from it. Nothing is
 * created until the person presses the confirm button. Focus starts on
 * Cancel and Escape cancels.
 */
@customElement("dialog-import-summary")
export class DialogImportSummary
  extends LitElement
  implements HassDialog<ImportSummaryDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: ImportSummaryDialogParams;

  @state() private _open = false;

  @state() private _urlPath = "";

  @state() private _requireAdmin = DEFAULT_IMPORT_VISIBILITY.requireAdmin;

  @state() private _showInSidebar = DEFAULT_IMPORT_VISIBILITY.showInSidebar;

  // Set by the confirm button, acted on once the dialog has closed.
  private _confirmed?: ImportVisibility;

  public showDialog(params: ImportSummaryDialogParams): void {
    this._params = params;
    this._confirmed = undefined;
    this._requireAdmin = DEFAULT_IMPORT_VISIBILITY.requireAdmin;
    this._showInSidebar = DEFAULT_IMPORT_VISIBILITY.showInSidebar;
    this._urlPath = params.summary.urlPath;
    this._open = true;
    if (params.summary.kind === "dashboard") {
      void this._loadAddress(params);
    }
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private async _loadAddress(params: ImportSummaryDialogParams) {
    const address = await previewDashboardUrlPath(
      this.hass,
      params.summary.title,
      params.summary.urlPath || undefined
    ).catch(() => undefined);
    if (address && this._params === params) {
      this._urlPath = address;
    }
  }

  private _dialogClosed(): void {
    const params = this._params;
    const confirmed = this._confirmed;
    this._params = undefined;
    this._confirmed = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
    if (params && confirmed) {
      params.onConfirm(confirmed);
    }
  }

  private _confirm(): void {
    if (this._confirmed) {
      return;
    }
    this._confirmed = {
      requireAdmin: this._requireAdmin,
      showInSidebar: this._showInSidebar,
    };
    this.closeDialog();
  }

  private _t(suffix: string, values?: Record<string, string | number>) {
    return this.hass.localize(`${T}.${suffix}` as LocalizeKeys, values);
  }

  private _more<Item>(list: Capped<Item>): TemplateResult | typeof nothing {
    const rest = list.total - list.items.length;
    return rest > 0
      ? html`<li class="more">${this._t("and_more", { count: rest })}</li>`
      : nothing;
  }

  private _section<Item>(
    titleKey: string,
    helpKey: string,
    list: Capped<Item>,
    item: (value: Item) => TemplateResult
  ): TemplateResult {
    return html`<section>
      <h3>${this._t(titleKey, { count: list.total })}</h3>
      <p class="help">${this._t(helpKey)}</p>
      ${
        list.total
          ? html`<ul>
              ${list.items.map((value) => html`<li>${item(value)}</li>`)}
              ${this._more(list)}
            </ul>`
          : html`<p class="none">${this._t("none")}</p>`
      }
    </section>`;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const summary = this._params.summary;
    const isDashboard = summary.kind === "dashboard";
    return html`
      <ha-dialog
        .open=${this._open}
        .headerTitle=${this._t(isDashboard ? "title_dashboard" : "title_view")}
        @closed=${this._dialogClosed}
      >
        <p class="intro">${this._t("intro")}</p>

        <section>
          <dl class="facts">
            ${
              summary.title
                ? html`<dt>${this._t("name")}</dt>
                    <dd>${summary.title}</dd>`
                : nothing
            }
            ${
              isDashboard && this._urlPath
                ? html`<dt>${this._t("address")}</dt>
                    <dd class="code">/${this._urlPath}</dd>`
                : nothing
            }
            <dt>${this._t("contents")}</dt>
            <dd>
              ${this._t("tabs", { count: summary.views })},
              ${this._t("cards", { count: summary.cards })}
            </dd>
          </dl>
        </section>

        ${this._section(
          "addresses_title",
          "addresses_help",
          summary.addresses,
          (address) =>
            html`<span class="host">${address.host}</span>
              <span class="detail code">${address.address}</span>
              ${
                address.where
                  ? html`<span class="where"
                      >${this._t("where", { where: address.where })}</span
                    >`
                  : nothing
              }`
        )}
        ${this._section(
          "custom_title",
          "custom_help",
          summary.customTypes,
          (custom) =>
            html`<span class="code">${custom.type}</span>
              <span class="where"
                >${this._t(
                  custom.kind === "strategy" ? "custom_strategy" : "custom_card"
                )}</span
              >`
        )}
        ${this._section(
          "actions_title",
          "actions_help",
          summary.actions,
          (action) =>
            html`<span class="host">${action.action}</span> ${
                action.service
                  ? html`<span class="detail code">${action.service}</span>`
                  : nothing
              }
              ${
                action.target
                  ? html`<span class="detail code">${action.target}</span>`
                  : nothing
              }
              ${
                action.where
                  ? html`<span class="where"
                      >${this._t("where", { where: action.where })}</span
                    >`
                  : nothing
              }`
        )}
        ${this._section(
          "removed_title",
          "removed_help",
          summary.removed,
          (removed) =>
            html`<span class="host"
                >${this._t(
                  removed.kind === "resource"
                    ? "removed_resource"
                    : "removed_module"
                )}</span
              >
              ${
                removed.address
                  ? html`<span class="detail code">${removed.address}</span>`
                  : nothing
              }`
        )}
        ${
          isDashboard
            ? html`<section>
                <h3>${this._t("visibility")}</h3>
                <p class="help">${this._t("visibility_help")}</p>
                ${this._switch(
                  "admin_only",
                  this._requireAdmin,
                  this._adminChanged
                )}
                ${this._switch(
                  "show_on_rail",
                  this._showInSidebar,
                  this._railChanged
                )}
              </section>`
            : nothing
        }

        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            autofocus
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button slot="primaryAction" @click=${this._confirm}>
            ${this._t(isDashboard ? "confirm_dashboard" : "confirm_view")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _switch(
    suffix: string,
    checked: boolean,
    changed: (ev: Event) => void
  ): TemplateResult {
    const label = this._t(suffix);
    return html`<label class="switch-row">
      <span>${label}</span>
      <ha-switch
        .checked=${checked}
        .accessibleLabel=${label}
        @change=${changed}
      ></ha-switch>
    </label>`;
  }

  private _adminChanged(ev: Event): void {
    this._requireAdmin = (ev.target as HTMLInputElement).checked;
  }

  private _railChanged(ev: Event): void {
    this._showInSidebar = (ev.target as HTMLInputElement).checked;
  }

  static styles: CSSResultGroup = [
    haStyleDialog,
    css`
      section {
        margin-block: var(--ha-space-4);
      }
      h3 {
        margin: 0 0 var(--ha-space-1);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      p {
        margin: 0;
      }
      .intro {
        color: var(--secondary-text-color);
      }
      .help,
      .none,
      .where {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .facts {
        display: grid;
        grid-template-columns: minmax(0, max-content) minmax(0, 1fr);
        gap: var(--ha-space-1) var(--ha-space-4);
        margin: 0;
      }
      .facts dt {
        color: var(--secondary-text-color);
      }
      .facts dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      ul {
        margin: var(--ha-space-2) 0 0;
        padding-inline-start: var(--ha-space-5);
      }
      li {
        margin-block: var(--ha-space-1);
        overflow-wrap: anywhere;
      }
      .host {
        font-weight: var(--ha-font-weight-medium);
        margin-inline-end: var(--ha-space-1);
      }
      .code {
        font-family: var(--ha-font-family-code, monospace);
      }
      .detail {
        margin-inline-end: var(--ha-space-1);
      }
      .more {
        list-style: none;
        margin-inline-start: calc(-1 * var(--ha-space-5));
        color: var(--secondary-text-color);
      }
      .switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-4);
        min-height: 44px;
        cursor: pointer;
      }
      ha-switch {
        flex: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-import-summary": DialogImportSummary;
  }
}
