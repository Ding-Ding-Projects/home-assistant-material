import {
  mdiChevronDown,
  mdiChevronRight,
  mdiClose,
  mdiLock,
  mdiPin,
  mdiPinOff,
  mdiTab,
} from "@mdi/js";
import type { ReactiveController } from "lit";
import { css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { navigate } from "../../common/navigate";
import {
  isUnlocked,
  subscribeUnlocks,
} from "../../common/locks/element-lock-session";
import { closeTab } from "../../common/tabs/tab-seen";
import {
  neighbourTab,
  parseDestinationId,
  tabRoute,
} from "../../common/tabs/tab-destinations";
import {
  groupOf,
  toggleGroupCollapsed,
  ungroupTabs,
} from "../../common/tabs/tab-groups";
import type { StripSegment, TabGroup } from "../../common/tabs/tab-groups";
import { isVerticalDock } from "../../common/tabs/tab-dock";
import { pinTab, unpinTab } from "../../common/tabs/tab-pins";
import { isMoveAcrossBlocked } from "../tab-order";
import "../ha-icon";
import "../ha-svg-icon";
import { TabOverflowController } from "./ha-tab-overflow";
import type { OverflowEntry } from "./ha-tab-overflow";
import {
  groupAppearanceFor,
  groupChipStyle,
  groupColourCss,
} from "./tab-group-appearance-store";
import { registerTabSearchSurface } from "./tab-group-state";
import { renderTabIcon } from "./tab-icons";
import {
  effectiveCollapsed,
  subscribeReveals,
  visibleMembers,
} from "./tab-search-reveal";
import type { CompactState, Orientation } from "./tab-strip-layout";
import {
  hiddenByRange,
  moveKeyIntent,
  navIntent,
  navTarget,
  nextCompact,
  pendingLockKey,
  tabStyle,
} from "./tab-strip-layout";
import type { StripChange } from "./tab-strip-moves";
import {
  applyChange,
  flattenSegments,
  groupStepTarget,
  joinGroup,
  leaveGroup,
  moveGroupNear,
  moveTabNear,
  moveTabToEnd,
  planKeyboardMove,
  segmentKeyOfTab,
} from "./tab-strip-moves";
import type { PageTab, TabModuleContext } from "./tab-types";
import type { StripSnapshot } from "../../common/tabs/tab-search";

/** How long a finger rests on a tab before it counts as a long press. */
export const LONG_PRESS_MS = 600;

/** How far a finger may drift before it is a scroll or a drag, not a long press. */
const LONG_PRESS_SLOP = 10;

interface DragSource {
  kind: "tab" | "group";
  id: string;
}

interface DropMark {
  kind: "tab" | "segment" | "into" | "end";
  id: string;
  after: boolean;
}

interface AriaReflection {
  ariaControlsElements?: Element[] | null;
  ariaLabelledByElements?: Element[] | null;
}

const isElement = (node: EventTarget): node is HTMLElement =>
  node instanceof HTMLElement;

/**
 * The strip of open tabs, on any edge: the pinned region first, then loose
 * tabs and groups in order. It draws the tab list, the tabs, the group
 * headers, the lock marks, the per-tab look and the live announcements, and
 * it handles arrow-key focus, drag and keyboard moves (also into and out of a
 * group), pinning, closing one tab, and the overflow button.
 *
 * Roles: the strip is one `tablist` that directly holds the tabs. Each tab and
 * each group sits in a presentational wrapper so a tab's pin and close
 * buttons stay plain buttons beside it. A group header is a toggle button with
 * `aria-expanded`. The selected tab points at the page panel, and the page
 * panel is named by the selected tab, through the element references of ARIA
 * (an id cannot cross a shadow root).
 *
 * Menus: a right-click, the menu key, Shift+F10 or a long press (600 ms) on a
 * tab, a group header or the empty strip dispatches `tab-context-menu`,
 * `tab-group-context-menu` or `strip-context-menu` from the shell element;
 * the elements that show the menus listen for them. Shift with a right-click
 * says `shift: true` so a menu can open the appearance editor at once.
 *
 * This module renders into the shell's shadow root, because the New tab
 * button and its popover must share a root with the rest of the bar.
 */
export class TabStripController implements ReactiveController {
  private _dragging?: DragSource;

  private _dropMark?: DropMark;

  /** Spoken after a tab moves, is pinned or changes group. */
  private _announcement = "";

  private _hiddenEnds = { start: false, end: false };

  /** Tabs that are not fully in view along the strip. */
  private _outOfView: string[] = [];

  private _compact: CompactState = { compact: false, at: 0 };

  private _observer?: ResizeObserver;

  private _revealedKey?: string;

  private _segments: StripSegment[] = [];

  private _open: PageTab[] = [];

  /** A tab or group header that gets focus after the next update. */
  private _refocus?: string;

  private _press?: {
    timer: number;
    x: number;
    y: number;
    kind: "tab" | "group";
    id: string;
    anchor: HTMLElement;
  };

  private _suppressClickUntil = 0;

  private _lastMenu = { key: "", at: 0 };

  private _unsubUnlocks?: () => void;

  private _unsubReveals?: () => void;

  private _unregisterSearch?: () => void;

  private _overflow: TabOverflowController;

  constructor(private readonly _ctx: TabModuleContext) {
    this._overflow = new TabOverflowController(_ctx, (id) => this.show(id));
    _ctx.host.addController(this);
  }

  private get _strip(): HTMLElement | undefined {
    return (
      this._ctx.host.renderRoot?.querySelector<HTMLElement>(".strip") ??
      undefined
    );
  }

  private get _vertical(): boolean {
    return isVerticalDock(this._ctx.store.dock);
  }

  private get _orientation(): Orientation {
    return this._vertical ? "vertical" : "horizontal";
  }

  private get _rtl(): boolean {
    return getComputedStyle(this._ctx.host).direction === "rtl";
  }

  public hostConnected() {
    this._unsubUnlocks ??= subscribeUnlocks(() =>
      this._ctx.host.requestUpdate()
    );
    // A search result inside a collapsed group is shown for this visit only.
    this._unsubReveals ??= subscribeReveals(() =>
      this._ctx.host.requestUpdate()
    );
    // The master search lists this strip's tabs with their visible labels.
    this._unregisterSearch ??= registerTabSearchSurface(
      this._ctx.store.surface,
      this._searchSnapshot
    );
  }

  private _searchSnapshot = (): StripSnapshot => {
    const { store, host } = this._ctx;
    if (!host.hass?.panels) {
      return { surface: store.surface, tabs: [], pinned: [], groups: [] };
    }
    const closed = new Set(store.closed);
    const look = store.appearance[store.surface] ?? {};
    return {
      surface: store.surface,
      tabs: store.orderedTabs().map((tab) => ({
        id: tab.urlPath,
        label: look[tab.urlPath]?.label || tab.title,
        open: !closed.has(tab.urlPath),
      })),
      pinned: store.pinned,
      groups: store.groups,
    };
  };

  public hostUpdated() {
    const strip = this._strip;
    if (strip && !this._observer) {
      this._observer = new ResizeObserver(() => {
        // A strip that shrank (a short window, a larger text size) can push the
        // selected tab out of view: bring it back, as the key rule below only
        // does for a new page.
        this._revealedKey = undefined;
        this._revealSelectedTab();
        this._measure();
      });
      this._observer.observe(strip);
    }
    this._revealSelectedTab();
    this._measure();
    this._wireAria();
    if (this._refocus) {
      const target = this._navItems().find(
        (item) => item.dataset.focusKey === this._refocus
      );
      this._refocus = undefined;
      target?.focus();
    }
  }

  public hostDisconnected() {
    this._observer?.disconnect();
    this._observer = undefined;
    this._unsubUnlocks?.();
    this._unsubUnlocks = undefined;
    this._unsubReveals?.();
    this._unsubReveals = undefined;
    this._unregisterSearch?.();
    this._unregisterSearch = undefined;
    this._cancelPress();
    window.clearTimeout(this._revealCheck);
  }

  private _navItems(): HTMLElement[] {
    return Array.from(
      this._ctx.host.renderRoot?.querySelectorAll<HTMLElement>("[data-nav]") ??
        []
    );
  }

  private _groupName(group: TabGroup): string {
    return group.name || this._ctx.t("ui.page_tabs.groups_strip.unnamed");
  }

  public render(open: PageTab[], current: string | undefined) {
    const { t, store } = this._ctx;
    this._open = open;
    const ids = open.map((tab) => tab.urlPath);
    const segments = store.layout(ids);
    this._segments = segments;
    const byId = new Map(open.map((tab) => [tab.urlPath, tab]));
    const orientation = this._orientation;
    const focusId = ids.includes(current ?? "") ? current : ids[0];
    const hasPinned = segments.some((segment) => segment.kind === "pinned");

    const entries: OverflowEntry[] = [];
    const renderTab = (tab: PageTab, group?: TabGroup, pinned = false) =>
      this._renderTab(tab, {
        current,
        focusId,
        group,
        pinned,
        compact: pinned && this._compact.compact,
      });

    const body = segments.map((segment) => {
      if (segment.kind === "pinned") {
        return html`<div
          class=${classMap({
            "pinned-region": true,
            compact: this._compact.compact,
          })}
          role="presentation"
        >
          ${segment.ids.map((id) => renderTab(byId.get(id)!, undefined, true))}
        </div>`;
      }
      if (segment.kind === "tab") {
        return renderTab(byId.get(segment.id)!);
      }
      const group = segment.group;
      // A collapsed group still draws the page in use, and any tab a search
      // revealed for this visit; the saved collapsed flag is not changed.
      const revealed = new Set(visibleMembers(store.surface, group));
      const shown = group.collapsed
        ? segment.ids.filter((id) => id === current || revealed.has(id))
        : segment.ids;
      if (group.collapsed) {
        segment.ids
          .filter((id) => !shown.includes(id))
          .forEach((id) => {
            const tab = byId.get(id)!;
            entries.push(this._entry(tab, group, true, current));
          });
      }
      return this._renderGroup(group, segment.ids.length, shown, (id) =>
        renderTab(byId.get(id)!, group)
      );
    });

    this._outOfView.forEach((id) => {
      const tab = byId.get(id);
      if (tab && !entries.some((entry) => entry.tab.urlPath === id)) {
        const group = groupOf(store.groups, id);
        entries.push(this._entry(tab, group, false, current));
      }
    });

    return html`
      <div class="strip-area">
        <div
          class=${classMap({
            strip: true,
            "has-pinned": hasPinned,
            "more-start": this._hiddenEnds.start && !hasPinned,
            "more-end": this._hiddenEnds.end,
            "drop-end": this._dropMark?.kind === "end",
          })}
          role="tablist"
          aria-orientation=${orientation}
          aria-label=${t("ui.page_tabs.open_pages")}
          @keydown=${this._handleKeydown}
          @scroll=${this._measure}
          @click=${this._handleClick}
          @contextmenu=${this._handleContextMenu}
          @pointerdown=${this._pressStart}
          @pointermove=${this._pressMove}
          @pointerup=${this._cancelPress}
          @pointercancel=${this._cancelPress}
          @dragstart=${this._dragStart}
          @dragover=${this._dragOver}
          @drop=${this._drop}
          @dragend=${this._dragEnd}
        >
          ${body}
        </div>
        ${this._overflow.render(entries, store.dock)}
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">
        ${this._announcement}
      </div>
    `;
  }

  private _entry(
    tab: PageTab,
    group: TabGroup | undefined,
    collapsed: boolean,
    current: string | undefined
  ): OverflowEntry {
    const { store } = this._ctx;
    return {
      tab,
      group: group ? this._groupName(group) : undefined,
      collapsed,
      pinned: store.pinned.includes(tab.urlPath),
      locked: this._lockKey(tab.urlPath) !== undefined,
      selected: tab.urlPath === current,
    };
  }

  private _lockKey(id: string): string | undefined {
    const { store } = this._ctx;
    return pendingLockKey(store.locks, store.surface, id, store.groups, (key) =>
      isUnlocked(key)
    );
  }

  private _renderGroup(
    group: TabGroup,
    count: number,
    shown: string[],
    renderMember: (id: string) => unknown
  ) {
    const { t, store } = this._ctx;
    const name = this._groupName(group);
    const mark = this._dropMark;
    const segmentMark =
      mark?.kind === "segment" && mark.id === `group:${group.id}`
        ? mark.after
          ? "drop-after"
          : "drop-before"
        : undefined;
    const locked = store.locks.locked.includes(
      `tabgroup:${store.surface}:${group.id}`
    );
    // The look of the header: what the person changed, on top of the theme.
    // The name, the count and the collapsed state stay in text whatever the look.
    const look = groupAppearanceFor(
      store.groupAppearance,
      store.surface,
      group.id
    );
    const lookCollapsed = effectiveCollapsed(store.surface, group);
    const stateLook = lookCollapsed ? look.collapsedLook : look.expandedLook;
    const colour = look.color
      ? { "--group-colour": look.color }
      : { "--group-colour": groupColourCss(group.colour) };
    const icon = look.icon
      ? look.icon.startsWith("mdi:")
        ? html`<ha-icon class="group-icon" .icon=${look.icon}></ha-icon>`
        : html`<span class="group-icon emoji" aria-hidden="true"
            >${look.icon}</span
          >`
      : nothing;
    return html`<div
      class=${classMap({
        group: true,
        collapsed: group.collapsed,
        ...(stateLook ? { [`look-${stateLook}`]: true } : {}),
        ...(segmentMark ? { [segmentMark]: true } : {}),
      })}
      role="presentation"
      style=${styleMap(colour)}
    >
      <div
        class=${classMap({
          "group-header": true,
          "drop-into": mark?.kind === "into" && mark.id === group.id,
          dragging:
            this._dragging?.kind === "group" && this._dragging.id === group.id,
        })}
        role="presentation"
        draggable="true"
        data-kind="group"
        data-id=${group.id}
      >
        <button
          class="group-toggle"
          data-nav
          data-action="toggle"
          data-id=${group.id}
          data-focus-key=${`group:${group.id}`}
          tabindex="-1"
          style=${styleMap(groupChipStyle(look))}
          aria-expanded=${group.collapsed ? "false" : "true"}
          aria-label=${
            locked
              ? t("ui.page_tabs.groups_strip.header_label_locked", {
                  name,
                  count,
                })
              : t("ui.page_tabs.groups_strip.header_label", { name, count })
          }
          title=${
            group.collapsed
              ? t("ui.page_tabs.groups_strip.expand", { name })
              : t("ui.page_tabs.groups_strip.collapse", { name })
          }
        >
          <ha-svg-icon
            class="chevron"
            .path=${group.collapsed ? mdiChevronRight : mdiChevronDown}
          ></ha-svg-icon>
          <span class="group-dot"></span>
          ${icon}
          <span class="group-name">${name}</span>
          <span class="group-count">${count}</span>
          ${
            locked
              ? html`<ha-svg-icon
                  class="lock-mark"
                  .path=${mdiLock}
                ></ha-svg-icon>`
              : nothing
          }
        </button>
      </div>
      ${shown.map((id) => renderMember(id))}
    </div>`;
  }

  private _renderTab(
    tab: PageTab,
    state: {
      current: string | undefined;
      focusId: string | undefined;
      group?: TabGroup;
      pinned: boolean;
      compact: boolean;
    }
  ) {
    const { t, store } = this._ctx;
    const id = tab.urlPath;
    const selected = id === state.current;
    const look = store.appearance[store.surface]?.[id] ?? {};
    const label = look.label || tab.title;
    const locked = this._lockKey(id) !== undefined;
    const mark = this._dropMark;
    const tabMark =
      (mark?.kind === "tab" && mark.id === id) ||
      (mark?.kind === "segment" && mark.id === `tab:${id}`)
        ? mark.after
          ? "drop-after"
          : "drop-before"
        : undefined;
    const name = locked
      ? state.pinned
        ? t("ui.page_tabs.dock.pinned_locked_name", { name: label })
        : t("ui.page_tabs.dock.locked_name", { name: label })
      : state.pinned
        ? t("ui.page_tabs.dock.pinned_name", { name: label })
        : label;
    const icon = look.icon
      ? html`<ha-icon .icon=${look.icon}></ha-icon>`
      : renderTabIcon(tab);
    return html`
      <div
        class=${classMap({
          tab: true,
          selected,
          pinned: state.pinned,
          locked,
          grouped: Boolean(state.group),
          dragging: this._dragging?.kind === "tab" && this._dragging.id === id,
          ...(tabMark ? { [tabMark]: true } : {}),
        })}
        style=${styleMap(tabStyle(look))}
        role="presentation"
        draggable="true"
        data-kind="tab"
        data-id=${id}
      >
        <button
          class="tab-button"
          role="tab"
          data-nav
          data-action="open"
          data-id=${id}
          data-focus-key=${`tab:${id}`}
          aria-selected=${selected ? "true" : "false"}
          aria-label=${state.pinned || locked ? name : nothing}
          title=${name}
          aria-keyshortcuts="Control+Shift+ArrowLeft Control+Shift+ArrowRight Alt+Shift+ArrowLeft Alt+Shift+ArrowRight Control+Shift+ArrowUp Control+Shift+ArrowDown"
          tabindex=${id === state.focusId ? "0" : "-1"}
        >
          ${
            locked
              ? html`<ha-svg-icon
                  class="lock-mark"
                  .path=${mdiLock}
                ></ha-svg-icon>`
              : nothing
          }
          ${
            state.pinned
              ? html`<ha-svg-icon
                  class="pin-mark"
                  .path=${mdiPin}
                ></ha-svg-icon>`
              : nothing
          }
          <span class="tab-icon"
            >${
              icon === nothing
                ? html`<ha-svg-icon .path=${mdiTab}></ha-svg-icon>`
                : icon
            }</span
          >
          <span class="label">${label}</span>
        </button>
        <button
          class="pin"
          data-action="pin"
          data-id=${id}
          aria-label=${t(
            state.pinned ? "ui.page_tabs.unpin_tab" : "ui.page_tabs.pin_tab",
            { name: label }
          )}
          aria-pressed=${state.pinned ? "true" : "false"}
        >
          <ha-svg-icon .path=${state.pinned ? mdiPinOff : mdiPin}></ha-svg-icon>
        </button>
        ${
          state.pinned
            ? nothing
            : html`<button
                class="close"
                data-action="close"
                data-id=${id}
                aria-label=${t("ui.page_tabs.close_tab", { name: label })}
              >
                <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
              </button>`
        }
      </div>
    `;
  }

  private _announce(message: string) {
    this._announcement = message;
    this._ctx.host.requestUpdate();
  }

  private _tabById(id: string): PageTab | undefined {
    return this._open.find((tab) => tab.urlPath === id);
  }

  private _tabButton(id: string): HTMLElement | undefined {
    return this._navItems().find(
      (item) => item.dataset.focusKey === `tab:${id}`
    );
  }

  // Scrolls the selected tab clear of the fade and of the pinned region. It
  // only runs when the selected page, the open tabs or the edge change, so a
  // person who scrolls the strip by hand is not pulled back on every update.
  private _revealSelectedTab() {
    const strip = this._strip;
    if (!strip) {
      return;
    }
    const selected = strip.querySelector<HTMLElement>(".tab.selected");
    const key = `${this._ctx.store.currentTabId()}|${this._open.length}|${this._ctx.store.dock}`;
    if (!selected || key === this._revealedKey) {
      return;
    }
    this._revealedKey = key;
    this._scrollInto(selected);
    this._checkReveal();
  }

  private _revealCheck?: number;

  // The tabs change width while the page opens (the selected tab shows its pin
  // and close buttons, a label font arrives), which can leave a smooth scroll
  // short of its target and the selected tab half under the fade. Once things
  // have settled, a selected tab that is still not fully in view is brought in.
  private _checkReveal() {
    window.clearTimeout(this._revealCheck);
    this._revealCheck = window.setTimeout(() => {
      const strip = this._strip;
      const selected = strip?.querySelector<HTMLElement>(".tab.selected");
      if (!strip || !selected) {
        return;
      }
      const area = strip.getBoundingClientRect();
      const tab = selected.getBoundingClientRect();
      const outside =
        this._orientation === "vertical"
          ? tab.top < area.top - 1 || tab.bottom > area.bottom + 1
          : tab.left < area.left - 1 || tab.right > area.right + 1;
      if (outside) {
        selected.scrollIntoView({
          inline: "nearest",
          block: "nearest",
          behavior: "instant",
        });
      }
    }, 500);
  }

  private _scrollInto(element: HTMLElement) {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    element.scrollIntoView({
      inline: "nearest",
      block: "nearest",
      behavior: reduceMotion ? "instant" : "smooth",
    });
  }

  /** Brings a tab into view, then opens it. Used by the overflow list. */
  public show(id: string) {
    const wrapper = this._strip?.querySelector<HTMLElement>(
      `.tab[data-id="${CSS.escape(id)}"]`
    );
    if (wrapper) {
      this._scrollInto(wrapper);
    }
    this.activate(id);
    this._refocus = `tab:${id}`;
  }

  // Measures the strip along its own axis: the fade at the ends, whether the
  // pinned region turns compact, and which tabs are not fully in view.
  private _measure = () => {
    const strip = this._strip;
    if (!strip) {
      return;
    }
    const vertical = this._vertical;
    const size = vertical ? strip.clientHeight : strip.clientWidth;
    const total = vertical ? strip.scrollHeight : strip.scrollWidth;
    // scrollLeft is negative in a right-to-left strip.
    const scrolled = Math.abs(vertical ? strip.scrollTop : strip.scrollLeft);
    const room = total - size;
    const ends = { start: scrolled > 1, end: room - scrolled > 1 };
    const compact = nextCompact(this._compact, room > 1, size);

    const pinnedRegion = strip.querySelector<HTMLElement>(".pinned-region");
    strip.style.setProperty(
      "--pinned-size",
      pinnedRegion
        ? `${vertical ? pinnedRegion.offsetHeight : pinnedRegion.offsetWidth}px`
        : "0px"
    );
    const axis = (rect: DOMRect) =>
      vertical
        ? { from: rect.top, to: rect.bottom }
        : { from: rect.left, to: rect.right };
    const view = axis(strip.getBoundingClientRect());
    let { from: lo, to: hi } = view;
    if (pinnedRegion) {
      const pinned = axis(pinnedRegion.getBoundingClientRect());
      if (vertical || !this._rtl) {
        lo = Math.max(lo, pinned.to);
      } else {
        hi = Math.min(hi, pinned.from);
      }
    }
    const hidden = hiddenByRange(
      Array.from(strip.querySelectorAll<HTMLElement>(".tab:not(.pinned)")).map(
        (element) => ({
          id: element.dataset.id!,
          ...axis(element.getBoundingClientRect()),
        })
      ),
      lo,
      hi
    );
    const changed =
      ends.start !== this._hiddenEnds.start ||
      ends.end !== this._hiddenEnds.end ||
      compact.compact !== this._compact.compact ||
      hidden.join("\n") !== this._outOfView.join("\n");
    if (changed) {
      this._hiddenEnds = ends;
      this._compact = compact;
      this._outOfView = hidden;
      this._ctx.host.requestUpdate();
    }
  };

  // Links the selected tab and the page panel to each other. An id cannot be
  // used across the two shadow roots, so the element references of ARIA are
  // set where the browser supports them; the panel keeps a plain name otherwise.
  private _wireAria() {
    const panel = this._ctx.host.panelProvider?.();
    const strip = this._strip;
    if (!panel || !strip) {
      return;
    }
    const selected = strip.querySelector<HTMLElement>(
      ".tab.selected [role='tab']"
    );
    const panelAria = panel as unknown as AriaReflection;
    if ("ariaLabelledByElements" in panel) {
      panelAria.ariaLabelledByElements = selected ? [selected] : null;
    } else if (selected) {
      (panel as HTMLElement).setAttribute("aria-label", selected.title);
    }
    strip.querySelectorAll<HTMLElement>("[role='tab']").forEach((button) => {
      if ("ariaControlsElements" in button) {
        (button as unknown as AriaReflection).ariaControlsElements =
          button === selected ? [panel] : null;
      }
    });
  }

  // Opens a tab's page, unless a lock still holds it. A locked tab asks for
  // its unlock first, beside the tab, and opens the page only once it is open.
  public activate(id: string, anchor?: HTMLElement) {
    const key = this._lockKey(id);
    if (key) {
      this._askUnlock(key, id, anchor, () => this.activate(id, anchor));
      return;
    }
    navigate(tabRoute(id));
  }

  private _askUnlock(
    key: string,
    id: string,
    anchor: HTMLElement | undefined,
    onSuccess: () => void
  ) {
    const target = anchor ?? this._tabButton(id) ?? this._ctx.host;
    const name = this._tabById(id)?.title ?? id;
    void import("../locks/ha-lock-prompt").then((module) =>
      module.openLockPrompt(key, target, {
        onSuccess,
        returnTo: target,
        title: this._ctx.t("ui.page_tabs.dock.unlock_prompt", { name }),
      })
    );
  }

  private _close(id: string, anchor?: HTMLElement) {
    const { store } = this._ctx;
    if (store.pinned.includes(id)) {
      return;
    }
    const key = this._lockKey(id);
    if (key) {
      this._askUnlock(key, id, anchor, () => this._close(id, anchor));
      return;
    }
    // Closing the settings page or tool tab that is in use moves to the
    // neighbouring tab, so the person is not left on a page with no tab.
    const leaving =
      parseDestinationId(id).kind !== "page" && store.currentTabId() === id
        ? neighbourTab(flattenSegments(this._segments), id)
        : undefined;
    if (!store.closed.includes(id)) {
      store.closed = closeTab(store.closed, id);
    }
    if (leaving) {
      this.activate(leaving);
    }
  }

  private _togglePin(id: string) {
    const { store, t } = this._ctx;
    const tab = this._tabById(id);
    if (!tab) {
      return;
    }
    const pinned = store.pinned.includes(id);
    if (pinned) {
      store.pinned = unpinTab(store.pinned, id);
    } else {
      // The pinned region is its own place: a pinned tab leaves its group.
      store.groups = ungroupTabs(store.groups, [id]);
      store.pinned = pinTab(store.pinned, id);
    }
    // Saving the shown order keeps every tab where it is within its region.
    store.order = store.orderedTabs().map((item) => item.urlPath);
    this._refocus = `tab:${id}`;
    this._announce(
      t(pinned ? "ui.page_tabs.unpinned" : "ui.page_tabs.pinned", {
        name: tab.title,
      })
    );
  }

  private _toggleGroup(groupId: string) {
    const { store } = this._ctx;
    store.groups = toggleGroupCollapsed(store.groups, groupId);
    this._refocus = `group:${groupId}`;
  }

  private _commit(change: StripChange) {
    const { store, t } = this._ctx;
    const result = applyChange({
      fullOrder: store.orderedTabs().map((tab) => tab.urlPath),
      visibleBefore: flattenSegments(this._segments),
      change,
    });
    if (result.pinned) {
      store.pinned = result.pinned;
    }
    if (result.groups) {
      store.groups = result.groups;
    }
    store.order = result.order;
    const title = change.tabId
      ? (this._tabById(change.tabId)?.title ?? "")
      : "";
    const groupOfChange = change.groupId
      ? store.groups.find((group) => group.id === change.groupId)
      : undefined;
    const groupName = groupOfChange ? this._groupName(groupOfChange) : "";
    if (change.kind === "join") {
      this._announce(
        t("ui.page_tabs.groups_strip.moved_into_group", {
          name: title,
          group: groupName,
        })
      );
    } else if (change.kind === "leave") {
      this._announce(
        t("ui.page_tabs.groups_strip.moved_out_of_group", {
          name: title,
          group: groupName,
        })
      );
    } else if (change.kind === "group") {
      const groups = this._segments.filter((s) => s.kind === "group");
      const position = change.visible
        .map((id) => groupOf(store.groups, id)?.id)
        .filter((id, i, all) => id && all.indexOf(id) === i)
        .indexOf(change.groupId);
      this._announce(
        t("ui.page_tabs.groups_strip.group_moved", {
          group: groupName,
          position: position + 1,
          total: groups.length,
        })
      );
    } else {
      this._announce(
        t("ui.page_tabs.moved", {
          name: title,
          position: change.visible.indexOf(change.tabId ?? "") + 1,
          total: change.visible.length,
        })
      );
    }
    if (change.tabId) {
      this._refocus = `tab:${change.tabId}`;
    } else if (change.groupId) {
      this._refocus = `group:${change.groupId}`;
    }
  }

  private get _moveContext() {
    const { store } = this._ctx;
    return { groups: store.groups, pinned: store.pinned };
  }

  /** The element a pointer or key event came from, with its kind and id. */
  private _hit(
    ev: Event
  ): { el: HTMLElement; kind: string; id: string } | undefined {
    for (const node of ev.composedPath()) {
      if (isElement(node) && node.dataset.kind && node.dataset.id) {
        return { el: node, kind: node.dataset.kind, id: node.dataset.id };
      }
    }
    return undefined;
  }

  private _handleClick = (ev: MouseEvent) => {
    if (Date.now() < this._suppressClickUntil) {
      ev.preventDefault();
      return;
    }
    const button = ev
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          isElement(node) && node.dataset.action !== undefined
      );
    if (!button) {
      return;
    }
    const id = button.dataset.id!;
    switch (button.dataset.action) {
      case "open":
        this.activate(id, button);
        break;
      case "pin":
        this._togglePin(id);
        break;
      case "close":
        this._close(id, button);
        break;
      case "toggle":
        this._toggleGroup(id);
        break;
      default:
    }
  };

  // Menus -----------------------------------------------------------------

  private _fireMenu(
    kind: "tab" | "group" | "strip",
    id: string,
    anchor: HTMLElement,
    shift: boolean
  ) {
    const key = `${kind}:${id}`;
    const now = Date.now();
    if (this._lastMenu.key === key && now - this._lastMenu.at < 400) {
      return;
    }
    this._lastMenu = { key, at: now };
    const surface = this._ctx.store.surface;
    const [name, detail] =
      kind === "tab"
        ? ["tab-context-menu", { tabId: id, anchor, shift, surface }]
        : kind === "group"
          ? ["tab-group-context-menu", { groupId: id, anchor, shift, surface }]
          : ["strip-context-menu", { anchor, surface }];
    this._ctx.host.dispatchEvent(
      new CustomEvent(name as string, {
        detail,
        bubbles: true,
        composed: true,
      })
    );
  }

  private _anchorOf(hit: { el: HTMLElement; kind: string }): HTMLElement {
    return (
      hit.el.querySelector<HTMLElement>(
        // A group is anchored to its whole header: the toggle button is only
        // as wide as the name, and a panel placed beside it would cover the
        // rest of a side strip.
        hit.kind === "tab" ? "[role='tab']" : ".group-header"
      ) ?? hit.el
    );
  }

  private _handleContextMenu = (ev: MouseEvent) => {
    // Everything on the strip has its own menu, so the product-wide element
    // menu stays out of it.
    ev.preventDefault();
    ev.stopPropagation();
    const hit = this._hit(ev);
    if (hit && (hit.kind === "tab" || hit.kind === "group")) {
      this._fireMenu(
        hit.kind as "tab" | "group",
        hit.id,
        this._anchorOf(hit),
        ev.shiftKey
      );
      return;
    }
    const strip = this._strip;
    if (strip) {
      this._fireMenu("strip", "", strip, false);
    }
  };

  private _pressStart = (ev: PointerEvent) => {
    if (ev.pointerType !== "touch") {
      return;
    }
    const hit = this._hit(ev);
    if (!hit || (hit.kind !== "tab" && hit.kind !== "group")) {
      return;
    }
    this._cancelPress();
    const anchor = this._anchorOf(hit);
    this._press = {
      kind: hit.kind,
      id: hit.id,
      anchor,
      x: ev.clientX,
      y: ev.clientY,
      timer: window.setTimeout(() => {
        this._suppressClickUntil = Date.now() + 800;
        this._fireMenu(hit.kind as "tab" | "group", hit.id, anchor, false);
        this._press = undefined;
      }, LONG_PRESS_MS),
    };
  };

  private _pressMove = (ev: PointerEvent) => {
    const press = this._press;
    if (
      press &&
      Math.hypot(ev.clientX - press.x, ev.clientY - press.y) > LONG_PRESS_SLOP
    ) {
      this._cancelPress();
    }
  };

  private _cancelPress = () => {
    if (this._press) {
      window.clearTimeout(this._press.timer);
      this._press = undefined;
    }
  };

  // Drag ------------------------------------------------------------------

  private _dragStart = (ev: DragEvent) => {
    const hit = this._hit(ev);
    if (!hit || (hit.kind !== "tab" && hit.kind !== "group")) {
      return;
    }
    this._cancelPress();
    this._dragging = { kind: hit.kind, id: hit.id };
    if (ev.dataTransfer) {
      ev.dataTransfer.effectAllowed = "move";
      ev.dataTransfer.setData("text/plain", hit.id);
    }
    this._ctx.host.requestUpdate();
  };

  /** Whether the pointer is in the later half of an element along the axis. */
  private _isAfter(ev: DragEvent, element: HTMLElement): boolean {
    const rect = element.getBoundingClientRect();
    if (this._vertical) {
      return ev.clientY >= rect.top + rect.height / 2;
    }
    const before = ev.clientX < rect.left + rect.width / 2;
    return before === this._rtl;
  }

  private _dragOver = (ev: DragEvent) => {
    const from = this._dragging;
    if (!from) {
      return;
    }
    const { store } = this._ctx;
    const hit = this._hit(ev);
    let mark: DropMark | undefined;
    if (hit?.kind === "tab") {
      if (from.kind === "tab") {
        if (
          from.id === hit.id ||
          isMoveAcrossBlocked(store.pinned, from.id, hit.id)
        ) {
          return;
        }
        mark = { kind: "tab", id: hit.id, after: this._isAfter(ev, hit.el) };
      } else {
        const key = store.pinned.includes(hit.id)
          ? undefined
          : segmentKeyOfTab(this._segments, hit.id);
        if (!key || key === `group:${from.id}`) {
          return;
        }
        mark = { kind: "segment", id: key, after: this._isAfter(ev, hit.el) };
      }
    } else if (hit?.kind === "group") {
      if (from.kind === "tab") {
        if (store.pinned.includes(from.id)) {
          return;
        }
        mark = { kind: "into", id: hit.id, after: false };
      } else {
        if (hit.id === from.id) {
          return;
        }
        mark = {
          kind: "segment",
          id: `group:${hit.id}`,
          after: this._isAfter(ev, hit.el),
        };
      }
    } else if (ev.composedPath()[0] === this._strip) {
      if (from.kind === "tab" && store.pinned.includes(from.id)) {
        return;
      }
      mark = { kind: "end", id: "", after: true };
    } else {
      return;
    }
    ev.preventDefault();
    if (
      this._dropMark?.kind !== mark.kind ||
      this._dropMark.id !== mark.id ||
      this._dropMark.after !== mark.after
    ) {
      this._dropMark = mark;
      this._ctx.host.requestUpdate();
    }
  };

  private _drop = (ev: DragEvent) => {
    ev.preventDefault();
    const from = this._dragging;
    const mark = this._dropMark;
    this._dragEnd();
    if (!from || !mark) {
      return;
    }
    const segments = this._segments;
    const context = this._moveContext;
    let change: StripChange | undefined;
    if (from.kind === "tab") {
      if (mark.kind === "tab") {
        change = moveTabNear(segments, context, from.id, mark.id, mark.after);
      } else if (mark.kind === "into") {
        change = joinGroup(segments, context, from.id, mark.id, "start");
      } else if (mark.kind === "end") {
        change = moveTabToEnd(segments, context, from.id);
      }
    } else if (mark.kind === "segment") {
      change = moveGroupNear(segments, from.id, mark.id, mark.after);
    } else if (mark.kind === "end") {
      const last = [...segments]
        .reverse()
        .find((segment) => segment.kind !== "pinned");
      const key = last
        ? last.kind === "group"
          ? `group:${last.group.id}`
          : `tab:${(last as { id: string }).id}`
        : undefined;
      change = key ? moveGroupNear(segments, from.id, key, true) : undefined;
    }
    if (change) {
      this._commit(change);
    }
  };

  private _dragEnd = () => {
    this._dragging = undefined;
    this._dropMark = undefined;
    this._ctx.host.requestUpdate();
  };

  // Keyboard --------------------------------------------------------------

  private _handleKeydown = (ev: KeyboardEvent) => {
    const item = ev
      .composedPath()
      .find(
        (node): node is HTMLElement =>
          isElement(node) && node.dataset.nav !== undefined
      );
    if (!item) {
      return;
    }
    const id = item.dataset.id!;
    const isTab = item.getAttribute("role") === "tab";
    if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
      ev.preventDefault();
      this._fireMenu(isTab ? "tab" : "group", id, item, false);
      return;
    }
    const orientation = this._orientation;
    const rtl = this._rtl;
    const move = moveKeyIntent(ev, orientation, rtl);
    if (move) {
      ev.preventDefault();
      this._keyboardMove(move, isTab, id);
      return;
    }
    if (ev.ctrlKey || ev.altKey || ev.metaKey || ev.shiftKey) {
      return;
    }
    const intent = navIntent(ev.key, orientation, rtl);
    if (!intent) {
      return;
    }
    const items = this._navItems();
    const next = navTarget(intent, items.indexOf(item), items.length);
    if (next >= 0) {
      ev.preventDefault();
      items[next].focus();
    }
  };

  private _keyboardMove(
    move: { type: "reorder" | "group"; forward: boolean },
    isTab: boolean,
    id: string
  ) {
    const { store, t } = this._ctx;
    const segments = this._segments;
    const context = this._moveContext;
    let change: StripChange | undefined;
    if (!isTab) {
      if (move.type !== "reorder") {
        return;
      }
      const index = segments.findIndex(
        (segment) => segment.kind === "group" && segment.group.id === id
      );
      const neighbour = segments[index + (move.forward ? 1 : -1)];
      if (neighbour && neighbour.kind !== "pinned") {
        change = moveGroupNear(
          segments,
          id,
          neighbour.kind === "group"
            ? `group:${neighbour.group.id}`
            : `tab:${neighbour.id}`,
          move.forward
        );
      }
    } else if (move.type === "reorder") {
      change = planKeyboardMove(segments, context, id, move.forward);
      if (!change && store.pinned.includes(id)) {
        this._announce(
          t("ui.page_tabs.move_blocked", {
            name: this._tabById(id)?.title ?? id,
          })
        );
        return;
      }
    } else {
      const step = groupStepTarget(segments, id, move.forward);
      if (!step) {
        this._announce(
          t(
            store.pinned.includes(id)
              ? "ui.page_tabs.groups_strip.pinned_no_group"
              : "ui.page_tabs.groups_strip.no_group_there",
            { name: this._tabById(id)?.title ?? id }
          )
        );
        return;
      }
      change =
        step.groupId === null
          ? leaveGroup(segments, context, id, move.forward)
          : joinGroup(
              segments,
              context,
              id,
              step.groupId,
              move.forward ? "start" : "end"
            );
    }
    if (change) {
      this._commit(change);
    }
  }

  public static styles = [
    TabOverflowController.styles,
    css`
      .strip-area {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-width: 0;
      }
      :host([vertical]) .strip-area {
        flex: 1 1 auto;
        flex-direction: column;
        align-items: stretch;
        min-height: 0;
      }
      .strip {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-width: 0;
        overflow-x: auto;
        overflow-y: hidden;
        scrollbar-width: none;
        padding: var(--ha-space-1) 0;
        /* A tab scrolled into view stays clear of the 40px edge fade. */
        scroll-padding-inline: 48px;
      }
      .strip.has-pinned {
        scroll-padding-inline-start: calc(var(--pinned-size, 0px) + 8px);
      }
      /* A scroll settles with a whole tab at the edge, not a cut piece of
         one. Proximity snapping leaves a free scroll and a drag alone. */
      :host(:not([vertical])) .strip {
        scroll-snap-type: x proximity;
      }
      :host(:not([vertical])) .strip > * {
        scroll-snap-align: start;
      }
      @media (prefers-reduced-motion: reduce) {
        :host(:not([vertical])) .strip {
          scroll-snap-type: none;
        }
      }
      :host([vertical]) .strip {
        flex: 1 1 auto;
        flex-direction: column;
        align-items: stretch;
        overflow-x: hidden;
        overflow-y: auto;
        min-height: 0;
        padding: 0 var(--ha-space-1);
        scroll-padding-inline: 0;
        scroll-padding-block: 48px;
      }
      :host([vertical]) .strip.has-pinned {
        scroll-padding-block-start: calc(var(--pinned-size, 0px) + 8px);
      }
      .strip::-webkit-scrollbar {
        display: none;
      }
      .strip.more-end {
        mask-image: linear-gradient(
          to var(--float-end, right),
          #000 calc(100% - 40px),
          transparent
        );
      }
      /* The start edge is fully clear for a few pixels before it fades in, so
         the end of a scrolled-away tab never shows as a cut fragment. */
      .strip.more-start {
        mask-image: linear-gradient(
          to var(--float-start, left),
          #000 calc(100% - 44px),
          transparent calc(100% - 12px)
        );
      }
      .strip.more-start.more-end {
        mask-image: linear-gradient(
          to right,
          transparent 12px,
          #000 44px,
          #000 calc(100% - 40px),
          transparent
        );
      }
      :host([vertical]) .strip.more-end {
        mask-image: linear-gradient(
          to bottom,
          #000 calc(100% - 40px),
          transparent
        );
      }
      :host([vertical]) .strip.more-start {
        mask-image: linear-gradient(
          to top,
          #000 calc(100% - 40px),
          transparent
        );
      }
      :host([vertical]) .strip.more-start.more-end {
        mask-image: linear-gradient(
          to bottom,
          transparent,
          #000 40px,
          #000 calc(100% - 40px),
          transparent
        );
      }
      /* The pinned tabs stay in view when the rest scrolls. */
      .pinned-region {
        position: sticky;
        inset-inline-start: 0;
        z-index: 1;
        display: flex;
        flex: none;
        align-items: center;
        gap: var(--ha-space-1);
        padding-inline-end: var(--ha-space-1);
        background-color: var(--primary-background-color);
      }
      :host([vertical]) .pinned-region {
        inset-inline-start: auto;
        inset-block-start: 0;
        flex-direction: column;
        align-items: stretch;
        padding-inline-end: 0;
        padding-block-end: var(--ha-space-1);
      }
      .tab {
        display: flex;
        align-items: center;
        flex: none;
        box-sizing: border-box;
        height: calc(
          var(--ha-page-tab-height, var(--ha-space-10)) * var(--tab-density, 1)
        );
        border: 1px solid var(--tab-border-color, transparent);
        border-radius: var(--tab-radius, var(--ha-border-radius-pill));
        background-color: var(--tab-background, transparent);
        color: var(--tab-color, var(--secondary-text-color));
        font-style: var(--tab-font-style, normal);
        transition:
          background-color var(--ha-animation-duration-fast) ease,
          color var(--ha-animation-duration-fast) ease;
      }
      :host([vertical]) .tab {
        width: 100%;
      }
      .tab:hover,
      .tab:focus-within {
        background-color: var(
          --tab-background,
          var(--ha-color-fill-neutral-quiet-resting)
        );
        color: var(--tab-color, var(--primary-text-color));
      }
      .tab.selected {
        background-color: var(--tab-background, var(--primary-text-color));
        color: var(--tab-color, var(--primary-background-color));
      }
      .tab-button {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        flex: 1;
        min-width: 0;
        height: 100%;
        padding-inline: var(--ha-space-4);
        border-radius: inherit;
        font-size: var(--ha-font-size-m);
        font-weight: var(--tab-weight, var(--ha-font-weight-medium));
        white-space: nowrap;
        text-align: start;
      }
      .label {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .tab-button ha-svg-icon,
      .tab-button ha-icon {
        --mdc-icon-size: 18px;
      }
      /* The icon shows where the label may be hidden: side strips and the compact pinned region. */
      .tab-icon {
        display: none;
        align-items: center;
        flex: none;
      }
      :host([vertical]) .tab-icon,
      .compact .tab-icon {
        display: inline-flex;
      }
      .compact .tab-button {
        padding-inline: var(--ha-space-3);
      }
      .compact .pin-mark {
        display: none;
      }
      /* A collapsed strip: each tab is its icon, its name in the tooltip and to screen readers. */
      :host([collapsed]) .tab-icon {
        display: inline-flex;
      }
      :host([collapsed]) .tab-button {
        justify-content: center;
        padding-inline: var(--ha-space-3);
      }
      :host([collapsed]) .pin-mark,
      :host([collapsed]) .tab .pin,
      :host([collapsed]) .tab .close,
      :host([collapsed]) .group-name,
      :host([collapsed]) .group-count {
        display: none;
      }
      :host([collapsed]) .label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .compact .label {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .lock-mark {
        flex: none;
        --mdc-icon-size: 14px;
      }
      /* The close button shows on the selected tab, and on hover or focus. */
      .close,
      .pin {
        display: none;
        align-items: center;
        justify-content: center;
        flex: none;
        width: var(--ha-space-8);
        height: var(--ha-space-8);
        margin-inline: calc(-1 * var(--ha-space-3)) var(--ha-space-1);
        border-radius: var(--ha-border-radius-circle);
        --mdc-icon-size: 16px;
      }
      .tab.selected .close,
      .tab:hover .close,
      .tab:focus-within .close,
      .tab.selected .pin,
      .tab:hover .pin,
      .tab:focus-within .pin {
        display: flex;
      }
      .close:hover,
      .pin:hover {
        background-color: rgba(127, 127, 127, 0.3);
      }
      .tab.pinned .close {
        display: none;
      }
      .tab.pinned .tab-button {
        padding-inline-end: var(--ha-space-2);
      }
      /* A group: a coloured header chip, then its tabs. */
      .group {
        display: flex;
        align-items: center;
        flex: none;
        gap: var(--ha-space-1);
        padding-inline: 2px;
        border-radius: var(--ha-border-radius-pill);
        background-color: color-mix(
          in srgb,
          var(--group-colour) 16%,
          transparent
        );
        box-shadow: inset 0 -2px 0 var(--group-colour);
      }
      :host([vertical]) .group {
        flex-direction: column;
        align-items: stretch;
        padding: 2px 0;
        border-radius: var(--ha-border-radius-xl);
        box-shadow: inset 2px 0 0 var(--group-colour);
      }
      .group-header {
        display: flex;
        flex: none;
      }
      .group-toggle {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        min-width: 0;
        height: var(--ha-space-8);
        padding-inline: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-pill);
        color: var(--primary-text-color);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        white-space: nowrap;
        --mdc-icon-size: 16px;
      }
      .group-toggle:hover {
        background-color: var(--ha-color-fill-neutral-quiet-resting);
      }
      .group-icon {
        flex: none;
        font-size: 14px;
        line-height: 1;
      }
      /* The looks a person can pick for a group; the name stays readable to
         assistive technology in every one of them. */
      .group.look-chip {
        box-shadow: none;
      }
      .group.look-bracket {
        box-shadow: none;
        border-inline: 2px solid var(--group-colour);
        border-radius: var(--ha-border-radius-md);
      }
      .group.look-compact .group-count,
      .group.look-compact .chevron {
        display: none;
      }
      .group.look-dot .group-name,
      .group.look-dot .group-count,
      .group.look-dot .chevron {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      .group-dot {
        flex: none;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background-color: var(--group-colour);
      }
      .group-name {
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .group-count {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-xs);
      }
      :host(:dir(rtl)) .chevron {
        transform: scaleX(-1);
      }
      .dragging {
        opacity: 0.5;
      }
      .drop-before {
        box-shadow: inset 3px 0 0 var(--primary-color);
      }
      .drop-after {
        box-shadow: inset -3px 0 0 var(--primary-color);
      }
      :host(:dir(rtl)) .drop-before {
        box-shadow: inset -3px 0 0 var(--primary-color);
      }
      :host(:dir(rtl)) .drop-after {
        box-shadow: inset 3px 0 0 var(--primary-color);
      }
      :host([vertical]) .drop-before,
      :host([vertical]:dir(rtl)) .drop-before {
        box-shadow: inset 0 3px 0 var(--primary-color);
      }
      :host([vertical]) .drop-after,
      :host([vertical]:dir(rtl)) .drop-after {
        box-shadow: inset 0 -3px 0 var(--primary-color);
      }
      .group-header.drop-into {
        outline: 2px solid var(--primary-color);
        border-radius: var(--ha-border-radius-pill);
      }
      .strip.drop-end {
        box-shadow: inset -3px 0 0 var(--primary-color);
      }
      :host([vertical]) .strip.drop-end {
        box-shadow: inset 0 -3px 0 var(--primary-color);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      /* A side strip on a narrow window is icons only; the full names stay as accessible names and tooltips. */
      @media (max-width: 1100px) {
        :host([vertical]:not([merged])) .label {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip-path: inset(50%);
          white-space: nowrap;
        }
        :host([vertical]:not([merged])) .tab-button {
          justify-content: center;
          padding-inline: var(--ha-space-2);
        }
        :host([vertical]:not([merged])) .pin,
        :host([vertical]:not([merged])) .close,
        :host([vertical]:not([merged])) .pin-mark,
        :host([vertical]:not([merged])) .group-name,
        :host([vertical]:not([merged])) .group-count {
          display: none;
        }
        :host([vertical]:not([merged])) .group-toggle {
          justify-content: center;
          padding-inline: var(--ha-space-1);
        }
      }
      /* A finger cannot hover: every tab shows its close button. */
      @media (hover: none) {
        .tab .close,
        .tab .pin {
          display: flex;
        }
        .tab.pinned .close {
          display: none;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .tab {
          transition: none;
        }
      }
    `,
  ];
}
