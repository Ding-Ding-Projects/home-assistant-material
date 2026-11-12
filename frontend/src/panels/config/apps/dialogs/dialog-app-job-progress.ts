import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/app-job/ha-app-job-progress";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { AppJobProgressDialogParams } from "./show-dialog-app-job-progress";

/**
 * The detailed progress of one app install, update or removal. It can be
 * opened again from the activity tray while the work goes on.
 */
@customElement("dialog-app-job-progress")
class DialogAppJobProgress extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: AppJobProgressDialogParams;

  @state() private _open = false;

  public showDialog(params: AppJobProgressDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize("ui.app_job.dialog_title")}
        width="large"
        @closed=${this._dialogClosed}
      >
        <ha-app-job-progress
          .slug=${this._params.slug}
          terminal
          keep-finished
        ></ha-app-job-progress>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="primaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.app_job.close")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-app-job-progress {
          --log-terminal-height: min(50vh, 420px);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-app-job-progress": DialogAppJobProgress;
  }
}
