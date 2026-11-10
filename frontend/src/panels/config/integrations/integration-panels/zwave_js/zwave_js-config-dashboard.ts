import {
  mdiAlertCircleOutline,
  mdiDevices,
  mdiDownload,
  mdiInformationOutline,
  mdiMinus,
  mdiPlus,
  mdiPoll,
  mdiQrcode,
  mdiRefresh,
  mdiShape,
  mdiTextBoxOutline,
  mdiTune,
  mdiVectorPolyline,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { goBack } from "../../../../../common/navigate";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-icon-button";
import "../../../../../components/ha-icon-next";
import "../../../../../components/ha-spinner";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/item/ha-list-item-base";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-base";
import "../../../../../components/list/ha-list-nav";
import "../../../../../components/progress/ha-progress-ring";
import type { ConfigEntry } from "../../../../../data/config_entries";
import {
  ERROR_STATES,
  getConfigEntries,
} from "../../../../../data/config_entries";
import type {
  ZWaveJSClient,
  ZWaveJSNetwork,
  ZwaveJSProvisioningEntry,
} from "../../../../../data/zwave_js";
import {
  fetchZwaveNetworkStatus,
  fetchZwaveProvisioningEntries,
  InclusionState,
  NodeStatus,
  ProvisioningEntryStatus,
  restoreZwaveNVM,
  subscribeS2Inclusion,
  subscribeZwaveNVMBackup,
} from "../../../../../data/zwave_js";
import { showConfigFlowDialog } from "../../../../../dialogs/config-flow/show-dialog-config-flow";
import { showAlertDialog } from "../../../../../dialogs/generic/show-dialog-box";
import "../../../../../layouts/hass-subpage";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant, Route } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { fileDownload } from "../../../../../util/file_download";
import { showZWaveJSAddNodeDialog } from "./add-node/show-dialog-zwave_js-add-node";
import { showZWaveJSRemoveNodeDialog } from "./show-dialog-zwave_js-remove-node";

