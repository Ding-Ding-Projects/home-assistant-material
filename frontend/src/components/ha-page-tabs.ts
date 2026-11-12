import { mdiFormatPaint, mdiHuman, mdiMagnify, mdiTranslate } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import {
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../common/accessibility/accessibility-tools";
import { fireEvent } from "../common/dom/fire_event";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import { isVerticalDock } from "../common/tabs/tab-dock";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant } from "../types";
import { applyTabOrder, moveTabId } from "./tab-order";
import "./ha-svg-icon";
import "./user/ha-user-badge";
import { computePageTabs } from "./tabs/compute-page-tabs";
import { TabStripController } from "./tabs/ha-page-tab-strip";
import { TabBulkCloseController } from "./tabs/ha-tab-bulk-close";
import { TabCatalogController } from "./tabs/ha-tab-catalog";
import { TabSearchesController } from "./tabs/ha-tab-searches";
import "./tabs/ha-page-tab-menu";
import "./tabs/ha-tab-group-editor";
import "./tabs/ha-tab-group-menu";
import "./tabs/ha-tab-group-picker";
import { tabSharedStyles } from "./tabs/tab-shared-styles";
import {
  CLOSED_TABS_STORAGE_KEY,
  PINNED_TABS_STORAGE_KEY,
  TABS_ORDER_STORAGE_KEY,
  TabStoreController,
} from "./tabs/tab-store-controller";
import type { PageTab, TabModuleContext } from "./tabs/tab-types";

export {
  CLOSED_TABS_STORAGE_KEY,
  TABS_ORDER_STORAGE_KEY,
  PINNED_TABS_STORAGE_KEY,
};
export type { PageTab };
export { computePageTabs };

// The two pure functions live in `tab-order.ts` so they can be tested alone.
export { applyTabOrder, moveTabId };

declare global {
  interface HASSDomEvents {
    "hass-show-accessibility-tools": undefined;
    /** Starts the tool that picks an element to edit its appearance. */
    "hass-pick-appearance": undefined;
  }
}

/**
 * @element ha-page-tabs
 *
 * @summary
 * The bar of open pages, docked to the left (the default for a new
 * installation), right, top or bottom edge of the pane; an installation that
 * already had saved tab state keeps the top edge until the person chooses
 * another one. Every page starts open, in page order. A tab the person closes
 * stays closed until they open it again from the catalog behind the New tab
 * button, which lists every page and can reopen all of them at once. A page
 * added by an update was never offered before, so it shows up open. Visiting a
 * page from the navigation rail never adds a tab.
 *
 * The closed tabs, the order, the pinned tabs, the groups, the edge, the look
 * of each tab and the locks are stored, in this browser. The shell sets the
 * `dock` attribute (and `vertical` for the left and right edges) for its own
 * styles and for the layout that mounts it.
 *
 * This element is the shell. It owns `hass`, builds one context (the host, the
 * translate function and the store) and gives it to the modules below, which
 * render into this element's shadow root and keep their own state:
 *
 * - `TabStoreController` (`tabs/tab-store-controller.ts`): the saved closed,
 *   order and pinned lists, and the ordered tab list built from them.
 * - `TabStripController` (`tabs/ha-page-tab-strip.ts`): `render(open, current)`
 *   draws the tab list, the tabs and the live region.
 * - `TabCatalogController` (`tabs/ha-tab-catalog.ts`): `render(tabs, closed,
 *   current)` draws the New tab button and the catalog popover; `filter` is the
 *   catalog search text and `hide()` closes the popover.
 * - `TabBulkCloseController` (`tabs/ha-tab-bulk-close.ts`): the two bulk close
 *   actions inside the catalog.
 * - `TabSearchesController` (`tabs/ha-tab-searches.ts`): the group searches of
 *   the catalog and the search at the top of the bar.
 *
 * The shell also mounts, once, `ha-page-tab-menu`, `ha-tab-group-picker`,
 * `ha-tab-group-menu` and `ha-tab-group-editor`, and opens the catalog when the
 * menu fires the cancelable `tab-catalog-open`. The strip dispatches `tab-context-menu`,
 * `tab-group-context-menu` and `strip-context-menu` from this element (bubbling
 * and composed), and those elements listen for them and change state only
 * through the model in `common/tabs`; the store controller re-renders the strip
 * whenever one of the saved keys changes.
 */
