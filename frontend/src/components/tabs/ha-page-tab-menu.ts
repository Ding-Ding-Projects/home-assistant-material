import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { setLockLocalize } from "../../common/locks/element-lock-session";
import type { ClosePlanKind } from "../../common/tabs/tab-close-plans";
import { reportClose } from "../../common/tabs/tab-close-plans";
import type { DockEdge } from "../../common/tabs/tab-dock";
import { readDock, writeDock } from "../../common/tabs/tab-dock";
import {
  readTabAppearance,
  resetTab,
  writeTabAppearance,
} from "../../common/tabs/tab-appearance-store";
import { tabLockKey } from "../../common/tabs/tab-locks";
import { getDefaultPanelUrlPath } from "../../data/panel";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";
import type { HaAppearanceTools } from "../appearance/ha-appearance-tools";
import "../ha-svg-icon";
import { computePageTabs } from "./compute-page-tabs";
import "./ha-tab-appearance-editor";
import type { HaTabAppearanceEditor } from "./ha-tab-appearance-editor";
import "./ha-tab-close-by-text";
import type { HaTabCloseByText } from "./ha-tab-close-by-text";
import type { TabMenuState } from "./tab-menu-actions";
import {
  closeTabsAction,
  moveAction,
  movesAvailable,
  openEveryAction,
  readMenuState,
  removeFromGroupAction,
  togglePinAction,
  undoCloseAction,
  unlockKeyFor,
} from "./tab-menu-actions";
import type { TabMenuEntry, TabMoveKind } from "./tab-menu-entries";
import { stripMenuEntries, tabMenuEntries } from "./tab-menu-entries";
import type { Placement } from "./tab-menu-placement";
import { placeBeside } from "./tab-menu-placement";
import { tabSharedStyles } from "./tab-shared-styles";
import type { PageTab } from "./tab-types";

/** What the strip sends when a tab menu is asked for. */
interface TabContextMenuDetail {
  tabId: string;
  anchor: HTMLElement;
  /** Shift was held: the tab appearance editor opens directly. */
  shift: boolean;
  surface?: string;
}

/** What the strip sends for the empty space of the strip. */
interface StripContextMenuDetail {
  anchor: HTMLElement;
  surface?: string;
}

/** What this element asks the group picker for. */
interface GroupPickerDetail {
  tabIds: string[];
  anchor: HTMLElement;
  surface: string;
  create?: boolean;
}

type MenuTarget =
  | { kind: "tab"; tabId: string; anchor: HTMLElement }
  | { kind: "strip"; anchor: HTMLElement };

const TYPEAHEAD_MS = 700;

const BASE = "ui.page_tabs.menu.";

/** The element of the page that edits the look of an element, if one is mounted. */
const findAppearanceTools = (start: Node): HaAppearanceTools | undefined => {
  let node: Node | null = start;
  while (node) {
    const root: Node = node.getRootNode();
    if (root instanceof ShadowRoot) {
      const found = root.querySelector<HaAppearanceTools>(
        "ha-appearance-tools"
      );
      if (found) {
        return found;
      }
      node = root.host;
    } else {
      return (
        (root as Document).querySelector?.<HaAppearanceTools>(
          "ha-appearance-tools"
        ) ?? undefined
      );
    }
  }
  return undefined;
};

/**
 * @element ha-page-tab-menu
 *
 * @summary
 * The menu of the tab strip. It listens on the window for `tab-context-menu`
 * (right-click, the menu key, Shift+F10 or a long press on a tab) and
 * `strip-context-menu` (the empty space of the strip), and opens beside the
 * thing it was asked for, as a sheet at the bottom on a phone. It only acts on
 * events whose `surface` is its own, so any strip can use it.
 *
 * Pin, close, move, group, appearance and lock are all done here. Every change
 * goes through the model in `common/tabs`; the strip redraws when the stored
 * lists change. Closing more than one tab always shows a preview first.
 *
 * Shift with a right-click opens the tab appearance editor directly.
 *
 * @fires tab-group-picker-open - Asks the group picker to open; `detail` has `tabIds`, `anchor`, `surface` and, for a new group, `create`.
 * @fires tab-catalog-open - Asks the strip to open the New tab catalog. Call `preventDefault()` when handled.
 */
