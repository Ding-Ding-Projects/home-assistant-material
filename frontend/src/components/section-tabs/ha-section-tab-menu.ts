import {
  mdiArrowCollapseLeft,
  mdiArrowCollapseRight,
  mdiChevronDown,
  mdiChevronLeft,
  mdiChevronRight,
  mdiChevronUp,
  mdiCloseBoxMultiple,
  mdiEyeOff,
  mdiFolderPlus,
  mdiFolderRemoveOutline,
  mdiLock,
  mdiLockOpenVariantOutline,
  mdiPalette,
  mdiRenameBox,
  mdiTabPlus,
  mdiTextSearch,
  mdiUngroup,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  isUnlocked,
  lockAgain,
  setLockLocalize,
} from "../../common/locks/element-lock-session";
import {
  readLocks,
  withLock,
  writeLocks,
} from "../../common/locks/element-locks";
import {
  readTabAppearance,
  resetTab,
  writeTabAppearance,
} from "../../common/tabs/tab-appearance-store";
import type { TabGroup } from "../../common/tabs/tab-groups";
import {
  readGroups,
  setGroupCollapsed,
  writeGroups,
} from "../../common/tabs/tab-groups";
import { groupLockKey, tabLockKey } from "../../common/tabs/tab-locks";
import type { HomeAssistant } from "../../types";
import type { GroupMove } from "../tabs/tab-group-actions";
import "../ha-svg-icon";
import "../tabs/ha-tab-appearance-editor";
import type { HaTabAppearanceEditor } from "../tabs/ha-tab-appearance-editor";
import "../tabs/ha-tab-group-editor";
import "../tabs/ha-tab-group-picker";
import type { TabMenuState } from "../tabs/tab-menu-actions";
import { unlockKeyFor } from "../tabs/tab-menu-actions";
import type { TabMenuEntryId, TabMoveKind } from "../tabs/tab-menu-entries";
import { tabMenuEntries } from "../tabs/tab-menu-entries";
import type { Placement } from "../tabs/tab-menu-placement";
import { placeBeside } from "../tabs/tab-menu-placement";
import { tabSharedStyles } from "../tabs/tab-shared-styles";
import "./ha-section-hide-dialog";
import { hidePopover, popoverOpen, showPopover } from "./section-popover";
import type {
  HaSectionHideDialog,
  SectionHideKind,
} from "./ha-section-hide-dialog";
import type { SectionPlanInput, SectionSnapshot } from "./section-surface";
import { sectionMenuState, sectionMovesAvailable } from "./section-surface";

/** What the section tabs send when a tab menu is asked for. */
interface TabMenuDetail {
  tabId: string;
  anchor: HTMLElement;
  shift: boolean;
  surface?: string;
}

interface GroupMenuDetail {
  groupId: string;
  anchor: HTMLElement;
  shift: boolean;
  surface?: string;
}

interface StripMenuDetail {
  anchor: HTMLElement;
  surface?: string;
}

/** What the menu asks the section tabs to do. Every change goes through them. */
export interface SectionMenuActions {
  /** The surface as it is right now. */
  snapshot: () => SectionSnapshot;
  pin: (path: string) => void;
  /** Hides sections and offers Undo. `kind` words the announcement. */
  hide: (paths: string[]) => void;
  showEvery: () => void;
  move: (path: string, kind: TabMoveKind) => void;
  moveGroup: (groupId: string, move: GroupMove) => boolean;
  removeFromGroup: (path: string) => void;
  announce: (message: string) => void;
}

interface Row {
  id: string;
  label: string;
  icon: string;
  enabled: boolean;
  destructive?: boolean;
  separatorBefore?: boolean;
  note?: string;
  run: () => void;
}

type Target =
  | { kind: "tab"; tabId: string; anchor: HTMLElement }
  | { kind: "group"; groupId: string; anchor: HTMLElement }
  | { kind: "strip"; anchor: HTMLElement };

const BASE = "ui.components.section_tabs.";
const MENU = "ui.page_tabs.menu.";

/** The shared entries whose words say close; a section is hidden instead. */
const HIDE_KEYS: Partial<Record<TabMenuEntryId, string>> = {
  close: "hide_tab",
  close_others: "hide_others",
  close_to_start: "hide_to_start",
  close_to_end: "hide_to_end",
  close_containing: "hide_containing",
  close_not_containing: "hide_not_containing",
};

