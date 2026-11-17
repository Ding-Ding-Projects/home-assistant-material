import type { ContextType } from "@lit/context";
import { mdiCursorDefaultClickOutline, mdiTranslate } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { CANTONESE_FORMAT_LANGUAGE } from "../../common/language-mode/mode-format";
import { configContext, internationalizationContext } from "../../data/context";
import "../ha-svg-icon";

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

// Wraps a value in Unicode first-strong isolate marks so it keeps its own
// reading order and never reorders the label, colon or numbers around it.
const isolate = (value: string): string => `⁨${value}⁩`;

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

  // Draws the footer again when the language mode changes.
  private _lang = new LanguageModeController(this);

  protected render(): TemplateResult | typeof nothing {
    if (!this._i18n) {
      return nothing;
    }
    // Each line follows the language mode where it has Cantonese.
    const localize = (
      key: string,
      values?: Record<string, string | number>
    ): string => this._lang.text(this._i18n.localize, key, values);
    const version =
      __MATERIAL_BUILD__ || this._hassConfig?.config?.version || __VERSION__;
    const built = new Date(__BUILD_TIME__);
    const language = this._i18n.language;
    const hasTime = !Number.isNaN(built.getTime());
    // The sentence is built once per language, so the date and the time inside
    // each one are written in that sentence's own language.
    const buildLine = hasTime
      ? this._lang.compose(this._i18n.localize, (part) => {
          const dateLanguage = part.cantonese
            ? CANTONESE_FORMAT_LANGUAGE
            : language;
          return part("ui.page_tools.footer.build", {
            version: isolate(String(version)),
            date: isolate(
              built.toLocaleDateString(dateLanguage, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            ),
            time: isolate(
              built.toLocaleTimeString(dateLanguage, {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hourCycle: "h23",
                timeZoneName: "short",
              })
            ),
          });
        })
      : localize("ui.page_tools.footer.build_no_time", {
          version: isolate(String(version)),
        });
    return html`
      <span class="version">${buildLine}</span>
      <span class="item"
        ><ha-svg-icon .path=${mdiTranslate}></ha-svg-icon>${localize(
          "ui.page_tools.footer.language",
          { language: isolate(languageName(language)) }
        )}</span
      >
      ${
        this.locked
          ? html`<span class="locked"
              >${localize("ui.page_tools.footer.locked")}</span
            >`
          : nothing
      }
      <span class="item hint"
        ><ha-svg-icon .path=${mdiCursorDefaultClickOutline}></ha-svg-icon
        >${localize("ui.page_tools.footer.menu_hint")}</span
      >
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
      padding: 0 var(--ha-space-8);
      padding-inline-end: calc(
        var(--ha-space-8) + var(--safe-area-inset-right, 0px)
      );
      padding-bottom: var(--safe-area-inset-bottom, 0px);
      /* The line wraps instead of being cut, which matters most when both
         languages are shown. */
      flex-wrap: wrap;
      row-gap: var(--ha-space-1);
      overflow: hidden;
      background: var(--primary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      --mdc-icon-size: 16px;
    }
    span {
      flex: none;
    }
    .version {
      /* The line follows the page direction, so it starts at the page's
         start edge; each inserted value is isolated in the text itself. */
      text-align: start;
      flex: 1 1 auto;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .item {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    .locked {
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    @media (max-width: 1100px) {
      .hint {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-footer": HaPageFooter;
  }
}
