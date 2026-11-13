import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/appearance/ha-motion-editor";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";

/** Personal settings, Motion: the animation and transition editor. */
@customElement("ha-config-section-motion")
export class HaConfigSectionMotion extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  protected render() {
    const t = (key: string) =>
      this.hass.localize(`ui.panel.config.motion_editor.${key}` as any);
    return html`
      <hass-subpage
        back-path="/config/personal"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${t("title")}
      >
        <div class="content">
          <p class="summary">${t("summary")}</p>
          <ha-motion-editor
            .hass=${this.hass}
            .narrow=${this.narrow}
          ></ha-motion-editor>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .content {
      padding: var(--ha-space-5) var(--ha-space-5) var(--ha-space-8);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
    .summary {
      margin: 0;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-motion": HaConfigSectionMotion;
  }
}
