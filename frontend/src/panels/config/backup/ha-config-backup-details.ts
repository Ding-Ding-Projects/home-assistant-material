import {
  mdiCheckAll,
  mdiDelete,
  mdiDotsVertical,
  mdiDownload,
  mdiHarddisk,
  mdiNas,
} from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { fireEvent, type HASSDomEvent } from "../../../common/dom/fire_event";
import { computeDomain } from "../../../common/entity/compute_domain";
import { navigate } from "../../../common/navigate";
import "../../../components/animation/ha-fade-in";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/item/ha-list-item-base";
import "../../../components/list/ha-list-base";
import type {
  BackupAgent,
  BackupSelfCheckCopy,
  BackupConfig,
  BackupContentAgent,
  BackupContentExtended,
} from "../../../data/backup";
import {
  compareAgents,
  computeBackupAgentName,
  deleteBackup,
  fetchBackupDetails,
  isLocalAgent,
  isNetworkMountAgent,
  runBackupSelfCheckLocation,
} from "../../../data/backup";
import { isDeleteProofError } from "../../../data/backup_delete_proof";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import { brandsUrl } from "../../../util/brands-url";
import { bytesToString } from "../../../util/bytes-to-string";
import { showToast } from "../../../util/toast";
import "./components/ha-backup-delete-proof-card";
import "./components/ha-backup-details-restore";
import "./components/ha-backup-details-summary";
import "./components/ha-backup-self-check";
import { selfCheckReasonText } from "./helper/backup-self-check";
import { showHostBackupDialog } from "./dialogs/show-dialog-host-backup";
import { modeText } from "../../../common/language-mode/language-mode";
import { showRestoreBackupDialog } from "./dialogs/show-dialog-restore-backup";
import { downloadBackup } from "./helper/download_backup";

interface Agent extends BackupContentAgent {
  id: string;
  success: boolean;
}

const computeAgents = (backup: BackupContentExtended) => {
  const agentIds = Object.keys(backup.agents);
  const failedAgentIds = backup.failed_agent_ids ?? [];
  return [
    ...agentIds.filter((id) => !failedAgentIds.includes(id)),
    ...failedAgentIds,
  ]
    .map<Agent>((id) => {
      const agent: BackupContentAgent = backup.agents[id] ?? {
        protected: false,
        size: 0,
      };
      return {
        ...agent,
        id: id,
        success: !failedAgentIds.includes(id),
      };
    })
    .sort((a, b) => compareAgents(a.id, b.id));
};

