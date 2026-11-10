import { mdiAccessPoint } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { stringCompare } from "../../../../common/string/compare";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../../types";

interface EventListenerCount {
  event: string;
  listener_count: number;
}

@customElement("events-list")
class EventsList extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public events: EventListenerCount[] = [];

  @state() private _loading = true;

  @state() private _failed = false;

  protected render(): TemplateResult {
    if (this._loading) {
      return html`<div class="state">
        <ha-spinner size="small"></ha-spinner>
      </div>`;
    }
    if (this._failed) {
      return html`<p class="state">
        ${this.hass.localize("ui.panel.config.tools.tabs.events.load_failed")}
      </p>`;
    }
    if (!this.events.length) {
      return html`<p class="state">
        ${this.hass.localize("ui.panel.config.tools.tabs.events.no_listeners")}
      </p>`;
    }
    return html`
      <ul>
        ${this.events.map(
          (event) => html`
            <li>
              <button
                type="button"
                class="row"
                @click=${this._eventSelected}
                .event=${event.event}
              >
                <span class="tile">
                  <ha-svg-icon .path=${mdiAccessPoint}></ha-svg-icon>
                </span>
                <span class="text">
                  <span class="name">${event.event}</span>
                  <span class="count">
                    ${this.hass.localize(
                      "ui.panel.config.tools.tabs.events.listener_count",
                      { count: event.listener_count }
                    )}
                  </span>
                </span>
              </button>
            </li>
          `
        )}
      </ul>
    `;
  }

  protected async firstUpdated() {
    try {
      const events = await this.hass.callApi<EventListenerCount[]>(
        "GET",
        "events"
      );
      this.events = events.sort((e1, e2) =>
        stringCompare(e1.event, e2.event, this.hass.locale.language)
      );
    } catch (_err) {
      this._failed = true;
    } finally {
      this._loading = false;
    }
  }

  private _eventSelected(ev: Event) {
    const event: string = (ev.currentTarget! as any).event;
    fireEvent(this, "event-selected", { eventType: event });
  }

  static styles = css`
    :host {
      display: block;
    }

    ul {
      margin: 0;
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }

    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      width: 100%;
      padding: var(--ha-space-2);
      border: none;
      border-radius: var(--ha-border-radius-xl);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }

    .row:hover,
    .row:focus-visible {
      background: var(--secondary-background-color);
    }

    .tile {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }

    .row:hover .tile,
    .row:focus-visible .tile {
      background: var(--card-background-color);
    }

    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }

    .name {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }

    .count {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }

    .state {
      margin: 0;
      padding: var(--ha-space-2);
      color: var(--secondary-text-color);
      text-align: center;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "events-list": EventsList;
  }
  interface HASSDomEvents {
    "event-selected": { eventType: string };
  }
}
