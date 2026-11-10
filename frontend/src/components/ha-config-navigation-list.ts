import type { ContextType } from "@lit/context";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { configContext } from "../data/context";
import "./ha-icon-next";
import "./ha-svg-icon";
import "./item/ha-list-item-button";
import "./list/ha-list-nav";
import type { PageNavigation } from "../layouts/hass-tabs-subpage";

@customElement("ha-config-navigation-list")
class HaConfigNavigationList extends LitElement {
  @consume({ context: configContext, subscribe: true })
  private _config!: ContextType<typeof configContext>;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public pages!: PageNavigation[];

  @property({ attribute: "has-secondary", type: Boolean })
  public hasSecondary = false;

  @property() public label?: string;

  /** Draws the pages as a grid of cards instead of a list. */
  @property({ type: Boolean, reflect: true }) public grid = false;

  private _renderGrid(): TemplateResult {
    return html`
      <nav class="grid" aria-label=${this.label ?? ""}>
        ${this.pages.map((page) => {
          const externalApp = page.path.endsWith("#external-app-configuration");
          const content = html`
            <span class="tile">
              <ha-svg-icon
                .path=${page.iconPath}
                .secondaryPath=${page.iconSecondaryPath}
                .viewBox=${page.iconViewBox}
              ></ha-svg-icon>
            </span>
            <span class="text">
              <span class="name">${page.name}</span>
              ${
                this.hasSecondary
                  ? html`<span class="summary">${page.description}</span>`
                  : ""
              }
            </span>
            <ha-icon-next></ha-icon-next>
          `;
          return externalApp
            ? html`<button
                type="button"
                class="card"
                @click=${this._handleExternalApp}
              >
                ${content}
              </button>`
            : html`<a class="card" href=${page.path}>${content}</a>`;
        })}
      </nav>
    `;
  }

  public render(): TemplateResult {
    if (this.grid) {
      return this._renderGrid();
    }
    return html`
      <ha-list-nav .ariaLabel=${this.label}>
        ${this.pages.map((page) => {
          const externalApp = page.path.endsWith("#external-app-configuration");
          return html`
            <ha-list-item-button
              .href=${externalApp ? undefined : page.path}
              @click=${externalApp ? this._handleExternalApp : undefined}
            >
              <div
                slot="start"
                class=${page.iconColor ? "icon-background" : ""}
                .style="background-color: ${page.iconColor || "undefined"}"
              >
                <ha-svg-icon
                  .path=${page.iconPath}
                  .secondaryPath=${page.iconSecondaryPath}
                  .viewBox=${page.iconViewBox}
                ></ha-svg-icon>
              </div>
              <span slot="headline">${page.name}</span>
              ${
                this.hasSecondary
                  ? html`<span slot="supporting-text"
                      >${page.description}</span
                    >`
                  : ""
              }
              ${
                !this.narrow
                  ? html`<ha-icon-next slot="end"></ha-icon-next>`
                  : ""
              }
            </ha-list-item-button>
          `;
        })}
      </ha-list-nav>
    `;
  }

  private _handleExternalApp() {
    this._config.auth.external!.fireMessage({ type: "config_screen/show" });
  }

  static styles: CSSResultGroup = css`
    ha-svg-icon,
    ha-icon-next {
      color: var(--secondary-text-color);
      height: 24px;
      width: 24px;
      display: block;
    }
    ha-svg-icon {
      padding: 8px;
    }
    .icon-background {
      border-radius: var(--ha-border-radius-circle);
    }
    .icon-background ha-svg-icon {
      color: #fff;
    }
    .grid {
      display: grid;
      /* As many columns as fit, three at most unless the page says so. */
      --_columns: var(--navigation-grid-columns, 3);
      grid-template-columns: repeat(
        auto-fill,
        minmax(
          max(
            260px,
            calc(
              (100% - (var(--_columns) - 1) * var(--ha-space-2)) /
                var(--_columns)
            )
          ),
          1fr
        )
      );
      gap: var(--ha-space-2);
    }
    .card {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 64px;
      box-sizing: border-box;
      padding: var(--ha-space-2) var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      font: inherit;
      text-align: start;
      text-decoration: none;
      cursor: pointer;
    }
    .card:hover {
      background: color-mix(
        in srgb,
        var(--primary-text-color) 6%,
        var(--card-background-color)
      );
    }
    .card:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .tile {
      flex: none;
      display: grid;
      place-items: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg);
      background: var(--primary-background-color);
    }
    .tile ha-svg-icon {
      padding: 0;
      color: var(--primary-text-color);
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .summary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      line-height: var(--ha-line-height-normal);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .card ha-icon-next {
      flex: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-navigation-list": HaConfigNavigationList;
  }
}
