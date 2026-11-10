import {
  mdiChartBellCurve,
  mdiDevices,
  mdiDownload,
  mdiFolderMultipleOutline,
  mdiInformationOutline,
  mdiPlus,
  mdiShape,
  mdiSignalCellular1,
  mdiSwapHorizontal,
  mdiCogOutline,
  mdiTune,
  mdiVectorPolyline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../../../common/config/is_component_loaded";
import type { HASSDomCurrentTargetEvent } from "../../../../../common/dom/fire_event";
import { navigate } from "../../../../../common/navigate";
import "../../../../../components/buttons/ha-progress-button";
import type { HaProgressButton } from "../../../../../components/buttons/ha-progress-button";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-button";
import "../../../../../components/ha-button-toggle-group";
import "../../../../../components/ha-card";
import { animationStyles } from "../../../../../resources/theme/animations.globals";

import "../../../../../components/ha-icon-next";
import "../../../../../components/ha-spinner";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/item/ha-list-item-base";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-base";
import "../../../../../components/list/ha-list-nav";
import type { ConfigEntry } from "../../../../../data/config_entries";
import { getConfigEntries } from "../../../../../data/config_entries";
import type {
  ZHAConfiguration,
  ZHADevice,
  ZHANetworkBackupAndMetadata,
  ZHANetworkSettings,
} from "../../../../../data/zha";
import {
  createZHANetworkBackup,
  fetchDevices,
  fetchGroups,
  fetchZHAConfiguration,
  fetchZHANetworkSettings,
  ZHADeviceType,
} from "../../../../../data/zha";
import { showOptionsFlowDialog } from "../../../../../dialogs/config-flow/show-dialog-options-flow";
import { showAlertDialog } from "../../../../../dialogs/generic/show-dialog-box";
import "../../../../../layouts/hass-subpage";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant, Route, ToggleButton } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { fileDownload } from "../../../../../util/file_download";
import { renderConfigEntryError } from "../../ha-config-integration-page";

/** Link quality (out of 255) below which a device is called a weak link. */
const WEAK_LINK_LQI = 50;

