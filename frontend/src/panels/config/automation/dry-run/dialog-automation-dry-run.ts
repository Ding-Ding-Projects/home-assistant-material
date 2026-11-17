import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import { modeText } from "../../../../common/language-mode/language-mode";
import "../../../../components/ha-dialog";
import type { HassDialog } from "../../../../dialogs/make-dialog-manager";
import { haStyle, haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import "./ha-automation-dry-run";
import type { AutomationDryRunDialogParams } from "./show-dialog-automation-dry-run";

/** Hosts the past-period replay with the automation as it is on screen. */
@customElement("ha-dialog-automation-dry-run")
class DialogAutomationDryRun extends LitElement implements HassDialog {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state() private _params?: AutomationDryRunDialogParams;

  public showDialog(params: AutomationDryRunDialogParams): void {
    this._params = params;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed() {
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
        width="large"
        header-title=${modeText(
          this.hass.localize as any,
          "ui.panel.config.automation.editor.dry_run_replay.title"
        )}
        @closed=${this._dialogClosed}
      >
        <ha-automation-dry-run
          .hass=${this.hass}
          .config=${this._params.config}
        ></ha-automation-dry-run>
      </ha-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-automation-dry-run {
          display: block;
          min-width: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-dialog-automation-dry-run": DialogAutomationDryRun;
  }
}
