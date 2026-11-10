import { mdiMemory, mdiPower, mdiUsb } from "@mdi/js";
import type { SeriesOption } from "echarts/types/dist/shared";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { navigate } from "../../../common/navigate";
import { round } from "../../../common/number/round";
import { blankBeforePercent } from "../../../common/translations/blank_before_percent";
import { sanitizeHttpUrl } from "../../../common/url/sanitize-http-url";
import "../../../components/animation/ha-fade-in";
import "../../../components/chart/ha-chart-base";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type { ConfigEntry } from "../../../data/config_entries";
import { subscribeConfigEntries } from "../../../data/config_entries";
import type {
  HardwareInfo,
  SystemStatusStreamMessage,
} from "../../../data/hardware";
import { BOARD_NAMES } from "../../../data/hardware";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import type { HassioHassOSInfo } from "../../../data/hassio/host";
import { fetchHassioHassOsInfo } from "../../../data/hassio/host";
import { scanUSBDevices } from "../../../data/usb";
import { showOptionsFlowDialog } from "../../../dialogs/config-flow/show-dialog-options-flow";
import { showRestartDialog } from "../../../dialogs/restart/show-dialog-restart";
import "../../../layouts/hass-tabs-subpage";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import type { ECOption } from "../../../resources/echarts/echarts";
import { haStyle } from "../../../resources/styles";
import { DefaultPrimaryColor } from "../../../resources/theme/color/color.globals";
import type { HomeAssistant, Route } from "../../../types";
import { hardwareBrandsUrl } from "../../../util/brands-url";
import { hardwareTabs } from "./ha-config-hardware";

const DATASAMPLES = 60;
// One sample arrives every five seconds.
const SAMPLE_SECONDS = 5;

const DATA_SET_CONFIG: SeriesOption = {
  type: "line",
  color: DefaultPrimaryColor,
  areaStyle: {
    color: DefaultPrimaryColor + "2B",
  },
  symbolSize: 0,
  lineStyle: {
    width: 2,
  },
  smooth: 0.25,
};

