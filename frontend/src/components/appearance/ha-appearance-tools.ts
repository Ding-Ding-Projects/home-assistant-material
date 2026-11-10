import type { ContextType } from "@lit/context";
import {
  mdiContentCopy,
  mdiExportVariant,
  mdiFormatPaint,
  mdiHistory,
  mdiLock,
  mdiMagnify,
  mdiPaletteSwatch,
  mdiRestore,
  mdiVolumeHigh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
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
  isAKind,
  isEmptyAppearance,
  kindLabel,
} from "../../common/appearance/element-appearance";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import { searchMatcher } from "../../common/regex/filter";
import type { LocalizeKeys } from "../../common/translations/localize";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { internationalizationContext } from "../../data/context";
import { showQuickBar } from "../../dialogs/quick-bar/show-dialog-quick-bar";
import { isMac } from "../../util/is_mac";
import "../ha-svg-icon";
import "../input/ha-input-search";
import type { HaInputSearch } from "../input/ha-input-search";
import type { PageTool } from "../page/ha-page-tools";
import "./ha-appearance-editor";
import type { HaAppearanceEditor } from "./ha-appearance-editor";

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
const PAGE_LAYOUTS = new Set(["hass-subpage", "hass-tabs-subpage"]);

const INTERACTIVE = new Set(["button", "a", "input", "select", "textarea"]);

interface MenuItem {
  id: string;
  icon: string;
  label: string;
  shortcut?: string;
  run: () => void;
}

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

  @state() private _menuChain?: HTMLElement[];

  @state() private _menuPosition: Record<string, string> = {};

  @state() private _menuFilter = "";

  @state() private _menuIndex = 0;

  @state() private _picking = false;

  @state() private _pickOutline: Record<string, string> = { display: "none" };

  @state() private _pickName = "";

  @state() private _announcement = "";

  @query("#menu") private _menu?: HTMLElement;

  @query("#pick") private _pickBox?: HTMLElement;

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
    window.addEventListener("keydown", this._keydown, true);
    window.addEventListener("pointerdown", this._pointerDown, true);
    window.addEventListener("location-changed", this._scheduleScan);
    window.addEventListener("popstate", this._scheduleScan);
    window.addEventListener("click", this._scheduleScan, true);
    window.addEventListener("keyup", this._scheduleScan, true);
    this._interval = window.setInterval(() => {
      if (document.visibilityState === "visible" && hasAppearanceChoices()) {
        reapplyAppearance();
      }
    }, 2500);
    this._scheduleScan();
  }

  private _listening = false;

  /** Removes every listener. Moving between dialogs does not call this. */
  public stop() {
    this._listening = false;
    window.removeEventListener("contextmenu", this._contextMenu, true);
    window.removeEventListener("keydown", this._keydown, true);
    window.removeEventListener("pointerdown", this._pointerDown, true);
    window.removeEventListener("location-changed", this._scheduleScan);
    window.removeEventListener("popstate", this._scheduleScan);
    window.removeEventListener("click", this._scheduleScan, true);
    window.removeEventListener("keyup", this._scheduleScan, true);
    window.clearInterval(this._interval);
    window.clearTimeout(this._scanTimer);
    this._stopPicking();
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
    if (!hasAppearanceChoices()) {
      return;
    }
    window.clearTimeout(this._scanTimer);
    this._scanTimer = window.setTimeout(() => {
      reapplyAppearance();
      this._scanTimer = window.setTimeout(reapplyAppearance, 1000);
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
    if (this._isOwn(path)) {
      return;
    }
    const target = path.find(
      (node): node is Element => node instanceof Element
    );
    const fromPointer = ev.button === 2;
    // Shift with a right-click asks for the browser's menu. Text fields
    // keep theirs: it has paste and spelling.
    if (
      (fromPointer && ev.shiftKey) ||
      (target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.localName === "textarea" ||
          (target.localName === "input" &&
            !["checkbox", "radio", "range", "button", "color"].includes(
              (target as HTMLInputElement).type
            ))))
    ) {
      return;
    }
    const chain = this._chainFrom(target);
    if (!chain.length) {
      return;
    }
    ev.preventDefault();
    const rect = chain[0].getBoundingClientRect();
    this._openMenu(
      chain,
      fromPointer || ev.clientX || ev.clientY
        ? { x: ev.clientX, y: ev.clientY }
        : { x: rect.left + 12, y: rect.bottom }
    );
  };

  private async _openMenu(
    chain: HTMLElement[],
    point: { x: number; y: number }
  ) {
    this._moveNear(chain);
    this._menuChain = chain;
    this._menuFilter = "";
    this._menuIndex = 0;
    const width = 320;
    const height = 420;
    this._menuPosition = {
      left: `${Math.max(8, Math.min(point.x, window.innerWidth - width - 8))}px`,
      top: `${Math.max(8, Math.min(point.y, window.innerHeight - height - 8))}px`,
    };
    await this.updateComplete;
    if (this._menu && !this._menu.matches(":popover-open")) {
      this._menu.showPopover();
    }
    await this._menuSearch?.updateComplete;
    this._menuSearch?.focus();
  }

  private _closeMenu() {
    if (this._menu?.matches(":popover-open")) {
      this._menu.hidePopover();
    }
    this._menuChain = undefined;
  }

  private _menuItems(): MenuItem[] {
    const chain = this._menuChain;
    if (!chain?.length) {
      return [];
    }
    const index = this._defaultIndex(chain);
    const element = chain[index];
    const kind = kindLabel(element.localName);
    const items: MenuItem[] = [
      {
        id: "edit",
        icon: mdiFormatPaint,
        label: this._l("menu_edit"),
        shortcut: shortcutLabel(SHORTCUTS.edit),
        run: () => this._edit(chain, index, "element"),
      },
    ];
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
        run: () =>
          readAloud(
            collectReadableText(element),
            this._i18n?.locale?.language ?? navigator.language,
            () => undefined
          ),
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
    const matches = searchMatcher(this._menuFilter);
    return items.filter((item) => matches(item.label));
  }

  private _runItem(item: MenuItem | undefined) {
    if (!item) {
      return;
    }
    this._closeMenu();
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
        this._closeMenu();
      }
    }
    ev.stopPropagation();
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
        this._openMenu(chain, { x: rect.left + 12, y: rect.bottom });
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
    return html`
      <div
        id="menu"
        popover="manual"
        role="dialog"
        aria-label=${this._l("menu_title")}
        style=${styleMap(this._menuPosition)}
        @keydown=${this._menuKeydown}
      >
        ${
          this._menuChain
            ? html`
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
                                item.shortcut
                                  ? html`<kbd>${item.shortcut}</kbd>`
                                  : nothing
                              }
                            </button>
                          `
                        )
                      : html`<p class="note">${this._l("menu_empty")}</p>`
                  }
                </div>
                <p class="note">${this._l("menu_note")}</p>
              `
            : nothing
        }
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
    }
    #menu:popover-open {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    #menu ha-input-search {
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
    }
    .items {
      display: flex;
      flex-direction: column;
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