@customElement("ha-page-tabs")
export class HaPageTabs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Gives the page panel, so the selected tab and the panel can name each other. */
  @property({ attribute: false })
  public panelProvider?: () => HTMLElement | null;

  private _lang = new LanguageModeController(this);

  /** A string from the page tabs block, in the chosen language mode. */
  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  private _store = new TabStoreController(this);

  private _context: TabModuleContext = {
    host: this,
    t: this._t,
    store: this._store,
  };

  private _strip = new TabStripController(this._context);

  private _bulkClose = new TabBulkCloseController(this._context, {
    get: () => this._catalog.filter,
    set: (value) => {
      this._catalog.filter = value;
    },
  });

  private _searches = new TabSearchesController(this._context, () =>
    this._catalog.hide()
  );

  private _catalog: TabCatalogController = new TabCatalogController(
    this._context,
    this._bulkClose,
    this._searches
  );

  @state() private _accessibilityButtonHidden =
    getAccessibilitySettings().hideButton;

  private _unsubAccessibility?: UnsubscribeFunc;

  protected render(): TemplateResult | typeof nothing {
    if (!this.hass?.panels) {
      return nothing;
    }
    const tabs = this._store.orderedTabs();
    const closed = new Set(this._store.closed);
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    // The tab of the page shown, or of the settings page or tool tab that owns
    // the address (the most specific open tab wins).
    const current = this._store.currentTabId();

    return html`
      ${this._strip.render(open, current)}
      ${this._catalog.render(tabs, closed, current)}
      <div class="actions">
        ${this._searches.renderTopSearch(tabs)}
        <button
          class="new-tab search-icon"
          aria-label=${this._t("ui.page_tabs.search_everything")}
          title=${this._t("ui.page_tabs.search_everything")}
          @click=${this._openSearch}
        >
          <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
        </button>
        <button
          class="new-tab"
          aria-label=${this._t("ui.page_tabs.edit_appearance")}
          title=${this._t("ui.page_tabs.edit_appearance")}
          @click=${this._pickAppearance}
        >
          <ha-svg-icon .path=${mdiFormatPaint}></ha-svg-icon>
        </button>
        <a
          class="new-tab"
          href="/profile/localization"
          aria-label=${this._t("ui.page_tabs.language")}
          title=${this._t("ui.page_tabs.language")}
        >
          <ha-svg-icon .path=${mdiTranslate}></ha-svg-icon>
        </a>
        ${
          this._accessibilityButtonHidden
            ? nothing
            : html`<button
                class="new-tab"
                aria-label=${this.hass.localize("ui.accessibility_tools.title")}
                title=${this.hass.localize("ui.accessibility_tools.title")}
                @click=${this._openAccessibility}
              >
                <ha-svg-icon .path=${mdiHuman}></ha-svg-icon>
              </button>`
        }
        ${
          this.hass.user
            ? html`<a
                class="profile"
                href="/profile"
                aria-label=${this._t("ui.page_tabs.profile", {
                  name: this.hass.user.name,
                })}
                title=${this._t("ui.page_tabs.profile", {
                  name: this.hass.user.name,
                })}
              >
                <ha-user-badge .user=${this.hass.user}></ha-user-badge>
              </a>`
            : nothing
        }
      </div>
      <!-- The menus and the group picker listen for the strip's events on
           their own; they only need the instance and the strip they serve. -->
      <ha-page-tab-menu
        .hass=${this.hass}
        .surface=${this._store.surface}
        .tabs=${tabs}
        @tab-catalog-open=${this._onCatalogOpen}
      ></ha-page-tab-menu>
      <ha-tab-group-picker
        .hass=${this.hass}
        .surface=${this._store.surface}
      ></ha-tab-group-picker>
      <ha-tab-group-menu
        .hass=${this.hass}
        .surface=${this._store.surface}
      ></ha-tab-group-menu>
      <ha-tab-group-editor
        .hass=${this.hass}
        .surface=${this._store.surface}
      ></ha-tab-group-editor>
    `;
  }

  // The tab menu asks for the New tab catalog. This shell owns it, so it opens
  // it and says so by cancelling the event.
  private _onCatalogOpen(ev: CustomEvent<{ surface?: string }>) {
    if ((ev.detail?.surface ?? "main") !== this._store.surface) {
      return;
    }
    ev.preventDefault();
    this._catalog.show();
  }

  protected willUpdate() {
    // The edge the strip is docked to, for the styles of the bar and of the shell around it.
    const edge = this._store.dock;
    if (this.getAttribute("dock") !== edge) {
      this.setAttribute("dock", edge);
    }
    this.toggleAttribute("vertical", isVerticalDock(edge));
  }

  public connectedCallback() {
    super.connectedCallback();
    this._accessibilityButtonHidden = getAccessibilitySettings().hideButton;
    this._unsubAccessibility = subscribeAccessibilitySettings((settings) => {
      this._accessibilityButtonHidden = settings.hideButton;
    });
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubAccessibility?.();
    this._unsubAccessibility = undefined;
  }

  private _openSearch() {
    showQuickBar(this, {});
  }

  private _pickAppearance() {
    fireEvent(this, "hass-pick-appearance");
  }

  private _openAccessibility() {
    fireEvent(this, "hass-show-accessibility-tools");
  }

  static styles: CSSResultGroup = [
    tabSharedStyles,
    TabStripController.styles,
    css`
      :host {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        box-sizing: border-box;
        height: 100%;
        padding: 0 var(--ha-space-3) 0 var(--ha-space-5);
        border-bottom: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
        background-color: var(--primary-background-color);
        color: var(--primary-text-color);
        font-family: var(--ha-font-family-body);
        user-select: none;
      }
      .profile {
        display: flex;
        flex: none;
        border-radius: var(--ha-border-radius-circle);
      }
      .profile ha-user-badge {
        width: var(--ha-space-9);
        height: var(--ha-space-9);
      }
      .profile:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .actions {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        flex: none;
        margin-inline-start: auto;
        padding-inline-start: var(--ha-space-4);
      }
      .search-icon {
        display: none;
      }
      /* Narrow bars trade the field for a button that opens the same search. */
      @media (max-width: 700px) {
        .search-icon {
          display: flex;
        }
        :host {
          padding-inline: var(--ha-space-2);
        }
        .actions {
          padding-inline-start: var(--ha-space-1);
        }
      }
      ha-page-tab-menu,
      ha-tab-group-picker,
      ha-tab-group-menu,
      ha-tab-group-editor {
        display: contents;
      }
      /* The bar docked to the bottom edge has its border on top. */
      :host([dock="bottom"]) {
        border-bottom: none;
        border-top: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
      }
      /* A bar on the left or right edge runs top to bottom: tabs, then the
         New tab button, then the tools of the bar at the foot. */
      :host([vertical]) {
        flex-direction: column;
        align-items: stretch;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2);
        border-bottom: none;
      }
      :host([dock="left"]) {
        border-inline-end: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
      }
      :host([dock="right"]) {
        border-inline-start: var(--ha-card-border-width, 0px) solid
          var(--ha-card-border-color, transparent);
      }
      :host([vertical]) .actions {
        flex-wrap: wrap;
        justify-content: center;
        margin-inline-start: 0;
        padding-inline-start: 0;
      }
      :host([vertical]) > .new-tab {
        align-self: center;
      }
      /* The search field needs the width of a top bar: a side bar uses the button. */
      :host([vertical]) .top-search {
        display: none;
      }
      :host([vertical]) .search-icon {
        display: flex;
      }
      /* The catalog opens beside the bar, on the side of its edge. */
      :host([dock="left"]) #catalog {
        inset-inline-start: calc(
          var(--ha-sidebar-width, 88px) +
            var(--ha-page-tabs-side-width, 208px) + var(--ha-space-3)
        );
      }
      :host([dock="right"]) #catalog {
        inset-inline-start: auto;
        inset-inline-end: calc(
          var(--ha-pane-gap, 12px) + var(--ha-page-tabs-side-width, 208px) +
            var(--ha-space-3)
        );
      }
      :host([dock="bottom"]) #catalog {
        top: auto;
        bottom: calc(
          var(--ha-page-tabs-bar-height, 52px) + var(--ha-pane-gap, 12px) +
            var(--ha-space-3)
        );
      }
    `,
    TabCatalogController.styles,
    TabBulkCloseController.styles,
    TabSearchesController.styles,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-tabs": HaPageTabs;
  }
}
