import {
  mdiAutoFix,
  mdiLifebuoy,
  mdiPower,
  mdiPowerCycle,
  mdiRefresh,
} from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/animation/ha-fade-in";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-dialog-footer";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/progress/ha-progress-bar";
import {
  getBackupState,
  type BackupManagerState,
} from "../../data/backup_manager";
import {
  extractApiErrorMessage,
  ignoreSupervisorError,
} from "../../data/hassio/common";
import type { HassioHostInfo } from "../../data/hassio/host";
import {
  fetchHassioHostInfo,
  rebootHost,
  shutdownHost,
} from "../../data/hassio/host";
import { haStyle, haStyleDialog } from "../../resources/styles";
import type { HomeAssistant, ServiceCallRequest } from "../../types";
import { HOST_ACTION_TOAST_ID, showToast } from "../../util/toast";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../generic/show-dialog-box";
import { showRestartWaitDialog } from "./show-dialog-restart";
import "./automation-restart-status";

type RestartAction =
  "reload" | "restart" | "restart-safe-mode" | "reboot" | "shutdown";

interface RestartOption {
  action: RestartAction;
  icon: string;
  danger?: boolean;
}

const APP_OPTIONS: RestartOption[] = [
  { action: "reload", icon: mdiAutoFix },
  { action: "restart", icon: mdiRefresh },
  { action: "restart-safe-mode", icon: mdiLifebuoy },
];

const MACHINE_OPTIONS: RestartOption[] = [
  { action: "reboot", icon: mdiPowerCycle },
  { action: "shutdown", icon: mdiPower, danger: true },
];

