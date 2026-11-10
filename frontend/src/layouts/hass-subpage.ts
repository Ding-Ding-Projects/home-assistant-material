import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, eventOptions, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { restoreScroll } from "../common/decorators/restore-scroll";
import type { HASSDomTargetEvent } from "../common/dom/fire_event";
import { PageLockController } from "../common/locks/page-lock-controller";
import { getHistoryState } from "../common/navigate";
import { sanitizeNavigationPath } from "../common/url/sanitize-navigation-path";
import { handleBackClick } from "./back-navigation";
import "../components/ha-icon-button-arrow-prev";
import "../components/ha-menu-button";
import "../components/page/ha-page-footer";
import "../components/page/ha-page-lock-banner";
import "../components/page/ha-page-tools";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant } from "../types";

@customElement("hass-subpage")
class HassSubpage extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public header?: string;

  @property({ type: Boolean, attribute: "main-page" }) public mainPage = false;

  @property({ type: String, attribute: "back-path" }) public backPath?: string;

  @property({ attribute: false }) public backCallback?: () => void;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ type: Boolean }) public scrollable = true;

  // @ts-ignore
  @restoreScroll(".content") private _savedScrollPos?: number;

  private _pageLock = new PageLockController(this);

  protected render(): TemplateResult {
    const backPath = sanitizeNavigationPath(this.backPath);
    const locked = this._pageLock.locked;

    return html`
      <div class="toolbar ${classMap({ narrow: this.narrow })}">
        <div class="toolbar-content">
          ${
            this.mainPage || (!backPath && getHistoryState()?.root)
              ? html`<ha-menu-button></ha-menu-button>`
              : html`
                  <ha-icon-button-arrow-prev
                    .href=${backPath}
                    @click=${this._backTapped}
                  ></ha-icon-button-arrow-prev>
                `
          }

          <div class="main-title">
            <slot name="header">${this.header}</slot>
          </div>
          <ha-page-tools
            .compact=${this.narrow}
            .pageTitle=${this.header}
          ></ha-page-tools>
          <div class="toolbar-icons" ?inert=${locked}>
            <slot name="toolbar-icon"></slot>
          </div>
        </div>
      </div>
      ${locked ? html`<ha-page-lock-banner></ha-page-lock-banner>` : nothing}
      <div
        class=${classMap({
          content: true,
          "ha-scrollbar": this.scrollable,
          "not-scrollable": !this.scrollable,
        })}
        ?inert=${locked}
        @scroll=${this._saveScrollPos}
      >
        <slot></slot>
      </div>
      ${
        this.narrow
          ? nothing
          : html`<ha-page-footer .locked=${locked}></ha-page-footer>`
      }
      <div id="fab" ?inert=${locked}>
        <slot name="fab"></slot>
      </div>
    `;
  }

  @eventOptions({ passive: true })
  private _saveScrollPos(e: HASSDomTargetEvent<HTMLDivElement>) {
    this._savedScrollPos = (e.target as HTMLDivElement).scrollTop;
  }

  private _backTapped(ev: MouseEvent): void {
    handleBackClick(ev, this.backPath, this.backCallback);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleScrollbar,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100%;
          overflow: hidden;
          position: relative;
        }

        .toolbar,
        ha-page-footer,
        ha-page-lock-banner {
          flex: none;
        }

        .toolbar-icons {
          display: flex;
          align-items: center;
        }

        :host([narrow]) {
          width: 100%;
          position: fixed;
        }

        .toolbar {
          background-color: var(--app-header-background-color);
          padding-top: var(--safe-area-inset-top);
          padding-right: var(--safe-area-inset-right);
        }
        :host([narrow]) .toolbar {
          padding-left: var(--safe-area-inset-left);
        }

        .toolbar-content {
          display: flex;
          align-items: center;
          font-size: var(--ha-font-size-xl);
          height: var(--header-height);
          font-weight: var(--ha-font-weight-normal);
          color: var(--app-header-text-color, white);
          border-bottom: var(--app-header-border-bottom, none);
          box-sizing: border-box;
          padding: 8px 12px;
        }

        .toolbar a {
          color: var(--sidebar-text-color);
          text-decoration: none;
        }

        ha-menu-button,
        ha-icon-button-arrow-prev,
        ::slotted([slot="toolbar-icon"]) {
          display: flex;
          align-items: center;
          pointer-events: auto;
          color: var(--sidebar-icon-color);
        }

        .main-title {
          margin-inline-start: var(--ha-space-6);
          line-height: var(--ha-line-height-normal);
          min-width: 0;
          flex-grow: 1;
          overflow-wrap: break-word;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .narrow .main-title {
          margin-inline-start: var(--ha-space-2);
        }

        .content {
          position: relative;
          width: calc(100% - var(--safe-area-inset-right, 0px));
          flex: 1;
          min-height: 0;
          box-sizing: border-box;
          padding-bottom: var(--safe-area-inset-bottom, 0px);
          margin-right: var(--safe-area-inset-right);
          overflow-y: auto;
          overflow: auto;
        }
        .content.not-scrollable {
          overflow: hidden;
          display: flex;
          flex-direction: column;
        }

        :host([narrow]) .content {
          width: calc(
            100% - var(--safe-area-inset-left, 0px) - var(
                --safe-area-inset-right,
                0px
              )
          );
          margin-left: var(--safe-area-inset-left);
        }

        #fab {
          position: absolute;
          right: calc(16px + var(--safe-area-inset-right, 0px));
          inset-inline-end: calc(16px + var(--safe-area-inset-right, 0px));
          inset-inline-start: initial;
          bottom: calc(16px + var(--safe-area-inset-bottom, 0px));
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--ha-space-2);
          --ha-button-box-shadow: var(--ha-box-shadow-l);
        }
        /* Above the page footer, which wide layouts show. */
        :host(:not([narrow])) #fab {
          bottom: calc(
            16px + var(--ha-page-footer-height, 40px) +
              var(--safe-area-inset-bottom, 0px)
          );
        }
        :host([narrow]) #fab.tabs {
          bottom: calc(84px + var(--safe-area-inset-bottom, 0px));
        }
        #fab[is-wide] {
          bottom: calc(
            24px + var(--ha-page-footer-height, 40px) +
              var(--safe-area-inset-bottom, 0px)
          );
          right: calc(24px + var(--safe-area-inset-right, 0px));
          inset-inline-end: calc(24px + var(--safe-area-inset-right, 0px));
          inset-inline-start: initial;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hass-subpage": HassSubpage;
  }
}
