import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../../components/ha-button";
import type { HomeAssistant } from "../../../../types";
import "../../automation-history/ha-automation-diff";
import type { DraftController } from "./draft-controller";
import { draftDiffText, formatDraftTime } from "./draft-logic";
import { draftText } from "./draft-strings";

declare global {
  interface HTMLElementTagNameMap {
    "ha-editor-draft-bar": HaEditorDraftBar;
  }
}

/**
 * The quiet draft status and the offer to bring a draft back. It only shows
 * what the draft controller says and calls its methods; it stores nothing.
 */
@customElement("ha-editor-draft-bar")
export class HaEditorDraftBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public controller?: DraftController;

  @state() private _showDiff = false;

  private _unsubscribe?: () => void;

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("controller")) {
      this._unsubscribe?.();
      this._unsubscribe = this.controller?.subscribe(() => {
        this.requestUpdate();
      });
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
  }

  protected render() {
    const controller = this.controller;
    if (!controller) {
      return nothing;
    }
    const offer = controller.offer;
    if (offer) {
      return html`
        <div class="offer" role="group">
          <div class="title">
            ${draftText(this.hass, "offer_title", {
              time: formatDraftTime(offer.draft.updated),
            })}
          </div>
          ${
            offer.more
              ? html`<div class="more">
                  ${draftText(this.hass, "offer_more", { count: offer.more })}
                </div>`
              : nothing
          }
          ${
            offer.liveChanged
              ? html`<div class="warning">
                  ${draftText(this.hass, "offer_live_changed")}
                </div>`
              : nothing
          }
          <div class="actions">
            <ha-button size="s" @click=${this._continue}>
              ${draftText(this.hass, "continue")}
            </ha-button>
            <ha-button size="s" appearance="plain" @click=${this._toggleDiff}>
              ${draftText(this.hass, this._showDiff ? "hide_changes" : "see_changes")}
            </ha-button>
            <ha-button
              size="s"
              appearance="plain"
              variant="danger"
              @click=${this._discard}
            >
              ${draftText(this.hass, "discard")}
            </ha-button>
          </div>
          ${
            this._showDiff
              ? html`<ha-automation-diff
                  .text=${
                    draftDiffText(offer.live ?? {}, offer.draft.config) ||
                    draftText(this.hass, "no_changes")
                  }
                ></ha-automation-diff>`
              : nothing
          }
        </div>
      `;
    }
    const text = controller.statusText();
    return html`<div
      class="status ${controller.status}"
      role="status"
      aria-live="polite"
    >
      ${text}
    </div>`;
  }

  private _continue() {
    this._showDiff = false;
    this.controller?.continueDraft();
  }

  private _discard() {
    this._showDiff = false;
    this.controller?.discardOffer();
  }

  private _toggleDiff() {
    this._showDiff = !this._showDiff;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .status {
      min-height: 0;
      padding: 0 var(--ha-space-4);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .status:empty {
      display: none;
    }
    .status.error {
      color: var(--warning-color);
    }
    .offer {
      margin: var(--ha-space-2) var(--ha-space-4);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --md-sys-color-secondary-container,
        var(--secondary-background-color)
      );
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    .more {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .warning {
      font-size: var(--ha-font-size-s);
      color: var(--warning-color);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    ha-automation-diff {
      margin-top: var(--ha-space-1);
      max-height: 40vh;
      overflow: auto;
    }
  `;
}
