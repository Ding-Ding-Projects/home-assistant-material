import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import "../../../../components/ha-alert";
import type { ActionConfig } from "../../../../data/lovelace/config/action";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { HomeAssistant } from "../../../../types";
import "../../components/hui-action-editor";
import type { InteractionKey } from "./dashboard-edit";
import { INTERACTION_KEYS, supportsInteractions } from "./dashboard-edit";

/**
 * Tap, hold and double tap of one card, each with its action. These are the
 * card's real `tap_action`, `hold_action` and `double_tap_action`.
 */
@customElement("hui-dashboard-interactions")
export class HuiDashboardInteractions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public card?: LovelaceCardConfig;

  private _t(key: string): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.dashboard_tools.editing.interactions.${key}` as LocalizeKeys
    );
  }

  protected render() {
    if (!this.card) {
      return nothing;
    }
    if (!supportsInteractions(this.card)) {
      return html`<ha-alert alert-type="info"
        >${this._t("unsupported")}</ha-alert
      >`;
    }
    return html`
      <p class="hint">${this._t("intro")}</p>
      <div class="grid">
        ${INTERACTION_KEYS.map(
          (key) =>
            html`<div class="column">
              <h3>${this._t(key)}</h3>
              <hui-action-editor
                .hass=${this.hass}
                .config=${this.card![key] as ActionConfig | undefined}
                .key=${key}
                @value-changed=${this._changed}
              ></hui-action-editor>
            </div>`
        )}
      </div>
    `;
  }

  private _changed(ev: CustomEvent<{ value?: ActionConfig }>) {
    ev.stopPropagation();
    const key = (ev.currentTarget as HTMLElement & { key: InteractionKey }).key;
    const card: LovelaceCardConfig = { ...this.card! };
    if (ev.detail.value) {
      card[key] = ev.detail.value;
    } else {
      delete card[key];
    }
    fireEvent(this, "dashboard-card-change", { card });
  }

  static styles = css`
    .hint {
      margin-top: 0;
      color: var(--secondary-text-color);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--ha-space-3);
    }
    .column {
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
    }
    h3 {
      margin: 0 0 var(--ha-space-3);
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-semibold);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dashboard-interactions": HuiDashboardInteractions;
  }
}
