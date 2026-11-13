import {
  mdiBell,
  mdiChevronDoubleLeft,
  mdiChevronDoubleRight,
  mdiCog,
  mdiDockWindow,
  mdiDotsVertical,
  mdiDrag,
  mdiFormatPaint,
  mdiHammer,
  mdiHome,
  mdiHuman,
  mdiMagnify,
  mdiMicrophone,
  mdiPlaylistEdit,
  mdiTranslate,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import {
  getAccessibilitySettings,
  subscribeAccessibilitySettings,
} from "../common/accessibility/accessibility-tools";
import { activityStore } from "../common/activity/activity-store";
import { fireEvent } from "../common/dom/fire_event";
import { navigate } from "../common/navigate";
import {
  IDENTITY_CHANGED_EVENT,
  readIdentity,
} from "../common/identity/identity";
import { throttle } from "../common/util/throttle";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import {
  floatFromPixels,
  floatPixels,
  isVerticalDock,
  readCollapsed,
  readFloat,
  writeCollapsed,
  writeFloat,
} from "../common/tabs/tab-dock";
import { badgeText, paneLayout, readMerged } from "../common/tabs/tab-pane";
import type { SidebarDefaults } from "../common/tabs/tab-entry-defaults";
import {
  entryRoute,
  readSidebarDefaults,
  subscribeSidebarDefaults,
} from "../common/tabs/tab-entry-defaults";
import { subscribeNotifications } from "../data/persistent_notification";
import { subscribeRepairsIssueRegistry } from "../data/repairs";
import type { UpdateEntity } from "../data/update";
import { updateCanInstall } from "../data/update";
import { showQuickBar } from "../dialogs/quick-bar/show-dialog-quick-bar";
import { showEditSidebarDialog } from "../dialogs/sidebar/show-dialog-edit-sidebar";
import { showVoiceCommandDialog } from "../dialogs/voice-command-dialog/show-ha-voice-command-dialog";
import "../panels/config/identity/ha-identity-logo";
import type { HomeAssistant } from "../types";
import { applyTabOrder, moveTabId } from "./tab-order";
import "./ha-dropdown";
import "./ha-dropdown-item";
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

  /** New notifications, counted only while the pane carries the system entries. */
  /** Developer tools shown or not, and the page Settings opens on. */
  @state() private _sidebarDefaults: SidebarDefaults = readSidebarDefaults();

  private _unsubSidebarDefaults?: () => void;

  @state() private _notificationCount = 0;

  private _unsubNotifications?: UnsubscribeFunc;

  /** Installable updates and open repairs: the badge the rail put on Settings. */
  @state() private _updatesCount = 0;

  @state() private _issuesCount = 0;

  /** Running tasks that need attention, counted with the notifications. */
  @state() private _activityCount = 0;

  private _unsubIssues?: UnsubscribeFunc;

  private _unsubActivities?: () => void;

  /** The name shown beside the brand tile of the wide pane. */
  @state() private _identityName?: string;

  private _calculateUpdates = throttle(() => {
    const states = this.hass?.states;
    if (!states) {
      return;
    }
    let count = 0;
    for (const entityId of Object.keys(states)) {
      if (
        entityId.startsWith("update.") &&
        !this.hass.entities?.[entityId]?.hidden &&
        updateCanInstall(states[entityId] as UpdateEntity)
      ) {
        count++;
      }
    }
    this._updatesCount = count;
  }, 5000);

  private _identityChanged = () => {
    this._identityName = readIdentity().name;
  };

  /** While the floating strip is being dragged: where the pointer took hold of it. */
  private _drag?: { pointer: number; dx: number; dy: number };

  private _onWindowResize = () => this._placeFloat();

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

    const edge = this._store.dock;
    const collapsed = readCollapsed(this._store.surface);
    const pane = paneLayout({
      edge,
      collapsed,
      merged: readMerged(this._store.surface),
    });
    // The arrows point the way the strip will go: toward its own edge to collapse.
    const towardEdge =
      edge === "right" ? mdiChevronDoubleRight : mdiChevronDoubleLeft;
    const awayFromEdge =
      edge === "right" ? mdiChevronDoubleLeft : mdiChevronDoubleRight;
    return html`
      <div class="strip-tools">
        ${
          pane.brand
            ? html`<a
                class="brand"
                href="/"
                aria-label=${this._t("ui.page_tabs.pane.home")}
                title=${this._t("ui.page_tabs.pane.home")}
              >
                <ha-identity-logo
                  style="--identity-logo-size: 40px; --identity-logo-radius: var(--ha-border-radius-xl)"
                ></ha-identity-logo>
                <span class="brand-name"
                  >${
                    this._identityName ||
                    this.hass.config?.location_name ||
                    "Home Assistant"
                  }</span
                >
              </a>`
            : nothing
        }
        ${
          pane.homeButton
            ? html`<a
                class="new-tab home"
                href="/"
                aria-label=${this._t("ui.page_tabs.pane.home")}
                title=${this._t("ui.page_tabs.pane.home")}
              >
                <ha-svg-icon .path=${mdiHome}></ha-svg-icon>
              </a>`
            : nothing
        }
        ${
          edge === "float"
            ? html`<button
                class="new-tab grip"
                aria-label=${this._t("ui.page_tabs.float_handle")}
                title=${this._t("ui.page_tabs.float_handle")}
                @pointerdown=${this._dragStart}
                @pointermove=${this._dragMove}
                @pointerup=${this._dragEnd}
                @pointercancel=${this._dragEnd}
                @keydown=${this._gripKey}
              >
                <ha-svg-icon .path=${mdiDrag}></ha-svg-icon>
              </button>`
            : nothing
        }
        <button
          class="new-tab dock-menu"
          aria-label=${this._t("ui.page_tabs.menu.dock_setting_header")}
          title=${this._t("ui.page_tabs.menu.dock_setting_header")}
          aria-haspopup="menu"
          @click=${this._openStripMenu}
        >
          <ha-svg-icon .path=${mdiDockWindow}></ha-svg-icon>
        </button>
        <button
          class="new-tab collapse"
          aria-label=${this._t(
            collapsed
              ? "ui.page_tabs.menu.expand_strip"
              : "ui.page_tabs.menu.collapse_strip"
          )}
          title=${this._t(
            collapsed
              ? "ui.page_tabs.menu.expand_strip"
              : "ui.page_tabs.menu.collapse_strip"
          )}
          aria-expanded=${collapsed ? "false" : "true"}
          @click=${this._toggleCollapsed}
        >
          <ha-svg-icon
            .path=${collapsed ? awayFromEdge : towardEdge}
          ></ha-svg-icon>
        </button>
      </div>
      ${pane.searchAtTop ? this._searches.renderTopSearch(tabs) : nothing}
      ${
        pane.sectionLabels
          ? html`<div class="section-label">
              ${this._t("ui.page_tabs.pane.pages")}
            </div>`
          : nothing
      }
      ${this._strip.render(open, current)}
      ${this._catalog.render(tabs, closed, current)}
      ${
        pane.systemEntries && isVerticalDock(edge)
          ? html`<nav
              class="system"
              aria-label=${this._t("ui.page_tabs.pane.system")}
            >
              ${
                pane.sectionLabels
                  ? html`<div class="section-label">
                      ${this._t("ui.page_tabs.pane.system")}
                    </div>`
                  : nothing
              }
              ${this._renderSystemEntries(pane.systemNames)}
            </nav>`
          : nothing
      }
      <div class="actions">
        ${pane.searchAtTop ? nothing : this._searches.renderTopSearch(tabs)}
        ${
          pane.systemEntries && !isVerticalDock(edge)
            ? this._renderSystemEntries(false)
            : nothing
        }
        <button
          class="new-tab search-icon"
          aria-label=${this._t("ui.page_tabs.search_everything")}
          title=${this._t("ui.page_tabs.search_everything")}
          @click=${this._openSearch}
        >
          <ha-svg-icon .path=${mdiMagnify}></ha-svg-icon>
        </button>
        ${pane.profileName ? nothing : this._renderTools(pane.railTools)}
        <div class="person">
          ${this._renderProfile(pane.profileName)}
          ${pane.profileName ? this._renderPersonMenu() : nothing}
          ${
            pane.railTools &&
            this.hass.config?.components?.includes("conversation")
              ? html`<button
                  class="new-tab assist"
                  aria-label=${this.hass.localize("ui.sidebar.assist")}
                  title=${this.hass.localize("ui.sidebar.assist")}
                  @click=${this._openAssist}
                >
                  <ha-svg-icon .path=${mdiMicrophone}></ha-svg-icon>
                </button>`
              : nothing
          }
        </div>
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

  /** The tools of a bar or of a narrow pane: appearance, language, accessibility, sidebar. */
  private _renderTools(railTools: boolean): TemplateResult {
    return html`
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
        railTools
          ? html`<button
              class="new-tab"
              aria-label=${this.hass.localize("ui.sidebar.edit_sidebar")}
              title=${this.hass.localize("ui.sidebar.edit_sidebar")}
              @click=${this._editSidebar}
            >
              <ha-svg-icon .path=${mdiPlaylistEdit}></ha-svg-icon>
            </button>`
          : nothing
      }
    `;
  }

  /** The words under the person's name: owner, administrator or user. */
  private _roleLabel(): string {
    const user = this.hass.user;
    if (!user) {
      return "";
    }
    return this._t(
      user.is_owner
        ? "ui.page_tabs.pane.role_owner"
        : user.is_admin
          ? "ui.page_tabs.pane.role_admin"
          : "ui.page_tabs.pane.role_user"
    );
  }

  /** The person's picture, and in the wide pane their name with the role under it. */
  private _renderProfile(wide: boolean): TemplateResult | typeof nothing {
    const user = this.hass.user;
    if (!user) {
      return nothing;
    }
    const label = this._t("ui.page_tabs.profile", { name: user.name });
    return html`<a
      class="profile"
      href="/profile"
      aria-label=${label}
      title=${label}
    >
      <ha-user-badge .user=${user}></ha-user-badge>
      ${
        wide
          ? html`<span class="profile-text"
              ><span class="profile-name">${user.name}</span
              ><span class="profile-role">${this._roleLabel()}</span></span
            >`
          : nothing
      }
    </a>`;
  }

  /** The tools the wide pane keeps out of sight, in the menu at its foot. */
  private _renderPersonMenu(): TemplateResult {
    const label = this._t("ui.page_tabs.pane.more_tools");
    return html`<ha-dropdown
      class="person-menu"
      placement="top-end"
      @wa-select=${this._personMenuSelect}
    >
      <button
        slot="trigger"
        class="new-tab"
        aria-label=${label}
        title=${label}
        aria-haspopup="menu"
      >
        <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
      </button>
      <ha-dropdown-item value="appearance">
        <ha-svg-icon slot="icon" .path=${mdiFormatPaint}></ha-svg-icon>
        ${this._t("ui.page_tabs.edit_appearance")}
      </ha-dropdown-item>
      <ha-dropdown-item value="language">
        <ha-svg-icon slot="icon" .path=${mdiTranslate}></ha-svg-icon>
        ${this._t("ui.page_tabs.language")}
      </ha-dropdown-item>
      ${
        this._accessibilityButtonHidden
          ? nothing
          : html`<ha-dropdown-item value="accessibility">
              <ha-svg-icon slot="icon" .path=${mdiHuman}></ha-svg-icon>
              ${this.hass.localize("ui.accessibility_tools.title")}
            </ha-dropdown-item>`
      }
      <ha-dropdown-item value="sidebar">
        <ha-svg-icon slot="icon" .path=${mdiPlaylistEdit}></ha-svg-icon>
        ${this.hass.localize("ui.sidebar.edit_sidebar")}
      </ha-dropdown-item>
    </ha-dropdown>`;
  }

  private _personMenuSelect(ev: CustomEvent<{ item: { value: string } }>) {
    switch (ev.detail.item.value) {
      case "appearance":
        this._pickAppearance();
        break;
      case "language":
        navigate("/profile/localization");
        break;
      case "accessibility":
        this._openAccessibility();
        break;
      case "sidebar":
        this._editSidebar();
        break;
    }
  }

  /** Settings, developer tools and notifications: what the side rail carries. */
  private _renderSystemEntries(names: boolean): TemplateResult {
    const admin = Boolean(this.hass.user?.is_admin);
    const onTools = window.location.pathname.startsWith("/config/tools");
    const entry = (
      className: string,
      icon: string,
      label: string,
      selected: boolean,
      href?: string,
      onClick?: () => void,
      count = 0
    ) => {
      const classes = classMap({
        "system-item": true,
        selected,
        [className]: true,
      });
      const inner = html`<ha-svg-icon .path=${icon}></ha-svg-icon>${
          names ? html`<span class="system-label">${label}</span>` : nothing
        }`;
      return href
        ? html`<a
            class=${classes}
            href=${href}
            aria-label=${count > 0 ? `${label} (${badgeText(count)})` : label}
            title=${label}
            aria-current=${selected ? "page" : "false"}
            >${inner}${this._renderBadge(count)}</a
          >`
        : html`<button
            class=${classes}
            aria-label=${count > 0 ? `${label} (${badgeText(count)})` : label}
            title=${label}
            @click=${onClick}
          >
            ${inner}${this._renderBadge(count)}
          </button>`;
    };
    // A name the person gave the entry in Settings, Sidebar; the original name
    // stays the fallback.
    const looks = this._store.appearance[this._store.surface] ?? {};
    const named = (id: string, original: string) =>
      looks[id]?.label || original;
    return html`
      ${
        admin && this._sidebarDefaults.showDeveloperTools
          ? entry(
              "tools",
              mdiHammer,
              named("tools", this.hass.localize("ui.sidebar.developer_tools")),
              onTools,
              entryRoute("tools")
            )
          : nothing
      }
      ${
        admin
          ? entry(
              "settings",
              mdiCog,
              named("config", this.hass.localize("panel.config")),
              this.hass.panelUrl === "config" && !onTools,
              entryRoute("config"),
              undefined,
              this._updatesCount + this._issuesCount
            )
          : nothing
      }
      ${entry(
        "notifications",
        mdiBell,
        named(
          "notifications",
          this.hass.localize("ui.notification_drawer.title")
        ),
        false,
        undefined,
        () => fireEvent(this, "hass-show-notifications"),
        this._notificationCount + this._activityCount
      )}
    `;
  }

  private _renderBadge(count: number) {
    const text = badgeText(count);
    return text
      ? html`<span class="count" aria-hidden="true">${text}</span>`
      : nothing;
  }

  /** Counts notifications only while the pane carries the system entries. */
  private _syncNotifications() {
    const wanted = readMerged(this._store.surface) && !!this.hass?.connection;
    if (wanted && !this._unsubNotifications) {
      this._unsubNotifications = subscribeNotifications(
        this.hass.connection,
        (notifications) => {
          this._notificationCount = notifications.length;
        }
      );
    } else if (!wanted && this._unsubNotifications) {
      this._unsubNotifications();
      this._unsubNotifications = undefined;
      this._notificationCount = 0;
    }
    // Repairs, installable updates and running tasks feed the badges of
    // Settings and Notifications, as they did on the rail.
    const admin = Boolean(this.hass?.user?.is_admin);
    if (wanted && admin && !this._unsubIssues) {
      this._unsubIssues = subscribeRepairsIssueRegistry(
        this.hass.connection,
        (repairs) => {
          this._issuesCount = repairs.issues.filter(
            (issue) => !issue.ignored
          ).length;
        }
      );
    } else if ((!wanted || !admin) && this._unsubIssues) {
      this._unsubIssues();
      this._unsubIssues = undefined;
      this._issuesCount = 0;
    }
    if (wanted && !this._unsubActivities) {
      this._unsubActivities = activityStore.subscribe(() => {
        this._activityCount = activityStore.attentionCount;
      });
      this._activityCount = activityStore.attentionCount;
    } else if (!wanted && this._unsubActivities) {
      this._unsubActivities();
      this._unsubActivities = undefined;
      this._activityCount = 0;
    }
    if (wanted && admin) {
      this._calculateUpdates();
    } else if (this._updatesCount) {
      this._updatesCount = 0;
    }
  }

  private _editSidebar() {
    showEditSidebarDialog(this);
  }

  private _openAssist() {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
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
    this.toggleAttribute("collapsed", readCollapsed(this._store.surface));
    this.toggleAttribute("merged", readMerged(this._store.surface));
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    this._placeFloat();
    this._syncNotifications();
  }

  /** The menu of the strip itself: where it docks, collapsing, new tab and group. */
  private _openStripMenu(ev: Event) {
    this.dispatchEvent(
      new CustomEvent("strip-context-menu", {
        detail: {
          anchor: ev.currentTarget as HTMLElement,
          surface: this._store.surface,
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _toggleCollapsed() {
    writeCollapsed(this._store.surface, !readCollapsed(this._store.surface));
    this.requestUpdate();
  }

  private _windowSize() {
    return { width: window.innerWidth, height: window.innerHeight };
  }

  /** Puts a floating strip where it was left, kept on screen; clears the place otherwise. */
  private _placeFloat() {
    if (this._store.dock !== "float") {
      this.style.removeProperty("--ha-page-tabs-float-left");
      this.style.removeProperty("--ha-page-tabs-float-top");
      return;
    }
    if (this._drag) {
      return;
    }
    const { left, top } = floatPixels(
      readFloat(this._store.surface),
      { width: this.offsetWidth, height: this.offsetHeight },
      this._windowSize()
    );
    this._setFloat(left, top);
  }

  private _setFloat(left: number, top: number) {
    this.style.setProperty("--ha-page-tabs-float-left", `${left}px`);
    this.style.setProperty("--ha-page-tabs-float-top", `${top}px`);
  }

  private _saveFloat(left: number, top: number) {
    writeFloat(
      this._store.surface,
      floatFromPixels(left, top, this._windowSize())
    );
  }

  private _dragStart(ev: PointerEvent) {
    if (ev.button !== 0) {
      return;
    }
    const box = this.getBoundingClientRect();
    this._drag = {
      pointer: ev.pointerId,
      dx: ev.clientX - box.left,
      dy: ev.clientY - box.top,
    };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this.toggleAttribute("dragging", true);
    ev.preventDefault();
  }

  private _dragMove(ev: PointerEvent) {
    if (!this._drag || ev.pointerId !== this._drag.pointer) {
      return;
    }
    const size = this._windowSize();
    const { left, top } = floatPixels(
      floatFromPixels(
        ev.clientX - this._drag.dx,
        ev.clientY - this._drag.dy,
        size
      ),
      { width: this.offsetWidth, height: this.offsetHeight },
      size
    );
    this._setFloat(left, top);
  }

  private _dragEnd(ev: PointerEvent) {
    if (!this._drag || ev.pointerId !== this._drag.pointer) {
      return;
    }
    this._drag = undefined;
    this.toggleAttribute("dragging", false);
    const box = this.getBoundingClientRect();
    this._saveFloat(box.left, box.top);
  }

  /** The arrow keys move a floating strip: 16 pixels, or 64 with Shift. */
  private _gripKey(ev: KeyboardEvent) {
    const step = ev.shiftKey ? 64 : 16;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const move = moves[ev.key];
    if (!move) {
      return;
    }
    ev.preventDefault();
    const box = this.getBoundingClientRect();
    const size = this._windowSize();
    const { left, top } = floatPixels(
      floatFromPixels(box.left + move[0], box.top + move[1], size),
      { width: this.offsetWidth, height: this.offsetHeight },
      size
    );
    this._setFloat(left, top);
    this._saveFloat(left, top);
  }

  public connectedCallback() {
    super.connectedCallback();
    this._accessibilityButtonHidden = getAccessibilitySettings().hideButton;
    this._unsubAccessibility = subscribeAccessibilitySettings((settings) => {
      this._accessibilityButtonHidden = settings.hideButton;
    });
    window.addEventListener("resize", this._onWindowResize);
    window.addEventListener(IDENTITY_CHANGED_EVENT, this._identityChanged);
    this._sidebarDefaults = readSidebarDefaults();
    this._unsubSidebarDefaults = subscribeSidebarDefaults((value) => {
      this._sidebarDefaults = value;
    });
    this._identityChanged();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(IDENTITY_CHANGED_EVENT, this._identityChanged);
    this._unsubIssues?.();
    this._unsubIssues = undefined;
    this._unsubActivities?.();
    this._unsubActivities = undefined;
    this._unsubAccessibility?.();
    this._unsubAccessibility = undefined;
    this._unsubSidebarDefaults?.();
    this._unsubSidebarDefaults = undefined;
    this._unsubNotifications?.();
    this._unsubNotifications = undefined;
    window.removeEventListener("resize", this._onWindowResize);
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
        /* The initial must stay readable in the dark theme, where the
           default light primary pair is dark on dark. */
        --light-primary-color: var(--ha-color-primary-container);
        --text-light-primary-color: var(--ha-color-on-primary-container);
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
      .strip-tools .new-tab {
        anchor-name: none;
      }
      .strip-tools {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        flex: none;
      }
      :host([vertical]) .strip-tools {
        justify-content: space-between;
      }
      :host([vertical][collapsed]) .strip-tools {
        flex-direction: column;
      }
      /* A collapsed bar keeps its tabs as icons; the tools at its foot go to the overflow of the rail. */
      :host([collapsed])
        .actions
        > :not(.person):not(.search-icon):not(.system-item.tools) {
        display: none;
      }
      /* The person and Assist: one row where the pane has room, plain
         neighbours of the other tools on a bar. */
      .person {
        display: contents;
      }
      :host([vertical][merged]) .person {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        flex: 1 1 100%;
        min-width: 0;
      }
      :host([vertical][merged]) .person .profile {
        flex: 1 1 auto;
        min-width: 0;
      }
      :host([vertical][merged][collapsed]) .person {
        flex-direction: column;
        flex: none;
      }
      :host([vertical][merged][collapsed]) .person .profile {
        flex: none;
      }
      .assist {
        color: var(--primary-text-color);
      }
      :host([vertical][collapsed]) {
        padding-inline: var(--ha-space-1);
      }
      :host([vertical][collapsed]) .search-icon {
        display: flex;
      }
      /* The merged pane: headings, the system entries and the person's name. */
      .section-label {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: var(--secondary-text-color);
      }
      :host([vertical][merged]:not([collapsed])) .top-search {
        display: flex;
      }
      :host([vertical][merged]:not([collapsed])) .search-icon {
        display: none;
      }
      .system {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        flex: none;
        margin-top: auto;
      }
      :host([vertical][collapsed]) .system {
        align-items: center;
      }
      .system-item {
        position: relative;
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        /* An entry without a link is a native button, which centres what it
           holds; every entry reads from the start edge. */
        justify-content: flex-start;
        text-align: start;
        min-height: var(--ha-space-10);
        padding: 0 var(--ha-space-3);
        border: none;
        border-radius: var(--ha-border-radius-pill);
        background: none;
        color: var(--primary-text-color);
        font: inherit;
        cursor: pointer;
        text-decoration: none;
      }
      .system-item:hover {
        background: var(--secondary-background-color);
      }
      .system-item.selected {
        background: var(--secondary-background-color);
        color: var(--primary-color);
      }
      .system-item:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .system-label {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .count {
        position: absolute;
        top: 2px;
        inset-inline-end: 2px;
        min-width: var(--ha-space-4);
        padding: 0 var(--ha-space-1);
        border-radius: var(--ha-border-radius-pill);
        background: var(--error-color);
        color: var(--text-primary-color);
        font-size: var(--ha-font-size-xs);
        line-height: var(--ha-space-4);
        text-align: center;
      }
      :host([vertical][merged]:not([collapsed])) .count {
        position: static;
      }
      :host([vertical][merged]:not([collapsed])) .profile {
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
      }
      .profile-text {
        display: flex;
        flex-direction: column;
        min-width: 0;
        line-height: 1.25;
      }
      .profile-name,
      .profile-role {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .profile-name {
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .profile-role {
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .person-menu {
        display: contents;
      }
      :host([vertical][merged]:not([collapsed])) .actions {
        justify-content: flex-start;
      }
      /* The merged pane on the left: a floating card beside the page card, with
         the brand, a pill search, headings, tonal rows and the person at the foot. */
      :host([dock="left"][merged]) {
        --ha-page-tab-height: 44px;
        gap: var(--ha-space-1);
        padding: var(--ha-space-3);
        border: none;
        border-radius: var(--ha-pane-radius, var(--ha-border-radius-4xl));
        background-color: var(
          --ha-card-background,
          var(--card-background-color, var(--primary-background-color))
        );
        box-shadow: var(--ha-shadow-card);
      }
      :host([dock="left"][merged][collapsed]) {
        padding-inline: var(--ha-space-2);
        align-items: center;
      }
      .brand {
        display: flex;
        align-items: center;
        flex: 1 1 auto;
        gap: var(--ha-space-3);
        min-width: 0;
        padding-block: var(--ha-space-1);
        border-radius: var(--ha-border-radius-xl);
        color: var(--primary-text-color);
        text-decoration: none;
      }
      .brand:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .brand-name {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-title, var(--ha-font-weight-medium));
      }
      /* The search is a full-width pill; the shortcut stays at its end. */
      :host([vertical][merged]:not([collapsed])) .top-search {
        width: 100%;
        --ha-input-search-height: 44px;
      }
      :host([vertical][merged]:not([collapsed])) .top-search kbd {
        display: inline-block;
      }
      /* The open pages are rows, the open one a tonal pill. */
      :host([vertical][merged]) .tab.selected {
        background-color: var(
          --tab-background,
          var(--ha-color-primary-container)
        );
        color: var(--tab-color, var(--ha-color-on-primary-container));
      }
      .new-tab-label {
        display: none;
      }
      /* New tab is a row of its own under the open pages. */
      :host([vertical][merged]:not([collapsed])) button.new-tab[popovertarget] {
        align-self: stretch;
        width: auto;
        height: 44px;
        justify-content: flex-start;
        gap: var(--ha-space-3);
        padding-inline: var(--ha-space-4);
        border-radius: var(--ha-border-radius-pill);
        color: var(--primary-color);
        font-weight: var(--ha-font-weight-medium);
      }
      :host([vertical][merged]:not([collapsed])) .new-tab-label {
        display: inline;
      }
      /* A merged pane keeps its names on a window narrower than 1100 px too. */
      :host([vertical][merged]:not([collapsed])) .system-item {
        min-height: 44px;
      }
      /* Floating: a card over the page that the person drags by its handle. */
      :host([dock="float"]) {
        border: none;
        border-radius: var(--ha-border-radius-3xl);
        box-shadow: var(--ha-box-shadow-l);
        background-color: var(
          --ha-card-background,
          var(--card-background-color, var(--primary-background-color))
        );
      }
      .grip {
        cursor: grab;
        touch-action: none;
      }
      :host([dragging]) .grip {
        cursor: grabbing;
      }
      :host([dragging]) {
        opacity: 0.92;
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
      :host([dock="float"]) #catalog {
        inset-inline-start: calc(
          var(--ha-page-tabs-float-left, 120px) +
            var(--ha-page-tabs-side-width, 208px) + var(--ha-space-3)
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
