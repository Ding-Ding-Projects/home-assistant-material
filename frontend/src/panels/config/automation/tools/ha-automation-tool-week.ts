import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import { loadAllAutomations } from "./automation-bulk";
import type { WeekDay, WeekEntry, WeekPlan } from "./automation-week";
import { firesAt, gridTimes, planWeek, WEEKDAY_ORDER } from "./automation-week";
import type { AutomationToolContext } from "./registry";

@customElement("ha-automation-tool-week")
export class HaAutomationToolWeek extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _others?: WeekPlan;

  @state() private _loading = false;

  private _t(key: string, values?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools_more.week.${key}` as any,
      values
    );
  }

  private async _loadAll() {
    this._loading = true;
    const { automations } = await loadAllAutomations(this.context.hass);
    const plan: WeekPlan = { entries: [], unpredictable: [] };
    for (const automation of automations) {
      // The automation on screen is planned from its unsaved state instead.
      if (automation.id === this.context.automationId) {
        continue;
      }
      const part = planWeek(automation.config as any, automation.name);
      plan.entries.push(...part.entries);
      plan.unpredictable.push(...part.unpredictable);
    }
    this._others = plan;
    this._loading = false;
  }

  protected render() {
    if (!this.context) {
      return nothing;
    }
    const own = planWeek(
      this.context.config,
      this.context.config.alias ?? this._t("this_automation")
    );
    const entries: WeekEntry[] = [
      ...own.entries,
      ...(this._others?.entries ?? []),
    ];
    const unpredictable = [
      ...own.unpredictable,
      ...(this._others?.unpredictable ?? []),
    ];
    const times = gridTimes(entries);
    const frequent = entries.filter((e) => e.frequent);
    return html`
      <ha-card .header=${this._t("title")}>
        <div class="content">
          <p class="hint">${this._t("description")}</p>
          ${
            times.length
              ? html`<div
                  class="grid"
                  role="table"
                  aria-label=${this._t("title")}
                >
                  <span></span>
                  ${WEEKDAY_ORDER.map(
                    (_d, i) =>
                      html`<span class="day" role="columnheader"
                        >${this._t(`day_${i}`)}</span
                      >`
                  )}
                  ${times.map(
                    (time) =>
                      html`<span class="time mono">${time}</span> ${(
                          [0, 1, 2, 3, 4, 5, 6] as WeekDay[]
                        ).map((day) => {
                          const hits = firesAt(entries, time, day);
                          return html`<span
                            class="cell ${hits.length ? "on" : ""}"
                            title=${hits.map((h) => h.source).join(", ")}
                            aria-label=${
                              hits.length
                                ? hits.map((h) => h.source).join(", ")
                                : this._t("nothing")
                            }
                          >
                            ${hits.length > 1 ? hits.length : nothing}
                          </span>`;
                        })}`
                  )}
                </div>`
              : html`<p>${this._t("nothing_scheduled")}</p>`
          }
          ${frequent.map(
            (e) =>
              html`<p class="hint">
                ${this._t("frequent", {
                  name: e.source,
                  count: e.frequent!.perDay,
                })}
              </p>`
          )}
          <div>
            <ha-button
              appearance="plain"
              .disabled=${this._loading || !!this._others}
              @click=${this._loadAll}
            >
              ${this._others ? this._t("all_included") : this._t("include_all")}
            </ha-button>
          </div>
        </div>
      </ha-card>
      <ha-card .header=${this._t("cannot_predict")}>
        <div class="content">
          <p class="hint">${this._t("event_note")}</p>
          ${
            unpredictable.length
              ? html`<ul>
                  ${unpredictable.map(
                    (u) =>
                      html`<li>
                        <b>${u.source}</b>
                        <span class="hint">
                          ${this._t(`reason_${u.reason}`)}</span
                        >
                      </li>`
                  )}
                </ul>`
              : nothing
          }
        </div>
      </ha-card>
    `;
  }

  static styles = css`
    :host {
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: var(--ha-space-4);
    }
    .content {
      padding: var(--ha-space-4);
      display: grid;
      gap: var(--ha-space-3);
    }
    .grid {
      display: grid;
      grid-template-columns: 44px repeat(7, minmax(0, 1fr));
      gap: var(--ha-space-1);
      align-items: center;
    }
    .day {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: center;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .time {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .cell {
      height: 36px;
      border-radius: var(--ha-border-radius-md);
      background: var(
        --ha-color-surface-tone-2,
        var(--secondary-background-color)
      );
      display: grid;
      place-items: center;
      font-size: var(--ha-font-size-s);
    }
    .cell.on {
      background: var(--ha-color-primary-container, var(--primary-color));
      color: var(--ha-color-on-primary-container, var(--text-primary-color));
    }
    .mono {
      font-family: var(--ha-font-family-code, monospace);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      margin: 0;
    }
    ul {
      margin: 0;
      padding-inline-start: var(--ha-space-5, 20px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-week": HaAutomationToolWeek;
  }
}
