import { mdiAlertCircleOutline, mdiProgressClock } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import type { LocalizeFunc } from "../common/translations/localize";
import "../components/ha-button";
import "../components/ha-svg-icon";

@customElement("ha-init-page")
export class HaInitPage extends LitElement {
  @property({ type: Boolean }) public error = false;

  @property({ type: Boolean }) public migration = false;

  @property({ attribute: false }) public localize?: LocalizeFunc;

  @state() private _retryInSeconds = 60;

  private _retryInterval?: number;

  protected render() {
    return this.error ? this._renderError() : this._renderLoading();
  }

  private _renderError() {
    return html`
      <div class="card error" role="alert">
        <div class="tile">
          <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
        </div>
        <h2 class="title">
          ${
            this.localize?.("ui.init.error.title") ||
            "Unable to connect to Home Assistant."
          }
        </h2>
        <p class="message">
          ${
            this.localize?.("ui.init.error.retrying", {
              seconds: this._retryInSeconds,
            }) || `Retrying in ${this._retryInSeconds} seconds...`
          }
        </p>
        <ha-button size="s" appearance="filled" @click=${this._retry}>
          ${this.localize?.("ui.init.error.retry_now") || "Retry now"}
        </ha-button>
        ${
          location.host.includes("ui.nabu.casa")
            ? html`<p class="message">
                ${
                  this.localize?.("ui.init.error.nabu_casa", {
                    account_link: html`<a href="https://account.nabucasa.com/"
                      >${
                        this.localize?.("ui.init.error.nabu_casa_account") ||
                        "Nabu Casa account page"
                      }</a
                    >`,
                  }) ||
                  html`It is possible that you are seeing this screen because
                    your Home Assistant is not currently connected. You can ask
                    it to come online from your
                    <a href="https://account.nabucasa.com/"
                      >Nabu Casa account page</a
                    >.`
                }
              </p>`
            : nothing
        }
      </div>
    `;
  }

  private _renderLoading() {
    const title =
      this.localize?.("ui.status_screens.starting_title") ||
      "Home Assistant is starting";
    return html`
      <div
        class=${classMap({ card: true, rtl: document.dir === "rtl" })}
        role="status"
        aria-live="polite"
      >
        <div class="tile">
          <ha-svg-icon .path=${mdiProgressClock}></ha-svg-icon>
        </div>
        <h2 class="title">${title}</h2>
        <p class="message">
          ${
            this.migration
              ? html`<span class="migration-text"
                  >${
                    this.localize?.("ui.init.migration") ||
                    "Database upgrade is in progress, Home Assistant will not start until the upgrade is completed.\n\nThe upgrade may need a long time to complete, please be patient."
                  }</span
                >`
              : this.localize?.("ui.init.loading") || "Loading..."
          }
        </p>
        <div class="bar" role="progressbar" aria-label=${title}>
          <div class="indicator"></div>
        </div>
      </div>
    `;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this._retryInterval) {
      clearInterval(this._retryInterval);
    }
  }

  protected firstUpdated() {
    this._retryInterval = window.setInterval(() => {
      if (this._retryInSeconds <= 1) {
        this._retry();
      } else {
        this._retryInSeconds -= 1;
      }
    }, 1000);
  }

  private _retry() {
    if (this._retryInterval) {
      clearInterval(this._retryInterval);
    }
    location.reload();
  }

  static styles = css`
    :host {
      flex: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      box-sizing: border-box;
      max-width: 100%;
      padding: var(--ha-space-4, 16px);
    }
    a {
      color: inherit;
    }
    .card {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      box-sizing: border-box;
      width: 100%;
      max-width: 420px;
      padding: var(--ha-space-6, 24px);
      border-radius: var(--ha-border-radius-3xl, 28px);
      background: var(--card-background-color, #fff);
      color: var(--primary-text-color);
      text-align: center;
    }
    .card.error {
      background: var(--ha-color-fill-danger-quiet-resting, #ffdad6);
      color: var(--ha-color-on-danger-quiet, inherit);
    }
    .tile {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--primary-background-color, #fff);
      color: var(--primary-text-color);
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-xl, 20px);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .message {
      max-width: 350px;
      margin: 0;
      font-size: var(--ha-font-size-m, 14px);
      overflow-wrap: anywhere;
    }
    .card:not(.error) .message {
      color: var(--secondary-text-color);
    }
    ha-button {
      min-height: 44px;
    }
    .migration-text {
      white-space: pre-line;
    }
    .rtl {
      direction: rtl;
    }
    .bar {
      position: relative;
      overflow: hidden;
      width: 220px;
      max-width: 100%;
      height: 6px;
      margin-top: var(--ha-space-2, 8px);
      border-radius: 3px;
      background: var(--divider-color, rgba(0, 0, 0, 0.12));
    }
    .indicator {
      position: absolute;
      inset-block: 0;
      inset-inline-start: 0;
      width: 40%;
      border-radius: 3px;
      background: var(--primary-color);
      animation: slide 1.6s ease-in-out infinite;
    }
    @keyframes slide {
      0% {
        transform: translateX(-100%);
      }
      100% {
        transform: translateX(250%);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .indicator {
        animation: none;
        width: 100%;
        opacity: 0.4;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-init-page": HaInitPage;
  }
}
