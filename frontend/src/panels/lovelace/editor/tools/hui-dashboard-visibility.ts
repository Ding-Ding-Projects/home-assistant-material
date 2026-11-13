import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../../types";
import "../card-editor/hui-card-visibility-editor";

/**
 * Visibility rules of one card. The rules are the card's real `visibility`
 * conditions, edited with the same condition editor the card editor uses, and
 * the live answer comes from the same condition check the dashboard runs.
 */
@customElement("hui-dashboard-visibility")
export class HuiDashboardVisibility extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public card?: LovelaceCardConfig;

  protected render() {
    if (!this.card) {
      return nothing;
    }
    const t = (key: string) =>
      this.hass.localize(
        `ui.panel.lovelace.editor.dashboard_tools.editing.visibility.${key}` as LocalizeKeys
      );
    return html`
      <p class="hint">${t("intro")}</p>
      <hui-card-visibility-editor
        .hass=${this.hass}
        .config=${this.card}
        .entityId=${this.card.entity as string | undefined}
        @value-changed=${this._changed}
      ></hui-card-visibility-editor>
    `;
  }

  private _changed(ev: CustomEvent<{ value: LovelaceCardConfig }>) {
    ev.stopPropagation();
    fireEvent(this, "dashboard-card-change", { card: ev.detail.value });
  }

  static styles = css`
    .hint {
      margin-top: 0;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-visibility": HuiDashboardVisibility;
  }
}
