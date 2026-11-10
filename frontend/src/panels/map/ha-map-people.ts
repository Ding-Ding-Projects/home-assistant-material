import { mdiChevronRight } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { formatShortDateTime } from "../../common/datetime/format_date_time";
import { formatTime } from "../../common/datetime/format_time";
import { fireEvent } from "../../common/dom/fire_event";
import { computeStateName } from "../../common/entity/compute_state_name";
import "../../components/ha-svg-icon";
import type { HomeAssistant } from "../../types";

/**
 * "Where everyone is": one row for each person, with where they are and for
 * how long. A row opens the person's own dialog.
 */
@customElement("ha-map-people")
export class HaMapPeople extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _people = memoizeOne((states: HomeAssistant["states"]) =>
    Object.values(states)
      .filter((stateObj) => stateObj.entity_id.startsWith("person."))
      .sort((a, b) => computeStateName(a).localeCompare(computeStateName(b)))
  );

  protected render() {
    const people = this._people(this.hass.states);
    if (!people.length) {
      return nothing;
    }
    return html`
      <section
        aria-label=${this.hass.localize("ui.panel.map.where_everyone_is")}
      >
        <h2>${this.hass.localize("ui.panel.map.where_everyone_is")}</h2>
        <ul>
          ${people.map((person) => this._renderPerson(person))}
        </ul>
      </section>
    `;
  }

  private _renderPerson(person: HassEntity) {
    const name = computeStateName(person);
    const picture = person.attributes.entity_picture as string | undefined;
    return html`<li>
      <button
        type="button"
        data-entity=${person.entity_id}
        @click=${this._open}
      >
        <span class="avatar">
          ${
            picture
              ? html`<img src=${picture} alt="" />`
              : name.charAt(0).toLocaleUpperCase(this.hass.locale.language)
          }
        </span>
        <span class="who">
          <span class="name">${name}</span>
          <span class="where">
            ${this.hass.localize("ui.panel.map.state_since", {
              state: this.hass.formatEntityState(person),
              time: this._since(person.last_changed),
            })}
          </span>
        </span>
        <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
      </button>
    </li>`;
  }

  private _since(lastChanged: string): string {
    const date = new Date(lastChanged);
    const today = new Date();
    return date.toDateString() === today.toDateString()
      ? formatTime(date, this.hass.locale, this.hass.config)
      : formatShortDateTime(date, this.hass.locale, this.hass.config);
  }

  private _open(ev: Event): void {
    fireEvent(this, "hass-more-info", {
      entityId: (ev.currentTarget as HTMLElement).dataset.entity!,
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      max-width: 340px;
      max-height: 100%;
      overflow: auto;
    }
    section {
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-box-shadow-l, 0 2px 8px rgba(0, 0, 0, 0.2));
    }
    h2 {
      margin: 0 0 var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    ul {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    button {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      padding: var(--ha-space-2);
      border: none;
      border-radius: var(--ha-border-radius-xl);
      background: none;
      color: inherit;
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 1px;
    }
    .avatar {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      overflow: hidden;
      border-radius: 50%;
      background: color-mix(
        in srgb,
        var(--primary-color) 22%,
        var(--primary-background-color)
      );
      font-weight: var(--ha-font-weight-medium);
    }
    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .who {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
    }
    .where {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    @media (max-width: 600px) {
      :host {
        max-width: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-map-people": HaMapPeople;
  }
}
