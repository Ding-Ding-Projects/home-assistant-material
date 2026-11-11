import { mdiCalendar, mdiPlus } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { useAmPm } from "../../../common/datetime/use_am_pm";
import { supportsFeature } from "../../../common/entity/supports-feature";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type { Calendar, CalendarEvent } from "../../../data/calendar";
import {
  CalendarEntityFeature,
  getCalendarColors,
} from "../../../data/calendar";
import { CalendarEventsController } from "../../../data/calendar-events-controller";
import type { ExtEntityRegistryEntry } from "../../../data/entity/entity_registry";
import { showCalendarEventEditDialog } from "../../../panels/calendar/show-dialog-calendar-event-editor";
import type { HomeAssistant } from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

// The list shows the next 7 days, the calendar panel has the other views
const DAYS_AHEAD = 7;

const isDateOnly = (value: string) => value.length <= 10;

const parseValue = (value: string): Date =>
  isDateOnly(value) ? new Date(`${value}T00:00:00`) : new Date(value);

@customElement("more-info-calendar")
class MoreInfoCalendar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  private _events = new CalendarEventsController(this);

  private _calendars: Calendar[] = [];

  private _subscribed = false;

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (!this.stateObj) {
      return;
    }
    const calendars = this._computeCalendars(
      this.stateObj.entity_id,
      this.entry?.options?.calendar?.color,
      this.hass.themes?.theme,
      this.hass.themes?.darkMode
    );
    if (calendars !== this._calendars) {
      this._calendars = calendars;
      // Events carry the calendar colors, so they are fetched again
      if (this._subscribed) {
        this._subscribe();
      }
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    this._subscribe();
  }

  private async _subscribe(): Promise<void> {
    this._subscribed = true;
    await this._events.unsubscribeAll();
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + DAYS_AHEAD);
    this._events.subscribe(this.hass, this._calendars, start, end);
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }
    const localize = this.hass.localize;
    const attrs = this.stateObj.attributes;
    const message = attrs.message as string | undefined;
    const loading = !this._events.loaded;
    const upcoming = this._upcoming(message, attrs.start_time);
    const canCreate = supportsFeature(
      this.stateObj,
      CalendarEntityFeature.CREATE_EVENT
    );

    return html`
      <div class="stack">
        ${
          message
            ? html`<h2 class="headline accent">${message}</h2>
                <p class="subline">${this._currentRange()}</p>`
            : nothing
        }
        <div class="section">
          <h3>
            ${localize("ui.dialogs.more_info_control.calendar.coming_up")}
          </h3>
          ${
            loading
              ? html`<div class="status"><ha-spinner></ha-spinner></div>`
              : upcoming.length
                ? html`<ul class="events">
                    ${upcoming.map((event) => this._renderEvent(event))}
                  </ul>`
                : html`<p class="status">
                    ${localize(
                      this._events.errorCalendars.length
                        ? "ui.dialogs.more_info_control.calendar.event_retrieval_error"
                        : "ui.dialogs.more_info_control.calendar.no_events"
                    )}
                  </p>`
          }
        </div>
        <div class="actions">
          ${
            canCreate
              ? html`<ha-button @click=${this._createEvent}>
                  <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                  ${localize("ui.dialogs.more_info_control.calendar.new_event")}
                </ha-button>`
              : nothing
          }
          <ha-button appearance="outlined" href="/calendar">
            <ha-svg-icon slot="start" .path=${mdiCalendar}></ha-svg-icon>
            ${localize("ui.dialogs.more_info_control.calendar.open")}
          </ha-button>
        </div>
      </div>
    `;
  }

  // The event shown in the headline is left out of the list below it
  private _upcoming(
    message: string | undefined,
    currentStart: string | undefined
  ): CalendarEvent[] {
    const now = Date.now();
    return [...this._events.events]
      .filter((event) => {
        const end = event.end ? parseValue(event.end).getTime() : 0;
        if (end && end <= now) {
          return false;
        }
        return !(
          message !== undefined &&
          event.title === message &&
          currentStart !== undefined &&
          parseValue(event.start).getTime() ===
            new Date(currentStart.replace(" ", "T")).getTime()
        );
      })
      .sort(
        (a, b) => parseValue(a.start).getTime() - parseValue(b.start).getTime()
      );
  }

  private _currentRange(): string {
    const attrs = this.stateObj!.attributes;
    if (!attrs.start_time) {
      return "";
    }
    const start = new Date(String(attrs.start_time).replace(" ", "T"));
    const end = attrs.end_time
      ? new Date(String(attrs.end_time).replace(" ", "T"))
      : undefined;
    const language = this.hass.locale.language;
    const day = new Intl.DateTimeFormat(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
    if (attrs.all_day) {
      return day.format(start);
    }
    const time = new Intl.DateTimeFormat(language, {
      hour: "numeric",
      minute: "2-digit",
      hour12: useAmPm(this.hass.locale),
    });
    return end
      ? `${day.format(start)}, ${time.format(start)} – ${time.format(end)}`
      : `${day.format(start)}, ${time.format(start)}`;
  }

  private _renderEvent(event: CalendarEvent) {
    const language = this.hass.locale.language;
    const start = parseValue(event.start);
    const day = new Intl.DateTimeFormat(language, {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(start);
    const when = isDateOnly(event.start)
      ? `${day}, ${this.hass.localize("ui.dialogs.more_info_control.calendar.all_day")}`
      : `${day}, ${new Intl.DateTimeFormat(language, {
          hour: "numeric",
          minute: "2-digit",
          hour12: useAmPm(this.hass.locale),
        }).format(start)}`;
    return html`
      <li class="event">
        <span
          class="bar"
          style=${styleMap({ background: event.color ?? "var(--primary-color)" })}
        ></span>
        <span class="text">
          <span class="title">${event.title}</span>
          <span class="when">${when}</span>
        </span>
      </li>
    `;
  }

  private _createEvent() {
    showCalendarEventEditDialog(this, {
      calendarId: this.stateObj!.entity_id,
      updated: () => {
        this._subscribe();
      },
    });
  }

  // The colors are resolved against the theme, so they are computed again
  // when it changes.
  private _computeCalendars = memoizeOne(
    (
      entityId: string,
      color: string | null | undefined,
      _theme: string | undefined,
      _darkMode: boolean | undefined
    ): Calendar[] => [
      {
        entity_id: entityId,
        ...getCalendarColors(color, 0, getComputedStyle(this)),
      },
    ]
  );

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
      h3 {
        margin: 0 0 var(--ha-space-2);
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-medium);
      }
      .section {
        display: block;
      }
      .events {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .event {
        display: flex;
        gap: var(--ha-space-3);
        align-items: stretch;
      }
      .bar {
        flex: none;
        width: 6px;
        border-radius: var(--ha-border-radius-sm, 3px);
      }
      .text {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .title {
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .when {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .status {
        display: flex;
        justify-content: center;
        margin: var(--ha-space-4) 0;
        color: var(--secondary-text-color);
      }
      .actions {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: var(--ha-space-2);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-calendar": MoreInfoCalendar;
  }
}
