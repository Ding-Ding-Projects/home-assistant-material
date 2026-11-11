import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../../common/decorators/consume";
import { firstWeekdayIndex } from "../../../common/datetime/first_weekday";
import "../../../components/ha-button";
import "../../../components/ha-icon-button-next";
import "../../../components/ha-icon-button-prev";
import { apiContext } from "../../../data/context";
import { setDateValue } from "../../../data/date";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import type { HomeAssistant, HomeAssistantApi } from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

const pad = (value: number) => String(value).padStart(2, "0");

const toIso = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

const parseIso = (value: string | undefined): Date | undefined => {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) {
    return undefined;
  }
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
};

const startOfToday = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

// Month and year steps stay on the last day of a shorter target month
const addMonths = (date: Date, months: number) => {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(
    target.getFullYear(),
    target.getMonth() + 1,
    0
  ).getDate();
  return new Date(
    target.getFullYear(),
    target.getMonth(),
    Math.min(date.getDate(), lastDay)
  );
};

@customElement("more-info-date")
class MoreInfoDate extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  // The date picked in the grid, applied only by the Set date button
  @state() private _draft?: string;

  // First day of the month the grid shows
  @state() private _month?: Date;

  private _syncedState?: string;

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (this.stateObj && this.stateObj.state !== this._syncedState) {
      this._syncedState = this.stateObj.state;
      this._resetDraft();
    }
  }

  private _resetDraft() {
    const current = parseIso(this.stateObj?.state) ?? startOfToday();
    this._draft = toIso(current);
    this._month = new Date(current.getFullYear(), current.getMonth(), 1);
  }

  protected render() {
    if (
      !this.hass ||
      !this.stateObj ||
      this.stateObj.state === UNAVAILABLE ||
      !this._draft ||
      !this._month
    ) {
      return nothing;
    }
    const localize = this.hass.localize;
    const language = this.hass.locale.language;
    const draft = parseIso(this._draft)!;
    const today = startOfToday();
    const changed =
      this.stateObj.state === UNKNOWN || this._draft !== this.stateObj.state;

    const dayFormat = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "long",
      year: draft.getFullYear() === today.getFullYear() ? undefined : "numeric",
    });
    const weekdayFormat = new Intl.DateTimeFormat(language, {
      weekday: "long",
    });
    const relative = new Intl.RelativeTimeFormat(language, { numeric: "auto" });
    const diff = Math.round((draft.getTime() - today.getTime()) / 86400000);

    return html`
      <div class="stack">
        <h2 class="headline">${dayFormat.format(draft)}</h2>
        <p class="subline">
          ${weekdayFormat.format(draft)}, ${relative.format(diff, "day")}
        </p>
        ${this._renderGrid(draft, today)}
        <div class="chips">
          <button type="button" class="chip" @click=${this._pickToday}>
            ${localize("ui.dialogs.more_info_control.date.today")}
          </button>
          <button
            type="button"
            class="chip"
            .step=${{ days: 7 }}
            @click=${this._pickRelative}
          >
            ${localize("ui.dialogs.more_info_control.date.plus_week")}
          </button>
          <button
            type="button"
            class="chip"
            .step=${{ months: 1 }}
            @click=${this._pickRelative}
          >
            ${localize("ui.dialogs.more_info_control.date.plus_month")}
          </button>
          <button
            type="button"
            class="chip"
            .step=${{ months: 12 }}
            @click=${this._pickRelative}
          >
            ${localize("ui.dialogs.more_info_control.date.plus_year")}
          </button>
        </div>
        <div class="actions">
          <ha-button
            appearance="plain"
            .disabled=${!changed}
            @click=${this._resetDraft}
          >
            ${localize("ui.common.cancel")}
          </ha-button>
          <ha-button .disabled=${!changed} @click=${this._apply}>
            ${localize("ui.dialogs.more_info_control.date.set_date")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _renderGrid(draft: Date, today: Date) {
    const month = this._month!;
    const language = this.hass!.locale.language;
    const first = firstWeekdayIndex(this.hass!.locale);
    const weekdayNarrow = new Intl.DateTimeFormat(language, {
      weekday: "narrow",
    });
    const dayLabel = new Intl.DateTimeFormat(language, { dateStyle: "full" });

    // 2023-01-01 was a Sunday
    const headers = Array.from({ length: 7 }, (_, i) =>
      weekdayNarrow.format(new Date(2023, 0, 1 + ((first + i) % 7)))
    );
    const offset = (month.getDay() - first + 7) % 7;
    const daysInMonth = new Date(
      month.getFullYear(),
      month.getMonth() + 1,
      0
    ).getDate();
    const cells: (Date | undefined)[] = [
      ...Array.from({ length: offset }, () => undefined),
      ...Array.from(
        { length: daysInMonth },
        (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1)
      ),
    ];

    return html`
      <div class="month">
        <ha-icon-button-prev
          .label=${this.hass!.localize("ui.common.previous")}
          @click=${this._previousMonth}
        ></ha-icon-button-prev>
        <span class="month-title" aria-live="polite">
          ${new Intl.DateTimeFormat(language, {
            month: "long",
            year: "numeric",
          }).format(month)}
        </span>
        <ha-icon-button-next
          .label=${this.hass!.localize("ui.common.next")}
          @click=${this._nextMonth}
        ></ha-icon-button-next>
      </div>
      <div class="grid" role="grid">
        ${headers.map(
          (label) =>
            html`<span class="weekday" role="columnheader">${label}</span>`
        )}
        ${cells.map((day) =>
          day
            ? html`<button
                type="button"
                class=${classMap({
                  day: true,
                  today: day.getTime() === today.getTime(),
                })}
                aria-label=${dayLabel.format(day)}
                aria-pressed=${day.getTime() === draft.getTime()}
                .date=${toIso(day)}
                @click=${this._pickDay}
              >
                ${day.getDate()}
              </button>`
            : html`<span class="blank"></span>`
        )}
      </div>
    `;
  }

  private _previousMonth() {
    this._month = addMonths(this._month!, -1);
  }

  private _nextMonth() {
    this._month = addMonths(this._month!, 1);
  }

  private _pick(date: Date) {
    this._draft = toIso(date);
    this._month = new Date(date.getFullYear(), date.getMonth(), 1);
  }

  private _pickDay(ev: Event) {
    this._draft = (ev.currentTarget as HTMLElement & { date: string }).date;
  }

  private _pickToday() {
    this._pick(startOfToday());
  }

  private _pickRelative(ev: Event) {
    const step = (
      ev.currentTarget as HTMLElement & {
        step: { days?: number; months?: number };
      }
    ).step;
    const base = parseIso(this._draft) ?? startOfToday();
    this._pick(
      step.days ? addDays(base, step.days) : addMonths(base, step.months!)
    );
  }

  private _apply() {
    if (this._draft) {
      setDateValue(
        this._api.callService,
        this.stateObj!.entity_id,
        this._draft
      );
    }
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      :host {
        display: block;
      }
      .stack {
        align-items: stretch;
      }
      .headline {
        align-self: center;
      }
      .subline {
        align-self: center;
        margin-bottom: var(--ha-space-2);
      }
      .month {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .month-title {
        font-weight: var(--ha-font-weight-medium);
      }
      .grid {
        display: grid;
        grid-template-columns: repeat(7, minmax(0, 1fr));
        gap: var(--ha-space-1);
        justify-items: center;
      }
      .weekday {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        padding: var(--ha-space-1) 0;
      }
      .day {
        appearance: none;
        border: 1px solid transparent;
        background: transparent;
        color: var(--primary-text-color);
        font: inherit;
        width: 100%;
        max-width: 40px;
        aspect-ratio: 1;
        min-height: 32px;
        padding: 0;
        border-radius: var(--ha-border-radius-circle);
        cursor: pointer;
      }
      .day.today {
        border-color: var(--primary-color);
      }
      .day[aria-pressed="true"] {
        background: var(--primary-color);
        border-color: var(--primary-color);
        color: var(--text-primary-color, #fff);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--ha-space-3);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-date": MoreInfoDate;
  }
}