@customElement("zha-config-dashboard")
class ZHAConfigDashboard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _configEntry?: ConfigEntry;

  @state() private _configuration?: ZHAConfiguration;

  @state() private _networkSettings?: ZHANetworkSettings;

  @state() private _zhaDevices?: ZHADevice[];

  @state() private _offlineDevices = 0;

  @state() private _totalGroups?: number;

  @state() private _asyncDataLoaded = false;

  @state() private _error?: string;

  @state() private _generatingBackup = false;

  @state() private _networkView: "map" | "list" = "map";

  protected firstUpdated(changedProperties: PropertyValues<this>) {
    super.firstUpdated(changedProperties);
    if (!this.hass) {
      return;
    }
    if (!isComponentLoaded(this.hass.config, "zha")) {
      navigate("/config/integrations", { replace: true });
      return;
    }
    this.hass.loadBackendTranslation("config_panel", "zha", false);
    this._load();
  }

  private async _load(): Promise<void> {
    await this._fetchConfigEntry();
    // Core only has the ZHA commands once the config entry is loaded
    if (!this._configEntry || this._configEntry.state !== "loaded") {
      return;
    }
    this._fetchConfiguration();
    this._fetchNetworkSettings();
    this._fetchDevicesAndGroups();
  }

  private _weakDevices = memoizeOne((devices?: ZHADevice[]): ZHADevice[] =>
    (devices ?? []).filter(
      (device) =>
        device.available &&
        device.device_type !== ZHADeviceType.Coordinator &&
        device.lqi !== null &&
        device.lqi < WEAK_LINK_LQI
    )
  );

  private _sortedDevices = memoizeOne((devices?: ZHADevice[]): ZHADevice[] =>
    [...(devices ?? [])].sort((a, b) =>
      this._deviceName(a).localeCompare(this._deviceName(b))
    )
  );

  private _deviceName(device: ZHADevice): string {
    return device.user_given_name || device.name;
  }

  protected render(): TemplateResult {
    if (!this._configEntry) {
      return html`
        <hass-subpage
          .hass=${this.hass}
          .narrow=${this.narrow}
          .header=${this.hass.localize("ui.panel.config.zha.network.caption")}
          back-path="/config/connectivity"
        >
          <div class="loading">
            <ha-spinner></ha-spinner>
          </div>
        </hass-subpage>
      `;
    }

    const configEntry = this._configEntry;
    const devices = Object.values(this.hass.devices).filter((device) =>
      device.config_entries.includes(configEntry.entry_id)
    );
    const deviceCount = devices.length;

    let entityCount = 0;
    for (const entity of Object.values(this.hass.entities)) {
      if (entity.platform === "zha") {
        entityCount++;
      }
    }
    const deviceOnline =
      configEntry.state === "loaded" &&
      (this._offlineDevices < deviceCount || deviceCount === 0);
    const weakDevices = this._weakDevices(this._zhaDevices);
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.zha.network.caption")}
        back-path="/config/connectivity"
      >
        <div class="page">
          ${this._renderHero(deviceOnline, deviceCount, weakDevices.length)}
          <div class="columns">
            ${this._renderNetworkCard(deviceCount, weakDevices)}
            <div class="column">
              ${this._renderActionsCard()}
              ${this._renderMoreCard(deviceCount, entityCount)}
              ${this._renderWeakLinkAlert(weakDevices)}
            </div>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _heroTitle(deviceOnline: boolean, deviceCount: number): string {
    const devices = this.hass.localize(
      "ui.panel.config.zha.configuration_page.devices",
      { count: deviceCount }
    );
    if (!deviceOnline) {
      return this.hass.localize(
        "ui.panel.config.zha.configuration_page.hero_offline"
      );
    }
    if (!this._asyncDataLoaded) {
      return devices;
    }
    if (this._offlineDevices > 0) {
      return this.hass.localize(
        "ui.panel.config.zha.configuration_page.hero_attention",
        { devices, offline: this._offlineDevices }
      );
    }
    return this.hass.localize(
      "ui.panel.config.zha.configuration_page.hero_healthy",
      { devices }
    );
  }

  /** A line of facts the network reports about itself; nothing estimated. */
  private _heroFacts(weakCount: number): string {
    const facts: string[] = [];
    const channel = this._networkSettings?.settings.network_info.channel;
    if (channel !== undefined) {
      facts.push(
        this.hass.localize(
          "ui.panel.config.zha.configuration_page.hero_channel",
          { channel }
        )
      );
    }
    if (this._networkSettings?.radio_type) {
      facts.push(
        this.hass.localize(
          "ui.panel.config.zha.configuration_page.hero_radio",
          { radio: this._networkSettings.radio_type }
        )
      );
    }
    if (weakCount > 0) {
      facts.push(
        this.hass.localize(
          "ui.panel.config.zha.configuration_page.hero_weak_links",
          { count: weakCount }
        )
      );
    }
    return facts.join(" ");
  }

  private _renderHero(
    deviceOnline: boolean,
    deviceCount: number,
    weakCount: number
  ) {
    const tone = !deviceOnline
      ? "error"
      : this._asyncDataLoaded && (this._offlineDevices > 0 || weakCount > 0)
        ? "warning"
        : "ok";
    const loaded = this._configEntry!.state === "loaded";
    return html`
      ${
        !loaded
          ? html`<ha-alert alert-type="error">
              ${this.hass.localize(
                `ui.panel.config.integrations.config_entry.state.${this._configEntry!.state}`
              )}:
              ${renderConfigEntryError(this.hass, this._configEntry!)}
            </ha-alert>`
          : this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
      }
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
                  domain: "zha",
                  type: "icon",
                  darkOptimized: this.hass.themes?.darkMode,
                },
                this.hass.auth.data.hassUrl
              )}
            />
            <span>Zigbee</span>
          </div>
          <h2>${this._heroTitle(deviceOnline, deviceCount)}</h2>
          <p class="fade-in">${this._heroFacts(weakCount)}</p>
        </div>
        <div class="hero-actions">
          <ha-button size="l" href="/config/zha/add">
            <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
            ${this.hass.localize("ui.panel.config.zha.add_device")}
          </ha-button>
          <ha-button appearance="outlined" size="l" href="/config/zha/options">
            <ha-svg-icon slot="start" .path=${mdiCogOutline}></ha-svg-icon>
            ${this.hass.localize(
              "ui.panel.config.zha.configuration_page.network_settings"
            )}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _networkViews(): ToggleButton[] {
    return [
      {
        label: this.hass.localize(
          "ui.panel.config.zha.configuration_page.view_map"
        ),
        value: "map",
      },
      {
        label: this.hass.localize(
          "ui.panel.config.zha.configuration_page.view_list"
        ),
        value: "list",
      },
    ];
  }

  private _renderNetworkCard(deviceCount: number, weakDevices: ZHADevice[]) {
    return html`
      <section class="card network">
        <div class="card-top">
          <h3>
            ${this.hass.localize(
              "ui.panel.config.zha.configuration_page.my_network_title"
            )}
          </h3>
          <ha-button-toggle-group
            size="s"
            .buttons=${this._networkViews()}
            .active=${this._networkView}
            @value-changed=${this._networkViewChanged}
          ></ha-button-toggle-group>
        </div>
        ${
          this._networkView === "map"
            ? this._renderMapSummary(deviceCount, weakDevices.length)
            : this._renderDeviceList()
        }
      </section>
    `;
  }

  private _renderMapSummary(deviceCount: number, weakCount: number) {
    const devices = this._zhaDevices;
    const count = (type: ZHADeviceType) =>
      devices?.filter((device) => device.device_type === type).length ?? 0;
    const legend = [
      {
        key: "coordinator",
        value: count(ZHADeviceType.Coordinator),
      },
      { key: "routers", value: count(ZHADeviceType.Router) },
      { key: "end_devices", value: count(ZHADeviceType.EndDevice) },
      { key: "weak", value: weakCount },
    ];
    return html`
      <p class="hint">
        ${this.hass.localize(
          "ui.panel.config.zha.configuration_page.map_hint",
          { count: deviceCount }
        )}
      </p>
      ${
        devices
          ? html`<ul class="legend">
              ${legend.map(
                (item) =>
                  html`<li>
                    <span class="dot ${item.key}"></span>
                    <span class="legend-count">${item.value}</span>
                    ${this.hass.localize(
                      `ui.panel.config.zha.configuration_page.legend_${item.key}`
                    )}
                  </li>`
              )}
            </ul>`
          : this._asyncDataLoaded
            ? nothing
            : html`<div class="loading small">
                <ha-spinner size="small"></ha-spinner>
              </div>`
      }
      <div class="actions">
        <ha-button appearance="filled" href="/config/zha/visualization">
          <ha-svg-icon slot="start" .path=${mdiVectorPolyline}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.zha.configuration_page.show_map"
          )}
        </ha-button>
      </div>
    `;
  }

  private _renderDeviceList() {
    const devices = this._sortedDevices(this._zhaDevices);
    if (!this._zhaDevices) {
      return this._asyncDataLoaded
        ? html`<p class="hint">
            ${this.hass.localize(
              "ui.panel.config.zha.configuration_page.list_unavailable"
            )}
          </p>`
        : html`<div class="loading small">
            <ha-spinner size="small"></ha-spinner>
          </div>`;
    }
    if (!devices.length) {
      return html`<p class="hint">
        ${this.hass.localize(
          "ui.panel.config.zha.configuration_page.list_empty"
        )}
      </p>`;
    }
    return html`
      <ha-list-nav
        .ariaLabel=${this.hass.localize(
          "ui.panel.config.zha.configuration_page.my_network_title"
        )}
      >
        ${devices.map(
          (device) => html`
            <ha-list-item-button href=${`/config/zha/device/${device.ieee}`}>
              <div slot="headline">${this._deviceName(device)}</div>
              <div slot="supporting-text">
                ${
                  device.available
                    ? device.lqi !== null
                      ? this.hass.localize(
                          "ui.panel.config.zha.configuration_page.signal",
                          { lqi: device.lqi }
                        )
                      : this.hass.localize(
                          "ui.panel.config.zha.configuration_page.signal_unknown"
                        )
                    : this.hass.localize(
                        "ui.panel.config.zha.configuration_page.device_offline"
                      )
                }
              </div>
              <ha-icon-next slot="end"></ha-icon-next>
            </ha-list-item-button>
          `
        )}
      </ha-list-nav>
    `;
  }

  private _renderActionsCard() {
    const channel = this._networkSettings?.settings.network_info.channel;
    return html`
      <section class="card">
        <ha-list-nav
          .ariaLabel=${this.hass.localize(
            "ui.panel.config.zha.configuration_page.my_network_title"
          )}
        >
          <ha-list-item-button href="/config/zha/groups">
            <div slot="start" class="tile">
              <ha-svg-icon .path=${mdiFolderMultipleOutline}></ha-svg-icon>
            </div>
            <div slot="headline">
              ${this.hass.localize("ui.panel.config.zha.groups.groups.caption")}
            </div>
            <div
              slot="supporting-text"
              class=${
                this._asyncDataLoaded && this._totalGroups !== undefined
                  ? "fade-in"
                  : ""
              }
            >
              ${
                this._asyncDataLoaded && this._totalGroups !== undefined
                  ? this.hass.localize(
                      "ui.panel.config.zha.configuration_page.group_count",
                      { count: this._totalGroups }
                    )
                  : this.hass.localize(
                      "ui.panel.config.zha.configuration_page.groups_description"
                    )
              }
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button href="/config/zha/network-info">
            <div slot="start" class="tile">
              <ha-svg-icon .path=${mdiChartBellCurve}></ha-svg-icon>
            </div>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.change_channel"
              )}
            </div>
            <div slot="supporting-text">
              ${
                channel !== undefined
                  ? this.hass.localize(
                      "ui.panel.config.zha.configuration_page.change_channel_now",
                      { channel }
                    )
                  : this.hass.localize(
                      "ui.panel.config.zha.configuration_page.channel_description"
                    )
              }
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
        </ha-list-nav>
        <ha-list-base>
          <ha-list-item-base>
            <div slot="start" class="tile">
              <ha-svg-icon .path=${mdiDownload}></ha-svg-icon>
            </div>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.download_backup"
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.download_backup_description"
              )}
            </span>
            <ha-progress-button
              appearance="plain"
              slot="end"
              size="s"
              .iconPath=${mdiDownload}
              .progress=${this._generatingBackup}
              .disabled=${this._configEntry?.state !== "loaded"}
              @click=${this._createAndDownloadBackup}
            >
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.download_backup_action"
              )}
            </ha-progress-button>
          </ha-list-item-base>
          <ha-list-item-base>
            <div slot="start" class="tile">
              <ha-svg-icon .path=${mdiSwapHorizontal}></ha-svg-icon>
            </div>
            <span slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.migrate_radio"
              )}
            </span>
            <span slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.migrate_radio_description"
              )}
            </span>
            <ha-button
              appearance="plain"
              slot="end"
              size="s"
              @click=${this._openOptionFlow}
            >
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.migrate_radio_action"
              )}
            </ha-button>
          </ha-list-item-base>
        </ha-list-base>
      </section>
    `;
  }

  private _renderMoreCard(deviceCount: number, entityCount: number) {
    const dynamicSections = this._configuration
      ? Object.keys(this._configuration.schemas).filter(
          (section) => section !== "zha_options"
        )
      : [];

    return html`
      <section class="card">
        <ha-list-nav
          .ariaLabel=${this.hass.localize(
            "ui.panel.config.zha.configuration_page.more_title"
          )}
        >
          <ha-list-item-button
            href=${`/config/devices/dashboard?historyBack=1&config_entry=${this._configEntry?.entry_id}&status=disabled`}
          >
            <ha-svg-icon slot="start" .path=${mdiDevices}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.device_count",
                { count: deviceCount }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button
            href=${`/config/entities?historyBack=1&config_entry=${this._configEntry?.entry_id}`}
          >
            <ha-svg-icon slot="start" .path=${mdiShape}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.entity_count",
                { count: entityCount }
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button href="/config/zha/options">
            <ha-svg-icon slot="start" .path=${mdiTune}></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.options_title"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.options_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          <ha-list-item-button href="/config/zha/network-info">
            <ha-svg-icon
              slot="start"
              .path=${mdiInformationOutline}
            ></ha-svg-icon>
            <div slot="headline">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.network_info_title"
              )}
            </div>
            <div slot="supporting-text">
              ${this.hass.localize(
                "ui.panel.config.zha.configuration_page.network_info_description"
              )}
            </div>
            <ha-icon-next slot="end"></ha-icon-next>
          </ha-list-item-button>
          ${dynamicSections.map(
            (section) => html`
              <ha-list-item-button href=${`/config/zha/section/${section}`}>
                <ha-svg-icon slot="start" .path=${mdiTune}></ha-svg-icon>
                <div slot="headline">
                  ${
                    this.hass.localize(
                      `component.zha.config_panel.${section}.title`
                    ) || section
                  }
                </div>
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>
            `
          )}
        </ha-list-nav>
      </section>
    `;
  }

  private _renderWeakLinkAlert(weakDevices: ZHADevice[]) {
    if (!weakDevices.length) {
      return nothing;
    }
    const weakest = [...weakDevices].sort(
      (a, b) => (a.lqi ?? 0) - (b.lqi ?? 0)
    )[0];
    return html`
      <ha-alert alert-type="warning">
        <ha-svg-icon slot="icon" .path=${mdiSignalCellular1}></ha-svg-icon>
        ${this.hass.localize(
          "ui.panel.config.zha.configuration_page.weak_link_alert",
          { name: this._deviceName(weakest), lqi: weakest.lqi }
        )}
      </ha-alert>
    `;
  }

  private _networkViewChanged(ev: CustomEvent<{ value: string }>) {
    this._networkView = ev.detail.value === "list" ? "list" : "map";
  }

  private async _fetchConfigEntry(): Promise<void> {
    const configEntries = await getConfigEntries(this.hass, {
      domain: "zha",
    });
    this._configEntry = configEntries.find(
      (entry) => entry.disabled_by === null && entry.source !== "ignore"
    );
  }

  private async _fetchConfiguration(): Promise<void> {
    this._configuration = await fetchZHAConfiguration(this.hass!);
  }

  private async _fetchNetworkSettings(): Promise<void> {
    try {
      this._networkSettings = await fetchZHANetworkSettings(this.hass!);
    } catch (_err) {
      // The channel and radio facts are simply left out when unavailable.
      this._networkSettings = undefined;
    }
  }

  private async _createAndDownloadBackup(
    ev: HASSDomCurrentTargetEvent<HaProgressButton>
  ): Promise<void> {
    // Captured up front: currentTarget is null once the first await resolves.
    const button = ev.currentTarget;
    let backup_and_metadata: ZHANetworkBackupAndMetadata;

    // Reading the backup from the coordinator can take 5-30 seconds.
    this._generatingBackup = true;

    try {
      backup_and_metadata = await createZHANetworkBackup(this.hass!);
    } catch (err: any) {
      button.actionError();
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.zha.configuration_page.backup_failed"
        ),
        text: err.message,
        warning: true,
      });
      return;
    } finally {
      this._generatingBackup = false;
    }

    const backupTime: Date = new Date(
      Date.parse(backup_and_metadata.backup.backup_time)
    );
    let basename = `ZHA backup ${backupTime.toISOString().replace(/:/g, "-")}`;

    if (!backup_and_metadata.is_complete) {
      basename = `Incomplete ${basename}`;
    }

    const blob = new Blob(
      [JSON.stringify(backup_and_metadata.backup, null, 4)],
      { type: "application/json" }
    );
    fileDownload(URL.createObjectURL(blob), `${basename}.json`);
    button.actionSuccess();

    if (!backup_and_metadata.is_complete) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.zha.configuration_page.backup_incomplete_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.zha.configuration_page.backup_incomplete_text"
        ),
      });
    }
  }

  private _openOptionFlow() {
    if (!this._configEntry) {
      return;
    }
    showOptionsFlowDialog(this, this._configEntry);
  }

  private async _fetchDevicesAndGroups(): Promise<void> {
    const [devicesResult, groupsResult] = await Promise.allSettled([
      fetchDevices(this.hass),
      fetchGroups(this.hass),
    ]);

    if (devicesResult.status === "fulfilled") {
      this._zhaDevices = devicesResult.value;
      this._offlineDevices = devicesResult.value.filter(
        (d) => !d.available
      ).length;
    } else {
      this._error = devicesResult.reason?.message || devicesResult.reason;
    }

    if (groupsResult.status === "fulfilled") {
      this._totalGroups = groupsResult.value.length;
    }

    this._asyncDataLoaded = true;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      animationStyles,
      css`
        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8)
            calc(var(--ha-space-8) + var(--safe-area-inset-bottom, 0px));
        }

        ha-alert {
          display: block;
          margin-bottom: var(--ha-space-4);
        }

        .loading {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-12);
        }

        .loading.small {
          padding: var(--ha-space-4);
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

        .hero.ok {
          --hero-tone: var(--success-color);
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
          grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
          align-items: start;
          gap: var(--ha-space-4);
        }

        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }

        .column ha-alert {
          margin-bottom: 0;
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

        .card-top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }

        h3 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }

        .hint {
          margin: var(--ha-space-3) 0;
          color: var(--secondary-text-color);
        }

        .legend {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
          gap: var(--ha-space-2);
          margin: 0 0 var(--ha-space-3);
          padding: 0;
          list-style: none;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }

        .legend li {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }

        .legend-count {
          color: var(--primary-text-color);
          font-weight: var(--ha-font-weight-medium);
        }

        .dot {
          flex: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--primary-color);
        }

        .dot.routers {
          background: var(--accent-color, var(--secondary-text-color));
        }

        .dot.end_devices {
          background: var(--success-color);
        }

        .dot.weak {
          background: var(--error-color);
        }

        .actions {
          display: flex;
          justify-content: flex-end;
        }

        .tile {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }

        .fade-in {
          animation: fade-in var(--ha-animation-duration-slow) ease-in;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "zha-config-dashboard": ZHAConfigDashboard;
  }
}
