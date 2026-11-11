import {
  mdiArrowTopRight,
  mdiContentCopy,
  mdiCursorDefault,
  mdiDelete,
  mdiDownload,
  mdiEllipseOutline,
  mdiEraser,
  mdiEyedropper,
  mdiFileImage,
  mdiFormatText,
  mdiHandBackRight,
  mdiBrush,
  mdiHelpCircleOutline,
  mdiImagePlus,
  mdiLeadPencil,
  mdiMagnifyMinus,
  mdiMagnifyPlus,
  mdiMarker,
  mdiPalette,
  mdiPencil,
  mdiRectangleOutline,
  mdiRedo,
  mdiUndo,
  mdiVectorLine,
  mdiFitToScreen,
  mdiContentSave,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { describeShape } from "../../../../common/drawing/describe";
import type { History } from "../../../../common/drawing/history";
import {
  canRedo,
  canUndo,
  commit,
  createHistory,
  redo,
  undo,
} from "../../../../common/drawing/history";
import { hitTest } from "../../../../common/drawing/hit-test";
import { isEditableTarget } from "../../../../common/drawing/editable-target";
import {
  MAX_IMAGE_BYTES,
  MAX_PAGE_SIDE,
  MAX_SOURCE_SIDE,
  checkImageLimits,
  inspectImageHeader,
  pageSizeForImage,
} from "../../../../common/drawing/image-type";
import { MAX_PIXELS } from "../../../../common/converter/image-size";
import type {
  Point,
  Shape,
  ShapeKind,
  StrokePoint,
  TextMeasure,
} from "../../../../common/drawing/model";
import {
  MAX_GALLERY_ITEMS,
  MAX_TEXT_LENGTH,
  addShape,
  clampPoint,
  closeIfUnused,
  constrainEnd,
  isStrokeKind,
  moveShape,
  newShapeId,
  removeShape,
  simplifyStroke,
  textSizeForWidth,
} from "../../../../common/drawing/model";
import { drawPage, drawSelection } from "../../../../common/drawing/render";
import { drawingToSvg } from "../../../../common/drawing/svg-export";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-svg-icon";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

type Tool = "select" | "pan" | "eraser" | "text" | ShapeKind;

interface ToolDef {
  tool: Tool;
  key: string;
  icon: string;
}

const TOOLS: ToolDef[] = [
  { tool: "select", key: "V", icon: mdiCursorDefault },
  { tool: "pen", key: "P", icon: mdiPencil },
  { tool: "pencil", key: "N", icon: mdiLeadPencil },
  { tool: "brush", key: "B", icon: mdiBrush },
  { tool: "highlighter", key: "H", icon: mdiMarker },
  { tool: "line", key: "L", icon: mdiVectorLine },
  { tool: "arrow", key: "A", icon: mdiArrowTopRight },
  { tool: "rect", key: "R", icon: mdiRectangleOutline },
  { tool: "ellipse", key: "O", icon: mdiEllipseOutline },
  { tool: "text", key: "T", icon: mdiFormatText },
  { tool: "eraser", key: "X", icon: mdiEraser },
  { tool: "pan", key: "M", icon: mdiHandBackRight },
];

const SWATCHES = [
  "#c81e1e",
  "#00639b",
  "#f5c828",
  "#28a046",
  "#000000",
  "#ffffff",
];

const SWATCH_KEYS: Record<string, string> = {
  "#c81e1e": "red",
  "#00639b": "blue",
  "#f5c828": "yellow",
  "#28a046": "green",
  "#000000": "black",
  "#ffffff": "white",
};

const DEFAULT_PAGE = { width: 1600, height: 1000 };
const MIN_SCALE = 0.05;
const MAX_SCALE = 16;

interface GalleryItem {
  id: string;
  thumb: string;
  shapes: Shape[];
  page: { width: number; height: number };
  background?: ImageBitmap;
}

type Gesture =
  | { kind: "draw"; shape: Shape; start: Point }
  | { kind: "move"; id: string; start: Point; original: Shape[] }
  | { kind: "erase" }
  | { kind: "pan"; x: number; y: number };

interface EyeDropperLike {
  open(): Promise<{ sRGBHex: string }>;
}

/**
 * A page to draw on, or to mark up a picture. The drawing is a list of shape
 * objects; everything happens in this browser and nothing is sent anywhere.
 */
@customElement("tools-drawing")
class ToolsDrawing extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _history: History<Shape[]> = createHistory<Shape[]>([]);

  @state() private _tool: Tool = "pen";

  @state() private _color = SWATCHES[0];

  @state() private _width = 6;

  @state() private _selected?: string;

  @state() private _page = { ...DEFAULT_PAGE };

  @state() private _background?: ImageBitmap;

  @state() private _textDraft?: { at: Point; value: string };

  @state() private _gallery: GalleryItem[] = [];

  @state() private _status = "";

  @state() private _error = "";

  @state() private _showHelp = false;

  @state() private _showStyle = false;

  @state() private _dragging = false;

  @state() private _view = { scale: 1, x: 0, y: 0 };

  @query("canvas") private _canvas?: HTMLCanvasElement;

  @query(".text-input") private _textEl?: HTMLInputElement;

  @query("#file") private _fileEl?: HTMLInputElement;

  @query(".stage") private _stage?: HTMLElement;

  // Held outside reactive state: these change on every pointer move.
  private _working?: Shape[];

  private _draft?: Shape;

  private _gesture?: Gesture;

  private _cursor: Point = {
    x: DEFAULT_PAGE.width / 2,
    y: DEFAULT_PAGE.height / 2,
  };

  private _canvasFocused = false;

  private _pointers = new Map<number, Point>();

  private _pinch?: { distance: number; scale: number };

  private _resizeObserver?: ResizeObserver;

  private _frame = 0;

  private _needsFit = true;

  private _measureCtx?: CanvasRenderingContext2D | null;

  /** Text width measured with the canvas, so wide characters are counted. */
  private _measure: TextMeasure | undefined = (line, size) => {
    if (this._measureCtx === undefined) {
      this._measureCtx = document.createElement("canvas").getContext("2d");
    }
    const ctx = this._measureCtx;
    if (!ctx) {
      return line.length * size * 0.6;
    }
    ctx.font = `${size}px sans-serif`;
    return ctx.measureText(line).width;
  };

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.tools.tabs.drawing.${key}` as any,
      values
    );
  }

  private get _shapes(): Shape[] {
    return this._working ?? this._history.present;
  }

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("paste", this._onPaste);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("paste", this._onPaste);
    this._resizeObserver?.disconnect();
    cancelAnimationFrame(this._frame);
  }

  protected firstUpdated(): void {
    if (this._stage) {
      this._resizeObserver = new ResizeObserver(() => this._resize());
      this._resizeObserver.observe(this._stage);
    }
  }

  protected updated(changed: PropertyValues<this>): void {
    if (changed.size) {
      this._requestDraw();
    }
  }

  protected render(): TemplateResult {
    const shapes = this._shapes;
    const toolDef = TOOLS.find((t) => t.tool === this._tool);
    const collapsed = this.narrow && !this._showStyle;
    return html`
      <div class="content" @keydown=${this._onKeyDown}>
        <header>
          <h1>${this._l("title")}</h1>
          <p>
            ${this._l("summary", {
              width: this._page.width,
              height: this._page.height,
              count: shapes.length,
            })}
          </p>
        </header>

        <div
          class=${classMap({ stage: true, dragging: this._dragging })}
          @dragover=${this._onDragOver}
          @dragleave=${this._onDragLeave}
          @drop=${this._onDrop}
        >
          <canvas
            tabindex="0"
            role="img"
            aria-label=${this._l("canvas_label", {
              count: shapes.length,
              tool: toolDef ? this._l(`tool_${toolDef.tool}`) : "",
            })}
            aria-describedby="shape-list"
            @pointerdown=${this._onPointerDown}
            @pointermove=${this._onPointerMove}
            @pointerup=${this._onPointerUp}
            @pointercancel=${this._onPointerUp}
            @wheel=${this._onWheel}
            @focus=${this._onCanvasFocus}
            @blur=${this._onCanvasBlur}
            @contextmenu=${this._preventDefault}
          ></canvas>
          ${
            this._textDraft
              ? html`<input
                  class="text-input"
                  type="text"
                  maxlength=${MAX_TEXT_LENGTH}
                  aria-label=${this._l("text_label")}
                  placeholder=${this._l("text_placeholder")}
                  .value=${this._textDraft.value}
                  style=${styleMap({
                    left: `${this._textDraft.at.x * this._view.scale + this._view.x}px`,
                    top: `${this._textDraft.at.y * this._view.scale + this._view.y}px`,
                  })}
                  @input=${this._textInput}
                  @keydown=${this._textKey}
                  @blur=${this._textBlur}
                />`
              : nothing
          }
          ${
            !this._background && !shapes.length
              ? html`<p class="drop-hint">${this._l("drop_hint")}</p>`
              : nothing
          }
        </div>

        <div class="toolbar" role="toolbar" aria-label=${this._l("toolbar")}>
          <div class="group">
            ${TOOLS.map(
              (def) => html`
                <button
                  type="button"
                  class=${classMap({ tool: true, active: this._tool === def.tool })}
                  aria-pressed=${this._tool === def.tool ? "true" : "false"}
                  aria-label=${`${this._l(`tool_${def.tool}`)} (${def.key})`}
                  title=${`${this._l(`tool_${def.tool}`)} (${def.key})`}
                  data-tool=${def.tool}
                  @click=${this._pickTool}
                >
                  <ha-svg-icon .path=${def.icon}></ha-svg-icon>
                </button>
              `
            )}
          </div>
          ${
            this.narrow
              ? html`<button
                  type="button"
                  class="tool"
                  aria-expanded=${this._showStyle ? "true" : "false"}
                  aria-label=${this._l("style_toggle")}
                  title=${this._l("style_toggle")}
                  @click=${this._toggleStyle}
                >
                  <ha-svg-icon .path=${mdiPalette}></ha-svg-icon>
                </button>`
              : nothing
          }
          <div class=${classMap({ group: true, hidden: collapsed })}>
            ${SWATCHES.map(
              (hex) => html`
                <button
                  type="button"
                  class=${classMap({
                    swatch: true,
                    active: this._color === hex,
                    light: hex === "#ffffff",
                  })}
                  style=${styleMap({ backgroundColor: hex })}
                  aria-pressed=${this._color === hex ? "true" : "false"}
                  aria-label=${this._l(`colour_${SWATCH_KEYS[hex]}`)}
                  title=${this._l(`colour_${SWATCH_KEYS[hex]}`)}
                  data-color=${hex}
                  @click=${this._pickColor}
                ></button>
              `
            )}
            <label class="custom">
              <span class="sr-only">${this._l("custom_colour")}</span>
              <input
                type="color"
                .value=${this._color}
                title=${this._l("custom_colour")}
                @input=${this._customColor}
              />
            </label>
            ${
              "EyeDropper" in window
                ? html`<button
                    type="button"
                    class="tool"
                    aria-label=${this._l("pick_screen")}
                    title=${this._l("pick_screen")}
                    @click=${this._pickFromScreen}
                  >
                    <ha-svg-icon .path=${mdiEyedropper}></ha-svg-icon>
                  </button>`
                : nothing
            }
            <label class="width">
              <span>${this._l("width")}</span>
              <input
                type="range"
                min="1"
                max="40"
                step="1"
                .value=${String(this._width)}
                aria-valuetext=${this._l("width_value", { width: this._width })}
                @input=${this._widthInput}
              />
            </label>
          </div>
          <div class="group">
            <button
              type="button"
              class="tool"
              ?disabled=${!canUndo(this._history)}
              aria-label=${`${this._l("undo")} (Ctrl+Z)`}
              title=${`${this._l("undo")} (Ctrl+Z)`}
              @click=${this._undo}
            >
              <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
            </button>
            <button
              type="button"
              class="tool"
              ?disabled=${!canRedo(this._history)}
              aria-label=${`${this._l("redo")} (Ctrl+Shift+Z)`}
              title=${`${this._l("redo")} (Ctrl+Shift+Z)`}
              @click=${this._redo}
            >
              <ha-svg-icon .path=${mdiRedo}></ha-svg-icon>
            </button>
            <button
              type="button"
              class="tool"
              ?disabled=${!shapes.length}
              aria-label=${this._l("clear")}
              title=${this._l("clear")}
              @click=${this._clear}
            >
              <ha-svg-icon .path=${mdiDelete}></ha-svg-icon>
            </button>
            <button
              type="button"
              class="tool"
              aria-label=${`${this._l("zoom_out")} (-)`}
              title=${`${this._l("zoom_out")} (-)`}
              @click=${this._zoomOut}
            >
              <ha-svg-icon .path=${mdiMagnifyMinus}></ha-svg-icon>
            </button>
            <button
              type="button"
              class="tool"
              aria-label=${`${this._l("zoom_in")} (+)`}
              title=${`${this._l("zoom_in")} (+)`}
              @click=${this._zoomIn}
            >
              <ha-svg-icon .path=${mdiMagnifyPlus}></ha-svg-icon>
            </button>
            <button
              type="button"
              class="tool"
              aria-label=${`${this._l("zoom_fit")} (0)`}
              title=${`${this._l("zoom_fit")} (0)`}
              @click=${this._fit}
            >
              <ha-svg-icon .path=${mdiFitToScreen}></ha-svg-icon>
            </button>
          </div>
        </div>

        <div class="actions">
          <p class="note">${this._l("footer_note")}</p>
          <div class="buttons">
            <ha-button appearance="outlined" @click=${this._openPicker}>
              <ha-svg-icon slot="start" .path=${mdiImagePlus}></ha-svg-icon>
              ${this._l("open_image")}
            </ha-button>
            ${
              this._background
                ? html`<ha-button
                    appearance="outlined"
                    @click=${this._removeImage}
                  >
                    ${this._l("remove_image")}
                  </ha-button>`
                : nothing
            }
            <ha-button appearance="outlined" @click=${this._exportPng}>
              <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
              ${this._l("export_png")}
            </ha-button>
            <ha-button appearance="outlined" @click=${this._exportSvg}>
              <ha-svg-icon slot="start" .path=${mdiFileImage}></ha-svg-icon>
              ${this._l("export_svg")}
            </ha-button>
            <ha-button appearance="outlined" @click=${this._copyPng}>
              <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
              ${this._l("copy_png")}
            </ha-button>
            <ha-button appearance="outlined" @click=${this._saveToGallery}>
              <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
              ${this._l("save_gallery")}
            </ha-button>
            <ha-button appearance="plain" @click=${this._toggleHelp}>
              <ha-svg-icon
                slot="start"
                .path=${mdiHelpCircleOutline}
              ></ha-svg-icon>
              ${this._l("help")}
            </ha-button>
          </div>
          <input
            id="file"
            class="sr-only"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            tabindex="-1"
            @change=${this._fileChosen}
          />
        </div>

        ${
          this._error
            ? html`<p class="message error" role="alert">${this._error}</p>`
            : nothing
        }
        <p class="message" role="status">${this._status}</p>

        ${this._showHelp ? this._renderHelp() : nothing}

        <section class="panel">
          <h2>${this._l("shapes_title", { count: shapes.length })}</h2>
          <ul id="shape-list">
            ${
              shapes.length
                ? shapes.map(
                    (shape) => html`
                      <li>
                        <button
                          type="button"
                          class=${classMap({
                            row: true,
                            active: this._selected === shape.id,
                          })}
                          aria-pressed=${this._selected === shape.id ? "true" : "false"}
                          data-id=${shape.id}
                          @click=${this._selectFromList}
                        >
                          ${this._describe(shape)}
                        </button>
                      </li>
                    `
                  )
                : html`<li class="empty">${this._l("shapes_empty")}</li>`
            }
          </ul>
        </section>

        <section class="panel">
          <h2>${this._l("gallery_title")}</h2>
          <p class="note">${this._l("gallery_note")}</p>
          ${
            this._gallery.length
              ? html`<ul class="gallery">
                  ${this._gallery.map(
                    (item, index) => html`
                      <li>
                        <button
                          type="button"
                          class="thumb"
                          data-id=${item.id}
                          aria-label=${this._l("gallery_open", { number: index + 1 })}
                          @click=${this._openGallery}
                        >
                          <img src=${item.thumb} alt="" />
                        </button>
                        <ha-icon-button
                          .label=${this._l("gallery_remove", { number: index + 1 })}
                          .path=${mdiDelete}
                          data-id=${item.id}
                          @click=${this._removeGallery}
                        ></ha-icon-button>
                      </li>
                    `
                  )}
                </ul>`
              : html`<p class="empty">${this._l("gallery_empty")}</p>`
          }
        </section>
      </div>
    `;
  }

  private _renderHelp(): TemplateResult {
    return html`
      <section class="panel" aria-labelledby="help-title">
        <h2 id="help-title">${this._l("help_title")}</h2>
        <ul class="help">
          ${TOOLS.map(
            (def) =>
              html`<li>
                <kbd>${def.key}</kbd> ${this._l(`tool_${def.tool}`)}
              </li>`
          )}
          <li><kbd>Ctrl</kbd> + <kbd>Z</kbd> ${this._l("undo")}</li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Z</kbd>, <kbd>Ctrl</kbd> +
            <kbd>Y</kbd> ${this._l("redo")}
          </li>
          <li><kbd>Delete</kbd> ${this._l("help_delete")}</li>
          <li>
            <kbd>←</kbd> <kbd>↑</kbd> <kbd>→</kbd>
            <kbd>↓</kbd> ${this._l("help_nudge")}
          </li>
          <li><kbd>Enter</kbd> ${this._l("help_add")}</li>
          <li>
            <kbd>+</kbd> <kbd>-</kbd> <kbd>0</kbd> ${this._l("help_zoom")}
          </li>
          <li><kbd>Shift</kbd> ${this._l("help_shift")}</li>
          <li><kbd>Esc</kbd> ${this._l("help_escape")}</li>
          <li>${this._l("help_pointer")}</li>
          <li>${this._l("help_focus")}</li>
        </ul>
      </section>
    `;
  }

  private _describe(shape: Shape): string {
    const d = describeShape(shape, this._page.width, this._page.height);
    return this._l(`desc_${d.kind}`, {
      from: this._l(`region_${d.from}`),
      to: d.to ? this._l(`region_${d.to}`) : "",
      color: this._l(`colour_${d.color}`),
      text: d.text ?? "",
    });
  }

  // ---------------------------------------------------------------- drawing

  private _requestDraw(): void {
    if (this._frame) {
      return;
    }
    this._frame = requestAnimationFrame(() => {
      this._frame = 0;
      this._draw();
    });
  }

  private _resize(): void {
    const canvas = this._canvas;
    const stage = this._stage;
    if (!canvas || !stage) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, stage.clientWidth);
    const height = Math.max(1, stage.clientHeight);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    if (this._needsFit && stage.clientWidth > 1) {
      this._fit();
      this._needsFit = false;
    }
    this._requestDraw();
  }

  private _draw(): void {
    const canvas = this._canvas;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    const { scale, x, y } = this._view;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, dpr * x, dpr * y);
    ctx.save();
    ctx.shadowColor = "rgba(0, 0, 0, 0.25)";
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, this._page.width, this._page.height);
    ctx.restore();
    const shapes = this._draft ? [...this._shapes, this._draft] : this._shapes;
    drawPage(ctx, shapes, this._page, this._background);
    const selected = this._shapes.find((s) => s.id === this._selected);
    if (selected) {
      drawSelection(ctx, selected, scale, this._measure);
    }
    if (this._canvasFocused) {
      const c = this._cursor;
      ctx.save();
      ctx.strokeStyle = "#1a73e8";
      ctx.lineWidth = 2 / scale;
      ctx.beginPath();
      ctx.moveTo(c.x - 12 / scale, c.y);
      ctx.lineTo(c.x + 12 / scale, c.y);
      ctx.moveTo(c.x, c.y - 12 / scale);
      ctx.lineTo(c.x, c.y + 12 / scale);
      ctx.stroke();
      ctx.restore();
    }
  }

  private _fit(): void {
    const stage = this._stage;
    if (!stage) {
      return;
    }
    const scale = Math.min(
      MAX_SCALE,
      Math.max(
        MIN_SCALE,
        Math.min(
          (stage.clientWidth - 24) / this._page.width,
          (stage.clientHeight - 24) / this._page.height
        )
      )
    );
    this._view = {
      scale,
      x: (stage.clientWidth - this._page.width * scale) / 2,
      y: (stage.clientHeight - this._page.height * scale) / 2,
    };
  }

  private _zoomAt(cx: number, cy: number, factor: number): void {
    const { scale, x, y } = this._view;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor));
    const k = next / scale;
    this._view = { scale: next, x: cx - (cx - x) * k, y: cy - (cy - y) * k };
  }

  private _zoomBy(factor: number): void {
    const stage = this._stage;
    if (stage) {
      this._zoomAt(stage.clientWidth / 2, stage.clientHeight / 2, factor);
    }
  }

  private _zoomIn(): void {
    this._zoomBy(1.25);
  }

  private _zoomOut(): void {
    this._zoomBy(0.8);
  }

  private _toDoc(ev: { clientX: number; clientY: number }): Point {
    const rect = this._canvas!.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left - this._view.x) / this._view.scale,
      y: (ev.clientY - rect.top - this._view.y) / this._view.scale,
    };
  }

  // ---------------------------------------------------------------- pointer

  private _onWheel(ev: WheelEvent): void {
    // Only a zoom gesture is taken; a plain wheel still scrolls the page.
    if (!ev.ctrlKey && !ev.metaKey) {
      return;
    }
    ev.preventDefault();
    const rect = this._canvas!.getBoundingClientRect();
    this._zoomAt(
      ev.clientX - rect.left,
      ev.clientY - rect.top,
      ev.deltaY < 0 ? 1.1 : 1 / 1.1
    );
  }

  private _onPointerDown(ev: PointerEvent): void {
    const canvas = ev.currentTarget as HTMLCanvasElement;
    this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    canvas.setPointerCapture(ev.pointerId);
    canvas.focus({ preventScroll: true });
    if (this._pointers.size === 2) {
      // A second finger turns the gesture into a pinch.
      this._gesture = undefined;
      this._draft = undefined;
      this._working = undefined;
      const [a, b] = [...this._pointers.values()];
      this._pinch = {
        distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        scale: this._view.scale,
      };
      return;
    }
    if (this._pointers.size > 2) {
      return;
    }
    if (ev.pointerType === "mouse" && ev.button === 2) {
      return;
    }
    const middle = ev.pointerType === "mouse" && ev.button === 1;
    if (this._tool === "pan" || middle) {
      this._gesture = { kind: "pan", x: ev.clientX, y: ev.clientY };
      return;
    }
    const point = this._toDoc(ev);
    const tolerance = 6 / this._view.scale;
    switch (this._tool) {
      case "select": {
        const id = hitTest(
          this._history.present,
          point,
          tolerance,
          this._measure
        );
        this._selected = id;
        if (id) {
          this._gesture = {
            kind: "move",
            id,
            start: point,
            original: this._history.present,
          };
        }
        break;
      }
      case "eraser":
        this._gesture = { kind: "erase" };
        this._working = this._history.present;
        this._eraseAt(point);
        break;
      case "text":
        this._openText(point);
        break;
      case "pen":
      case "pencil":
      case "brush":
      case "highlighter": {
        const shape: Shape = {
          id: newShapeId(),
          kind: this._tool,
          color: this._color,
          width: this._width,
          points: [this._strokePoint(ev, point)],
        };
        this._draft = shape;
        this._gesture = { kind: "draw", shape, start: point };
        break;
      }
      default: {
        const shape: Shape = {
          id: newShapeId(),
          kind: this._tool as "line" | "arrow" | "rect" | "ellipse",
          color: this._color,
          width: this._width,
          from: point,
          to: point,
        };
        this._draft = shape;
        this._gesture = { kind: "draw", shape, start: point };
      }
    }
    this._requestDraw();
  }

  private _strokePoint(ev: PointerEvent, point: Point): StrokePoint {
    return ev.pointerType === "pen" && ev.pressure > 0
      ? { ...point, p: ev.pressure }
      : point;
  }

  private _onPointerMove(ev: PointerEvent): void {
    if (this._pointers.has(ev.pointerId)) {
      this._pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    }
    if (this._pinch && this._pointers.size === 2) {
      const [a, b] = [...this._pointers.values()];
      const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const rect = this._canvas!.getBoundingClientRect();
      const target = Math.min(
        MAX_SCALE,
        Math.max(
          MIN_SCALE,
          (this._pinch.scale * distance) / this._pinch.distance
        )
      );
      this._zoomAt(
        (a.x + b.x) / 2 - rect.left,
        (a.y + b.y) / 2 - rect.top,
        target / this._view.scale
      );
      return;
    }
    const gesture = this._gesture;
    if (!gesture) {
      return;
    }
    if (gesture.kind === "pan") {
      this._view = {
        ...this._view,
        x: this._view.x + ev.clientX - gesture.x,
        y: this._view.y + ev.clientY - gesture.y,
      };
      gesture.x = ev.clientX;
      gesture.y = ev.clientY;
      return;
    }
    const point = this._toDoc(ev);
    if (gesture.kind === "erase") {
      this._eraseAt(point);
    } else if (gesture.kind === "move") {
      this._working = moveShape(
        gesture.original,
        gesture.id,
        point.x - gesture.start.x,
        point.y - gesture.start.y
      );
    } else {
      const shape = gesture.shape;
      if (isStrokeKind(shape.kind) && "points" in shape) {
        if (ev.shiftKey) {
          const first = shape.points[0];
          shape.points = [first, constrainEnd(shape.kind, first, point)];
        } else {
          shape.points.push(this._strokePoint(ev, point));
        }
      } else if ("to" in shape) {
        shape.to = ev.shiftKey
          ? constrainEnd(shape.kind, shape.from, point)
          : point;
      }
    }
    this._requestDraw();
  }

  private _onPointerUp(ev: PointerEvent): void {
    this._pointers.delete(ev.pointerId);
    if (this._pointers.size < 2) {
      this._pinch = undefined;
    }
    const gesture = this._gesture;
    if (!gesture) {
      return;
    }
    this._gesture = undefined;
    if (gesture.kind === "draw") {
      let shape = gesture.shape;
      if (isStrokeKind(shape.kind) && "points" in shape) {
        shape = {
          ...shape,
          points: simplifyStroke(shape.points, 0.5 / this._view.scale),
        };
      }
      const finished: Shape = shape;
      const empty =
        "to" in finished &&
        finished.from.x === finished.to.x &&
        finished.from.y === finished.to.y;
      this._draft = undefined;
      if (!empty && ev.type === "pointerup") {
        this._history = commit(
          this._history,
          addShape(this._history.present, shape)
        );
        this._selected = undefined;
      }
    } else if (this._working) {
      const next = this._working;
      this._working = undefined;
      if (ev.type === "pointerup") {
        this._history = commit(this._history, next);
      }
    }
    this._requestDraw();
  }

  private _eraseAt(point: Point): void {
    const base = this._working ?? this._history.present;
    const id = hitTest(base, point, 6 / this._view.scale, this._measure);
    if (id) {
      this._working = removeShape(base, id);
      if (this._selected === id) {
        this._selected = undefined;
      }
    }
  }

  // ------------------------------------------------------------------ keys

  private _onCanvasFocus(): void {
    this._canvasFocused = true;
    this._requestDraw();
  }

  private _onCanvasBlur(): void {
    this._canvasFocused = false;
    this._requestDraw();
  }

  private _preventDefault(ev: Event): void {
    ev.preventDefault();
  }

  private _onKeyDown(ev: KeyboardEvent): void {
    const path = ev.composedPath();
    const origin = path[0] as HTMLElement | undefined;
    if (isEditableTarget(path)) {
      return;
    }
    const mod = ev.ctrlKey || ev.metaKey;
    const key = ev.key;
    const handled = (): void => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    if (mod && !ev.altKey) {
      const lower = key.toLowerCase();
      if (lower === "z" && !ev.shiftKey) {
        handled();
        this._undo();
      } else if ((lower === "z" && ev.shiftKey) || lower === "y") {
        handled();
        this._redo();
      }
      return;
    }
    if (ev.altKey) {
      return;
    }
    const onCanvas = origin === this._canvas;
    const arrows: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    if (onCanvas && arrows[key]) {
      handled();
      const step = ev.shiftKey ? 10 : 1;
      this._nudge(arrows[key][0] * step, arrows[key][1] * step);
      return;
    }
    if (onCanvas && key === "Enter") {
      handled();
      this._addAtCursor();
      return;
    }
    if (key === "Delete" || (key === "Backspace" && onCanvas)) {
      if (this._selected) {
        handled();
        this._deleteSelected();
      }
      return;
    }
    if (key === "Escape") {
      if (this._selected || this._gesture) {
        handled();
        this._selected = undefined;
        this._gesture = undefined;
        this._draft = undefined;
        this._working = undefined;
      }
      return;
    }
    // Single-character shortcuts act only while the canvas has focus, so
    // typing on a toolbar button or a link never changes the tool by accident.
    if (!onCanvas) {
      return;
    }
    if (key === "+" || key === "=") {
      handled();
      this._zoomIn();
      return;
    }
    if (key === "-") {
      handled();
      this._zoomOut();
      return;
    }
    if (key === "0") {
      handled();
      this._fit();
      return;
    }
    const def = TOOLS.find((t) => t.key.toLowerCase() === key.toLowerCase());
    if (def && !ev.shiftKey) {
      handled();
      this._tool = def.tool;
    }
  }

  private _nudge(dx: number, dy: number): void {
    if (this._selected) {
      this._history = commit(
        this._history,
        moveShape(this._history.present, this._selected, dx, dy)
      );
      return;
    }
    this._cursor = clampPoint(
      { x: this._cursor.x + dx * 10, y: this._cursor.y + dy * 10 },
      this._page.width,
      this._page.height
    );
    this._requestDraw();
  }

  private _addAtCursor(): void {
    const c = this._cursor;
    const base = { id: newShapeId(), color: this._color, width: this._width };
    let shape: Shape | undefined;
    switch (this._tool) {
      case "pen":
      case "pencil":
      case "brush":
      case "highlighter":
        shape = {
          ...base,
          kind: this._tool,
          points: [
            { x: c.x - 60, y: c.y },
            { x: c.x + 60, y: c.y },
          ],
        };
        break;
      case "line":
      case "arrow":
        shape = {
          ...base,
          kind: this._tool,
          from: { x: c.x - 80, y: c.y },
          to: { x: c.x + 80, y: c.y },
        };
        break;
      case "rect":
      case "ellipse":
        shape = {
          ...base,
          kind: this._tool,
          from: { x: c.x - 80, y: c.y - 50 },
          to: { x: c.x + 80, y: c.y + 50 },
        };
        break;
      case "text":
        this._openText(c);
        return;
      case "eraser": {
        const id = hitTest(
          this._history.present,
          c,
          6 / this._view.scale,
          this._measure
        );
        if (id) {
          this._history = commit(
            this._history,
            removeShape(this._history.present, id)
          );
        }
        return;
      }
      default:
        return;
    }
    this._history = commit(
      this._history,
      addShape(this._history.present, shape)
    );
    // The new shape is selected so the arrow keys move it at once.
    this._selected = shape.id;
    this._tool = "select";
    this._status = this._l("added", { description: this._describe(shape) });
  }

  private _deleteSelected(): void {
    if (!this._selected) {
      return;
    }
    this._history = commit(
      this._history,
      removeShape(this._history.present, this._selected)
    );
    this._selected = undefined;
  }

  // ------------------------------------------------------------------ text

  private _openText(at: Point): void {
    this._textDraft = { at, value: "" };
    this.updateComplete.then(() => {
      this._textEl?.focus();
    });
  }

  private _textInput(ev: Event): void {
    if (this._textDraft) {
      this._textDraft = {
        ...this._textDraft,
        value: (ev.currentTarget as HTMLInputElement).value,
      };
    }
  }

  private _textKey(ev: KeyboardEvent): void {
    ev.stopPropagation();
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._commitText();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      this._textDraft = undefined;
      this._canvas?.focus({ preventScroll: true });
    }
  }

  private _textBlur(): void {
    this._commitText();
  }

  private _commitText(): void {
    const draft = this._textDraft;
    this._textDraft = undefined;
    if (!draft || !draft.value.trim()) {
      return;
    }
    const shape: Shape = {
      id: newShapeId(),
      kind: "text",
      color: this._color,
      width: this._width,
      at: draft.at,
      text: draft.value.slice(0, MAX_TEXT_LENGTH),
      size: textSizeForWidth(this._width),
    };
    this._history = commit(
      this._history,
      addShape(this._history.present, shape)
    );
    this._canvas?.focus({ preventScroll: true });
  }

  // --------------------------------------------------------------- toolbar

  private _pickTool(ev: Event): void {
    this._tool = (ev.currentTarget as HTMLElement).dataset.tool as Tool;
  }

  private _pickColor(ev: Event): void {
    this._color = (ev.currentTarget as HTMLElement).dataset.color!;
  }

  private _customColor(ev: Event): void {
    this._color = (ev.currentTarget as HTMLInputElement).value;
  }

  private _widthInput(ev: Event): void {
    this._width = Number((ev.currentTarget as HTMLInputElement).value);
  }

  private _toggleStyle(): void {
    this._showStyle = !this._showStyle;
  }

  private _toggleHelp(): void {
    this._showHelp = !this._showHelp;
  }

  private async _pickFromScreen(): Promise<void> {
    try {
      const dropper = new (
        window as unknown as { EyeDropper: new () => EyeDropperLike }
      ).EyeDropper();
      this._color = (await dropper.open()).sRGBHex;
    } catch (_err) {
      // The person left the picker without choosing.
    }
  }

  private _undo(): void {
    this._history = undo(this._history);
    this._selected = undefined;
  }

  private _redo(): void {
    this._history = redo(this._history);
    this._selected = undefined;
  }

  private async _clear(): Promise<void> {
    if (!this._history.present.length) {
      return;
    }
    const ok = await showConfirmationDialog(this, {
      title: this._l("clear_title"),
      text: this._l("clear_text", { count: this._history.present.length }),
      confirmText: this._l("clear_confirm"),
      destructive: true,
    });
    if (ok) {
      this._history = commit(this._history, []);
      this._selected = undefined;
      this._status = this._l("cleared");
    }
  }

  private _selectFromList(ev: Event): void {
    this._selected = (ev.currentTarget as HTMLElement).dataset.id;
    this._tool = "select";
    this._canvas?.focus({ preventScroll: true });
  }

  // ---------------------------------------------------------------- images

  private _openPicker(): void {
    this._fileEl?.click();
  }

  private async _fileChosen(ev: Event): Promise<void> {
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      await this._loadImage(file);
    }
  }

  private _onDragOver(ev: DragEvent): void {
    if (!ev.dataTransfer?.types.includes("Files")) {
      return;
    }
    // Taken here so the window-wide wording import does not also take it.
    ev.preventDefault();
    ev.stopPropagation();
    ev.dataTransfer.dropEffect = "copy";
    this._dragging = true;
  }

  private _onDragLeave(): void {
    this._dragging = false;
  }

  private async _onDrop(ev: DragEvent): Promise<void> {
    this._dragging = false;
    const files = ev.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    await this._loadImage(files[0]);
  }

  private _onPaste = async (ev: ClipboardEvent): Promise<void> => {
    // The tools pages stay mounted when hidden; only a visible page listens.
    if (!this.getClientRects().length) {
      return;
    }
    if (isEditableTarget(ev.composedPath())) {
      return;
    }
    const file = [...(ev.clipboardData?.files ?? [])][0];
    if (file) {
      ev.preventDefault();
      await this._loadImage(file);
    }
  };

  private async _loadImage(file: Blob): Promise<void> {
    this._error = "";
    this._status = "";
    if (file.size > MAX_IMAGE_BYTES) {
      this._error = this._l("error_too_big", {
        size: Math.round(MAX_IMAGE_BYTES / 1024 / 1024),
      });
      return;
    }
    // The size is read from the file header, so a picture that would take
    // far too much memory is refused before the browser decodes it.
    const head = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
    const header = inspectImageHeader(head, file.size);
    if (!header.ok) {
      this._error = this._headerError(header.reason);
      return;
    }
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(file);
    } catch (_err) {
      this._error = this._l("error_decode");
      return;
    }
    const check = checkImageLimits(file.size, bitmap.width, bitmap.height);
    if (!check.ok) {
      bitmap.close();
      this._error = this._headerError(check.reason);
      return;
    }
    if (this._history.present.length) {
      const ok = await showConfirmationDialog(this, {
        title: this._l("replace_title"),
        text: this._l("replace_text"),
        confirmText: this._l("replace_confirm"),
        destructive: true,
      });
      if (!ok) {
        bitmap.close();
        return;
      }
    }
    const page = pageSizeForImage(bitmap.width, bitmap.height);
    this._replaceBackground(bitmap);
    this._page = page;
    this._history = createHistory<Shape[]>([]);
    this._selected = undefined;
    this._cursor = { x: page.width / 2, y: page.height / 2 };
    this._fit();
    this._status =
      page.width !== bitmap.width
        ? this._l("picture_scaled", { side: MAX_PAGE_SIDE })
        : this._l("picture_added", {
            width: page.width,
            height: page.height,
          });
  }

  private _headerError(
    reason: "too_big" | "not_image" | "dimensions" | "unreadable"
  ): string {
    switch (reason) {
      case "too_big":
        return this._l("error_too_big", {
          size: Math.round(MAX_IMAGE_BYTES / 1024 / 1024),
        });
      case "not_image":
        return this._l("error_not_image");
      case "unreadable":
        return this._l("error_decode");
      default:
        return this._l("error_dimensions", {
          side: MAX_SOURCE_SIDE,
          megapixels: Math.round(MAX_PIXELS / 1_000_000),
        });
    }
  }

  /** Swap the background picture, closing the old bitmap if nothing else uses it. */
  private _replaceBackground(next: ImageBitmap | undefined): void {
    const previous = this._background;
    this._background = next;
    closeIfUnused(previous, [next, ...this._gallery.map((g) => g.background)]);
  }

  private async _removeImage(): Promise<void> {
    const ok = await showConfirmationDialog(this, {
      title: this._l("remove_image_title"),
      text: this._l("remove_image_text"),
      confirmText: this._l("remove_image_confirm"),
      destructive: true,
    });
    if (!ok) {
      return;
    }
    this._replaceBackground(undefined);
    this._page = { ...DEFAULT_PAGE };
    this._history = createHistory<Shape[]>([]);
    this._selected = undefined;
    this._cursor = { x: DEFAULT_PAGE.width / 2, y: DEFAULT_PAGE.height / 2 };
    this._fit();
  }

  // --------------------------------------------------------------- exports

  private _renderToCanvas(): HTMLCanvasElement | undefined {
    const canvas = document.createElement("canvas");
    canvas.width = this._page.width;
    canvas.height = this._page.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return undefined;
    }
    drawPage(ctx, this._history.present, this._page, this._background);
    return canvas;
  }

  private _download(blob: Blob, name: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private _exportPng(): void {
    this._renderToCanvas()?.toBlob((blob) => {
      if (blob) {
        this._download(blob, "drawing.png");
        this._status = this._l("exported", { name: "drawing.png" });
      }
    }, "image/png");
  }

  private _exportSvg(): void {
    const svg = drawingToSvg(
      this._history.present,
      this._page.width,
      this._page.height
    );
    this._download(new Blob([svg], { type: "image/svg+xml" }), "drawing.svg");
    this._status = this._l(
      this._background ? "exported_svg_no_picture" : "exported",
      { name: "drawing.svg" }
    );
  }

  private _copyPng(): void {
    this._renderToCanvas()?.toBlob(async (blob) => {
      try {
        if (!blob || !navigator.clipboard || !("ClipboardItem" in window)) {
          throw new Error("unsupported");
        }
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
        this._status = this._l("copied");
      } catch (_err) {
        this._error = this._l("copy_failed");
      }
    }, "image/png");
  }

  // --------------------------------------------------------------- gallery

  private _saveToGallery(): void {
    if (this._gallery.length >= MAX_GALLERY_ITEMS) {
      this._error = this._l("gallery_full", { count: MAX_GALLERY_ITEMS });
      return;
    }
    this._error = "";
    const full = this._renderToCanvas();
    if (!full) {
      return;
    }
    const thumb = document.createElement("canvas");
    thumb.width = 200;
    thumb.height = Math.max(
      1,
      Math.round((200 * this._page.height) / this._page.width)
    );
    thumb.getContext("2d")?.drawImage(full, 0, 0, thumb.width, thumb.height);
    this._gallery = [
      ...this._gallery,
      {
        id: newShapeId(),
        thumb: thumb.toDataURL("image/png"),
        shapes: this._history.present,
        page: { ...this._page },
        background: this._background,
      },
    ];
    this._status = this._l("saved", { count: this._gallery.length });
  }

  private async _openGallery(ev: Event): Promise<void> {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    const item = this._gallery.find((g) => g.id === id);
    if (!item) {
      return;
    }
    if (this._history.present.length) {
      const ok = await showConfirmationDialog(this, {
        title: this._l("replace_title"),
        text: this._l("replace_text"),
        confirmText: this._l("replace_confirm"),
        destructive: true,
      });
      if (!ok) {
        return;
      }
    }
    this._page = { ...item.page };
    this._replaceBackground(item.background);
    this._history = createHistory(item.shapes);
    this._selected = undefined;
    this._cursor = { x: item.page.width / 2, y: item.page.height / 2 };
    this._fit();
  }

  private _removeGallery(ev: Event): void {
    const id = (ev.currentTarget as HTMLElement).dataset.id;
    const removed = this._gallery.find((g) => g.id === id);
    this._gallery = this._gallery.filter((g) => g.id !== id);
    closeIfUnused(removed?.background, [
      this._background,
      ...this._gallery.map((g) => g.background),
    ]);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        .content {
          box-sizing: border-box;
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-8);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        :host([narrow]) .content {
          padding: var(--ha-space-3);
        }
        header h1 {
          margin: 0;
          font-size: var(--ha-font-size-3xl, 2rem);
          font-weight: var(--ha-font-weight-normal);
        }
        header p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
        }
        .stage {
          position: relative;
          /* Leaves room under the stage for the page header, the title and the
             toolbar, so the tools are on screen without scrolling. */
          height: clamp(280px, calc(100vh - 400px), 640px);
          min-height: 280px;
          overflow: hidden;
          border-radius: var(--ha-border-radius-3xl);
          background: var(--secondary-background-color);
        }
        .stage.dragging {
          outline: 3px dashed var(--primary-color);
          outline-offset: -6px;
        }
        canvas {
          display: block;
          touch-action: none;
          cursor: crosshair;
        }
        canvas:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: -3px;
        }
        .drop-hint {
          position: absolute;
          inset-inline: var(--ha-space-4);
          bottom: var(--ha-space-3);
          margin: 0;
          text-align: center;
          color: var(--secondary-text-color);
          pointer-events: none;
        }
        .text-input {
          position: absolute;
          min-width: 160px;
          min-height: 44px;
          box-sizing: border-box;
          padding: 0 var(--ha-space-2);
          border: 2px solid var(--primary-color);
          border-radius: var(--ha-border-radius-md);
          background: var(--card-background-color);
          color: var(--primary-text-color);
          font: inherit;
        }
        .toolbar {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-2) var(--ha-space-4);
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 32px);
          background: var(--primary-text-color);
          color: var(--card-background-color);
        }
        :host([narrow]) .toolbar {
          border-radius: var(--ha-border-radius-3xl);
        }
        .group {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-1);
        }
        .group.hidden {
          display: none;
        }
        button.tool,
        button.swatch {
          box-sizing: border-box;
          width: 44px;
          height: 44px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: none;
          border-radius: 50%;
          background: transparent;
          color: inherit;
          cursor: pointer;
        }
        button.tool:hover:not(:disabled) {
          background: color-mix(in srgb, currentColor 16%, transparent);
        }
        button.tool.active {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        button.tool:disabled {
          opacity: 0.4;
          cursor: default;
        }
        button.swatch {
          width: 44px;
          height: 44px;
          background-clip: content-box;
          padding: 8px;
          border: 2px solid transparent;
        }
        button.swatch.active {
          border-color: currentColor;
        }
        button.swatch.light {
          box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.4);
        }
        button:focus-visible,
        input:focus-visible,
        summary:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .custom {
          display: inline-flex;
          width: 44px;
          height: 44px;
          align-items: center;
          justify-content: center;
        }
        .custom input {
          width: 32px;
          height: 32px;
          padding: 0;
          border: none;
          background: none;
          cursor: pointer;
        }
        .width {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
        }
        .width input {
          width: 110px;
          min-height: 44px;
          accent-color: var(--primary-color);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0 0 0 0);
          white-space: nowrap;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .note {
          margin: 0;
          flex: 1 1 240px;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .message {
          margin: 0;
          min-height: 1.2em;
          color: var(--secondary-text-color);
        }
        .message.error {
          color: var(--error-color);
        }
        .panel {
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .panel h2 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-l);
        }
        .panel ul {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .help li {
          padding: var(--ha-space-1) 0;
        }
        kbd {
          padding: 1px 6px;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-sm);
          font-family: inherit;
          font-size: var(--ha-font-size-s);
        }
        button.row {
          width: 100%;
          min-height: 44px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-lg);
          background: transparent;
          color: var(--primary-text-color);
          text-align: start;
          font: inherit;
          cursor: pointer;
        }
        button.row:hover {
          background: var(--secondary-background-color);
        }
        button.row.active {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        .empty {
          margin: 0;
          color: var(--secondary-text-color);
        }
        .gallery {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
        }
        .gallery li {
          display: flex;
          align-items: center;
        }
        button.thumb {
          padding: 0;
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-md);
          background: #fff;
          cursor: pointer;
          overflow: hidden;
          min-width: 44px;
          min-height: 44px;
        }
        button.thumb img {
          display: block;
          max-width: 160px;
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition: none !important;
            animation: none !important;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-drawing": ToolsDrawing;
  }
}
