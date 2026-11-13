import type { TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import type { HomeAssistant, Route } from "../../../types";
import "./ha-config-performance-cache";
import "./ha-config-performance-load";

/**
 * Settings, System, Performance: why a dashboard was slow to open on this
 * device, and the health of the offline copy of the app (its own page).
 */
@customElement("ha-config-section-performance")
class HaConfigSectionPerformance extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route?: Route;

  protected render(): TemplateResult {
    return this.route?.path.startsWith("/cache")
      ? html`<ha-config-performance-cache
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-config-performance-cache>`
      : html`<ha-config-performance-load
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></ha-config-performance-load>`;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-performance": HaConfigSectionPerformance;
  }
}