@customElement("dialog-restart")
class DialogRestart extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _open = false;

  @state()
  private _loadingHostInfo = false;

  @state()
  private _loadingBackupInfo = false;

  @state()
  private _hostInfo?: HassioHostInfo;

  @state()
  private _dialogOpen = false;

  @state() private _selected: RestartAction = "reload";

  public async showDialog(): Promise<void> {
    const isHassioLoaded = isComponentLoaded(this.hass.config, "hassio");

    this._open = true;
    this._dialogOpen = true;
    this._selected = "reload";

    if (isHassioLoaded && !this._hostInfo) {
      this._loadHostInfo();
    }
  }

  private async _loadBackupState() {
    try {
      return await getBackupState(this.hass);
    } catch (_err) {
      // Do nothing
      return "idle";
    }
  }

  private async _loadHostInfo() {
    this._loadingHostInfo = true;
    try {
      this._hostInfo = await fetchHassioHostInfo(this.hass);
    } catch (_err) {
      // Do nothing
    } finally {
      this._loadingHostInfo = false;
    }
  }

  private _dialogClosed(): void {
    this._dialogOpen = false;
    this._open = false;
    this._loadingHostInfo = false;
    this._loadingBackupInfo = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _optionTitle(action: RestartAction): string {
    return this.hass.localize(`ui.dialogs.restart.${action}.title`);
  }

  private _renderOption(option: RestartOption) {
    const selected = this._selected === option.action;
    return html`
      <button
        type="button"
        role="radio"
        class=${classMap({
          option: true,
          selected,
          danger: !!option.danger,
        })}
        aria-checked=${selected ? "true" : "false"}
        .action=${option.action}
        .disabled=${this._loadingBackupInfo}
        @click=${this._select}
      >
        <span class="icon">
          <ha-svg-icon .path=${option.icon}></ha-svg-icon>
        </span>
        <span class="text">
          <span class="title">${this._optionTitle(option.action)}</span>
          <span class="description">
            ${this.hass.localize(
              `ui.dialogs.restart.${option.action}.description`
            )}
          </span>
        </span>
      </button>
    `;
  }

  protected render() {
    if (!this._open) {
      return nothing;
    }

    const showMachine = !!this._hostInfo;

    return html`
      <ha-adaptive-dialog
        .open=${this._dialogOpen}
        header-title=${this.hass.localize("ui.dialogs.restart.heading")}
        header-subtitle=${this.hass.localize("ui.dialogs.restart.subtitle")}
        allow-mode-change
        flexcontent
        @closed=${this._dialogClosed}
      >
        <div class="content">
          <div class="action-loader">
            ${
              this._loadingBackupInfo
                ? html`<ha-fade-in .delay=${250}>
                    <ha-progress-bar indeterminate></ha-progress-bar>
                  </ha-fade-in>`
                : nothing
            }
          </div>
          ${
            this._loadingHostInfo
              ? html`
                  <div class="loader">
                    <ha-spinner></ha-spinner>
                  </div>
                `
              : html`
                  <div class="options" role="radiogroup">
                    ${APP_OPTIONS.map((option) => this._renderOption(option))}
                    ${
                      showMachine
                        ? html`
                            <div class="section">
                              ${this.hass.localize(
                                "ui.dialogs.restart.this_machine"
                              )}
                            </div>
                            ${MACHINE_OPTIONS.map((option) =>
                              this._renderOption(option)
                            )}
                          `
                        : nothing
                    }
                  </div>
                `
          }
        </div>
        <ha-dialog-footer slot="footer">
          <span slot="secondaryAction" class="footer-note">
            ${this.hass.localize("ui.dialogs.restart.footer_note")}
          </span>
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this._cancel}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            variant=${this._selected === "shutdown" ? "danger" : "brand"}
            .disabled=${this._loadingBackupInfo || this._loadingHostInfo}
            @click=${this._confirmSelected}
          >
            ${this._optionTitle(this._selected)}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _select(ev: Event) {
    const button = ev.currentTarget as HTMLButtonElement & {
      action: RestartAction;
    };
    if (button.disabled) {
      return;
    }
    this._selected = button.action;
  }

  private _cancel() {
    this._dialogOpen = false;
  }

  private _confirmSelected() {
    if (this._selected === "reload") {
      this._reload();
      return;
    }
    this._handleAction(this._selected);
  }

  private async _reload() {
    this._dialogOpen = false;

    showToast(this, {
      message: this.hass.localize("ui.dialogs.restart.reload.reloading"),
      duration: 1000,
    });

    this._restartAction(
      "homeassistant",
      "reload_all",
      this.hass.localize("ui.dialogs.restart.reload.failed")
    )();
  }

  private _getBackupProgressMessage(backupState: BackupManagerState) {
    switch (backupState) {
      case "create_backup":
        return this.hass.localize("ui.dialogs.restart.backup_in_progress");
      case "receive_backup":
        return this.hass.localize("ui.dialogs.restart.upload_in_progress");
      case "restore_backup":
        return this.hass.localize("ui.dialogs.restart.restore_in_progress");
      default:
        return "";
    }
  }

  private _restartAction =
    (
      domain: ServiceCallRequest["domain"],
      service: ServiceCallRequest["service"],
      errorTitle: string,

      serviceData?: ServiceCallRequest["serviceData"]
    ) =>
    async () => {
      try {
        await this.hass.callService(domain, service, serviceData);
      } catch (err: any) {
        showAlertDialog(this, {
          title: errorTitle,
          text: err.message,
        });
      }
    };

  private _hostAction =
    (toastMessage: string, action: "reboot" | "shutdown") => async () => {
      showToast(this, {
        id: HOST_ACTION_TOAST_ID,
        message: toastMessage,
        duration: -1,
      });

      try {
        if (action === "reboot") {
          await rebootHost(this.hass);
        } else {
          await shutdownHost(this.hass);
        }
      } catch (err: any) {
        // Ignore connection errors, these are all expected
        if (this.hass.connection.connected && !ignoreSupervisorError(err)) {
          showToast(this, {
            id: HOST_ACTION_TOAST_ID,
            message: "",
            duration: 0,
          });
          showAlertDialog(this, {
            title: this.hass.localize(`ui.dialogs.restart.${action}.failed`),
            text: extractApiErrorMessage(err),
          });
        }
      }
    };

  private async _handleAction(
    action: "restart" | "reboot" | "shutdown" | "restart-safe-mode"
  ) {
    if (this._loadingBackupInfo) {
      return;
    }
    this._loadingBackupInfo = true;

    const backupState = await this._loadBackupState();

    const backupProgressMessage = this._getBackupProgressMessage(backupState);

    this._loadingBackupInfo = false;

    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(`ui.dialogs.restart.${action}.confirm_title`),
      text: html`${this.hass.localize(
          `ui.dialogs.restart.${action}.confirm_description`
        )}${
          backupProgressMessage
            ? html`<br /><br /><ha-alert>${backupProgressMessage}</ha-alert>`
            : nothing
        } <br /><br /><automation-restart-status></automation-restart-status>`,
      confirmText: this.hass.localize(
        `ui.dialogs.restart.${action}.confirm_action${backupState === "idle" ? "" : "_backup"}`
      ),
      destructive: true,
    });

    if (!confirmed) {
      return;
    }

    this._dialogOpen = false;

    let actionFunc: () => Promise<void>;

    if (["restart", "restart-safe-mode"].includes(action)) {
      const serviceData =
        action === "restart-safe-mode" ? { safe_mode: true } : undefined;
      actionFunc = this._restartAction(
        "homeassistant",
        "restart",
        this.hass.localize(`ui.dialogs.restart.${action}.failed`),
        serviceData
      );
    } else {
      actionFunc = this._hostAction(
        this.hass.localize(
          `ui.dialogs.restart.${action as "reboot" | "shutdown"}.action_toast`
        ),
        action as "reboot" | "shutdown"
      );
    }

    if (backupState !== "idle") {
      showRestartWaitDialog(this, {
        title: this.hass.localize(`ui.dialogs.restart.${action}.title`),
        initialBackupState: backupState,
        action: actionFunc,
      });
      return;
    }

    actionFunc();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleDialog,
      css`
        ha-adaptive-dialog {
          --dialog-content-padding: 0;
        }

        .options {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-2) var(--ha-space-6) var(--ha-space-4);
        }

        .option {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          width: 100%;
          padding: var(--ha-space-3) var(--ha-space-4);
          border: var(--ha-border-width-md) solid transparent;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
        }

        .option:disabled {
          cursor: default;
          opacity: 0.6;
        }

        .option:focus-visible {
          outline: var(--ha-border-width-md) solid var(--primary-color);
          outline-offset: 2px;
        }

        .option.selected {
          background: var(
            --primary-container-color,
            var(--secondary-background-color)
          );
          border-color: var(--primary-color);
        }

        .option.danger {
          background: var(
            --error-container-color,
            var(--secondary-background-color)
          );
        }

        .option.danger.selected {
          border-color: var(--error-color);
        }

        .icon {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--card-background-color);
        }

        .text {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .title {
          font-weight: var(--ha-font-weight-medium);
        }

        .description {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .section {
          margin-top: var(--ha-space-2);
          padding: 0 var(--ha-space-4);
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
          color: var(--secondary-text-color);
        }

        .footer-note {
          margin-inline-end: auto;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }

        .loader {
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 24px;
        }
        .action-loader {
          --ha-progress-bar-track-height: 4px;
          --ha-progress-bar-border-radius: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-restart": DialogRestart;
  }
}
