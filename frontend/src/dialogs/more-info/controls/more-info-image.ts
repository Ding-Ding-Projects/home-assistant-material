import {
  mdiDownload,
  mdiMagnifyPlusOutline,
  mdiShareVariantOutline,
} from "@mdi/js";
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
    const taken =
      this.stateObj.state !== UNKNOWN &&
      this.stateObj.state !== UNAVAILABLE &&
      this._formatters
        ? this._formatters.formatEntityState(this.stateObj)
        : undefined;

    return html`
      <div class="stack">
        <img alt=${name} src=${url} />
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
                ${
                  typeof navigator.share === "function"
                    ? html`<button
                        type="button"
                        class="round"
                        aria-label=${localize(
                          "ui.dialogs.more_info_control.image.share"
                        )}
                        @click=${this._share}
                      >
                        <ha-svg-icon
                          .path=${mdiShareVariantOutline}
                        ></ha-svg-icon>
                      </button>`
                    : nothing
                }
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _share() {
    const imageUrl = computeImageUrl(this.stateObj!);
    if (!imageUrl || !this._connection) {
      return;
    }
    navigator
      .share({
        url: new URL(this._connection.hassUrl(imageUrl), location.href).href,
      })
      .catch(() => {
        // The person closed the share sheet
      });
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
