import {
  mdiCheckCircleOutline,
  mdiFilterVariantRemove,
  mdiHeartPulse,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { playPageEntry } from "../../../common/motion/page-entry";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-button";
import "../../../components/ha-empty-state";
import "../../../components/ha-svg-icon";
import { fetchStatistics } from "../../../data/recorder";
import "../../../layouts/hass-subpage";
import { ChildPanelReady } from "../../../layouts/panel-ready";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import type {
  DailyPoint,
  DeviceHealth,
  HealthCounts,
  HealthFilter,
} from "./device-health";
import {
  classifyDevices,
  countHealth,
  estimateDaysLeft,
  filterDevices,
  HEALTH_FILTERS,
  toggleFilter,
} from "./device-health";

const DAY_MS = 24 * 60 * 60 * 1000;
const STATISTICS_DAYS = 14;

@customElement("ha-config-device-health")
class HaConfigDeviceHealth extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _filter?: HealthFilter;

  /** Days of battery left, by entity id, from already recorded statistics. */
  @state() private _daysLeft: Record<string, number> = {};

  @queryAll(".hero, .tile, .row") private _blocks!: NodeListOf<Element>;

  private _requested = new Set<string>();

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  private _classify = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"],
      areas: HomeAssistant["areas"],
      fallbackName: string
    ): DeviceHealth[] =>
      classifyDevices({
        devices,
        entities,
        states,
        areas,
        now: Date.now(),
        fallbackName,
      })
  );

  private get _items(): DeviceHealth[] {
    return this._classify(
      this.hass.devices,
      this.hass.entities,
      this.hass.states,
      this.hass.areas,
      this.hass.localize("ui.panel.config.device_health.unnamed")
    );
  }

  protected render(): TemplateResult {
    const items = this._items;
    const counts = countHealth(items);
    const shown = filterDevices(items, this._filter);
    const title = this.hass.localize("ui.panel.config.device_health.caption");

    return html`
      <hass-subpage
        .hass=${this.hass}
        back-path="/config/system"
        .header=${title}
        .narrow=${this.narrow}
      >
        <div class="page">
          ${this._renderHero(counts)} ${this._renderTiles(counts)}
          ${this._renderList(items, shown, counts)}
        </div>
      </hass-subpage>
    `;
  }

  private _renderHero(counts: HealthCounts): TemplateResult {
    const attention = counts.attention > 0;
    return html`
      <section class="hero ${classMap({ ok: !attention })}">
        <ha-svg-icon .path=${mdiHeartPulse}></ha-svg-icon>
        <div class="hero-text">
          <h2>
            ${
              attention
                ? this.hass.localize(
                    "ui.panel.config.device_health.hero_attention",
                    { count: counts.attention }
                  )
                : this.hass.localize("ui.panel.config.device_health.hero_ok")
            }
          </h2>
          <p>
            ${this.hass.localize(
              attention
                ? "ui.panel.config.device_health.hero_sentence_attention"
                : "ui.panel.config.device_health.hero_sentence_ok"
            )}
          </p>
        </div>
      </section>
    `;
  }

  private _renderTiles(counts: HealthCounts): TemplateResult {
    return html`
      <div
        class="tiles"
        role="group"
        aria-label=${this.hass.localize(
          "ui.panel.config.device_health.tiles_label"
        )}
      >
        ${HEALTH_FILTERS.map(
          (filter) => html`
            <button
              type="button"
              class="tile tile-${filter}"
              aria-pressed=${this._filter === filter ? "true" : "false"}
              data-filter=${filter}
              @click=${this._pressTile}
            >
              <span class="numeral">${counts[filter]}</span>
              <span class="tile-label"
                >${this.hass.localize(
                  `ui.panel.config.device_health.tile_${filter}`
                )}</span
              >
            </button>
          `
        )}
      </div>
    `;
  }

  private _renderList(
    items: DeviceHealth[],
    shown: DeviceHealth[],
    counts: HealthCounts
  ): TemplateResult {
    if (items.length === 0) {
      return html`<ha-empty-state
        tone="start"
        .heading=${this.hass.localize(
          "ui.panel.config.device_health.no_devices"
        )}
      >
        <ha-svg-icon slot="icon" .path=${mdiHeartPulse}></ha-svg-icon>
      </ha-empty-state>`;
    }
    if (!this._filter && counts.attention === 0) {
      return html`
        <ha-empty-state
          tone="start"
          .heading=${this.hass.localize(
            "ui.panel.config.device_health.empty_heading"
          )}
          .description=${this.hass.localize(
            "ui.panel.config.device_health.empty_description"
          )}
        >
          <ha-svg-icon slot="icon" .path=${mdiCheckCircleOutline}></ha-svg-icon>
        </ha-empty-state>
        ${this._renderRows(shown)}
      `;
    }
    if (shown.length === 0) {
      return html`<ha-empty-state
        tone="filtered"
        .heading=${this.hass.localize(
          "ui.panel.config.device_health.filtered_empty"
        )}
      >
        <ha-svg-icon slot="icon" .path=${mdiFilterVariantRemove}></ha-svg-icon>
      </ha-empty-state>`;
    }
    return this._renderRows(shown);
  }

  private _renderRows(shown: DeviceHealth[]): TemplateResult {
    return html`
      <ul
        class="rows"
        aria-label=${this.hass.localize(
          "ui.panel.config.device_health.list_label"
        )}
      >
        ${shown.map((item) => this._renderRow(item))}
      </ul>
    `;
  }

  private _renderRow(item: DeviceHealth): TemplateResult {
    const tone = item.silent
      ? "silent"
      : item.lowBattery
        ? "battery"
        : item.weakSignal
          ? "signal"
          : item.healthy
            ? "healthy"
            : "unknown";
    const days =
      item.batteryEntityId !== undefined
        ? this._daysLeft[item.batteryEntityId]
        : undefined;
    const name = item.name;
    return html`
      <li class="row row-${tone}">
        <div class="row-main">
          <span class="row-name">${name}</span>
          <span class="row-area"
            >${
              item.area ??
              this.hass.localize("ui.panel.config.device_health.no_area")
            }</span
          >
          <span class="row-fact">${this._fact(item)}</span>
          ${
            item.lowBattery && days !== undefined
              ? html`<span class="row-days"
                  >${this.hass.localize(
                    "ui.panel.config.device_health.days_left",
                    { count: days }
                  )}</span
                >`
              : nothing
          }
        </div>
        ${
          item.batteryLevel !== undefined && item.lowBattery
            ? html`<div
                class="bar"
                role="img"
                aria-label=${this.hass.localize(
                  "ui.panel.config.device_health.battery_bar_label"
                )}
              >
                <div
                  class="bar-fill"
                  style=${styleMap({
                    width: `${Math.max(2, Math.min(100, item.batteryLevel))}%`,
                  })}
                ></div>
              </div>`
            : nothing
        }
        <ha-button
          appearance="plain"
          aria-label=${this.hass.localize(
            "ui.panel.config.device_health.open_device_named",
            { name }
          )}
          data-device-id=${item.deviceId}
          @click=${this._openDevice}
        >
          ${this.hass.localize("ui.panel.config.device_health.open_device")}
        </ha-button>
      </li>
    `;
  }

  /** The one-sentence fact for the worst thing about a device. */
  private _fact(item: DeviceHealth): string {
    const localize = this.hass.localize;
    if (item.silent) {
      return item.silentSince
        ? localize("ui.panel.config.device_health.fact_silent", {
            time: this._formatSince(item.silentSince),
          })
        : localize("ui.panel.config.device_health.fact_silent_unknown");
    }
    if (item.lowBattery) {
      return item.batteryLevel !== undefined
        ? localize("ui.panel.config.device_health.fact_battery", {
            level: Math.round(item.batteryLevel),
          })
        : localize("ui.panel.config.device_health.fact_battery_flag");
    }
    if (item.weakSignal && item.signalValue !== undefined) {
      return localize(
        `ui.panel.config.device_health.fact_signal_${item.signalKind ?? "percent"}`,
        { value: Math.round(item.signalValue) }
      );
    }
    if (item.healthy) {
      return localize("ui.panel.config.device_health.fact_healthy");
    }
    return localize("ui.panel.config.device_health.fact_no_health");
  }

  /** 24-hour time, with the date when it was not today. */
  private _formatSince(timestamp: number): string {
    const date = new Date(timestamp);
    const timeZone = this.hass.config.time_zone;
    const language = this.hass.locale?.language;
    const time = new Intl.DateTimeFormat(language, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(date);
    const day = (value: Date) =>
      new Intl.DateTimeFormat("en-CA", { timeZone }).format(value);
    if (day(date) === day(new Date())) {
      return time;
    }
    const dayText = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      timeZone,
    }).format(date);
    return `${dayText}, ${time}`;
  }

  private _pressTile(ev: Event): void {
    const filter = (ev.currentTarget as HTMLElement).dataset
      .filter as HealthFilter;
    this._filter = toggleFilter(this._filter, filter);
  }

  private _openDevice(ev: Event): void {
    const deviceId = (ev.currentTarget as HTMLElement).dataset.deviceId;
    if (deviceId) {
      navigate(`/config/devices/device/${deviceId}`);
    }
  }

  protected firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    playPageEntry([...this._blocks]);
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has("hass")) {
      this._loadBatteryLife();
    }
  }

  /**
   * Asks the recorder for the daily battery averages of the devices that are
   * low, once per sensor. A sensor without recorded statistics gets no
   * estimate; nothing is invented.
   */
  private async _loadBatteryLife(): Promise<void> {
    if (!isComponentLoaded(this.hass.config, "recorder")) {
      return;
    }
    const ids = this._items
      .filter(
        (item) =>
          item.lowBattery &&
          item.batteryEntityId &&
          item.batteryLevel !== undefined &&
          !this._requested.has(item.batteryEntityId)
      )
      .map((item) => item.batteryEntityId!);
    if (ids.length === 0) {
      return;
    }
    ids.forEach((id) => this._requested.add(id));
    const now = Date.now();
    try {
      const statistics = await fetchStatistics(
        this.hass.callWS,
        new Date(now - STATISTICS_DAYS * DAY_MS),
        new Date(now),
        ids,
        "day",
        undefined,
        ["mean"]
      );
      const next = { ...this._daysLeft };
      for (const item of this._items) {
        const id = item.batteryEntityId;
        const points = id ? statistics[id] : undefined;
        if (!id || !points || item.batteryLevel === undefined) {
          continue;
        }
        const days = estimateDaysLeft(
          points as DailyPoint[],
          item.batteryLevel
        );
        if (days !== undefined) {
          next[id] = days;
        }
      }
      this._daysLeft = next;
    } catch (_err) {
      // No recorded statistics: the estimate is simply left out.
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .page {
          box-sizing: border-box;
          max-width: 900px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .hero {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-4);
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(
            --md-sys-color-tertiary-container,
            var(--ha-color-fill-warning-quiet-resting)
          );
          color: var(--md-sys-color-on-tertiary-container, inherit);
          --mdc-icon-size: 32px;
        }
        .hero.ok {
          background: var(
            --md-sys-color-secondary-container,
            var(--ha-color-fill-primary-quiet-resting)
          );
          color: var(--md-sys-color-on-secondary-container, inherit);
        }
        .hero-text {
          flex: 1;
          min-width: 200px;
        }
        h2 {
          margin: 0;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          font-size: var(--ha-font-size-3xl);
          font-weight: 800;
          font-stretch: 116%;
          letter-spacing: -0.02em;
          line-height: var(--ha-line-height-condensed);
          overflow-wrap: anywhere;
        }
        :host([narrow]) h2 {
          font-size: var(--ha-font-size-2xl);
        }
        .hero p {
          margin: var(--ha-space-1) 0 0;
          line-height: var(--ha-line-height-normal);
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-4);
        }
        @media (max-width: 600px) {
          .tiles {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .tile {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-1);
          min-height: 48px;
          padding: var(--ha-space-3) var(--ha-space-4);
          border: 2px solid transparent;
          border-radius: var(--ha-border-radius-2xl);
          background: var(
            --md-sys-color-surface-container,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
          font: inherit;
          text-align: start;
          cursor: pointer;
          transition:
            transform 200ms cubic-bezier(0.2, 1.5, 0.3, 1),
            border-color 150ms ease;
        }
        .tile:hover {
          transform: translateY(-2px);
        }
        .tile:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }
        .tile[aria-pressed="true"] {
          border-color: var(--md-sys-color-primary, var(--primary-color));
        }
        .numeral {
          font-size: var(--ha-font-size-3xl);
          font-weight: 800;
          font-stretch: 116%;
          line-height: 1;
        }
        .tile-label {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
          overflow-wrap: anywhere;
        }
        .rows {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3) var(--ha-space-4);
          min-height: calc(var(--ha-list-row-min, 52px) + 8px);
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-list-row-radius, 16px);
          background: var(
            --md-sys-color-surface-container,
            var(--card-background-color)
          );
          border-inline-start: 6px solid transparent;
        }
        .row-silent {
          border-inline-start-color: var(--error-color);
        }
        .row-battery,
        .row-signal {
          border-inline-start-color: var(--warning-color);
        }
        .row-healthy {
          border-inline-start-color: var(--success-color);
        }
        .row-main {
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 180px;
        }
        .row-name {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .row-area,
        .row-days {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .row-fact {
          margin-top: var(--ha-space-1);
          overflow-wrap: anywhere;
        }
        .bar {
          flex: 0 1 160px;
          min-width: 80px;
          height: 8px;
          border-radius: 4px;
          background: var(--divider-color);
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          border-radius: 4px;
          background: var(--warning-color);
        }
        /* Phone: a compact hero, two small tiles across and tighter rows. */
        :host([narrow]) .hero {
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: 24px;
          --mdc-icon-size: 28px;
        }
        :host([narrow]) .hero-text {
          min-width: 0;
        }
        :host([narrow]) h2 {
          font-size: 20px;
          font-weight: 700;
          font-stretch: 100%;
        }
        :host([narrow]) .hero p {
          font-size: 14px;
        }
        :host([narrow]) .tiles {
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-3);
        }
        :host([narrow]) .tile {
          padding: var(--ha-space-3);
          border-radius: 20px;
        }
        :host([narrow]) .numeral {
          font-size: 28px;
          font-stretch: 100%;
        }
        :host([narrow]) .tile-label {
          font-size: 14px;
        }
        :host([narrow]) .rows {
          gap: var(--ha-space-2);
        }
        :host([narrow]) .row {
          min-height: var(--ha-list-row-min, 52px);
          padding: var(--ha-space-2) var(--ha-space-3);
          gap: var(--ha-space-2) var(--ha-space-3);
        }
        :host([narrow]) .row-main {
          min-width: 0;
        }
        @media (prefers-reduced-motion: reduce) {
          .tile {
            transition: none;
          }
          .tile:hover {
            transform: none;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-device-health": HaConfigDeviceHealth;
  }
}
