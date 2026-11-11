import { ResizeController } from "@lit-labs/observers/resize-controller";
import type { ContextType } from "@lit/context";
import { mdiChevronLeft, mdiChevronRight } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../common/decorators/consume";
import { fireEvent } from "../../common/dom/fire_event";
import {
  safeGetStored,
  safeSetStored,
} from "../../common/preferences/safe-storage";
import { internationalizationContext } from "../../data/context";
import "../ha-svg-icon";
import "./ha-split-divider";
import type { SplitDividerMoveDetail } from "./ha-split-divider";
import type { SplitCollapsed } from "./split-panels-logic";
import {
  clampSize,
  maxStartSize,
  parseStoredState,
  shouldStack,
} from "./split-panels-logic";

/** The width the divider column takes, in pixels. Matches the style below. */
const DIVIDER_WIDTH = 12;

const STORAGE_PREFIX = "ha-split-panels:";

export interface SplitPanelsChangedDetail {
  size: number;
  collapsed: SplitCollapsed;
}

/**
 * Two sides with a movable divider between them. The start side has a size in
 * pixels that the person can change; the end side takes the rest.
 *
 * - The divider is a keyboard and pointer control, see `ha-split-divider`.
 * - Either side can be folded away with a button on the divider; the other
 *   side then fills the width.
 * - The size and the folded side are remembered in this browser for each
 *   `storage-key`. A stored value that does not make sense is ignored.
 * - When the container is narrower than `stack-below`, the sides stack, one
 *   above the other, with no divider.
 *
 * @slot start - The first side.
 * @slot end - The second side.
 * @fires split-panels-changed - `{ size, collapsed }`, once a change settles.
 */
@customElement("ha-split-panels")
export class HaSplitPanels extends LitElement {
  /** Where the size and the folded side are remembered. Empty: not remembered. */
  @property({ attribute: "storage-key" }) public storageKey = "";

  /** Width of the start side to begin with, and after a reset. */
  @property({ type: Number, attribute: "default-size" })
  public defaultSize = 320;

  @property({ type: Number, attribute: "min-start" }) public minStart = 200;

  @property({ type: Number, attribute: "min-end" }) public minEnd = 240;

  /** Container width, in pixels, under which the sides stack. */
  @property({ type: Number, attribute: "stack-below" })
  public stackBelow = 720;

  /** Which side is folded away. */
  @property({ reflect: true }) public collapsed: SplitCollapsed = "";

  /** Names used in the labels of the divider and its buttons. */
  @property({ attribute: "start-label" }) public startLabel?: string;

  @property({ attribute: "end-label" }) public endLabel?: string;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _size?: number;

  @state() private _announcement = "";

  private _widthController = new ResizeController(this, {
    callback: (entries) => entries[0]?.contentRect.width ?? 0,
  });

  @query(".layout") private _layout?: HTMLElement;

  private _loadedKey?: string;

  private get _width(): number {
    return this._widthController.value ?? 0;
  }

  private get _stacked(): boolean {
    return shouldStack(this._width, this.stackBelow);
  }

  private get _maxStart(): number {
    return maxStartSize(this._width, this.minEnd, DIVIDER_WIDTH);
  }

  private get _effectiveSize(): number {
    return clampSize(
      this._size ?? this.defaultSize,
      this.minStart,
      this._maxStart
    );
  }

  protected willUpdate(changed: PropertyValues<this>) {
    if (changed.has("storageKey") && this._loadedKey !== this.storageKey) {
      this._loadedKey = this.storageKey;
      this._loadStored();
    }
  }

  protected render() {
    const stacked = this._stacked;
    const collapsed = stacked ? "" : this.collapsed;
    const size = this._effectiveSize;
    const startName = this.startLabel ?? this._text("start");
    const endName = this.endLabel ?? this._text("end");

    return html`
      <div
        class=${classMap({
          layout: true,
          stacked,
          "collapsed-start": collapsed === "start",
          "collapsed-end": collapsed === "end",
        })}
        style=${styleMap({ "--ha-split-start-size": `${size}px` })}
      >
        <div class="start" ?hidden=${collapsed === "start"}>
          <slot name="start"></slot>
        </div>
        ${
          stacked
            ? nothing
            : html`<div class="divider-column">
                <ha-split-divider
                  .value=${size}
                  .min=${this.minStart}
                  .max=${this._maxStart}
                  .total=${Math.max(0, this._width - DIVIDER_WIDTH)}
                  .defaultValue=${this.defaultSize}
                  .disabled=${collapsed !== ""}
                  .label=${this._text("resize", {
                    start: startName,
                    end: endName,
                  })}
                  @split-divider-move=${this._dividerMoved}
                ></ha-split-divider>
                <div class="toggles">
                  ${
                    collapsed === ""
                      ? html`${this._renderToggle(
                          "start",
                          this._text("collapse", { name: startName }),
                          mdiChevronLeft
                        )}${this._renderToggle(
                          "end",
                          this._text("collapse", { name: endName }),
                          mdiChevronRight
                        )}`
                      : collapsed === "start"
                        ? this._renderToggle(
                            "",
                            this._text("expand", { name: startName }),
                            mdiChevronRight
                          )
                        : this._renderToggle(
                            "",
                            this._text("expand", { name: endName }),
                            mdiChevronLeft
                          )
                  }
                </div>
              </div>`
        }
        <div class="end" ?hidden=${collapsed === "end"}>
          <slot name="end"></slot>
        </div>
      </div>
      <div class="visually-hidden" role="status" aria-live="polite">
        ${this._announcement}
      </div>
    `;
  }

