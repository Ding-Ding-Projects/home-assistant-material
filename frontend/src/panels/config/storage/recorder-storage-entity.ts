import { mdiLeaf } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { formatShortDateTime } from "../../../common/datetime/format_date_time";
import { formatDateShort } from "../../../common/datetime/format_date";
import { formatNumber } from "../../../common/number/format_number";
import "../../../components/chart/ha-chart-base";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  RecorderStorageDay,
  RecorderStorageEntity,
} from "../../../data/recorder";
import {
  getRecorderStorageEntity,
  purgeRecorderEntity,
} from "../../../data/recorder";
import { ERR_UNKNOWN_COMMAND } from "../../../data/websocket_api";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import type { ECOption } from "../../../resources/echarts/echarts";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import { bytesToString } from "../../../util/bytes-to-string";
import {
  KEEP_DAY_CHOICES,
  averageRowsPerDay,
  estimatedSaving,
  recordingInterval,
  rowsKept,
  shareOf,
} from "./storage-math";

const DETAIL_DAYS = 30;
const DEFAULT_KEEP_DAYS = 3;
const REFRESH_AFTER_PURGE_MS = 2500;

/**
 * One entity of the history database: what it costs, where the rows come from
 * and the ways to make it smaller that the product really has. The saving is
 * shown before it is applied and is labelled as an estimate.
 */
