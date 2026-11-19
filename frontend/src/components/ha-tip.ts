import { mdiLightbulbOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../common/translations/localize";

import "./ha-svg-icon";

import { LanguageModeController } from "../common/language-mode/language-mode-controller";

@customElement("ha-tip")
class HaTip extends LitElement {
  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  // Draws again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // The strings in the chosen language mode, where they have Cantonese.
  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this._localize);
  }

  public render() {
    if (!this._localize) {
      return nothing;
    }

    return html`
      <ha-svg-icon .path=${mdiLightbulbOutline}></ha-svg-icon>
      <span class="prefix"
        >${this._modeLocalize("ui.panel.config.tips.tip")}</span
      >
      <span class="text"><slot></slot></span>
    `;
  }

  static styles = css`
    :host {
      display: block;
      text-align: center;
    }

    .text {
      direction: var(--direction);
      /* The tip may be in another language than the page. */
      unicode-bidi: plaintext;
      margin-left: 2px;
      margin-inline-start: 2px;
      margin-inline-end: initial;
      color: var(--secondary-text-color);
    }

    .prefix {
      font-weight: var(--ha-font-weight-medium);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-tip": HaTip;
  }
}
