import { mdiDownload, mdiMagnifyPlusOutline } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import "../../../components/ha-svg-icon";
import {
  connectionContext,
  formattersContext,
  internationalizationContext,
} from "../../../data/context";
import { UNAVAILABLE, UNKNOWN } from "../../../data/entity/entity";
import type { ImageEntity } from "../../../data/image";
import { computeImageUrl } from "../../../data/image";
import type {
  HomeAssistantConnection,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

@customElement("more-info-image")
class MoreInfoImage extends LitElement {
  @state()
  @consume({ context: connectionContext, subscribe: true })
  private _connection?: HomeAssistantConnection;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: HomeAssistantInternationalization;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters?: HomeAssistantFormatters;

  @property({ attribute: false }) public stateObj?: ImageEntity;

  @state() private _loadFailed = false;

  private _loadedUrl?: string;

  protected render() {
    if (!this._connection || !this.stateObj) {
      return nothing;
    }
    const imageUrl = computeImageUrl(this.stateObj);
    if (!imageUrl) {
      return nothing;
    }
    const url = this._connection.hassUrl(imageUrl);
    const name =
      this._formatters?.formatEntityName(this.stateObj) ||
      this.stateObj.entity_id;
    const localize = this._i18n?.localize;
    const unavailable = this.stateObj.state === UNAVAILABLE;
    const taken =
      this.stateObj.state !== UNKNOWN && !unavailable && this._formatters
        ? this._formatters.formatEntityState(this.stateObj)
        : undefined;

    if (unavailable) {
      return html`<div class="stack">
        <p class="notice">
          ${localize?.("ui.dialogs.more_info_control.image.unavailable")}
        </p>
      </div>`;
    }

    return html`
      <div class="stack">
        ${
          this._loadFailed
            ? html`<p class="notice" role="alert">
                ${localize?.("ui.dialogs.more_info_control.image.error")}
              </p>`
            : html`<img alt=${name} src=${url} @error=${this._imageFailed} />`
        }
        ${
          taken && localize
            ? html`<p class="taken">
                ${localize("ui.dialogs.more_info_control.image.taken", {
                  time: taken,
                })}
              </p>`
            : nothing
        }
        ${
          localize
            ? html`<div class="round-buttons">
                <a
                  class="round"
                  href=${url}
                  target="_blank"
                  rel="noopener"
                  aria-label=${localize(
                    "ui.dialogs.more_info_control.image.open_full_size"
                  )}
                >
                  <ha-svg-icon .path=${mdiMagnifyPlusOutline}></ha-svg-icon>
                </a>
                <a
                  class="round"
                  href=${url}
                  download
                  aria-label=${localize("ui.common.download")}
                >
                  <ha-svg-icon .path=${mdiDownload}></ha-svg-icon>
                </a>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    if (changedProps.has("stateObj")) {
      const url = this.stateObj ? computeImageUrl(this.stateObj) : undefined;
      if (url !== this._loadedUrl) {
        this._loadedUrl = url;
        this._loadFailed = false;
      }
    }
  }

  private _imageFailed() {
    this._loadFailed = true;
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      :host {
        display: block;
      }
      .stack {
        align-items: stretch;
      }
      img {
        display: block;
        width: 100%;
        max-height: 60vh;
        object-fit: contain;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--secondary-background-color);
      }
      .notice {
        margin: 0;
        padding: var(--ha-space-6) var(--ha-space-4);
        text-align: center;
        color: var(--secondary-text-color);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--secondary-background-color);
      }
      .taken {
        margin: 0;
        align-self: center;
        text-align: center;
        color: var(--secondary-text-color);
      }
      .round-buttons a.round {
        text-decoration: none;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-image": MoreInfoImage;
  }
}
