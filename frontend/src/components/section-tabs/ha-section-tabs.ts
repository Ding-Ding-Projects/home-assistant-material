import {
  mdiArrowDown,
  mdiArrowUp,
  mdiChevronDown,
  mdiChevronRight,
  mdiDotsHorizontal,
  mdiEye,
  mdiEyeOff,
  mdiLock,
  mdiPin,
  mdiPinOff,
  mdiTabPlus,
  mdiTextSearch,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  state as internalState,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { repeat } from "lit/directives/repeat";
import { styleMap } from "lit/directives/style-map";
import { getStorage, storage } from "../../common/decorators/storage";
import { isNavigationClick } from "../../common/dom/is-navigation-click";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  isUnlocked,
  setLockLocalize,
  subscribeUnlocks,
} from "../../common/locks/element-lock-session";
import type { LockStore } from "../../common/locks/element-locks";
import { readLocks, subscribeLocks } from "../../common/locks/element-locks";
import { navigate } from "../../common/navigate";
import { regexQuery, searchMatcher } from "../../common/regex/filter";
import type { LocalizeFunc } from "../../common/translations/localize";
import type { TabAppearanceStore } from "../../common/tabs/tab-appearance-store";
import {
  readTabAppearance,
  TAB_APPEARANCE_STORAGE_KEY,
} from "../../common/tabs/tab-appearance-store";
import type { StripSnapshot } from "../../common/tabs/tab-search";
import type { TabGroup } from "../../common/tabs/tab-groups";
import {
  GROUPS_STORAGE_KEY,
  readGroups,
  setGroupCollapsed,
  ungroupTabs,
  writeGroups,
} from "../../common/tabs/tab-groups";
import { readSeen, writeSeen } from "../../common/tabs/tab-seen";
import type { HomeAssistant } from "../../types";
import "../ha-icon";
import "../ha-svg-icon";
import "../ha-tab";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import type { GroupAppearanceStore } from "../tabs/tab-group-appearance-store";
import {
  GROUP_APPEARANCE_STORAGE_KEY,
  groupAppearanceFor,
  groupChipStyle,
  groupColourCss,
  readGroupAppearance,
} from "../tabs/tab-group-appearance-store";
import { registerTabSearchSurface } from "../tabs/tab-group-state";
import {
  effectiveCollapsed,
  isRevealed,
  subscribeReveals,
} from "../tabs/tab-search-reveal";
import type { TabMoveKind } from "../tabs/tab-menu-entries";
import { pendingLockKey, tabStyle } from "../tabs/tab-strip-layout";
import "./ha-section-tab-menu";
import type {
  HaSectionTabMenu,
  SectionMenuActions,
} from "./ha-section-tab-menu";
import { popoverOpen, hidePopover } from "./section-popover";
import type { SectionLayout, SectionSnapshot } from "./section-surface";
import {
  dropSectionTab,
  hideSections,
  moveSectionGroup,
  moveSectionTab,
  restoreSections,
  sectionLayout,
  sectionSurface,
} from "./section-surface";
import type {
  SectionMove,
  SectionTabsState,
  SectionTabsStore,
} from "./section-tabs-model";
import {
  hiddenSections,
  nextTabIndex,
  orderSections,
  planOverflow,
  planSlots,
  readSectionState,
  SECTION_TAB_PANEL_ID,
  SECTION_TABS_STORAGE_KEY,
  sectionMoveForKey,
  sectionShortcutForKey,
  sectionTabDomId,
  showEverySection,
  showSection,
  slotsForWidth,
  togglePinned,
  writeSectionState,
} from "./section-tabs-model";

export interface SectionTabItem {
  /** The address of the section; also its identity in the saved choices. */
  path: string;
  label: string;
  iconPath?: string;
  badge?: string;
}

/** The room the overflow control keeps in the wide row, before measuring it. */
const MORE_WIDTH_FALLBACK = 48;

/** How long a finger rests on a tab before it counts as a long press. */
const LONG_PRESS_MS = 600;

/** How far a finger may drift before it is a scroll, not a long press. */
const LONG_PRESS_SLOP = 10;

const BASE = "ui.components.section_tabs.";

/** One thing in the row: a tab, or the header chip of a group. */
type RowItem =
  | { kind: "tab"; tab: SectionTabItem; group?: TabGroup }
  | { kind: "chip"; group: TabGroup; count: number };

const itemKey = (item: RowItem): string =>
  item.kind === "tab" ? item.tab.path : `group:${item.group.id}`;

/** What the shared stores hold for this surface, read once per change. */
interface SharedData {
  groups: TabGroup[];
  appearance: TabAppearanceStore;
  groupAppearance: GroupAppearanceStore;
  locks: LockStore;
}

/**
 * The tabs of a settings or details surface. They are real tabs (a tablist
 * with tab children, roving focus, aria-selected) that stay real links, so
 * opening one in a new browser tab and the back button keep working. When the
 * tabs do not fit, an overflow control lists the ones out of view; the open
 * tab is always in view. Tabs can be pinned, hidden, restored and reordered
 * by drag and by keyboard, and the choices are saved per surface.
 *
 * It renders into its own light DOM, so the ids that the tabs and the tab
 * panel point at each other with live in one tree. The parent includes
 * {@link sectionTabsStyles}.
 *
 * Keys: the arrow keys, Home and End move between tabs; Enter or Space opens
 * one. Alt with Left or Right moves the focused tab (Alt with Home or End
 * sends it to the start or end of its region). Alt, Shift and P pin it; Alt,
 * Shift and H hide it. Shift+F10 or the menu key opens the menu of a tab or of
 * a group header.
 *
 * It shares the model of the wide tab strip, under the strip name
 * `section:<route>` (see `sectionSurface`):
 * - A right-click, the menu key, Shift+F10 or a long press on a tab, a group
 *   header or the empty row sends `tab-context-menu`, `tab-group-context-menu`
 *   or `strip-context-menu` with that surface, the events of the wide strip.
 *   `ha-section-tab-menu`, mounted here when `hass` is given, answers them.
 * - Groups (header chip with name, colour, count and a collapse button) come
 *   from `layoutStrip`; tabs move in and out through the shared group picker.
 * - A tab keeps its own look (`tab-appearance-store`); Shift with a right-click
 *   opens the shared look editor.
 * - A locked tab shows a lock mark, is not a link while locked and asks to
 *   unlock before it opens. Locks of a tab or of its group both count.
 * - "Close" means hide: the two bulk actions, the preview and Undo hide tabs
 *   from the row; the open tab, pinned and locked tabs are never hidden.
 * - The tabs appear in the product-wide Search all tabs: the surface is
 *   registered with `registerTabSearchSurface`, and a result sends
 *   `tab-search-activate`, which opens the section.
 *
 * Pinned, hidden and the order stay in the `sectionTabs` store.
 *
 * @element ha-section-tabs
 */
@customElement("ha-section-tabs")
export class HaSectionTabs extends LitElement {
  /** The sections of the surface, in page order. */
  @property({ attribute: false }) public tabs: SectionTabItem[] = [];

  /** The path of the section that is open. */
  @property({ attribute: false }) public activePath?: string;

  /** A phone: tabs sit in the bottom bar and the overflow entry is "More". */
  @property({ type: Boolean, reflect: true }) public narrow = false;

  /** What the choices are saved under: the route of the surface. */
  @property() public surface = "";

  @property({ attribute: false }) public localize!: LocalizeFunc;

  /**
   * The instance. With it the menu, the group picker and the editors are
   * mounted; without it the tabs work as before but have no menus.
   */
  @property({ attribute: false }) public hass?: HomeAssistant;

