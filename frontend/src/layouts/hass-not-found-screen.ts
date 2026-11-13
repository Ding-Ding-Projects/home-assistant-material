import { mdiMagnify, mdiMapMarkerQuestion } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { navigate } from "../common/navigate";
import "../components/ha-button";
import "../components/ha-svg-icon";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant } from "../types";

/** Card shown when an address resolves to no page. */
@customElement("hass-not-found-screen")
class HassNotFoundScreen extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Address that led nowhere; defaults to the current path. */
  @property() public path?: string;

  protected render(): TemplateResult {
    const localize = this.hass.localize;
    const path = this.path ?? location.pathname;
    return html`
      <div class="content">
        <div class="panel" role="alert">
          <div class="tile">
            <ha-svg-icon .path=${mdiMapMarkerQuestion}></ha-svg-icon>
          </div>
          <h2 class="title">
            ${localize("ui.status_screens.not_found_title")}
          </h2>
          <div class="message">
            ${localize("ui.status_screens.not_found_message", { path })}
          </div>
          <div class="actions">
            <ha-button appearance="filled" @click=${this._goHome}>
              ${localize("ui.status_screens.go_home")}
            </ha-button>
            <ha-button appearance="outlined" @click=${this._search}>
              <ha-svg-icon slot="start" .path=${mdiMagnify}></ha-svg-icon>
              ${localize("ui.status_screens.search_pages")}
            </ha-button>
          </div>
        </div>
      </div>
    `;
  }

  private _goHome(): void {
    navigate("/");
  }

  private _search(): void {
    showQuickBar(this, { mode: "navigate" });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      height: 100%;
      background-color: var(--primary-background-color);
    }
    .content {
      color: var(--primary-text-color);
      height: 100%;
      display: flex;
      padding: var(--ha-space-4);
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
    }
    .panel {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      max-width: 480px;
      padding: var(--ha-space-6);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      box-shadow: var(--ha-shadow-card);
      text-align: center;
    }
    /* A rounded tile that floats a little (not under reduced motion). */
    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 88px;
      height: 88px;
      margin-bottom: var(--ha-space-3);
      border-radius: var(--ha-border-radius-3xl);
      background: linear-gradient(
        135deg,
        var(--ha-color-primary-container),
        var(--ha-color-tertiary-container, var(--ha-color-primary-container))
      );
      color: var(--ha-color-on-primary-container);
      --mdc-icon-size: 44px;
      animation: float 4s ease-in-out infinite;
    }
    @keyframes float {
      50% {
        transform: translateY(-6px);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .tile {
        animation: none;
      }
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-semibold, var(--ha-font-weight-medium));
      letter-spacing: -0.01em;
    }
    .message {
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ha-space-2);
      margin-top: var(--ha-space-2);
    }
    ha-button {
      min-height: 44px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-not-found-screen": HassNotFoundScreen;
  }
}
