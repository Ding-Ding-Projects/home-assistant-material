import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { navigate } from "../../../common/navigate";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import type { EnergyPreferences } from "../../../data/energy";
import { getEnergyPreferences } from "../../../data/energy";
import type { HomeAssistant } from "../../../types";
import "../../lovelace/header-footer/hui-graph-header-footer";
import { powerSensor } from "../power-sensor";

/**
 * "Power right now" on the Home page: the reading of the sensor the energy
 * setup names for the home (or the grid), and its last 24 hours. It shows
 * nothing when the home has no such sensor.
 */
@customElement("ha-home-power-tile")
export class HaHomePowerTile extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _prefs?: EnergyPreferences;

  private _asked = false;

  protected willUpdate(): void {
    if (this._asked || !this.hass) {
      return;
    }
    this._asked = true;
    if (!isComponentLoaded(this.hass.config, "energy")) {
      return;
    }
    getEnergyPreferences(this.hass.callWS).then(
      (prefs) => {
        this._prefs = prefs;
      },
      () => {
        // A person who cannot read the energy setup simply gets no tile.
      }
    );
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this._prefs) {
      return nothing;
    }
    const entityId = powerSensor(this._prefs, this.hass.states);
    if (!entityId) {
      return nothing;
    }
    const stateObj = this.hass.states[entityId] as HassEntity;
    const localize = this.hass.localize;
    return html`
      <button type="button" class="power" @click=${this._open}>
        <span class="top">
          <span class="label">
            ${localize("ui.panel.lovelace.cards.home_hero.power")}
          </span>
          <span class="live">
            ${localize("ui.panel.lovelace.cards.home_hero.live")}
          </span>
        </span>
        <span class="big">${this.hass.formatEntityState(stateObj)}</span>
        <hui-graph-header-footer
          .hass=${this.hass}
          type="footer"
          .config=${{ type: "graph", entity: entityId, hours_to_show: 24 }}
          @click=${this._stop}
        ></hui-graph-header-footer>
      </button>
    `;
  }

  private _stop(ev: Event): void {
    // The graph opens the sensor's own dialog; the tile opens the energy page.
    ev.stopPropagation();
  }

  private _open(): void {
    navigate("/energy?historyBack=1");
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .power {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      width: 100%;
      height: 100%;
      box-sizing: border-box;
      padding: var(--ha-space-5);
      border: none;
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      cursor: pointer;
    }
    .power:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .top {
      display: flex;
      justify-content: space-between;
      gap: var(--ha-space-3);
      font-size: var(--ha-font-size-m);
      color: var(--secondary-text-color);
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
    }
    .live::before {
      content: "";
      display: inline-block;
      width: 8px;
      height: 8px;
      margin-inline-end: var(--ha-space-1);
      border-radius: 50%;
      background: var(--success-color);
    }
    .big {
      font-family: var(--ha-font-family-heading, inherit);
      font-size: clamp(32px, 4vw, 48px);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.05;
      letter-spacing: -0.02em;
    }
    hui-graph-header-footer {
      margin-top: auto;
      --graph-color: var(--primary-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-home-power-tile": HaHomePowerTile;
  }
}