  @internalState()
  @storage({ key: SECTION_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _store: SectionTabsStore = {};

  /** Keys of the items that fit in the wide row; undefined until measured. */
  @internalState() private _fit?: string[];

  /** The width of the bottom bar, for the phone. */
  @internalState() private _barWidth = 0;

  @internalState() private _focusPath?: string;

  @internalState() private _dragging?: string;

  @internalState() private _dropMark?: { path: string; after: boolean };

  @internalState() private _announcement = "";

  @internalState() private _moreQuery = "";

  @internalState() private _data: SharedData = {
    groups: [],
    appearance: {},
    groupAppearance: {},
    locks: readLocks(),
  };

  @query(".more-popover") private _popover?: HTMLElement;

  @query("ha-section-tab-menu") private _menu?: HaSectionTabMenu;

  private _lang = new LanguageModeController(this);

  private _widths = new Map<string, number>();

  private _observer?: ResizeObserver;

  private _unsubscribe: (() => void)[] = [];

  private _unregisterSearch?: () => void;

  private _registeredSurface?: string;

  private _press?: {
    kind: "tab" | "group";
    id: string;
    anchor: HTMLElement;
    x: number;
    y: number;
    timer: number;
  };

  private _suppressClickUntil = 0;

  private _lastMenu = { key: "", at: 0 };

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver !== "undefined") {
      this._observer = new ResizeObserver(() => this._measure());
      this._observer.observe(this);
    }
    const storageHandle = getStorage();
    [
      GROUPS_STORAGE_KEY,
      TAB_APPEARANCE_STORAGE_KEY,
      GROUP_APPEARANCE_STORAGE_KEY,
    ].forEach((key) => {
      storageHandle.addFromStorage(key);
      this._unsubscribe.push(
        storageHandle.subscribeChanges(key, () => this._refreshShared())
      );
    });
    this._unsubscribe.push(
      subscribeLocks(() => this._refreshShared()),
      subscribeUnlocks(() => this.requestUpdate()),
      subscribeReveals(() => this.requestUpdate())
    );
    window.addEventListener("tab-search-activate", this._onSearchActivate);
    this._refreshShared();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = undefined;
    this._unsubscribe.forEach((stop) => stop());
    this._unsubscribe = [];
    this._unregisterSearch?.();
    this._unregisterSearch = undefined;
    this._registeredSurface = undefined;
    window.removeEventListener("tab-search-activate", this._onSearchActivate);
    this._cancelPress();
  }