/**
 * @element ha-section-tab-menu
 *
 * @summary
 * The menu of the section tabs of a settings surface. It listens on the window
 * for the same events as the menu of the wide tab strip, `tab-context-menu`
 * (right-click, the menu key, Shift+F10 or a long press on a section tab),
 * `tab-group-context-menu` (a group header) and `strip-context-menu` (empty
 * space), and answers only for its own `surface`. The entries are the shared
 * list of the wide strip's menu (`tabMenuEntries`), with the words for hiding
 * where the wide strip says close. Pin, hide, move and the groups go through
 * the section tabs; looks, locks and groups use the shared stores, editors and
 * prompts under the surface name. Shift with a right-click opens the tab
 * appearance editor directly.
 *
 * This element exists because the wide strip's own menu and group menu read and
 * write the wide strip's saved lists, which a settings surface does not have.
 * Everything else is shared: the entry list, the placement, the group picker
 * and editor, the appearance editor, the lock wizard and prompt.
 */
@customElement("ha-section-tab-menu")
export class HaSectionTabMenu extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  /** The strip name of the surface, from `sectionSurface`. */
  @property() public surface = "";

  @property({ attribute: false }) public actions?: SectionMenuActions;

  @state() private _target?: Target;

  @state() private _rows: Row[] = [];

  @state() private _heading = "";

  @state() private _placement?: Placement;

  @state() private _active = 0;

  @query("#menu") private _menu?: HTMLElement;

  @query("ha-section-hide-dialog") private _hideDialog?: HaSectionHideDialog;

  @query("ha-tab-appearance-editor")
  private _editor?: HaTabAppearanceEditor;

  private _lang = new LanguageModeController(this);

  private _t = (key: string, values?: Record<string, string | number>) =>
    this._lang.text(this.hass!.localize, key, values);

  private _keepFocus = false;

  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener("tab-context-menu", this._onTab);
    window.addEventListener("tab-group-context-menu", this._onGroup);
    window.addEventListener("strip-context-menu", this._onStrip);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener("tab-context-menu", this._onTab);
    window.removeEventListener("tab-group-context-menu", this._onGroup);
    window.removeEventListener("strip-context-menu", this._onStrip);
    window.removeEventListener("resize", this._place);
  }

  private _mine(surface?: string): boolean {
    return Boolean(this.hass && this.actions) && surface === this.surface;
  }

  private _onTab = (ev: Event) => {
    const detail = (ev as CustomEvent<TabMenuDetail>).detail;
    if (detail && this._mine(detail.surface)) {
      void this._openTab(detail);
    }
  };

  private _onGroup = (ev: Event) => {
    const detail = (ev as CustomEvent<GroupMenuDetail>).detail;
    if (detail && this._mine(detail.surface)) {
      void this._openGroup(detail);
    }
  };

  private _onStrip = (ev: Event) => {
    const detail = (ev as CustomEvent<StripMenuDetail>).detail;
    if (detail && this._mine(detail.surface)) {
      void this._openStrip(detail);
    }
  };

  // ---- Building the entries ----

  private _planInput(): () => SectionPlanInput {
    return () => {
      const fresh = this.actions!.snapshot();
      const look = fresh.appearance[fresh.surface] ?? {};
      const labels: Record<string, string> = {};
      fresh.paths.forEach((path) => {
        labels[path] = look[path]?.label || fresh.labels[path] || path;
      });
      return { ...fresh, labels };
    };
  }

  private async _openTab(detail: TabMenuDetail) {
    const snap = this.actions!.snapshot();
    const menu = sectionMenuState(snap);
    if (!menu.ordered.includes(detail.tabId)) {
      return;
    }
    if (detail.shift) {
      this._closeMenu(false);
      this._editAppearance(menu, detail.tabId, detail.anchor);
      return;
    }
    const lock = menu.locks[detail.tabId];
    const active = snap.activePath === detail.tabId;
    const entries = tabMenuEntries({
      tabId: detail.tabId,
      openIds: menu.open,
      pinnedIds: menu.pinned,
      locked: Boolean(lock?.locked),
      lockedByGroup: lock?.byGroup,
      grouped: menu.groups.some((group) =>
        group.members.includes(detail.tabId)
      ),
      hasClosed: menu.closed.length > 0,
      customised: Boolean(
        menu.appearance[this.surface]?.[detail.tabId] &&
        Object.keys(menu.appearance[this.surface][detail.tabId]).length
      ),
      dock: "top",
      rtl: document.dir === "rtl",
      moves: sectionMovesAvailable({ ...snap, tabId: detail.tabId }),
    });
    const input = this._planInput();
    this._rows = entries.map((entry) => ({
      id: entry.id,
      label: this._t(
        HIDE_KEYS[entry.id] ? `${BASE}${HIDE_KEYS[entry.id]}` : entry.labelKey
      ),
      icon: entry.icon,
      // The open section stays in the row, so it cannot be hidden.
      enabled: entry.enabled && !(entry.id === "close" && active),
      destructive: entry.destructive,
      separatorBefore: entry.separatorBefore,
      run: () =>
        this._runTab(entry.id, menu, detail.tabId, detail.anchor, input),
    }));
    this._heading = this._t(`${MENU}tab_menu`, {
      name: menu.labels[detail.tabId] ?? detail.tabId,
    });
    await this._show({
      kind: "tab",
      tabId: detail.tabId,
      anchor: detail.anchor,
    });
  }

  private _runTab(
    id: TabMenuEntryId,
    menu: TabMenuState,
    tabId: string,
    anchor: HTMLElement,
    input: () => SectionPlanInput
  ) {
    const actions = this.actions!;
    const hideKinds: Partial<Record<TabMenuEntryId, SectionHideKind>> = {
      close_others: "others",
      close_to_start: "to_start",
      close_to_end: "to_end",
      close_containing: "containing",
      close_not_containing: "not_containing",
    };
    const opensSurface =
      id in hideKinds ||
      [
        "edit_appearance",
        "lock",
        "unlock",
        "move_into_group",
        "new_group",
      ].includes(id);
    this._closeMenu(!opensSurface);
    const hideKind = hideKinds[id];
    if (hideKind) {
      this._openHide(hideKind, anchor, input, tabId);
      return;
    }
    switch (id) {
      case "pin":
      case "unpin":
        actions.pin(tabId);
        break;
      case "close":
        actions.hide([tabId]);
        break;
      case "open_every":
        actions.showEvery();
        break;
      case "move_into_group":
        this._askPicker([tabId], anchor, false);
        break;
      case "new_group":
        this._askPicker([tabId], anchor, true);
        break;
      case "remove_from_group":
        actions.removeFromGroup(tabId);
        break;
      case "move_earlier":
      case "move_later":
      case "move_start":
      case "move_end":
        actions.move(tabId, id.slice(5) as TabMoveKind);
        break;
      case "edit_appearance":
        this._editAppearance(menu, tabId, anchor);
        break;
      case "reset_appearance":
        writeTabAppearance(resetTab(readTabAppearance(), this.surface, tabId));
        actions.announce(
          this._t(`${MENU}appearance_reset`, {
            name: menu.labels[tabId] ?? tabId,
          })
        );
        break;
      case "lock":
        void this._lock(
          tabLockKey(this.surface, tabId),
          this._t(`${MENU}lock_label`, { name: menu.labels[tabId] ?? tabId }),
          menu.labels[tabId] ?? tabId,
          anchor
        );
        break;
      case "unlock":
        this._unlock(unlockKeyFor(menu, tabId), anchor, false);
        break;
      default:
    }
  }

  private async _openStrip(detail: StripMenuDetail) {
    const snap = this.actions!.snapshot();
    const menu = sectionMenuState(snap);
    const input = this._planInput();
    const anchor = detail.anchor;
    const hasOpen = menu.open.length > 0;
    const rows: Row[] = [
      {
        id: "new_group",
        label: this._t(`${MENU}new_group`),
        icon: mdiFolderPlus,
        enabled: true,
        run: () => {
          this._closeMenu(false);
          this._askPicker([], anchor, true);
        },
      },
    ];
    if (menu.closed.length) {
      rows.push({
        id: "open_every",
        label: this._t(`${MENU}open_every_tab`),
        icon: mdiTabPlus,
        enabled: true,
        run: () => {
          this._closeMenu(true);
          this.actions!.showEvery();
        },
      });
    }
    rows.push(
      {
        id: "hide_containing",
        label: this._t(`${BASE}hide_containing`),
        icon: mdiTextSearch,
        enabled: hasOpen,
        destructive: true,
        separatorBefore: true,
        run: () => {
          this._closeMenu(false);
          this._openHide("containing", anchor, input);
        },
      },
      {
        id: "hide_not_containing",
        label: this._t(`${BASE}hide_not_containing`),
        icon: mdiCloseBoxMultiple,
        enabled: hasOpen,
        destructive: true,
        run: () => {
          this._closeMenu(false);
          this._openHide("not_containing", anchor, input);
        },
      }
    );
    this._rows = rows;
    this._heading = this._t(`${MENU}strip_menu`);
    await this._show({ kind: "strip", anchor });
  }

  private async _openGroup(detail: GroupMenuDetail) {
    const snap = this.actions!.snapshot();
    const group = snap.groups.find((item) => item.id === detail.groupId);
    if (!group) {
      return;
    }
    if (detail.shift) {
      this._closeMenu(false);
      this._editGroup(group.id, detail.anchor, "appearance");
      return;
    }
    const anchor = detail.anchor;
    const key = groupLockKey(this.surface, group.id);
    const locked = readLocks().locked.includes(key);
    const unlocked = locked && isUnlocked(key);
    const lockedNow = locked && !unlocked;
    const note = this._t("ui.page_tabs.groups.locked_note");
    const name = group.name || this._t("ui.page_tabs.groups.unnamed");
    const move = (how: GroupMove) => () => {
      this._closeMenu(true);
      const moved = this.actions!.moveGroup(group.id, how);
      this.actions!.announce(
        moved
          ? this._t("ui.page_tabs.groups.moved", { name })
          : this._t("ui.page_tabs.groups.cannot_move", { name })
      );
    };
    const G = "ui.page_tabs.groups.";
    const rows: Row[] = [
      {
        id: "rename",
        label: this._t(`${G}rename`),
        icon: mdiRenameBox,
        enabled: true,
        run: () => {
          this._closeMenu(false);
          this._editGroup(group.id, anchor, "name");
        },
      },
      {
        id: "appearance",
        label: this._t(`${G}edit_appearance`),
        icon: mdiPalette,
        enabled: true,
        run: () => {
          this._closeMenu(false);
          this._editGroup(group.id, anchor, "appearance");
        },
      },
      {
        id: "collapse",
        label: this._t(group.collapsed ? `${G}expand` : `${G}collapse`),
        icon: group.collapsed ? mdiChevronDown : mdiChevronUp,
        enabled: true,
        run: () => {
          this._closeMenu(true);
          writeGroups(
            this.surface,
            setGroupCollapsed(
              readGroups(this.surface),
              group.id,
              !group.collapsed
            )
          );
        },
      },
      {
        id: "move_left",
        label: this._t(`${G}move_left`),
        icon: mdiChevronLeft,
        enabled: true,
        separatorBefore: true,
        run: move("left"),
      },
      {
        id: "move_right",
        label: this._t(`${G}move_right`),
        icon: mdiChevronRight,
        enabled: true,
        run: move("right"),
      },
      {
        id: "move_start",
        label: this._t(`${G}move_start`),
        icon: mdiArrowCollapseLeft,
        enabled: true,
        run: move("start"),
      },
      {
        id: "move_end",
        label: this._t(`${G}move_end`),
        icon: mdiArrowCollapseRight,
        enabled: true,
        run: move("end"),
      },
      {
        id: "ungroup",
        label: this._t(`${G}ungroup`),
        icon: mdiUngroup,
        enabled: !lockedNow,
        note: lockedNow ? note : this._t(`${G}ungroup_note`),
        separatorBefore: true,
        run: () => this._removeGroup(group, "ungrouped"),
      },
      {
        id: "hide_tabs",
        label: this._t(`${BASE}hide_group_tabs`),
        icon: mdiEyeOff,
        enabled: !lockedNow,
        destructive: true,
        note: lockedNow ? note : undefined,
        run: () => {
          this._closeMenu(false);
          this._openHide("group", anchor, this._planInput(), undefined, {
            groupId: group.id,
          });
        },
      },
      locked && !unlocked
        ? {
            id: "unlock",
            label: this._t(`${G}unlock`),
            icon: mdiLockOpenVariantOutline,
            enabled: true,
            run: () => this._unlock(key, anchor, true),
          }
        : unlocked
          ? {
              id: "lock_again",
              label: this._t(`${G}lock_again`),
              icon: mdiLock,
              enabled: true,
              run: () => {
                this._closeMenu(true);
                lockAgain(key);
              },
            }
          : {
              id: "lock",
              label: this._t(`${G}lock`),
              icon: mdiLock,
              enabled: true,
              run: () => {
                this._closeMenu(false);
                void this._lock(key, name, name, anchor, true);
              },
            },
      {
        id: "remove",
        label: this._t(`${G}remove`),
        icon: mdiFolderRemoveOutline,
        enabled: !lockedNow,
        destructive: true,
        note: lockedNow ? note : this._t(`${G}remove_note`),
        separatorBefore: true,
        run: () => this._removeGroup(group, "removed"),
      },
    ];
    this._rows = rows;
    this._heading = this._t(`${G}menu_label`, { name });
    await this._show({ kind: "group", groupId: group.id, anchor });
  }

  private _removeGroup(group: TabGroup, what: "ungrouped" | "removed") {
    this._closeMenu(true);
    // The shared helper also takes the group's look and lock with it.
    void import("../tabs/tab-group-actions").then(
      ({ removeGroupKeepingTabs }) => {
        removeGroupKeepingTabs(this.surface, group.id);
        this.actions?.announce(
          this._t(`ui.page_tabs.groups.${what}`, {
            name: group.name || this._t("ui.page_tabs.groups.unnamed"),
          })
        );
      }
    );
  }

  // ---- The surfaces the entries open ----

  private _askPicker(tabIds: string[], anchor: HTMLElement, create: boolean) {
    this.dispatchEvent(
      new CustomEvent("tab-group-picker-open", {
        detail: {
          tabIds,
          anchor,
          surface: this.surface,
          ...(create ? { create: true } : {}),
        },
        bubbles: true,
        composed: true,
      })
    );
  }

  private _editGroup(
    groupId: string,
    anchor: HTMLElement,
    focus: "name" | "appearance"
  ) {
    window.dispatchEvent(
      new CustomEvent("tab-group-editor-open", {
        detail: { groupId, anchor, surface: this.surface, focus },
      })
    );
  }

  private _editAppearance(
    menu: TabMenuState,
    tabId: string,
    anchor: HTMLElement
  ) {
    void this._editor?.show({
      surface: this.surface,
      tabId,
      label: menu.labels[tabId] ?? tabId,
      anchor,
      dock: "top",
    });
  }

  /** Opens the review step of hiding; also used by the More list. */
  public openHide(
    kind: SectionHideKind,
    anchor: HTMLElement,
    targetId?: string
  ) {
    if (!this.actions) {
      return;
    }
    this._openHide(kind, anchor, this._planInput(), targetId);
  }

  private _openHide(
    kind: SectionHideKind,
    anchor: HTMLElement,
    input: () => SectionPlanInput,
    targetId?: string,
    extra: { groupId?: string } = {}
  ) {
    void this._hideDialog?.show({
      kind,
      anchor,
      input,
      targetId,
      groupId: extra.groupId,
      onConfirm: (ids) => this.actions?.hide(ids),
    });
  }

  private async _lock(
    key: string,
    label: string,
    name: string,
    anchor: HTMLElement,
    group = false
  ) {
    if (!this.hass) {
      return;
    }
    setLockLocalize(this.hass.localize);
    const { openLockWizard } = await import("../locks/ha-lock-wizard");
    openLockWizard({
      key,
      label,
      anchor,
      onStartDefault: false,
      onCreated: () =>
        this.actions?.announce(
          this._t(group ? "ui.page_tabs.groups.locked" : `${MENU}locked`, {
            name,
          })
        ),
    });
  }

  // The prompt asks for the lock's own credentials; none is read here. For a
  // group the lock is taken away on success, as the wide strip does.
  private _unlock(
    key: string | undefined,
    anchor: HTMLElement,
    group: boolean
  ) {
    if (!key || !this.hass) {
      return;
    }
    this._closeMenu(false);
    setLockLocalize(this.hass.localize);
    void import("../locks/ha-lock-prompt").then(({ openLockPrompt }) =>
      openLockPrompt(key, anchor, {
        returnTo: anchor,
        ...(group
          ? {
              grant: false,
              onSuccess: () => writeLocks(withLock(readLocks(), key, false)),
            }
          : {}),
      })
    );
  }

  // ---- Showing the menu ----

  private async _show(target: Target) {
    this._hideDialog?.close(false);
    this._editor?.close(false);
    this._target = target;
    this._placement = undefined;
    this._active = this._rows.findIndex((row) => row.enabled);
    await this.updateComplete;
    if (this._menu && !popoverOpen(this._menu)) {
      showPopover(this._menu);
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
      "top",
      document.dir === "rtl"
    );
  };

  private _closeMenu(returnFocus = true) {
    this._keepFocus = !returnFocus;
    if (popoverOpen(this._menu)) {
      hidePopover(this._menu);
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
      this._menu?.querySelectorAll<HTMLElement>("[data-row]") ?? []
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
    const count = this._rows.length;
    for (let i = 1; i <= count; i++) {
      const next = (from + delta * i + count * i) % count;
      if (this._rows[next].enabled) {
        return next;
      }
    }
    return from;
  }

  private _keydown(ev: KeyboardEvent) {
    if (!this._rows.length) {
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
        this._focusItem(this._step(this._rows.length, -1));
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
    }
  }

  private _clicked(ev: Event) {
    const index = Number((ev.currentTarget as HTMLElement).dataset.row ?? "-1");
    const row = this._rows[index];
    if (row?.enabled) {
      row.run();
    }
  }

  // ---- Rendering ----

  protected render(): TemplateResult {
    const placement = this._placement;
    const ready = Boolean(this.hass && this._target);
    return html`
      <div
        id="menu"
        popover="auto"
        role="menu"
        tabindex="-1"
        aria-label=${this._heading}
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
        @keydown=${this._keydown}
        @toggle=${this._toggled}
      >
        ${
          ready
            ? html`
                ${placement?.sheet ? html`<p class="sheet-title">${this._heading}</p>` : nothing}
                ${this._rows.map((row, index) => this._renderRow(row, index))}
              `
            : nothing
        }
      </div>
      ${
        this.hass
          ? html`
              <ha-section-hide-dialog
                .hass=${this.hass}
              ></ha-section-hide-dialog>
              <ha-tab-appearance-editor
                .hass=${this.hass}
              ></ha-tab-appearance-editor>
              <ha-tab-group-picker
                .hass=${this.hass}
                .surface=${this.surface}
              ></ha-tab-group-picker>
              <ha-tab-group-editor
                .hass=${this.hass}
                .surface=${this.surface}
              ></ha-tab-group-editor>
            `
          : nothing
      }
    `;
  }

  private _renderRow(row: Row, index: number): TemplateResult {
    return html`
      ${row.separatorBefore ? html`<div class="separator" role="separator"></div>` : nothing}
      <button
        role="menuitem"
        aria-disabled=${row.enabled ? nothing : "true"}
        tabindex=${index === this._active ? "0" : "-1"}
        class=${row.destructive ? "destructive" : ""}
        data-row=${index}
        @click=${this._clicked}
      >
        <ha-svg-icon .path=${row.icon}></ha-svg-icon>
        <span class="label"
          >${row.label}${
            row.note ? html`<span class="note">${row.note}</span>` : nothing
          }</span
        >
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
        width: min(300px, calc(100vw - 16px));
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
      [role="menuitem"] {
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
        [role="menuitem"] {
          min-height: 44px;
        }
      }
      [role="menuitem"] .label {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .note {
        display: block;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      [role="menuitem"]:hover,
      [role="menuitem"]:focus-visible {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }
      [role="menuitem"]:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      [role="menuitem"][aria-disabled="true"] {
        opacity: 0.45;
        cursor: default;
      }
      .destructive ha-svg-icon {
        color: var(--error-color);
      }
      .separator {
        height: 1px;
        margin: var(--ha-space-1) var(--ha-space-2);
        background: var(--divider-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-section-tab-menu": HaSectionTabMenu;
  }
}
