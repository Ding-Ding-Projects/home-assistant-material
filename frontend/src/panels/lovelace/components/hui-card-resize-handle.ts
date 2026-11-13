import { mdiResizeBottomRight } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { fireEvent } from "../../../common/dom/fire_event";
import { computeRTL } from "../../../common/util/compute_rtl";
import "../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../types";
import type { GridSize } from "../common/snap-grid-resize";
import {
  resizeKeyDelta,
  rowsFromHeight,
  snapGridResize,
} from "../common/snap-grid-resize";

declare global {
  interface HASSDomEvents {
    "card-grid-resize": GridSize;
  }
}

const DEFAULT_ROW_HEIGHT = 56;
const DEFAULT_GAP = 8;

const px = (value: string, fallback: number) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * A resize handle for a card on the sections grid in edit mode. Dragging the
 * corner changes the card's `columns` and `rows`, snapped to the grid with a
 * dashed guide that shows where the card will end. The same handle works from
 * the keyboard: focus it and use the arrow keys, one column or row per press.
 * Place it inside the card's positioned wrapper, below the `.container` grid.
 */
@customElement("hui-card-resize-handle")
export class HuiCardResizeHandle extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** Columns the card spans now, or "full". */
  @property({ attribute: false }) public columns: number | "full" = 12;

  /** Rows the card spans now, or "auto". */
  @property({ attribute: false }) public rows: number | "auto" = "auto";

  @property({ attribute: false }) public minColumns?: number;

  @property({ attribute: false }) public maxColumns?: number;

  @property({ attribute: false }) public minRows?: number;

  @property({ attribute: false }) public maxRows?: number;

  @state() private _preview?: GridSize;

  @state() private _live = "";

  private _drag?: {
    pointerId: number;
    x: number;
    y: number;
    start: GridSize;
    columnStep: number;
    rowStep: number;
    columnCount: number;
    gap: number;
    rowGap: number;
  };

  /** The grid measurements: step sizes in pixels and the number of columns. */
  private _measure() {
    const container = this.closest<HTMLElement>(".container");
    const card = this.offsetParent as HTMLElement | null;
    const style = container ? getComputedStyle(container) : undefined;
    const rowHeight = px(
      style?.getPropertyValue("--row-height") ?? "",
      DEFAULT_ROW_HEIGHT
    );
    const rowGap = px(style?.getPropertyValue("--row-gap") ?? "", DEFAULT_GAP);
    const columnGap = px(
      style?.getPropertyValue("--column-gap") ?? "",
      DEFAULT_GAP
    );
    const columnCount = Math.max(
      1,
      Math.round(px(style?.getPropertyValue("--grid-column-count") ?? "", 12))
    );
    const width = container?.clientWidth ?? 0;
    const columnStep = width > 0 ? (width + columnGap) / columnCount : 40;
    const start: GridSize = {
      columns: typeof this.columns === "number" ? this.columns : columnCount,
      rows:
        typeof this.rows === "number"
          ? this.rows
          : rowsFromHeight(card?.offsetHeight ?? 0, rowHeight, rowGap),
    };
    return {
      start,
      columnStep,
      rowStep: rowHeight + rowGap,
      columnCount,
      gap: columnGap,
      rowGap,
    };
  }

  private get _rtl() {
    return computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
  }

  private _label(size: GridSize) {
    return this.hass.localize("ui.panel.lovelace.editor.section.resize_size", {
      columns: size.columns,
      rows: size.rows,
    });
  }

  protected updated(changed: PropertyValues<this>) {
    if (changed.has("columns") || changed.has("rows")) {
      if (!this._drag) {
        this._preview = undefined;
      }
    }
  }

  private _onPointerDown(ev: PointerEvent) {
    if (ev.button !== 0) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const measured = this._measure();
    this._drag = {
      pointerId: ev.pointerId,
      x: ev.clientX,
      y: ev.clientY,
      ...measured,
    };
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
    this._preview = measured.start;
  }

  private _snap(ev: PointerEvent): GridSize | undefined {
    const drag = this._drag;
    if (!drag) {
      return undefined;
    }
    return snapGridResize({
      startColumns: drag.start.columns,
      startRows: drag.start.rows,
      dx: ev.clientX - drag.x,
      dy: ev.clientY - drag.y,
      columnStep: drag.columnStep,
      rowStep: drag.rowStep,
      columnCount: drag.columnCount,
      minColumns: this.minColumns,
      maxColumns: this.maxColumns,
      minRows: this.minRows,
      maxRows: this.maxRows,
      rtl: this._rtl,
    });
  }

  private _onPointerMove(ev: PointerEvent) {
    if (!this._drag || ev.pointerId !== this._drag.pointerId) {
      return;
    }
    const next = this._snap(ev);
    if (
      next &&
      (next.columns !== this._preview?.columns ||
        next.rows !== this._preview?.rows)
    ) {
      this._preview = next;
    }
  }

  private _onPointerUp(ev: PointerEvent) {
    const drag = this._drag;
    if (!drag || ev.pointerId !== drag.pointerId) {
      return;
    }
    const next = this._snap(ev) ?? drag.start;
    this._drag = undefined;
    (ev.currentTarget as HTMLElement).releasePointerCapture?.(ev.pointerId);
    this._preview = undefined;
    if (
      next.columns !== drag.start.columns ||
      next.rows !== drag.start.rows ||
      this.rows === "auto"
    ) {
      this._announce(next);
      fireEvent(this, "card-grid-resize", next);
    }
  }

  private _onPointerCancel() {
    this._drag = undefined;
    this._preview = undefined;
  }

  private _onKeyDown(ev: KeyboardEvent) {
    const delta = resizeKeyDelta(ev.key, this._rtl);
    if (!delta) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const measured = this._measure();
    const base = this._preview ?? measured.start;
    const next = snapGridResize({
      startColumns: base.columns + delta.columns,
      startRows: base.rows + delta.rows,
      dx: 0,
      dy: 0,
      columnStep: measured.columnStep,
      rowStep: measured.rowStep,
      columnCount: measured.columnCount,
      minColumns: this.minColumns,
      maxColumns: this.maxColumns,
      minRows: this.minRows,
      maxRows: this.maxRows,
    });
    if (next.columns === base.columns && next.rows === base.rows) {
      return;
    }
    this._announce(next);
    fireEvent(this, "card-grid-resize", next);
  }

  private _announce(size: GridSize) {
    this._live = this._label(size);
  }

  private _guideStyle() {
    const preview = this._preview;
    const drag = this._drag;
    if (!preview || !drag) {
      return undefined;
    }
    return {
      width: `${preview.columns * drag.columnStep - drag.gap}px`,
      height: `${preview.rows * drag.rowStep - drag.rowGap}px`,
    };
  }

  protected render() {
    if (!this.hass) {
      return nothing;
    }
    const guide = this._guideStyle();
    const current: GridSize | undefined = this._preview;
    return html`
      ${
        guide
          ? html`<div class="guide" style=${styleMap(guide)}>
              <span class="size"
                >${current ? this._label(current) : nothing}</span
              >
            </div>`
          : nothing
      }
      <button
        class="grip ${this._drag ? "active" : ""}"
        type="button"
        aria-label=${this.hass.localize(
          "ui.panel.lovelace.editor.section.resize_card"
        )}
        title=${this.hass.localize(
          "ui.panel.lovelace.editor.section.resize_hint"
        )}
        @pointerdown=${this._onPointerDown}
        @pointermove=${this._onPointerMove}
        @pointerup=${this._onPointerUp}
        @pointercancel=${this._onPointerCancel}
        @keydown=${this._onKeyDown}
        @click=${this._stop}
      >
        <ha-svg-icon .path=${mdiResizeBottomRight}></ha-svg-icon>
      </button>
      <span class="sr-only" role="status" aria-live="polite"
        >${this._live}</span
      >
    `;
  }

  private _stop(ev: Event) {
    ev.stopPropagation();
  }

  static styles = css`
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
    }
    .grip {
      position: absolute;
      inset-block-end: -6px;
      inset-inline-end: -6px;
      width: 28px;
      height: 28px;
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 2px solid var(--primary-color);
      border-radius: var(--ha-border-radius-circle);
      background: var(--card-background-color, #fff);
      color: var(--primary-color);
      box-shadow: var(--ha-shadow-card, none);
      cursor: nwse-resize;
      touch-action: none;
      pointer-events: auto;
      opacity: var(--resize-grip-opacity, 0);
      transition: opacity var(--ha-animation-duration-fast, 150ms) ease;
      --mdc-icon-size: 18px;
    }
    :host(:focus-within) .grip,
    .grip:focus-visible,
    .grip.active {
      opacity: 1;
    }
    @media (hover: none) {
      .grip {
        opacity: 0.85;
      }
    }
    .guide {
      position: absolute;
      inset-block-start: 0;
      inset-inline-start: 0;
      box-sizing: border-box;
      border: 2px dashed var(--primary-color);
      border-radius: var(--ha-card-border-radius, var(--ha-border-radius-lg));
      background: color-mix(in srgb, var(--primary-color) 8%, transparent);
      pointer-events: none;
    }
    .size {
      position: absolute;
      inset-block-end: var(--ha-space-1);
      inset-inline-end: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
      font-size: var(--ha-font-size-xs);
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card-resize-handle": HuiCardResizeHandle;
  }
}
