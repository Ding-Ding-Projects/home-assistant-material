import { mdiMagnify } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../common/translations/localize";
import "./ha-button";
import "./ha-svg-icon";

declare global {
  interface HASSDomEvents {
    "filter-search-cleared": undefined;
  }
}

/**
 * What a filter panel shows in place of its options when there is nothing to
 * pick: a search that matches no option (it says so, keeps the chosen options
 * and offers to clear the search), or the options still loading.
 */
@customElement("ha-filter-empty")
export class HaFilterEmpty extends LitElement {
  @property({ reflect: true }) public mode: "no-match" | "loading" = "no-match";

  /** The search text that matched nothing. */
  @property({ attribute: false }) public search?: string;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  // Draws the block again when the language mode changes.
  private _lang = new LanguageModeController(this);

  protected render() {
    if (this.mode === "loading") {
      return html`<div
        class="rows"
        role="status"
        aria-label=${this._localize(
          "ui.components.top_bar_search.loading_options"
        )}
      >
        ${[0, 1, 2, 3].map(
          () =>
            html`<div class="row">
              <span class="circle"></span><span class="line"></span>
            </div>`
        )}
      </div>`;
    }
    return html`<div class="empty" role="status">
      <span class="icon"><ha-svg-icon .path=${mdiMagnify}></ha-svg-icon></span>
      <p class="title">
        ${this._lang.text(
          this._localize,
          "ui.components.top_bar_search.options_no_match",
          { search: this.search ?? "" }
        )}
      </p>
      <p class="note">
        ${this._localize("ui.components.top_bar_search.selection_kept")}
      </p>
      <ha-button
        appearance="filled"
        variant="neutral"
        size="s"
        @click=${this._clear}
      >
        ${this._localize("ui.components.top_bar_search.clear_search")}
      </ha-button>
    </div>`;
  }

  private _clear() {
    fireEvent(this, "filter-search-cleared");
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      flex: 1;
      min-height: 160px;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-2);
      min-height: 160px;
      box-sizing: border-box;
      padding: var(--ha-space-6) var(--ha-space-4);
      text-align: center;
    }
    .icon {
      display: grid;
      place-items: center;
      width: 48px;
      height: 48px;
      border-radius: var(--ha-border-radius-circle);
      background: var(--ha-color-fill-neutral-quiet-resting);
      color: var(--secondary-text-color);
    }
    p {
      margin: 0;
      overflow-wrap: anywhere;
    }
    .title {
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
      color: var(--primary-text-color);
    }
    .note {
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
    ha-button {
      margin-top: var(--ha-space-2);
    }
    .rows {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 48px;
      padding-inline: var(--ha-space-3);
    }
    .circle,
    .line {
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    .circle {
      flex: none;
      width: 32px;
      height: 32px;
      border-radius: var(--ha-border-radius-circle);
    }
    .line {
      flex: 1;
      max-width: 60%;
      height: 12px;
      border-radius: var(--ha-border-radius-pill);
    }
    @media (prefers-reduced-motion: no-preference) {
      .circle,
      .line {
        animation: pulse 1.4s ease-in-out infinite;
      }
    }
    @keyframes pulse {
      50% {
        opacity: 0.5;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-filter-empty": HaFilterEmpty;
  }
}
