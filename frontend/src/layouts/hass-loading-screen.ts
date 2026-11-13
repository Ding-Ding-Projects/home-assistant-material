import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { getHistoryState } from "../common/navigate";
import "../components/animation/ha-fade-in";
import "../components/ha-top-app-bar-fixed";
import "../components/skeleton/ha-skeleton";
import type { HomeAssistant } from "../types";

@customElement("hass-loading-screen")
class HassLoadingScreen extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ type: Boolean, attribute: "no-toolbar" })
  public noToolbar = false;

  @property({ type: Boolean }) public rootnav = false;

  @property({ type: Boolean }) public narrow = false;

  @property() public message?: string;

  protected render(): TemplateResult {
    if (this.noToolbar) {
      return this._renderContent();
    }

    return html`
      <ha-top-app-bar-fixed
        no-page-tools
        .narrow=${this.narrow}
        .backButton=${!(this.rootnav || getHistoryState()?.root)}
      >
        ${this._renderContent()}
      </ha-top-app-bar-fixed>
    `;
  }

  private _renderContent(): TemplateResult {
    return html`
      <div
        class="content"
        role="status"
        aria-live="polite"
        aria-label=${
          this.hass?.localize("ui.status_screens.loading_title") ?? nothing
        }
      >
        <ha-fade-in .delay=${500}>
          <div class="placeholder" aria-hidden="true">
            <ha-skeleton effect="sheen"></ha-skeleton>
            <ha-skeleton effect="sheen"></ha-skeleton>
            <div class="blocks">
              <ha-skeleton effect="sheen"></ha-skeleton>
              <ha-skeleton effect="sheen"></ha-skeleton>
              <ha-skeleton effect="sheen"></ha-skeleton>
              <ha-skeleton effect="sheen"></ha-skeleton>
            </div>
            <ha-skeleton effect="sheen"></ha-skeleton>
          </div>
        </ha-fade-in>
        ${
          this.message
            ? html`<div id="loading-text">${this.message}</div>`
            : nothing
        }
      </div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      height: 100%;
      background-color: var(--primary-background-color);
    }
    .content {
      height: 100%;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    /* Shimmering placeholders in a card: the shape of a page that is coming. */
    .placeholder {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      box-sizing: border-box;
      width: min(360px, calc(100vw - 32px));
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      box-shadow: var(--ha-shadow-card);
      --ha-skeleton-border-radius: var(--ha-border-radius-pill);
    }
    .placeholder > ha-skeleton {
      height: 12px;
    }
    .blocks {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--ha-space-3);
    }
    .blocks ha-skeleton {
      height: 88px;
      --ha-skeleton-border-radius: var(--ha-border-radius-xl);
    }
    #loading-text {
      max-width: 350px;
      margin-top: var(--ha-space-4);
      text-align: center;
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-loading-screen": HassLoadingScreen;
  }
}
