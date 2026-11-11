import { mdiViewDashboardEditOutline } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import type { ViewAddContentMode } from "./view-add-content";

declare global {
  interface HASSDomEvents {
    "view-add-content-action": { mode: Exclude<ViewAddContentMode, "none"> };
  }
}

/**
 * Shown at the top of a view in edit mode when the view has no way of its own
 * to add cards, sections or badges. It says why and offers the action that
 * makes adding possible. It sits at the top, never at the bottom, so it is not
 * pushed under the phone bar or out of reach on a long page.
 */
@customElement("hui-view-add-content-notice")
export class HuiViewAddContentNotice extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public mode: ViewAddContentMode = "none";

  protected render(): TemplateResult | typeof nothing {
    if (this.mode === "none") {
      return nothing;
    }
    const key =
      this.mode === "convert" ? "add_content_panel" : "add_content_strategy";
    return html`
      <div class="notice" role="note">
        <ha-svg-icon .path=${mdiViewDashboardEditOutline}></ha-svg-icon>
        <p>
          ${this.hass.localize(
            `ui.panel.lovelace.editor.edit_view.${key}_notice`
          )}
        </p>
        <ha-button size="l" @click=${this._handleClick}>
          ${this.hass.localize(
            `ui.panel.lovelace.editor.edit_view.${key}_action`
          )}
        </ha-button>
      </div>
    `;
  }

  private _handleClick() {
    if (this.mode === "none") {
      return;
    }
    fireEvent(this, "view-add-content-action", { mode: this.mode });
  }

  static styles = css`
    :host {
      display: block;
      flex: 0 0 auto;
    }
    .notice {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
      margin: var(--ha-space-2);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      background: var(--ha-color-fill-primary-quiet-resting);
      color: var(--primary-text-color);
      border: 1px dashed var(--primary-color);
    }
    ha-svg-icon {
      flex: 0 0 auto;
      color: var(--primary-color);
    }
    p {
      flex: 1 1 200px;
      margin: 0;
      min-width: 0;
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    ha-button {
      flex: 0 0 auto;
      min-height: 44px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-view-add-content-notice": HuiViewAddContentNotice;
  }
}
