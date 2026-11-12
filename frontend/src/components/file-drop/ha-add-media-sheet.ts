import { mdiImageMultiple, mdiMultimedia } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { DropZone } from "../../common/file-drop/drop-routing";
import "../ha-button";
import "../ha-svg-icon";
import type { DropUploadZone } from "./ha-drop-upload-overlay";

declare global {
  interface HASSDomEvents {
    "add-media-zone-chosen": { zone: DropZone };
    "add-media-sheet-closed": undefined;
  }
}

/**
 * A small sheet asking where chosen pictures go: the media library or the
 * image store. It is what a touch screen gets in place of the two drop zones.
 * Each choice is a button of at least 44 px, the sheet is at most 320 px wide
 * and Escape or the backdrop closes it without choosing.
 */
@customElement("ha-add-media-sheet")
export class HaAddMediaSheet extends LitElement {
  @property() public heading = "";

  @property() public summary = "";

  @property({ attribute: "cancel-label" }) public cancelLabel = "";

  @property({ attribute: false }) public zones: DropUploadZone[] = [];

  @query("button.choice") private _firstChoice?: HTMLButtonElement;

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("keydown", this._onKeyDown, true);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("keydown", this._onKeyDown, true);
  }

  protected firstUpdated(): void {
    this._firstChoice?.focus();
  }

  protected render(): TemplateResult {
    return html`
      <div class="backdrop" @click=${this._close}></div>
      <div
        class="sheet"
        role="dialog"
        aria-modal="true"
        aria-label=${this.heading}
      >
        <div class="heading">${this.heading}</div>
        <div class="summary">${this.summary}</div>
        ${this.zones.map(
          (zone) => html`
            <button
              type="button"
              class="choice"
              data-zone=${zone.id}
              @click=${this._choose}
            >
              <ha-svg-icon
                .path=${zone.id === "image" ? mdiImageMultiple : mdiMultimedia}
              ></ha-svg-icon>
              <span class="text">
                <span class="zone-title">${zone.title}</span>
                <span class="zone-hint">${zone.hint}</span>
              </span>
            </button>
          `
        )}
        <ha-button appearance="plain" @click=${this._close}>
          ${this.cancelLabel}
        </ha-button>
      </div>
    `;
  }

  private _choose(ev: Event): void {
    const zone = (ev.currentTarget as HTMLElement).dataset.zone;
    fireEvent(this, "add-media-zone-chosen", {
      zone: zone === "image" ? "image" : "media",
    });
  }

  private _close = (): void => {
    fireEvent(this, "add-media-sheet-closed");
  };

  private _onKeyDown = (ev: KeyboardEvent): void => {
    if (ev.key === "Escape") {
      ev.stopPropagation();
      this._close();
    }
  };

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      inset: 0;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      margin: 0;
      padding: 0;
      border: none;
      background: transparent;
      color: inherit;
      overflow: hidden;
    }
    .backdrop {
      position: absolute;
      inset: 0;
      background: color-mix(
        in srgb,
        var(--primary-text-color) 40%,
        transparent
      );
    }
    .sheet {
      position: absolute;
      inset-inline: 0;
      bottom: 0;
      margin-inline: auto;
      box-sizing: border-box;
      width: min(320px, 100%);
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3, 12px);
      padding: var(--ha-space-4, 16px);
      border-radius: var(--ha-border-radius-xl, 24px)
        var(--ha-border-radius-xl, 24px) 0 0;
      background: var(--card-background-color, var(--primary-background-color));
      color: var(--primary-text-color);
      box-shadow: var(--ha-box-shadow-l, 0 8px 24px rgba(0, 0, 0, 0.3));
    }
    .heading {
      font-size: var(--ha-font-size-l, 18px);
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .summary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-m, 14px);
    }
    .choice {
      all: unset;
      box-sizing: border-box;
      min-height: 44px;
      display: flex;
      align-items: center;
      gap: var(--ha-space-3, 12px);
      padding: var(--ha-space-3, 12px);
      border: 2px solid var(--divider-color);
      border-radius: var(--ha-border-radius-lg, 16px);
      cursor: pointer;
      overflow-wrap: anywhere;
    }
    .choice:hover,
    .choice:focus-visible {
      border-color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 12%, transparent);
    }
    .choice ha-svg-icon {
      flex: none;
      --mdc-icon-size: 28px;
      color: var(--primary-color);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .zone-title {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .zone-hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-add-media-sheet": HaAddMediaSheet;
  }
}
