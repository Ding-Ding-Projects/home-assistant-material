import { mdiClockOutline, mdiPulse } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { useAmPm } from "../../common/datetime/use_am_pm";
import { computeStateName } from "../../common/entity/compute_state_name";
import { formatNumber } from "../../common/number/format_number";
import "../../components/ha-svg-icon";
import type { LogbookEntry } from "../../data/logbook";
import type { HomeAssistant } from "../../types";
import { computeLogbookStats } from "./logbook-stats";

/**
 * Three small facts about the activity that is listed: how many entries,
 * the busiest hour of the day, and the things that appear most.
 */
@customElement("ha-logbook-stats")
export class HaLogbookStats extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public entries: LogbookEntry[] = [];

  private _stats = memoizeOne((entries: LogbookEntry[]) =>
    computeLogbookStats(entries)
  );

  private _formatHour(hour: number): string {
    const date = new Date();
    date.setHours(hour, 0, 0, 0);
    return new Intl.DateTimeFormat(this.hass.locale.language, {
      hour: "numeric",
      hour12: useAmPm(this.hass.locale),
    }).format(date);
  }

  protected render() {
    const stats = this._stats(this.entries);
    if (!stats.total) {
      return nothing;
    }
    const localize = this.hass.localize;
    const top = stats.mostActive[0]?.count ?? 1;
    return html`
      <div class="card events">
        <div class="label">
          <ha-svg-icon .path=${mdiPulse}></ha-svg-icon>
          ${localize("ui.panel.logbook.stats.events")}
        </div>
        <div class="value">${formatNumber(stats.total, this.hass.locale)}</div>
      </div>
      ${
        stats.busiestHour
          ? html`<div class="card">
              <div class="label">
                <ha-svg-icon .path=${mdiClockOutline}></ha-svg-icon>
                ${localize("ui.panel.logbook.stats.busiest_hour")}
              </div>
              <div class="value small">
                ${this._formatHour(stats.busiestHour.hour)}
              </div>
              <div class="note">
                ${localize("ui.panel.logbook.stats.events_count", {
                  count: stats.busiestHour.count,
                })}
              </div>
            </div>`
          : nothing
      }
      <div class="card most">
        <div class="label">
          ${localize("ui.panel.logbook.stats.most_active")}
        </div>
        ${stats.mostActive.map((thing) => {
          const stateObj = thing.entityId
            ? this.hass.states[thing.entityId]
            : undefined;
          const name = stateObj ? computeStateName(stateObj) : thing.name;
          return html`<div class="row">
            <span class="name">${name}</span>
            <span class="count">
              ${formatNumber(thing.count, this.hass.locale)}
            </span>
            <progress max=${top} value=${thing.count}></progress>
          </div>`;
        })}
      </div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: grid;
      grid-template-columns: 1fr 1fr 2fr;
      gap: var(--ha-space-3);
      padding: 0 var(--ha-space-4) var(--ha-space-3);
    }
    @media (max-width: 900px) {
      :host {
        grid-template-columns: 1fr 1fr;
      }
      .most {
        grid-column: 1 / -1;
      }
    }
    .card {
      min-width: 0;
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl, 20px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    .events {
      background: color-mix(
        in srgb,
        var(--primary-color) 16%,
        var(--primary-background-color)
      );
    }
    .label {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 20px;
    }
    .value {
      margin-top: var(--ha-space-1);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .value.small {
      font-size: var(--ha-font-size-2xl);
    }
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 0 var(--ha-space-2);
      margin-top: var(--ha-space-2);
      font-size: var(--ha-font-size-m);
    }
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .count {
      font-weight: var(--ha-font-weight-medium);
    }
    progress {
      grid-column: 1 / -1;
      width: 100%;
      height: 6px;
      appearance: none;
      border: none;
      border-radius: 3px;
      background: var(--divider-color);
      overflow: hidden;
    }
    progress::-webkit-progress-bar {
      background: var(--divider-color);
    }
    progress::-webkit-progress-value {
      background: var(--primary-color);
      border-radius: 3px;
    }
    progress::-moz-progress-bar {
      background: var(--primary-color);
      border-radius: 3px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-logbook-stats": HaLogbookStats;
  }
}
