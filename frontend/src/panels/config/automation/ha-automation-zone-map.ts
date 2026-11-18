import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/map/ha-map";
import type { HomeAssistant } from "../../../types";

/** A small map of one zone, shown under the zone picker of a trigger or condition. */
@customElement("ha-automation-zone-map")
export class HaAutomationZoneMap extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public zone?: string;

  protected render() {
    const stateObj = this.zone ? this.hass.states[this.zone] : undefined;
    if (
      !this.zone ||
      !this.zone.startsWith("zone.") ||
      typeof stateObj?.attributes.latitude !== "number" ||
      typeof stateObj?.attributes.longitude !== "number"
    ) {
      return nothing;
    }
    return html`<ha-map
      .hass=${this.hass}
      .entities=${[this.zone]}
      .zoom=${14}
      .autoFit=${true}
      .fitZones=${true}
      .themeMode=${"auto"}
      .renderPassive=${false}
      .interactiveZones=${false}
      aria-label=${this.hass.formatEntityName(stateObj) || this.zone}
    ></ha-map>`;
  }

  static styles = css`
    :host {
      display: block;
    }
    ha-map {
      display: block;
      height: 160px;
      border-radius: var(--ha-border-radius-lg);
      overflow: hidden;
      margin-bottom: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-zone-map": HaAutomationZoneMap;
  }
}
