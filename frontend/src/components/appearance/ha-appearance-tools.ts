import type { ContextType } from "@lit/context";
import {
  mdiClose,
  mdiContentCopy,
  mdiExportVariant,
  mdiFormatPaint,
  mdiGestureTapHold,
  mdiEyeOff,
  mdiHistory,
  mdiIdentifier,
  mdiInformationOutline,
  mdiLock,
  mdiLockOutline,
  mdiMagnify,
  mdiOpenInNew,
  mdiPaletteSwatch,
  mdiPower,
  mdiPowerOff,
  mdiRenameBox,
  mdiTabPlus,
  mdiRestore,
  mdiVolumeHigh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import {
  canReadAloud,
  collectReadableText,
  readAloud,
} from "../../common/accessibility/accessibility-tools";
import {
  choiceFor,
  hasAppearanceChoices,
  reapplyAppearance,
  updateChoice,
} from "../../common/appearance/appearance-session";
import type { AppearanceScope } from "../../common/appearance/element-appearance";
import {
  composedParent,
  elementPath,
  isAKind,
  isEmptyAppearance,
  kindLabel,
} from "../../common/appearance/element-appearance";
import {
  applyElementLocks,
  setLockLocalize,
} from "../../common/locks/element-lock-session";
import {
  elementLockKey,
  readLocks,
  subscribeLocks,
} from "../../common/locks/element-locks";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { canToggleState } from "../../common/entity/can_toggle_state";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeStateName } from "../../common/entity/compute_state_name";
import { getToggleAction } from "../../common/entity/get_toggle_action";
import { navigate } from "../../common/navigate";
import { searchMatcher } from "../../common/regex/filter";
import type { LocalizeKeys } from "../../common/translations/localize";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import {
  apiContext,
  areasContext,
  devicesContext,
  entitiesContext,
  internationalizationContext,
  servicesContext,
  statesContext,
  userContext,
} from "../../data/context";
import { updateEntityRegistryEntry } from "../../data/entity/entity_registry";
import type { ActionHandlerOptions } from "../../data/lovelace/action_handler";
import { showMoreInfoDialog } from "../../dialogs/more-info/show-ha-more-info-dialog";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import type { HomeAssistant } from "../../types";
import { isMac } from "../../util/is_mac";
import "../ha-svg-icon";
import "../input/ha-input-search";
import { isHelpArticleAddress } from "../help/help-article-path";
import { openHelpUrl } from "../help/open-help-article";
import type { HaInputSearch } from "../input/ha-input-search";
import type { PageTool } from "../page/ha-page-tools";
import type {
  ContextEntry,
  ContextEntryId,
  ContextTarget,
} from "./context-menu-entries";
import { findTarget, resolveContextEntries } from "./context-menu-entries";
import "./ha-appearance-editor";
import type { HaAppearanceEditor } from "./ha-appearance-editor";
import type { HoldHandlerFacts, TouchHoldDecision } from "./touch-hold";
import { collectHoldActions, decideTouchHold } from "./touch-hold";

/** Most containing elements offered in the editor. */
const MAX_CHAIN = 7;

/** Wrappers that are never what a person means to pick. */
const SKIPPED = new Set([
  "slot",
  "html",
  "body",
  // Plain wrappers around the thing a person sees.
  "hui-card",
  "hui-badge",
  "ha-sortable",
  "ha-tile-container",
  "ha-ripple",
  "hui-view-container",
  "partial-panel-resolver",
  "ha-drawer",
]);

/**
 * A whole card, badge or row: what a person usually means inside one. The
 * dashboard's own element comes first; a bare card is the fallback.
 */
const WHOLE_THINGS = [/^hui-.+-(card|badge|row)$/, /^ha-card$/];

/** The layouts that carry the page tools. */
const PAGE_LAYOUTS = new Set([
  "hass-subpage",
  "hass-tabs-subpage",
  "ha-top-app-bar-fixed",
  "ha-two-pane-top-app-bar-fixed",
  "ha-config-dashboard",
  "hui-root",
]);

const INTERACTIVE = new Set(["button", "a", "input", "select", "textarea"]);

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  /** The key combination that does this from anywhere, shown as a hint. */
  shortcut?: string;
  /** One letter that runs this while the menu is open; never translated. */
  letter?: string;
  run: () => void;
}

/**
 * The letter that runs each tool while the menu is open. They are the same
 * in every language, so a person's fingers learn them once.
 */
const MENU_LETTERS: Record<string, string> = {
  open_link: "o",
  open_link_tab: "n",
  edit: "a",
  edit_kind: "k",
  reset_element: "x",
  reset_kind: "y",
  read: "r",
  copy: "c",
  search: "s",
  lock_element: "l",
  page_export: "e",
  page_history: "h",
  page_lock: "p",
};

const CONTEXT_ICONS: Record<ContextEntryId, string> = {
  open_details: mdiInformationOutline,
  turn_on: mdiPower,
  turn_off: mdiPowerOff,
  copy_entity_id: mdiIdentifier,
  rename: mdiRenameBox,
  hide: mdiEyeOff,
  open_device: mdiInformationOutline,
  copy_device_id: mdiIdentifier,
  open_area: mdiInformationOutline,
  copy_area_id: mdiIdentifier,
  open_new_tab: mdiTabPlus,
};

/** Below this window width the menu is a bottom sheet, not an anchored one. */
const PHONE_WIDTH = 700;

/** How far a swipe down on the sheet's top must go to close it. */
const SWIPE_CLOSE_PX = 64;

/**
 * The shortcuts of this tool. The menu shows them and the key handler reads
 * them, from this one list, so what is shown is what works.
 */
const SHORTCUTS = {
  edit: { key: "e", ctrl: true, shift: true },
  search: { key: "f", ctrl: true, shift: true },
  // Handled by the page tools panel; listed here so the menu can show it.
  lock: { key: "l", ctrl: true, shift: true },
} as const;

const shortcutLabel = (shortcut: {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
}): string =>
  [
    shortcut.ctrl ? (isMac ? "⌘" : "Ctrl") : "",
    shortcut.shift ? (isMac ? "⇧" : "Shift") : "",
    shortcut.key.toUpperCase(),
  ]
    .filter(Boolean)
    .join(" ");

const matchesShortcut = (
  ev: KeyboardEvent,
  shortcut: { key: string; ctrl?: boolean; shift?: boolean }
): boolean =>
  ev.key.toLowerCase() === shortcut.key &&
  (ev.ctrlKey || ev.metaKey) === !!shortcut.ctrl &&
  ev.shiftKey === !!shortcut.shift &&
  !ev.altKey;

