import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { styleMap } from "lit/directives/style-map";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { filterNavigationPages } from "../../../common/config/filter_navigation_pages";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-card";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import { getConfigEntries } from "../../../data/config_entries";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import {
  childPanelReadyContext,
  type RegisterChildPanelReady,
} from "../../../layouts/panel-ready";
import type { HomeAssistant } from "../../../types";
import "../../../components/ha-config-navigation-list";
import { configSections } from "../config-sections";
import type { SectionCounts } from "./section-summaries";
import { splitPages, tileCount } from "./settings-layout";
import {
  SettingsDramaController,
  settingsMotionStyles,
} from "./settings-motion";

@customElement("ha-config-navigation")
class HaConfigNavigation extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public pages!: PageNavigation[];

  @property() public label?: string;

  /** Draws the pages as a grid of cards. */
  @property({ type: Boolean }) public grid = false;

  /** What each page holds now, by its path, shown in place of its description. */
  @property({ attribute: false }) public summaries?: Record<string, string>;

  /** Live counts for the tiles; a tile without a known count shows none. */
  @property({ attribute: false }) public counts?: SectionCounts;

  /** Search text; only pages whose name or description match are shown. */
  @property() public filter = "";

  @state() private _visiblePages?: PageNavigation[];

  // Draws the cards again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // A string that follows the language mode where it has Cantonese.
  private _t = (
    key: string,
    values?: Record<string, string | number>
  ): string => this._lang.text(this.hass.localize, key, values);

  // Keeps the motion strength attribute in step with the person's choice.
  protected readonly _drama = new SettingsDramaController(this);

  private _hasBluetoothConfigEntries = false;

  private _bluetoothEntriesLoaded?: Promise<void>;

  private _childReadyRegistered = false;

  private _filterNavigationPages = memoizeOne(
    (
      hass: HomeAssistant,
      pages: PageNavigation[],
      hasBluetoothConfigEntries: boolean
    ) => filterNavigationPages(hass, pages, { hasBluetoothConfigEntries })
  );

  @consume({ context: childPanelReadyContext, subscribe: true })
  private _registerChildPanelReady?: RegisterChildPanelReady;

  protected override updated(changedProps: Map<PropertyKey, unknown>) {
    super.updated(changedProps);

    const pagesOrHassChanged =
      changedProps.has("pages") || changedProps.has("hass");

    if (pagesOrHassChanged) {
      const ready = this._resolveVisiblePages();
      if (!this._childReadyRegistered && this._registerChildPanelReady) {
        this._registerChildPanelReady(ready);
        this._childReadyRegistered = true;
      }
      return;
    }

    if (
      !this._childReadyRegistered &&
      this._registerChildPanelReady &&
      this.pages &&
      this.hass
    ) {
      this._registerChildPanelReady(this._resolveVisiblePages());
      this._childReadyRegistered = true;
    }
  }

  protected render(): TemplateResult {
    const pages = (this._visiblePages ?? []).map((page) => ({
      ...page,
      name: this._pageName(page),
      description: `
                ${
                  this.summaries?.[page.path] ||
                  page.description ||
                  this._t(
                    `ui.panel.config.dashboard.${page.translationKey}.secondary`
                  )
                }
              `,
    }));
    const label = this.label ?? this._t("panel.config");
    const matches = searchMatcher(this.filter);
    const shown = pages.filter((page) => matches(page.name, page.description));
    if (this.filter) {
      // A search also looks inside the cards: pages that are one step further
      // in, such as those under System, are offered directly.
      const known = new Set(pages.map((page) => page.path));
      const inner = this._filterNavigationPages(
        this.hass,
        this._innerPages(),
        this._hasBluetoothConfigEntries
      );
      for (const page of inner) {
        if (known.has(page.path) || !page.translationKey) {
          continue;
        }
        const name =
          page.name ||
          this._t(`ui.panel.config.dashboard.${page.translationKey}.main`);
        const description =
          page.description ||
          this._t(`ui.panel.config.dashboard.${page.translationKey}.secondary`);
        if (name && matches(name, description)) {
          known.add(page.path);
          shown.push({ ...page, name, description });
        }
      }
    }
    if (this.grid && !(this.filter && !shown.length)) {
      return this._renderFront(shown, label);
    }
    return html`
      <div class="visually-hidden" role="heading" aria-level="2">${label}</div>
      ${
        this.filter && !shown.length
          ? html`<p class="empty" role="status">
              ${this._t("ui.panel.config.dashboard.search_empty")}
            </p>`
          : html`<ha-config-navigation-list
              has-secondary
              .grid=${this.grid}
              .narrow=${this.narrow}
              .pages=${shown}
              .label=${label}
            ></ha-config-navigation-list>`
      }
    `;
  }

  private _pageName(page: PageNavigation): string {
    if (page.name) {
      return page.name;
    }
    const key = page.translationKey ?? "";
    return key.startsWith("ui.")
      ? this._t(key)
      : this._t(`ui.panel.config.dashboard.${key}.main`);
  }

  private _openExternal = (): void => {
    this.hass.auth.external?.fireMessage({ type: "config_screen/show" });
  };

  private _renderLink(
    page: PageNavigation,
    className: string,
    index: number,
    body: TemplateResult
  ): TemplateResult {
    const style = styleMap({ "--i": String(Math.min(index, 14)) });
    return page.path.endsWith("#external-app-configuration")
      ? html`<button
          type="button"
          class="${className} rise"
          style=${style}
          @click=${this._openExternal}
        >
          ${body}
        </button>`
      : html`<a class="${className} rise" style=${style} href=${page.path}>
          ${body}
        </a>`;
  }

  private _renderIcon(page: PageNavigation): TemplateResult {
    return html`<span class="icon"
      ><ha-svg-icon
        .path=${page.iconPath}
        .secondaryPath=${page.iconSecondaryPath}
        .viewBox=${page.iconViewBox}
      ></ha-svg-icon
    ></span>`;
  }

  /** The settings front: large tiles for the most used places, then rows. */
  private _renderFront(shown: PageNavigation[], label: string): TemplateResult {
    const { tiles, rows } = splitPages(shown);
    return html`
      <div class="visually-hidden" role="heading" aria-level="2">${label}</div>
      ${
        tiles.length
          ? html`<nav class="tiles" aria-label=${label}>
              ${tiles.map((page, index) => {
                const count = tileCount(page.path, this.counts);
                return this._renderLink(
                  page,
                  "tile",
                  index + 1,
                  html`${this._renderIcon(page)}
                    ${
                      count === undefined
                        ? nothing
                        : html`<span class="numeral">${count}</span>`
                    } <span class="name">${page.name}</span>`
                );
              })}
            </nav>`
          : nothing
      }
      ${
        rows.length
          ? html`
              ${
                tiles.length
                  ? html`<h2 class="eyebrow">
                      ${this._t("ui.panel.config.dashboard.everything_else")}
                    </h2>`
                  : nothing
              }
              <nav class="rows" aria-label=${label}>
                ${rows.map((page, index) =>
                  this._renderLink(
                    page,
                    "row",
                    tiles.length + index + 1,
                    html`${this._renderIcon(page)}
                      <span class="text">
                        <span class="name">${page.name}</span>
                        <span class="summary">${page.description}</span>
                      </span>
                      <ha-icon-next></ha-icon-next>`
                  )
                )}
              </nav>
            `
          : nothing
      }
    `;
  }

  private _innerPages = memoizeOne((): PageNavigation[] =>
    Object.entries(configSections)
      .filter(([key]) => !key.startsWith("dashboard"))
      .flatMap(([, list]) => list)
  );

  private _loadBluetoothEntries(): Promise<void> {
    if (!this._bluetoothEntriesLoaded) {
      this._bluetoothEntriesLoaded = getConfigEntries(this.hass, {
        domain: "bluetooth",
      })
        .then((entries) => {
          this._hasBluetoothConfigEntries = entries.length > 0;
        })
        .catch(() => {
          this._hasBluetoothConfigEntries = false;
        });
    }
    return this._bluetoothEntriesLoaded;
  }

  private async _resolveVisiblePages(): Promise<void> {
    if (this.pages.some((page) => page.component === "bluetooth")) {
      await this._loadBluetoothEntries();
    }

    const visiblePages = this._filterNavigationPages(
      this.hass,
      this.pages,
      this._hasBluetoothConfigEntries
    );
    const currentVisiblePages = this._visiblePages;
    if (
      !currentVisiblePages ||
      visiblePages.length !== currentVisiblePages.length ||
      visiblePages.some((page, index) => page !== currentVisiblePages[index])
    ) {
      this._visiblePages = visiblePages;
    }
    await this.updateComplete;
  }

  static styles: CSSResultGroup = [
    settingsMotionStyles,
    css`
      :host {
        display: block;
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: var(--ha-space-3);
      }
      .tile {
        position: relative;
        display: flex;
        flex-direction: column;
        justify-content: flex-end;
        gap: var(--ha-space-1);
        min-height: var(--ha-list-tile-min, 120px);
        box-sizing: border-box;
        padding: var(--ha-space-5);
        border: none;
        border-radius: 32px;
        background: var(--ha-color-fill-primary-normal-resting);
        color: var(--ha-color-on-primary-normal, var(--primary-text-color));
        font: inherit;
        text-align: start;
        text-decoration: none;
        cursor: pointer;
        overflow: hidden;
      }
      .tile:nth-child(4n + 2) {
        background: var(--ha-color-fill-success-normal-resting);
        color: var(--ha-color-on-success-normal, var(--primary-text-color));
      }
      .tile:nth-child(4n + 3) {
        background: var(--ha-color-fill-warning-normal-resting);
        color: var(--ha-color-on-warning-normal, var(--primary-text-color));
      }
      .tile:nth-child(4n) {
        background: var(--card-background-color);
        color: var(--primary-text-color);
      }
      .tile .icon {
        position: absolute;
        inset-block-start: var(--ha-space-4);
        inset-inline-end: var(--ha-space-4);
        display: grid;
        place-items: center;
        width: 48px;
        height: 48px;
        opacity: 0.85;
      }
      .numeral {
        font-size: 56px;
        line-height: 1;
        font-weight: 800;
        font-stretch: 125%;
        letter-spacing: -0.03em;
        font-variant-numeric: tabular-nums;
      }
      .tile .name {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      .eyebrow {
        margin: var(--ha-space-6) 0 var(--ha-space-2);
        padding-inline: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      .rows {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(min(100%, 300px), 1fr));
        gap: var(--ha-list-row-gap, 6px);
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-height: var(--ha-list-row-min, 52px);
        box-sizing: border-box;
        padding: var(--ha-space-2) var(--ha-space-4);
        border: none;
        border-radius: var(--ha-list-row-radius, 16px);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        font: inherit;
        text-align: start;
        text-decoration: none;
        cursor: pointer;
      }
      .row:hover {
        background: color-mix(
          in srgb,
          var(--primary-text-color) 6%,
          var(--card-background-color)
        );
      }
      .row .icon {
        flex: none;
        display: grid;
        place-items: center;
        width: var(--ha-list-row-icon-tile, 34px);
        height: var(--ha-list-row-icon-tile, 34px);
        border-radius: var(--ha-border-radius-lg);
        background: var(--ha-color-fill-primary-normal-resting);
        color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      }
      .text {
        flex: 1;
        min-width: 0;
        display: flex;
        flex-direction: column;
      }
      .row .name {
        font-size: var(--ha-list-row-title-size, var(--ha-font-size-m));
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        font-weight: var(--ha-font-weight-medium);
      }
      .row .summary {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
        display: -webkit-box;
        -webkit-box-orient: vertical;
        -webkit-line-clamp: 2;
        overflow: hidden;
        overflow-wrap: anywhere;
      }
      .name,
      .summary {
        unicode-bidi: plaintext;
      }
      .tile:focus-visible,
      .row:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .tile ha-svg-icon,
      .row ha-svg-icon {
        display: block;
        width: 24px;
        height: 24px;
      }
      .row ha-icon-next {
        flex: none;
        color: var(--secondary-text-color);
      }
      .empty {
        margin: 0;
        padding: var(--ha-space-8) 0;
        text-align: center;
        color: var(--secondary-text-color);
      }
      /* Accessibility */
      .visually-hidden {
        position: absolute;
        overflow: hidden;
        clip: rect(0 0 0 0);
        height: 1px;
        width: 1px;
        margin: -1px;
        padding: 0;
        border: 0;
      }
      /* Phone: two compact tiles across, about 96 px tall. */
      @media (max-width: 600px) {
        .tiles {
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-2);
        }
        .tile {
          min-height: min(var(--ha-list-tile-min, 120px), 96px);
          padding: var(--ha-space-3);
          border-radius: 24px;
        }
        .tile .icon {
          inset-block-start: var(--ha-space-2);
          inset-inline-end: var(--ha-space-2);
          width: 32px;
          height: 32px;
        }
        .tile .name {
          font-size: 14px;
        }
        .numeral {
          font-size: 28px;
        }
        .eyebrow {
          margin-top: var(--ha-space-4);
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-navigation": HaConfigNavigation;
  }
}
