import {
  mdiArrowCollapseDown,
  mdiArrowCollapseUp,
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronLeft,
  mdiChevronRight,
  mdiClose,
  mdiChevronDown,
  mdiDotsVertical,
  mdiDragVertical,
  mdiFolderMove,
  mdiFolderRemove,
  mdiFormatPaint,
  mdiCog,
  mdiHome,
  mdiHuman,
  mdiLock,
  mdiLockOpenVariant,
  mdiMagnify,
  mdiMenu,
  mdiPin,
  mdiPinOff,
  mdiPlus,
  mdiTab,
  mdiTabPlus,
  mdiUpload,
  mdiTabRemove,
  mdiUndo,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { pickFilesToAdd } from "../../common/file-drop/add-media";
import { getStorage, storage } from "../../common/decorators/storage";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { fireEvent } from "../../common/dom/fire_event";
import { spansForMode } from "../../common/language-mode/bilingual-text";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  isUnlocked,
  setLockLocalize,
  subscribeUnlocks,
} from "../../common/locks/element-lock-session";
import type { LockStore } from "../../common/locks/element-locks";
import { readLocks, subscribeLocks } from "../../common/locks/element-locks";
import { navigate } from "../../common/navigate";
import { searchMatcher } from "../../common/regex/filter";
import type { BulkCloseMode } from "../../common/tabs/bulk-close";
import type { TabAppearanceStore } from "../../common/tabs/tab-appearance-store";
import {
  readTabAppearance,
  TAB_APPEARANCE_STORAGE_KEY,
} from "../../common/tabs/tab-appearance-store";
import type { TabGroup } from "../../common/tabs/tab-groups";
import {
  GROUPS_STORAGE_KEY,
  readGroups,
  setGroupCollapsed,
  ungroupTabs,
  writeGroups,
} from "../../common/tabs/tab-groups";
import {
  groupLockKey,
  tabLockKey,
  tabLockState,
} from "../../common/tabs/tab-locks";
import type { TabGroupId } from "../../common/tabs/tab-group-search";
import {
  filterGroupItems,
  TAB_GROUP_IDS,
} from "../../common/tabs/tab-group-search";
import { mainWindow } from "../../common/dom/get_main_window";
import { getDefaultPanelUrlPath } from "../../data/panel";
import { subscribeNotifications } from "../../data/persistent_notification";
import { subscribeRepairsIssueRegistry } from "../../data/repairs";
import type { UpdateEntity } from "../../data/update";
import { updateCanInstall } from "../../data/update";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant } from "../../types";
import type { PageTab } from "../ha-page-tabs";
import {
  CLOSED_TABS_STORAGE_KEY,
  PINNED_TABS_STORAGE_KEY,
  TABS_ORDER_STORAGE_KEY,
} from "../ha-page-tabs";
import {
  neighbourTab,
  parseDestinationId,
  tabRoute,
} from "../../common/tabs/tab-destinations";
import {
  entryRoute,
  tabEntryRoute,
} from "../../common/tabs/tab-entry-defaults";
import {
  chooseDestination,
  computeStripTabs,
  currentTabId,
} from "../tabs/destination-tabs";
import type { GroupAppearanceStore } from "../tabs/tab-group-appearance-store";
import {
  GROUP_APPEARANCE_STORAGE_KEY,
  groupAppearanceFor,
  groupChipStyle,
  groupColourCss,
  readGroupAppearance,
} from "../tabs/tab-group-appearance-store";
import "../tabs/ha-tab-appearance-editor";
import type { HaTabAppearanceEditor } from "../tabs/ha-tab-appearance-editor";
import "../tabs/ha-tab-group-editor";
import "../tabs/ha-tab-group-menu";
import "../tabs/ha-tab-group-picker";
import { pendingLockKey, tabStyle } from "../tabs/tab-strip-layout";
import { flattenSegments } from "../tabs/tab-strip-moves";
import type { CatalogSettingsEntry } from "../page-catalog-entries";
import {
  computeSettingsEntries,
  computeToolEntries,
  loadCatalogTranslations,
} from "../page-catalog-entries";
import "../ha-svg-icon";
import "../ha-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import type { PhoneActionItem } from "./ha-phone-tab-actions";
import "./ha-phone-bulk-close";
import "./ha-phone-tab-actions";
import type { PhoneChange, PhoneChangeInput } from "./phone-groups";
import {
  groupIdOf,
  phoneSections,
  phoneSegments,
  planPhoneDrop,
  planPhoneMove,
} from "./phone-groups";
import type {
  ActionEntry,
  ActionReason,
  CloseKind,
  HeaderActionId,
  MoveKind,
  PageActionId,
  PhonePage,
} from "./phone-page-actions";
import {
  dropAfter,
  headerActions,
  pageActions,
  planClose,
} from "./phone-page-actions";

/** The strip the sheet shows: the wide strip's own lists, groups and locks. */
const PHONE_SURFACE = "main";

/** The lock windows the lock code adds to the page; the sheet sits under them. */
const LOCK_PANELS = ["ha-lock-wizard", "ha-lock-prompt"];

/** Actions that open another panel, which then takes the focus. */
const PANEL_ACTIONS: PageActionId[] = [
  "lock",
  "unlock",
  "move_into_group",
  "edit_appearance",
];

const UNDO_MS = 5000;
/** Holding a card this long opens its actions. */
const LONG_PRESS_MS = 500;
/** Moving further than this cancels a long press. */
const LONG_PRESS_SLOP_PX = 10;

const PAGE_ACTION_VIEW: Record<PageActionId, [string, string]> = {
  pin: ["ui.phone.action_pin", mdiPin],
  unpin: ["ui.phone.action_unpin", mdiPinOff],
  lock: ["ui.phone.action_lock", mdiLock],
  unlock: ["ui.phone.action_unlock", mdiLockOpenVariant],
  move_into_group: ["ui.phone.action_move_into_group", mdiFolderMove],
  remove_from_group: ["ui.phone.action_remove_from_group", mdiFolderRemove],
  edit_appearance: ["ui.phone.action_edit_appearance", mdiFormatPaint],
  close: ["ui.phone.action_close", mdiClose],
  close_others: ["ui.phone.action_close_others", mdiTabRemove],
  close_above: ["ui.phone.action_close_above", mdiTabRemove],
  close_below: ["ui.phone.action_close_below", mdiTabRemove],
  move_up: ["ui.phone.action_move_up", mdiArrowUp],
  move_down: ["ui.phone.action_move_down", mdiArrowDown],
  move_top: ["ui.phone.action_move_top", mdiArrowCollapseUp],
  move_bottom: ["ui.phone.action_move_bottom", mdiArrowCollapseDown],
};

const HEADER_ACTION_VIEW: Record<HeaderActionId, [string, string]> = {
  open_every: ["ui.phone.action_open_every", mdiTabPlus],
  bulk_contain: ["ui.phone.action_bulk_contain", mdiTabRemove],
  bulk_not_contain: ["ui.phone.action_bulk_not_contain", mdiTabRemove],
  close_others: ["ui.phone.action_close_others_all", mdiTabRemove],
  add_media: ["ui.drop_upload.add_media", mdiUpload],
};

const REASON_VIEW: Record<ActionReason, string> = {
  pinned: "ui.phone.reason_pinned",
  locked: "ui.phone.reason_locked",
  current: "ui.phone.reason_current",
  nothing_to_close: "ui.phone.reason_nothing_to_close",
  at_top: "ui.phone.reason_at_top",
  at_bottom: "ui.phone.reason_at_bottom",
};

/** Where focus goes when a panel over the sheet closes. */
type FocusTarget = { row: string } | "header" | "pages";
const SWIPE_CLOSE_PX = 96;
const SWIPE_SWITCH_PX = 48;
/** The keyboard is up when the visible height drops by more than this. */
const KEYBOARD_PX = 150;
/**
 * Set on the document root: the bar's height while it is shown and `0px` while
 * it is hidden. Absent when there is no phone bar.
 */
const VISIBLE_HEIGHT_PROPERTY = "--ha-phone-bar-visible-height";
const VIEWPORT_INSET_PROPERTY = "--ha-phone-viewport-inset-bottom";
/**
 * The floating bar rests this far above the bottom edge. The space it takes
 * from a page is its height plus this gap, so the published height includes
 * it and the layout reserves the same amount (`--ha-phone-bar-height`).
 */
const BAR_GAP_PX = 12;

/**
 * @element ha-phone-bar
 *
 * @summary
 * What replaces the tab bar below 700 px. A bottom bar with Home, Search,
 * Pages, Settings and Menu, floating as a rounded pill; a slim top bar that shows the current page and
 * switches between open pages by swipe or arrow buttons; and the Pages sheet
 * that lists the open pages as cards, with a search, New tab, bulk close and
 * Undo. The open pages are the same ones the tab bar shows on a wide window.
 */