@customElement("ha-config-hardware-overview")
class HaConfigHardwareOverview extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _error?: string;

  @state() private _OSData?: HassioHassOSInfo;

  @state() private _hardwareInfo?: HardwareInfo;

  @state() private _chartOptions?: ECOption;

  @state() private _systemStatusData?: SystemStatusStreamMessage;

  @state() private _configEntries?: Record<string, ConfigEntry>;

  private _memoryEntries: [number, number | null][] = [];

  private _cpuEntries: [number, number | null][] = [];

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    const subs = [
      subscribeConfigEntries(
        this.hass,
        (messages) => {
          let fullUpdate = false;
          const newEntries: ConfigEntry[] = [];
          messages.forEach((message) => {
            if (message.type === null || message.type === "added") {
              newEntries.push(message.entry);
              if (message.type === null) {
                fullUpdate = true;
              }
            } else if (message.type === "removed") {
              if (this._configEntries) {
                delete this._configEntries[message.entry.entry_id];
              }
            } else if (message.type === "updated") {
              if (this._configEntries) {
                const newEntry = message.entry;
                this._configEntries[message.entry.entry_id] = newEntry;
              }
            }
          });
          if (!newEntries.length && !fullUpdate) {
            return;
          }
          const entries = [
            ...(fullUpdate ? [] : Object.values(this._configEntries || {})),
            ...newEntries,
          ];
          const configEntries: Record<string, ConfigEntry> = {};
          for (const entry of entries) {
            configEntries[entry.entry_id] = entry;
          }
          this._configEntries = configEntries;
        },
        { type: ["hardware"] }
      ),
    ];

    if (isComponentLoaded(this.hass.config, "hardware")) {
      subs.push(
        this.hass.connection.subscribeMessage<SystemStatusStreamMessage>(
          (message) => {
            // Only store the last 60 entries
            this._memoryEntries.shift();
            this._cpuEntries.shift();

            this._memoryEntries.push([
              new Date(message.timestamp).getTime(),
              message.memory_used_percent,
            ]);
            this._cpuEntries.push([
              new Date(message.timestamp).getTime(),
              message.cpu_percent,
            ]);

            this._systemStatusData = message;
          },
          {
            type: "hardware/subscribe_system_status",
          }
        )
      );
    }

    return subs;
  }

  protected willUpdate(): void {
    if (!this.hasUpdated && !this._chartOptions) {
      // A plain trend line: the figure above it carries the number.
      this._chartOptions = {
        xAxis: {
          type: "time",
          show: false,
        },
        yAxis: {
          type: "value",
          min: 0,
          max: 100,
          show: false,
          scale: true,
        },
        grid: {
          top: 6,
          bottom: 6,
          left: 0,
          right: 0,
        },
        tooltip: {
          trigger: "axis",
          valueFormatter: (value) =>
            value + blankBeforePercent(this.hass.locale) + "%",
        },
      };
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._load();

    const date = new Date();
    // Force graph to start drawing from the right
    for (let i = 0; i < DATASAMPLES; i++) {
      const t = new Date(date);
      t.setSeconds(t.getSeconds() - SAMPLE_SECONDS * (DATASAMPLES - i));
      this._memoryEntries.push([t.getTime(), null]);
      this._cpuEntries.push([t.getTime(), null]);
    }
  }

  protected render() {
    let boardId: string | undefined;
    let boardName: string | undefined;
    let imageURL: string | undefined;
    let documentationURL: string | undefined;
    let boardConfigEntries: ConfigEntry[] = [];

    const boardData = this._hardwareInfo?.hardware.find(
      (hw) => hw.board !== null
    );

    const dongles = this._hardwareInfo?.hardware.filter(
      (hw) =>
        hw.dongle !== null &&
        (!hw.config_entries?.length ||
          hw.config_entries.some(
            (entryId) =>
              this._configEntries?.[entryId] &&
              !this._configEntries[entryId].disabled_by
          ))
    );

    if (boardData) {
      boardConfigEntries = (boardData.config_entries ?? [])
        .map((id) => this._configEntries?.[id])
        .filter(
          (entry) => entry?.supports_options && !entry.disabled_by
        ) as ConfigEntry[];
      boardId = boardData.board!.hassio_board_id ?? undefined;
      boardName = boardData.name ?? undefined;
      documentationURL = sanitizeHttpUrl(boardData.url);
      imageURL = hardwareBrandsUrl(
        {
          category: "boards",
          manufacturer: boardData.board!.manufacturer,
          model: boardData.board!.model ?? undefined,
          darkOptimized: this.hass.themes?.darkMode,
        },
        this.hass.auth.data.hassUrl
      );
    } else if (this._OSData?.board) {
      boardId = this._OSData.board;
      boardName = BOARD_NAMES[this._OSData.board];
    }

    const isHassio = isComponentLoaded(this.hass.config, "hassio");
    const hasStatus = isComponentLoaded(this.hass.config, "hardware");
    const showHero = Boolean(boardName) || isHassio;
    const showConnected =
      Boolean(boardData) || Boolean(dongles?.length) || isHassio;

    return html`
      <hass-tabs-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        .tabs=${hardwareTabs(this.hass)}
      >
        ${
          isHassio
            ? html`
                <ha-icon-button
                  slot="toolbar-icon"
                  .path=${mdiPower}
                  .label=${this.hass.localize(
                    "ui.panel.config.hardware.restart_homeassistant"
                  )}
                  @click=${this._showRestartDialog}
                ></ha-icon-button>
              `
            : nothing
        }
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        <div class="page">
          ${
            showHero
              ? html`<section class="hero">
                  <span class="board-tile">
                    ${
                      imageURL
                        ? html`<img
                            alt=""
                            src=${imageURL}
                            crossorigin="anonymous"
                            referrerpolicy="no-referrer"
                          />`
                        : html`<ha-svg-icon .path=${mdiMemory}></ha-svg-icon>`
                    }
                  </span>
                  <div class="hero-text">
                    <h2>
                      ${
                        boardName ||
                        this.hass.localize(
                          "ui.panel.config.hardware.generic_hardware"
                        )
                      }
                    </h2>
                    <p>${this._heroFacts(boardId)}</p>
                  </div>
                  ${
                    isHassio
                      ? html`<ha-button
                          appearance="filled"
                          @click=${this._showRestartDialog}
                        >
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiPower}
                          ></ha-svg-icon>
                          ${this.hass.localize("ui.panel.config.hardware.restart")}
                        </ha-button>`
                      : nothing
                  }
                </section>`
              : nothing
          }
          ${
            hasStatus
              ? html`<div class="metrics">
                  ${this._renderMetric(
                    this.hass.localize("ui.panel.config.hardware.processor"),
                    this._systemStatusData
                      ? `${this._systemStatusData.cpu_percent}${blankBeforePercent(this.hass.locale)}%`
                      : "-",
                    this._cpuEntries,
                    this._peakText()
                  )}
                  ${this._renderMetric(
                    this.hass.localize("ui.panel.config.hardware.memory"),
                    this._systemStatusData
                      ? `${round(
                          this._systemStatusData.memory_used_percent ?? 0,
                          0
                        )}${blankBeforePercent(this.hass.locale)}%`
                      : "-",
                    this._memoryEntries,
                    this._memoryText()
                  )}
                </div>`
              : nothing
          }
          ${
            showConnected
              ? html`<section class="card">
                  <h3>
                    ${this.hass.localize(
                      "ui.panel.config.hardware.connected_hardware"
                    )}
                  </h3>
                  ${
                    dongles?.length
                      ? dongles.map((dongle) => {
                          const configEntry = (dongle.config_entries ?? [])
                            .map((id) => this._configEntries?.[id])
                            .filter(
                              (entry) =>
                                entry?.supports_options && !entry.disabled_by
                            )[0];
                          const detail = [
                            dongle.dongle?.manufacturer,
                            dongle.dongle?.description,
                          ]
                            .filter(Boolean)
                            .join(", ");
                          return html`<div class="row">
                            <span class="tile"
                              ><ha-svg-icon .path=${mdiUsb}></ha-svg-icon
                            ></span>
                            <div class="text">
                              <span class="title">${dongle.name}</span>
                              ${
                                detail
                                  ? html`<span class="sub">${detail}</span>`
                                  : nothing
                              }
                            </div>
                            ${
                              configEntry
                                ? html`<ha-button
                                    .entry=${configEntry}
                                    @click=${this._openOptionsFlow}
                                    appearance="filled"
                                  >
                                    ${this.hass.localize(
                                      "ui.panel.config.hardware.configure"
                                    )}
                                  </ha-button>`
                                : nothing
                            }
                          </div>`;
                        })
                      : html`<p class="empty">
                          ${this.hass.localize(
                            "ui.panel.config.hardware.no_connected_hardware"
                          )}
                        </p>`
                  }
                  <div class="links">
                    ${
                      isHassio
                        ? html`<ha-button
                            appearance="plain"
                            @click=${this._openAllHardware}
                          >
                            ${this.hass.localize(
                              "ui.panel.config.hardware.all_hardware"
                            )}
                          </ha-button>`
                        : nothing
                    }
                    ${
                      documentationURL
                        ? html`<ha-button
                            appearance="plain"
                            .href=${documentationURL}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            ${this.hass.localize(
                              "ui.panel.config.hardware.board_details"
                            )}
                          </ha-button>`
                        : nothing
                    }
                    ${
                      boardConfigEntries.length
                        ? html`<ha-button
                            appearance="plain"
                            .entry=${boardConfigEntries[0]}
                            @click=${this._openOptionsFlow}
                          >
                            ${this.hass.localize(
                              "ui.panel.config.hardware.configure"
                            )}
                          </ha-button>`
                        : nothing
                    }
                  </div>
                </section>`
              : nothing
          }
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _renderMetric(
    title: string,
    value: string,
    entries: [number, number | null][],
    footnote?: string
  ) {
    const live = Boolean(this._systemStatusData);
    return html`<section class="card metric">
      <div class="metric-head">
        <span class="title">${title}</span>
        ${
          live
            ? html`<span class="live"
                >${this.hass.localize("ui.panel.config.hardware.live")}</span
              >`
            : nothing
        }
      </div>
      <div class="value">${value}</div>
      <div class="loading-container">
        <ha-chart-base
          .height=${"90px"}
          .data=${this._getChartData(entries)}
          .options=${this._chartOptions}
        ></ha-chart-base>
        ${
          !live
            ? html`<ha-fade-in delay="1000" class="loading-overlay">
                <ha-spinner size="large"></ha-spinner>
              </ha-fade-in>`
            : nothing
        }
      </div>
      ${footnote ? html`<span class="sub">${footnote}</span>` : nothing}
    </section>`;
  }

  /** The highest processor reading still in the chart, if any reading came. */
  private _peakText(): string | undefined {
    const values = this._cpuEntries
      .map((entry) => entry[1])
      .filter((value): value is number => value !== null);
    if (!values.length) {
      return undefined;
    }
    return this.hass.localize("ui.panel.config.hardware.peak_recent", {
      minutes: Math.round((DATASAMPLES * SAMPLE_SECONDS) / 60),
      value: `${Math.max(...values)}${blankBeforePercent(this.hass.locale)}%`,
    });
  }

  private _memoryText(): string | undefined {
    const data = this._systemStatusData;
    if (!data) {
      return undefined;
    }
    return this.hass.localize("ui.panel.config.hardware.memory_of", {
      used: `${round(data.memory_used_mb / 1024, 1)} GB`,
      total: `${round((data.memory_used_mb + data.memory_free_mb) / 1024, 0)} GB`,
    });
  }

  /** What the instance reports about itself; anything it does not report is left out. */
  private _heroFacts(boardId?: string): string {
    const facts: string[] = [];
    if (this._systemStatusData) {
      facts.push(
        this.hass.localize("ui.panel.config.hardware.fact_memory", {
          memory: `${round(
            (this._systemStatusData.memory_used_mb +
              this._systemStatusData.memory_free_mb) /
              1024,
            0
          )} GB`,
        })
      );
    }
    if (this._OSData?.version) {
      facts.push(
        this.hass.localize("ui.panel.config.hardware.fact_os", {
          version: this._OSData.version,
        })
      );
    }
    if (!facts.length && boardId) {
      facts.push(boardId);
    }
    return facts.join(" ");
  }

  private async _load() {
    if (isComponentLoaded(this.hass.config, "usb")) {
      await scanUSBDevices(this.hass);
    }

    const isHassioLoaded = isComponentLoaded(this.hass.config, "hassio");
    try {
      if (isComponentLoaded(this.hass.config, "hardware")) {
        this._hardwareInfo = await this.hass.callWS({ type: "hardware/info" });
      }

      if (isHassioLoaded) {
        this._OSData = await fetchHassioHassOsInfo(this.hass);
      }
    } catch (err: any) {
      this._error = extractApiErrorMessage(err);
    }
  }

  private async _openOptionsFlow(ev) {
    const entry = ev.currentTarget.entry;
    if (!entry) {
      return;
    }
    showOptionsFlowDialog(this, entry);
  }

  private _openAllHardware() {
    navigate("/config/hardware/all");
  }

  private async _showRestartDialog() {
    showRestartDialog(this);
  }

  private _getChartData = memoizeOne(
    (entries: [number, number | null][]): SeriesOption[] => [
      {
        ...DATA_SET_CONFIG,
        id: entries === this._cpuEntries ? "cpu" : "memory",
        name:
          entries === this._cpuEntries
            ? this.hass.localize("ui.panel.config.hardware.processor")
            : this.hass.localize("ui.panel.config.hardware.memory"),
        data: entries,
      } as SeriesOption,
    ]
  );

  static styles = [
    haStyle,
    css`
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
        --ha-alert-icon-size: 24px;
      }
      .card,
      .hero {
        box-sizing: border-box;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
      }
      .card {
        padding: var(--ha-space-5) var(--ha-space-6);
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
        padding: var(--ha-space-4) var(--ha-space-6);
      }
      .board-tile {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 80px;
        height: 80px;
        overflow: hidden;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--secondary-background-color);
        color: var(--secondary-text-color);
        --mdc-icon-size: 36px;
      }
      .board-tile img {
        max-width: 100%;
        max-height: 100%;
        object-fit: contain;
      }
      .hero-text {
        flex: 1;
        min-width: 220px;
      }
      h2 {
        margin: 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-3xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      .hero p {
        margin: var(--ha-space-1) 0 0;
        color: var(--secondary-text-color);
        line-height: var(--ha-line-height-normal);
      }
      h3 {
        margin: 0 0 var(--ha-space-3);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
        gap: var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
      }
      .metric {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
      }
      .metric-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .title {
        font-weight: var(--ha-font-weight-medium);
      }
      .metric .value {
        font-size: var(--ha-font-size-3xl);
        line-height: var(--ha-line-height-condensed);
      }
      .live {
        display: inline-flex;
        align-items: center;
        gap: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .live::before {
        content: "";
        width: 8px;
        height: 8px;
        border-radius: var(--ha-border-radius-circle);
        background: var(--success-color);
      }
      .sub {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .loading-container {
        position: relative;
      }
      .loading-overlay {
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        padding: var(--ha-space-2) 0;
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
      .empty {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .links {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-hardware-overview": HaConfigHardwareOverview;
  }
}