@customElement("ha-recorder-storage-entity")
export class HaRecorderStorageEntity extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: "entity-id" }) public entityId!: string;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _detail?: RecorderStorageEntity | null;

  @state() private _error?: "unavailable" | "failed";

  @state() private _keepDays = DEFAULT_KEEP_DAYS;

  @state() private _purging = false;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("entityId")) {
      this._detail = undefined;
      this._error = undefined;
      this._load();
    }
  }

  /** The summary line: rows, estimated size and share of all history rows. */
  private _summary(detail: RecorderStorageEntity): string {
    const share = formatNumber(
      shareOf(detail.rows, detail.total_rows) ?? 0,
      this.hass.locale,
      { style: "percent", maximumFractionDigits: 1 }
    );
    return detail.estimated_bytes == null
      ? this._t("summary_entity", { rows: detail.rows, share })
      : this._t("summary_entity_size", {
          rows: detail.rows,
          size: bytesToString(detail.estimated_bytes, 1),
          share,
        });
  }

  private async _load(): Promise<void> {
    const entityId = this.entityId;
    try {
      const detail = await getRecorderStorageEntity(
        this.hass,
        entityId,
        DETAIL_DAYS
      );
      if (entityId === this.entityId) {
        this._detail = detail;
      }
    } catch (err: any) {
      if (entityId === this.entityId) {
        this._detail = null;
        this._error =
          err?.code === ERR_UNKNOWN_COMMAND ? "unavailable" : "failed";
      }
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.storage.recorder.usage.${key}` as any,
      values
    );
  }

  private _time(seconds: number): string {
    return formatShortDateTime(
      new Date(seconds * 1000),
      this.hass.locale,
      this.hass.config
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (this._detail === undefined) {
      return html`<section class="card loading">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t("loading")}</span>
      </section>`;
    }
    if (this._detail === null) {
      return html`<ha-alert alert-type="warning">
        ${this._t(this._error === "unavailable" ? "not_available" : "failed")}
      </ha-alert>`;
    }
    return html`<p class="summary">${this._summary(this._detail)}</p>
      <div class="columns">
        <div class="column">
          ${this._renderCosts(this._detail)} ${this._renderPerDay(this._detail)}
        </div>
        ${this._renderSmaller(this._detail)}
      </div>`;
  }

  private _renderCosts(detail: RecorderStorageEntity): TemplateResult {
    const perDay = averageRowsPerDay(detail.per_day, detail.first);
    const interval = recordingInterval(perDay);
    return html`<section class="card">
      <h3>${this._t("costs_title")}</h3>
      ${
        detail.recording_excluded
          ? html`<ha-alert
              alert-type="info"
              .title=${this._t("excluded_title")}
            >
              ${this._t("excluded_text")}
            </ha-alert>`
          : nothing
      }
      <dl class="facts">
        <dt>${this._t("changes_a_day")}</dt>
        <dd>
          ${this._t("changes_a_day_value", {
            count: formatNumber(Math.round(perDay), this.hass.locale),
            days: detail.per_day.length,
          })}
        </dd>
        <dt>${this._t("how_often")}</dt>
        <dd>
          ${
            interval
              ? this._t(`every_${interval.unit}`, { value: interval.value })
              : this._t("rare")
          }
        </dd>
        ${
          detail.first == null || detail.last == null
            ? nothing
            : html`<dt>${this._t("first_record")}</dt>
                <dd>${this._time(detail.first)}</dd>
                <dt>${this._t("last_record")}</dt>
                <dd>${this._time(detail.last)}</dd>`
        }
        <dt>${this._t("kept_for")}</dt>
        <dd>${this._t("kept_for_value", { days: detail.keep_days })}</dd>
      </dl>
      <p class="note">${this._t("exclude_hint")}</p>
    </section>`;
  }

  private _renderPerDay(detail: RecorderStorageEntity): TemplateResult {
    return html`<section class="card">
      <h3>${this._t("per_day_title", { days: detail.per_day.length })}</h3>
      <ha-chart-base
        .height=${"160px"}
        .data=${this._chartData(detail.per_day)}
        .options=${this._chartOptions(detail.per_day)}
      ></ha-chart-base>
    </section>`;
  }

  private _chartData = memoizeOne((days: RecorderStorageDay[]) => [
    {
      id: "rows",
      type: "bar" as const,
      name: this._t("growth_series"),
      data: days.map((day) => day.rows),
      itemStyle: { borderRadius: [4, 4, 0, 0] },
    },
  ]);

  private _chartOptions = memoizeOne(
    (days: RecorderStorageDay[]): ECOption => ({
      xAxis: {
        type: "category",
        data: days.map((day) =>
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

  private _keepButtons = memoizeOne(() =>
    KEEP_DAY_CHOICES.map((days) => ({
      label: days === 0 ? this._t("keep_none") : this._t("keep_days", { days }),
      value: String(days),
    }))
  );

  private _renderSmaller(detail: RecorderStorageEntity): TemplateResult {
    const saving = estimatedSaving(detail, this._keepDays);
    const removed = detail.rows - rowsKept(detail, this._keepDays);
    const nothingToRemove = removed <= 0;
    return html`<section class="card">
      <h3>${this._t("smaller_title")}</h3>
      <span class="label" id="keep-label">${this._t("keep_label")}</span>
      <ha-button-toggle-group
        aria-labelledby="keep-label"
        size="s"
        .buttons=${this._keepButtons()}
        .active=${String(this._keepDays)}
        .disabled=${this._purging}
        @value-changed=${this._keepChanged}
      ></ha-button-toggle-group>
      <div class="saving ${nothingToRemove ? "none" : ""}" aria-live="polite">
        <ha-svg-icon .path=${mdiLeaf}></ha-svg-icon>
        <span>
          ${
            nothingToRemove
              ? this._t("nothing_to_remove")
              : saving === undefined
                ? this._t("saves_unknown", { rows: removed })
                : this._t("saves", { size: bytesToString(saving, 1) })
          }
        </span>
      </div>
      <ha-button
        .disabled=${nothingToRemove || this._purging}
        @click=${this._apply}
      >
        ${this._t("apply")}
      </ha-button>
    </section>`;
  }

  private _keepChanged(ev: CustomEvent<{ value: string }>): void {
    const days = Number(ev.detail.value);
    if (!Number.isNaN(days)) {
      this._keepDays = days;
    }
  }

  private async _apply(): Promise<void> {
    const entityId = this.entityId;
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_title", { entity: entityId }),
      text: this._t("confirm_text"),
      confirmText: this._t("confirm_action"),
      destructive: true,
      confirmName: entityId,
    });
    if (!confirmed) {
      return;
    }
    this._purging = true;
    try {
      await purgeRecorderEntity(this.hass, entityId, this._keepDays);
    } catch (_err) {
      showToast(this, { message: this._t("purge_failed") });
      this._purging = false;
      return;
    }
    showToast(this, { message: this._t("purge_queued") });
    // The service only queues the job, so give the recorder a moment.
    window.setTimeout(async () => {
      await this._load();
      this._purging = false;
    }, REFRESH_AFTER_PURGE_MS);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .summary {
          margin: 0 0 var(--ha-space-4);
          color: var(--secondary-text-color);
        }
        .columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: var(--ha-space-4);
          align-items: start;
        }
        :host([narrow]) .columns {
          grid-template-columns: 1fr;
        }
        .column {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
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
        .facts {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: var(--ha-space-2) var(--ha-space-4);
          margin: 0;
        }
        .facts dt {
          color: var(--secondary-text-color);
        }
        .facts dd {
          margin: 0;
          font-weight: var(--ha-font-weight-medium);
        }
        .note {
          margin: var(--ha-space-3) 0 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        ha-alert {
          display: block;
          margin-bottom: var(--ha-space-3);
        }
        .label {
          display: block;
          margin-bottom: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .saving {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          margin: var(--ha-space-4) 0;
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-success-container,
            var(--secondary-background-color)
          );
          color: var(
            --ha-color-on-success-container,
            var(--primary-text-color)
          );
        }
        .saving.none {
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .saving ha-svg-icon {
          flex: none;
        }
        ha-button {
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-recorder-storage-entity": HaRecorderStorageEntity;
  }
}