@customElement("zwave_js-config-dashboard")
class ZWaveJSConfigDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public configEntryId!: string;

  @state() private _configEntry?: ConfigEntry;

  @state() private _network?: ZWaveJSNetwork;

  @state() private _provisioningEntries?: ZwaveJSProvisioningEntry[];

  @state() private _status?: ZWaveJSClient["state"];

  @state() private _multipleNetworks = false;

  @query("#nvm-restore-file") private _restoreFileInput?: HTMLInputElement;

  private _dialogOpen = false;

  private _s2InclusionUnsubscribe?: Promise<UnsubscribeFunc>;

  private _unsubscribeBackup?: UnsubscribeFunc;

  private _unsubscribeRestore?: UnsubscribeFunc;

  @state() private _backupProgress?: number;

  @state() private _restoreProgress?: number;

  public connectedCallback() {
    super.connectedCallback();
    if (this.hass && this.hasUpdated && !this._dialogOpen) {
      this._subscribeS2Inclusion();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeS2Inclusion();
  }

  protected async firstUpdated() {
    if (this.hass) {
      if (this.isConnected) {
        this._subscribeS2Inclusion();
      }
      await this._fetchData();
      if (!this.isConnected) {
        return;
      }
      if (this._status === "connected") {
        const inclusion_state = this._network?.controller.inclusion_state;
        // show dialog if inclusion/exclusion is already in progress
        if (inclusion_state === InclusionState.Including) {
          this._openInclusionDialog(undefined, true);
        } else if (inclusion_state === InclusionState.Excluding) {
          this._removeNodeClicked();
        }
      }
    }
  }

  protected render() {
    if (!this._configEntry) {
      return nothing;
    }

    if (ERROR_STATES.includes(this._configEntry.state)) {
      return this._renderErrorScreen();
    }

    const provisioningDevices =
      this._provisioningEntries?.filter(
        (entry) =>
          !entry.nodeId && entry.status === ProvisioningEntryStatus.Active
      ).length ?? 0;
    const nodes = this._network?.controller.nodes ?? [];
    const offlineDevices = nodes.filter(
      (node) => node.status === NodeStatus.Dead
    ).length;
    // Not-ready nodes are included but their interview has not completed yet.
    // They are distinct from the provisioning entries, which are not included.
    const notReadyDevices = nodes.filter(
      (node) => !node.ready && node.status !== NodeStatus.Dead
    ).length;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize(
          "ui.panel.config.zwave_js.navigation.general"
        )}
        back-path="/config/connectivity"
      >
        <ha-icon-button
          slot="toolbar-icon"
          @click=${this._fetchData}
          .path=${mdiRefresh}
          .label=${this.hass!.localize("ui.common.refresh")}
        ></ha-icon-button>
        <div class="page">
          ${
            this._network
              ? html`
                  ${this._renderHero(
                    provisioningDevices,
                    offlineDevices,
                    notReadyDevices
                  )}
                  <div class="columns">
                    <div class="column">
                      ${this._renderNetworkCard()} ${this._renderBackupCard()}
                    </div>
                    <div class="column">${this._renderSmartStartCard()}</div>
                  </div>
                `
              : html`<div class="loading">
                  <ha-spinner></ha-spinner>
                </div>`
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderHero(
    provisioningDevices: number,
    offlineDevices: number,
    notReadyDevices: number
  ) {
    const deviceOnline = this._status === "connected";
    const controller = this._network!.controller;
    const statusParts: string[] = [];
    if (offlineDevices > 0) {
      statusParts.push(
        this.hass.localize(
          "ui.panel.config.zwave_js.dashboard.devices_offline",
          { count: offlineDevices }
        )
      );
    }
    if (notReadyDevices > 0) {
      statusParts.push(
        this.hass.localize("ui.panel.config.zwave_js.dashboard.not_ready", {
          count: notReadyDevices,
        })
      );
    }
    if (provisioningDevices > 0) {
      statusParts.push(
        this.hass.localize("ui.panel.config.zwave_js.dashboard.not_included", {
          count: provisioningDevices,
        })
      );
    }
    const devices = this.hass.localize(
      "ui.panel.config.zwave_js.dashboard.devices",
      { count: controller.nodes.length + provisioningDevices }
    );
    const title = !deviceOnline
      ? this._multipleNetworks && this._configEntry
        ? this.hass.localize(
            "ui.panel.config.zwave_js.network_status.offline_named",
            { name: this._configEntry.title }
          )
        : this.hass.localize("ui.panel.config.zwave_js.network_status.offline")
      : this._multipleNetworks && this._configEntry
        ? this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.hero_ready_named",
            { name: this._configEntry.title, devices }
          )
        : this.hass.localize("ui.panel.config.zwave_js.dashboard.hero_ready", {
            devices,
          });

    // Only facts the controller reports; nothing estimated.
    const facts: string[] = [];
    if (controller.firmware_version) {
      facts.push(
        this.hass.localize("ui.panel.config.zwave_js.dashboard.fact_firmware", {
          version: controller.firmware_version,
        })
      );
    }
    if (controller.supports_long_range) {
      facts.push(
        this.hass.localize("ui.panel.config.zwave_js.dashboard.fact_long_range")
      );
    }
    if (statusParts.length > 0) {
      facts.push(
        `(${statusParts.join(` ${this.hass.localize("ui.common.and")} `)})`
      );
    }

    const inclusionIdle =
      controller.inclusion_state === InclusionState.Idle ||
      controller.inclusion_state === InclusionState.SmartStart;
    const tone = deviceOnline
      ? statusParts.length
        ? "warning"
        : "ok"
      : "error";

    return html`
      <section class="hero ${tone}">
        <div class="hero-text">
          <div class="eyebrow">
            <img
              class="logo"
              alt=""
              crossorigin="anonymous"
              referrerpolicy="no-referrer"
              src=${brandsUrl(
                {
                  domain: "zwave_js",
                  type: "icon",
                  darkOptimized: this.hass.themes?.darkMode,
                },
                this.hass.auth.data.hassUrl
              )}
            />
            <span>Z-Wave</span>
          </div>
          <h2>${title}</h2>
          <p>${facts.join(" ")}</p>
        </div>
        <div class="hero-actions">
          <ha-button
            size="l"
            @click=${this._addNodeClicked}
            .disabled=${this._status !== "connected" || !inclusionIdle}
          >
            <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.zwave_js.common.add_node")}
          </ha-button>
          <ha-button
            appearance="outlined"
            size="l"
            @click=${this._removeNodeClicked}
            .disabled=${
              this._status !== "connected" ||
              controller.inclusion_state === InclusionState.Including
            }
          >
            <ha-svg-icon slot="start" .path=${mdiMinus}></ha-svg-icon>
            ${this.hass.localize(
              "ui.panel.config.zwave_js.common.remove_a_node"
            )}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderNetworkCard() {
    const deviceIds = new Set(
      Object.values(this.hass.devices)
        .filter((device) => device.config_entries.includes(this.configEntryId))
        .map((device) => device.id)
    );
    const entityCount = Object.values(this.hass.entities).filter(
      (entity) => entity.device_id && deviceIds.has(entity.device_id)
    ).length;

    return html`
      <section class="card">
        <h3>
          ${this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.network_card_title"
          )}
        </h3>
        <ha-list-nav
          .ariaLabel=${this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.network_card_title"
          )}
        >
          <ha-list-item-button
            href=${`/config/devices/dashboard?historyBack=1&config_entry=${this.configEntryId}&status=disabled`}
          >
            <ha-svg-icon slot="start" .path=${mdiDevices}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.device_count",
                { count: deviceIds.size }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`/config/entities?historyBack=1&config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon slot="start" .path=${mdiShape}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.entity_count",
                { count: entityCount }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`visualization?config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon slot="start" .path=${mdiVectorPolyline}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.show_map"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.visualization_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`options?config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon slot="start" .path=${mdiTune}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.options_title"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.options_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`statistics?config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon slot="start" .path=${mdiPoll}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.navigation.statistics"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.statistics_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`network-info?config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon
              slot="start"
              .path=${mdiInformationOutline}
            ></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.network_info_title"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.network_info_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
        </ha-list-nav>
      </section>
    `;
  }

  private _renderSmartStartCard() {
    return html`
      <section class="card">
        <h3>
          ${this.hass.localize("ui.panel.config.zwave_js.dashboard.qr_title")}
        </h3>
        <div class="qr">
          <div class="tile qr-tile">
            <ha-svg-icon .path=${mdiQrcode}></ha-svg-icon>
          </div>
          <div class="qr-text">
            <p>
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.qr_description"
              )}
            </p>
            <ha-button
              appearance="filled"
              @click=${this._addNodeClicked}
              .disabled=${
                this._status !== "connected" ||
                (this._network?.controller.inclusion_state !==
                  InclusionState.Idle &&
                  this._network?.controller.inclusion_state !==
                    InclusionState.SmartStart)
              }
            >
              <ha-svg-icon slot="start" .path=${mdiQrcode}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.qr_action"
              )}
            </ha-button>
          </div>
        </div>
        <ha-list-nav
          .ariaLabel=${this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.qr_title"
          )}
        >
          ${
            this._provisioningEntries?.length
              ? html`<ha-list-item-button
                  href=${`provisioned?config_entry=${this.configEntryId}`}
                >
                  <ha-svg-icon slot="start" .path=${mdiQrcode}></ha-svg-icon>
                  <div slot="headline">
                    ${this.hass.localize(
                      "ui.panel.config.zwave_js.dashboard.provisioned_count",
                      { count: this._provisioningEntries.length }
                    )}
                  </div>
                  <ha-icon-next slot="end"></ha-icon-next>
                </ha-list-item-button>`
              : nothing
          }
          <ha-list-item-button
            href=${`logs?config_entry=${this.configEntryId}`}
          >
            <ha-svg-icon slot="start" .path=${mdiTextBoxOutline}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize("ui.panel.config.zwave_js.navigation.logs")}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zwave_js.dashboard.logs_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
        </ha-list-nav>
      </section>
    `;
  }

  private _renderBackupCard() {
    return html`
      <section class="card">
        <h3>
          ${this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.nvm_backup.title"
          )}
        </h3>
        ${
          this._backupProgress !== undefined
            ? html`<div class="backup-progress">
                <ha-progress-ring
                  size="small"
                  .value=${this._backupProgress}
                ></ha-progress-ring>
                ${this.hass.localize(
                  "ui.panel.config.zwave_js.dashboard.nvm_backup.creating"
                )}
                ${this._backupProgress}%
              </div>`
            : this._restoreProgress !== undefined
              ? html`<div class="backup-progress">
                  <ha-progress-ring
                    size="small"
                    .value=${this._restoreProgress}
                  ></ha-progress-ring>
                  ${this.hass.localize(
                    "ui.panel.config.zwave_js.dashboard.nvm_backup.restoring"
                  )}
                  ${this._restoreProgress}%
                </div>`
              : html`<ha-list-base>
                  <ha-list-item-base>
                    <span slot="headline">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.download_backup"
                      )}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.download_backup_description"
                      )}
                    </span>
                    <ha-button
                      appearance="plain"
                      slot="end"
                      size="s"
                      @click=${this._downloadBackup}
                    >
                      <ha-svg-icon
                        .path=${mdiDownload}
                        slot="start"
                      ></ha-svg-icon>
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.download_action"
                      )}
                    </ha-button>
                  </ha-list-item-base>
                  <ha-list-item-base>
                    <span slot="headline">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.restore_backup"
                      )}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.restore_backup_description"
                      )}
                    </span>
                    <ha-button
                      appearance="plain"
                      slot="end"
                      size="s"
                      @click=${this._restoreButtonClick}
                    >
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.restore_action"
                      )}
                    </ha-button>
                    <input
                      type="file"
                      id="nvm-restore-file"
                      accept=".bin"
                      @change=${this._handleRestoreFileSelected}
                      hidden
                    />
                  </ha-list-item-base>
                  <ha-list-item-base>
                    <span slot="headline">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.migrate"
                      )}
                    </span>
                    <span slot="supporting-text">
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.migrate_description"
                      )}
                    </span>
                    <ha-button
                      appearance="plain"
                      slot="end"
                      size="s"
                      @click=${this._openConfigFlow}
                    >
                      ${this.hass.localize(
                        "ui.panel.config.zwave_js.dashboard.nvm_backup.migrate_action"
                      )}
                    </ha-button>
                  </ha-list-item-base>
                </ha-list-base>`
        }
      </section>
    `;
  }

  private _renderErrorScreen() {
    const item = this._configEntry!;
    let stateText: Parameters<typeof this.hass.localize> | undefined;
    let stateTextExtra: TemplateResult | string | undefined;

    if (item.disabled_by) {
      stateText = [
        "ui.panel.config.integrations.config_entry.disable.disabled_cause",
        {
          cause:
            this.hass.localize(
              `ui.panel.config.integrations.config_entry.disable.disabled_by.${item.disabled_by}`
            ) || item.disabled_by,
        },
      ];
      if (item.state === "failed_unload") {
        stateTextExtra = html`.
        ${this.hass.localize(
          "ui.panel.config.integrations.config_entry.disable_restart_confirm"
        )}.`;
      }
    } else if (item.state === "not_loaded") {
      stateText = ["ui.panel.config.integrations.config_entry.not_loaded"];
    } else if (ERROR_STATES.includes(item.state)) {
      stateText = [
        `ui.panel.config.integrations.config_entry.state.${item.state}`,
      ];
      if (item.reason) {
        this.hass.loadBackendTranslation("config", item.domain);
        stateTextExtra = html` ${
          this.hass.localize(
            `component.${item.domain}.config.error.${item.reason}`
          ) || item.reason
        }`;
      } else {
        stateTextExtra = html`
          <br />
          <a href="/config/logs?search=zwave_js"
            >${this.hass.localize(
              "ui.panel.config.integrations.config_entry.check_the_logs"
            )}</a
          >
        `;
      }
    }

    return html` ${
      stateText
        ? html`
            <div class="error-message">
              <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              <h3>
                ${this._configEntry!.title}: ${this.hass.localize(...stateText)}
              </h3>
              <p>${stateTextExtra}</p>
              <ha-button @click=${this._handleBack}>
                ${this.hass?.localize("ui.common.back")}
              </ha-button>
            </div>
          `
        : nothing
    }`;
  }

  private _handleBack(): void {
    goBack("/config/integrations/integration/zwave_js");
  }

  private _fetchData = async () => {
    if (!this.configEntryId) {
      return;
    }
    const configEntries = await getConfigEntries(this.hass, {
      domain: "zwave_js",
    });
    this._multipleNetworks =
      configEntries.filter(
        (entry) => entry.disabled_by === null && entry.source !== "ignore"
      ).length > 1;
    this._configEntry = configEntries.find(
      (entry) => entry.entry_id === this.configEntryId
    );

    if (ERROR_STATES.includes(this._configEntry!.state)) {
      return;
    }

    const [network, provisioningEntries] = await Promise.all([
      fetchZwaveNetworkStatus(this.hass!.connection, {
        entry_id: this.configEntryId,
      }),
      fetchZwaveProvisioningEntries(this.hass!, this.configEntryId),
    ]);

    this._provisioningEntries = provisioningEntries;

    this._network = network;

    this._status = this._network.client.state;
  };

  private async _addNodeClicked() {
    this._openInclusionDialog();
  }

  private async _removeNodeClicked() {
    showZWaveJSRemoveNodeDialog(this, {
      entryId: this.configEntryId!,
      skipConfirmation:
        this._network?.controller.inclusion_state === InclusionState.Excluding,
      onClose: this._fetchData,
    });
  }

  private async _openConfigFlow() {
    if (!this.configEntryId) {
      return;
    }
    showConfigFlowDialog(this, {
      startFlowHandler: "zwave_js",
      domain: "zwave_js",
      entryId: this.configEntryId,
    });
  }

  private async _downloadBackup() {
    try {
      this._backupProgress = 0;
      this._unsubscribeBackup = await subscribeZwaveNVMBackup(
        this.hass!,
        this.configEntryId!,
        this._handleBackupMessage
      );
    } catch (err: any) {
      this._backupProgress = undefined;
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.zwave_js.dashboard.nvm_backup.backup_failed"
        ),
        text: err.message,
        warning: true,
      });
    }
  }

  private _restoreButtonClick() {
    this._restoreFileInput?.click();
  }

  private async _handleRestoreFileSelected(ev: Event) {
    const file = (ev.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const input = ev.target as HTMLInputElement;

    try {
      this._restoreProgress = 0;
      // Read the file as base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as ArrayBuffer;
          const base64 = btoa(
            new Uint8Array(result).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsArrayBuffer(file);
      });

      this._unsubscribeRestore = await restoreZwaveNVM(
        this.hass!,
        this.configEntryId!,
        base64Data,
        this._handleRestoreMessage
      );
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.zwave_js.dashboard.nvm_backup.restore_failed"
        ),
        text: err.message,
        warning: true,
      });
      this._restoreProgress = undefined;
    }

    // Reset the file input so the same file can be selected again
    input.value = "";
  }

  private _openInclusionDialog(dsk?: string, inclusionOngoing = false) {
    if (!this._dialogOpen) {
      this._unsubscribeS2Inclusion();

      showZWaveJSAddNodeDialog(this, {
        entry_id: this.configEntryId!,
        dsk,
        onStop: this._handleInclusionDialogClosed,
        longRangeSupported: !!this._network?.controller?.supports_long_range,
        inclusionOngoing,
      });
      this._dialogOpen = true;
    }
  }

  private _handleInclusionDialogClosed = () => {
    // refresh the data after the dialog is closed. add a small delay for the inclusion state to update
    setTimeout(() => this._fetchData(), 100);
    this._dialogOpen = false;
    if (this.isConnected) {
      this._subscribeS2Inclusion();
    }
  };

  private _subscribeS2Inclusion() {
    this._unsubscribeS2Inclusion();
    this._s2InclusionUnsubscribe = subscribeS2Inclusion(
      this.hass,
      this.configEntryId,
      (message) => {
        this._openInclusionDialog(message.dsk);
      }
    );
  }

  private _unsubscribeS2Inclusion() {
    this._s2InclusionUnsubscribe
      ?.then((unsubscribe) => unsubscribe())
      .catch(() => undefined);
    this._s2InclusionUnsubscribe = undefined;
  }

  private _handleBackupMessage = (message: any) => {
    if (message.event === "finished") {
      this._backupProgress = undefined;
      this._unsubscribeBackup?.();
      this._unsubscribeBackup = undefined;
      try {
        const blob = new Blob(
          [Uint8Array.from(atob(message.data), (c) => c.charCodeAt(0))],
          { type: "application/octet-stream" }
        );
        const url = URL.createObjectURL(blob);
        fileDownload(
          url,
          `zwave_js_backup_${new Date().toISOString().replace(/[:.]/g, "-")}.bin`
        );
      } catch (err: any) {
        showAlertDialog(this, {
          title: this.hass.localize(
            "ui.panel.config.zwave_js.dashboard.nvm_backup.backup_failed"
          ),
          text: err.message,
          warning: true,
        });
      }
    } else if (message.event === "nvm backup progress") {
      this._backupProgress = Math.round(
        (message.bytesRead / message.total) * 100
      );
    }
  };

  private _handleRestoreMessage = (message: any) => {
    if (message.event === "finished") {
      this._restoreProgress = undefined;
      this._unsubscribeRestore?.();
      this._unsubscribeRestore = undefined;

      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.zwave_js.dashboard.nvm_backup.restore_complete"
        ),
      });
      this._fetchData();
    } else if (message.event === "nvm convert progress") {
      // assume convert takes half the time of restore
      this._restoreProgress = Math.round(
        (message.bytesRead / message.total) * 50
      );
    } else if (message.event === "nvm restore progress") {
      this._restoreProgress =
        Math.round((message.bytesWritten / message.total) * 50) + 50;
    }
  };

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .error-message {
          display: flex;
          color: var(--primary-text-color);
          height: calc(100% - var(--header-height));
          padding: var(--ha-space-4);
          align-items: center;
          justify-content: center;
          flex-direction: column;
        }

        .error-message h3 {
          text-align: center;
          font-weight: var(--ha-font-weight-bold);
        }

        .error-message ha-svg-icon {
          color: var(--error-color);
          width: 64px;
          height: 64px;
        }

        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8)
            calc(var(--ha-space-8) + var(--safe-area-inset-bottom, 0px));
        }

        .loading {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-12);
        }

        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-4) var(--ha-space-6);
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          --hero-tone: var(--primary-color);
          background: color-mix(
            in srgb,
            var(--hero-tone) 16%,
            var(--card-background-color)
          );
        }

        .hero.warning {
          --hero-tone: var(--warning-color);
        }

        .hero.error {
          --hero-tone: var(--error-color);
        }

        .hero-text {
          flex: 1;
          min-width: min(260px, 100%);
        }

        .eyebrow {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }

        .eyebrow .logo {
          width: 24px;
          height: 24px;
          object-fit: contain;
        }

        h2 {
          margin: var(--ha-space-2) 0 var(--ha-space-1);
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }

        .hero p {
          margin: 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }

        .hero-actions {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          min-width: min(220px, 100%);
        }

        .columns {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          align-items: start;
          gap: var(--ha-space-4);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        @media (max-width: 800px) {
          .columns {
            grid-template-columns: minmax(0, 1fr);
          }

          .page {
            padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
          }
        }

        .card {
          box-sizing: border-box;
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          overflow: hidden;
        }

        h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .qr {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-2);
        }

        .qr-text {
          flex: 1;
          min-width: min(200px, 100%);
        }

        .qr-text p {
          margin: 0 0 var(--ha-space-3);
          color: var(--secondary-text-color);
        }

        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .qr-tile {
          width: 72px;
          height: 72px;
          --mdc-icon-size: 40px;
        }

        .backup-progress {
          display: flex;
          align-items: center;
          padding: var(--ha-space-4) 0;
          gap: var(--ha-space-4);
        }

        ha-button[size="s"] ha-svg-icon {
          --mdc-icon-size: 16px;
        }

        [hidden] {
          display: none;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "zwave_js-config-dashboard": ZWaveJSConfigDashboard;
  }
}
