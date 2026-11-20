import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../common/translations/localize";

/**
 * The line under the options of a filter panel that says how many options its
 * search hides. The search only hides options; clearing it shows them all.
 * Draws nothing while no option is hidden.
 */
@customElement("ha-filter-hidden-count")
export class HaFilterHiddenCount extends LitElement {
  /** How many options the search hides. */
  @property({ attribute: false }) public hiddenCount = 0;

  /** How many options the panel has in all. */
  @property({ attribute: false }) public total = 0;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  // Draws the line again when the language mode changes.
  private _lang = new LanguageModeController(this);

  protected render() {
    if (!this.hiddenCount) {
      return nothing;
    }
    return html`<p role="status">
      ${this._lang.text(
        this._localize,
        "ui.components.top_bar_search.options_hidden",
        { hidden: this.hiddenCount, total: this.total }
      )}
    </p>`;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    p {
      margin: 0;
      padding: var(--ha-space-1) var(--ha-space-4);
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      color: var(--secondary-text-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-filter-hidden-count": HaFilterHiddenCount;
  }
}