/** After this long a ring starts to fill, so a hold is seen as a hold. */
const TOUCH_RING_MS = 150;

/** A finger that moves farther than this is scrolling, not holding. */
const TOUCH_MOVE_PX = 10;

/** Where a menu was asked for: it decides where the focus goes. */
type MenuSource = "pointer" | "keyboard" | "touch";

/** Components with a hold of their own, which this menu leaves alone. */
const HOLDS_ITSELF = new Set(["ha-page-tool-panel", "ha-dialog-tools"]);

/**
 * Whether an event came from the tab strip. The strip has its own tab menu
 * (`ha-page-tab-menu`), which also opens the tab appearance editor on
 * Shift+right-click, so this menu leaves those events alone.
 */
const inTabStrip = (path: EventTarget[]): boolean =>
  // The strip's own menus and panels too: the menu key sends its context-menu
  // event when the key is released, by then from inside the menu the strip has
  // just opened, and a second menu must not open over it.
  path.some(
    (node) => node instanceof HTMLElement && TAB_SURFACES.has(node.localName)
  ) ||
  (path.some(
    (node) => node instanceof HTMLElement && node.localName === "ha-page-tabs"
  ) &&
    path.some(
      (node) =>
        node instanceof HTMLElement &&
        (node.getAttribute("role") === "tab" ||
          node.getAttribute("role") === "tablist" ||
          node.classList.contains("tabs") ||
          node.classList.contains("tablist"))
    ));

const TAB_SURFACES = new Set([
  "ha-page-tab-menu",
  "ha-tab-group-menu",
  "ha-tab-group-picker",
  "ha-tab-group-editor",
  "ha-tab-search-all",
  "ha-tab-appearance-editor",
  "ha-section-tabs",
  "ha-section-tab-menu",
  "ha-section-hide-dialog",
]);

/**
 * Appearance tools for every element.
 *
 * - Right-click, long press, the menu key or Shift+F10 on anything opens a
 *   menu for that element. Shift with a right-click gives the browser's own
 *   menu, and text fields keep theirs.
 * - Ctrl+Shift+E edits the focused element. With nothing focused it starts
 *   the pick tool: move over the page, select an element, Escape cancels.
 * - Stored choices are applied when the page changes.
 *
 * One instance is created by the main layout. While a modal dialog is open
 * it moves into that dialog, because everything outside a modal dialog
 * cannot be used.
 */