  private _renderToggle(target: SplitCollapsed, label: string, path: string) {
    return html`<button
      type="button"
      class="toggle"
      aria-label=${label}
      title=${label}
      data-target=${target}
      @click=${this._toggleClicked}
    >
      <ha-svg-icon .path=${path}></ha-svg-icon>
    </button>`;
  }

  private _toggleClicked(ev: Event) {
    const target = (ev.currentTarget as HTMLElement).dataset.target;
    this._setCollapsed(target === "start" || target === "end" ? target : "");
  }

  /** Folds one side away, or with an empty value brings both back. */
  public setCollapsed(collapsed: SplitCollapsed): void {
    this._setCollapsed(collapsed);
  }

  /** Puts the divider back at the default size and shows both sides. */
  public reset(): void {
    this._size = this.defaultSize;
    this.collapsed = "";
    this._settled();
  }

  private _text(
    key:
      | "start"
      | "end"
      | "resize"
      | "collapse"
      | "expand"
      | "collapsed"
      | "expanded",
    values: Record<string, string> = {}
  ): string {
    const localize = this._i18n?.localize;
    if (!localize) {
      return "";
    }
    return localize(`ui.components.split_panels.${key}`, values);
  }

  private _dividerMoved(ev: CustomEvent<SplitDividerMoveDetail>) {
    ev.stopPropagation();
    const { size, committed } = ev.detail;
    // During a drag only the CSS variable moves, nothing is rendered again
    this._layout?.style.setProperty("--ha-split-start-size", `${size}px`);
    if (!committed) {
      return;
    }
    this._size = size;
    this._settled();
  }

  private _setCollapsed(collapsed: SplitCollapsed) {
    const previous = this.collapsed;
    this.collapsed = collapsed;
    const startName = this.startLabel ?? this._text("start");
    const endName = this.endLabel ?? this._text("end");
    const name =
      collapsed === "start"
        ? startName
        : collapsed === "end"
          ? endName
          : previous === "start"
            ? startName
            : endName;
    this._announcement = this._text(collapsed ? "collapsed" : "expanded", {
      name,
    });
    this._settled();
  }

  private _settled() {
    this._store();
    fireEvent(this, "split-panels-changed", {
      size: this._effectiveSize,
      collapsed: this.collapsed,
    });
  }

  private _store() {
    if (!this.storageKey) {
      return;
    }
    safeSetStored(`${STORAGE_PREFIX}${this.storageKey}`, {
      size: this._size ?? this.defaultSize,
      collapsed: this.collapsed,
    });
  }

  private _loadStored() {
    if (!this.storageKey) {
      return;
    }
    const stored = parseStoredState(
      safeGetStored<unknown>(`${STORAGE_PREFIX}${this.storageKey}`)
    );
    if (stored) {
      this._size = stored.size;
      this.collapsed = stored.collapsed;
    }
  }

  static styles = css`
    :host {
      display: block;
      min-width: 0;
      min-height: 0;
    }
    .layout {
      display: flex;
      align-items: stretch;
      min-height: 100%;
      min-width: 0;
    }
    .start {
      flex: 0 0 var(--ha-split-start-size, 320px);
      width: var(--ha-split-start-size, 320px);
      min-width: 0;
      box-sizing: border-box;
    }
    .end {
      flex: 1 1 0;
      min-width: 0;
    }
    .collapsed-end .start {
      flex: 1 1 0;
      width: auto;
    }
    [hidden] {
      display: none !important;
    }
    .layout.stacked {
      flex-direction: column;
    }
    .layout.stacked .start {
      flex: 0 0 auto;
      width: auto;
    }
    .layout.stacked .end {
      flex: 1 1 auto;
    }
    .divider-column {
      position: relative;
      flex: 0 0 ${DIVIDER_WIDTH}px;
      width: ${DIVIDER_WIDTH}px;
      display: flex;
    }
    .divider-column ha-split-divider {
      flex: 1;
    }
    .toggles {
      position: absolute;
      inset-block-start: var(--ha-space-3, 12px);
      inset-inline-start: 50%;
      transform: translateX(-50%);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2, 8px);
      z-index: 2;
    }
    :host(:dir(rtl)) .toggles {
      transform: translateX(50%);
    }
    .toggle {
      position: relative;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--divider-color);
      border-radius: 50%;
      background: var(--card-background-color, var(--primary-background-color));
      color: var(--secondary-text-color);
      cursor: pointer;
      --mdc-icon-size: 18px;
    }
    /* The button is small to look light; its touch area is 44 pixels. */
    .toggle::after {
      content: "";
      position: absolute;
      inset: -8px;
    }
    .toggle:hover {
      color: var(--primary-color);
      border-color: var(--primary-color);
    }
    .toggle:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    :host(:dir(rtl)) .toggle ha-svg-icon {
      transform: scaleX(-1);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    @media (prefers-reduced-motion: no-preference) {
      .toggle {
        transition:
          color var(--ha-animation-duration-fast, 150ms) ease-out,
          border-color var(--ha-animation-duration-fast, 150ms) ease-out;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-split-panels": HaSplitPanels;
  }

  interface HASSDomEvents {
    "split-panels-changed": SplitPanelsChangedDetail;
  }
}