  // The words follow the language mode, like every other tab surface.
  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.localize, key, values);
  }

  /** The strip name the shared stores know this surface by. */
  private get _surface(): string {
    return sectionSurface(this.surface);
  }

  private _refreshShared(): void {
    const surface = this._surface;
    this._widths.clear();
    this._fit = undefined;
    this._data = {
      groups: readGroups(surface),
      appearance: readTabAppearance(),
      groupAppearance: readGroupAppearance(),
      locks: readLocks(),
    };
  }

  private _state(): SectionTabsState {
    return readSectionState(this._store, this.surface);
  }

  private _save(next: SectionTabsState): void {
    this._store = writeSectionState(this._store, this.surface, next);
  }

  private _allPaths(): string[] {
    return this.tabs.map((tab) => tab.path);
  }

  private _label(path: string): string {
    const look = this._data.appearance[this._surface]?.[path];
    return (
      look?.label || this.tabs.find((tab) => tab.path === path)?.label || path
    );
  }

  private _tabByPath(path: string): SectionTabItem | undefined {
    return this.tabs.find((tab) => tab.path === path);
  }

  /** The lock a tab still waits on, or undefined when it can be opened. */
  private _lockKey(path: string): string | undefined {
    return pendingLockKey(
      this._data.locks,
      this._surface,
      path,
      this._data.groups,
      (key) => isUnlocked(key)
    );
  }

  private _layout(state = this._state()): SectionLayout {
    return sectionLayout({
      paths: this._allPaths(),
      state,
      groups: this._data.groups,
      activePath: this.activePath,
    });
  }

  /** The row: tabs and group chips in order, and what fits. */
  private _row(): {
    items: RowItem[];
    shown: SectionTabItem[];
    inRow: SectionTabItem[];
    overflowed: SectionTabItem[];
    hidden: SectionTabItem[];
    ordered: SectionTabItem[];
    collapsed: SectionTabItem[];
    layout: SectionLayout;
    chipsHidden: Set<string>;
  } {
    const state = this._state();
    const layout = this._layout(state);
    const ordered = orderSections(this.tabs, state);
    const hidden = hiddenSections(ordered, state, this.activePath);
    const byPath = new Map(this.tabs.map((tab) => [tab.path, tab]));
    const items: RowItem[] = [];
    const collapsed: SectionTabItem[] = [];
    layout.segments.forEach((segment) => {
      if (segment.kind === "tab") {
        const tab = byPath.get(segment.id);
        if (tab) {
          items.push({ kind: "tab", tab });
        }
        return;
      }
      if (segment.kind === "pinned") {
        segment.ids.forEach((id) => {
          const tab = byPath.get(id);
          if (tab) {
            items.push({ kind: "tab", tab });
          }
        });
        return;
      }
      // A group. On a phone the groups are listed in the overflow sheet and
      // the bottom bar holds the tabs alone.
      const showMembers = segment.ids.filter(
        (id) =>
          this.narrow ||
          !segment.group.collapsed ||
          id === this.activePath ||
          isRevealed(this._surface, id)
      );
      if (!this.narrow) {
        items.push({
          kind: "chip",
          group: segment.group,
          count: segment.ids.length,
        });
      }
      segment.ids.forEach((id) => {
        const tab = byPath.get(id);
        if (!tab) {
          return;
        }
        if (showMembers.includes(id)) {
          items.push({ kind: "tab", tab, group: segment.group });
        } else {
          collapsed.push(tab);
        }
      });
    });
    const shown = items.flatMap((item) =>
      item.kind === "tab" ? [item.tab] : []
    );
    const required = (tab: SectionTabItem) =>
      state.pinned.includes(tab.path) || tab.path === this.activePath;
    let fits: boolean[] | undefined;
    if (this.narrow) {
      if (this._barWidth > 0) {
        fits = planSlots(shown.map(required), slotsForWidth(this._barWidth));
      }
    } else if (this._fit) {
      const fit = new Set(this._fit);
      fits = shown.map(
        (tab) => fit.has(tab.path) || tab.path === this.activePath
      );
    }
    const inRow = fits ? shown.filter((_, index) => fits![index]) : shown;
    const overflowed = shown.filter((tab) => !inRow.includes(tab));
    // A chip is shown while any of its tabs is, or while its group has no tab
    // in the row to lose (a collapsed group) and the chip itself fits.
    const chipsHidden = new Set<string>();
    if (this._fit && !this.narrow) {
      const fit = new Set(this._fit);
      items.forEach((item) => {
        if (item.kind !== "chip") {
          return;
        }
        const members = items.filter(
          (other) => other.kind === "tab" && other.group?.id === item.group.id
        );
        const visibleMember = members.some(
          (other) =>
            other.kind === "tab" &&
            inRow.some((tab) => tab.path === other.tab.path)
        );
        if (members.length ? !visibleMember : !fit.has(itemKey(item))) {
          chipsHidden.add(item.group.id);
        }
      });
    }
    return {
      items,
      shown,
      inRow,
      overflowed,
      hidden,
      ordered,
      collapsed,
      layout,
      chipsHidden,
    };
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (
      changed.has("tabs") ||
      changed.has("narrow") ||
      changed.has("localize")
    ) {
      this._widths.clear();
      this._fit = undefined;
    }
    if (changed.has("surface")) {
      this._refreshShared();
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this._measure();
    if (changed.has("surface") || changed.has("tabs")) {
      this._registerSearch();
    }
  }

  /**
   * Offers the tabs to the product-wide Search all tabs and remembers them as
   * seen, which is what lists a strip there.
   */
  private _registerSearch(): void {
    if (!this.tabs.length) {
      return;
    }
    const surface = this._surface;
    if (this._registeredSurface !== surface) {
      this._unregisterSearch?.();
      this._unregisterSearch = registerTabSearchSurface(
        surface,
        this._searchSnapshot
      );
      this._registeredSurface = surface;
    }
    const seen = readSeen(surface);
    const missing = this._allPaths().filter((path) => !seen.includes(path));
    if (missing.length) {
      writeSeen(surface, [...seen, ...missing]);
    }
  }

  private _searchSnapshot = (): StripSnapshot => {
    const state = this._state();
    const layout = this._layout(state);
    return {
      surface: this._surface,
      surfaceLabel: this._t(`${BASE}surface_label`, { route: this.surface }),
      tabs: layout.all.map((path) => ({
        id: path,
        label: this._label(path),
        open: layout.shown.includes(path),
      })),
      pinned: layout.pinned,
      groups: this._data.groups,
    };
  };

  // A result of Search all tabs: open the section.
  private _onSearchActivate = (ev: Event) => {
    const detail = (ev as CustomEvent<{ surface?: string; id?: string }>)
      .detail;
    if (detail?.surface === this._surface && detail.id) {
      void navigate(detail.id, { replace: true });
    }
  };

  /** Records tab widths and decides what fits in the wide row. */
  private _measure(): void {
    if (!this.isConnected) {
      return;
    }
    if (this.narrow) {
      const width = this.clientWidth;
      if (width !== this._barWidth) {
        this._barWidth = width;
      }
      return;
    }
    this.querySelectorAll<HTMLElement>(
      "a.section-tab:not([hidden]), .group-chip:not([hidden])"
    ).forEach((element) => {
      const key = element.dataset.group
        ? `group:${element.dataset.group}`
        : element.dataset.path;
      if (key) {
        this._widths.set(key, element.getBoundingClientRect().width);
      }
    });
    const { items } = this._row();
    const known = items.every((item) => this._widths.has(itemKey(item)));
    if (!known) {
      // An item that was never shown cannot be measured: show everything once.
      if (this._fit) {
        this._fit = undefined;
      }
      return;
    }
    const state = this._state();
    const more = this.querySelector<HTMLElement>(".more");
    const moreWidth = more?.offsetWidth || MORE_WIDTH_FALLBACK;
    const strip = this.querySelector<HTMLElement>(".strip");
    const gap = strip
      ? parseFloat(getComputedStyle(strip).columnGap || "0") || 0
      : 0;
    const available = this.clientWidth - moreWidth;
    if (available <= 0) {
      return;
    }
    const plan = planOverflow(
      items.map((item) => this._widths.get(itemKey(item))!),
      items.map(
        (item) =>
          item.kind === "tab" &&
          (state.pinned.includes(item.tab.path) ||
            item.tab.path === this.activePath)
      ),
      available,
      0,
      gap
    );
    const fit = items.filter((_, index) => plan[index]).map(itemKey);
    const same =
      this._fit &&
      this._fit.length === fit.length &&
      this._fit.every((key, index) => key === fit[index]);
    if (!same) {
      this._fit = fit;
    }
  }

  // ---- Rendering ----

  protected render(): TemplateResult | typeof nothing {
    if (!this.localize || this.tabs.length === 0) {
      return nothing;
    }
    const state = this._state();
    const row = this._row();
    const { items, inRow, overflowed, hidden, ordered, collapsed } = row;
    const showMore =
      !this.narrow ||
      overflowed.length > 0 ||
      hidden.length > 0 ||
      collapsed.length > 0 ||
      this._data.groups.length > 0;
    const rovingPath = inRow.some((tab) => tab.path === this._focusPath)
      ? this._focusPath
      : inRow.some((tab) => tab.path === this.activePath)
        ? this.activePath
        : inRow[0]?.path;
    const hiddenByFit = new Set(
      this.tabs
        .map((tab) => tab.path)
        .filter((path) => !inRow.some((tab) => tab.path === path))
    );
    return html`
      <div class=${classMap({ "section-tabs": true, bottom: this.narrow })}>
        <div
          class="strip"
          role="tablist"
          aria-orientation="horizontal"
          aria-label=${this._t(`${BASE}label`)}
          @keydown=${this._keydown}
          @focusin=${this._focusIn}
          @contextmenu=${this._contextMenu}
          @pointerdown=${this._pressStart}
          @pointermove=${this._pressMove}
          @pointerup=${this._cancelPress}
          @pointercancel=${this._cancelPress}
        >
          ${repeat(items, itemKey, (item) =>
            item.kind === "chip"
              ? this._renderChip(
                  item.group,
                  item.count,
                  row.chipsHidden.has(item.group.id)
                )
              : this._renderTab(
                  item.tab,
                  state.pinned.includes(item.tab.path),
                  item.tab.path === rovingPath,
                  hiddenByFit.has(item.tab.path),
                  item.group
                )
          )}
        </div>
        ${
          showMore
            ? html`<button
                class="more"
                popovertarget="section-more"
                aria-haspopup="dialog"
                aria-label=${
                  overflowed.length
                    ? this._t(`${BASE}more_count`, {
                        count: overflowed.length,
                      })
                    : this._t(`${BASE}more`)
                }
                title=${this._t(`${BASE}more`)}
              >
                <ha-svg-icon .path=${mdiDotsHorizontal}></ha-svg-icon>
                ${
                  this.narrow
                    ? html`<span class="more-label"
                        >${this._t(`${BASE}more`)}</span
                      >`
                    : nothing
                }
              </button>`
            : nothing
        }
        ${this._renderMore(overflowed, hidden, ordered, collapsed, row.layout)}
        ${
          this.hass
            ? html`<ha-section-tab-menu
                .hass=${this.hass}
                .surface=${this._surface}
                .actions=${this._menuActions}
              ></ha-section-tab-menu>`
            : nothing
        }
        <div class="visually-hidden" role="status" aria-live="polite">
          ${this._announcement}
        </div>
      </div>
    `;
  }

  private _renderChip(
    group: TabGroup,
    count: number,
    outOfRow: boolean
  ): TemplateResult {
    const surface = this._surface;
    const name = group.name || this._t("ui.page_tabs.groups_strip.unnamed");
    const locked = this._data.locks.locked.includes(
      `tabgroup:${surface}:${group.id}`
    );
    const look = groupAppearanceFor(
      this._data.groupAppearance,
      surface,
      group.id
    );
    const isCollapsed = effectiveCollapsed(surface, group);
    return html`<button
      class=${classMap({ "group-chip": true, collapsed: isCollapsed })}
      type="button"
      data-group=${group.id}
      ?hidden=${outOfRow}
      tabindex="-1"
      aria-expanded=${isCollapsed ? "false" : "true"}
      aria-label=${this._t(
        locked
          ? "ui.page_tabs.groups_strip.header_label_locked"
          : "ui.page_tabs.groups_strip.header_label",
        { name, count }
      )}
      title=${this._t(
        isCollapsed
          ? "ui.page_tabs.groups_strip.expand"
          : "ui.page_tabs.groups_strip.collapse",
        { name }
      )}
      style=${styleMap({
        "--group-colour": look.color ?? groupColourCss(group.colour),
        ...groupChipStyle(look),
      })}
      @click=${this._chipClicked}
    >
      <ha-svg-icon
        class="chevron"
        .path=${isCollapsed ? mdiChevronRight : mdiChevronDown}
      ></ha-svg-icon>
      <span class="group-dot" aria-hidden="true"></span>
      <span class="group-name">${name}</span>
      <span class="group-count" aria-hidden="true">${count}</span>
      ${
        locked
          ? html`<ha-svg-icon class="lock-mark" .path=${mdiLock}></ha-svg-icon>`
          : nothing
      }
    </button>`;
  }

  private _renderTab(
    tab: SectionTabItem,
    pinned: boolean,
    roving: boolean,
    outOfRow: boolean,
    group?: TabGroup
  ): TemplateResult {
    const selected = tab.path === this.activePath;
    const look = this._data.appearance[this._surface]?.[tab.path] ?? {};
    const label = look.label || tab.label;
    const locked = this._lockKey(tab.path) !== undefined;
    const name = locked
      ? this._t(
          pinned
            ? "ui.page_tabs.dock.pinned_locked_name"
            : "ui.page_tabs.dock.locked_name",
          { name: label }
        )
      : undefined;
    const groupLook = group
      ? groupAppearanceFor(this._data.groupAppearance, this._surface, group.id)
      : undefined;
    const style = {
      ...tabStyle(look),
      ...(group
        ? {
            "--group-colour": groupLook?.color ?? groupColourCss(group.colour),
          }
        : {}),
      ...(look.borderColor && tabStyle(look)["--tab-border-color"]
        ? { "--tab-border-width": "1px" }
        : {}),
    };
    return html`
      <a
        class=${classMap({
          "section-tab": true,
          pinned,
          locked,
          grouped: Boolean(group),
          dragging: this._dragging === tab.path,
          "drop-before":
            this._dropMark?.path === tab.path && !this._dropMark.after,
          "drop-after":
            this._dropMark?.path === tab.path && this._dropMark.after,
        })}
        style=${styleMap(style)}
        id=${sectionTabDomId(tab.path)}
        role="tab"
        href=${locked ? nothing : tab.path}
        data-path=${tab.path}
        ?hidden=${outOfRow}
        aria-selected=${selected ? "true" : "false"}
        aria-controls=${SECTION_TAB_PANEL_ID}
        aria-label=${name ?? nothing}
        aria-keyshortcuts="Alt+ArrowLeft Alt+ArrowRight Alt+Shift+P Alt+Shift+H"
        tabindex=${roving ? "0" : "-1"}
        draggable="true"
        @click=${this._tabClicked}
        @dragstart=${this._dragStart}
        @dragover=${this._dragOver}
        @drop=${this._drop}
        @dragend=${this._dragEnd}
      >
        <ha-tab
          .active=${selected}
          .narrow=${this.narrow}
          .badge=${tab.badge}
          .name=${label}
        >
          ${
            look.icon
              ? html`<ha-icon slot="icon" .icon=${look.icon}></ha-icon>`
              : tab.iconPath
                ? html`<ha-svg-icon
                    slot="icon"
                    .path=${tab.iconPath}
                  ></ha-svg-icon>`
                : nothing
          }
        </ha-tab>
        ${
          locked
            ? html`<ha-svg-icon
                class="lock-mark"
                .path=${mdiLock}
              ></ha-svg-icon>`
            : pinned
              ? html`<ha-svg-icon class="pin-mark" .path=${mdiPin}></ha-svg-icon
                  ><span class="visually-hidden"
                    >${this._t(`${BASE}pinned`)}</span
                  >`
              : nothing
        }
      </a>
    `;
  }

  /** The overflow list: tabs out of view, hidden tabs, groups and the arranging. */
  private _renderMore(
    overflowed: SectionTabItem[],
    hidden: SectionTabItem[],
    ordered: SectionTabItem[],
    collapsed: SectionTabItem[],
    layout: SectionLayout
  ): TemplateResult {
    const state = this._state();
    const title = this._t(`${BASE}more`);
    const needle = this._moreQuery;
    const invalid = Boolean(regexQuery(needle)?.error);
    const matches = invalid ? () => true : searchMatcher(needle);
    const found = (tab: SectionTabItem) =>
      matches(this._label(tab.path), tab.path);
    const groupOf = (path: string) =>
      this._data.groups.find((group) => group.members.includes(path));
    const inOrder = layout.all
      .map((path) => ordered.find((tab) => tab.path === path))
      .filter((tab): tab is SectionTabItem => Boolean(tab));
    const overflowedShown = overflowed.filter(found);
    const collapsedShown = collapsed.filter(found);
    const hiddenShown = hidden.filter(found);
    const arrangeShown = inOrder.filter(
      (tab) => !state.hidden.includes(tab.path) && found(tab)
    );
    const groups = this._data.groups.filter((group) =>
      group.members.some((member) => this._tabByPath(member))
    );
    return html`
      <div
        id="section-more"
        class="more-popover"
        popover
        role="dialog"
        aria-label=${title}
        @toggle=${this._moreToggled}
      >
        <div class="more-header">
          <span class="more-title">${title}</span>
          ${
            hidden.length
              ? html`<button class="text-button" @click=${this._showEvery}>
                  <ha-svg-icon .path=${mdiTabPlus}></ha-svg-icon>
                  ${this._t(`${BASE}open_every_tab`)}
                </button>`
              : nothing
          }
        </div>
        <ha-input-search
          class="more-search"
          appearance="outlined"
          .value=${needle}
          .placeholder=${this._t(`${BASE}search`)}
          .accessibleLabel=${this._t(`${BASE}search`)}
          .patternSamples=${this.tabs.map((tab) => this._label(tab.path))}
          @input=${this._moreQueryChanged}
        ></ha-input-search>
        ${
          invalid
            ? html`<p class="hint" role="status">
                ${this._t("ui.page_tabs.group_picker.invalid_pattern")}
              </p>`
            : nothing
        }
        ${
          this.hass
            ? html`<div class="more-bulk">
                <button
                  class="bulk-button"
                  .kind=${"containing"}
                  @click=${this._bulkHide}
                >
                  <ha-svg-icon .path=${mdiTextSearch}></ha-svg-icon>
                  ${this._t(`${BASE}hide_containing`)}
                </button>
                <button
                  class="bulk-button"
                  .kind=${"not_containing"}
                  @click=${this._bulkHide}
                >
                  <ha-svg-icon .path=${mdiEyeOff}></ha-svg-icon>
                  ${this._t(`${BASE}hide_not_containing`)}
                </button>
              </div>`
            : nothing
        }
        ${
          overflowedShown.length
            ? html`<h3>${this._t(`${BASE}out_of_view`)}</h3>
                <ul>
                  ${overflowedShown.map((tab) => this._renderMoreLink(tab))}
                </ul>`
            : nothing
        }
        ${
          collapsedShown.length
            ? html`<h3>${this._t(`${BASE}in_collapsed_groups`)}</h3>
                <ul>
                  ${collapsedShown.map((tab) => this._renderMoreLink(tab, groupOf(tab.path)))}
                </ul>`
            : nothing
        }
        ${
          groups.length && !needle
            ? html`<h3>${this._t(`${BASE}groups_title`)}</h3>
                <ul>
                  ${groups.map((group) => {
                    const name =
                      group.name ||
                      this._t("ui.page_tabs.groups_strip.unnamed");
                    const isCollapsed = group.collapsed;
                    const label = this._t(
                      isCollapsed
                        ? "ui.page_tabs.groups_strip.expand"
                        : "ui.page_tabs.groups_strip.collapse",
                      { name }
                    );
                    return html`<li class="arrange-row">
                      <span
                        class="group-dot"
                        aria-hidden="true"
                        style=${styleMap({
                          "--group-colour": groupColourCss(group.colour),
                        })}
                      ></span>
                      <span class="arrange-name">${name}</span>
                      <button
                        class="row-button"
                        aria-expanded=${isCollapsed ? "false" : "true"}
                        aria-label=${label}
                        title=${label}
                        .groupId=${group.id}
                        @click=${this._rowToggleGroup}
                      >
                        <ha-svg-icon
                          .path=${isCollapsed ? mdiChevronRight : mdiChevronDown}
                        ></ha-svg-icon>
                      </button>
                    </li>`;
                  })}
                </ul>`
            : nothing
        }
        ${
          hiddenShown.length
            ? html`<h3>${this._t(`${BASE}hidden_title`)}</h3>
                <ul>
                  ${hiddenShown.map(
                    (tab) =>
                      html`<li class="arrange-row">
                        <span class="arrange-name"
                          >${this._label(tab.path)}</span
                        >
                        <button
                          class="row-button"
                          aria-label=${this._t(`${BASE}show`, {
                            name: this._label(tab.path),
                          })}
                          title=${this._t(`${BASE}show`, {
                            name: this._label(tab.path),
                          })}
                          .path=${tab.path}
                          @click=${this._showOne}
                        >
                          <ha-svg-icon .path=${mdiEye}></ha-svg-icon>
                        </button>
                      </li>`
                  )}
                </ul>`
            : nothing
        }
        <h3>${this._t(`${BASE}arrange`)}</h3>
        <p class="hint">${this._t(`${BASE}arrange_hint`)}</p>
        <ul>
          ${arrangeShown.map((tab) => {
            const pinned = state.pinned.includes(tab.path);
            const group = groupOf(tab.path);
            const label = this._label(tab.path);
            const pinLabel = this._t(pinned ? `${BASE}unpin` : `${BASE}pin`, {
              name: label,
            });
            const hideLabel = this._t(`${BASE}hide`, { name: label });
            return html`<li class="arrange-row">
              <span class="arrange-name"
                >${label}${
                  group && !pinned
                    ? html`<span class="arrange-group"
                        >${
                          group.name ||
                          this._t("ui.page_tabs.groups_strip.unnamed")
                        }</span
                      >`
                    : nothing
                }</span
              >
              <button
                class="row-button"
                aria-pressed=${pinned ? "true" : "false"}
                aria-label=${pinLabel}
                title=${pinLabel}
                .path=${tab.path}
                @click=${this._rowPin}
              >
                <ha-svg-icon .path=${pinned ? mdiPinOff : mdiPin}></ha-svg-icon>
              </button>
              <button
                class="row-button"
                aria-label=${this._t(`${BASE}move_earlier`, { name: label })}
                title=${this._t(`${BASE}move_earlier`, { name: label })}
                .path=${tab.path}
                @click=${this._rowEarlier}
              >
                <ha-svg-icon .path=${mdiArrowUp}></ha-svg-icon>
              </button>
              <button
                class="row-button"
                aria-label=${this._t(`${BASE}move_later`, { name: label })}
                title=${this._t(`${BASE}move_later`, { name: label })}
                .path=${tab.path}
                @click=${this._rowLater}
              >
                <ha-svg-icon .path=${mdiArrowDown}></ha-svg-icon>
              </button>
              <button
                class="row-button"
                ?disabled=${tab.path === this.activePath}
                aria-label=${hideLabel}
                title=${hideLabel}
                .path=${tab.path}
                @click=${this._rowHide}
              >
                <ha-svg-icon .path=${mdiEyeOff}></ha-svg-icon>
              </button>
            </li>`;
          })}
        </ul>
      </div>
    `;
  }

  private _renderMoreLink(
    tab: SectionTabItem,
    group?: TabGroup
  ): TemplateResult {
    const locked = this._lockKey(tab.path) !== undefined;
    return html`<li>
      <a
        class="more-link"
        href=${locked ? nothing : tab.path}
        data-path=${tab.path}
        role=${locked ? "button" : nothing}
        tabindex=${locked ? "0" : nothing}
        aria-current=${tab.path === this.activePath ? "page" : "false"}
        @click=${this._moreLinkClicked}
        >${this._label(tab.path)}${
          group
            ? html`<span class="arrange-group"
                >${group.name || this._t("ui.page_tabs.groups_strip.unnamed")}</span
              >`
            : nothing
        }${
          locked
            ? html`<ha-svg-icon
                class="lock-mark inline"
                .path=${mdiLock}
              ></ha-svg-icon>`
            : nothing
        }</a
      >
    </li>`;
  }

  // ---- Actions. The menu and the keys call these for any tab. ----

  private _announce(message: string): void {
    // A message equal to the last one is only read out again if it changes
    // in between.
    this._announcement = "";
    this.updateComplete.then(() => {
      this._announcement = message;
    });
  }

  private _snapshot(): SectionSnapshot {
    const labels: Record<string, string> = {};
    this.tabs.forEach((tab) => {
      labels[tab.path] = tab.label;
    });
    return {
      surface: this._surface,
      paths: this._allPaths(),
      labels,
      state: this._state(),
      groups: this._data.groups,
      activePath: this.activePath,
      locks: this._data.locks,
      appearance: this._data.appearance,
    };
  }

  /** What the menu asks this strip to do; every change is saved from here. */
  private _menuActions: SectionMenuActions = {
    snapshot: () => this._snapshot(),
    pin: (path) => this._applyPin(path),
    hide: (paths) => this._hideMany(paths),
    showEvery: () => this._applyShowEvery(),
    move: (path, kind) => this._applyMove(path, kind as SectionMove),
    moveGroup: (groupId, move) => {
      const next = moveSectionGroup({
        paths: this._allPaths(),
        state: this._state(),
        groups: this._data.groups,
        activePath: this.activePath,
        groupId,
        move,
        rtl: getComputedStyle(this).direction === "rtl",
      });
      if (!next) {
        return false;
      }
      this._save(next);
      return true;
    },
    removeFromGroup: (path) => {
      writeGroups(this._surface, ungroupTabs(this._data.groups, [path]));
      this._announce(
        this._t("ui.page_tabs.menu.removed_from_group", {
          name: this._label(path),
        })
      );
    },
    announce: (message) => this._announce(message),
  };

  protected _applyMove(path: string, move: SectionMove | TabMoveKind): void {
    const result = moveSectionTab({
      paths: this._allPaths(),
      state: this._state(),
      groups: this._data.groups,
      activePath: this.activePath,
      tabId: path,
      kind: move as SectionMove,
    });
    if (result.blocked) {
      this._announce(
        this._t(`${BASE}move_blocked`, { name: this._label(path) })
      );
      return;
    }
    if (!result.moved) {
      return;
    }
    this._save(result.state);
    if (result.groups.some((group, i) => group !== this._data.groups[i])) {
      writeGroups(this._surface, result.groups);
    }
    this._announce(
      this._t(`${BASE}moved`, {
        name: this._label(path),
        position: result.position,
        total: result.total,
      })
    );
    this._focusTab(path);
  }

  protected _applyPin(path: string): void {
    const state = this._state();
    const wasPinned = state.pinned.includes(path);
    this._save(togglePinned(this._allPaths(), state, path));
    // A pinned tab never sits in a group: pinning takes it out.
    if (!wasPinned && this._data.groups.some((g) => g.members.includes(path))) {
      writeGroups(this._surface, ungroupTabs(this._data.groups, [path]));
    }
    this._announce(
      this._t(wasPinned ? `${BASE}unpinned` : `${BASE}pinned_done`, {
        name: this._label(path),
      })
    );
    this._focusTab(path);
  }

  /** Hides one section. A locked one asks to be unlocked first. */
  protected _applyHide(path: string): void {
    if (path === this.activePath) {
      this._announce(
        this._t(`${BASE}hide_blocked`, { name: this._label(path) })
      );
      return;
    }
    const key = this._lockKey(path);
    if (key) {
      this._askUnlock(key, path, undefined, () => this._applyHide(path));
      return;
    }
    const result = hideSections(this._state(), [path], this.activePath);
    if (!result.hidden.length) {
      return;
    }
    this._save(result.state);
    this._announce(this._t(`${BASE}hidden_done`, { name: this._label(path) }));
  }

  /**
   * Hides sections after a review or from the menu, and offers Undo. The open
   * section is never hidden; the plans already keep pinned and locked ones.
   */
  private _hideMany(paths: string[]): void {
    const result = hideSections(this._state(), paths, this.activePath);
    if (!result.hidden.length) {
      return;
    }
    this._save(result.state);
    const message =
      result.hidden.length === 1
        ? this._t(`${BASE}hidden_done`, { name: this._label(result.hidden[0]) })
        : this._t(`${BASE}hidden_many`, { count: result.hidden.length });
    this._announce(message);
    fireEvent(this, "hass-notification", {
      message,
      duration: 8000,
      action: {
        text: this._t("ui.page_tabs.bulk_undo"),
        action: () => {
          this._save(restoreSections(this._state(), result.hidden));
          this._announce(
            this._t(`${BASE}restored`, { count: result.hidden.length })
          );
        },
      },
    });
  }

  protected _applyShowEvery(): void {
    this._save(showEverySection(this._state()));
    this._announce(this._t(`${BASE}shown_all`));
  }

  private _focusTab(path: string): void {
    this._focusPath = path;
    this.updateComplete.then(() => {
      Array.from(this.querySelectorAll<HTMLAnchorElement>("a.section-tab"))
        .find((anchor) => anchor.dataset.path === path)
        ?.focus();
    });
  }

  /** Asks to unlock beside an element, then runs what the lock held back. */
  private _askUnlock(
    key: string,
    path: string,
    anchor: HTMLElement | undefined,
    onSuccess: () => void
  ): void {
    const target =
      anchor ??
      Array.from(this.querySelectorAll<HTMLElement>("a.section-tab")).find(
        (tab) => tab.dataset.path === path
      ) ??
      this;
    setLockLocalize(this.localize);
    void import("../locks/ha-lock-prompt").then(({ openLockPrompt }) =>
      openLockPrompt(key, target, {
        onSuccess,
        returnTo: target,
        title: this._t("ui.page_tabs.dock.unlock_prompt", {
          name: this._label(path),
        }),
      })
    );
  }

  // ---- Events ----

  private _pathOf(ev: Event): string | undefined {
    return (ev.currentTarget as HTMLElement & { path?: string }).path;
  }

  private _rowPin(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._applyPin(path);
    }
  }

  private _rowEarlier(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._applyMove(path, "earlier");
    }
  }

  private _rowLater(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._applyMove(path, "later");
    }
  }

  private _rowHide(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._applyHide(path);
    }
  }

  private _rowToggleGroup(ev: Event): void {
    const groupId = (ev.currentTarget as HTMLElement & { groupId?: string })
      .groupId;
    const group = this._data.groups.find((item) => item.id === groupId);
    if (group) {
      writeGroups(
        this._surface,
        setGroupCollapsed(this._data.groups, group.id, !group.collapsed)
      );
    }
  }

  private _showOne(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._save(showSection(this._state(), path));
      this._announce(
        this._t(`${BASE}shown`, {
          name: this._label(path),
        })
      );
    }
  }

  private _showEvery(): void {
    this._applyShowEvery();
  }

  private _moreQueryChanged(ev: Event): void {
    this._moreQuery = (ev.target as HaInputSearch).value ?? "";
  }

  // The two bulk hides of the More list: the review opens beside the button.
  private _bulkHide(ev: Event): void {
    const button = ev.currentTarget as HTMLElement & {
      kind?: "containing" | "not_containing";
    };
    hidePopover(this._popover);
    void this._menu?.openHide(button.kind ?? "containing", this._moreAnchor());
  }

  // The popover is gone once it hides, so the review opens beside the control
  // that opened the list.
  private _moreAnchor(): HTMLElement {
    return this.querySelector<HTMLElement>(".more") ?? this;
  }

  private _focusIn(ev: FocusEvent): void {
    const anchor = (ev.target as HTMLElement).closest<HTMLAnchorElement>(
      "a.section-tab"
    );
    if (anchor?.dataset.path) {
      this._focusPath = anchor.dataset.path;
    }
  }

  /** Everything the arrow keys move between: the tabs and the group chips. */
  private _navItems(): HTMLElement[] {
    return Array.from(
      this.querySelectorAll<HTMLElement>(
        "a.section-tab:not([hidden]), .group-chip:not([hidden])"
      )
    );
  }

  private _keydown(ev: KeyboardEvent): void {
    const target = (ev.target as HTMLElement).closest<HTMLElement>(
      "a.section-tab, .group-chip"
    );
    if (!target) {
      return;
    }
    const isChip = target.classList.contains("group-chip");
    const path = isChip ? undefined : target.dataset.path;
    if (!isChip && !path) {
      return;
    }
    // The menu key and Shift+F10 open the menu of a tab or a group.
    if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
      if (!this.hass) {
        return;
      }
      ev.preventDefault();
      this._fireMenu(
        isChip ? "group" : "tab",
        isChip ? target.dataset.group! : path!,
        target,
        false
      );
      return;
    }
    if (!isChip && path) {
      const move = sectionMoveForKey(ev);
      if (move) {
        ev.preventDefault();
        this._applyMove(path, move);
        return;
      }
      const shortcut = sectionShortcutForKey(ev);
      if (shortcut) {
        ev.preventDefault();
        if (shortcut === "pin") {
          this._applyPin(path);
        } else {
          this._applyHide(path);
        }
        return;
      }
    }
    if (ev.altKey || ev.ctrlKey || ev.metaKey) {
      return;
    }
    if (
      ev.key === " " ||
      (ev.key === "Enter" && !target.hasAttribute("href"))
    ) {
      // A link opens on Enter by itself; Space is added so it works as a tab,
      // and a locked tab has no address, so Enter is added too.
      ev.preventDefault();
      target.click();
      return;
    }
    const items = this._navItems();
    const next = nextTabIndex(
      ev.key,
      items.indexOf(target),
      items.length,
      getComputedStyle(this).direction === "rtl"
    );
    if (next === undefined) {
      return;
    }
    ev.preventDefault();
    items[next].focus();
  }

  // ---- Menus ----

  private _fireMenu(
    kind: "tab" | "group" | "strip",
    id: string,
    anchor: HTMLElement,
    shift: boolean
  ): void {
    const key = `${kind}:${id}`;
    const now = Date.now();
    if (this._lastMenu.key === key && now - this._lastMenu.at < 400) {
      return;
    }
    this._lastMenu = { key, at: now };
    const surface = this._surface;
    const [name, detail] =
      kind === "tab"
        ? ["tab-context-menu", { tabId: id, anchor, shift, surface }]
        : kind === "group"
          ? ["tab-group-context-menu", { groupId: id, anchor, shift, surface }]
          : ["strip-context-menu", { anchor, surface }];
    this.dispatchEvent(
      new CustomEvent(name as string, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _hit(
    ev: Event
  ): { kind: "tab" | "group"; id: string; el: HTMLElement } | undefined {
    const el = (ev.target as HTMLElement).closest<HTMLElement>(
      "a.section-tab, .group-chip"
    );
    if (!el) {
      return undefined;
    }
    return el.classList.contains("group-chip")
      ? { kind: "group", id: el.dataset.group!, el }
      : { kind: "tab", id: el.dataset.path!, el };
  }

  // Everything on the row has its own menu, so the menu of any element stays
  // out of it. Without an instance there is no menu, and the browser keeps its own.
  private _contextMenu(ev: MouseEvent): void {
    if (!this.hass) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const hit = this._hit(ev);
    if (hit) {
      this._fireMenu(hit.kind, hit.id, hit.el, ev.shiftKey);
      return;
    }
    const strip = this.querySelector<HTMLElement>(".strip");
    if (strip) {
      this._fireMenu("strip", "", strip, false);
    }
  }

  private _pressStart(ev: PointerEvent): void {
    if (ev.pointerType !== "touch" || !this.hass) {
      return;
    }
    const hit = this._hit(ev);
    if (!hit) {
      return;
    }
    this._cancelPress();
    this._press = {
      kind: hit.kind,
      id: hit.id,
      anchor: hit.el,
      x: ev.clientX,
      y: ev.clientY,
      timer: window.setTimeout(() => {
        this._suppressClickUntil = Date.now() + 800;
        this._fireMenu(hit.kind, hit.id, hit.el, false);
        this._press = undefined;
      }, LONG_PRESS_MS),
    };
  }

  private _pressMove(ev: PointerEvent): void {
    const press = this._press;
    if (
      press &&
      Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > LONG_PRESS_SLOP
    ) {
      this._cancelPress();
    }
  }

  private _cancelPress = (): void => {
    if (this._press) {
      window.clearTimeout(this._press.timer);
      this._press = undefined;
    }
  };

  // ---- Opening ----

  private _chipClicked(ev: Event): void {
    const groupId = (ev.currentTarget as HTMLElement).dataset.group;
    const group = this._data.groups.find((item) => item.id === groupId);
    if (!group) {
      return;
    }
    writeGroups(
      this._surface,
      setGroupCollapsed(this._data.groups, group.id, !group.collapsed)
    );
    this._announce(
      this._t(
        group.collapsed
          ? "ui.page_tabs.groups_strip.expand"
          : "ui.page_tabs.groups_strip.collapse",
        { name: group.name || this._t("ui.page_tabs.groups_strip.unnamed") }
      )
    );
  }

  private async _tabClicked(ev: MouseEvent): Promise<void> {
    if (Date.now() < this._suppressClickUntil) {
      // The lift of the finger that opened the menu is not a tap on the tab.
      ev.preventDefault();
      return;
    }
    const anchor = ev.currentTarget as HTMLAnchorElement;
    const path = anchor.dataset.path;
    const key = path ? this._lockKey(path) : undefined;
    if (path && key) {
      // A locked tab asks to be unlocked first and opens once it is.
      ev.preventDefault();
      this._askUnlock(key, path, anchor, () => this._openSection(path, anchor));
      return;
    }
    const href = isNavigationClick(ev);
    if (!href) {
      return;
    }
    await navigate(href, { replace: true });
  }

  // Opens a section after an unlock. It asks again for a lock that is still
  // closed, such as the lock of the group after the lock of the tab.
  private _openSection(path: string, anchor?: HTMLElement): void {
    const key = this._lockKey(path);
    if (key) {
      this._askUnlock(key, path, anchor, () => this._openSection(path, anchor));
      return;
    }
    void navigate(path, { replace: true });
  }

  private async _moreLinkClicked(ev: MouseEvent): Promise<void> {
    const link = ev.currentTarget as HTMLAnchorElement;
    const path = link.dataset.path;
    const key = path ? this._lockKey(path) : undefined;
    if (path && key) {
      ev.preventDefault();
      hidePopover(this._popover);
      const anchor = this._moreAnchor();
      this._askUnlock(key, path, anchor, () => this._openSection(path, anchor));
      return;
    }
    const href = isNavigationClick(ev);
    hidePopover(this._popover);
    if (!href) {
      return;
    }
    await navigate(href, { replace: true });
  }

  private _moreToggled(ev: ToggleEvent): void {
    if (ev.newState !== "open" || this.narrow) {
      return;
    }
    // The list opens under the control that opened it.
    const more = this.querySelector<HTMLElement>(".more");
    if (more && this._popover && popoverOpen(this._popover)) {
      const rect = more.getBoundingClientRect();
      this._popover.style.setProperty(
        "--section-tabs-pop-top",
        `${Math.round(rect.bottom + 8)}px`
      );
    }
  }

  private _dragStart(ev: DragEvent): void {
    const path = (ev.currentTarget as HTMLElement).dataset.path;
    if (!path || !ev.dataTransfer) {
      return;
    }
    this._dragging = path;
    ev.dataTransfer.effectAllowed = "move";
    ev.dataTransfer.setData("text/plain", path);
  }

  private _dragOver(ev: DragEvent): void {
    const target = ev.currentTarget as HTMLElement;
    const path = target.dataset.path;
    if (!this._dragging || !path || path === this._dragging) {
      return;
    }
    ev.preventDefault();
    if (ev.dataTransfer) {
      ev.dataTransfer.dropEffect = "move";
    }
    const rect = target.getBoundingClientRect();
    const rtl = getComputedStyle(this).direction === "rtl";
    const past = ev.clientX > rect.left + rect.width / 2;
    const after = rtl ? !past : past;
    if (this._dropMark?.path !== path || this._dropMark.after !== after) {
      this._dropMark = { path, after };
    }
  }

  private _drop(ev: DragEvent): void {
    ev.preventDefault();
    const from = this._dragging;
    const mark = this._dropMark;
    this._dragEnd();
    if (!from || !mark) {
      return;
    }
    const result = dropSectionTab({
      paths: this._allPaths(),
      state: this._state(),
      groups: this._data.groups,
      activePath: this.activePath,
      from,
      to: mark.path,
      after: mark.after,
    });
    if (result.blocked) {
      this._announce(
        this._t(`${BASE}move_blocked`, { name: this._label(from) })
      );
      return;
    }
    if (result.moved) {
      this._save(result.state);
      if (result.groups.some((group, i) => group !== this._data.groups[i])) {
        writeGroups(this._surface, result.groups);
      }
      this._announce(
        this._t(`${BASE}moved`, {
          name: this._label(from),
          position: result.position,
          total: result.total,
        })
      );
    }
  }

  private _dragEnd(): void {
    this._dragging = undefined;
    this._dropMark = undefined;
  }
}

/** Styles for the parent that renders `ha-section-tabs` (light DOM). */
export const sectionTabsStyles = css`
  ha-section-tabs {
    display: block;
    flex: 1 1 0;
    min-width: 0;
  }
  ha-section-tabs .section-tabs {
    display: flex;
    align-items: stretch;
    min-width: 0;
  }
  ha-section-tabs .strip {
    display: flex;
    flex: 1 1 auto;
    min-width: 0;
    gap: var(--ha-space-1);
    overflow: hidden;
  }
  ha-section-tabs .section-tab {
    position: relative;
    display: block;
    flex: 0 0 auto;
    max-width: 45%;
    overflow: hidden;
    background-color: var(--tab-background, transparent);
    border-radius: var(--tab-radius, 0);
    font-weight: var(--tab-weight, inherit);
    font-style: var(--tab-font-style, inherit);
    box-shadow: inset 0 0 0 var(--tab-border-width, 0)
      var(--tab-border-color, transparent);
    text-decoration: none;
  }
  /* More specific than the layout's own link colour, so a chosen text colour
     is not overridden by it. The open tab keeps its own colour otherwise. */
  ha-section-tabs a.section-tab {
    color: var(--tab-color, var(--sidebar-text-color));
  }
  ha-section-tabs a.section-tab ha-tab[active] {
    color: var(--tab-color, var(--primary-color));
  }
  ha-section-tabs .section-tab[hidden],
  ha-section-tabs .group-chip[hidden] {
    display: none;
  }
  ha-section-tabs .section-tab:focus-visible {
    outline: var(--wa-focus-ring);
    outline-offset: calc(-1 * var(--wa-focus-ring-width));
    background-color: rgba(var(--rgb-secondary-text-color), 0.08);
  }
  @supports (color: color-mix(in srgb, black, transparent)) {
    ha-section-tabs .section-tab:focus-visible {
      background-color: color-mix(
        in srgb,
        var(--secondary-text-color) 8%,
        transparent
      );
    }
  }
  ha-section-tabs .section-tab.grouped {
    border-bottom: 2px solid var(--group-colour, transparent);
  }
  ha-section-tabs .section-tab.locked {
    cursor: pointer;
  }
  ha-section-tabs .section-tab.dragging {
    opacity: 0.5;
  }
  ha-section-tabs .section-tab.drop-before {
    box-shadow: inset 2px 0 0 var(--primary-color);
  }
  ha-section-tabs .section-tab.drop-after {
    box-shadow: inset -2px 0 0 var(--primary-color);
  }
  ha-section-tabs .pin-mark,
  ha-section-tabs .lock-mark:not(.inline) {
    position: absolute;
    top: var(--ha-space-1);
    inset-inline-end: var(--ha-space-1);
    --mdc-icon-size: 12px;
    width: 12px;
    height: 12px;
    color: var(--secondary-text-color);
    pointer-events: none;
  }
  ha-section-tabs .group-chip .lock-mark {
    position: static;
  }
  ha-section-tabs .lock-mark.inline {
    --mdc-icon-size: 14px;
    width: 14px;
    height: 14px;
    margin-inline-start: var(--ha-space-2);
    vertical-align: middle;
    color: var(--secondary-text-color);
  }
  ha-section-tabs .group-chip {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    align-self: center;
    gap: var(--ha-space-1);
    min-height: 44px;
    max-width: 45%;
    padding: 0 var(--ha-space-2);
    border-radius: var(--ha-border-radius-pill);
    background: none;
    color: var(--primary-text-color);
    cursor: pointer;
    font: inherit;
    font-size: var(--ha-font-size-s);
    --mdc-icon-size: 16px;
  }
  ha-section-tabs .group-chip:hover {
    background-color: var(--ha-color-fill-neutral-quiet-resting);
  }
  ha-section-tabs .group-chip:focus-visible,
  ha-section-tabs .bulk-button:focus-visible {
    outline: var(--wa-focus-ring);
  }
  ha-section-tabs .group-dot {
    flex: none;
    width: 10px;
    height: 10px;
    border-radius: var(--ha-border-radius-circle);
    background-color: var(--group-colour, var(--primary-color));
  }
  ha-section-tabs .group-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  ha-section-tabs .group-count {
    color: var(--secondary-text-color);
  }
  ha-section-tabs .more {
    flex: none;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    margin: auto 0;
    padding: 0;
    border: none;
    border-radius: var(--ha-border-radius-circle);
    background: none;
    color: var(--secondary-text-color);
    cursor: pointer;
    font: inherit;
  }
  ha-section-tabs .more:focus-visible,
  ha-section-tabs .row-button:focus-visible,
  ha-section-tabs .text-button:focus-visible,
  ha-section-tabs .more-link:focus-visible {
    outline: var(--wa-focus-ring);
  }
  ha-section-tabs .bottom .strip {
    justify-content: space-around;
    gap: 0;
  }
  ha-section-tabs .bottom .section-tab {
    flex: 1 1 0;
    min-width: 0;
    max-width: none;
  }
  ha-section-tabs .bottom .more {
    flex: 1 1 0;
    flex-direction: column;
    min-width: 0;
    margin: 0;
    border-radius: 0;
    font-size: var(--ha-font-size-xs);
  }
  ha-section-tabs .more-label {
    white-space: normal;
    overflow-wrap: normal;
    line-height: 1.1;
  }
  ha-section-tabs .more-popover {
    position: fixed;
    inset: auto;
    top: var(--section-tabs-pop-top, 120px);
    inset-inline-end: var(--ha-space-4);
    margin: 0;
    width: min(360px, calc(100vw - 32px));
    max-height: min(520px, calc(100dvh - 120px));
    overflow: auto;
    box-sizing: border-box;
    padding: var(--ha-space-3);
    border: none;
    border-radius: var(--ha-border-radius-4xl);
    background-color: var(--primary-background-color);
    color: var(--primary-text-color);
    box-shadow:
      0 4px 8px 3px rgba(0, 0, 0, 0.1),
      0 1px 3px rgba(0, 0, 0, 0.2);
    font-size: var(--ha-font-size-m);
    text-align: start;
  }
  ha-section-tabs .bottom .more-popover {
    top: auto;
    bottom: 0;
    inset-inline: 0;
    width: auto;
    max-height: 75dvh;
    border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0 0;
    padding-bottom: calc(
      var(--ha-space-3) + var(--safe-area-inset-bottom, 0px)
    );
  }
  ha-section-tabs .more-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--ha-space-2);
    flex-wrap: wrap;
  }
  ha-section-tabs .more-title {
    font-weight: var(--ha-font-weight-medium);
  }
  ha-section-tabs .more-search {
    display: block;
    margin-top: var(--ha-space-2);
    --ha-input-search-height: 44px;
    --ha-input-search-border-radius: var(--ha-border-radius-pill);
  }
  ha-section-tabs .more-bulk {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-1);
    margin-top: var(--ha-space-2);
  }
  ha-section-tabs .bulk-button {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-1);
    min-height: 44px;
    padding: 0 var(--ha-space-3);
    border: none;
    border-radius: var(--ha-border-radius-pill);
    background: none;
    color: var(--primary-color);
    cursor: pointer;
    font: inherit;
    --mdc-icon-size: 18px;
  }
  ha-section-tabs .more-popover h3 {
    margin: var(--ha-space-3) 0 var(--ha-space-1);
    font-size: var(--ha-font-size-s);
    font-weight: var(--ha-font-weight-medium);
    color: var(--secondary-text-color);
  }
  ha-section-tabs .more-popover ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }
  ha-section-tabs .hint {
    margin: 0 0 var(--ha-space-1);
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
  }
  ha-section-tabs .more-link {
    display: flex;
    align-items: center;
    min-height: 44px;
    padding: 0 var(--ha-space-2);
    color: var(--primary-text-color);
    text-decoration: none;
    overflow-wrap: anywhere;
  }
  ha-section-tabs .arrange-row {
    display: flex;
    align-items: center;
    gap: var(--ha-space-1);
    min-height: 44px;
  }
  ha-section-tabs .arrange-name {
    flex: 1;
    min-width: 0;
    padding-inline: var(--ha-space-2);
    overflow-wrap: anywhere;
  }
  ha-section-tabs .arrange-group {
    margin-inline-start: var(--ha-space-2);
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s);
  }
  ha-section-tabs .row-button,
  ha-section-tabs .text-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: var(--ha-space-1);
    min-width: 44px;
    min-height: 44px;
    padding: 0 var(--ha-space-2);
    border: none;
    border-radius: var(--ha-border-radius-pill);
    background: none;
    color: var(--secondary-text-color);
    cursor: pointer;
    font: inherit;
  }
  ha-section-tabs .row-button[aria-pressed="true"],
  ha-section-tabs .text-button {
    color: var(--primary-color);
  }
  ha-section-tabs .row-button[disabled] {
    opacity: 0.4;
    cursor: default;
  }
  ha-section-tabs .visually-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
  @media (prefers-reduced-motion: reduce) {
    ha-section-tabs * {
      transition: none;
      animation: none;
      scroll-behavior: auto;
    }
  }
`;

declare global {
  interface HTMLElementTagNameMap {
    "ha-section-tabs": HaSectionTabs;
  }
}
