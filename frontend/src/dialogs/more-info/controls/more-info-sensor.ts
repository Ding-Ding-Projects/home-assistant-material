import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/ha-relative-time";
import { fetchDateWS } from "../../../data/history";
import type { HomeAssistant } from "../../../types";

type SensorRange = "24h" | "7d" | "30d";

const RANGE_HOURS: Record<SensorRange, number> = {
  "24h": 24,
  "7d": 24 * 7,
  "30d": 24 * 30,
};

const RANGES: SensorRange[] = ["24h", "7d", "30d"];

const CHART_WIDTH = 300;
const CHART_HEIGHT = 80;

interface SensorSummary {
  values: { time: number; value: number }[];
  lowest: number;
  highest: number;
  average: number;
}

@customElement("more-info-sensor")
class MoreInfoSensor extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @state() private _range: SensorRange = "24h";

  @state() private _summary?: SensorSummary;

  @state() private _loading = false;

  private _loadedKey?: string;

  protected willUpdate(changedProps: PropertyValues): void {
    super.willUpdate(changedProps);
    if (
      this.hass &&
      this.stateObj &&
      (changedProps.has("_range") || changedProps.has("stateObj"))
    ) {
      const key = `${this.stateObj.entity_id}-${this._range}`;
      if (key !== this._loadedKey) {
        this._loadedKey = key;
        this._loadSummary(this.stateObj.entity_id, this._range);
      }
    }
  }

  private async _loadSummary(entityId: string, range: SensorRange) {
    if (!this.hass) {
      return;
    }
    this._loading = true;
    this._summary = undefined;
    const end = new Date();
    const start = new Date(end.getTime() - RANGE_HOURS[range] * 3600 * 1000);
    try {
      const result = await fetchDateWS(this.hass, start, end, [entityId]);
      if (this._loadedKey !== `${entityId}-${range}`) {
        return;
      }
      const values = (result[entityId] ?? [])
        .map((item) => ({
          time: (item.lu ?? 0) * 1000,
          value: Number(item.s),
        }))
        .filter((item) => item.time > 0 && Number.isFinite(item.value));
      if (!values.length) {
        this._summary = undefined;
      } else {
        let lowest = values[0].value;
        let highest = values[0].value;
        let sum = 0;
        for (const item of values) {
          lowest = Math.min(lowest, item.value);
          highest = Math.max(highest, item.value);
          sum += item.value;
        }
        this._summary = {
          values,
          lowest,
          highest,
          average: sum / values.length,
        };
      }
    } catch (_err) {
      this._summary = undefined;
    } finally {
      if (this._loadedKey === `${entityId}-${range}`) {
        this._loading = false;
      }
    }
  }

  protected render() {
    if (!this.hass || !this.stateObj) {
      return nothing;
    }
    const stateObj = this.stateObj;
    const localize = this.hass.localize;
    const unit = stateObj.attributes.unit_of_measurement as string | undefined;
    const numeric = Number.isFinite(Number(stateObj.state));

    return html`
      <div class="hero">
        <div class="value">${this.hass.formatEntityState(stateObj)}</div>
        <div class="changed">
          ${localize("ui.dialogs.more_info_control.sensor.changed")}
          <ha-relative-time
            .datetime=${stateObj.last_changed}
          ></ha-relative-time>
        </div>
      </div>
      ${
        numeric
          ? html`
              <div class="chart-card">
                <div class="chart-title">
                  ${localize(
                    `ui.dialogs.more_info_control.sensor.last_${this._range}`
                  )}
                </div>
                ${this._renderChart()}
              </div>
              <div class="stats">
                ${this._renderStat("lowest", this._summary?.lowest, unit)}
                ${this._renderStat("average", this._summary?.average, unit)}
                ${this._renderStat("highest", this._summary?.highest, unit)}
              </div>
              <div class="ranges" role="group">
                ${RANGES.map(
                  (range) => html`
                    <button
                      type="button"
                      class=${classMap({ chip: true, selected: range === this._range })}
                      aria-pressed=${range === this._range}
                      .range=${range}
                      @click=${this._handleRange}
                    >
                      ${localize(
                        `ui.dialogs.more_info_control.sensor.range_${range}`
                      )}
                    </button>
                  `
                )}
              </div>
            `
          : nothing
      }
      ${this._renderDetails()}
    `;
  }

  private _renderStat(
    key: "lowest" | "average" | "highest",
    value: number | undefined,
    unit: string | undefined
  ) {
    return html`
      <div class="stat">
        <div class="stat-label">
          ${this.hass!.localize(`ui.dialogs.more_info_control.sensor.${key}`)}
        </div>
        <div class="stat-value">
          ${
            value === undefined
              ? "—"
              : html`${formatNumber(value, this.hass!.locale, {
                  maximumFractionDigits: 1,
                })}${unit ? html`&nbsp;${unit}` : nothing}`
          }
        </div>
      </div>
    `;
  }

  private _renderChart() {
    if (this._loading) {
      return html`<div class="chart-empty">
        ${this.hass!.localize("ui.dialogs.more_info_control.sensor.loading")}
      </div>`;
    }
    const summary = this._summary;
    if (!summary || summary.values.length < 2) {
      return html`<div class="chart-empty">
        ${this.hass!.localize("ui.dialogs.more_info_control.sensor.no_history")}
      </div>`;
    }
    const first = summary.values[0].time;
    const last = summary.values[summary.values.length - 1].time;
    const timeSpan = Math.max(last - first, 1);
    const valueSpan = Math.max(summary.highest - summary.lowest, 1e-9);
    const points = summary.values.map((item) => {
      const x = ((item.time - first) / timeSpan) * CHART_WIDTH;
      const y =
        CHART_HEIGHT -
        4 -
        ((item.value - summary.lowest) / valueSpan) * (CHART_HEIGHT - 8);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return html`
      <svg
        class="chart"
        viewBox="0 0 ${CHART_WIDTH} ${CHART_HEIGHT}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <polyline points=${points.join(" ")} />
      </svg>
    `;
  }

  private _renderDetails() {
    const attrs = this.stateObj!.attributes;
    const localize = this.hass!.localize;
    const rows: { label: string; value: string }[] = [];
    if (attrs.device_class) {
      const name = localize(
        `component.sensor.entity_component.${attrs.device_class}.name`
      );
      rows.push({
        label: localize("ui.dialogs.more_info_control.sensor.type"),
        value: name || String(attrs.device_class),
      });
    }
    if (attrs.state_class) {
      rows.push({
        label: localize("ui.dialogs.more_info_control.sensor.state_class"),
        value: String(attrs.state_class),
      });
    }
    if (!rows.length) {
      return nothing;
    }
    return html`
      <div class="details">
        ${rows.map(
          (row) => html`
            <div class="detail">
              <span class="detail-label">${row.label}</span>
              <span class="detail-value">${row.value}</span>
            </div>
          `
        )}
      </div>
    `;
  }

  private _handleRange(ev: Event) {
    this._range = (
      ev.currentTarget as HTMLElement & { range: SensorRange }
    ).range;
  }

  static styles = css`
    :host {
      display: block;
    }

    .hero {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1);
      text-align: center;
      margin-bottom: var(--ha-space-4);
    }

    .value {
      font-size: 56px;
      line-height: 64px;
      font-weight: var(--ha-font-weight-medium);
      direction: ltr;
      max-width: 100%;
      overflow-wrap: anywhere;
    }

    .changed {
      color: var(--secondary-text-color);
    }

    .chart-card {
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-2xl, 24px);
      background: var(--secondary-background-color);
      margin-bottom: var(--ha-space-3);
    }

    .chart-title {
      font-weight: var(--ha-font-weight-semi-bold);
      margin-bottom: var(--ha-space-2);
    }

    .chart {
      display: block;
      width: 100%;
      height: 80px;
    }

    .chart polyline {
      fill: none;
      stroke: var(--primary-color);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .chart-empty {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 80px;
      color: var(--secondary-text-color);
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-3);
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
      min-width: 0;
    }

    .stat-label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }

    .stat-value {
      direction: ltr;
      text-align: start;
      font-weight: var(--ha-font-weight-semi-bold);
    }

    .ranges {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-4);
    }

    .chip {
      min-height: 36px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      border: 1px solid var(--divider-color);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
    }

    .chip.selected {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color);
    }

    .details {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }

    .detail {
      display: flex;
      justify-content: space-between;
      gap: var(--ha-space-4);
    }

    .detail-label {
      color: var(--secondary-text-color);
    }

    .detail-value {
      font-weight: var(--ha-font-weight-semi-bold);
      text-align: end;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-sensor": MoreInfoSensor;
  }
}
