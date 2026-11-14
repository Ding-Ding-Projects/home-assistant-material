import { mdiChevronRight, mdiDatabase } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../common/dom/fire_event";
import { formatShortDateTime } from "../../../common/datetime/format_date_time";
import { formatDateShort } from "../../../common/datetime/format_date";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/chart/ha-chart-base";
import "../../../components/ha-alert";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  RecorderStorageDay,
  RecorderStorageOverview,
} from "../../../data/recorder";
import { getRecorderStorageOverview } from "../../../data/recorder";
import { ERR_UNKNOWN_COMMAND } from "../../../data/websocket_api";
import type { ECOption } from "../../../resources/echarts/echarts";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { bytesToString } from "../../../util/bytes-to-string";
import {
  averageRowsPerDay,
  hasRowCounts,
  shareOf,
  toCount,
} from "./storage-math";

const RING_RADIUS = 52;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

declare global {
  interface HASSDomEvents {
    "storage-entity-selected": { entityId: string };
  }
}

/**
 * The history database as the storage page shows it: the size, the growth of
 * the last days and the entities with the most rows. Row counts and the
 * database size are measured; sizes per entity are estimates and say so.
 */
@customElement("ha-recorder-storage-overview")
export class HaRecorderStorageOverview extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  // undefined while loading, null when the server cannot report it
  @state() private _overview?: RecorderStorageOverview | null;

  @state() private _error?: "unavailable" | "failed";

  // Not in connectedCallback: this element is loaded after the page first
  // draws it, and an element upgraded in place connects before the
  // properties set on it (hass) are applied.
  protected firstUpdated(): void {
    this._load();
  }

  /** Reads the figures again, for example after a purge. */
  public async reload(): Promise<void> {
    await this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._overview = await getRecorderStorageOverview(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._overview = null;
      this._error =
        err?.code === ERR_UNKNOWN_COMMAND ? "unavailable" : "failed";
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.storage.recorder.usage.${key}` as any,
      values
    );
  }

  private _rows(count: unknown): string {
    const rows = toCount(count);
    return rows === undefined
      ? this._t("rows_unknown")
      : formatNumber(rows, this.hass.locale);
  }

  protected render(): TemplateResult | typeof nothing {
    if (this._overview === undefined) {
      return html`<section class="card loading">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t("loading")}</span>
      </section>`;
    }
    if (this._overview === null) {
      return html`<section class="card">
        <h3>${this._t("heading")}</h3>
        <ha-alert alert-type="warning">
          ${this._t(this._error === "unavailable" ? "not_available" : "failed")}
        </ha-alert>
      </section>`;
    }
    const overview = this._overview;
    return html`
      <div class="top">
        ${this._renderHero(overview)} ${this._renderBiggest(overview)}
      </div>
      ${this._renderGrowth(overview)}
    `;
  }

  private _renderHero(overview: RecorderStorageOverview): TemplateResult {
    const { database, states, growth } = overview;
    const share = shareOf(states.table_bytes, database.size_bytes);
    const perDay = averageRowsPerDay(growth, states.oldest);
    const size =
      database.size_bytes == null
        ? undefined
        : bytesToString(database.size_bytes, 1);
    return html`<section class="card hero">
      <div
        class="ring"
        role="img"
        aria-label=${`${this._t("ring_label")}: ${size ?? this._t("size_unknown")}`}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          ${svg`<circle class="track" cx="60" cy="60" r=${RING_RADIUS}></circle>`}
          ${
            share === undefined
              ? nothing
              : svg`<circle
                  class="value"
                  cx="60"
                  cy="60"
                  r=${RING_RADIUS}
                  stroke-dasharray=${`${RING_LENGTH * share} ${RING_LENGTH}`}
                  transform="rotate(-90 60 60)"
                ></circle>`
          }
        </svg>
        <span class="ring-text ${size ? "" : "unknown"}"
          >${size ?? this._t("size_unknown")}</span
        >
      </div>
      <dl class="facts">
        <dt>${this._t("rows")}</dt>
        <dd>${this._t("rows_value", { rows: this._rows(states.rows) })}</dd>
        ${
          states.oldest == null
            ? nothing
            : html`<dt>${this._t("oldest")}</dt>
                <dd>
                  ${formatShortDateTime(
                    new Date(states.oldest * 1000),
                    this.hass.locale,
                    this.hass.config
                  )}
                </dd>`
        }
        <dt>${this._t("growing")}</dt>
        <dd>
          ${
            hasRowCounts(growth)
              ? this._t("growing_value", {
                  rows: Math.round(perDay),
                  days: growth.length,
                })
              : this._t("growing_unknown")
          }
        </dd>
      </dl>
      <p class="note">
        ${
          share === undefined
            ? this._t("table_share_unknown")
            : this._t("table_share", {
                percent: formatNumber(share, this.hass.locale, {
                  style: "percent",
                  maximumFractionDigits: 0,
                }),
              })
        }
      </p>
    </section>`;
  }

  private _renderBiggest(overview: RecorderStorageOverview): TemplateResult {
    const { entities, states } = overview;
    const max = entities.reduce(
      (peak, entity) => Math.max(peak, toCount(entity.rows) ?? 0),
      0
    );
    return html`<section class="card biggest">
      <h3>${this._t("biggest_title")}</h3>
      ${
        entities.length
          ? html`<ul class="entities">
              ${entities.map((entity) => {
                const name = this.hass.states[entity.entity_id]?.attributes
                  ?.friendly_name as string | undefined;
                return html`<li>
                  <button
                    class="entity"
                    type="button"
                    aria-label=${this._t("open_entity", { entity: entity.entity_id })}
                    @click=${this._openEntity}
                    .entityId=${entity.entity_id}
                  >
                    <span class="entity-text">
                      <span class="entity-id">${entity.entity_id}</span>
                      ${name ? html`<span class="sub">${name}</span>` : nothing}
                      <span class="bar">
                        <span
                          class="fill"
                          style=${styleMap({
                            width: `${max ? Math.max(2, ((toCount(entity.rows) ?? 0) / max) * 100) : 0}%`,
                          })}
                        ></span>
                      </span>
                      <span class="sub"
                        >${
                          entity.estimated_bytes == null ||
                          toCount(entity.rows) === undefined
                            ? this._t("entity_figure_rows", {
                                rows: toCount(entity.rows) ?? 0,
                              })
                            : this._t("entity_figure", {
                                rows: toCount(entity.rows) ?? 0,
                                size: bytesToString(entity.estimated_bytes, 1),
                              })
                        }</span
                      >
                    </span>
                    <ha-svg-icon
                      class="chevron"
                      .path=${mdiChevronRight}
                    ></ha-svg-icon>
                  </button>
                </li>`;
              })}
            </ul>`
          : html`<div class="empty">
              <ha-svg-icon .path=${mdiDatabase}></ha-svg-icon>
              <p>${this._t("empty")}</p>
            </div>`
      }
      ${
        states.rows
          ? html`<p class="note">${this._t("biggest_note")}</p>`
          : nothing
      }
    </section>`;
  }

  private _renderGrowth(
    overview: RecorderStorageOverview
  ): TemplateResult | typeof nothing {
    if (!overview.states.rows) {
      return nothing;
    }
    return html`<section class="card growth">
      <h3>${this._t("growth_title")}</h3>
      <ha-chart-base
        .height=${"180px"}
        .data=${this._chartData(overview.growth)}
        .options=${this._chartOptions(overview.growth)}
      ></ha-chart-base>
    </section>`;
  }

  private _chartData = memoizeOne((growth: RecorderStorageDay[]) => [
    {
      id: "rows",
      type: "bar" as const,
      name: this._t("growth_series"),
      data: growth.map((day) => toCount(day?.rows) ?? 0),
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    },
  ]);

  private _chartOptions = memoizeOne(
    (growth: RecorderStorageDay[]): ECOption => ({
      xAxis: {
        type: "category",
        data: growth.map((day) =>
          formatDateShort(
            new Date(day.start * 1000),
            this.hass.locale,
            this.hass.config
          )
        ),
      },
      yAxis: { type: "value", min: 0 },
      grid: { top: 12, bottom: 24, left: 8, right: 8, containLabel: true },
      tooltip: { trigger: "axis" },
    })
  );

  private _openEntity(ev: Event): void {
    fireEvent(this, "storage-entity-selected", {
      entityId: (ev.currentTarget as any).entityId,
    });
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .top {
          display: grid;
          grid-template-columns: minmax(260px, 340px) minmax(0, 1fr);
          gap: var(--ha-space-4);
          align-items: start;
          margin-bottom: var(--ha-space-4);
        }
        :host([narrow]) .top {
          grid-template-columns: minmax(0, 1fr);
        }
        .top > .card {
          min-width: 0;
        }
        .card {
          box-sizing: border-box;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        h3 {
          margin: 0 0 var(--ha-space-3);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }
        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
        }
        .ring {
          position: relative;
          width: 180px;
          max-width: 100%;
          aspect-ratio: 1;
        }
        .ring svg {
          display: block;
          width: 100%;
          height: 100%;
        }
        circle {
          fill: none;
          stroke-width: 10;
        }
        .track {
          stroke: var(--ha-color-surface-tone-2, var(--divider-color));
        }
        .value {
          stroke: var(--primary-color);
          stroke-linecap: round;
        }
        .ring-text {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0 var(--ha-space-8);
          text-align: center;
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-bold);
        }
        .ring-text.unknown {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-normal);
          color: var(--secondary-text-color);
        }
        .facts {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: var(--ha-space-2) var(--ha-space-4);
          align-self: stretch;
          margin: var(--ha-space-4) 0 0;
        }
        .facts dd {
          overflow-wrap: anywhere;
        }
        .facts dt {
          color: var(--secondary-text-color);
        }
        .facts dd {
          margin: 0;
          font-weight: var(--ha-font-weight-medium);
        }
        .note {
          align-self: stretch;
          margin: var(--ha-space-3) 0 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .entities {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .entity {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          box-sizing: border-box;
          width: 100%;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          color: inherit;
          font: inherit;
          text-align: start;
          cursor: pointer;
        }
        .entity:hover {
          background: var(--secondary-background-color);
        }
        .entity:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .entity-text {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        .entity-id {
          overflow: hidden;
          font-weight: var(--ha-font-weight-medium);
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .bar {
          display: block;
          height: 8px;
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(--ha-color-surface-tone-2, var(--divider-color));
          overflow: hidden;
        }
        .fill {
          display: block;
          height: 100%;
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(--primary-color);
        }
        .chevron {
          flex: none;
          color: var(--secondary-text-color);
        }
        .empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          color: var(--secondary-text-color);
        }
        .empty ha-svg-icon {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-circle);
          background: var(--secondary-background-color);
        }
        ha-alert {
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-recorder-storage-overview": HaRecorderStorageOverview;
  }
}
