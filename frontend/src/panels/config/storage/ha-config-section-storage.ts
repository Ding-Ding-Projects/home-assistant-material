import {
  mdiBackupRestore,
  mdiChevronRight,
  mdiDatabase,
  mdiFolder,
  mdiHarddisk,
  mdiNas,
  mdiPlayBox,
  mdiPlus,
  mdiReload,
  mdiSwapHorizontal,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { navigate } from "../../../common/navigate";
import { blankBeforePercent } from "../../../common/translations/blank_before_percent";
import "../../../components/ha-alert";
import "../../../components/ha-bar";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import type { HassioHostInfo, HostDisksUsage } from "../../../data/hassio/host";
import {
  canMoveDatadisk,
  fetchHassioHostInfo,
  fetchHostDisksUsage,
} from "../../../data/hassio/host";
import type {
  SupervisorMount,
  SupervisorMounts,
} from "../../../data/supervisor/mounts";
import {
  SupervisorMountState,
  SupervisorMountType,
  SupervisorMountUsage,
  fetchSupervisorMounts,
  reloadSupervisorMount,
  supervisorMountDescription,
} from "../../../data/supervisor/mounts";
import type { RecorderInfo } from "../../../data/recorder";
import { getRecorderInfo } from "../../../data/recorder";
import { getStatisticIds } from "../../../data/recorder_statistic_ids";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { panelIsReady } from "../../../layouts/panel-ready";
import type { HomeAssistant, Route } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import { roundWithOneDecimal } from "../../../util/calculate";
import { showMoveDatadiskDialog } from "./show-dialog-move-datadisk";
import { showMountViewDialog } from "./show-dialog-view-mount";
import "./storage-breakdown-chart";

const GIB = 1024 * 1024 * 1024;

@customElement("ha-config-section-storage")
class HaConfigSectionStorage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _error?: { code: string; message: string };

  @state() private _hostInfo?: HassioHostInfo;

  @state() private _storageInfo?: HostDisksUsage | null;

  @state() private _mountsInfo?: SupervisorMounts | null;

  // Keyed by mount name. A missing key means the request is still in flight;
  // null means it failed, and that row simply shows no usage.
  @state() private _mountUsage: Record<string, HostDisksUsage | null> = {};

  // Guards against a slow response from a previous reload landing in a newer one.
  private _mountUsageGeneration = 0;

  // undefined while loading, null when the recorder cannot be read
  @state() private _recorderInfo?: RecorderInfo | null;

  @state() private _statisticsCount?: number;

  private async _loadRecorder(): Promise<void> {
    if (!isComponentLoaded(this.hass.config, "recorder")) {
      this._recorderInfo = null;
      return;
    }
    try {
      this._recorderInfo = await getRecorderInfo(this.hass.connection);
    } catch (_err) {
      this._recorderInfo = null;
      return;
    }
    try {
      this._statisticsCount = (await getStatisticIds(this.hass)).length;
    } catch (_err) {
      this._statisticsCount = undefined;
    }
  }

  protected async firstUpdated(
    changedProps: PropertyValues<this>
  ): Promise<void> {
    super.firstUpdated(changedProps);
    this._loadRecorder();
    if (isComponentLoaded(this.hass.config, "hassio")) {
      await this._load();
    } else {
      this._mountsInfo = null;
    }
    await panelIsReady(this);
  }

  protected render(): TemplateResult | typeof nothing {
    if (this._mountsInfo === undefined) {
      return nothing;
    }
    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.storage.caption")}
      >
        <div class="page">
          ${
            this._error
              ? html`<ha-alert alert-type="error"
                  >${this._error.message || this._error.code}</ha-alert
                >`
              : nothing
          }
          ${this._hostInfo ? this._renderHero(this._hostInfo) : nothing}
          <div class="cards">
            ${this._hostInfo ? this._renderDiskCard(this._hostInfo) : nothing}
            ${this._renderRecorderCard()} ${this._renderMountsCard()}
          </div>
        </div>
      </hass-subpage>
    `;
  }

  /** Used and total space, from the detailed report when it has arrived. */
  private _spaceFigures(hostInfo: HassioHostInfo) {
    if (this._storageInfo) {
      const total = this._storageInfo.total_bytes ?? hostInfo.disk_total * GIB;
      return { used: this._storageInfo.used_bytes / GIB, total: total / GIB };
    }
    const free = hostInfo.disk_free || hostInfo.disk_total - hostInfo.disk_used;
    return { used: hostInfo.disk_total - free, total: hostInfo.disk_total };
  }

  private _renderHero(hostInfo: HassioHostInfo): TemplateResult {
    const { used, total } = this._spaceFigures(hostInfo);
    return html`
      <section class="card hero">
        <span class="eyebrow"
          >${this.hass.localize("ui.panel.config.storage.this_machine")}</span
        >
        <h2>
          ${this.hass.localize("ui.panel.config.storage.figure", {
            used: `${roundWithOneDecimal(used)} GB`,
            total: `${roundWithOneDecimal(total)} GB`,
          })}
        </h2>
        <storage-breakdown-chart
          hide-header
          .hass=${this.hass}
          .hostInfo=${hostInfo}
          .storageInfo=${this._storageInfo}
        ></storage-breakdown-chart>
      </section>
    `;
  }

  private _renderDiskCard(hostInfo: HassioHostInfo): TemplateResult {
    return html`
      <section class="card">
        <h3>${this.hass.localize("ui.panel.config.storage.the_disk")}</h3>
        ${this._renderDiskLifeTime(hostInfo.disk_life_time)}
        ${
          canMoveDatadisk(hostInfo)
            ? html`<div class="row">
                <span class="tile"
                  ><ha-svg-icon .path=${mdiSwapHorizontal}></ha-svg-icon
                ></span>
                <div class="text">
                  <span class="title"
                    >${this.hass.localize("ui.panel.config.storage.move_data")}</span
                  >
                  <span class="sub"
                    >${this.hass.localize(
                      "ui.panel.config.storage.move_data_description"
                    )}</span
                  >
                </div>
                <ha-button appearance="filled" @click=${this._moveDatadisk}>
                  ${this.hass.localize("ui.panel.config.storage.move_action")}
                </ha-button>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  /** Only what the recorder itself reports: no sizes or row counts exist. */
  private _renderRecorderCard(): TemplateResult | typeof nothing {
    const info = this._recorderInfo;
    if (info === undefined) {
      return nothing;
    }
    const t = (key: string, values?: Record<string, string | number>) =>
      this.hass.localize(
        `ui.panel.config.storage.recorder.${key}` as any,
        values
      );
    if (info === null) {
      return isComponentLoaded(this.hass.config, "recorder")
        ? html`<section class="card">
            <h3>${t("title")}</h3>
            <ha-alert alert-type="warning">${t("unavailable")}</ha-alert>
          </section>`
        : nothing;
    }
    const row = (title: string, sub: string) =>
      html`<div class="row">
        <span class="tile"
          ><ha-svg-icon .path=${mdiDatabase}></ha-svg-icon
        ></span>
        <div class="text">
          <span class="title">${title}</span>
          <span class="sub">${sub}</span>
        </div>
      </div>`;
    return html`<section class="card">
      <h3>${t("title")}</h3>
      ${row(
        info.recording ? t("recording") : t("not_recording"),
        info.migration_in_progress
          ? t("migrating")
          : t("pending", { backlog: info.backlog, max: info.max_backlog })
      )}
      ${row(
        t("location"),
        info.db_in_default_location
          ? t("location_default")
          : t("location_custom")
      )}
      ${
        this._statisticsCount !== undefined
          ? row(
              t("statistics"),
              t("statistics_count", { count: this._statisticsCount })
            )
          : nothing
      }
    </section>`;
  }

  private _renderMountsCard(): TemplateResult {
    const isHAOS = this._hostInfo?.features.includes("haos");
    const validMounts = this._mountsInfo?.mounts.filter((mount) =>
      [
        SupervisorMountType.CIFS,
        SupervisorMountType.DISK,
        SupervisorMountType.NFS,
      ].includes(mount.type)
    );
    return html`
      <section class="card">
        <h3>
          ${this.hass.localize("ui.panel.config.storage.network_mounts.title")}
        </h3>
        ${
          this._mountsInfo === null
            ? html`<ha-alert
                alert-type="warning"
                .title=${this.hass.localize(
                  "ui.panel.config.storage.network_mounts.not_supported.title"
                )}
              >
                ${
                  isHAOS
                    ? html`${this.hass.localize(
                          "ui.panel.config.storage.network_mounts.not_supported.os",
                          { version: "10.2" }
                        )}
                        <ha-button
                          appearance="plain"
                          slot="action"
                          @click=${this._navigateToUpdates}
                        >
                          ${this.hass.localize(
                            "ui.panel.config.storage.network_mounts.not_supported.navigate_to_updates"
                          )}
                        </ha-button>`
                    : this.hass.localize(
                        "ui.panel.config.storage.network_mounts.not_supported.supervised"
                      )
                }
              </ha-alert>`
            : validMounts?.length
              ? validMounts.map((mount) => this._renderMount(mount))
              : html`<div class="empty">
                  <ha-svg-icon .path=${mdiNas}></ha-svg-icon>
                  <p>
                    ${this.hass.localize(
                      "ui.panel.config.storage.network_mounts.no_mounts"
                    )}
                  </p>
                </div>`
        }
        ${
          this._mountsInfo !== null
            ? html`<div class="actions">
                <ha-button appearance="plain" @click=${this._addMount}>
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  ${this.hass.localize(
                    "ui.panel.config.storage.network_mounts.add_title"
                  )}
                </ha-button>
              </div>`
            : nothing
        }
      </section>
    `;
  }

  private _renderMount(mount: SupervisorMount): TemplateResult {
    return html`
      <div
        class="row clickable"
        role="button"
        tabindex="0"
        .mount=${mount}
        @click=${this._changeMount}
        @keydown=${this._mountKeydown}
      >
        <span class="tile">
          <ha-svg-icon
            .path=${
              mount.usage === SupervisorMountUsage.MEDIA
                ? mdiPlayBox
                : mount.usage === SupervisorMountUsage.SHARE
                  ? mdiFolder
                  : mdiBackupRestore
            }
          ></ha-svg-icon>
        </span>
        <div class="text">
          <span class="title mount-state-${mount.state || "unknown"}">
            ${mount.name}
          </span>
          <span class="sub mount-address">
            ${supervisorMountDescription(mount)}
          </span>
          ${this._renderMountUsage(mount)}
        </div>
        ${
          mount.state !== SupervisorMountState.ACTIVE
            ? html`<ha-icon-button
                .mount=${mount}
                @click=${this._reloadMount}
                .path=${mdiReload}
                .label=${this.hass.localize("ui.common.refresh")}
              ></ha-icon-button>`
            : html`<ha-svg-icon
                class="chevron"
                .path=${mdiChevronRight}
              ></ha-svg-icon>`
        }
      </div>
    `;
  }

  private _renderDiskLifeTime(diskLifeTime: number | null) {
    return html`<div class="row">
      <span class="tile"><ha-svg-icon .path=${mdiHarddisk}></ha-svg-icon></span>
      <div class="text">
        <span class="title"
          >${this.hass.localize("ui.panel.config.storage.drive_wear")}</span
        >
        ${
          diskLifeTime === null
            ? nothing
            : html`<span class="sub"
                >${this.hass.localize(
                  "ui.panel.config.storage.drive_wear_description",
                  {
                    lifetime: `${diskLifeTime}${blankBeforePercent(this.hass.locale)}%`,
                  }
                )}</span
              >`
        }
        ${
          diskLifeTime === null
            ? nothing
            : html`<ha-bar .value=${diskLifeTime}></ha-bar>`
        }
      </div>
    </div>`;
  }

  private _renderMountUsage(mount: SupervisorMount) {
    if (mount.state !== SupervisorMountState.ACTIVE) {
      return nothing;
    }
    if (!(mount.name in this._mountUsage)) {
      return html`<div class="mount-usage">
        <ha-spinner size="tiny"></ha-spinner>
      </div>`;
    }
    const usage = this._mountUsage[mount.name];
    // Without a total there is no ratio to show, so show nothing rather than a
    // bar that means something else.
    if (!usage?.total_bytes) {
      return nothing;
    }
    const percent = (usage.used_bytes / usage.total_bytes) * 100;
    return html`<div class="mount-usage">
      <ha-bar
        class=${classMap({
          "target-warning": percent > 85,
          "target-critical": percent > 95,
        })}
        style=${styleMap({ flex: "0 0 72px" })}
        .value=${percent}
      ></ha-bar>
      <span>
        ${this.hass.localize("ui.panel.config.storage.detailed_description", {
          used: bytesToString(usage.used_bytes),
          total: bytesToString(usage.total_bytes),
        })}
      </span>
    </div>`;
  }

  private async _load() {
    this._loadStorageInfo();
    try {
      this._hostInfo = await fetchHassioHostInfo(this.hass);
    } catch (err: any) {
      this._error = err.message || err;
    }
    if (this._hostInfo?.features.includes("mount")) {
      await this._reloadMounts();
    } else {
      this._mountsInfo = null;
    }
  }

  private async _loadStorageInfo() {
    try {
      this._storageInfo = await fetchHostDisksUsage(this.hass, "default", 3);
    } catch (err: any) {
      this._error = err.message || err;
      this._storageInfo = null;
    }
  }

  private _moveDatadisk(): void {
    showMoveDatadiskDialog(this, {
      hostInfo: this._hostInfo!,
    });
  }

  private async _navigateToUpdates(): Promise<void> {
    navigate("/config/updates");
  }

  private async _reloadMount(ev: Event): Promise<void> {
    ev.stopPropagation();
    const mount: SupervisorMount = (ev.currentTarget as any).mount;
    try {
      await reloadSupervisorMount(this.hass, mount);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.storage.network_mounts.errors.reload",
          { mount: mount.name }
        ),
        text: extractApiErrorMessage(err),
      });
      return;
    }
    await this._reloadMounts();
  }

  private _addMount(): void {
    showMountViewDialog(this, {
      reloadMounts: () => this._reloadMounts(),
    });
  }

  private _changeMount(ev: Event): void {
    ev.stopPropagation();
    showMountViewDialog(this, {
      mount: (ev.currentTarget as any).mount,
      reloadMounts: () => this._reloadMounts(),
    });
  }

  private _mountKeydown(ev: KeyboardEvent): void {
    if (ev.target === ev.currentTarget && ev.key === "Enter") {
      this._changeMount(ev);
    }
  }

  private async _reloadMounts(): Promise<void> {
    try {
      this._mountsInfo = await fetchSupervisorMounts(this.hass.callWS);
    } catch (err: any) {
      this._error = err.message || err;
      this._mountsInfo = null;
    }
    this._loadMountUsage();
  }

  // Deliberately not awaited: a mount on a slow or unreachable server can take
  // ~30 s to answer, and the rows must paint before then. Only active mounts are
  // asked, since the endpoint has nothing to report for the others.
  private _loadMountUsage(): void {
    const generation = ++this._mountUsageGeneration;
    this._mountUsage = {};
    this._mountsInfo?.mounts
      .filter((mount) => mount.state === SupervisorMountState.ACTIVE)
      .forEach((mount) => {
        fetchHostDisksUsage(this.hass, mount.name).then(
          (usage) => this._setMountUsage(generation, mount.name, usage),
          () => this._setMountUsage(generation, mount.name, null)
        );
      });
  }

  private _setMountUsage(
    generation: number,
    name: string,
    usage: HostDisksUsage | null
  ): void {
    if (generation !== this._mountUsageGeneration) {
      return;
    }
    this._mountUsage = { ...this._mountUsage, [name]: usage };
  }

  static styles = css`
    .page {
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
    }
    :host([narrow]) .page {
      padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
    }
    ha-alert {
      display: block;
      margin-bottom: var(--ha-space-4);
      --ha-alert-icon-size: 24px;
    }
    .card {
      box-sizing: border-box;
      padding: var(--ha-space-5) var(--ha-space-6);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
    }
    .hero {
      margin-bottom: var(--ha-space-4);
    }
    .eyebrow {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    h2 {
      margin: var(--ha-space-1) 0 var(--ha-space-4);
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    h3 {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      align-items: start;
      gap: var(--ha-space-4);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      padding: var(--ha-space-2) 0;
      border-radius: var(--ha-border-radius-xl);
    }
    .row.clickable {
      cursor: pointer;
    }
    .row.clickable:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
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
    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    .sub {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .chevron {
      flex: none;
      color: var(--secondary-text-color);
    }
    .actions {
      display: flex;
      justify-content: flex-end;
      margin-top: var(--ha-space-2);
    }
    .mount-state-failed {
      color: var(--error-color);
    }
    .mount-state-inactive,
    .mount-state-unknown {
      color: var(--warning-color);
    }
    .mount-address {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mount-usage {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .mount-usage ha-bar,
    .text > ha-bar {
      display: flex;
      align-self: center;
      --ha-bar-primary-color: var(--metric-bar-ok-color, var(--success-color));
    }
    .text > ha-bar {
      width: 100%;
      --ha-bar-primary-color: var(--primary-color);
    }
    .mount-usage ha-bar.target-warning {
      --ha-bar-primary-color: var(
        --metric-bar-warning-color,
        var(--warning-color)
      );
    }
    .mount-usage ha-bar.target-critical {
      --ha-bar-primary-color: var(
        --metric-bar-critical-color,
        var(--error-color)
      );
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      color: var(--secondary-text-color);
    }
    .empty ha-svg-icon {
      background-color: var(--secondary-background-color);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-circle);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-storage": HaConfigSectionStorage;
  }
}