@customElement("ha-phone-bar")
export class HaPhoneBar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** True below 700 px. Nothing is drawn otherwise. */
  @property({ type: Boolean, reflect: true }) public phone = false;

  @state()
  @storage({ key: CLOSED_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _closed: string[] = [];

  /** The order the person gave the tabs, shared with the tab bar. */
  @state()
  @storage({ key: TABS_ORDER_STORAGE_KEY, state: true, subscribe: true })
  private _order: string[] = [];

  /** Pinned tabs sit first and are never closed by a bulk close. */
  @state()
  @storage({ key: PINNED_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _pinned: string[] = [];

  /** What the shared tab stores hold for the wide strip, read once per change. */
  @state() private _shared: {
    groups: TabGroup[];
    look: TabAppearanceStore;
    groupLook: GroupAppearanceStore;
    locks: LockStore;
  } = { groups: [], look: {}, groupLook: {}, locks: readLocks() };

  // Draws the bar again when the language mode changes.
  private _lang = new LanguageModeController(this);

  private _unsubscribe: (() => void)[] = [];

  private _lockObserver?: MutationObserver;

  @state() private _barHidden = false;

  @state() private _filter = "";

  /** True while the sheet lists every page instead of the open ones. */
  @state() private _catalog = false;

  /** The search text of each group of the catalog, one field per group. */
  @state() private _groupFilters: Record<TabGroupId, string> = {
    pinned: "",
    pages: "",
    settings: "",
    tools: "",
  };

  /** Pages closed last, kept for Undo. */
  @state() private _undo?: { ids: string[]; name: string };

  /** Sideways drag of a card or of the top bar, in pixels. */
  @state() private _dragId?: string;

  @state() private _dragX = 0;

  /** The page whose actions panel is open. */
  @state() private _actionsFor?: string;

  /** True while the sheet's header menu is open. */
  @state() private _headerMenu = false;

  /** Set while the bulk close review is open. */
  @state() private _bulkMode?: BulkCloseMode;

  /** The page being dragged by its handle, and the drop mark. */
  @state() private _reorder?: { id: string; to?: string; after?: boolean };

  /** Said out loud by the sheet's live region. */
  @state() private _live = "";

  /** Updates that can be installed plus repairs: the badge on Settings. */
  @state() private _settingsCount = 0;

  /** Whether any persistent notification is waiting: the dot on Menu. */
  @state() private _hasNotifications = false;

  /** Whether the Pages sheet is open, which makes Pages the active item. */
  @state() private _pagesOpen = false;

  private _issueCount = 0;

  private _statusConnection?: unknown;

  private _statusUnsubscribe: (() => void)[] = [];

  @query("#sheet") private _sheet?: HTMLElement;

  @query("ha-tab-appearance-editor")
  private _lookEditor?: HaTabAppearanceEditor;

  @query('.item[data-item="pages"]') private _pagesItem?: HTMLElement;

  @query("nav.bar") private _bar?: HTMLElement;

  private _barResize?: ResizeObserver;

  @queryAll(".more")
  private _moreButtons!: NodeListOf<HTMLElement & { urlPath?: string }>;

  @queryAll(".handle")
  private _handles!: NodeListOf<HTMLElement & { urlPath?: string }>;

  private _undoTimer?: number;

  private _pressTimer?: number;

  private _pressX = 0;

  private _pressY = 0;

  private _returnFocus: FocusTarget = "pages";

  private _viewportFrame?: number;

  private _closedAt = 0;

  private _dragStartX = 0;

  private _swallowClick = false;

  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener("scroll", this._scheduleViewport, {
      passive: true,
    });
    window.addEventListener("resize", this._scheduleViewport, {
      passive: true,
    });
    mainWindow.addEventListener("location-changed", this._locationChanged);
    mainWindow.addEventListener("popstate", this._locationChanged);
    window.visualViewport?.addEventListener("resize", this._scheduleViewport);
    window.visualViewport?.addEventListener("scroll", this._scheduleViewport);
    this._scheduleViewport();
    this.addEventListener("focusin", this._handleFocusIn);
    this.addEventListener("focusout", this._handleFocusOut);
    const store = getStorage();
    [
      GROUPS_STORAGE_KEY,
      TAB_APPEARANCE_STORAGE_KEY,
      GROUP_APPEARANCE_STORAGE_KEY,
    ].forEach((key) => {
      store.addFromStorage(key);
      this._unsubscribe.push(
        store.subscribeChanges(key, () => this._refreshShared())
      );
    });
    this._unsubscribe.push(
      subscribeLocks(() => this._refreshShared()),
      subscribeUnlocks(() => this.requestUpdate())
    );
    this._refreshShared();
    // The lock windows are plain page elements, so an open sheet, which is in
    // the top layer, would cover them: the sheet closes when one appears.
    if (typeof MutationObserver !== "undefined") {
      this._lockObserver = new MutationObserver((records) => {
        if (
          records.some((record) =>
            Array.from(record.addedNodes).some((node) =>
              LOCK_PANELS.includes(node.nodeName.toLowerCase())
            )
          )
        ) {
          this._hideSheet();
        }
      });
      this._lockObserver.observe(document.body, { childList: true });
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe.forEach((stop) => stop());
    this._unsubscribe = [];
    this._statusUnsubscribe.forEach((stop) => stop());
    this._statusUnsubscribe = [];
    this._statusConnection = undefined;
    this._lockObserver?.disconnect();
    this._lockObserver = undefined;
    window.removeEventListener("scroll", this._scheduleViewport);
    window.removeEventListener("resize", this._scheduleViewport);
    mainWindow.removeEventListener("location-changed", this._locationChanged);
    mainWindow.removeEventListener("popstate", this._locationChanged);
    window.visualViewport?.removeEventListener(
      "resize",
      this._scheduleViewport
    );
    window.visualViewport?.removeEventListener(
      "scroll",
      this._scheduleViewport
    );
    if (this._viewportFrame !== undefined) {
      cancelAnimationFrame(this._viewportFrame);
    }
    this._viewportFrame = undefined;
    this.removeEventListener("focusin", this._handleFocusIn);
    this.removeEventListener("focusout", this._handleFocusOut);
    window.clearTimeout(this._undoTimer);
    window.clearTimeout(this._pressTimer);
    this._barResize?.disconnect();
    this._barResize = undefined;
    document.documentElement.style.removeProperty(VISIBLE_HEIGHT_PROPERTY);
    document.documentElement.style.removeProperty(VIEWPORT_INSET_PROPERTY);
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (changed.has("phone") || changed.has("_barHidden")) {
      this._publishVisibleHeight();
    }
    if (changed.has("hass") || changed.has("phone")) {
      this._syncStatus();
    }
    if (
      !this._barResize &&
      this._bar &&
      typeof ResizeObserver !== "undefined"
    ) {
      this._barResize = new ResizeObserver(() => this._publishVisibleHeight());
      this._barResize.observe(this._bar);
    }
  }

  /**
   * Keeps the Settings count and the Menu dot current: the installable updates
   * and open repairs a settings user has to look at, and the persistent
   * notifications the Menu opens. The two subscriptions follow the connection.
   */
  private _syncStatus() {
    const hass = this.hass;
    if (!this.phone || !hass?.states) {
      return;
    }
    let updates = 0;
    for (const entityId of Object.keys(hass.states)) {
      if (
        entityId.startsWith("update.") &&
        !hass.entities?.[entityId]?.hidden &&
        updateCanInstall(hass.states[entityId] as UpdateEntity)
      ) {
        updates++;
      }
    }
    const total = hass.user?.is_admin ? updates + this._issueCount : 0;
    if (total !== this._settingsCount) {
      this._settingsCount = total;
    }
    const connection = hass.connection;
    if (!connection || this._statusConnection === connection) {
      return;
    }
    this._statusUnsubscribe.forEach((stop) => stop());
    this._statusUnsubscribe = [];
    this._statusConnection = connection;
    this._subscribeStatus(connection, hass.user?.is_admin === true);
  }

  private _subscribeStatus(
    connection: HomeAssistant["connection"],
    admin: boolean
  ) {
    try {
      this._statusUnsubscribe.push(
        subscribeNotifications(connection, (notifications) => {
          this._hasNotifications = notifications.length > 0;
        })
      );
      if (admin) {
        this._statusUnsubscribe.push(
          subscribeRepairsIssueRegistry(connection, (repairs) => {
            this._issueCount = repairs.issues.filter(
              (issue) => !issue.ignored
            ).length;
            this._syncStatus();
          })
        );
      }
    } catch (_err) {
      // The count and the dot are conveniences: the bar works without them.
    }
  }

  /**
   * Tells the rest of the page how tall the bar is right now: its height and
   * the gap under it while shown, `0px` while hidden or when this is not a
   * phone. Sheets and sticky bars read it to stay clear of the bar only while
   * it is there.
   */
  private _publishVisibleHeight() {
    const root = document.documentElement.style;
    if (!this.phone) {
      root.removeProperty(VISIBLE_HEIGHT_PROPERTY);
      return;
    }
    // The layout reserves the bar and the gap under it.
    const declared =
      getComputedStyle(this).getPropertyValue("--ha-phone-bar-height").trim() ||
      `${64 + BAR_GAP_PX}px`;
    // The bar can grow past its nominal height (two-line labels, larger
    // text), so the published value is the larger of the two.
    const bar = this._bar;
    let height = declared;
    if (bar) {
      const real = Math.ceil(bar.offsetHeight) + BAR_GAP_PX;
      const nominal = parseFloat(declared) || 0;
      if (real > nominal) {
        height = `${real}px`;
      }
    }
    root.setProperty(VISIBLE_HEIGHT_PROPERTY, this._barHidden ? "0px" : height);
  }

  // The page in use follows the address, so the bar draws again when it changes.
  private _locationChanged = () => {
    this.requestUpdate();
  };

  // Scroll changes browser chrome and the visual viewport on mobile browsers.
  // Navigation itself remains available in either scroll direction.
  private _scheduleViewport = () => {
    if (this._viewportFrame !== undefined) return;
    this._viewportFrame = requestAnimationFrame(() => {
      this._viewportFrame = undefined;
      if (this.isConnected) this._handleViewport();
    });
  };

  private _handleViewport = () => {
    const viewport = window.visualViewport;
    const inset = viewport
      ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
      : 0;
    document.documentElement.style.setProperty(
      VIEWPORT_INSET_PROPERTY,
      `${inset}px`
    );
    // A shorter viewport alone can be browser chrome, not a keyboard. Only
    // hide navigation while an editable control owns focus and a keyboard-sized
    // obstruction is present. Look through shadow roots for the real control.
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    const editing =
      active instanceof HTMLElement &&
      (active.matches("input, textarea, [role=textbox]") ||
        active.isContentEditable);
    this._barHidden =
      !!viewport &&
      editing &&
      window.innerHeight - viewport.height > KEYBOARD_PX;
  };

  private _handleFocusIn = () => {
    this._scheduleViewport();
  };
  private _handleFocusOut = () => {
    this._scheduleViewport();
  };

  private _refreshShared() {
    this._shared = {
      groups: readGroups(PHONE_SURFACE),
      look: readTabAppearance(),
      groupLook: readGroupAppearance(),
      locks: readLocks(),
    };
  }

  /** The groups of the wide strip. A pinned page is never in one. */
  private get _groups(): TabGroup[] {
    return this._shared.groups;
  }

  /**
   * The pages in the order of the wide strip: the pinned region first, then
   * the groups together and the pages in no group, as the strip draws them.
   */
  private _tabs(): PageTab[] {
    const tabs = computeStripTabs(this.hass, PHONE_SURFACE);
    const byId = new Map(tabs.map((tab) => [tab.urlPath, tab]));
    return flattenSegments(
      phoneSegments({
        visible: tabs.map((tab) => tab.urlPath),
        order: this._order,
        pinned: this._pinned,
        groups: this._groups,
      })
    ).flatMap((id) => byId.get(id) ?? []);
  }

  /**
   * The page in use. A settings page or tool opened as a tab claims its own
   * address, otherwise it is the panel being shown.
   */
  private _current(): string | undefined {
    return currentTabId(this.hass, PHONE_SURFACE);
  }

  /** The name a page shows: the label the person gave it, else its title. */
  private _titleFor(tab: PageTab): string {
    return this._shared.look[PHONE_SURFACE]?.[tab.urlPath]?.label || tab.title;
  }

  /** Whether a page is locked, by its own lock or its group's. */
  private _isLocked(id: string): boolean {
    return tabLockState(this._shared.locks, PHONE_SURFACE, id, this._groups)
      .locked;
  }

  /** The lock a page still waits on right now, or undefined. */
  private _pendingLock(id: string): string | undefined {
    return pendingLockKey(
      this._shared.locks,
      PHONE_SURFACE,
      id,
      this._groups,
      (key) => isUnlocked(key)
    );
  }

  /** The lock to ask about to unlock a page: its own, else its group's. */
  private _lockKeyOf(id: string): string | undefined {
    const lock = tabLockState(
      this._shared.locks,
      PHONE_SURFACE,
      id,
      this._groups
    );
    if (!lock.locked) {
      return undefined;
    }
    if (lock.reasons.includes("tab")) {
      return tabLockKey(PHONE_SURFACE, id);
    }
    const group = this._groups.find((item) => item.members.includes(id));
    return group ? groupLockKey(PHONE_SURFACE, group.id) : undefined;
  }

  /** A string in the chosen language mode. */
  private _text = (
    key: string,
    values?: Record<string, string | number>
  ): string => this._lang.text(this.hass.localize, key, values);

  /** Pinned and locked ids are left out: such a page is never closed in bulk. */
  private _closable(ids: string[]): string[] {
    return ids.filter(
      (id) => !this._pinned.includes(id) && !this._isLocked(id)
    );
  }

  /**
   * The pages as the actions see them, in the order the sheet shows them: the
   * pinned pages, the pages of each group, then the pages in no group.
   */
  private _pages(): PhonePage[] {
    const tabs = this._tabs();
    const byId = new Map(tabs.map((tab) => [tab.urlPath, tab]));
    const sections = phoneSections({
      visible: tabs.map((tab) => tab.urlPath),
      order: this._order,
      pinned: this._pinned,
      groups: this._groups,
    });
    return sections
      .flatMap((section) => section.ids)
      .flatMap((id) => {
        const tab = byId.get(id);
        return tab
          ? [
              {
                id,
                title: this._titleFor(tab),
                open: !this._closed.includes(id),
                pinned: this._pinned.includes(id),
                locked: this._isLocked(id),
                groupId: groupIdOf(this._groups, this._pinned, id),
              },
            ]
          : [];
      });
  }

  /** What a move or a drop is planned from. */
  private _changeInput(): PhoneChangeInput {
    const tabs = this._tabs();
    return {
      all: tabs.map((tab) => tab.urlPath),
      visible: tabs
        .filter((tab) => !this._closed.includes(tab.urlPath))
        .map((tab) => tab.urlPath),
      order: this._order,
      pinned: this._pinned,
      groups: this._groups,
    };
  }

  /** Saves what a move or a drop planned, the way the wide strip saves it. */
  private _saveChange(change: PhoneChange) {
    this._order = change.order;
    if (change.pinned) {
      this._pinned = change.pinned;
    }
    if (change.groups) {
      writeGroups(PHONE_SURFACE, change.groups);
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.phone || !this.hass?.panels) {
      return nothing;
    }
    const localize = this._text;
    const tabs = this._tabs();
    const closed = new Set(this._closed);
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    const current = this._current();
    const index = open.findIndex((tab) => tab.urlPath === current);
    const currentTab = tabs.find((tab) => tab.urlPath === current);
    const label = currentTab ? this._titleFor(currentTab) : current;
    const barItems: [string, string, string, () => void][] = [
      [
        "home",
        mdiHome,
        "ui.phone.home",
        () => navigate(`/${getDefaultPanelUrlPath(this.hass)}`),
      ],
      ["search", mdiMagnify, "ui.phone.search", () => showQuickBar(this, {})],
      ["pages", mdiTab, "ui.phone.pages", () => this._togglePages()],
      [
        "settings",
        mdiCog,
        "ui.phone.settings",
        () =>
          navigate(
            this.hass.user?.is_admin ? entryRoute("config") : "/profile"
          ),
      ],
      [
        "menu",
        mdiMenu,
        "ui.phone.menu",
        () => fireEvent(this, "hass-toggle-menu"),
      ],
    ];

    return html`
      <div class="top">
        <button
          class="round"
          aria-label=${localize("ui.phone.previous_page")}
          ?disabled=${open.length < 2}
          .step=${-1}
          @click=${this._switchPage}
        >
          <ha-svg-icon .path=${mdiChevronLeft}></ha-svg-icon>
        </button>
        <div
          class="title-area"
          @pointerdown=${this._startDrag}
          @pointermove=${this._moveDrag}
          @pointerup=${this._endTopDrag}
          @pointercancel=${this._cancelDrag}
        >
          <span
            class="title"
            style=${styleMap({
              transform:
                this._dragId === "top" ? `translateX(${this._dragX}px)` : "",
            })}
            >${label}</span
          >
          <span
            class="dots"
            role="img"
            aria-label=${localize("ui.phone.page_position", {
              current: Math.max(index, 0) + 1,
              total: open.length,
            })}
          >
            ${open
              .slice(0, 9)
              .map(
                (tab) =>
                  html`<span
                    class=${classMap({ dot: true, on: tab.urlPath === current })}
                  ></span>`
              )}
          </span>
        </div>
        <button
          class="round"
          aria-label=${localize("ui.phone.next_page")}
          ?disabled=${open.length < 2}
          .step=${1}
          @click=${this._switchPage}
        >
          <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
        </button>
      </div>

      ${this._renderSheet(tabs, closed, current)}
      ${
        this._undo
          ? html`<div class="toast" role="status">
              <span class="toast-text"
                >${localize("ui.phone.closed_toast", {
                  name: this._undo.name,
                })}</span
              >
              <button class="text-button" @click=${this._undoClose}>
                <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
                ${localize("ui.page_tabs.bulk_undo")}
              </button>
            </div>`
          : nothing
      }

      <nav
        class=${classMap({ bar: true, hidden: this._barHidden })}
        aria-label=${localize("ui.phone.navigation")}
      >
        ${barItems.map(([id, icon, key, run]) => {
          const count = id === "settings" ? this._settingsCount : 0;
          const text = count
            ? localize("ui.phone.settings_with_count", { count })
            : localize(key);
          const lines = spansForMode(
            this._lang.parts(this.hass.localize, key),
            this._lang.mode
          );
          return html`
            <button
              class=${classMap({
                item: true,
                active: this._isActive(id, current),
              })}
              aria-current=${this._isActive(id, current) ? "page" : nothing}
              data-item=${id}
              aria-label=${text}
              .run=${run}
              @click=${this._runItem}
            >
              <span class="glyph">
                <ha-svg-icon .path=${icon}></ha-svg-icon>
                ${
                  id === "pages" && open.length
                    ? html`<span class="badge" aria-hidden="true"
                        >${open.length}</span
                      >`
                    : nothing
                }
                ${
                  count
                    ? html`<span class="badge" aria-hidden="true"
                        >${count > 99 ? "99+" : count}</span
                      >`
                    : nothing
                }
                ${
                  id === "menu" && this._hasNotifications
                    ? html`<span class="dot-mark" aria-hidden="true"></span>`
                    : nothing
                }
              </span>
              <span class="item-label" aria-hidden="true"
                >${lines.map(
                  (line) =>
                    html`<span class="item-line" lang=${line.lang}
                      >${line.text}</span
                    >`
                )}</span
              >
            </button>
          `;
        })}
      </nav>
    `;
  }

  private _renderSheet(
    tabs: PageTab[],
    closed: Set<string>,
    current: string | undefined
  ): TemplateResult {
    const localize = this._text;
    const open = tabs.filter((tab) => !closed.has(tab.urlPath));
    const matches = searchMatcher(this._filter);
    const listed = (this._catalog ? tabs : open).filter((tab) =>
      matches(tab.title, tab.urlPath)
    );

    return html`
      <div
        id="sheet"
        popover
        role="dialog"
        aria-label=${localize("ui.phone.pages")}
        @toggle=${this._sheetToggled}
      >
        <div class="handle" aria-hidden="true"></div>
        <div class="sheet-header">
          <span class="sheet-title"
            >${
              this._catalog
                ? localize("ui.page_tabs.catalog_title")
                : localize("ui.phone.pages_title", { count: open.length })
            }</span
          >
          ${
            this._catalog
              ? html`<button
                  class="text-button"
                  ?disabled=${closed.size === 0}
                  @click=${this._openEveryTab}
                >
                  <ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon>
                  ${localize("ui.page_tabs.open_every_tab")}
                </button>`
              : html`<button
                  class="round header-more"
                  aria-label=${localize("ui.phone.more_pages")}
                  aria-haspopup="dialog"
                  @click=${this._openHeaderMenu}
                >
                  <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
                </button>`
          }
        </div>
        ${
          this._catalog
            ? nothing
            : html`<div
                class="quick-tools"
                role="group"
                aria-label=${localize("ui.phone.quick_tools")}
              >
                <button class="quick-tool" @click=${this._quickSearch}>
                  <span class="quick-icon search"
                    ><ha-svg-icon .path=${mdiMagnify}></ha-svg-icon
                  ></span>
                  <span class="quick-label"
                    >${localize("ui.phone.search")}</span
                  >
                </button>
                <button class="quick-tool" @click=${this._quickAccess}>
                  <span class="quick-icon access"
                    ><ha-svg-icon .path=${mdiHuman}></ha-svg-icon
                  ></span>
                  <span class="quick-label"
                    >${localize("ui.phone.access")}</span
                  >
                </button>
                <button class="quick-tool" @click=${this._toggleCatalog}>
                  <span class="quick-icon new-tab"
                    ><ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon
                  ></span>
                  <span class="quick-label"
                    >${localize("ui.page_tabs.new_tab")}</span
                  >
                </button>
              </div>`
        }
        <ha-input-search
          id="sheet-search"
          appearance="outlined"
          .value=${this._filter}
          .placeholder=${localize("ui.phone.search_pages")}
          .accessibleLabel=${localize("ui.phone.search_pages")}
          .patternSamples=${tabs.map((tab) => tab.title)}
          @input=${this._filterChanged}
        ></ha-input-search>
        <span class="live" role="status">${this._live}</span>
        <button class="new-tab-row" @click=${this._toggleCatalog}>
          <span class="entry-icon"
            ><ha-svg-icon
              .path=${this._catalog ? mdiTab : mdiPlus}
            ></ha-svg-icon
          ></span>
          <span class="entry-title"
            >${
              this._catalog
                ? localize("ui.phone.back_to_open")
                : localize("ui.page_tabs.new_tab")
            }</span
          >
        </button>
        <div class=${classMap({ list: true, cards: !this._catalog })}>
          ${
            this._catalog
              ? this._renderCatalogGroups(listed, closed, matches)
              : this._renderOpenPages(listed, current)
          }
        </div>
        ${this._renderOverlay(current)}
        <!-- The group picker, the group menu and the group editor, and the
             look editor, are the elements of the wide strip. They listen for
             their events on the window and open as sheets on a phone. They sit
             inside the Pages sheet so a press in one does not dismiss it. -->
        <ha-tab-group-picker
          .hass=${this.hass}
          .surface=${PHONE_SURFACE}
        ></ha-tab-group-picker>
        <ha-tab-group-menu
          .hass=${this.hass}
          .surface=${PHONE_SURFACE}
        ></ha-tab-group-menu>
        <ha-tab-group-editor
          .hass=${this.hass}
          .surface=${PHONE_SURFACE}
        ></ha-tab-group-editor>
        <ha-tab-appearance-editor .hass=${this.hass}></ha-tab-appearance-editor>
      </div>
    `;
  }

  // The open pages: the pinned ones in their own section at the top, then the
  // groups as sections that fold, then the pages in no group.
  private _renderOpenPages(
    listed: PageTab[],
    current: string | undefined
  ): TemplateResult {
    if (!listed.length) {
      return html`<p class="empty">${this._text("ui.page_tabs.no_match")}</p>`;
    }
    const byId = new Map(listed.map((tab) => [tab.urlPath, tab]));
    // The blocks come in the wide strip's order: a group sits at the place of
    // its first member among the pages in no group.
    const sections = phoneSections({
      visible: listed.map((tab) => tab.urlPath),
      order: this._order,
      pinned: this._pinned,
      groups: this._groups,
    });
    const grid = (ids: string[], group?: TabGroup) =>
      html`<div class="grid">
        ${ids.map((id) =>
          this._renderCard(byId.get(id)!, id === current, group)
        )}
      </div>`;
    const titled = (id: string, key: string, ids: string[]) =>
      html`<section class="open-group" aria-labelledby=${id}>
        <h3 id=${id} class="group-title">${this._text(key)}</h3>
        ${grid(ids)}
      </section>`;
    const others = sections.some((section) => section.kind !== "loose");
    let looseRuns = 0;
    return html`${sections.map((section) => {
      if (section.kind === "pinned") {
        return titled("open-pinned", "ui.page_tabs.group_pinned", section.ids);
      }
      if (section.kind === "group") {
        return this._renderGroupSection(section, grid);
      }
      looseRuns++;
      return others
        ? titled(
            looseRuns === 1 ? "open-pages" : `open-pages-${looseRuns}`,
            "ui.page_tabs.group_pages",
            section.ids
          )
        : grid(section.ids);
    })}`;
  }

  // One group of the strip as a section of the sheet: its header folds it and
  // has its menu; a search shows what it found inside a folded group without
  // changing the saved state.
  private _renderGroupSection(
    entry: { group: TabGroup; ids: string[] },
    grid: (ids: string[], group?: TabGroup) => TemplateResult
  ): TemplateResult {
    const { group, ids } = entry;
    const name = group.name || this._text("ui.page_tabs.groups_strip.unnamed");
    const look = groupAppearanceFor(
      this._shared.groupLook,
      PHONE_SURFACE,
      group.id
    );
    const locked = this._shared.locks.locked.includes(
      groupLockKey(PHONE_SURFACE, group.id)
    );
    const searching = this._filter.trim() !== "";
    const folded = group.collapsed && !searching;
    const headingId = `group-${group.id}`;
    return html`<section
      class="open-group group-section"
      aria-labelledby=${headingId}
      style=${styleMap({
        "--group-colour": look.color ?? groupColourCss(group.colour),
      })}
    >
      <div
        class="group-bar"
        .groupId=${group.id}
        @contextmenu=${this._groupContextMenu}
      >
        <h3 id=${headingId} class="group-heading">
          <button
            class=${classMap({ "group-toggle": true, folded })}
            style=${styleMap(groupChipStyle(look))}
            aria-expanded=${folded ? "false" : "true"}
            aria-label=${this._text(
              locked
                ? "ui.page_tabs.groups_strip.header_label_locked"
                : "ui.page_tabs.groups_strip.header_label",
              { name, count: ids.length }
            )}
            title=${this._text(
              folded
                ? "ui.page_tabs.groups_strip.expand"
                : "ui.page_tabs.groups_strip.collapse",
              { name }
            )}
            .groupId=${group.id}
            @click=${this._toggleGroup}
          >
            <ha-svg-icon
              class=${classMap({ chevron: true, folded })}
              .path=${mdiChevronDown}
            ></ha-svg-icon>
            <span class="group-dot" aria-hidden="true"></span>
            <span class="group-name">${name}</span>
            <span class="group-count" aria-hidden="true">${ids.length}</span>
            ${
              locked
                ? html`<ha-svg-icon
                    class="lock-mark"
                    .path=${mdiLock}
                  ></ha-svg-icon>`
                : nothing
            }
          </button>
        </h3>
        <button
          class="card-tool group-more"
          aria-label=${this._text("ui.phone.group_actions", { name })}
          aria-haspopup="dialog"
          .groupId=${group.id}
          @click=${this._openGroupMenu}
        >
          <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
        </button>
      </div>
      ${folded ? nothing : grid(ids, group)}
    </section>`;
  }

  /** Whether the sheet is open. The popover test can throw where it is missing. */
  private _sheetOpen(): boolean {
    try {
      return Boolean(this._sheet?.matches(":popover-open"));
    } catch (_err) {
      return false;
    }
  }

  private _hideSheet() {
    if (this._sheetOpen()) {
      this._sheet?.hidePopover();
    }
  }

  // A press on a group header's own button folds or unfolds the group, and the
  // wide strip draws it the same way.
  private _toggleGroup(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { groupId: string }).groupId;
    const group = this._groups.find((item) => item.id === id);
    if (!group) {
      return;
    }
    writeGroups(
      PHONE_SURFACE,
      setGroupCollapsed(this._groups, id, !group.collapsed)
    );
    this._live = this._text(
      group.collapsed
        ? "ui.page_tabs.groups_strip.expand"
        : "ui.page_tabs.groups_strip.collapse",
      { name: group.name || this._text("ui.page_tabs.groups_strip.unnamed") }
    );
  }

  // The menu of a group is the wide strip's group menu: rename, look, fold,
  // move, ungroup, close its pages after a preview, lock and remove.
  private _openGroupMenu(ev: Event) {
    ev.stopPropagation();
    const button = ev.currentTarget as HTMLElement & { groupId: string };
    this._askGroupMenu(
      button.groupId,
      button.closest<HTMLElement>(".group-bar") ?? button
    );
  }

  private _groupContextMenu(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    const bar = ev.currentTarget as HTMLElement & { groupId: string };
    this._askGroupMenu(bar.groupId, bar);
  }

  private _askGroupMenu(groupId: string, anchor: HTMLElement) {
    window.dispatchEvent(
      new CustomEvent("tab-group-context-menu", {
        detail: { groupId, anchor, shift: false, surface: PHONE_SURFACE },
      })
    );
  }

  // The panel over the sheet: a page's actions, the header menu or the bulk
  // close review. At most one is open.
  private _renderOverlay(current: string | undefined) {
    const t = this._text;
    if (this._bulkMode) {
      return html`<ha-phone-bulk-close
        .mode=${this._bulkMode}
        .pages=${this._pages()}
        .currentId=${current}
        .text=${t}
        @phone-bulk-confirm=${this._bulkConfirm}
        @phone-bulk-lock=${this._bulkLock}
        @phone-bulk-dismiss=${this._dismissOverlay}
      ></ha-phone-bulk-close>`;
    }
    const pages = this._pages();
    if (this._actionsFor) {
      const page = pages.find((p) => p.id === this._actionsFor);
      if (!page) {
        return nothing;
      }
      return html`<ha-phone-tab-actions
        .heading=${t("ui.phone.actions_for", { name: page.title })}
        .closeLabel=${t("ui.phone.actions_close")}
        .items=${this._items(
          pageActions(pages, page.id, current, {
            locks: true,
            groups: true,
            appearance: true,
          }),
          PAGE_ACTION_VIEW
        )}
        @phone-action-select=${this._pageActionSelected}
        @phone-actions-dismiss=${this._dismissOverlay}
      ></ha-phone-tab-actions>`;
    }
    if (this._headerMenu) {
      return html`<ha-phone-tab-actions
        .heading=${t("ui.phone.pages")}
        .closeLabel=${t("ui.phone.actions_close")}
        .items=${this._items(
          headerActions(pages, current, Boolean(this.hass.user?.is_admin)),
          HEADER_ACTION_VIEW
        )}
        @phone-action-select=${this._headerActionSelected}
        @phone-actions-dismiss=${this._dismissOverlay}
      ></ha-phone-tab-actions>`;
    }
    return nothing;
  }

  private _items<T extends string>(
    entries: ActionEntry<T>[],
    view: Record<T, [string, string]>
  ): PhoneActionItem[] {
    return entries.map((entry) => ({
      id: entry.id,
      label: this._text(view[entry.id][0]),
      iconPath: view[entry.id][1],
      enabled: entry.enabled,
      destructive: entry.destructive,
      note: entry.reason ? this._text(REASON_VIEW[entry.reason]) : undefined,
    }));
  }

  // The catalog in groups, as on a wide window: pinned pages, pages, settings
  // and tools, each with its own search that filters only that group.
  private _renderCatalogGroups(
    listed: PageTab[],
    closed: Set<string>,
    matches: (...texts: string[]) => boolean
  ): TemplateResult {
    const settings = computeSettingsEntries(this.hass).filter((entry) =>
      matches(entry.title, entry.path)
    );
    const tools = computeToolEntries(this.hass).filter((entry) =>
      matches(entry.title, entry.path)
    );
    if (!listed.length && !settings.length && !tools.length) {
      return html`<p class="empty">${this._text("ui.page_tabs.no_match")}</p>`;
    }
    const tabTexts = (tab: PageTab) => [tab.title, tab.urlPath];
    const entryTexts = (entry: CatalogSettingsEntry) => [
      entry.title,
      entry.path,
    ];
    const renderTab = (tab: PageTab) =>
      this._renderCatalogRow(tab, closed.has(tab.urlPath));
    return html`
      ${this._renderGroup(
        "pinned",
        "group-pinned",
        "ui.page_tabs.group_pinned",
        listed.filter((tab) => this._pinned.includes(tab.urlPath)),
        tabTexts,
        (tab) => tab.title,
        renderTab
      )}
      ${this._renderGroup(
        "pages",
        "group-pages",
        "ui.page_tabs.group_pages",
        listed.filter((tab) => !this._pinned.includes(tab.urlPath)),
        tabTexts,
        (tab) => tab.title,
        renderTab
      )}
      ${this._renderGroup(
        "settings",
        "group-settings",
        "ui.page_tabs.group_settings",
        settings,
        entryTexts,
        (entry) => entry.title,
        (entry) => this._renderEntryRow(entry, "settings")
      )}
      ${this._renderGroup(
        "tools",
        "group-tools",
        "ui.page_tabs.group_tools",
        tools,
        entryTexts,
        (entry) => entry.title,
        (entry) => this._renderEntryRow(entry, "tool")
      )}
    `;
  }

  private _renderGroup<T>(
    group: TabGroupId,
    id: string,
    titleKey: string,
    all: T[],
    texts: (item: T) => string[],
    title: (item: T) => string,
    row: (item: T) => TemplateResult
  ): TemplateResult | typeof nothing {
    if (!all.length) {
      return nothing;
    }
    const name = this._text(titleKey);
    const shown = filterGroupItems(all, this._groupFilters[group], texts);
    const label = this._text("ui.page_tabs.group_search", { name });
    return html`<section class="group" role="group" aria-labelledby=${id}>
      <div class="group-head">
        <h3 id=${id} class="group-title">${name}</h3>
        <span class="group-count" role="status"
          >${this._text("ui.page_tabs.group_count", {
            shown: shown.length,
            total: all.length,
          })}</span
        >
      </div>
      <ha-input-search
        class="group-search"
        data-group=${group}
        appearance="outlined"
        .value=${this._groupFilters[group]}
        .placeholder=${label}
        .accessibleLabel=${label}
        .patternSamples=${all.map(title)}
        @input=${this._groupFilterChanged}
      ></ha-input-search>
      ${
        shown.length
          ? nothing
          : html`<p class="empty">
              ${this._text("ui.page_tabs.group_empty", { name })}
            </p>`
      }
      <div class="group-list">${shown.map(row)}</div>
    </section>`;
  }

  private _renderEntryRow(
    entry: CatalogSettingsEntry,
    kind: "settings" | "tool"
  ): TemplateResult {
    return html`
      <button
        class="entry"
        .path=${entry.path}
        .kind=${kind}
        @click=${this._openEntry}
      >
        <span class="entry-icon">
          ${
            entry.iconPath
              ? html`<ha-svg-icon .path=${entry.iconPath}></ha-svg-icon>`
              : nothing
          }
        </span>
        <span class="entry-text">
          <span class="entry-title">${entry.title}</span>
        </span>
      </button>
    `;
  }

  private _groupFilterChanged(ev: Event) {
    const field = ev.target as HaInputSearch;
    const group = field.dataset.group as TabGroupId | undefined;
    if (!group || !TAB_GROUP_IDS.includes(group)) {
      return;
    }
    this._groupFilters = { ...this._groupFilters, [group]: field.value ?? "" };
  }

  // Choosing a settings page or a tool opens it as its own tab, or focuses the
  // tab it already has, and shows the page.
  private _openEntry(ev: Event) {
    const { path, kind } = ev.currentTarget as HTMLElement & {
      path: string;
      kind: "settings" | "tool";
    };
    this._sheet?.hidePopover();
    const choice = chooseDestination(kind, path, PHONE_SURFACE);
    this.requestUpdate();
    navigate(choice.route ?? path);
  }

  private _renderCard(
    tab: PageTab,
    selected: boolean,
    group?: TabGroup
  ): TemplateResult {
    const pinned = this._pinned.includes(tab.urlPath);
    const mark = this._reorder?.to === tab.urlPath ? this._reorder : undefined;
    // The look the person gave the page on the wide strip, and the lock mark.
    const look = this._shared.look[PHONE_SURFACE]?.[tab.urlPath] ?? {};
    const title = look.label || tab.title;
    const locked = this._pendingLock(tab.urlPath) !== undefined;
    const closable = !pinned && !this._isLocked(tab.urlPath);
    return html`
      <div
        class=${classMap({
          card: true,
          selected,
          locked,
          grouped: Boolean(group),
          dragging: this._reorder?.id === tab.urlPath,
          "drop-before": Boolean(mark) && !mark?.after,
          "drop-after": Boolean(mark?.after),
        })}
        style=${styleMap({
          ...tabStyle(look),
          ...(group ? { "--group-colour": groupColourCss(group.colour) } : {}),
          transform:
            this._dragId === tab.urlPath ? `translateX(${this._dragX}px)` : "",
          opacity:
            this._dragId === tab.urlPath
              ? String(Math.max(0.3, 1 - Math.abs(this._dragX) / 240))
              : "",
        })}
        .urlPath=${tab.urlPath}
        @pointerdown=${this._startCardDrag}
        @pointermove=${this._moveDrag}
        @pointerup=${this._endCardDrag}
        @pointercancel=${this._cancelDrag}
        @contextmenu=${this._cardContextMenu}
      >
        <button
          class="card-main"
          aria-current=${selected ? "page" : "false"}
          .urlPath=${tab.urlPath}
          @click=${this._openFromSheet}
        >
          <span class="entry-icon"
            >${
              look.icon
                ? html`<ha-icon .icon=${look.icon}></ha-icon>`
                : this._renderIcon(tab)
            }</span
          >
          <span class="card-text">
            <span class="card-title">${title}</span>
            ${
              selected || pinned
                ? html`<span class="note"
                    >${this._text(
                      selected
                        ? "ui.phone.reason_current"
                        : "ui.page_tabs.group_pinned"
                    )}</span
                  >`
                : nothing
            }
          </span>
          ${
            locked
              ? html`<ha-svg-icon
                  class="lock-mark"
                  .path=${mdiLock}
                  role="img"
                  aria-label=${this._text(
                    pinned
                      ? "ui.page_tabs.dock.pinned_locked_name"
                      : "ui.page_tabs.dock.locked_name",
                    { name: title }
                  )}
                ></ha-svg-icon>`
              : nothing
          }
          ${
            pinned
              ? html`<ha-svg-icon
                  class="pin-mark"
                  .path=${mdiPin}
                  role="img"
                  aria-label=${this._text("ui.page_tabs.pinned", {
                    name: title,
                  })}
                ></ha-svg-icon>`
              : nothing
          }
        </button>
        <div class="card-tools">
          <button
            class="card-tool handle"
            aria-label=${this._text("ui.phone.reorder_handle", {
              name: title,
            })}
            aria-keyshortcuts="ArrowUp ArrowDown"
            .urlPath=${tab.urlPath}
            @pointerdown=${this._startReorder}
            @pointermove=${this._moveReorder}
            @pointerup=${this._endReorder}
            @pointercancel=${this._cancelReorder}
            @keydown=${this._handleKeydown}
          >
            <ha-svg-icon .path=${mdiDragVertical}></ha-svg-icon>
          </button>
          <button
            class="card-tool more"
            aria-label=${this._text("ui.phone.more_actions", {
              name: title,
            })}
            aria-haspopup="dialog"
            .urlPath=${tab.urlPath}
            @click=${this._openPageActions}
          >
            <ha-svg-icon .path=${mdiDotsVertical}></ha-svg-icon>
          </button>
          ${
            !closable
              ? nothing
              : html`<button
                  class="card-tool card-close"
                  aria-label=${this._text("ui.page_tabs.close_tab", {
                    name: title,
                  })}
                  .urlPath=${tab.urlPath}
                  @click=${this._closeCard}
                >
                  <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
                </button>`
          }
        </div>
      </div>
    `;
  }

  private _renderCatalogRow(tab: PageTab, isClosed: boolean): TemplateResult {
    return html`
      <button
        class=${classMap({ entry: true, closed: isClosed })}
        .urlPath=${tab.urlPath}
        @click=${this._openFromSheet}
      >
        <span class="entry-icon">${this._renderIcon(tab)}</span>
        <span class="entry-text">
          <span class="entry-title">${tab.title}</span>
          <span class="note"
            >${this._text(
              isClosed ? "ui.page_tabs.state_closed" : "ui.page_tabs.state_open"
            )}</span
          >
        </span>
        ${isClosed ? html`<ha-svg-icon .path=${mdiPlus}></ha-svg-icon>` : nothing}
      </button>
    `;
  }

  private _renderIcon(tab: PageTab) {
    if (tab.iconPath) {
      return html`<ha-svg-icon .path=${tab.iconPath}></ha-svg-icon>`;
    }
    if (tab.icon) {
      return html`<ha-icon .icon=${tab.icon}></ha-icon>`;
    }
    return nothing;
  }

  private _runItem(ev: Event) {
    (ev.currentTarget as HTMLElement & { run: () => void }).run();
  }

  private _togglePages() {
    if (!this._sheet) {
      return;
    }
    if (this._sheet.matches(":popover-open")) {
      this._sheet.hidePopover();
      return;
    }
    // The press that dismissed the sheet is the same press on this button.
    if (Date.now() - this._closedAt < 250) {
      return;
    }
    this._sheet.showPopover();
  }

  /** Whether a bar item is the one in use: Pages while its sheet is open. */
  private _isActive(id: string, current: string | undefined): boolean {
    if (this._pagesOpen) {
      return id === "pages";
    }
    if (id === "home") {
      return current === getDefaultPanelUrlPath(this.hass);
    }
    if (id === "settings") {
      const path = mainWindow.location.pathname;
      return /^\/(config|profile)(\/|$)/.test(path);
    }
    return false;
  }

  private _sheetToggled(ev: ToggleEvent) {
    this._pagesOpen = ev.newState === "open";
    this._closePanels();
    this._reorder = undefined;
    this._live = "";
    if (ev.newState === "closed") {
      this._closedAt = Date.now();
      this._catalog = false;
      this._filter = "";
      this._clearGroupFilters();
      return;
    }
    this._filter = "";
    this._catalog = false;
    this._clearGroupFilters();
    this._loadCatalogStrings();
  }

  // The settings and tools titles may not be loaded yet.
  private _loadCatalogStrings() {
    loadCatalogTranslations(this.hass).then(() => this.requestUpdate());
  }

  // The quick tools: search and accessibility close the sheet first so the
  // panel they open is not hidden behind it.
  private _quickSearch() {
    this._hideSheet();
    showQuickBar(this, {});
  }

  private _quickAccess() {
    this._hideSheet();
    fireEvent(this, "hass-show-accessibility-tools");
  }

  private _toggleCatalog() {
    this._catalog = !this._catalog;
    if (this._catalog) {
      this._loadCatalogStrings();
    }
    this._filter = "";
    this._clearGroupFilters();
  }

  private _clearGroupFilters() {
    this._groupFilters = { pinned: "", pages: "", settings: "", tools: "" };
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _openFromSheet(ev: Event) {
    if (this._swallowClick) {
      this._swallowClick = false;
      return;
    }
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    this._openPage(urlPath);
  }

  // Opens a page. A locked page asks to be unlocked first, beside the Pages
  // button because the sheet closes, and opens once it is.
  private _openPage(urlPath: string) {
    const key = this._pendingLock(urlPath);
    if (key) {
      this._askUnlock(key, urlPath, () => this._openPage(urlPath));
      return;
    }
    this._closed = this._closed.filter((closed) => closed !== urlPath);
    this._hideSheet();
    navigate(tabEntryRoute(urlPath, tabRoute(urlPath)));
  }

  /** The Pages button of the bottom bar: it stays when the sheet closes. */
  private _pagesButton(): HTMLElement {
    return this._pagesItem ?? this;
  }

  private _askUnlock(key: string, urlPath: string, onSuccess: () => void) {
    const anchor = this._pagesButton();
    this._hideSheet();
    setLockLocalize(this.hass.localize);
    void import("../locks/ha-lock-prompt").then(({ openLockPrompt }) =>
      openLockPrompt(key, anchor, {
        onSuccess,
        returnTo: anchor,
        title: this._text("ui.page_tabs.dock.unlock_prompt", {
          name: this._titleOf(urlPath),
        }),
      })
    );
  }

  // Reopens every closed page. The order, the pins and the page you are on
  // are not touched: only the closed list is cleared.
  private _openEveryTab() {
    this._closed = [];
    this._live = this._text("ui.phone.opened_all");
  }

  private _titleOf(urlPath: string) {
    const tab = this._tabs().find((item) => item.urlPath === urlPath);
    return tab ? this._titleFor(tab) : urlPath;
  }

  /** Closes the pages and returns how many actually closed. */
  private _closeIds(requested: string[], name: string): number {
    const ids = this._closable(requested).filter(
      (id) => !this._closed.includes(id)
    );
    if (!ids.length) {
      return 0;
    }
    const leaving = this._neighbourFor(ids);
    this._closed = [...this._closed, ...ids];
    if (leaving) {
      navigate(tabRoute(leaving));
    }
    this._undo = { ids, name };
    window.clearTimeout(this._undoTimer);
    this._undoTimer = window.setTimeout(() => {
      this._undo = undefined;
    }, UNDO_MS);
    return ids.length;
  }

  // Closing the settings page or tool tab in use moves to the neighbouring
  // tab, as the wide strip does, so the person is not left on a page with no tab.
  private _neighbourFor(closing: string[]): string | undefined {
    const current = this._current();
    if (
      !current ||
      !closing.includes(current) ||
      parseDestinationId(current).kind === "page"
    ) {
      return undefined;
    }
    const stays = this._tabs()
      .map((tab) => tab.urlPath)
      .filter(
        (id) =>
          !this._closed.includes(id) &&
          (id === current ||
            (!closing.includes(id) && this._pendingLock(id) === undefined))
      );
    return neighbourTab(stays, current);
  }

  // Closes what a plan lists and says how many closed out of how many were
  // planned, and how many were kept.
  private _closeByPlan(ids: string[], kept: number, planned = ids.length) {
    const closed = this._closeIds(ids, this._countName(ids));
    const parts = [
      planned
        ? this._text("ui.phone.bulk_report", { closed, planned })
        : this._text("ui.phone.nothing_closed"),
    ];
    if (kept) {
      parts.push(this._text("ui.phone.kept_report", { count: kept }));
    }
    this._live = parts.join(" ");
  }

  private _undoClose() {
    if (!this._undo) {
      return;
    }
    const reopen = new Set(this._undo.ids);
    this._closed = this._closed.filter((urlPath) => !reopen.has(urlPath));
    this._undo = undefined;
    window.clearTimeout(this._undoTimer);
  }

  private _closeCard(ev: Event) {
    ev.stopPropagation();
    const urlPath = (ev.currentTarget as HTMLElement & { urlPath: string })
      .urlPath;
    this._closeIds([urlPath], this._titleOf(urlPath));
  }

  private _countName(ids: string[]) {
    return ids.length === 1
      ? this._titleOf(ids[0])
      : this._text("ui.phone.pages_count", { count: ids.length });
  }

  private _closeOthers() {
    const ids = this._closable(
      this._tabs()
        .map((tab) => tab.urlPath)
        .filter((id) => !this._closed.includes(id) && id !== this._current())
    );
    this._closeByPlan(ids, 0);
  }

  // The review step confirmed. A page that became pinned or the current page
  // since the review opened is dropped, and the report says how many closed
  // out of how many were planned.
  private _bulkConfirm(
    ev: HASSDomEvent<{ ids: string[]; planned: number; kept: number }>
  ) {
    const pinned = new Set(this._pinned);
    const ids = ev.detail.ids.filter(
      (id) => !pinned.has(id) && !this._isLocked(id) && id !== this._current()
    );
    this._closeByPlan(ids, ev.detail.kept, ev.detail.planned);
    this._finishPanel();
  }

  // The pages that matched are locked together: one wizard, and each page
  // gets its own lock with the same way to unlock.
  private _bulkLock(ev: HASSDomEvent<{ ids: string[] }>) {
    const ids = ev.detail.ids.filter((id) => !this._isLocked(id));
    if (!ids.length) {
      return;
    }
    const anchor = this._pagesButton();
    this._hideSheet();
    setLockLocalize(this.hass.localize);
    const named = ids.map((id) => ({
      key: tabLockKey(PHONE_SURFACE, id),
      label: this._text("ui.page_tabs.menu.lock_label", {
        name: this._titleOf(id),
      }),
    }));
    void import("../locks/ha-lock-wizard").then(({ openLockWizard }) =>
      openLockWizard({
        key: named[0].key,
        label: this._text("ui.phone.bulk_lock_label", { count: ids.length }),
        also: named.slice(1),
        anchor,
        onStartDefault: false,
        onCreated: () => {
          this._live = this._text("ui.phone.bulk_locked", {
            count: ids.length,
          });
        },
      })
    );
    this._finishPanel();
  }

  private _openHeaderMenu() {
    this._returnFocus = "header";
    this._actionsFor = undefined;
    this._bulkMode = undefined;
    this._headerMenu = true;
  }

  private _showPageActions(id: string, returnTo: FocusTarget) {
    this._returnFocus = returnTo;
    this._headerMenu = false;
    this._bulkMode = undefined;
    this._actionsFor = id;
  }

  private _openPageActions(ev: Event) {
    ev.stopPropagation();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._showPageActions(id, { row: id });
  }

  // A right click, the menu key and a long press on a touch screen.
  private _cardContextMenu(ev: Event) {
    ev.preventDefault();
    ev.stopPropagation();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._showPageActions(id, { row: id });
  }

  private _closePanels() {
    this._actionsFor = undefined;
    this._headerMenu = false;
    this._bulkMode = undefined;
  }

  private _dismissOverlay() {
    this._finishPanel();
  }

  // Closes whatever is open over the sheet and puts focus back where the
  // person came from: the row, the header menu button or the Pages button.
  private async _finishPanel() {
    const target = this._returnFocus;
    this._closePanels();
    await this.updateComplete;
    const root = this.shadowRoot;
    if (!root) {
      return;
    }
    let element: HTMLElement | null | undefined;
    if (typeof target === "object") {
      element = Array.from(
        root.querySelectorAll<HTMLElement & { urlPath?: string }>(".more")
      ).find((el) => el.urlPath === target.row);
    } else if (target === "header") {
      element = root.querySelector<HTMLElement>(".header-more");
    }
    (
      element ?? root.querySelector<HTMLElement>('.item[data-item="pages"]')
    )?.focus();
  }

  private _pageActionSelected(ev: HASSDomEvent<{ id: string }>) {
    const id = this._actionsFor;
    const action = ev.detail.id as PageActionId;
    if (id) {
      this._runPageAction(id, action);
    }
    if (PANEL_ACTIONS.includes(action)) {
      // Another panel takes the focus, so it is not given back to the row.
      this._closePanels();
      return;
    }
    this._finishPanel();
  }

  /** The "more" button of a page's card, to open a panel beside. */
  private _moreButton(id: string): HTMLElement {
    return (
      Array.from(this._moreButtons).find((el) => el.urlPath === id) ??
      this._pagesButton()
    );
  }

  private _lockPage(id: string) {
    const anchor = this._pagesButton();
    const name = this._titleOf(id);
    // The lock window sits in the page, under the sheet, so the sheet closes.
    this._hideSheet();
    setLockLocalize(this.hass.localize);
    void import("../locks/ha-lock-wizard").then(({ openLockWizard }) =>
      openLockWizard({
        key: tabLockKey(PHONE_SURFACE, id),
        label: this._text("ui.page_tabs.menu.lock_label", { name }),
        anchor,
        onStartDefault: false,
        onCreated: () => {
          this._live = this._text("ui.page_tabs.menu.locked", { name });
        },
      })
    );
  }

  private _unlockPage(id: string) {
    const key = this._lockKeyOf(id);
    if (key) {
      this._askUnlock(key, id, () => {
        this._live = this._text("ui.page_tabs.dock.unlock_prompt", {
          name: this._titleOf(id),
        });
      });
    }
  }

  private _runPageAction(id: string, action: PageActionId) {
    const pages = this._pages();
    const current = this._current();
    const title = pages.find((page) => page.id === id)?.title ?? id;
    const closeKinds: Partial<Record<PageActionId, CloseKind>> = {
      close: "close",
      close_others: "others",
      close_above: "above",
      close_below: "below",
    };
    const moveKinds: Partial<Record<PageActionId, MoveKind>> = {
      move_up: "up",
      move_down: "down",
      move_top: "top",
      move_bottom: "bottom",
    };
    const closeKind = closeKinds[action];
    const moveKind = moveKinds[action];
    if (action === "pin" || action === "unpin") {
      this._togglePin(id, title);
    } else if (action === "lock") {
      this._lockPage(id);
    } else if (action === "unlock") {
      this._unlockPage(id);
    } else if (action === "move_into_group") {
      // The wide strip's group picker, as a sheet on a phone.
      window.dispatchEvent(
        new CustomEvent("tab-group-picker-open", {
          detail: {
            tabIds: [id],
            anchor: this._moreButton(id),
            surface: PHONE_SURFACE,
          },
        })
      );
    } else if (action === "remove_from_group") {
      writeGroups(PHONE_SURFACE, ungroupTabs(this._groups, [id]));
      this._live = this._text("ui.page_tabs.menu.removed_from_group", {
        name: title,
      });
    } else if (action === "edit_appearance") {
      void this._lookEditor?.show({
        surface: PHONE_SURFACE,
        tabId: id,
        label: title,
        anchor: this._moreButton(id),
        dock: "bottom",
      });
    } else if (closeKind) {
      const plan = planClose(pages, id, closeKind, current);
      this._closeByPlan(plan.ids, plan.kept.length);
    } else if (moveKind) {
      this._applyMove(id, moveKind);
    }
  }

  // Pinning saves the shown order first, so the page keeps its place within
  // its new group, exactly as the tab bar does. A pinned page is never in a
  // group, so pinning takes a page out of its own.
  private _togglePin(id: string, title: string) {
    const pinned = this._pinned.includes(id);
    this._order = this._tabs().map((tab) => tab.urlPath);
    if (!pinned && this._groups.some((group) => group.members.includes(id))) {
      writeGroups(PHONE_SURFACE, ungroupTabs(this._groups, [id]));
    }
    this._pinned = pinned
      ? this._pinned.filter((p) => p !== id)
      : [...this._pinned, id];
    this._live = this._text(
      pinned ? "ui.page_tabs.unpinned" : "ui.page_tabs.pinned",
      { name: title }
    );
  }

  // A move stays inside the page's own section (the pinned pages, one group,
  // or the pages in no group) and saves the lists the wide strip saves.
  private _applyMove(id: string, kind: MoveKind) {
    const pages = this._pages();
    const title = pages.find((page) => page.id === id)?.title ?? id;
    const plan = planPhoneMove(this._changeInput(), id, kind);
    if (!plan) {
      return;
    }
    if ("blocked" in plan) {
      this._live = this._text(REASON_VIEW[plan.blocked]);
      return;
    }
    this._saveChange(plan);
    this._live = this._text("ui.page_tabs.moved", {
      name: title,
      position: plan.position,
      total: plan.total,
    });
  }

  private _headerActionSelected(ev: HASSDomEvent<{ id: string }>) {
    const action = ev.detail.id as HeaderActionId;
    if (action === "bulk_contain" || action === "bulk_not_contain") {
      // The review replaces the menu; focus returns to the menu button when
      // it closes.
      this._headerMenu = false;
      this._bulkMode = action === "bulk_contain" ? "matching" : "not_matching";
      return;
    }
    if (action === "add_media") {
      // Called straight from the tap, so the file picker is allowed to open.
      void pickFilesToAdd();
    } else if (action === "open_every") {
      this._openEveryTab();
    } else if (action === "close_others") {
      this._closeOthers();
    }
    this._finishPanel();
  }

  // The previous or next open page, in the order of the tab bar.
  private _switchPage(ev: Event) {
    const step = (ev.currentTarget as HTMLElement & { step: number }).step;
    this._stepPage(step);
  }

  private _stepPage(step: number) {
    const open = this._tabs().filter(
      (tab) => !this._closed.includes(tab.urlPath)
    );
    if (open.length < 2) {
      return;
    }
    const index = open.findIndex((tab) => tab.urlPath === this._current());
    const next = (index + step + open.length) % open.length;
    this._openPage(open[next].urlPath);
  }

  private _startDrag(ev: PointerEvent) {
    this._dragStartX = ev.clientX;
    this._dragId = "top";
    this._dragX = 0;
  }

  private _startCardDrag(ev: PointerEvent) {
    this._dragStartX = ev.clientX;
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._dragId = id;
    this._dragX = 0;
    // Holding the card opens its actions, as a long press does elsewhere.
    this._pressX = ev.clientX;
    this._pressY = ev.clientY;
    window.clearTimeout(this._pressTimer);
    this._pressTimer = window.setTimeout(
      () => this._longPress(id),
      LONG_PRESS_MS
    );
  }

  private _longPress(id: string) {
    this._pressTimer = undefined;
    this._cancelDrag();
    // The lift of the finger that opened the panel is not a tap on the card.
    this._swallowClick = true;
    window.setTimeout(() => {
      this._swallowClick = false;
    }, 400);
    this._showPageActions(id, { row: id });
  }

  private _moveDrag(ev: PointerEvent) {
    if (
      this._pressTimer !== undefined &&
      Math.hypot(ev.clientX - this._pressX, ev.clientY - this._pressY) >
        LONG_PRESS_SLOP_PX
    ) {
      window.clearTimeout(this._pressTimer);
      this._pressTimer = undefined;
    }
    if (!this._dragId) {
      return;
    }
    this._dragX = ev.clientX - this._dragStartX;
  }

  private _cancelDrag() {
    window.clearTimeout(this._pressTimer);
    this._pressTimer = undefined;
    this._dragId = undefined;
    this._dragX = 0;
  }

  // Reorder by the drag handle. The handle captures the pointer, the card
  // under the finger shows a drop mark, and lifting the finger moves the page
  // there. Pinned pages move among pinned pages only.
  private _startReorder(ev: PointerEvent) {
    ev.stopPropagation();
    const handle = ev.currentTarget as HTMLElement & { urlPath: string };
    handle.setPointerCapture(ev.pointerId);
    window.clearTimeout(this._pressTimer);
    this._pressTimer = undefined;
    this._cancelDrag();
    this._reorder = { id: handle.urlPath };
  }

  private _moveReorder(ev: PointerEvent) {
    if (!this._reorder) {
      return;
    }
    ev.stopPropagation();
    const hit = this.shadowRoot
      ?.elementFromPoint(ev.clientX, ev.clientY)
      ?.closest<HTMLElement & { urlPath?: string }>(".card");
    const to = hit?.urlPath;
    if (!hit || !to || to === this._reorder.id) {
      this._reorder = { id: this._reorder.id };
      return;
    }
    const rect = hit.getBoundingClientRect();
    const grid = hit.parentElement;
    const singleColumn = !grid || rect.width > grid.clientWidth * 0.7;
    this._reorder = {
      id: this._reorder.id,
      to,
      after: dropAfter(
        { x: ev.clientX, y: ev.clientY },
        rect,
        singleColumn,
        getComputedStyle(this).direction === "rtl"
      ),
    };
  }

  private _endReorder(ev: PointerEvent) {
    const reorder = this._reorder;
    this._reorder = undefined;
    ev.stopPropagation();
    if (!reorder?.to) {
      return;
    }
    const pages = this._pages();
    const plan = planPhoneDrop(
      this._changeInput(),
      reorder.id,
      reorder.to,
      Boolean(reorder.after)
    );
    const title = pages.find((page) => page.id === reorder.id)?.title ?? "";
    if (!plan) {
      return;
    }
    if ("blocked" in plan) {
      this._live = this._text("ui.page_tabs.move_blocked", { name: title });
      return;
    }
    this._saveChange(plan);
    this._live = this._text("ui.page_tabs.moved", {
      name: title,
      position: plan.position,
      total: plan.total,
    });
  }

  private _cancelReorder() {
    this._reorder = undefined;
  }

  // Up and Down on the handle move the page one place, for keyboards and
  // switch devices. Focus stays on the page's own handle afterwards.
  private async _handleKeydown(ev: KeyboardEvent) {
    const kind: MoveKind | undefined =
      ev.key === "ArrowUp" ? "up" : ev.key === "ArrowDown" ? "down" : undefined;
    if (!kind || ev.ctrlKey || ev.altKey || ev.metaKey) {
      return;
    }
    ev.preventDefault();
    const id = (ev.currentTarget as HTMLElement & { urlPath: string }).urlPath;
    this._applyMove(id, kind);
    await this.updateComplete;
    Array.from(this._handles)
      .find((el) => el.urlPath === id)
      ?.focus();
  }

  private _endTopDrag() {
    const dx = this._dragX;
    this._cancelDrag();
    if (Math.abs(dx) < SWIPE_SWITCH_PX) {
      return;
    }
    const rtl = getComputedStyle(this).direction === "rtl";
    // Swiping left goes to the next page, as turning a page does.
    this._stepPage(dx < 0 !== rtl ? 1 : -1);
  }

  private _endCardDrag(ev: Event) {
    const urlPath = this._dragId;
    const dx = this._dragX;
    this._cancelDrag();
    if (!urlPath || Math.abs(dx) < SWIPE_CLOSE_PX) {
      return;
    }
    // A pinned or locked page does not close by swiping, and the sheet says why.
    if (this._pinned.includes(urlPath) || this._isLocked(urlPath)) {
      this._live = this._text(
        this._pinned.includes(urlPath)
          ? "ui.phone.reason_pinned"
          : "ui.phone.reason_locked"
      );
      return;
    }
    // The press that ends a swipe is not a tap on the card.
    this._swallowClick = true;
    window.setTimeout(() => {
      this._swallowClick = false;
    }, 0);
    ev.stopPropagation();
    this._closeIds([urlPath], this._titleOf(urlPath));
  }

  static styles: CSSResultGroup = css`
    :host {
      /* The bar's real height: its nominal one, or more when labels take
         more lines. */
      --ha-phone-bar-room: max(
        var(--ha-phone-bar-height, 76px),
        var(--ha-phone-bar-visible-height, 0px)
      );
      display: none;
      font-family: var(--ha-font-family-body);
      color: var(--primary-text-color);
      -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
    }
    :host([phone]) {
      display: block;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
    }
    button:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    button[disabled] {
      opacity: 0.4;
      cursor: default;
    }
    .top {
      /* Not shown: Pages in the bottom bar switches pages, and each page has
         its own header. See --ha-phone-top-height in home-assistant-main. */
      display: none;
      position: fixed;
      z-index: 5;
      inset-inline: 0;
      top: var(--app-safe-area-inset-top, env(safe-area-inset-top, 0px));
      height: 48px;
      box-sizing: border-box;
      align-items: center;
      padding-inline: var(--ha-space-1);
      background-color: var(--primary-background-color);
      border-bottom: var(--ha-card-border-width, 0px) solid
        var(--ha-card-border-color, transparent);
    }
    .round {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 44px;
      height: 44px;
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
    }
    .title-area {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      height: 100%;
      touch-action: pan-y;
      user-select: none;
    }
    .title {
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .dots {
      display: flex;
      gap: 4px;
    }
    .dot {
      width: 6px;
      height: 6px;
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--divider-color);
    }
    .dot.on {
      background-color: var(--primary-text-color);
    }
    /* A floating pill, inset from the screen edges: it rests 12px
       above the bottom edge (the layout reserves that gap in
       --ha-phone-bar-height) and above the device's bottom safe area. */
    .bar {
      position: fixed;
      z-index: 7;
      inset-inline: 12px;
      bottom: calc(
        12px + var(--ha-phone-viewport-inset-bottom, 0px) +
          var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      box-sizing: border-box;
      min-height: calc(var(--ha-phone-bar-height, 76px) - 12px);
      padding-inline: var(--ha-space-1);
      display: flex;
      align-items: stretch;
      justify-content: space-around;
      background-color: var(--card-background-color);
      border-radius: var(--ha-border-radius-4xl);
      box-shadow: var(--ha-shadow-overlay, 0 4px 16px rgba(0, 0, 0, 0.16));
      transition: transform var(--ha-animation-duration-normal) ease;
    }
    .bar.hidden {
      transform: translateY(
        calc(
          100% + 24px +
            var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
        )
      );
    }
    .item {
      flex: 1;
      min-width: 0;
      min-height: calc(var(--ha-phone-bar-height, 76px) - 12px);
      padding-block: var(--ha-space-1);
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      color: var(--secondary-text-color);
    }
    .item.active {
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
    .glyph {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 32px;
      border-radius: var(--ha-border-radius-pill);
    }
    .item.active .glyph {
      background-color: var(
        --ha-color-primary-container,
        var(--ha-color-fill-primary-normal-resting)
      );
    }
    /* The dot on Menu: something is waiting in the notifications. */
    .dot-mark {
      position: absolute;
      top: 2px;
      inset-inline-end: 14px;
      width: 10px;
      height: 10px;
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--accent-color, var(--primary-color));
      border: 2px solid var(--card-background-color);
    }
    .badge {
      position: absolute;
      top: -2px;
      inset-inline-end: 6px;
      min-width: 18px;
      height: 18px;
      padding: 0 4px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
      line-height: 18px;
      text-align: center;
    }
    /* In both-languages mode the two languages sit on two short lines, so a
       label is never cut at 320 px. A line that is still too long wraps. */
    .item-label {
      display: flex;
      flex-direction: column;
      align-items: center;
      max-width: 100%;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      line-height: 1.15;
      text-align: center;
    }
    .item-line {
      max-width: 100%;
      overflow-wrap: anywhere;
    }
    .item-label:has(.item-line + .item-line) {
      font-size: var(--ha-font-size-xs, 11px);
    }
    .item:has(.item-line + .item-line) .glyph {
      height: 26px;
    }
    .toast {
      position: fixed;
      z-index: 8;
      inset-inline: var(--ha-space-3);
      bottom: calc(
        var(--ha-phone-bar-room) + var(--ha-space-3) +
          var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
        var(--ha-space-4);
      border-radius: var(--ha-border-radius-2xl);
      background-color: var(--primary-text-color);
      color: var(--primary-background-color);
      box-shadow: 0 4px 8px 3px rgba(0, 0, 0, 0.15);
    }
    .toast-text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .toast .text-button {
      background: none;
      color: inherit;
      font-weight: var(--ha-font-weight-bold, 700);
    }
    #sheet {
      position: fixed;
      inset: auto;
      inset-inline: 12px;
      bottom: calc(
        var(--ha-phone-bar-room) +
          var(--app-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px))
      );
      margin: 0;
      width: auto;
      max-width: none;
      /* The window height less the bar and a margin at the top, so a long
         list (the catalog especially) uses what room the phone has. */
      max-height: calc(
        100dvh - var(--ha-phone-bar-room) - var(--ha-space-8) - var(
            --app-safe-area-inset-bottom,
            env(safe-area-inset-bottom, 0px)
          )
      );
      box-sizing: border-box;
      padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-3);
      border: none;
      border-radius: var(--ha-border-radius-4xl);
      background-color: var(--primary-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-shadow-overlay, 0 4px 16px rgba(0, 0, 0, 0.16));
      overflow: hidden;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #sheet:popover-open {
      display: flex;
    }
    #sheet::backdrop {
      background: transparent;
    }
    .handle {
      align-self: center;
      width: 36px;
      height: 4px;
      border-radius: 2px;
      background-color: var(--divider-color);
    }
    .sheet-header {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
    }
    .sheet-title {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    .text-button {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background-color: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-text-color));
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 18px;
    }
    #sheet-search {
      --ha-input-search-height: 48px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    .note {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .quick-tools {
      display: flex;
      justify-content: space-around;
      gap: var(--ha-space-2);
    }
    .quick-tool {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-1);
      min-width: 64px;
      min-height: 48px;
      font-size: var(--ha-font-size-s);
    }
    .quick-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 48px;
      height: 48px;
      border-radius: var(--ha-border-radius-xl);
    }
    .quick-icon.search {
      background-color: var(--ha-color-primary-container);
      color: var(--ha-color-on-primary-container);
    }
    .quick-icon.access {
      background-color: var(--ha-color-tertiary-container);
      color: var(--ha-color-on-tertiary-container);
    }
    .quick-icon.new-tab {
      background-color: var(--ha-color-warning-container);
      color: var(--ha-color-on-warning-container);
    }
    .new-tab-row,
    .entry {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-2)
        var(--ha-space-2);
      border-radius: var(--ha-border-radius-2xl);
      text-align: start;
      width: 100%;
      box-sizing: border-box;
    }
    .new-tab-row {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry.closed {
      background-color: var(--ha-color-fill-primary-normal-resting);
    }
    .entry-icon {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-xl);
      background-color: var(--secondary-background-color);
    }
    .entry-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .entry-title,
    .card-title {
      font-weight: var(--ha-font-weight-medium);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      overflow-y: auto;
      min-height: 0;
    }
    /* Rows of a scrolling column keep their height instead of being squeezed. */
    .list > * {
      flex-shrink: 0;
    }
    .list.cards {
      gap: var(--ha-space-3);
    }
    .open-group {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    /* The open pages are rows of one rounded card, as the design draws them. */
    .grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: var(--ha-space-3);
    }
    .card {
      position: relative;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2);
      border-radius: var(--tab-radius, var(--ha-border-radius-3xl));
      background-color: var(--tab-background, var(--card-background-color));
      box-shadow: var(--ha-shadow-card, none);
      color: var(--tab-color, inherit);
      font-weight: var(--tab-weight, inherit);
      font-style: var(--tab-font-style, inherit);
      border: 1px solid var(--tab-border-color, transparent);
      touch-action: pan-y;
      min-width: 0;
    }
    /* A page card: a large tinted tile for the icon, then the title. */
    .card .card-main {
      flex-direction: column;
      align-items: stretch;
      gap: var(--ha-space-2);
    }
    .card .card-main .entry-icon {
      width: auto;
      height: 72px;
      border-radius: var(--ha-border-radius-2xl);
      background: linear-gradient(
        135deg,
        var(--ha-color-primary-container, var(--secondary-background-color)),
        var(--ha-color-tertiary-container, var(--secondary-background-color))
      );
      color: var(--ha-color-on-primary-container, inherit);
      --mdc-icon-size: 28px;
    }
    .card .card-main .lock-mark,
    .card .card-main .pin-mark {
      position: absolute;
      inset-block-start: var(--ha-space-3);
      inset-inline-end: var(--ha-space-3);
      margin: 0;
    }
    .card-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .card.grouped {
      border-inline-start: 4px solid var(--group-colour, var(--primary-color));
    }
    .card.selected {
      background-color: var(
        --tab-background,
        var(
          --ha-color-fill-primary-quiet-resting,
          var(--secondary-background-color)
        )
      );
    }
    .lock-mark {
      flex: none;
      margin-inline-start: auto;
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
    }
    .lock-mark + .pin-mark {
      margin-inline-start: 0;
    }
    .group-section {
      --group-colour: var(--primary-color);
    }
    .group-bar {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-width: 0;
    }
    .group-heading {
      flex: 1;
      min-width: 0;
      margin: 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
    .group-toggle {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      width: 100%;
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      text-align: start;
      font-weight: inherit;
      --mdc-icon-size: 20px;
    }
    .group-toggle:hover {
      background-color: var(--ha-color-fill-neutral-quiet-resting);
    }
    .chevron {
      flex: none;
      transition: transform var(--ha-animation-duration-normal) ease;
    }
    .chevron.folded {
      transform: rotate(-90deg);
    }
    :host(:dir(rtl)) .chevron.folded {
      transform: rotate(90deg);
    }
    .group-dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: var(--ha-border-radius-circle);
      background-color: var(--group-colour);
    }
    .group-name {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .group-count {
      flex: none;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .card.dragging {
      opacity: 0.5;
    }
    /* The drop mark: a bar on the side of the card the page lands on. */
    .card.drop-before::before,
    .card.drop-after::after {
      content: "";
      position: absolute;
      inset-block: 0;
      width: 4px;
      border-radius: 2px;
      background-color: var(--primary-color);
    }
    .card.drop-before::before {
      inset-inline-start: 2px;
    }
    .card.drop-after::after {
      inset-inline-end: 2px;
    }
    .card-main {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 48px;
      text-align: start;
      min-width: 0;
    }
    .pin-mark {
      flex: none;
      margin-inline-start: auto;
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
    }
    .card-tools {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0;
      min-width: 0;
    }
    .card-tool {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: var(--ha-border-radius-circle);
      color: var(--secondary-text-color);
    }
    .handle {
      touch-action: none;
      cursor: grab;
      margin-inline-end: auto;
    }
    .header-more {
      margin-inline-start: auto;
    }
    .group {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding-bottom: var(--ha-space-2);
    }
    .group-head {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
    }
    .group-title {
      margin: 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
    .group-count {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .group-search {
      --ha-input-search-height: 44px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .group-list {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .group-list .entry {
      min-height: 44px;
    }
    .empty {
      grid-column: 1 / -1;
      margin: 0;
      padding: var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    @media (prefers-reduced-motion: reduce) {
      .bar,
      .chevron {
        transition: none;
      }
    }
    /* One column below 340 px, so three 44 px tools fit a card at 320 px. */
    @media (max-width: 340px) {
      .grid {
        grid-template-columns: minmax(0, 1fr);
      }
      .card.drop-before::before,
      .card.drop-after::after {
        inset-block: auto;
        inset-inline: 0;
        width: auto;
        height: 4px;
      }
      .card.drop-before::before {
        inset-block-start: 2px;
      }
      .card.drop-after::after {
        inset-block-end: 2px;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-phone-bar": HaPhoneBar;
  }
}
