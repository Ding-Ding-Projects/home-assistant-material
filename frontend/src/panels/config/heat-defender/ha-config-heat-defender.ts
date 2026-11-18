import { customElement, property } from "lit/decorators";
import { html, LitElement } from "lit";
import type { HomeAssistant } from "../../../types";
import "../ac-defender/ha-defender-page";

@customElement("ha-config-heat-defender")
class HaConfigHeatDefender extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  protected render() {
    return html`<ha-defender-page
      .hass=${this.hass}
      .narrow=${this.narrow}
      direction="heat"
    ></ha-defender-page>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-heat-defender": HaConfigHeatDefender;
  }
}
