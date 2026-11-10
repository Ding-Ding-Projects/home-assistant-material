import { mdiPlay, mdiStop } from "@mdi/js";
import type { HassEvent } from "home-assistant-js-websocket";
import { dump } from "js-yaml";
import type { TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { formatTimeWithSeconds } from "../../../../common/datetime/format_time";
import type { HASSDomTargetEvent } from "../../../../common/dom/fire_event";
import { searchMatcher } from "../../../../common/regex/filter";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import "../../../../components/input/ha-input-search";
import type { HaInput } from "../../../../components/input/ha-input";
import type { HomeAssistant } from "../../../../types";

const MAX_BUFFERED_EVENTS = 50;

interface SubscribedEvent {
  id: number;
  event: HassEvent;
}

// The text shown for an event is built once, not on every update
const yamlCache = new WeakMap<HassEvent, string>();

const eventYaml = (event: HassEvent): string => {
  let text = yamlCache.get(event);
  if (text === undefined) {
    try {
      text = dump(event, { indent: 2, noRefs: true }).trimEnd();
    } catch (_err) {
      text = JSON.stringify(event, null, 2);
    }
    yamlCache.set(event, text);
  }
  return text;
};

@customElement("event-subscribe-card")
class EventSubscribeCard extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public selectedEventType = "";

  @state() private _eventType = "";

  @state() private _subscribed?: () => void;

  @state() private _eventFilter = "";

  @state() private _events: SubscribedEvent[] = [];

  @state() private _error?: string;

  private _eventCount = 0;

  @state() _ignoredEventsCount = 0;

  public disconnectedCallback() {
    super.disconnectedCallback();
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
    }
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    super.willUpdate(changedProperties);

    if (
      changedProperties.has("selectedEventType") &&
      this.selectedEventType &&
      !this._subscribed
    ) {
      this._eventType = this.selectedEventType;
    }
  }

  protected render(): TemplateResult {
    const localize = this.hass!.localize;
    const listening = this._subscribed !== undefined;
    return html`
      <section class="card">
        <div class="header">
          <h2>
            ${
              listening
                ? localize(
                    "ui.panel.config.tools.tabs.events.listening_title",
                    {
                      type: this._eventType,
                    }
                  )
                : localize("ui.panel.config.tools.tabs.events.listen_to_events")
            }
          </h2>
          ${
            listening
              ? html`<span class="live">
                  <span class="dot"></span>
                  ${localize("ui.panel.config.tools.tabs.events.live")}
                </span>`
              : nothing
          }
          <ha-button
            appearance=${listening ? "outlined" : "accent"}
            .disabled=${this._eventType === ""}
            @click=${this._startOrStopListening}
          >
            <ha-svg-icon
              slot="start"
              .path=${listening ? mdiStop : mdiPlay}
            ></ha-svg-icon>
            ${
              listening
                ? localize("ui.panel.config.tools.tabs.events.stop_listening")
                : localize("ui.panel.config.tools.tabs.events.start_listening")
            }
          </ha-button>
        </div>
        <div class="inputs">
          <ha-input
            .label=${
              listening
                ? localize("ui.panel.config.tools.tabs.events.type")
                : localize("ui.panel.config.tools.tabs.events.subscribe_to")
            }
            .disabled=${listening}
            .value=${this._eventType}
            @input=${this._valueChanged}
          ></ha-input>
          <ha-input-search
            .label=${localize(
              "ui.panel.config.tools.tabs.events.only_if_contains"
            )}
            .value=${this._eventFilter}
            .disabled=${listening}
            .hint=${localize("ui.panel.config.tools.tabs.events.filter_helper")}
            @input=${this._filterChanged}
          ></ha-input-search>
        </div>
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${this._renderEvents(listening)}
        <div class="footer">
          <p class="hint">
            ${
              this._events.length
                ? localize("ui.panel.config.tools.tabs.events.events_shown", {
                    count: this._events.length,
                    max: MAX_BUFFERED_EVENTS,
                  })
                : nothing
            }
            ${
              this._ignoredEventsCount
                ? localize("ui.panel.config.tools.tabs.events.filter_ignored", {
                    count: this._ignoredEventsCount,
                  })
                : nothing
            }
          </p>
          <ha-button
            appearance="plain"
            size="small"
            .disabled=${!this._events.length && !this._ignoredEventsCount}
            @click=${this._clearEvents}
          >
            ${localize("ui.panel.config.tools.tabs.events.clear_events")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderEvents(listening: boolean): TemplateResult {
    if (!this._events.length) {
      return html`<div class="empty-state">
        ${
          listening
            ? this.hass!.localize(
                "ui.panel.config.tools.tabs.events.waiting_for_events"
              )
            : this.hass!.localize(
                "ui.panel.config.tools.tabs.events.subscribe_prompt"
              )
        }
      </div>`;
    }
    return html`
      <ul class="events">
        ${repeat(
          this._events,
          (item) => item.id,
          (item) => html`
            <li class="event">
              <div class="event-head">
                <span class="event-type">${item.event.event_type}</span>
                <span class="event-time">
                  ${formatTimeWithSeconds(
                    new Date(item.event.time_fired),
                    this.hass!.locale,
                    this.hass!.config
                  )}
                </span>
              </div>
              <pre class="event-body">${eventYaml(item.event)}</pre>
            </li>
          `
        )}
      </ul>
    `;
  }

  private _valueChanged(ev: HASSDomTargetEvent<HaInput>) {
    this._eventType = ev.target.value ?? "";
    this._error = undefined;
  }

  private _filterChanged(ev: HASSDomTargetEvent<HaInput>) {
    this._eventFilter = ev.target.value ?? "";
  }

  private _testEventFilter(event: HassEvent): boolean {
    if (!this._eventFilter) {
      return true;
    }

    // Plain text is looked for in every key and value; /pattern/flags is a
    // regular expression tested against each of them as written.
    const matches = searchMatcher(this._eventFilter);

    function visit(node: unknown) {
      // Handle primitives directly
      if (node === null || typeof node !== "object") {
        return matches(String(node));
      }

      // Handle arrays and plain objects
      for (const key in node) {
        if (!Object.prototype.hasOwnProperty.call(node, key)) continue;
        // Check key
        if (matches(key)) return true;

        const value = node[key];

        // Check primitive value
        if (value === null || typeof value !== "object") {
          if (matches(String(value))) return true;
        } else if (visit(value)) {
          // Recurse into nested object/array
          return true;
        }
      }

      return false;
    }

    return visit(event);
  }

  private async _startOrStopListening(): Promise<void> {
    if (this._subscribed) {
      this._subscribed();
      this._subscribed = undefined;
      this._error = undefined;
    } else {
      try {
        this._subscribed =
          await this.hass!.connection.subscribeEvents<HassEvent>((event) => {
            if (!this._testEventFilter(event)) {
              this._ignoredEventsCount++;
              return;
            }
            const tail =
              this._events.length >= MAX_BUFFERED_EVENTS
                ? this._events.slice(0, MAX_BUFFERED_EVENTS - 1)
                : this._events;
            const id = this._eventCount++;
            this._events = [
              {
                event,
                id,
              },
              ...tail,
            ];
          }, this._eventType);
      } catch (error) {
        this._error = this.hass!.localize(
          "ui.panel.config.tools.tabs.events.subscribe_failed",
          {
            error:
              error instanceof Error
                ? error.message
                : this.hass!.localize(
                    "ui.panel.config.tools.tabs.events.unknown_error"
                  ),
          }
        );
      }
    }
  }

  private _clearEvents() {
    this._events = [];
    this._eventCount = 0;
    this._ignoredEventsCount = 0;
    this._error = undefined;
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
    }

    .card {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
    }

    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
    }

    h2 {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }

    .live {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }

    .dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success-color);
    }

    .inputs {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-3);
    }

    .inputs > * {
      flex: 1;
      min-width: 200px;
    }

    .events {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      max-height: 560px;
      overflow-y: auto;
    }

    :host([narrow]) .events {
      max-height: none;
    }

    .event-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-2);
    }

    .event-type {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }

    .event-time {
      flex: none;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }

    .event-body {
      margin: 0;
      padding: var(--ha-space-3) var(--ha-space-4);
      max-height: 260px;
      overflow: auto;
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      direction: ltr;
    }

    .empty-state {
      padding: var(--ha-space-8) var(--ha-space-4);
      color: var(--secondary-text-color);
      text-align: center;
      line-height: var(--ha-line-height-normal);
    }

    .footer {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
    }

    .hint {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "event-subscribe-card": EventSubscribeCard;
  }
}