@customElement("ha-appearance-tools")
export class HaAppearanceTools extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  // What the entries for a clicked entity, device or area need. They are read
  // when the menu opens, so they are kept current without a render each time.
  @consume({ context: statesContext, subscribe: true })
  private _states?: ContextType<typeof statesContext>;

  @consume({ context: servicesContext, subscribe: true })
  private _services?: ContextType<typeof servicesContext>;

  @consume({ context: entitiesContext, subscribe: true })
  private _entities?: ContextType<typeof entitiesContext>;

  @consume({ context: devicesContext, subscribe: true })
  private _devices?: ContextType<typeof devicesContext>;

  @consume({ context: areasContext, subscribe: true })
  private _areas?: ContextType<typeof areasContext>;

  @consume({ context: userContext, subscribe: true })
  private _user?: ContextType<typeof userContext>;

  @consume({ context: apiContext, subscribe: true })
  private _api?: ContextType<typeof apiContext>;

  protected willUpdate(): void {
    if (this._i18n) {
      setLockLocalize(this._i18n.localize);
    }
  }

  @state() private _menuChain?: HTMLElement[];

  @state() private _menuPosition: Record<string, string> = {};

  @state() private _menuFilter = "";

  @state() private _menuIndex = 0;

  /** True while the menu is the bottom sheet of a phone. */
  @state() private _menuPhone = false;

  /** Where the dragged sheet is, while a finger pulls it down. */
  @state() private _sheetOffset = 0;

  @state() private _ringStyle: Record<string, string> = {};

  @state() private _targetStyle: Record<string, string> = { display: "none" };

  @state() private _picking = false;

  @state() private _pickOutline: Record<string, string> = { display: "none" };

  @state() private _pickName = "";

  @state() private _announcement = "";

  @query("#menu") private _menu?: HTMLElement;

  @query("#pick") private _pickBox?: HTMLElement;

  @query("#ring") private _ring?: HTMLElement;

  @query("#hold") private _holdHint?: HTMLElement;

  @query("#target") private _targetBox?: HTMLElement;

  @query("#banner") private _banner?: HTMLElement;

  @query("ha-appearance-editor") private _editor?: HaAppearanceEditor;

  @query("#menu ha-input-search") private _menuSearch?: HaInputSearch;

  private _home?: Node;

  private _scanTimer?: number;

  private _interval?: number;

  private _pickCandidate?: HTMLElement[];

  public connectedCallback() {
    super.connectedCallback();
    if (this._listening) {
      return;
    }
    this._listening = true;
    window.addEventListener("contextmenu", this._contextMenu, true);
    window.addEventListener("touchstart", this._touchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", this._touchMove, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchend", this._touchEnd, true);
    window.addEventListener("touchcancel", this._touchEnd, true);
    window.addEventListener("keydown", this._keydown, true);
    window.addEventListener("pointerdown", this._pointerDown, true);
    window.addEventListener("location-changed", this._scheduleScan);
    window.addEventListener("popstate", this._scheduleScan);
    window.addEventListener("click", this._scheduleScan, true);
    window.addEventListener("keyup", this._scheduleScan, true);
    this._interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (hasAppearanceChoices()) {
        reapplyAppearance();
      }
      if (this._hasElementLocks()) {
        applyElementLocks();
      }
    }, 2500);
    this._unsubscribeLocks = subscribeLocks(() => applyElementLocks());
    this._scheduleScan();
  }

  private _listening = false;

  /** Removes every listener. Moving between dialogs does not call this. */
  public stop() {
    this._listening = false;
    window.removeEventListener("contextmenu", this._contextMenu, true);
    window.removeEventListener("touchstart", this._touchStart, true);
    window.removeEventListener("touchmove", this._touchMove, true);
    window.removeEventListener("touchend", this._touchEnd, true);
    window.removeEventListener("touchcancel", this._touchEnd, true);
    this._cancelHold();
    window.removeEventListener("keydown", this._keydown, true);
    window.removeEventListener("pointerdown", this._pointerDown, true);
    window.removeEventListener("location-changed", this._scheduleScan);
    window.removeEventListener("popstate", this._scheduleScan);
    window.removeEventListener("click", this._scheduleScan, true);
    window.removeEventListener("keyup", this._scheduleScan, true);
    window.clearInterval(this._interval);
    window.clearTimeout(this._scanTimer);
    this._unsubscribeLocks?.();
    this._unsubscribeLocks = undefined;
    this._stopPicking();
  }

  private _unsubscribeLocks?: () => void;

  private _hasElementLocks(): boolean {
    return readLocks().locked.some((key) => key.startsWith("element:"));
  }

  /** Opens the lock wizard beside one element of the page that is open. */
  private _lockElement(element: HTMLElement): void {
    if (this._i18n) {
      setLockLocalize(this._i18n.localize);
    }
    const key = elementLockKey(window.location.pathname, elementPath(element));
    void import("../locks/ha-lock-wizard").then(({ openLockWizard }) =>
      import("../locks/lock-text").then(({ describeElement }) =>
        openLockWizard({
          key,
          label: describeElement(element),
          anchor: element,
          onCreated: () =>
            this._announce(this._i18n?.localize("ui.locks.created") ?? ""),
        })
      )
    );
  }

  /** The page layout an element is on, if it is on one. */
  private _pageOf(element: HTMLElement): HTMLElement | undefined {
    let current: Node | null = element;
    while (current) {
      if (
        current instanceof HTMLElement &&
        PAGE_LAYOUTS.has(current.localName)
      ) {
        return current;
      }
      current = composedParent(current);
    }
    return undefined;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return (
      this._i18n?.localize(
        `ui.appearance_editor.${key}` as LocalizeKeys,
        values
      ) || key
    );
  }

  // Choices are applied shortly after anything that can change the page,
  // and once more a second later for content that loads late.
  private _scheduleScan = () => {
    if (!hasAppearanceChoices() && !this._hasElementLocks()) {
      return;
    }
    window.clearTimeout(this._scanTimer);
    this._scanTimer = window.setTimeout(() => {
      applyElementLocks();
      reapplyAppearance();
      this._scanTimer = window.setTimeout(() => {
        applyElementLocks();
        reapplyAppearance();
      }, 1000);
    }, 200);
  };

  // ---- Finding the element ----

  private _isOwn(path: EventTarget[]): boolean {
    return path.includes(this);
  }

  /**
   * The element under an event and what contains it, innermost first. Only
   * elements a person can tell apart are kept: the innermost one, controls,
   * and components.
   */
  private _chainFrom(start: Element | null | undefined): HTMLElement[] {
    const chain: HTMLElement[] = [];
    let node: Node | null | undefined = start;
    let first = true;
    while (node && chain.length < MAX_CHAIN) {
      if (node instanceof HTMLElement && !SKIPPED.has(node.localName)) {
        const tag = node.localName;
        if (
          first ||
          tag.includes("-") ||
          INTERACTIVE.has(tag) ||
          node.hasAttribute("role")
        ) {
          // Icons inside a control are part of that control.
          if (!(first && (tag === "ha-svg-icon" || tag === "ha-icon"))) {
            chain.push(node);
          }
          first = false;
        }
      }
      node = composedParent(node);
    }
    return chain;
  }

  private _defaultIndex(chain: HTMLElement[]): number {
    const first = chain[0];
    if (!first || INTERACTIVE.has(first.localName)) {
      return 0;
    }
    // Inside a card, badge or row, the whole of it is the usual choice. The
    // parts stay one step away in the editor.
    const near = chain.slice(0, 5);
    for (const pattern of WHOLE_THINGS) {
      const whole = near.findIndex((element) =>
        pattern.test(element.localName)
      );
      if (whole !== -1) {
        return whole;
      }
    }
    if (first.localName.includes("-") || first.hasAttribute("role")) {
      return 0;
    }
    const component = chain.findIndex((element) =>
      element.localName.includes("-")
    );
    return component === -1 ? 0 : component;
  }

  private _deepActiveElement(): HTMLElement | undefined {
    let active: Element | null = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active instanceof HTMLElement && active !== document.body
      ? active
      : undefined;
  }

  // While a modal dialog is open, only what is inside it can be used.
  private _moveNear(chain: HTMLElement[]) {
    this._home ??= this.parentNode ?? undefined;
    let dialog: HTMLDialogElement | undefined;
    let node: Node | null | undefined = chain[0];
    while (node) {
      if (node instanceof HTMLDialogElement && node.matches(":modal")) {
        dialog = node;
        break;
      }
      node = composedParent(node);
    }
    const target = dialog ?? this._home;
    if (target && this.parentNode !== target) {
      target.appendChild(this);
    }
  }

  // ---- Menu ----

  private _contextMenu = (ev: MouseEvent) => {
    const path = ev.composedPath();
    if (this._isOwn(path) || inTabStrip(path)) {
      return;
    }
    const target = path.find(
      (node): node is Element => node instanceof Element
    );
    const fromPointer = ev.button === 2;
    // Shift with a right-click asks for the browser's menu. Text fields
    // keep theirs: it has paste and spelling.
    if ((fromPointer && ev.shiftKey) || this._isTextField(target)) {
      return;
    }
    const chain = this._chainFrom(target);
    if (!chain.length) {
      return;
    }
    ev.preventDefault();
    // A phone that sends this event on a long press needs no second menu.
    this._cancelHold();
    const rect = chain[0].getBoundingClientRect();
    const atPointer = fromPointer || ev.clientX || ev.clientY;
    this._openMenu(
      chain,
      atPointer
        ? { x: ev.clientX, y: ev.clientY }
        : { x: rect.left + 12, y: rect.bottom },
      atPointer ? "pointer" : "keyboard"
    );
  };

  private _isTextField(target: Element | undefined): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable ||
        target.localName === "textarea" ||
        (target.localName === "input" &&
          !["checkbox", "radio", "range", "button", "color"].includes(
            (target as HTMLInputElement).type
          )))
    );
  }

  // ---- Touch and hold ----
  //
  // Some phones send no "contextmenu" event for a long press, so a finger
  // held still on an element opens the menu here.

  private _holdTimer?: number;

  private _ringTimer?: number;

  private _holdShown = false;

  private _holdPoint?: { x: number; y: number };

  /** Stops a hold in progress and takes its ring and hint away. */
  private _cancelHold() {
    window.clearTimeout(this._holdTimer);
    window.clearTimeout(this._ringTimer);
    this._holdShown = false;
    [this._ring, this._holdHint].forEach((box) => {
      if (box?.matches(":popover-open")) {
        box.hidePopover();
      }
    });
  }

  // The ring and the hint appear from the first 150 ms of a hold.
  private async _showHold(point: { x: number; y: number }) {
    this._holdShown = true;
    this._ringStyle = {
      left: `${point.x - 28}px`,
      top: `${point.y - 28}px`,
    };
    await this.updateComplete;
    if (!this._holdShown) {
      return;
    }
    [this._ring, this._holdHint].forEach((box) => {
      if (box && !box.matches(":popover-open")) {
        box.showPopover();
      }
    });
  }

  private _holdOpened = false;

  private _touchStart = (ev: TouchEvent) => {
    this._cancelHold();
    this._holdOpened = false;
    const path = ev.composedPath();
    if (ev.touches.length !== 1 || this._isOwn(path) || inTabStrip(path)) {
      return;
    }
    const target = path.find(
      (node): node is Element => node instanceof Element
    );
    // Text fields keep the phone's own menu, and anything that already acts
    // on a hold keeps its hold.
    if (
      this._isTextField(target) ||
      path.some(
        (node) =>
          node instanceof HTMLElement && HOLDS_ITSELF.has(node.localName)
      )
    ) {
      return;
    }
    // A tile or card has a tap action (an action handler) but usually no hold
    // action, so having an action handler is not a reason to give up. A hold
    // action that is set stays: see `decideTouchHold`.
    const decision = this._touchHoldDecision(path);
    if (!decision.open) {
      return;
    }
    const point = { x: ev.touches[0].clientX, y: ev.touches[0].clientY };
    this._holdPoint = point;
    this._ringTimer = window.setTimeout(
      () => this._showHold(point),
      TOUCH_RING_MS
    );
    this._holdTimer = window.setTimeout(() => {
      this._cancelHold();
      if (this._menu?.matches(":popover-open")) {
        return;
      }
      const chain = this._chainFrom(target);
      if (!chain.length) {
        return;
      }
      this._holdOpened = true;
      // One short buzz, where the phone allows it.
      if ("vibrate" in navigator) {
        navigator.vibrate(25);
      }
      this._openMenu(chain, point, "touch");
    }, decision.delayMs);
  };

  /** Reads what the elements under a finger say about their hold actions. */
  private _touchHoldDecision(path: EventTarget[]): TouchHoldDecision {
    const handlers: HoldHandlerFacts[] = [];
    const configs: unknown[] = [];
    path.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      const element = node as HTMLElement & {
        actionHandler?: { options?: ActionHandlerOptions };
        _config?: unknown;
        config?: unknown;
      };
      if (element.actionHandler) {
        const options = element.actionHandler.options;
        // A container binding decides per target at the moment of the touch,
        // so its hold cannot be ruled out.
        handlers.push({
          hasHold:
            options?.hasHold === true || typeof options?.resolve === "function",
        });
      }
      configs.push(element._config, element.config);
    });
    // The configurations are read only when some element has a hold action
    const holdActions = handlers.some((handler) => handler.hasHold)
      ? configs.flatMap((config) => collectHoldActions(config))
      : [];
    return decideTouchHold(handlers, holdActions);
  }

  private _touchMove = (ev: TouchEvent) => {
    const touch = ev.touches[0];
    if (
      !this._holdPoint ||
      !touch ||
      Math.hypot(
        touch.clientX - this._holdPoint.x,
        touch.clientY - this._holdPoint.y
      ) > TOUCH_MOVE_PX
    ) {
      this._cancelHold();
    }
  };

  private _touchEnd = (ev: TouchEvent) => {
    this._cancelHold();
    if (this._holdOpened) {
      // Lifting the finger must not press what is under it. An element with an
      // action handler would otherwise take the release for a tap and open its
      // dialog on top of the menu, so the release goes no further.
      this._holdOpened = false;
      if (ev.cancelable) {
        ev.preventDefault();
      }
      ev.stopPropagation();
    }
  };

  private _menuPoint = { x: 0, y: 0 };

  private async _openMenu(
    chain: HTMLElement[],
    point: { x: number; y: number },
    source: MenuSource
  ) {
    // A menu asked for with the keyboard gives the focus back to the element
    // it was asked on when it closes.
    this._returnFocusTo =
      source === "keyboard" ? this._deepActiveElement() : undefined;
    this._moveNear(chain);
    this._menuChain = chain;
    this._menuPoint = point;
    this._menuFilter = "";
    this._menuIndex = 0;
    this._sheetOffset = 0;
    this._placeMenu();
    window.visualViewport?.addEventListener("resize", this._placeMenu);
    window.addEventListener("resize", this._placeMenu);
    await this.updateComplete;
    if (this._menu && !this._menu.matches(":popover-open")) {
      this._menu.showPopover();
    }
    this._showTarget();
    await this._menuSearch?.updateComplete;
    // The search takes the focus when the menu was asked for with the
    // keyboard. From a pointer or a finger it stays out, so a letter runs
    // its tool and a phone's keyboard does not open over the sheet.
    if (source === "keyboard") {
      this._menuSearch?.focus();
    } else {
      this._menu?.focus();
    }
  }

  // The menu sits beside the element on a wide screen, on its right edge
  // and on its left when there is no room. On a phone it is a bottom sheet
  // over the visible screen, which is what is left above the keyboard.
  private _placeMenu = () => {
    const chain = this._menuChain;
    if (!chain) {
      return;
    }
    const phone = window.innerWidth < PHONE_WIDTH;
    this._menuPhone = phone;
    const visibleHeight = window.visualViewport?.height ?? window.innerHeight;
    const offsetTop = window.visualViewport?.offsetTop ?? 0;
    if (phone) {
      this._menuPosition = {
        left: "0px",
        top: `${offsetTop}px`,
        width: "100%",
        height: `${visibleHeight}px`,
      };
      this._targetStyle = { display: "none" };
      return;
    }
    const width = Math.min(320, window.innerWidth - 16);
    const height = Math.min(560, visibleHeight - 16);
    const rect = chain[this._defaultIndex(chain)].getBoundingClientRect();
    // A big element, such as a whole page, has no edge worth anchoring to.
    const anchored =
      rect.width > 0 &&
      rect.width < window.innerWidth * 0.6 &&
      rect.height < visibleHeight * 0.8;
    let left = anchored ? rect.right + 8 : this._menuPoint.x;
    if (anchored && left + width > window.innerWidth - 8) {
      left = rect.left - width - 8;
    }
    const top = anchored ? rect.top : this._menuPoint.y;
    this._menuPosition = {
      left: `${Math.max(8, Math.min(left, window.innerWidth - width - 8))}px`,
      top: `${offsetTop + Math.max(8, Math.min(top, visibleHeight - height - 8))}px`,
      "max-height": `${height}px`,
    };
    // The element keeps a 3 px outline while its menu is open.
    this._targetStyle = anchored
      ? {
          left: `${rect.left}px`,
          top: `${rect.top}px`,
          width: `${rect.width}px`,
          height: `${rect.height}px`,
        }
      : { display: "none" };
  };

  private _showTarget() {
    if (
      this._menuChain &&
      !this._menuPhone &&
      this._targetStyle.display !== "none" &&
      this._targetBox &&
      !this._targetBox.matches(":popover-open")
    ) {
      this._targetBox.showPopover();
    }
  }

  private _returnFocusTo?: HTMLElement;

  /** Closes the menu. `returnFocus` puts the focus back where it was asked. */
  private _closeMenu(returnFocus = false) {
    if (this._menu?.matches(":popover-open")) {
      this._menu.hidePopover();
    }
    if (this._targetBox?.matches(":popover-open")) {
      this._targetBox.hidePopover();
    }
    window.visualViewport?.removeEventListener("resize", this._placeMenu);
    window.removeEventListener("resize", this._placeMenu);
    this._menuChain = undefined;
    this._sheetOffset = 0;
    const target = this._returnFocusTo;
    this._returnFocusTo = undefined;
    if (returnFocus && target?.isConnected) {
      target.focus();
    }
  }

  /** The target the closest ancestor with an identity says it stands for. */
  private _contextTarget(chain: HTMLElement[]): ContextTarget | undefined {
    const parentOf = (element: HTMLElement): HTMLElement | undefined => {
      let node: Node | null = composedParent(element);
      while (node && !(node instanceof HTMLElement)) {
        node = composedParent(node);
      }
      return node ?? undefined;
    };
    return findTarget(
      chain[0],
      parentOf,
      (element) =>
        PAGE_LAYOUTS.has(element.localName) ||
        element instanceof HTMLDialogElement
    );
  }

  private _contextItems(chain: HTMLElement[], hasLink: boolean): MenuItem[] {
    let target = this._contextTarget(chain);
    if (!target || !this._i18n) {
      return [];
    }
    if (hasLink && target.href) {
      target = { ...target, href: undefined };
    }
    const states = this._states;
    const stateObj = target.entityId ? states?.[target.entityId] : undefined;
    const registry = target.entityId
      ? this._entities?.[target.entityId]
      : undefined;
    const device = target.deviceId
      ? this._devices?.[target.deviceId]
      : undefined;
    const area = target.areaId ? this._areas?.[target.areaId] : undefined;
    const entries = resolveContextEntries(target, {
      state: stateObj,
      entityName: stateObj ? computeStateName(stateObj) : registry?.name,
      // canToggleState reads only the states and the services.
      canToggle:
        stateObj && states && this._services
          ? canToggleState(
              { states, services: this._services } as unknown as HomeAssistant,
              stateObj
            )
          : false,
      registry: registry ? { hidden: registry.hidden } : undefined,
      isAdmin: this._user?.is_admin,
      deviceName: device ? device.name_by_user || device.name || "" : undefined,
      areaName: area?.name,
      origin: window.location.origin,
    });
    return entries.map((entry) => ({
      id: `context_${entry.id}`,
      icon: CONTEXT_ICONS[entry.id],
      label: this._l(
        entry.labelKey,
        entry.name ? { name: entry.name } : undefined
      ),
      run: () => this._runContextEntry(entry),
    }));
  }

  private async _runContextEntry(entry: ContextEntry): Promise<void> {
    // The menu is already closed, so a failure must be said out loud.
    try {
      await this._performContextEntry(entry);
    } catch (_err) {
      this._announce(this._l("action_failed"));
    }
  }

  private async _performContextEntry(entry: ContextEntry): Promise<void> {
    const { value } = entry;
    switch (entry.id) {
      case "open_details":
        showMoreInfoDialog(this, { entityId: value });
        break;
      case "rename":
        // The settings view of the details has the name field.
        showMoreInfoDialog(this, { entityId: value, view: "settings" });
        break;
      case "turn_on":
      case "turn_off": {
        const turnOn = entry.id === "turn_on";
        const domain = computeDomain(value);
        await this._api?.callService(
          domain === "group" ? "homeassistant" : domain,
          getToggleAction(domain, turnOn),
          { entity_id: value }
        );
        break;
      }
      case "hide":
        if (this._api) {
          await updateEntityRegistryEntry(this._api, value, {
            hidden_by: "user",
          });
          this._announce(
            this._l("entity_hidden", { name: entry.name ?? value })
          );
        }
        break;
      case "copy_entity_id":
      case "copy_device_id":
      case "copy_area_id":
        await copyToClipboard(value);
        this._announce(this._l("copied"));
        break;
      case "open_device":
        navigate(`/config/devices/device/${value}`);
        break;
      case "open_area":
        navigate(`/config/areas/area/${value}`);
        break;
      case "open_new_tab":
        window.open(value, "_blank", "noreferrer");
        break;
    }
  }

  private _menuItems(filtered = true): MenuItem[] {
    const chain = this._menuChain;
    if (!chain?.length) {
      return [];
    }
    const index = this._defaultIndex(chain);
    const element = chain[index];
    const kind = kindLabel(element.localName);
    // What the element does when chosen: open the link it is or sits inside.
    const link = chain.find(
      (candidate): candidate is HTMLAnchorElement =>
        candidate instanceof HTMLAnchorElement &&
        !!candidate.getAttribute("href")
    );
    // The entries for the thing that was clicked come first. An anchor has
    // its own open entries below, so a link is not offered twice.
    const items: MenuItem[] = this._contextItems(chain, !!link);
    if (link) {
      items.push(
        {
          id: "open_link",
          icon: mdiOpenInNew,
          label: this._l("menu_open"),
          run: () => link.click(),
        },
        {
          id: "open_link_tab",
          icon: mdiTabPlus,
          // A help link opens the reader, never another tab.
          label: isHelpArticleAddress(link.href)
            ? this._i18n?.localize("ui.help.open_in_reader") ||
              "Open in the help reader"
            : this._l("menu_open_new_tab"),
          run: () => openHelpUrl(this, link.href, "_blank", "noreferrer"),
        }
      );
    }
    items.push({
      id: "edit",
      icon: mdiFormatPaint,
      label: this._l("menu_edit"),
      shortcut: shortcutLabel(SHORTCUTS.edit),
      run: () => this._edit(chain, index, "element"),
    });
    // "Every one of a kind" is offered for components only: every plain
    // block or button on every page is not a kind a person can picture.
    if (isAKind(element)) {
      items.push({
        id: "edit_kind",
        icon: mdiPaletteSwatch,
        label: this._l("menu_edit_kind", { kind }),
        run: () => this._edit(chain, index, "kind"),
      });
    }
    (["element", "kind"] as const).forEach((scope) => {
      if (!isEmptyAppearance(choiceFor(element, scope))) {
        items.push({
          id: `reset_${scope}`,
          icon: mdiRestore,
          label: this._l(`menu_reset_${scope}`, { kind }),
          run: () => {
            updateChoice(element, scope, {});
            this._announce(this._l("reset_done"));
          },
        });
      }
    });
    if (canReadAloud()) {
      items.push({
        id: "read",
        icon: mdiVolumeHigh,
        label: this._l("menu_read"),
        run: () => {
          const started = readAloud(
            collectReadableText(element),
            this._i18n?.locale?.language ?? navigator.language,
            () => undefined,
            () => this._announce(this._l("no_device_voice"))
          );
          if (!started) {
            this._announce(this._l("no_device_voice"));
          }
        },
      });
    }
    items.push(
      {
        id: "copy",
        icon: mdiContentCopy,
        label: this._l("menu_copy"),
        run: async () => {
          await copyToClipboard(collectReadableText(element).join("\n"));
          this._announce(this._l("copied"));
        },
      },
      {
        id: "search",
        icon: mdiMagnify,
        label: this._l("menu_search"),
        shortcut: shortcutLabel(SHORTCUTS.search),
        run: () => showQuickBar(this, {}),
      }
    );
    items.push({
      id: "lock_element",
      icon: mdiLockOutline,
      label: this._i18n?.localize("ui.page_tools.menu_lock_element") ?? "",
      run: () => this._lockElement(element),
    });
    // The tools of the page the element is on, when it is on one.
    const page = this._pageOf(element);
    if (page && this._i18n) {
      const localize = this._i18n.localize;
      const open = (tool: PageTool) => () =>
        fireEvent(this, "hass-page-tool", {
          tool,
          root: page,
          title: document.title,
        });
      items.push(
        {
          id: "page_export",
          icon: mdiExportVariant,
          label: localize("ui.page_tools.menu_export"),
          run: open("export"),
        },
        {
          id: "page_history",
          icon: mdiHistory,
          label: localize("ui.page_tools.menu_history"),
          run: open("history"),
        },
        {
          id: "page_lock",
          icon: mdiLock,
          label: localize("ui.page_tools.menu_lock"),
          shortcut: shortcutLabel(SHORTCUTS.lock),
          run: open("lock"),
        }
      );
    }
    items.forEach((item) => {
      item.letter = MENU_LETTERS[item.id];
    });
    if (!filtered) {
      return items;
    }
    const matches = searchMatcher(this._menuFilter);
    return items.filter((item) => matches(item.label));
  }

  /** The element the menu is about: the one a person most likely means. */
  private get _menuElement(): HTMLElement | undefined {
    const chain = this._menuChain;
    return chain?.length ? chain[this._defaultIndex(chain)] : undefined;
  }

  private _runItem(item: MenuItem | undefined) {
    if (!item) {
      return;
    }
    // The item may move the focus on (an editor, a field); when it does not,
    // it stays on the element the menu was asked for.
    this._closeMenu(true);
    item.run();
  }

  private _menuKeydown(ev: KeyboardEvent) {
    const items = this._menuItems();
    if (ev.key === "ArrowDown" || ev.key === "ArrowUp") {
      ev.preventDefault();
      const step = ev.key === "ArrowDown" ? 1 : -1;
      this._menuIndex =
        (this._menuIndex + step + items.length) % Math.max(1, items.length);
    } else if (ev.key === "Enter") {
      ev.preventDefault();
      this._runItem(items[this._menuIndex]);
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      // Escape clears the filter first, then closes.
      if (this._menuFilter) {
        this._menuFilter = "";
      } else {
        this._closeMenu(true);
      }
    } else if (
      ev.key.length === 1 &&
      !ev.ctrlKey &&
      !ev.metaKey &&
      !ev.altKey &&
      !(this._menuSearch && ev.composedPath().includes(this._menuSearch))
    ) {
      // A letter runs its tool when the search is not what is being typed in.
      const letter = ev.key.toLowerCase();
      const item = this._menuItems(false).find(
        (entry) => entry.letter === letter
      );
      if (item) {
        ev.preventDefault();
        this._runItem(item);
      }
    }
    ev.stopPropagation();
  }

  // The backdrop behind the phone sheet closes it when it is tapped.
  private _backdropClicked(ev: MouseEvent) {
    if (this._menuPhone && ev.target === this._menu) {
      this._closeMenu();
    }
  }

  private _dragFrom?: number;

  private _sheetDragStart(ev: PointerEvent) {
    this._dragFrom = ev.clientY;
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  }

  private _sheetDragMove(ev: PointerEvent) {
    if (this._dragFrom !== undefined) {
      this._sheetOffset = Math.max(0, ev.clientY - this._dragFrom);
    }
  }

  // A swipe down on the sheet's top closes it; a short one lets it go back.
  private _sheetDragEnd() {
    if (this._dragFrom === undefined) {
      return;
    }
    this._dragFrom = undefined;
    if (this._sheetOffset > SWIPE_CLOSE_PX) {
      this._closeMenu();
    }
    this._sheetOffset = 0;
  }

  private _closeMenuClicked() {
    this._closeMenu();
  }

  private _menuFilterChanged(ev: Event) {
    this._menuFilter = (ev.target as HaInputSearch).value ?? "";
    this._menuIndex = 0;
  }

  private _menuItemClicked(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { itemId: string }).itemId;
    this._runItem(this._menuItems().find((item) => item.id === id));
  }

  private _pointerDown = (ev: PointerEvent) => {
    // The finger that opened the menu by a hold is still down.
    if (this._holdOpened) {
      return;
    }
    if (this._menuChain && !this._isOwn(ev.composedPath())) {
      this._closeMenu();
    }
  };

  private _announce(text: string) {
    this._announcement = "";
    requestAnimationFrame(() => {
      this._announcement = text;
    });
  }

  // ---- Editor ----

  private async _edit(
    chain: HTMLElement[],
    index: number,
    scope: AppearanceScope
  ) {
    this._moveNear(chain);
    await this.updateComplete;
    this._editor?.show(chain, index, scope);
  }

  /** Opens the editor for an element, as the menu's first entry does. */
  public editElement(element: HTMLElement) {
    const chain = this._chainFrom(element);
    if (chain.length) {
      this._edit(chain, this._defaultIndex(chain), "element");
    }
  }

  private _keydown = (ev: KeyboardEvent) => {
    if (this._picking && ev.key === "Escape") {
      ev.preventDefault();
      ev.stopPropagation();
      this._stopPicking();
      return;
    }
    if (this._isOwn(ev.composedPath())) {
      return;
    }
    if (matchesShortcut(ev, SHORTCUTS.edit)) {
      ev.preventDefault();
      ev.stopPropagation();
      const active = this._deepActiveElement();
      if (active) {
        this.editElement(active);
      } else {
        this.startPicking();
      }
      return;
    }
    // The menu key and Shift+F10 open the menu for the focused element.
    if (ev.key === "ContextMenu" || (ev.key === "F10" && ev.shiftKey)) {
      if (inTabStrip(ev.composedPath())) {
        return;
      }
      const active = this._deepActiveElement();
      if (
        !active ||
        active.isContentEditable ||
        active.localName === "textarea" ||
        active.localName === "input"
      ) {
        return;
      }
      ev.preventDefault();
      ev.stopPropagation();
      const chain = this._chainFrom(active);
      const rect = active.getBoundingClientRect();
      if (chain.length) {
        this._openMenu(
          chain,
          { x: rect.left + 12, y: rect.bottom },
          "keyboard"
        );
      }
    }
  };

  // ---- Pick tool ----

  /** Starts the pick tool: the next element selected opens the editor. */
  public async startPicking() {
    if (this._picking) {
      return;
    }
    this._closeMenu();
    this._editor?.close();
    this._home ??= this.parentNode ?? undefined;
    if (this._home && this.parentNode !== this._home) {
      this._home.appendChild(this);
    }
    this._picking = true;
    this._pickOutline = { display: "none" };
    window.addEventListener("pointermove", this._pickMove, true);
    window.addEventListener("click", this._pickClick, true);
    await this.updateComplete;
    [this._pickBox, this._banner].forEach((box) => {
      if (box && !box.matches(":popover-open")) {
        box.showPopover();
      }
    });
  }

  private _stopPicking() {
    if (!this._picking) {
      return;
    }
    this._picking = false;
    this._pickCandidate = undefined;
    window.removeEventListener("pointermove", this._pickMove, true);
    window.removeEventListener("click", this._pickClick, true);
    [this._pickBox, this._banner].forEach((box) => {
      if (box?.matches(":popover-open")) {
        box.hidePopover();
      }
    });
  }

  private _pickMove = (ev: PointerEvent) => {
    const path = ev.composedPath();
    if (this._isOwn(path)) {
      return;
    }
    const chain = this._chainFrom(
      path.find((node): node is Element => node instanceof Element)
    );
    if (!chain.length) {
      return;
    }
    const element = chain[this._defaultIndex(chain)];
    this._pickCandidate = chain;
    const rect = element.getBoundingClientRect();
    this._pickName = kindLabel(element.localName);
    this._pickOutline = {
      left: `${rect.left - 2}px`,
      top: `${rect.top - 2}px`,
      width: `${rect.width + 4}px`,
      height: `${rect.height + 4}px`,
    };
  };

  private _pickClick = (ev: MouseEvent) => {
    if (this._isOwn(ev.composedPath())) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const chain =
      this._pickCandidate ??
      this._chainFrom(
        ev
          .composedPath()
          .find((node): node is Element => node instanceof Element)
      );
    this._stopPicking();
    if (chain.length) {
      this._edit(chain, this._defaultIndex(chain), "element");
    }
  };

  private _cancelPicking() {
    this._stopPicking();
  }

  protected render(): TemplateResult {
    const items = this._menuChain ? this._menuItems() : [];
    const phone = this._menuPhone;
    const element = this._menuElement;
    return html`
      <div
        id="menu"
        class=${classMap({ phone, expanded: phone && !!this._menuFilter })}
        popover="manual"
        role="dialog"
        tabindex="-1"
        aria-label=${this._l("menu_title")}
        style=${styleMap(this._menuPosition)}
        @keydown=${this._menuKeydown}
        @click=${this._backdropClicked}
      >
        ${
          this._menuChain
            ? html`
                <div
                  class="body"
                  style=${styleMap(
                    this._sheetOffset
                      ? { transform: `translateY(${this._sheetOffset}px)` }
                      : {}
                  )}
                >
                  ${
                    phone && element
                      ? html`
                          <div
                            class="grab"
                            @pointerdown=${this._sheetDragStart}
                            @pointermove=${this._sheetDragMove}
                            @pointerup=${this._sheetDragEnd}
                            @pointercancel=${this._sheetDragEnd}
                          >
                            <span class="handle" aria-hidden="true"></span>
                            <div class="sheet-head">
                              <div class="sheet-title">
                                <span class="sheet-name"
                                  >${kindLabel(element.localName)}</span
                                >
                                ${
                                  document.title
                                    ? html`<span class="note"
                                        >${this._l("sheet_subtitle", {
                                          page: document.title,
                                        })}</span
                                      >`
                                    : nothing
                                }
                              </div>
                              <button
                                class="sheet-close"
                                aria-label=${this._l("menu_close")}
                                @click=${this._closeMenuClicked}
                              >
                                <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
                              </button>
                            </div>
                          </div>
                        `
                      : nothing
                  }
                  <ha-input-search
                    appearance="outlined"
                    .value=${this._menuFilter}
                    .placeholder=${this._l("menu_filter")}
                    .accessibleLabel=${this._l("menu_filter")}
                    @input=${this._menuFilterChanged}
                  ></ha-input-search>
                  <div class="items" role="menu">
                    ${
                      items.length
                        ? items.map(
                            (item, index) => html`
                              <button
                                role="menuitem"
                                class=${index === this._menuIndex ? "active" : ""}
                                .itemId=${item.id}
                                @click=${this._menuItemClicked}
                              >
                                <ha-svg-icon .path=${item.icon}></ha-svg-icon>
                                <span class="item-label">${item.label}</span>
                                ${
                                  item.letter
                                    ? html`<kbd title=${item.shortcut ?? ""}
                                        >${item.letter.toUpperCase()}</kbd
                                      >`
                                    : nothing
                                }
                              </button>
                            `
                          )
                        : html`<p class="note">${this._l("menu_empty")}</p>`
                    }
                  </div>
                  <p class="note">${this._l("menu_note")}</p>
                </div>
              `
            : nothing
        }
      </div>
      <div
        id="target"
        popover="manual"
        aria-hidden="true"
        style=${styleMap(this._targetStyle)}
      ></div>
      <div
        id="ring"
        popover="manual"
        aria-hidden="true"
        style=${styleMap(this._ringStyle)}
      >
        <svg viewBox="0 0 56 56">
          <circle class="track" cx="28" cy="28" r="24"></circle>
          <circle class="fill" cx="28" cy="28" r="24"></circle>
        </svg>
      </div>
      <div id="hold" popover="manual">
        <ha-svg-icon .path=${mdiGestureTapHold}></ha-svg-icon>
        <span>${this._l("hold_hint")}</span>
      </div>
      <div
        id="pick"
        popover="manual"
        aria-hidden="true"
        style=${styleMap(this._pickOutline)}
      >
        <span class="pick-name">${this._pickName}</span>
      </div>
      <div id="banner" popover="manual" role="status">
        <ha-svg-icon .path=${mdiFormatPaint}></ha-svg-icon>
        <span>${this._l("pick_hint")}</span>
        <button @click=${this._cancelPicking}>${this._l("pick_cancel")}</button>
      </div>
      <ha-appearance-editor></ha-appearance-editor>
      <div class="live" role="status" aria-live="polite">
        ${this._announcement}
      </div>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      width: 0;
      height: 0;
      font-family: var(--ha-font-family-body);
    }
    [popover] {
      border: none;
      margin: 0;
      inset: auto;
    }
    #menu {
      position: fixed;
      width: 320px;
      max-width: calc(100vw - 16px);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      overflow: visible;
      box-sizing: border-box;
    }
    #menu:popover-open {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #menu:focus {
      outline: none;
    }
    #menu:not(.phone) .body {
      display: contents;
    }
    #menu ha-input-search {
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    #menu.phone {
      max-width: none;
      padding: 0;
      border-radius: 0;
      background: rgba(0, 0, 0, 0.32);
      box-shadow: none;
      overflow: hidden;
    }
    #menu.phone:popover-open {
      justify-content: flex-end;
      gap: 0;
    }
    .phone .body {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      box-sizing: border-box;
      max-height: 100%;
      padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4);
      border-radius: var(--ha-border-radius-4xl) var(--ha-border-radius-4xl) 0 0;
      background: var(--card-background-color);
    }
    .phone.expanded .body {
      height: 100%;
      border-radius: 0;
    }
    .phone kbd {
      display: none;
    }
    .grab {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      touch-action: none;
    }
    .handle {
      align-self: center;
      width: 32px;
      height: 4px;
      border-radius: 2px;
      background: var(--divider-color);
    }
    .sheet-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .sheet-title {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .sheet-name {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .sheet-title .note {
      padding: 0;
    }
    .sheet-close {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-circle);
      --mdc-icon-size: 20px;
    }
    .sheet-close:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .sheet-close:focus-visible {
      outline: 2px solid var(--primary-color);
    }
    #target {
      position: fixed;
      box-sizing: border-box;
      padding: 0;
      border: 3px solid var(--primary-color);
      border-radius: var(--ha-border-radius-lg);
      background: none;
      pointer-events: none;
      overflow: visible;
    }
    #ring {
      position: fixed;
      width: 56px;
      height: 56px;
      padding: 0;
      background: none;
      pointer-events: none;
      overflow: visible;
    }
    #ring svg {
      width: 100%;
      height: 100%;
      transform: rotate(-90deg);
    }
    #ring circle {
      fill: none;
      stroke-width: 4;
    }
    #ring .track {
      stroke: color-mix(in srgb, var(--primary-color) 24%, transparent);
    }
    #ring .fill {
      stroke: var(--primary-color);
      stroke-linecap: round;
      stroke-dasharray: 151;
      stroke-dashoffset: 151;
      animation: ring-fill 450ms linear forwards;
    }
    @keyframes ring-fill {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      #ring .fill {
        animation: none;
        stroke-dashoffset: 0;
      }
    }
    #hold {
      position: fixed;
      left: 50%;
      bottom: var(--ha-space-6);
      transform: translateX(-50%);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-text-color);
      color: var(--card-background-color);
      pointer-events: none;
      --mdc-icon-size: 20px;
    }
    #hold:popover-open {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .items {
      display: flex;
      flex-direction: column;
      min-height: 0;
      overflow-y: auto;
    }
    /* Rows of a scrolling column keep their height instead of being squeezed. */
    .items > * {
      flex-shrink: 0;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
    }
    .items button {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: var(--ha-space-12);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      text-align: start;
      --mdc-icon-size: 20px;
    }
    .items button.active,
    .items button:hover {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .items button:focus-visible,
    #banner button:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: -2px;
    }
    .item-label {
      flex: 1;
    }
    kbd {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-sm);
      border: 1px solid var(--outline-color);
      font: inherit;
      font-size: var(--ha-font-size-xs);
      white-space: nowrap;
    }
    .note {
      margin: 0;
      padding: 0 var(--ha-space-3);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    #pick {
      position: fixed;
      box-sizing: border-box;
      padding: 0;
      border: 2px dashed var(--primary-color);
      border-radius: var(--ha-border-radius-lg);
      background: color-mix(in srgb, var(--primary-color) 10%, transparent);
      pointer-events: none;
      overflow: visible;
    }
    .pick-name {
      position: absolute;
      left: 0;
      top: -26px;
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-sm);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: var(--ha-font-size-xs);
      white-space: nowrap;
    }
    #banner {
      position: fixed;
      left: 50%;
      bottom: var(--ha-space-6);
      transform: translateX(-50%);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-text-color);
      color: var(--card-background-color);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.24);
      --mdc-icon-size: 20px;
    }
    #banner:popover-open {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    #banner button {
      padding: var(--ha-space-1) var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid currentColor;
    }
    .live {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-appearance-tools": HaAppearanceTools;
  }
}
