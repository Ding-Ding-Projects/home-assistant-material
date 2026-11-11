import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { storage } from "../common/decorators/storage";
import type { HASSDomEvent } from "../common/dom/fire_event";
import type { LocalizeFunc } from "../common/translations/localize";
import type { BackupContentExtended } from "../data/backup";
import {
  fetchBackupOnboardingInfo,
  type BackupOnboardingConfig,
  type BackupOnboardingInfo,
} from "../data/backup_onboarding";
import { waitForIntegration } from "../data/onboarding";
import "./onboarding-loading";
import "./restore-backup/onboarding-restore-backup-restore";
import "./restore-backup/onboarding-restore-backup-status";
import { onBoardingStyles } from "./styles";

const STATUS_INTERVAL_IN_MS = 5000;

@customElement("onboarding-restore-backup")
class OnboardingRestoreBackup extends LitElement {
  @property({ type: Boolean }) public supervisor = false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _view: "loading" | "upload" | "restore" | "status" =
    "loading";

  @state() private _backup?: BackupContentExtended;

  @state() private _backupInfo?: BackupOnboardingInfo;

  @state() private _error?: string;

  @state() private _failed?: boolean;

  @storage({
    key: "onboarding-restore-backup-backup-id",
  })
  private _backupId?: string;

  @storage({
    key: "onboarding-restore-running",
  })
  private _restoreRunning?: boolean;

  private _loadedIntegrations = new Set<string>();

  protected render(): TemplateResult {
    return html`
      ${
        this._error && this._view !== "restore"
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      ${
        this._view === "loading"
          ? html`<onboarding-loading></onboarding-loading>`
          : this._view === "upload"
            ? html`
                <onboarding-restore-backup-upload
                  .supervisor=${this.supervisor}
                  @backup-uploaded=${this._backupUploaded}
                ></onboarding-restore-backup-upload>
              `
            : this._view === "restore"
              ? html`<onboarding-restore-backup-restore
                  .backup=${this._backup!}
                  .supervisor=${this.supervisor}
                  .error=${
                    this._failed
                      ? this._localize(
                          `ui.panel.page-onboarding.restore.${this._backupInfo?.last_action_event?.reason === "password_incorrect" ? "failed_wrong_password_description" : "failed_description"}`
                        )
                      : this._error
                  }
                  @restore-started=${this._restoreStarted}
                  @restore-backup-back=${this._back}
                ></onboarding-restore-backup-restore>`
              : nothing
      }
      ${
        this._view === "status" && this._backupInfo
          ? html`<onboarding-restore-backup-status
              .backupInfo=${this._backupInfo}
              @restore-backup-back=${this._back}
            ></onboarding-restore-backup-status>`
          : nothing
      }
    `;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    import("./restore-backup/onboarding-restore-backup-upload");

    this._loadBackupInfo();
  }

  private async _loadBackupInfo() {
    let onboardingInfo: BackupOnboardingConfig;
    if (this._restoreRunning || !this._loadedIntegrations.has("backup")) {
      try {
        if ((await waitForIntegration("backup")).integration_loaded) {
          this._loadedIntegrations.add("backup");
        } else {
          this._error = "Backup integration not loaded";
          return;
        }
      } catch (err: any) {
        // core seems to be back up restored
        if (err.status_code === 404) {
          this._resetAndReload();
          return;
        }

        this._scheduleLoadBackupInfo(1000);
        return;
      }
    }
    try {
      onboardingInfo = await fetchBackupOnboardingInfo();
    } catch (err: any) {
      if (this._restoreRunning) {
        if (
          err.error === "Request error" ||
          // core can restart but haven't loaded the backup integration yet
          (err.status_code === 500 && err.body?.error === "backup_disabled")
        ) {
          // core is down because of restore, keep trying
          this._scheduleLoadBackupInfo();
          return;
        }

        // core seems to be back up restored
        if (err.status_code === 404) {
          this._resetAndReload();
          return;
        }
      }

      this._error = err?.message || "Cannot get backup info";

      // if we are in an unknown state, show upload
      if (this._view === "loading") {
        this._view = "upload";
      }
      return;
    }

    const {
      last_action_event: lastActionEvent,
      state: currentState,
      backups,
    } = onboardingInfo;

    this._backupInfo = {
      state: currentState,
      last_action_event: lastActionEvent,
    };

    if (this._backupId) {
      this._backup = backups.find(
        ({ backup_id }) => backup_id === this._backupId
      );
    }

    const failedRestore =
      lastActionEvent?.manager_state === "restore_backup" &&
      lastActionEvent?.state === "failed";

    if (failedRestore) {
      this._failed = true;
    }

    if (this._restoreRunning) {
      this._view = "status";
      if (failedRestore || currentState !== "restore_backup") {
        this._failed = true;
        this._restoreRunning = undefined;
      } else {
        this._scheduleLoadBackupInfo();
      }
      return;
    }

    if (this._backup) {
      this._view = "restore";
      return;
    }

    // show default view
    this._view = "upload";
  }

  private _resetAndReload() {
    this._restoreRunning = undefined;
    this._backupId = undefined;
    window.location.replace("/");
  }

  private _scheduleLoadBackupInfo(delay: number = STATUS_INTERVAL_IN_MS) {
    setTimeout(() => this._loadBackupInfo(), delay);
  }

  private async _backupUploaded(
    ev: HASSDomEvent<HASSDomEvents["backup-uploaded"]>
  ) {
    this._backupId = ev.detail.backupId;
    await this._loadBackupInfo();
  }

  private async _restoreStarted() {
    if (this._backupInfo) {
      this._backupInfo.state = "restore_backup";
    }
    this._view = "status";
    this._restoreRunning = true;
    await this._loadBackupInfo();
  }

  private async _back() {
    this._backup = undefined;
    this._backupId = undefined;
    this._view = "upload";
  }

  static styles = [
    onBoardingStyles,
    css`
      :host {
        display: flex;
        flex-direction: column;
        position: relative;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-restore-backup": OnboardingRestoreBackup;
  }
}
