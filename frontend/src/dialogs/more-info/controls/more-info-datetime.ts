import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { resolveTimeZone } from "../../../common/datetime/resolve-time-zone";
import { consume } from "../../../common/decorators/consume";
import "../../../components/ha-button";
import "../../../components/ha-date-input";
import "../../../components/ha-time-input";
import { apiContext } from "../../../data/context";
import { setDateTimeValue } from "../../../data/datetime";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import type {
  HomeAssistant,
  HomeAssistantApi,
  ValueChangedEvent,
} from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import {
  calendarDaysFromToday,
  getZonedParts,
  todayInZone,
  zonedWallTimeToDate,
} from "./more-info-time-zone";

const pad = (value: number) => String(value).padStart(2, "0");

@customElement("more-info-datetime")
class MoreInfoDatetime extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  // The value picked here, applied only by the Set button
  @state() private _draft?: Date;

  private _syncedState?: string;

  // The profile time zone, not the browser one
  private get _timeZone(): string {
    return resolveTimeZone(
      this.hass!.locale.time_zone,
      this.hass!.config.time_zone
    );
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (
      this.hass &&
      this.stateObj &&
      this.stateObj.state !== this._syncedState
    ) {
      this._syncedState = this.stateObj.state;
      this._resetDraft();
    }
  }

  private _resetDraft() {
    const current =
      this.stateObj && this.stateObj.state !== UNKNOWN
        ? new Date(this.stateObj.state)
        : new Date();
    this._draft = Number.isNaN(current.getTime()) ? new Date() : current;
  }

  protected render() {
    if (
      !this.hass ||
      !this.stateObj ||
      this.stateObj.state === UNAVAILABLE ||
      !this._draft
    ) {
      return nothing;
    }
    const localize = this.hass.localize;
    const language = this.hass.locale.language;
    const draft = this._draft;
    const changed =
      this.stateObj.state === UNKNOWN ||
      draft.getTime() !== new Date(this.stateObj.state).getTime();

    const zone = this._timeZone;
    const zoned = getZonedParts(draft, zone);
    const headline = new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      year: zoned.year === todayInZone(zone).year ? undefined : "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: zone,
    }).format(draft);
    const relative = new Intl.RelativeTimeFormat(language, {
      numeric: "auto",
    }).format(calendarDaysFromToday(draft, zone), "day");

    return html`
      <div class="stack">
        <h2 class="headline">${headline}</h2>
        <p class="subline">${relative}</p>
        <div class="fields">
          <ha-date-input
            .locale=${this.hass.locale}
            .value=${`${zoned.year}-${pad(zoned.month)}-${pad(zoned.day)}`}
            @value-changed=${this._dateChanged}
          ></ha-date-input>
          <ha-time-input
            .value=${`${pad(zoned.hour)}:${pad(zoned.minute)}:${pad(zoned.second)}`}
            .locale=${this.hass.locale}
            @value-changed=${this._timeChanged}
            @click=${this._stopEventPropagation}
          ></ha-time-input>
        </div>
        <div class="chips">
          <button type="button" class="chip" @click=${this._pickNow}>
            ${localize("ui.dialogs.more_info_control.datetime.now")}
          </button>
          <button
            type="button"
            class="chip"
            .when=${{ days: 0, hour: 20 }}
            @click=${this._pickPreset}
          >
            ${localize("ui.dialogs.more_info_control.datetime.tonight", {
              time: this._presetTime(20),
            })}
          </button>
          <button
            type="button"
            class="chip"
            .when=${{ days: 1, hour: 9 }}
            @click=${this._pickPreset}
          >
            ${localize("ui.dialogs.more_info_control.datetime.tomorrow", {
              time: this._presetTime(9),
            })}
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
            ${localize("ui.dialogs.more_info_control.datetime.set")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _presetTime(hour: number) {
    // A wall clock reading, so it is formatted without any zone shift
    return new Intl.DateTimeFormat(this.hass!.locale.language, {
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
    }).format(new Date(Date.UTC(2023, 0, 1, hour)));
  }

  private _stopEventPropagation(ev: Event): void {
    ev.stopPropagation();
  }

  private _timeChanged(ev: ValueChangedEvent<string>): void {
    if (ev.detail.value && this._draft) {
      const zone = this._timeZone;
      const current = getZonedParts(this._draft, zone);
      const [hours, minutes, seconds] = ev.detail.value.split(":").map(Number);
      this._draft = zonedWallTimeToDate(
        zone,
        current.year,
        current.month,
        current.day,
        hours,
        minutes,
        seconds || 0
      );
    }
  }

  private _dateChanged(ev: ValueChangedEvent<string>): void {
    if (ev.detail.value && this._draft) {
      const zone = this._timeZone;
      const current = getZonedParts(this._draft, zone);
      const [year, month, day] = ev.detail.value.split("-").map(Number);
      this._draft = zonedWallTimeToDate(
        zone,
        year,
        month,
        day,
        current.hour,
        current.minute,
        current.second
      );
    }
  }

  private _pickNow() {
    const now = new Date();
    now.setSeconds(0, 0);
    this._draft = now;
  }

  private _pickPreset(ev: Event) {
    const when = (
      ev.currentTarget as HTMLElement & {
        when: { days: number; hour: number };
      }
    ).when;
    // Days are counted on the zone calendar, so a daylight-saving change
    // between today and the target day cannot shift the wall clock time
    const today = todayInZone(this._timeZone);
    const target = new Date(
      Date.UTC(today.year, today.month - 1, today.day + when.days)
    );
    this._draft = zonedWallTimeToDate(
      this._timeZone,
      target.getUTCFullYear(),
      target.getUTCMonth() + 1,
      target.getUTCDate(),
      when.hour
    );
  }

  private _apply() {
    if (this._draft) {
      setDateTimeValue(
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
      .fields {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: center;
        gap: var(--ha-space-2);
        align-self: stretch;
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
    "more-info-datetime": MoreInfoDatetime;
  }
}