@customElement("ha-config-backup-details")
class HaConfigBackupDetails extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "backup-id" }) public backupId!: string;

  @property({ attribute: false }) public config?: BackupConfig;

  @property({ attribute: false }) public agents: BackupAgent[] = [];

  @state() private _backup?: BackupContentExtended | null;

  @state() private _agents: Agent[] = [];

  // The location whose copy is being checked in full right now.
  @state() private _checkingAgent?: string;

  @state() private _error?: string;

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    if (this.backupId) {
      this._fetchBackup();
    } else {
      this._error = "Backup id not defined";
    }
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    const isHassio = isComponentLoaded(this.hass.config, "hassio");

    return html`
      <hass-subpage
        back-path="/config/backup/backups"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${
          this._backup?.name ||
          this.hass.localize("ui.panel.config.backup.details.header")
        }
      >
        <ha-dropdown slot="toolbar-icon" @wa-select=${this._handleAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>
          <ha-dropdown-item value="download">
            <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
            ${this.hass.localize("ui.common.download")}
          </ha-dropdown-item>
          <ha-dropdown-item
            value="delete"
            variant="danger"
            .disabled=${!!this._backup?.delete_proof}
            title=${
              this._backup?.delete_proof
                ? modeText(
                    this.hass.localize,
                    "ui.panel.config.backup.delete_proof.turn_off_first"
                  )
                : nothing
            }
          >
            <ha-svg-icon slot="icon" .path=${mdiDelete}></ha-svg-icon>
            ${this.hass.localize("ui.common.delete")}
          </ha-dropdown-item>
        </ha-dropdown>
        <div class="content">
          ${
            this._error &&
            html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          }
          ${
            this._backup === null
              ? html`
                  <ha-alert
                    alert-type="warning"
                    .title=${this.hass.localize(
                      "ui.panel.config.backup.details.not_found"
                    )}
                  >
                    ${this.hass.localize(
                      "ui.panel.config.backup.details.not_found_description",
                      { backupId: this.backupId }
                    )}
                  </ha-alert>
                `
              : !this._backup
                ? html`<ha-fade-in .delay=${1000}
                    ><ha-spinner></ha-spinner
                  ></ha-fade-in>`
                : html`
                    <ha-backup-details-summary
                      .backup=${this._backup}
                      .hass=${this.hass}
                      .isHassio=${isHassio}
                    ></ha-backup-details-summary>
                    <ha-backup-delete-proof-card
                      .hass=${this.hass}
                      .backup=${this._backup}
                      @backup-delete-proof-changed=${this._deleteProofChanged}
                    ></ha-backup-delete-proof-card>
                    ${
                      this.hass.user?.is_admin
                        ? html`<div
                            style="display:flex;flex-wrap:wrap;gap:var(--ha-space-2)"
                          >
                            <ha-button
                              @click=${() => showHostBackupDialog(this, { backup: this._backup!, kind: "docker" })}
                              >${modeText(this.hass.localize, "ui.panel.config.backup.hosting.container")}</ha-button
                            >
                            <ha-button
                              @click=${() => showHostBackupDialog(this, { backup: this._backup!, kind: "appliance" })}
                              >${modeText(this.hass.localize, "ui.panel.config.backup.hosting.appliance")}</ha-button
                            >
                          </div>`
                        : nothing
                    }
                    <ha-backup-details-restore
                      .backup=${this._backup}
                      @backup-restore=${this._restore}
                      .hass=${this.hass}
                    ></ha-backup-details-restore>
                    <ha-backup-self-check
                      variant="details"
                      .hass=${this.hass}
                      .backup=${this._backup}
                      @backup-self-check-updated=${this._selfCheckUpdated}
                    ></ha-backup-self-check>
                    <ha-card>
                      <div class="card-header">
                        ${this.hass.localize(
                          "ui.panel.config.backup.details.locations.title"
                        )}
                      </div>
                      <div class="card-content">
                        <ha-list-base>
                          ${this._agents.map((agent) => {
                            const agentId = agent.id;

                            const domain = computeDomain(agentId);
                            const name = computeBackupAgentName(
                              this.hass.localize,
                              agentId,
                              this.agents
                            );
                            const success = agent.success;
                            const failed = !agent.success;
                            const unencrypted = !agent.protected;

                            return html`
                            <ha-list-item-base>
                              ${
                                isLocalAgent(agentId)
                                  ? html`
                                      <ha-svg-icon
                                        .path=${mdiHarddisk}
                                        slot="start"
                                      >
                                      </ha-svg-icon>
                                    `
                                  : isNetworkMountAgent(agentId)
                                    ? html`
                                        <ha-svg-icon
                                          .path=${mdiNas}
                                          slot="start"
                                        ></ha-svg-icon>
                                      `
                                    : html`
                                        <img
                                          .src=${brandsUrl(
                                            {
                                              domain,
                                              type: "icon",
                                              darkOptimized:
                                                this.hass.themes?.darkMode,
                                            },
                                            this.hass.auth.data.hassUrl
                                          )}
                                          crossorigin="anonymous"
                                          referrerpolicy="no-referrer"
                                          alt=${`${domain} logo`}
                                          slot="start"
                                        />
                                      `
                              }
                              <div slot="headline">${name}</div>
                                <div slot="supporting-text">
                                   ${
                                     failed
                                       ? html`
                                           <span class="dot error"></span>
                                           <span>
                                             ${this.hass.localize(
                                               "ui.panel.config.backup.details.locations.backup_failed"
                                             )}
                                           </span>
                                         `
                                       : unencrypted
                                         ? html`
                                             <span class="dot warning"></span>
                                             <span>
                                               ${this.hass.localize(
                                                 "ui.panel.config.backup.details.locations.unencrypted"
                                               )}</span
                                             >
                                           `
                                         : html`
                                             <span class="dot success"></span>
                                             <span
                                               >${this.hass.localize(
                                                 "ui.panel.config.backup.details.locations.encrypted"
                                               )}</span
                                             >
                                           `
                                   }
                                   ${success ? this._renderCopy(agentId) : nothing}
                                </div>
                              </div>
                              ${
                                success
                                  ? html`
                                      <ha-dropdown
                                        slot="end"
                                        @wa-select=${this._handleAgentAction}
                                        .agent=${agentId}
                                        fixed
                                      >
                                        <ha-icon-button
                                          slot="trigger"
                                          .label=${this.hass.localize(
                                            "ui.common.menu"
                                          )}
                                          .path=${mdiDotsVertical}
                                        ></ha-icon-button>
                                        ${
                                          !isLocalAgent(agentId)
                                            ? html`<ha-dropdown-item
                                                value="check_full"
                                                .disabled=${!!this._checkingAgent}
                                              >
                                                <ha-svg-icon
                                                  slot="icon"
                                                  .path=${mdiCheckAll}
                                                ></ha-svg-icon>
                                                ${modeText(
                                                  this.hass.localize,
                                                  "ui.panel.config.backup.self_check.copy.check_full"
                                                )}
                                              </ha-dropdown-item>`
                                            : nothing
                                        }
                                        <ha-dropdown-item value="download">
                                          <ha-svg-icon
                                            slot="icon"
                                            .path=${mdiDownload}
                                          ></ha-svg-icon>
                                          ${this.hass.localize(
                                            "ui.panel.config.backup.details.locations.download"
                                          )}
                                        </ha-dropdown-item>
                                      </ha-dropdown>
                                    `
                                  : nothing
                              }
                            </ha-list-item-base>
                          `;
                          })}
                        </ha-list-base>
                      </div>
                    </ha-card>
                  `
          }
        </div>
      </hass-subpage>
    `;
  }

  private _deleteProofChanged(
    ev: HASSDomEvent<HASSDomEvents["backup-delete-proof-changed"]>
  ) {
    if (!this._backup) {
      return;
    }
    this._backup = { ...this._backup, delete_proof: ev.detail.deleteProof };
  }

  private _selfCheckUpdated(ev: CustomEvent) {
    if (!this._backup) {
      return;
    }
    this._backup = { ...this._backup, self_check: ev.detail.selfCheck };
  }

  private _restore(ev: CustomEvent) {
    if (!this._backup || !ev.detail.selectedData) {
      return;
    }
    showRestoreBackupDialog(this, {
      backup: this._backup,
      selectedData: ev.detail.selectedData,
    });
  }

  private async _fetchBackup() {
    try {
      const response = await fetchBackupDetails(this.hass, this.backupId);
      this._backup = response.backup;
      this._agents = computeAgents(response.backup);
    } catch (err: any) {
      this._error =
        err?.message ||
        this.hass.localize("ui.panel.config.backup.details.error");
    }
  }

  private _handleAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadBackup();
        break;
      case "delete":
        this._deleteBackup();
        break;
    }
  }

  private _handleAgentAction(ev: HaDropdownSelectEvent) {
    const button = ev.currentTarget;
    const agentId = (button as any).agent;
    if (ev.detail.item.value === "check_full") {
      this._checkLocationInFull(agentId);
      return;
    }
    this._downloadBackup(agentId);
  }

  private _copyText(key: string, values?: Record<string, string | number>) {
    return modeText(
      this.hass.localize,
      `ui.panel.config.backup.self_check.copy.${key}` as any,
      values
    );
  }

  // The result of the last self-check for the copy at one location, in plain
  // words. An older Core does not report each location, and then nothing is
  // shown here.
  private _renderCopy(agentId: string) {
    const selfCheck = this._backup?.self_check;
    if (!selfCheck || !Array.isArray(selfCheck.copies)) {
      return nothing;
    }
    const copy: BackupSelfCheckCopy | undefined = selfCheck.copies.find(
      (item) => item.agent_id === agentId
    );
    const status = copy?.status ?? "not_checked";
    const known = [
      "verified_in_full",
      "present_size_matches",
      "present_size_differs",
      "content_differs",
      "damaged",
      "missing",
      "could_not_check",
      "not_checked",
    ].includes(status);
    const tone =
      status === "verified_in_full" || status === "present_size_matches"
        ? "success"
        : status === "could_not_check" || status === "not_checked" || !known
          ? "neutral"
          : "error";
    let reason = "";
    if (copy?.reason && status === "could_not_check") {
      reason = selfCheckReasonText(this.hass, copy.reason);
    }
    const note =
      copy?.downgraded === "over_size_limit"
        ? this._copyText("over_size_limit")
        : "";
    return html`<span class="copy">
      <span class="dot ${tone}"></span>
      <span
        >${known ? this._copyText(`status.${status}`) : status}${
          reason ? html`: ${reason}` : nothing
        }${note ? html` · ${note}` : nothing}</span
      >
    </span>`;
  }

  private async _checkLocationInFull(agentId: string): Promise<void> {
    const backup = this._backup;
    if (!backup || this._checkingAgent) {
      return;
    }
    const agent = this._agents.find((item) => item.id === agentId);
    const name = computeBackupAgentName(
      this.hass.localize,
      agentId,
      this.agents
    );
    const confirmed = await showConfirmationDialog(this, {
      title: this._copyText("check_full_title", { name }),
      text: this._copyText("check_full_text", {
        name,
        size: agent?.size ? bytesToString(agent.size, 1) : "?",
      }),
      confirmText: this._copyText("check_full_confirm"),
    });
    if (!confirmed) {
      return;
    }
    this._checkingAgent = agentId;
    try {
      const { self_check: selfCheck } = await runBackupSelfCheckLocation(
        this.hass,
        backup.backup_id,
        agentId,
        true
      );
      this._backup = { ...backup, self_check: selfCheck };
      fireEvent(this, "ha-refresh-backup-info");
    } catch (err: any) {
      const code = err?.code;
      showToast(this, {
        message:
          code === "self_check_running"
            ? this._copyText("error_running")
            : code === "backup_manager_busy"
              ? this._copyText("error_busy")
              : this._copyText("error_failed"),
        duration: 8000,
        dismissable: true,
      });
    } finally {
      this._checkingAgent = undefined;
    }
  }

  private async _downloadBackup(agentId?: string): Promise<void> {
    await downloadBackup(this.hass, this, this._backup!, this.config, agentId);
  }

  private async _deleteBackup(): Promise<void> {
    if (this._backup?.delete_proof) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete.title"
        ),
        text: modeText(
          this.hass.localize,
          "ui.panel.config.backup.delete_proof.turn_off_first"
        ),
      });
      return;
    }
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize("ui.panel.config.backup.dialogs.delete.title"),
      text: this.hass.localize("ui.panel.config.backup.dialogs.delete.text"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });

    if (!confirm) {
      return;
    }

    try {
      await deleteBackup(this.hass, this._backup!.backup_id);
    } catch (err: unknown) {
      // The backend refuses a backup marked delete proof since this page loaded
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.backup.dialogs.delete.failed"
        ),
        text: isDeleteProofError(err)
          ? modeText(
              this.hass.localize,
              "ui.panel.config.backup.delete_proof.turn_off_first"
            )
          : (err as { message?: string })?.message || String(err),
      });
      this._fetchBackup();
      return;
    }
    fireEvent(this, "ha-refresh-backup-info");
    navigate("/config/backup");
  }

  static styles = css`
    .content {
      padding: 28px 20px 0;
      max-width: 690px;
      margin: 0 auto;
      gap: var(--ha-space-6);
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      margin-bottom: 24px;
    }
    ha-spinner {
      margin: 24px auto;
    }
    .card-content {
      padding: 0 20px;
    }
    .card-actions {
      display: flex;
      justify-content: flex-end;
    }
    ha-list-item-base {
      --ha-row-item-padding-inline: 0;
    }
    ha-list-item-base img {
      width: 48px;
    }
    ha-list-item-base ha-svg-icon[slot="start"] {
      --mdc-icon-size: 48px;
      color: var(--primary-text-color);
    }
    ha-button.danger {
      --mdc-theme-primary: var(--error-color);
    }
    ha-list-item-base [slot="supporting-text"] {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      flex-direction: row;
      gap: var(--ha-space-2);
      line-height: var(--ha-line-height-condensed);
    }
    .dot {
      display: block;
      position: relative;
      width: 8px;
      height: 8px;
      background-color: var(--disabled-color);
      border-radius: var(--ha-border-radius-circle);
      flex: none;
    }
    .dot.success {
      background-color: var(--success-color);
    }
    .dot.warning {
      background-color: var(--warning-color);
    }
    .dot.error {
      background-color: var(--error-color);
    }
    .card-header {
      padding-bottom: 8px;
    }
    .copy {
      white-space: normal;
      text-overflow: clip;
      overflow: visible;
      display: inline-flex;
      flex: 1 1 100%;
      align-items: center;
      gap: var(--ha-space-2);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .dot.neutral {
      background-color: var(--disabled-color);
    }
    @media (max-width: 600px) {
      .content {
        padding: var(--ha-space-3) var(--ha-space-3) 0;
        gap: var(--ha-space-3);
      }
      .card-content {
        padding: 0 var(--ha-space-3);
      }
      ha-list-item-base ha-svg-icon[slot="start"] {
        --mdc-icon-size: 36px;
      }
      ha-list-item-base img {
        width: 36px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-backup-details": HaConfigBackupDetails;
  }
}
