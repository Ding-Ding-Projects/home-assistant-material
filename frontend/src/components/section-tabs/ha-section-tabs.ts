import {
  mdiArrowDown,
  mdiArrowUp,
  mdiDotsHorizontal,
  mdiEye,
  mdiEyeOff,
  mdiPin,
  mdiPinOff,
  mdiTabPlus,
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
import { storage } from "../../common/decorators/storage";
import { isNavigationClick } from "../../common/dom/is-navigation-click";
import { navigate } from "../../common/navigate";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../../common/translations/localize";
import "../ha-svg-icon";
import "../ha-tab";
import type {
  SectionMove,
  SectionTabsState,
  SectionTabsStore,
} from "./section-tabs-model";
import {
  dropSection,
  hiddenSections,
  hideSection,
  moveSection,
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
  visibleSections,
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
 * Shift and H hide it.
 *
 * Seams for the groups, shared context menu, tab appearance and locks: each
 * tab is rendered by `_renderTab`, and the per-tab actions all go through the
 * `_apply*` methods, so a menu can call them; the overflow list is
 * `_renderMore`.
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

  @internalState()
  @storage({ key: SECTION_TABS_STORAGE_KEY, state: true, subscribe: true })
  private _store: SectionTabsStore = {};

  /** Paths that fit in the wide row; undefined until measured. */
  @internalState() private _fit?: string[];

  /** The width of the bottom bar, for the phone. */
  @internalState() private _barWidth = 0;

  @internalState() private _focusPath?: string;

  @internalState() private _dragging?: string;

  @internalState() private _dropMark?: { path: string; after: boolean };

  @internalState() private _announcement = "";

  @query(".more-popover") private _popover?: HTMLElement;

  private _widths = new Map<string, number>();

  private _observer?: ResizeObserver;

  protected createRenderRoot(): HTMLElement {
    return this;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (typeof ResizeObserver !== "undefined") {
      this._observer = new ResizeObserver(() => this._measure());
      this._observer.observe(this);
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._observer?.disconnect();
    this._observer = undefined;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.localize(key as LocalizeKeys, values);
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
    return this.tabs.find((tab) => tab.path === path)?.label ?? path;
  }

  /** The tabs the row can show, in order, and which of them fit. */
  private _row(): {
    shown: SectionTabItem[];
    inRow: SectionTabItem[];
    overflowed: SectionTabItem[];
    hidden: SectionTabItem[];
    ordered: SectionTabItem[];
  } {
    const state = this._state();
    const ordered = orderSections(this.tabs, state);
    const shown = visibleSections(ordered, state, this.activePath);
    const hidden = hiddenSections(ordered, state, this.activePath);
    let fits: boolean[] | undefined;
    if (this.narrow) {
      if (this._barWidth > 0) {
        fits = planSlots(
          shown.map(
            (tab) =>
              state.pinned.includes(tab.path) || tab.path === this.activePath
          ),
          slotsForWidth(this._barWidth)
        );
      }
    } else if (this._fit) {
      const fit = this._fit;
      fits = shown.map(
        (tab) => fit.includes(tab.path) || tab.path === this.activePath
      );
    }
    const inRow = fits ? shown.filter((_, index) => fits![index]) : shown;
    const overflowed = shown.filter((tab) => !inRow.includes(tab));
    return { shown, inRow, overflowed, hidden, ordered };
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
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    this._measure();
  }

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
    const anchors = Array.from(
      this.querySelectorAll<HTMLAnchorElement>("a.section-tab:not([hidden])")
    );
    anchors.forEach((anchor) => {
      const path = anchor.dataset.path;
      if (path) {
        this._widths.set(path, anchor.getBoundingClientRect().width);
      }
    });
    const { shown } = this._row();
    const known = shown.every((tab) => this._widths.has(tab.path));
    if (!known) {
      // A tab that was never shown cannot be measured: show everything once.
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
      shown.map((tab) => this._widths.get(tab.path)!),
      shown.map(
        (tab) => state.pinned.includes(tab.path) || tab.path === this.activePath
      ),
      available,
      0,
      gap
    );
    const fit = shown.filter((_, index) => plan[index]).map((tab) => tab.path);
    const same =
      this._fit &&
      this._fit.length === fit.length &&
      this._fit.every((path, index) => path === fit[index]);
    if (!same) {
      this._fit = fit;
    }
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.localize || this.tabs.length === 0) {
      return nothing;
    }
    const state = this._state();
    const { shown, inRow, overflowed, hidden, ordered } = this._row();
    const showMore = !this.narrow || overflowed.length > 0 || hidden.length > 0;
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
          aria-label=${this._t("ui.components.section_tabs.label")}
          @keydown=${this._keydown}
          @focusin=${this._focusIn}
        >
          ${repeat(
            shown,
            (tab) => tab.path,
            (tab) =>
              this._renderTab(
                tab,
                state.pinned.includes(tab.path),
                tab.path === rovingPath,
                hiddenByFit.has(tab.path)
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
                    ? this._t("ui.components.section_tabs.more_count", {
                        count: overflowed.length,
                      })
                    : this._t("ui.components.section_tabs.more")
                }
                title=${this._t("ui.components.section_tabs.more")}
              >
                <ha-svg-icon .path=${mdiDotsHorizontal}></ha-svg-icon>
                ${
                  this.narrow
                    ? html`<span class="more-label"
                        >${this._t("ui.components.section_tabs.more")}</span
                      >`
                    : nothing
                }
              </button>`
            : nothing
        }
        ${this._renderMore(overflowed, hidden, ordered)}
        <div class="visually-hidden" role="status" aria-live="polite">
          ${this._announcement}
        </div>
      </div>
    `;
  }

  private _renderTab(
    tab: SectionTabItem,
    pinned: boolean,
    roving: boolean,
    outOfRow: boolean
  ): TemplateResult {
    const selected = tab.path === this.activePath;
    return html`
      <a
        class=${classMap({
          "section-tab": true,
          pinned,
          dragging: this._dragging === tab.path,
          "drop-before":
            this._dropMark?.path === tab.path && !this._dropMark.after,
          "drop-after":
            this._dropMark?.path === tab.path && this._dropMark.after,
        })}
        id=${sectionTabDomId(tab.path)}
        role="tab"
        href=${tab.path}
        data-path=${tab.path}
        ?hidden=${outOfRow}
        aria-selected=${selected ? "true" : "false"}
        aria-controls=${SECTION_TAB_PANEL_ID}
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
          .name=${tab.label}
        >
          ${
            tab.iconPath
              ? html`<ha-svg-icon
                  slot="icon"
                  .path=${tab.iconPath}
                ></ha-svg-icon>`
              : nothing
          }
        </ha-tab>
        ${
          pinned
            ? html`<ha-svg-icon class="pin-mark" .path=${mdiPin}></ha-svg-icon
                ><span class="visually-hidden"
                  >${this._t("ui.components.section_tabs.pinned")}</span
                >`
            : nothing
        }
      </a>
    `;
  }

  /** The overflow list: tabs out of view, hidden tabs, and the arranging. */
  private _renderMore(
    overflowed: SectionTabItem[],
    hidden: SectionTabItem[],
    ordered: SectionTabItem[]
  ): TemplateResult {
    const state = this._state();
    const title = this._t("ui.components.section_tabs.more");
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
                  ${this._t("ui.components.section_tabs.open_every_tab")}
                </button>`
              : nothing
          }
        </div>
        ${
          overflowed.length
            ? html`<h3>${this._t("ui.components.section_tabs.out_of_view")}</h3>
                <ul>
                  ${overflowed.map(
                    (tab) =>
                      html`<li>
                        <a
                          class="more-link"
                          href=${tab.path}
                          aria-current=${
                            tab.path === this.activePath ? "page" : "false"
                          }
                          @click=${this._moreLinkClicked}
                          >${tab.label}</a
                        >
                      </li>`
                  )}
                </ul>`
            : nothing
        }
        ${
          hidden.length
            ? html`<h3>
                  ${this._t("ui.components.section_tabs.hidden_title")}
                </h3>
                <ul>
                  ${hidden.map(
                    (tab) =>
                      html`<li class="arrange-row">
                        <span class="arrange-name">${tab.label}</span>
                        <button
                          class="row-button"
                          aria-label=${this._t(
                            "ui.components.section_tabs.show",
                            {
                              name: tab.label,
                            }
                          )}
                          title=${this._t("ui.components.section_tabs.show", {
                            name: tab.label,
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
        <h3>${this._t("ui.components.section_tabs.arrange")}</h3>
        <p class="hint">
          ${this._t("ui.components.section_tabs.arrange_hint")}
        </p>
        <ul>
          ${ordered
            .filter((tab) => !state.hidden.includes(tab.path))
            .map((tab) => {
              const pinned = state.pinned.includes(tab.path);
              const pinLabel = this._t(
                pinned
                  ? "ui.components.section_tabs.unpin"
                  : "ui.components.section_tabs.pin",
                { name: tab.label }
              );
              const hideLabel = this._t("ui.components.section_tabs.hide", {
                name: tab.label,
              });
              return html`<li class="arrange-row">
                <span class="arrange-name">${tab.label}</span>
                <button
                  class="row-button"
                  aria-pressed=${pinned ? "true" : "false"}
                  aria-label=${pinLabel}
                  title=${pinLabel}
                  .path=${tab.path}
                  @click=${this._rowPin}
                >
                  <ha-svg-icon
                    .path=${pinned ? mdiPinOff : mdiPin}
                  ></ha-svg-icon>
                </button>
                <button
                  class="row-button"
                  aria-label=${this._t(
                    "ui.components.section_tabs.move_earlier",
                    { name: tab.label }
                  )}
                  title=${this._t("ui.components.section_tabs.move_earlier", {
                    name: tab.label,
                  })}
                  .path=${tab.path}
                  @click=${this._rowEarlier}
                >
                  <ha-svg-icon .path=${mdiArrowUp}></ha-svg-icon>
                </button>
                <button
                  class="row-button"
                  aria-label=${this._t(
                    "ui.components.section_tabs.move_later",
                    {
                      name: tab.label,
                    }
                  )}
                  title=${this._t("ui.components.section_tabs.move_later", {
                    name: tab.label,
                  })}
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

  // ---- Actions. A shared menu can call these for any tab. ----

  private _announce(message: string): void {
    // A message equal to the last one is only read out again if it changes
    // in between.
    this._announcement = "";
    this.updateComplete.then(() => {
      this._announcement = message;
    });
  }

  protected _applyMove(path: string, move: SectionMove): void {
    const result = moveSection(this._allPaths(), this._state(), path, move);
    if (result.blocked) {
      this._announce(
        this._t("ui.components.section_tabs.move_blocked", {
          name: this._label(path),
        })
      );
      return;
    }
    if (!result.moved) {
      return;
    }
    this._save(result.state);
    const { shown } = this._rowFor(result.state);
    this._announce(
      this._t("ui.components.section_tabs.moved", {
        name: this._label(path),
        position: shown.findIndex((tab) => tab.path === path) + 1,
        total: shown.length,
      })
    );
    this._focusTab(path);
  }

  protected _applyPin(path: string): void {
    const state = this._state();
    const wasPinned = state.pinned.includes(path);
    this._save(togglePinned(this._allPaths(), state, path));
    this._announce(
      this._t(
        wasPinned
          ? "ui.components.section_tabs.unpinned"
          : "ui.components.section_tabs.pinned_done",
        { name: this._label(path) }
      )
    );
    this._focusTab(path);
  }

  protected _applyHide(path: string): void {
    const result = hideSection(this._state(), path, this.activePath);
    if (!result.hidden) {
      if (path === this.activePath) {
        this._announce(
          this._t("ui.components.section_tabs.hide_blocked", {
            name: this._label(path),
          })
        );
      }
      return;
    }
    this._save(result.state);
    this._announce(
      this._t("ui.components.section_tabs.hidden_done", {
        name: this._label(path),
      })
    );
  }

  protected _applyShowEvery(): void {
    this._save(showEverySection(this._state()));
    this._announce(this._t("ui.components.section_tabs.shown_all"));
  }

  private _rowFor(state: SectionTabsState) {
    const ordered = orderSections(this.tabs, state);
    return { shown: visibleSections(ordered, state, this.activePath) };
  }

  private _focusTab(path: string): void {
    this._focusPath = path;
    this.updateComplete.then(() => {
      Array.from(this.querySelectorAll<HTMLAnchorElement>("a.section-tab"))
        .find((anchor) => anchor.dataset.path === path)
        ?.focus();
    });
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

  private _showOne(ev: Event): void {
    const path = this._pathOf(ev);
    if (path) {
      this._save(showSection(this._state(), path));
      this._announce(
        this._t("ui.components.section_tabs.shown", {
          name: this._label(path),
        })
      );
    }
  }

  private _showEvery(): void {
    this._applyShowEvery();
  }

  private _focusIn(ev: FocusEvent): void {
    const anchor = (ev.target as HTMLElement).closest<HTMLAnchorElement>(
      "a.section-tab"
    );
    if (anchor?.dataset.path) {
      this._focusPath = anchor.dataset.path;
    }
  }

  private _keydown(ev: KeyboardEvent): void {
    const anchor = (ev.target as HTMLElement).closest<HTMLAnchorElement>(
      "a.section-tab"
    );
    const path = anchor?.dataset.path;
    if (!anchor || !path) {
      return;
    }
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
    if (ev.altKey || ev.ctrlKey || ev.metaKey) {
      return;
    }
    if (ev.key === " ") {
      // A link opens on Enter by itself; Space is added so it works as a tab.
      ev.preventDefault();
      anchor.click();
      return;
    }
    const anchors = Array.from(
      this.querySelectorAll<HTMLAnchorElement>("a.section-tab:not([hidden])")
    );
    const target = nextTabIndex(
      ev.key,
      anchors.indexOf(anchor),
      anchors.length,
      getComputedStyle(this).direction === "rtl"
    );
    if (target === undefined) {
      return;
    }
    ev.preventDefault();
    anchors[target].focus();
  }

  private async _tabClicked(ev: MouseEvent): Promise<void> {
    const href = isNavigationClick(ev);
    if (!href) {
      return;
    }
    await navigate(href, { replace: true });
  }

  private async _moreLinkClicked(ev: MouseEvent): Promise<void> {
    const href = isNavigationClick(ev);
    this._popover?.hidePopover?.();
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
    if (more && this._popover) {
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
    const result = dropSection(
      this._allPaths(),
      this._state(),
      from,
      mark.path,
      mark.after
    );
    if (result.blocked) {
      this._announce(
        this._t("ui.components.section_tabs.move_blocked", {
          name: this._label(from),
        })
      );
      return;
    }
    if (result.moved) {
      this._save(result.state);
      const { shown } = this._rowFor(result.state);
      this._announce(
        this._t("ui.components.section_tabs.moved", {
          name: this._label(from),
          position: shown.findIndex((tab) => tab.path === from) + 1,
          total: shown.length,
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
    color: inherit;
    text-decoration: none;
  }
  ha-section-tabs .section-tab[hidden] {
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
  ha-section-tabs .section-tab.dragging {
    opacity: 0.5;
  }
  ha-section-tabs .section-tab.drop-before {
    box-shadow: inset 2px 0 0 var(--primary-color);
  }
  ha-section-tabs .section-tab.drop-after {
    box-shadow: inset -2px 0 0 var(--primary-color);
  }
  ha-section-tabs .pin-mark {
    position: absolute;
    top: var(--ha-space-1);
    inset-inline-end: var(--ha-space-1);
    --mdc-icon-size: 12px;
    width: 12px;
    height: 12px;
    color: var(--secondary-text-color);
    pointer-events: none;
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
