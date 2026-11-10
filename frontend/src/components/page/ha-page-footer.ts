import type { ContextType } from "@lit/context";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { configContext, internationalizationContext } from "../../data/context";

const languageName = (language: string): string => {
  try {
    return (
      new Intl.DisplayNames([language], { type: "language" }).of(language) ||
      language
    );
  } catch (_err) {
    return language;
  }
};

/**
 * The line at the foot of every page: the running version and when it was
 * built, the language in use, and how to reach the tools of any element.
 */
@customElement("ha-page-footer")
export class HaPageFooter extends LitElement {
  @property({ type: Boolean, reflect: true }) public locked = false;

  @consume({ context: internationalizationContext, subscribe: true })
  @state()
  private _i18n!: ContextType<typeof internationalizationContext>;

  @consume({ context: configContext, subscribe: true })
  @state()
  private _hassConfig?: ContextType<typeof configContext>;

  protected render(): TemplateResult {
    const localize = this._i18n.localize;
    const version =
      __MATERIAL_BUILD__ || this._hassConfig?.config?.version || __VERSION__;
    const built = new Date(__BUILD_TIME__);
    const language = this._i18n.language;
    const updated = Number.isNaN(built.getTime())
      ? undefined
      : built.toLocaleString(language, {
          day: "numeric",
          month: "short",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
          timeZoneName: "short",
        });
    return html`
      <span class="version"
        >${localize("ui.page_tools.footer.version", { version })}</span
      >
      ${
        updated
          ? html`<span
              >${localize("ui.page_tools.footer.updated", {
                date: updated,
              })}</span
            >`
          : nothing
      }
      <span
        >${localize("ui.page_tools.footer.language", {
          language: languageName(language),
        })}</span
      >
      ${
        this.locked
          ? html`<span class="locked"
              >${localize("ui.page_tools.footer.locked")}</span
            >`
          : nothing
      }
      <span class="hint">${localize("ui.page_tools.footer.menu_hint")}</span>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      box-sizing: border-box;
      min-height: calc(
        var(--ha-page-footer-height, 40px) + var(--safe-area-inset-bottom, 0px)
      );
      padding: 0 var(--ha-space-6);
      padding-bottom: var(--safe-area-inset-bottom, 0px);
      white-space: nowrap;
      overflow: hidden;
      border-top: 1px solid var(--divider-color);
      background: var(--primary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
    }
    .version {
      font-weight: var(--ha-font-weight-medium);
      color: var(--primary-text-color);
    }
    .locked {
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    span {
      flex: none;
    }
    .hint {
      flex: 1 1 0;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      text-align: end;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-footer": HaPageFooter;
  }
}
