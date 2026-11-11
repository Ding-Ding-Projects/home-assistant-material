import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-select";
import "../../../components/ha-spinner";
import type { LovelaceDashboard } from "../../../data/lovelace/dashboard";
import { fetchDashboards } from "../../../data/lovelace/dashboard";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant, ValueChangedEvent } from "../../../types";

import type { ImportViewTargetDialogParams } from "./show-dialog-import-view-target";

/** Asks which stored dashboard an imported view is added to. */
@customElement("dialog-import-view-target")
export class DialogImportViewTarget
  extends LitElement
  implements HassDialog<ImportViewTargetDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: ImportViewTargetDialogParams;

  @state() private _dashboards?: LovelaceDashboard[];

  @state() private _selected?: string;

  @state() private _open = false;

  public showDialog(params: ImportViewTargetDialogParams): void {
    this._params = params;
    this._open = true;
    this._load();
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._dashboards = undefined;
    this._selected = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private async _load() {
    const list: LovelaceDashboard[] = await fetchDashboards(this.hass).catch(
      () => []
    );
    const all: LovelaceDashboard[] = [
      {
        id: "lovelace",
        url_path: "lovelace",
        require_admin: false,
        show_in_sidebar: true,
        title: this.hass.localize("ui.common.default"),
        mode: this.hass.panels.lovelace?.config?.mode,
      } as LovelaceDashboard,
      ...list,
    ];
    this._dashboards = all.filter((item) => item.mode === "storage");
    const preferred = this._params?.currentUrlPath;
    this._selected =
      this._dashboards.find((item) => item.url_path === preferred)?.url_path ??
      this._dashboards[0]?.url_path;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const T = "ui.panel.lovelace.import_export.view_target";
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(`${T}.title`)}
        @closed=${this._dialogClosed}
      >
        <p>${this.hass.localize(`${T}.text`)}</p>
        ${
          this._dashboards
            ? this._dashboards.length
              ? html`<ha-select
                  .label=${this.hass.localize(`${T}.label`)}
                  .value=${this._selected ?? ""}
                  @selected=${this._changed}
                  .options=${this._dashboards.map((item) => ({
                    value: item.url_path,
                    label: item.title,
                  }))}
                ></ha-select>`
              : html`<p>${this.hass.localize(`${T}.none`)}</p>`
            : html`<div class="loading">
                <ha-spinner size="medium"></ha-spinner>
              </div>`
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            @click=${this._confirm}
            .disabled=${!this._selected}
          >
            ${this.hass.localize(`${T}.action`)}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _changed(ev: ValueChangedEvent<string>) {
    this._selected = ev.detail.value;
  }

  private _confirm() {
    if (!this._selected) {
      return;
    }
    const selected = this._selected;
    const params = this._params;
    this.closeDialog();
    params?.onSelected(selected);
  }

  static styles: CSSResultGroup = [
    haStyleDialog,
    css`
      ha-select {
        width: 100%;
      }
      .loading {
        display: flex;
        justify-content: center;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-import-view-target": DialogImportViewTarget;
  }
}
