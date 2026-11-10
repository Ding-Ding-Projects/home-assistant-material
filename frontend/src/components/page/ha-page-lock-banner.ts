import type { ContextType } from "@lit/context";
import { mdiLock } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { internationalizationContext } from "../../data/context";
import "../ha-svg-icon";

/** The line a locked page shows above its content. */
@customElement("ha-page-lock-banner")
export class HaPageLockBanner extends LitElement {
  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    return html`
      <ha-svg-icon .path=${mdiLock}></ha-svg-icon>
      <span role="status"
        >${this._i18n.localize("ui.page_tools.locked_banner")}</span
      >
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-6);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: var(--ha-font-size-m);
      --mdc-icon-size: 18px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-lock-banner": HaPageLockBanner;
  }
}
