import { mdiAlertCircleOutline } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { getHistoryState, goBack } from "../common/navigate";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-button";
import "../components/ha-top-app-bar-fixed";
import type { HomeAssistant } from "../types";
import { reloadForUpdate } from "../util/recover-stale-build";
import "../components/ha-svg-icon";

@customElement("hass-error-screen")
class HassErrorScreen extends LitElement {
  // Fallback for the custom panel iframe, which has no context provider
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state()
  @consumeLocalize()
  private _localize?: LocalizeFunc;

  @property({ type: Boolean }) public toolbar = true;

  @property({ type: Boolean }) public rootnav = false;

  @property({ type: Boolean }) public narrow = false;

  @property() public error?: string;

  @property({ type: Boolean, attribute: "show-reload" }) public showReload =
    false;

  protected render(): TemplateResult {
    if (!this.toolbar) {
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
    // Inline as this._localize once the custom panel iframe provides contexts
    const localize = this._localize ?? this.hass?.localize;
    const title = localize?.("ui.status_screens.error_title") || "";
    return html`
      <div class="content">
        ${
          title || this.error
            ? html`<div class="panel" role="alert">
                <div class="tile">
                  <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
                </div>
                ${title ? html`<h2 class="title">${title}</h2>` : nothing}
                ${
                  this.error
                    ? html`<div class="message">${this.error}</div>`
                    : nothing
                }
              </div>`
            : nothing
        }
        <slot>
          ${
            this.showReload
              ? html`
                  <ha-button
                    appearance="filled"
                    size="s"
                    @click=${this._handleReload}
                  >
                    ${localize?.("ui.common.refresh")}
                  </ha-button>
                `
              : nothing
          }
          <ha-button appearance="plain" size="s" @click=${this._handleBack}>
            ${localize?.("ui.common.back")}
          </ha-button>
        </slot>
      </div>
    `;
  }

  private _handleBack(): void {
    goBack();
  }

  private _handleReload(): void {
    // Dirty-aware: reloads when clean, or defers with a toast when an editor
    // has unsaved changes.
    reloadForUpdate();
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        :host {
          display: block;
          height: 100%;
          background-color: var(--primary-background-color);
        }
        .content {
          color: var(--primary-text-color);
          height: 100%;
          display: flex;
          padding: 16px;
          align-items: center;
          justify-content: center;
          flex-direction: column;
          box-sizing: border-box;
        }
        a {
          color: var(--primary-color);
        }
        .panel {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--ha-space-2);
          max-width: 480px;
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--ha-color-fill-danger-quiet-resting);
          color: var(--ha-color-on-danger-quiet);
          text-align: center;
        }
        .tile {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 88px;
          height: 88px;
          margin-bottom: var(--ha-space-3);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
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
          font-weight: var(
            --ha-font-weight-semibold,
            var(--ha-font-weight-medium)
          );
          letter-spacing: -0.01em;
        }
        .message {
          overflow-wrap: anywhere;
        }
        .message a {
          color: inherit;
        }
        ha-button {
          min-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-error-screen": HassErrorScreen;
  }
}
