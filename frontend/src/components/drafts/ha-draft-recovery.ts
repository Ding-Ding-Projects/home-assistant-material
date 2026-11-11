import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import "../ha-button";

export interface DraftRecoveryLabels {
  /** The question above the buttons, for example "Restore unsaved changes from 10:42?". */
  heading: string;
  /** Shown when the saved item changed after the draft was started. */
  stale: string;
  restore: string;
  compare: string;
  hideCompare: string;
  discard: string;
  /** Name of the column that shows what is in the editor now. */
  current: string;
  /** Name of the column that shows the draft. */
  draft: string;
}

/**
 * A banner that offers a stored draft. It never applies the draft itself: the
 * owner listens for the events and decides how to put the text back through
 * the editor's own normal path. Compare shows the editor text and the draft
 * side by side as plain text, read only.
 *
 * @fires draft-restore - the person chose Restore
 * @fires draft-discard - the person chose Discard
 */
@customElement("ha-draft-recovery")
export class HaDraftRecovery extends LitElement {
  @property({ attribute: false }) public labels!: DraftRecoveryLabels;

  /** The text of the draft. */
  @property({ attribute: false }) public draft = "";

  /** The text now in the editor, shown next to the draft by Compare. */
  @property({ attribute: false }) public current = "";

  /** True when the saved item changed after the draft was started. */
  @property({ type: Boolean }) public stale = false;

  @state() private _comparing = false;

  protected render() {
    if (!this.labels) {
      return nothing;
    }
    return html`
      <div class="banner" role="region" aria-label=${this.labels.heading}>
        <p class="heading">${this.labels.heading}</p>
        ${this.stale ? html`<p class="stale">${this.labels.stale}</p>` : nothing}
        <div class="actions">
          <ha-button @click=${this._restore}>
            ${this.labels.restore}
          </ha-button>
          <ha-button
            appearance="plain"
            aria-expanded=${this._comparing ? "true" : "false"}
            @click=${this._toggleCompare}
          >
            ${this._comparing ? this.labels.hideCompare : this.labels.compare}
          </ha-button>
          <ha-button
            appearance="plain"
            variant="danger"
            @click=${this._discard}
          >
            ${this.labels.discard}
          </ha-button>
        </div>
        ${
          this._comparing
            ? html`<div class="compare">
                <div class="column">
                  <p class="column-title">${this.labels.current}</p>
                  <pre tabindex="0" dir="ltr">${this.current}</pre>
                </div>
                <div class="column">
                  <p class="column-title">${this.labels.draft}</p>
                  <pre tabindex="0" dir="ltr">${this.draft}</pre>
                </div>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _restore() {
    fireEvent(this, "draft-restore");
  }

  private _discard() {
    fireEvent(this, "draft-discard");
  }

  private _toggleCompare() {
    this._comparing = !this._comparing;
  }

  static styles = css`
    :host {
      display: block;
    }
    .banner {
      box-sizing: border-box;
      padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
      border: 1px solid var(--divider-color);
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(--secondary-background-color);
      color: var(--primary-text-color);
    }
    p {
      margin: 0;
    }
    .heading {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .stale {
      margin-top: var(--ha-space-1, 4px);
      color: var(--warning-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2, 8px);
      margin-top: var(--ha-space-2, 8px);
    }
    ha-button {
      --ha-button-height: 44px;
    }
    .compare {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ha-space-3, 12px);
      margin-top: var(--ha-space-3, 12px);
    }
    @media (max-width: 599px) {
      .compare {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .column {
      min-width: 0;
    }
    .column-title {
      margin-bottom: var(--ha-space-1, 4px);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    pre {
      box-sizing: border-box;
      max-height: 240px;
      margin: 0;
      padding: var(--ha-space-2, 8px);
      overflow: auto;
      border-radius: var(--ha-border-radius-md, 8px);
      background: var(--card-background-color, var(--primary-background-color));
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    pre:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-draft-recovery": HaDraftRecovery;
  }

  interface HASSDomEvents {
    "draft-restore": undefined;
    "draft-discard": undefined;
  }
}
