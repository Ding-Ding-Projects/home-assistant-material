import { mdiContentCopy } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { navigate } from "../../../../common/navigate";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import "../../../../components/input/ha-input";
import type { HaInput } from "../../../../components/input/ha-input";
import {
  fetchConfig,
  isStrategyDashboard,
  saveConfig,
} from "../../../../data/lovelace/config/types";
import { createDashboard } from "../../../../data/lovelace/dashboard";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { DuplicateScope } from "./duplicate-dashboard";
import {
  configForDuplicate,
  duplicateDashboardUrlPath,
} from "./duplicate-dashboard";
import type { DuplicateDashboardDialogParams } from "./show-dialog-duplicate-dashboard";

@customElement("dialog-duplicate-dashboard")
export class DialogDuplicateDashboard extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: DuplicateDashboardDialogParams;

  @state() private _open = false;

  @state() private _name = "";

  @state() private _scope: DuplicateScope = "dashboard";

  @state() private _views: string[] = [];

  @state() private _strategy = false;

  @state() private _view = 0;

  @state() private _openWhenDone = true;

  @state() private _loading = false;

  @state() private _busy = false;

  @state() private _error?: string;

  public showDialog(params: DuplicateDashboardDialogParams): void {
    this._params = params;
    this._name = this.hass.localize(
      "ui.panel.config.lovelace.dashboards.duplicate.default_name",
      { title: params.dashboard.title }
    );
    this._scope = "dashboard";
    this._view = 0;
    this._views = [];
    this._strategy = false;
    this._openWhenDone = true;
    this._error = undefined;
    this._open = true;
    void this._loadViews();
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.lovelace.dashboards.duplicate.${key}` as "ui.panel.config.lovelace.dashboards.duplicate.title",
      values
    );
  }

  /** Reads the views of the dashboard, so one of them can be picked. */
  private async _loadViews(): Promise<void> {
    const params = this._params;
    if (!params) {
      return;
    }
    this._loading = true;
    try {
      const config = await fetchConfig(
        this.hass.connection,
        params.dashboard.url_path,
        false
      );
      if (params !== this._params) {
        return;
      }
      this._strategy = isStrategyDashboard(config);
      this._views = isStrategyDashboard(config)
        ? []
        : config.views.map(
            (view, index) =>
              view.title ||
              view.path ||
              this.hass.localize("ui.panel.lovelace.views.unnamed_view") +
                ` ${index + 1}`
          );
    } catch (_err: unknown) {
      this._error = this._t("read_error");
    } finally {
      this._loading = false;
    }
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this._t("title", { title: this._params.dashboard.title })}
        @closed=${this._dialogClosed}
      >
        <div class="body">
          <ha-input
            .label=${this._t("name")}
            .value=${this._name}
            autofocus
            @input=${this._nameChanged}
          ></ha-input>
          <div class="scope" role="group" aria-label=${this._t("scope")}>
            <ha-button
              appearance=${this._scope === "dashboard" ? "filled" : "plain"}
              data-scope="dashboard"
              @click=${this._setScope}
            >
              ${this._t("whole")}
            </ha-button>
            <ha-button
              appearance=${this._scope === "view" ? "filled" : "plain"}
              .disabled=${this._strategy || this._views.length < 2}
              data-scope="view"
              @click=${this._setScope}
            >
              ${this._t("one_view")}
            </ha-button>
          </div>
          ${
            this._scope === "view"
              ? html`<ha-select
                  .label=${this._t("view")}
                  .value=${String(this._view)}
                  .options=${this._views.map((title, index) => ({
                    value: String(index),
                    label: title,
                  }))}
                  @selected=${this._viewChanged}
                ></ha-select>`
              : nothing
          }
          <label class="switch-row">
            <span>${this._t("open_when_done")}</span>
            <ha-switch
              .checked=${this._openWhenDone}
              @change=${this._openChanged}
            ></ha-switch>
          </label>
          <p class="hint">
            <ha-svg-icon .path=${mdiContentCopy}></ha-svg-icon>
            ${this._t("note")}
          </p>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
        </div>
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
            .disabled=${!this._name.trim() || this._busy || this._loading}
            @click=${this._duplicate}
          >
            ${this._t("duplicate")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _nameChanged(ev: Event): void {
    this._name = (ev.target as HaInput).value ?? "";
  }

  private _setScope(ev: Event): void {
    this._scope = (ev.currentTarget as HTMLElement).dataset
      .scope as DuplicateScope;
  }

  private _viewChanged(ev: HaSelectSelectEvent): void {
    this._view = Number(ev.detail.value);
  }

  private _openChanged(ev: Event): void {
    this._openWhenDone = (ev.target as HTMLInputElement).checked;
  }

  private async _duplicate(): Promise<void> {
    const params = this._params;
    if (!params || this._busy) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    const title = this._name.trim();
    const urlPath = duplicateDashboardUrlPath(title, params.takenUrlPaths);
    try {
      const config = await fetchConfig(
        this.hass.connection,
        params.dashboard.url_path,
        false
      );
      const copy = configForDuplicate(config, this._scope, this._view);
      const created = await createDashboard(this.hass, {
        title,
        url_path: urlPath,
        icon: params.dashboard.icon,
        require_admin: params.dashboard.require_admin,
        show_in_sidebar: params.dashboard.show_in_sidebar,
        mode: "storage",
      });
      params.created(created);
      await saveConfig(this.hass, created.url_path, copy);
    } catch (_err: unknown) {
      this._error = this._t("error");
      this._busy = false;
      return;
    }
    this._busy = false;
    this.closeDialog();
    if (this._openWhenDone) {
      navigate(`/${urlPath}`);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        .scope {
          display: flex;
          gap: var(--ha-space-2);
          padding: var(--ha-space-1);
          border-radius: var(--ha-border-radius-pill);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
        }
        .scope ha-button {
          flex: 1;
        }
        ha-select {
          width: 100%;
        }
        .switch-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          font-weight: var(--ha-font-weight-semibold, 500);
        }
        .hint {
          display: flex;
          gap: var(--ha-space-2);
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .hint ha-svg-icon {
          flex: none;
          --mdc-icon-size: 18px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-duplicate-dashboard": DialogDuplicateDashboard;
  }
}