@customElement("ha-page-tab-menu")
export class HaPageTabMenu extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The strip this menu belongs to. */
  @property() public surface = "main";

  /**
   * The tabs the strip offers, in natural order. When left out the sidebar
   * pages are used, which is what the main strip shows.
   */
  @property({ attribute: false }) public tabs?: PageTab[];

  @state() private _target?: MenuTarget;

  @state() private _entries: TabMenuEntry[] = [];

  @state() private _state?: TabMenuState;

  @state() private _dock: DockEdge = "left";

  @state() private _placement?: Placement;

  @state() private _active = 0;

  @state() private _announcement = "";

  @query("#menu") private _menu?: HTMLElement;

  @query("ha-tab-close-by-text") private _closeDialog?: HaTabCloseByText;

  @query("ha-tab-appearance-editor")
  private _editor?: HaTabAppearanceEditor;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass.localize, key, values);

  private _typed = "";

  private _typedTimer?: number;

  /** Set when another surface takes the focus, so the tab does not. */
  private _keepFocus = false;

  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener("tab-context-menu", this._onTabMenu);
    window.addEventListener("strip-context-menu", this._onStripMenu);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("tab-context-menu", this._onTabMenu);
    window.removeEventListener("strip-context-menu", this._onStripMenu);
    window.removeEventListener("resize", this._place);
    window.clearTimeout(this._typedTimer);
  }

  // ---- Opening ----

  private _mine(surface?: string): boolean {
    return Boolean(this.hass) && (surface ?? "main") === this.surface;
  }

  private _onTabMenu = (ev: Event) => {
    const detail = (ev as CustomEvent<TabContextMenuDetail>).detail;
    if (!detail || !this._mine(detail.surface)) {
      return;
    }
    this._openTab(detail);
  };

  private _onStripMenu = (ev: Event) => {
    const detail = (ev as CustomEvent<StripContextMenuDetail>).detail;
    if (!detail || !this._mine(detail.surface)) {
      return;
    }
    this._openStrip(detail);
  };

  private _readState(): TabMenuState {
    const tabs =
      this.tabs ??
      computePageTabs(
        this.hass.panels,
        getDefaultPanelUrlPath(this.hass),
        Boolean(this.hass.user?.is_admin),
        this.hass.localize
      );
    return readMenuState(this.surface, tabs, this.hass.panelUrl);
  }

  private async _openTab(detail: TabContextMenuDetail) {
    const snap = this._readState();
    this._state = snap;
    this._dock = readDock(this.surface);
    if (!snap.ordered.includes(detail.tabId)) {
      return;
    }
    if (detail.shift) {
      this._closeMenu(false);
      this._editAppearance(detail.tabId, detail.anchor);
      return;
    }
    const lock = snap.locks[detail.tabId];
    this._entries = tabMenuEntries({
      tabId: detail.tabId,
      openIds: snap.open,
      pinnedIds: snap.pinned,
      locked: Boolean(lock?.locked),
      lockedByGroup: lock?.byGroup,
      grouped: snap.groups.some((group) =>
        group.members.includes(detail.tabId)
      ),
      hasClosed: snap.ordered.some((id) => snap.closed.includes(id)),
      customised: Boolean(
        snap.appearance[this.surface]?.[detail.tabId] &&
        Object.keys(snap.appearance[this.surface][detail.tabId]).length
      ),
      dock: this._dock,
      rtl: document.dir === "rtl",
      moves: movesAvailable(snap, detail.tabId),
    });
    await this._show({
      kind: "tab",
      tabId: detail.tabId,
      anchor: detail.anchor,
    });
  }

  private async _openStrip(detail: StripContextMenuDetail) {
    const snap = this._readState();
    this._state = snap;
    this._dock = readDock(this.surface);
    this._entries = stripMenuEntries({
      dock: this._dock,
      hasClosed: snap.ordered.some((id) => snap.closed.includes(id)),
      hasOpen: snap.open.length > 0,
    });
    await this._show({ kind: "strip", anchor: detail.anchor });
  }

  private async _show(target: MenuTarget) {
    this._closeDialogs();
    this._target = target;
    this._placement = undefined;
    this._active = this._entries.findIndex((entry) => entry.enabled);
    await this.updateComplete;
    if (this._menu && !this._menu.matches(":popover-open")) {
      this._menu.showPopover();
    }
    window.addEventListener("resize", this._place);
    await this.updateComplete;
    this._place();
    this._focusItem(this._active);
  }

  private _place = () => {
    const target = this._target;
    if (!target || !this._menu) {
      return;
    }
    const size = this._menu.getBoundingClientRect();
    this._placement = placeBeside(
      target.anchor.getBoundingClientRect(),
      { width: Math.max(size.width, 240), height: size.height || 400 },
      {
        width: window.visualViewport?.width ?? window.innerWidth,
        height: window.visualViewport?.height ?? window.innerHeight,
      },
      this._dock,
      document.dir === "rtl"
    );
  };

  private _closeDialogs() {
    this._closeDialog?.close(false);
    this._editor?.close(false);
  }

  private _closeMenu(returnFocus = true) {
    this._keepFocus = !returnFocus;
    if (this._menu?.matches(":popover-open")) {
      this._menu.hidePopover();
    }
    window.removeEventListener("resize", this._place);
  }

  private _toggled(ev: Event) {
    if ((ev as ToggleEvent).newState !== "closed") {
      return;
    }
    window.removeEventListener("resize", this._place);
    const anchor = this._target?.anchor;
    if (!this._keepFocus && anchor?.isConnected) {
      anchor.focus();
    }
    this._keepFocus = false;
  }

  // ---- Keyboard ----

  private _items(): HTMLElement[] {
    return Array.from(
      this._menu?.querySelectorAll<HTMLElement>("[data-entry]") ?? []
    );
  }

  private _focusItem(index: number) {
    const item = this._items()[index];
    if (item) {
      this._active = index;
      item.focus();
    }
  }

  private _step(from: number, delta: 1 | -1): number {
    const count = this._entries.length;
    for (let i = 1; i <= count; i++) {
      const next = (from + delta * i + count * i) % count;
      if (this._entries[next].enabled) {
        return next;
      }
    }
    return from;
  }

  private _menuKeydown(ev: KeyboardEvent) {
    const count = this._entries.length;
    if (!count) {
      return;
    }
    switch (ev.key) {
      case "ArrowDown":
        ev.preventDefault();
        this._focusItem(this._step(this._active, 1));
        break;
      case "ArrowUp":
        ev.preventDefault();
        this._focusItem(this._step(this._active, -1));
        break;
      case "Home":
        ev.preventDefault();
        this._focusItem(this._step(-1, 1));
        break;
      case "End":
        ev.preventDefault();
        this._focusItem(this._step(count, -1));
        break;
      case "Escape":
        ev.preventDefault();
        ev.stopPropagation();
        this._closeMenu();
        break;
      case "Tab":
        // Leaving the menu with Tab closes it and returns to the tab.
        ev.preventDefault();
        this._closeMenu();
        break;
      default:
        if (
          ev.key.length === 1 &&
          !ev.ctrlKey &&
          !ev.metaKey &&
          !ev.altKey &&
          ev.key !== " "
        ) {
          this._typeahead(ev.key);
        }
    }
  }

  private _typeahead(char: string) {
    window.clearTimeout(this._typedTimer);
    this._typed += char.toLowerCase();
    this._typedTimer = window.setTimeout(() => {
      this._typed = "";
    }, TYPEAHEAD_MS);
    const labels = this._entries.map((entry) =>
      this._t(entry.labelKey).toLowerCase()
    );
    // The same letter repeated cycles through the entries that start with it.
    const cycle = this._typed.split("").every((c) => c === this._typed[0]);
    const needle = cycle ? this._typed[0] : this._typed;
    const start = cycle ? this._active + 1 : this._active;
    for (let i = 0; i < labels.length; i++) {
      const index = (start + i) % labels.length;
      if (this._entries[index].enabled && labels[index].startsWith(needle)) {
        this._focusItem(index);
        return;
      }
    }
  }

  // ---- Running an entry ----

  private _itemClicked(ev: Event) {
    const index = Number(
      (ev.currentTarget as HTMLElement).dataset.entry ?? "-1"
    );
    const entry = this._entries[index];
    if (entry?.enabled) {
      this._run(entry);
    }
  }

  private _announce(message: string) {
    // The text changes so a repeated message is read again.
    this._announcement =
      this._announcement === message ? `${message} ` : message;
  }

  private _name(tabId: string): string {
    return this._state?.labels[tabId] ?? tabId;
  }

  private _askGroupPicker(
    tabIds: string[],
    anchor: HTMLElement,
    create: boolean
  ) {
    const detail: GroupPickerDetail = {
      tabIds,
      anchor,
      surface: this.surface,
      ...(create ? { create: true } : {}),
    };
    this.dispatchEvent(
      new CustomEvent("tab-group-picker-open", {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _openCatalog() {
    const ev = new CustomEvent("tab-catalog-open", {
      detail: { surface: this.surface },
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    // The shell that owns the catalog opens it and cancels the event.
    this.dispatchEvent(ev);
  }

  private _run(entry: TabMenuEntry) {
    const target = this._target;
    const snap = this._state;
    if (!target || !snap) {
      return;
    }
    const tabId = target.kind === "tab" ? target.tabId : undefined;
    const anchor = target.anchor;
    // Entries that open another surface hand the focus to it.
    const opensSurface = [
      "close_others",
      "close_to_start",
      "close_to_end",
      "close_containing",
      "close_not_containing",
      "edit_appearance",
      "lock",
      "unlock",
      "move_into_group",
      "new_group",
      "new_tab",
    ].includes(entry.id);
    this._closeMenu(!opensSurface);

    switch (entry.id) {
      case "pin":
      case "unpin":
        if (tabId) {
          const { pinned } = togglePinAction(snap, tabId);
          this._announce(
            this._t(pinned ? "ui.page_tabs.pinned" : "ui.page_tabs.unpinned", {
              name: this._name(tabId),
            })
          );
        }
        break;
      case "close":
        if (tabId) {
          this._closeIds([tabId], snap);
        }
        break;
      case "close_others":
        this._openClose("others", anchor, tabId);
        break;
      case "close_to_start":
        this._openClose("to_start", anchor, tabId);
        break;
      case "close_to_end":
        this._openClose("to_end", anchor, tabId);
        break;
      case "close_containing":
        this._openClose("containing", anchor);
        break;
      case "close_not_containing":
        this._openClose("not_containing", anchor);
        break;
      case "open_every": {
        const { reopened } = openEveryAction(snap);
        this._announce(
          this._t(`${BASE}opened_every`, { count: reopened.length })
        );
        break;
      }
      case "move_into_group":
        if (tabId) {
          this._askGroupPicker([tabId], anchor, false);
        }
        break;
      case "new_group":
        this._askGroupPicker(tabId ? [tabId] : [], anchor, true);
        break;
      case "remove_from_group":
        if (tabId) {
          removeFromGroupAction(snap, tabId);
          this._announce(
            this._t(`${BASE}removed_from_group`, { name: this._name(tabId) })
          );
        }
        break;
      case "move_earlier":
      case "move_later":
      case "move_start":
      case "move_end":
        if (tabId) {
          this._move(snap, tabId, entry.id.slice(5) as TabMoveKind, anchor);
        }
        break;
      case "edit_appearance":
        if (tabId) {
          this._editAppearance(tabId, anchor);
        }
        break;
      case "reset_appearance":
        if (tabId) {
          writeTabAppearance(
            resetTab(readTabAppearance(), this.surface, tabId)
          );
          this._announce(
            this._t(`${BASE}appearance_reset`, { name: this._name(tabId) })
          );
        }
        break;
      case "lock":
        if (tabId) {
          this._lock(tabId, anchor);
        }
        break;
      case "unlock":
        if (tabId) {
          this._unlock(snap, tabId, anchor);
        }
        break;
      case "dock_left":
      case "dock_right":
      case "dock_top":
      case "dock_bottom": {
        const edge = entry.id.slice(5) as DockEdge;
        writeDock(this.surface, edge);
        this._announce(
          this._t(`${BASE}docked`, { edge: this._t(`${BASE}edge_${edge}`) })
        );
        break;
      }
      case "new_tab":
        this._openCatalog();
        break;
      case "edit_strip_appearance":
        this._editStrip(anchor);
        break;
    }
  }

  private _move(
    snap: TabMenuState,
    tabId: string,
    kind: TabMoveKind,
    anchor: HTMLElement
  ) {
    const moved = moveAction(snap, tabId, kind);
    if (!moved) {
      this._announce(
        this._t("ui.page_tabs.move_blocked", { name: this._name(tabId) })
      );
      return;
    }
    this._announce(
      this._t("ui.page_tabs.moved", {
        name: this._name(tabId),
        position: moved.position,
        total: moved.total,
      })
    );
    // The strip redraws the tab in its new place; the focus follows it.
    this.updateComplete.then(() =>
      requestAnimationFrame(() => {
        if (anchor.isConnected) {
          anchor.focus();
        }
      })
    );
  }

  // ---- Closing ----

  private _openClose(kind: ClosePlanKind, anchor: HTMLElement, tabId?: string) {
    this._closeDialog?.show(kind, anchor, tabId);
  }

  private _closeIds(ids: string[], snap: TabMenuState) {
    closeTabsAction(snap, ids);
    const after = this._readState();
    const report = reportClose({ ids }, after.open);
    const names = (list: string[]) =>
      list.map((id) => this._name(id)).join(", ");
    const message = report.failed.length
      ? this._t(`${BASE}close_partial`, {
          count: report.closed.length,
          failed: names(report.failed),
        })
      : ids.length === 1
        ? this._t("ui.phone.closed_toast", { name: this._name(ids[0]) })
        : this._t("ui.page_tabs.bulk_done", { count: report.closed.length });
    this._announce(message);
    showToast(this, {
      message,
      duration: 8000,
      action: {
        text: this._t("ui.page_tabs.bulk_undo"),
        action: () => undoCloseAction(report.closed),
      },
    });
  }

  private _confirmed(ev: CustomEvent<{ ids: string[]; kind: ClosePlanKind }>) {
    ev.stopPropagation();
    if (this._state) {
      // The tabs may have changed while the preview was open.
      this._closeIds(ev.detail.ids, this._readState());
    }
  }

  // ---- Appearance and locks ----

  private _editAppearance(tabId: string, anchor: HTMLElement) {
    void this._editor?.show({
      surface: this.surface,
      tabId,
      label: this._name(tabId),
      anchor,
      dock: this._dock,
    });
  }

  private _editStrip(anchor: HTMLElement) {
    const tools = findAppearanceTools(this);
    if (tools) {
      tools.editElement(anchor);
      return;
    }
    // Nothing is mounted to edit it: start the pick tool instead.
    this.dispatchEvent(
      new CustomEvent("hass-pick-appearance", { bubbles: true, composed: true })
    );
  }

  private async _lock(tabId: string, anchor: HTMLElement) {
    setLockLocalize(this.hass.localize);
    const { openLockWizard } = await import("../locks/ha-lock-wizard");
    openLockWizard({
      key: tabLockKey(this.surface, tabId),
      label: this._t(`${BASE}lock_label`, { name: this._name(tabId) }),
      anchor,
      onStartDefault: false,
      onCreated: () =>
        this._announce(this._t(`${BASE}locked`, { name: this._name(tabId) })),
    });
  }

  private async _unlock(
    snap: TabMenuState,
    tabId: string,
    anchor: HTMLElement
  ) {
    const key = unlockKeyFor(snap, tabId);
    if (!key) {
      return;
    }
    setLockLocalize(this.hass.localize);
    const { openLockPrompt } = await import("../locks/ha-lock-prompt");
    openLockPrompt(key, anchor, { returnTo: anchor });
  }

  // ---- Rendering ----

  protected render(): TemplateResult {
    const target = this._target;
    const placement = this._placement;
    const ready = Boolean(this.hass && target);
    const title = ready
      ? target!.kind === "tab"
        ? this._t(`${BASE}tab_menu`, { name: this._name(target!.tabId) })
        : this._t(`${BASE}strip_menu`)
      : "";
    return html`
      <div
        id="menu"
        popover="auto"
        role="menu"
        tabindex="-1"
        aria-label=${title}
        class=${placement?.sheet ? "sheet" : ""}
        style=${styleMap(
          placement && !placement.sheet
            ? {
                left: `${placement.left}px`,
                top: `${placement.top}px`,
                "max-height": `${placement.maxHeight}px`,
                "max-width": `${placement.maxWidth}px`,
              }
            : {}
        )}
        @keydown=${this._menuKeydown}
        @toggle=${this._toggled}
      >
        ${
          ready
            ? html`
                ${placement?.sheet ? html`<p class="sheet-title">${title}</p>` : nothing}
                ${this._entries.map((entry, index) => this._renderEntry(entry, index))}
              `
            : nothing
        }
      </div>
      <ha-tab-close-by-text
        .hass=${this.hass}
        .tabState=${this._state}
        .dock=${this._dock}
        @tab-menu-close=${this._confirmed}
      ></ha-tab-close-by-text>
      <ha-tab-appearance-editor .hass=${this.hass}></ha-tab-appearance-editor>
      <div class="visually-hidden" role="status" aria-live="polite">
        ${this._announcement}
      </div>
    `;
  }

  private _renderEntry(entry: TabMenuEntry, index: number): TemplateResult {
    const radio = entry.checked !== undefined;
    return html`
      ${entry.separatorBefore ? html`<div class="separator" role="separator"></div>` : nothing}
      <button
        role=${radio ? "menuitemradio" : "menuitem"}
        aria-checked=${radio ? String(entry.checked) : nothing}
        aria-disabled=${entry.enabled ? nothing : "true"}
        tabindex=${index === this._active ? "0" : "-1"}
        class=${entry.destructive ? "destructive" : ""}
        data-entry=${index}
        @click=${this._itemClicked}
      >
        <ha-svg-icon .path=${entry.icon}></ha-svg-icon>
        <span class="label">${this._t(entry.labelKey)}</span>
        ${
          radio && entry.checked
            ? html`<span class="mark" aria-hidden="true">●</span>`
            : nothing
        }
      </button>
    `;
  }

  static styles: CSSResultGroup = [
    tabSharedStyles,
    css`
      #menu {
        position: fixed;
        inset: auto;
        margin: 0;
        box-sizing: border-box;
        width: min(280px, calc(100vw - 16px));
        padding: var(--ha-space-2);
        border: none;
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
        color: var(--primary-text-color);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
        overflow-y: auto;
      }
      #menu:popover-open {
        display: flex;
        flex-direction: column;
      }
      #menu:focus {
        outline: none;
      }
      #menu.sheet {
        inset: auto 0 0 0;
        width: 100%;
        max-width: none;
        max-height: 80vh;
        padding-bottom: var(--ha-space-4);
        border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0
          0;
      }
      .sheet-title {
        margin: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      [role^="menuitem"] {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        width: 100%;
        min-height: 40px;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        text-align: start;
        --mdc-icon-size: 20px;
      }
      @media (pointer: coarse), (max-width: 599px) {
        [role^="menuitem"] {
          min-height: 44px;
        }
      }
      [role^="menuitem"] .label {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      [role^="menuitem"]:hover,
      [role^="menuitem"]:focus-visible {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }
      [role^="menuitem"]:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      [role^="menuitem"][aria-disabled="true"] {
        opacity: 0.45;
        cursor: default;
      }
      .destructive ha-svg-icon {
        color: var(--error-color);
      }
      .mark {
        color: var(--primary-color);
      }
      .separator {
        height: 1px;
        margin: var(--ha-space-1) var(--ha-space-2);
        background: var(--divider-color);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-page-tab-menu": HaPageTabMenu;
  }
}
