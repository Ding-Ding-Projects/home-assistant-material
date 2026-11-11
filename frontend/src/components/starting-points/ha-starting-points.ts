import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-svg-icon";

export interface StartingPoint {
  /** Stable identifier, given back when the card is chosen. */
  id: string;
  title: string;
  /** One line that says what choosing it does. */
  description: string;
  /** An icon path. */
  icon: string;
}

export interface StartingPointSelectedDetail {
  id: string;
}

/**
 * Cards that offer ways to begin when an editor is empty. Each card has an
 * icon, a title and one line. The owner decides what choosing a card does and
 * must make it through the editor's own normal path; this component only lists
 * the choices and reports the one picked.
 *
 * @fires starting-point-selected - `{ id }`
 */
@customElement("ha-starting-points")
export class HaStartingPoints extends LitElement {
  @property({ attribute: false }) public items: StartingPoint[] = [];

  /** A line above the cards that says what they are for. */
  @property() public heading?: string;

  /** Set to give the group a name for assistive technology when there is no heading. */
  @property() public label?: string;

  protected render() {
    if (!this.items.length) {
      return nothing;
    }
    return html`
      ${this.heading ? html`<p class="heading">${this.heading}</p>` : nothing}
      <div
        class="cards"
        role="list"
        aria-label=${this.label ?? this.heading ?? ""}
      >
        ${this.items.map(
          (item) =>
            html`<div role="listitem">
              <button
                type="button"
                class="card"
                data-id=${item.id}
                @click=${this._select}
              >
                <span class="icon" aria-hidden="true">
                  <ha-svg-icon .path=${item.icon}></ha-svg-icon>
                </span>
                <span class="text">
                  <span class="title">${item.title}</span>
                  <span class="description">${item.description}</span>
                </span>
              </button>
            </div>`
        )}
      </div>
    `;
  }

  private _select(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    if (id) {
      fireEvent(this, "starting-point-selected", { id });
    }
  }

  static styles = css`
    :host {
      display: block;
    }
    .heading {
      margin: 0 0 var(--ha-space-3, 12px);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .cards {
      margin: 0;
      padding: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 200px), 1fr));
      gap: var(--ha-space-3, 12px);
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-3, 12px);
      width: 100%;
      min-height: 44px;
      height: 100%;
      box-sizing: border-box;
      padding: var(--ha-space-4, 16px);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .card:hover {
      border-color: var(--primary-color);
    }
    .card:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--card-background-color, var(--primary-background-color));
      color: var(--primary-color);
    }
    .text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1, 4px);
      min-width: 0;
    }
    .title {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .description {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
      overflow-wrap: anywhere;
    }
    @media (prefers-reduced-motion: no-preference) {
      .card {
        transition: border-color var(--ha-animation-duration-fast, 150ms)
          ease-out;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-starting-points": HaStartingPoints;
  }

  interface HASSDomEvents {
    "starting-point-selected": StartingPointSelectedDetail;
  }
}
