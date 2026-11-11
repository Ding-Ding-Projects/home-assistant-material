import { sanitizeUrl } from "@braintree/sanitize-url";
import {
  mdiAlertCircleOutline,
  mdiContentCopy,
  mdiInformationOutline,
  mdiOpenInNew,
  mdiRefresh,
} from "@mdi/js";
import { html, css, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { keyed } from "lit/directives/keyed";
import "../../components/ha-button";
import "../../components/ha-icon-button";
import "../../components/ha-svg-icon";
import "../../layouts/hass-error-screen";
import "../../layouts/hass-subpage";
import type { HomeAssistant, PanelInfo } from "../../types";
import { IFRAME_SANDBOX } from "../../util/iframe";
import { isOwnOrigin, resolveAddress } from "./iframe-address";

// How long a page may take to report that it loaded before the notice shows
const LOAD_TIMEOUT_MS = 10000;

@customElement("ha-panel-iframe")
class HaPanelIframe extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) panel!: PanelInfo<{ url: string }>;

  // Changing it draws a new frame, which loads the page again
  @state() private _reloadKey = 0;

  @state() private _notShown = false;

  @state() private _copyState?: "copied" | "failed";

  private _loadTimer?: number;

  private _copyTimer?: number;

  private _text(key: string): string {
    return this.hass.localize(`ui.panel.iframe.${key}` as any);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.clearTimeout(this._loadTimer);
    window.clearTimeout(this._copyTimer);
  }

  protected willUpdate(changed: Map<PropertyKey, unknown>) {
    if (changed.has("panel")) {
      this._notShown = false;
    }
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has("_reloadKey") || changed.has("panel")) {
      this._armTimer();
    }
  }

  private _armTimer() {
    window.clearTimeout(this._loadTimer);
    this._loadTimer = window.setTimeout(() => {
      // No answer in time: the page may be refusing to be framed
      this._notShown = true;
    }, LOAD_TIMEOUT_MS);
  }

  private _loaded(ev: Event) {
    window.clearTimeout(this._loadTimer);
    this._notShown = false;
    const frame = ev.currentTarget as HTMLIFrameElement;
    if (!this._isOwn) {
      // A page on another origin cannot be inspected; nothing more can be
      // told honestly than that it answered
      return;
    }
    // The sandbox allows the same origin, so a page of this instance is
    // readable. A frame that was refused shows a browser error page that is
    // not readable.
    try {
      if (!frame.contentDocument) {
        this._notShown = true;
      }
    } catch {
      this._notShown = true;
    }
  }

  private get _isOwn(): boolean {
    return isOwnOrigin(this.panel.config.url, location.href);
  }

  private _reload() {
    this._notShown = false;
    this._reloadKey++;
  }

  private _openNewWindow() {
    const url = resolveAddress(this.panel.config.url, location.href);
    if (url && this._isOwn) {
      window.open(url.href, "_blank", "noopener");
    }
  }

  private async _copyAddress() {
    const url = resolveAddress(this.panel.config.url, location.href);
    window.clearTimeout(this._copyTimer);
    try {
      await navigator.clipboard.writeText(url?.href ?? this.panel.config.url);
      this._copyState = "copied";
    } catch {
      this._copyState = "failed";
    }
    this._copyTimer = window.setTimeout(() => {
      this._copyState = undefined;
    }, 4000);
  }

  render() {
    // The sandbox keeps allow-same-origin, so a javascript: URL would run in
    // the frontend's own origin
    if (sanitizeUrl(this.panel.config.url) === "about:blank") {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
          error="Unable to load iframes with this URL."
          rootnav
        ></hass-error-screen>
      `;
    }

    if (
      location.protocol === "https:" &&
      new URL(this.panel.config.url, location.toString()).protocol !== "https:"
    ) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
          error="Unable to load iframes that load websites over http:// if Home Assistant is served over https://."
          rootnav
        ></hass-error-screen>
      `;
    }

    const own = this._isOwn;
    const address =
      resolveAddress(this.panel.config.url, location.href)?.href ??
      this.panel.config.url;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.panel.title}
        main-page
      >
        ${
          own
            ? html`<ha-button
                slot="toolbar-icon"
                appearance="plain"
                @click=${this._openNewWindow}
              >
                <ha-svg-icon slot="start" .path=${mdiOpenInNew}></ha-svg-icon>
                ${this._text("open_new_window")}
              </ha-button>`
            : nothing
        }
        <ha-icon-button
          slot="toolbar-icon"
          .path=${mdiRefresh}
          .label=${this._text("reload")}
          @click=${this._reload}
        ></ha-icon-button>
        <div class="wrap">
          ${
            own
              ? nothing
              : html`<div class="address-row">
                  <span class="address-label">${this._text("address")}</span>
                  <code class="address">${address}</code>
                  <ha-icon-button
                    .path=${mdiContentCopy}
                    .label=${this._text("copy_address")}
                    @click=${this._copyAddress}
                  ></ha-icon-button>
                  <span class="copy-status" role="status">
                    ${
                      this._copyState
                        ? this._text(
                            this._copyState === "copied"
                              ? "copied"
                              : "copy_failed"
                          )
                        : nothing
                    }
                  </span>
                </div>`
          }
          ${
            this._notShown
              ? html`<div class="notice warn" role="status">
                  <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
                  <span>
                    ${this._text("not_shown")}
                    ${this._text(own ? "not_shown_open" : "not_shown_outside")}
                  </span>
                </div>`
              : nothing
          }
          ${keyed(
            this._reloadKey,
            html`<iframe
              title=${ifDefined(
                this.panel.title === null ? undefined : this.panel.title
              )}
              src=${this.panel.config.url}
              .sandbox=${IFRAME_SANDBOX}
              allow="fullscreen"
              @load=${this._loaded}
            ></iframe>`
          )}
          <div class="notice">
            <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
            <span>${this._text("intro")}</span>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  static styles = css`
    .wrap {
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
    }
    /* Fill hass-subpage's content box, which already excludes the safe-area
       insets (see hass-subpage .content), instead of positioning absolutely
       and spilling into the bottom/side insets. */
    iframe {
      border: 0;
      display: block;
      width: 100%;
      flex: 1 1 auto;
      min-height: 0;
      background-color: var(--primary-background-color);
    }
    .address-row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2, 8px);
      padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px);
      background: var(--secondary-background-color);
    }
    .address-label {
      color: var(--secondary-text-color);
    }
    .address {
      flex: 1 1 200px;
      min-width: 0;
      overflow-wrap: anywhere;
      font-family: var(--ha-font-family-code, monospace);
    }
    .copy-status {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .notice {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3, 12px);
      padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .notice.warn {
      color: var(--primary-text-color);
    }
    .notice ha-svg-icon {
      flex: 0 0 auto;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-iframe": HaPanelIframe;
  }
}
