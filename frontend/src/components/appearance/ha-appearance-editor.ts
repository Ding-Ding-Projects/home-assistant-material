import type { ContextType } from "@lit/context";
import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClose,
  mdiContrastCircle,
  mdiDelete,
  mdiEye,
  mdiEyeOff,
  mdiGradientHorizontal,
  mdiImage,
  mdiPalette,
  mdiPlus,
  mdiRestore,
  mdiUndo,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import {
  appearanceChoiceCount,
  choiceFor,
  resetAllAppearance,
  updateChoice,
} from "../../common/appearance/appearance-session";
import type {
  AppearanceScope,
  BlendMode,
  ElementAppearance,
  FillLayer,
} from "../../common/appearance/element-appearance";
import {
  APPEARANCE_LIMITS,
  BLEND_MODES,
  composedParent,
  contrastRatio,
  cssColorToHex,
  FONT_FAMILIES,
  FONT_WEIGHTS,
  hasDroppedOutsideImages,
  isAKind,
  isEmptyAppearance,
  isSafeImageUrl,
  kindLabel,
  normalizeAppearance,
} from "../../common/appearance/element-appearance";
import { appearanceSync } from "../../common/appearance/appearance-sync";
import { consume } from "../../common/decorators/consume";
import type { LocalizeKeys } from "../../common/translations/localize";
import { internationalizationContext } from "../../data/context";
import "../instance-sync/ha-instance-sync-status";
import "../ha-svg-icon";
import "./ha-appearance-color-picker";

type ScalarKey = Exclude<keyof ElementAppearance, "layers">;

// A drag is applied and stored at most this often (milliseconds), and once
// more when it ends.
const APPLY_INTERVAL = 250;

/**
 * The appearance editor for one element.
 *
 * It opens beside the element that was picked. The row of names at the top
 * is the element and what contains it, so the choice can be moved outward
 * to the card, the section or the page. A choice applies to this one element
 * or to every element of the same kind, and is saved in this browser as it
 * is made. Undo steps back; Reset returns the element to the theme.
 */
@customElement("ha-appearance-editor")
export class HaAppearanceEditor extends LitElement {
  /** The picked element first, then what contains it. */
  @property({ attribute: false }) public chain: HTMLElement[] = [];

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n?: ContextType<typeof internationalizationContext>;

  @state() private _index = 0;

  @state() private _scope: AppearanceScope = "element";

  @state() private _appearance: ElementAppearance = {};

  @state() private _selectedLayer = 0;

  @state() private _undo: ElementAppearance[] = [];

  @state() private _outline: Record<string, string> = {};

  @state() private _side: "left" | "right" = "right";

  @state() private _urlError = false;

  @query("#panel") private _panel?: HTMLElement;

  @query("#outline") private _outlineBox?: HTMLElement;

  private _lastUndoKey = "";

  private _lastUndoTime = 0;

  private _timer?: number;

  private _applyTimer?: number;

  private _applyPending = false;

  private _applyTarget?: {
    element: HTMLElement;
    scope: AppearanceScope;
    appearance: ElementAppearance;
  };

  private get _element(): HTMLElement | undefined {
    return this.chain[this._index];
  }

  /** Opens the editor for a chain of elements, starting at `index`. */
  public show(
    chain: HTMLElement[],
    index = 0,
    scope: AppearanceScope = "element"
  ) {
    this.chain = chain;
    this._index = Math.min(index, Math.max(0, chain.length - 1));
    this._scope = scope;
    this._load();
    this.updateComplete.then(() => {
      [this._outlineBox, this._panel].forEach((box) => {
        if (box && !box.matches(":popover-open")) {
          box.showPopover();
        }
      });
      this._follow();
      this._panel?.querySelector<HTMLElement>("button.close")?.focus();
    });
    window.clearInterval(this._timer);
    this._timer = window.setInterval(this._follow, 250);
  }

  public close() {
    this._flushPersist();
    window.clearInterval(this._timer);
    this._timer = undefined;
    [this._panel, this._outlineBox].forEach((box) => {
      if (box?.matches(":popover-open")) {
        box.hidePopover();
      }
    });
  }

  public get open(): boolean {
    return !!this._panel?.matches(":popover-open");
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._flushPersist();
    window.clearInterval(this._timer);
  }

  protected willUpdate(changed: PropertyValues) {
    if (changed.has("_index") || changed.has("_scope")) {
      if (this._scope === "kind" && this._element && !isAKind(this._element)) {
        this._scope = "element";
      }
      this._load();
    }
  }

  private _syncLocalize = (key: string): string =>
    this._i18n?.localize(key as LocalizeKeys) || key;

  private _l(key: string, values?: Record<string, string | number>): string {
    return (
      this._i18n?.localize(
        `ui.appearance_editor.${key}` as LocalizeKeys,
        values
      ) || key
    );
  }

  private _load() {
    this._flushPersist();
    const element = this._element;
    this._appearance = element ? choiceFor(element, this._scope) : {};
    this._selectedLayer = 0;
    this._undo = [];
    this._urlError = false;
  }

  // Keeps the outline on the element while the page scrolls or changes, and
  // keeps the panel off the element where there is room.
  private _follow = () => {
    const element = this._element;
    if (!element?.isConnected) {
      this._outline = { display: "none" };
      return;
    }
    const rect = element.getBoundingClientRect();
    this._outline = {
      left: `${rect.left - 3}px`,
      top: `${rect.top - 3}px`,
      width: `${rect.width + 6}px`,
      height: `${rect.height + 6}px`,
    };
    this._side =
      rect.left + rect.width / 2 > window.innerWidth / 2 ? "left" : "right";
  };

  private _commit(next: ElementAppearance, undoKey: string) {
    const element = this._element;
    if (!element) {
      return;
    }
    const now = Date.now();
    // Dragging a slider or a colour sends many changes; they are one step.
    if (undoKey !== this._lastUndoKey || now - this._lastUndoTime > 800) {
      this._undo = [...this._undo.slice(-49), this._appearance];
    }
    this._lastUndoKey = undoKey;
    this._lastUndoTime = now;
    this._appearance = normalizeAppearance(next);
    this._applyTarget = {
      element,
      scope: this._scope,
      appearance: this._appearance,
    };
    this._schedulePersist();
  }

  // Applying a choice also stores it, so a drag that sends many changes is
  // applied at most every APPLY_INTERVAL ms, and the last value is applied at
  // once when the drag ends (the picker's committed event), the panel closes or
  // an undo happens.
  private _schedulePersist() {
    if (this._applyTimer === undefined) {
      this._persistNow();
      this._applyTimer = window.setTimeout(() => {
        this._applyTimer = undefined;
        if (this._applyPending) {
          this._persistNow();
        }
      }, APPLY_INTERVAL);
    } else {
      this._applyPending = true;
    }
  }

  private _persistNow() {
    this._applyPending = false;
    const target = this._applyTarget;
    if (target) {
      updateChoice(target.element, target.scope, target.appearance);
    }
  }

  private _flushPersist = () => {
    window.clearTimeout(this._applyTimer);
    this._applyTimer = undefined;
    if (this._applyPending) {
      this._persistNow();
    }
  };

  private _dropPending() {
    window.clearTimeout(this._applyTimer);
    this._applyTimer = undefined;
    this._applyPending = false;
  }

  private _set<K extends ScalarKey>(key: K, value: ElementAppearance[K]) {
    const next = { ...this._appearance };
    if (value === undefined) {
      delete next[key];
    } else {
      next[key] = value;
    }
    this._commit(next, key);
  }

  private _setLayers(layers: FillLayer[], undoKey: string) {
    const next = { ...this._appearance };
    if (layers.length) {
      next.layers = layers;
    } else {
      delete next.layers;
    }
    this._commit(next, undoKey);
  }

  protected render(): TemplateResult {
    const element = this._element;
    return html`
      <div
        id="outline"
        popover="manual"
        aria-hidden="true"
        style=${styleMap(this._outline)}
      ></div>
      <div
        id="panel"
        popover="manual"
        role="dialog"
        aria-label=${this._l("title")}
        class=${this._side}
        @keydown=${this._keydown}
      >
        <header>
          <div class="heading">
            <span class="title">${this._l("title")}</span>
            <span class="subtitle"
              >${element ? this._describe(element) : ""}</span
            >
          </div>
          <button
            class="icon"
            ?disabled=${!this._undo.length}
            aria-label=${this._l("undo")}
            title=${this._l("undo")}
            @click=${this._undoStep}
          >
            <ha-svg-icon .path=${mdiUndo}></ha-svg-icon>
          </button>
          <button
            class="icon close"
            aria-label=${this._l("close")}
            title=${this._l("close")}
            @click=${this.close}
          >
            <ha-svg-icon .path=${mdiClose}></ha-svg-icon>
          </button>
        </header>
        <div class="body">
          ${this._renderChain()} ${this._renderScope()} ${this._renderFill()}
          ${this._renderText()} ${this._renderShape()} ${this._renderAccent()}
          ${this._renderSize()} ${this._renderContrast()}
        </div>
        <footer>
          <span class="note"
            >${this._l("saved_note", { count: appearanceChoiceCount() })}</span
          >
          <ha-instance-sync-status
            .sync=${appearanceSync}
            .localize=${this._syncLocalize}
          ></ha-instance-sync-status>
          <button
            class="text"
            ?disabled=${isEmptyAppearance(this._appearance)}
            @click=${this._reset}
          >
            <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
            ${this._l("reset")}
          </button>
          <button
            class="text danger"
            ?disabled=${!appearanceChoiceCount()}
            @click=${this._resetEverything}
          >
            ${this._l("reset_all")}
          </button>
        </footer>
      </div>
    `;
  }

  private _describe(element: HTMLElement): string {
    const label =
      element.getAttribute("aria-label") ||
      (element as HTMLElement & { label?: unknown }).label;
    const kind = kindLabel(element.localName);
    return typeof label === "string" && label.trim()
      ? `${kind}, ${label.trim().slice(0, 60)}`
      : kind;
  }

  private _renderChain() {
    if (this.chain.length < 2) {
      return nothing;
    }
    return html`
      <section>
        <span class="label" id="chain-label">${this._l("chain_label")}</span>
        <div class="chips" role="radiogroup" aria-labelledby="chain-label">
          ${this.chain.map(
            (element, index) => html`
              <button
                class=${classMap({ chip: true, on: index === this._index })}
                role="radio"
                aria-checked=${index === this._index ? "true" : "false"}
                .index=${index}
                @click=${this._pickIndex}
              >
                ${kindLabel(element.localName)}
              </button>
            `
          )}
        </div>
      </section>
    `;
  }

  private _renderScope() {
    const kind = this._element ? kindLabel(this._element.localName) : "";
    return html`
      <section>
        <span class="label" id="scope-label">${this._l("scope_label")}</span>
        <div class="chips" role="radiogroup" aria-labelledby="scope-label">
          ${(["element", "kind"] as const).map(
            (scope) => html`
              <button
                class=${classMap({ chip: true, on: scope === this._scope })}
                role="radio"
                aria-checked=${scope === this._scope ? "true" : "false"}
                .scope=${scope}
                ?disabled=${
                  scope === "kind" &&
                  (!this._element || !isAKind(this._element))
                }
                @click=${this._pickScope}
              >
                ${this._l(`scope_${scope}`, { kind })}
              </button>
            `
          )}
        </div>
      </section>
    `;
  }

  // ---- Fill ----

  private _layerSummary(layer: FillLayer): string {
    if (layer.type === "color") {
      return layer.color;
    }
    if (layer.type === "gradient") {
      return this._l("gradient_summary", {
        angle: layer.angle,
        from: layer.from,
        to: layer.to,
      });
    }
    return layer.url.startsWith("data:")
      ? this._l("picture_embedded")
      : layer.url.slice(0, 40);
  }

  private _layerSwatch(layer: FillLayer): Record<string, string> {
    if (layer.type === "color") {
      return { background: layer.color };
    }
    if (layer.type === "gradient") {
      return {
        background: `linear-gradient(${layer.angle}deg, ${layer.from}, ${layer.to})`,
      };
    }
    return {};
  }

  private _renderFill() {
    const layers = this._appearance.layers ?? [];
    const selected = layers[this._selectedLayer];
    return html`
      <section>
        <div class="section-head">
          <span class="label">${this._l("fill")}</span>
          <span class="hint">${this._l("fill_hint")}</span>
        </div>
        ${
          hasDroppedOutsideImages()
            ? html`<p class="hint" role="note">
                ${this._l("picture_outside_removed")}
              </p>`
            : nothing
        }
        ${
          layers.length
            ? html`<ul class="layers">
                ${layers.map(
                  (layer, index) => html`
                    <li
                      class=${classMap({
                        layer: true,
                        on: index === this._selectedLayer,
                        hidden: !layer.visible,
                      })}
                    >
                      <button
                        class="icon"
                        .index=${index}
                        aria-pressed=${layer.visible ? "true" : "false"}
                        aria-label=${this._l(
                          layer.visible ? "layer_hide" : "layer_show"
                        )}
                        title=${this._l(
                          layer.visible ? "layer_hide" : "layer_show"
                        )}
                        @click=${this._toggleLayer}
                      >
                        <ha-svg-icon
                          .path=${layer.visible ? mdiEye : mdiEyeOff}
                        ></ha-svg-icon>
                      </button>
                      <button
                        class="layer-main"
                        .index=${index}
                        aria-pressed=${
                          index === this._selectedLayer ? "true" : "false"
                        }
                        @click=${this._selectLayer}
                      >
                        <span
                          class="swatch"
                          style=${styleMap(this._layerSwatch(layer))}
                        >
                          ${
                            layer.type === "image"
                              ? html`<ha-svg-icon
                                  .path=${mdiImage}
                                ></ha-svg-icon>`
                              : nothing
                          }
                        </span>
                        <span class="layer-text">
                          <span>${this._l(`layer_${layer.type}`)}</span>
                          <span class="hint">${this._layerSummary(layer)}</span>
                        </span>
                        <span class="hint"
                          >${Math.round(layer.opacity * 100)}%</span
                        >
                      </button>
                      <button
                        class="icon"
                        .index=${index}
                        .delta=${-1}
                        ?disabled=${index === 0}
                        aria-label=${this._l("layer_up")}
                        title=${this._l("layer_up")}
                        @click=${this._moveLayer}
                      >
                        <ha-svg-icon .path=${mdiArrowUp}></ha-svg-icon>
                      </button>
                      <button
                        class="icon"
                        .index=${index}
                        .delta=${1}
                        ?disabled=${index === layers.length - 1}
                        aria-label=${this._l("layer_down")}
                        title=${this._l("layer_down")}
                        @click=${this._moveLayer}
                      >
                        <ha-svg-icon .path=${mdiArrowDown}></ha-svg-icon>
                      </button>
                      <button
                        class="icon"
                        .index=${index}
                        aria-label=${this._l("layer_remove")}
                        title=${this._l("layer_remove")}
                        @click=${this._removeLayer}
                      >
                        <ha-svg-icon .path=${mdiDelete}></ha-svg-icon>
                      </button>
                    </li>
                  `
                )}
              </ul>`
            : html`<p class="hint">${this._l("fill_empty")}</p>`
        }
        ${selected ? this._renderLayerDetail(selected) : nothing}
        <div class="chips">
          ${(
            [
              ["color", mdiPalette],
              ["gradient", mdiGradientHorizontal],
              ["image", mdiImage],
            ] as const
          ).map(
            ([type, icon]) => html`
              <button
                class="chip"
                .layerType=${type}
                ?disabled=${layers.length >= APPEARANCE_LIMITS.layers}
                @click=${this._addLayer}
              >
                <ha-svg-icon .path=${mdiPlus}></ha-svg-icon>
                <ha-svg-icon .path=${icon}></ha-svg-icon>
                ${this._l(`layer_${type}`)}
              </button>
            `
          )}
        </div>
      </section>
    `;
  }

  private _renderLayerDetail(layer: FillLayer) {
    return html`
      <div class="detail">
        ${
          layer.type === "color"
            ? this._colorField(this._l("colour"), layer.color, "color")
            : nothing
        }
        ${
          layer.type === "gradient"
            ? html`
                ${this._colorField(this._l("gradient_from"), layer.from, "from")}
                ${this._colorField(this._l("gradient_to"), layer.to, "to")}
                <label class="row">
                  <span>${this._l("gradient_angle")}</span>
                  <input
                    type="range"
                    min="0"
                    max="360"
                    step="5"
                    .value=${String(layer.angle)}
                    .field=${"angle"}
                    @input=${this._layerNumber}
                  />
                  <output>${layer.angle}°</output>
                </label>
              `
            : nothing
        }
        ${
          layer.type === "image"
            ? html`
                <label class="row stacked">
                  <span>${this._l("picture_url")}</span>
                  <input
                    type="url"
                    class=${this._urlError ? "invalid" : ""}
                    maxlength=${APPEARANCE_LIMITS.url}
                    spellcheck="false"
                    .value=${layer.url}
                    @change=${this._layerUrl}
                  />
                </label>
                ${
                  this._urlError
                    ? html`<p class="error" role="alert">
                        ${this._l("picture_url_error")}
                      </p>`
                    : nothing
                }
                <label class="row">
                  <span>${this._l("picture_size")}</span>
                  <select .field=${"size"} @change=${this._layerText}>
                    ${(["cover", "contain", "auto"] as const).map(
                      (size) =>
                        html`<option
                          value=${size}
                          ?selected=${layer.size === size}
                        >
                          ${this._l(`picture_size_${size}`)}
                        </option>`
                    )}
                  </select>
                </label>
                <label class="row">
                  <span>${this._l("picture_position")}</span>
                  <select .field=${"position"} @change=${this._layerText}>
                    ${(
                      ["center", "top", "bottom", "left", "right"] as const
                    ).map(
                      (position) =>
                        html`<option
                          value=${position}
                          ?selected=${layer.position === position}
                        >
                          ${this._l(`position_${position}`)}
                        </option>`
                    )}
                  </select>
                </label>
                <label class="row">
                  <span>${this._l("picture_repeat")}</span>
                  <input
                    type="checkbox"
                    .checked=${layer.repeat}
                    @change=${this._layerRepeat}
                  />
                </label>
              `
            : nothing
        }
        ${
          layer.type !== "image"
            ? html`<label class="row">
                <span>${this._l("opacity")}</span>
                <input
                  type="range"
                  min="0"
                  max="100"
                  step="5"
                  .value=${String(Math.round(layer.opacity * 100))}
                  .field=${"opacity"}
                  @input=${this._layerNumber}
                />
                <output>${Math.round(layer.opacity * 100)}%</output>
              </label>`
            : nothing
        }
        <label class="row">
          <span>${this._l("blend")}</span>
          <select @change=${this._layerBlend}>
            ${BLEND_MODES.map(
              (blend) =>
                html`<option value=${blend} ?selected=${layer.blend === blend}>
                  ${this._l(`blend_${blend.replace("-", "_")}`)}
                </option>`
            )}
          </select>
        </label>
      </div>
    `;
  }

  // A fill colour sits behind the text, so it is read against the text.
  private _colorField(label: string, value: string, field: string) {
    return html`<div class="row colour">
      <span>${label}</span>
      <ha-appearance-color-picker
        .label=${label}
        .value=${value}
        .field=${field}
        .contrastWith=${this._textHex()}
        .contrastName=${this._l("picker_the_text")}
        @appearance-color-changed=${this._layerColor}
        @appearance-color-committed=${this._flushPersist}
      ></ha-appearance-color-picker>
    </div>`;
  }

  private _textHex(): string | undefined {
    return (
      this._appearance.textColor ??
      (this._element
        ? cssColorToHex(getComputedStyle(this._element).color)
        : undefined)
    );
  }

  // ---- Text, shape, accent, size ----

  private _scalarColor(key: "textColor" | "accentColor" | "borderColor") {
    const value = this._appearance[key];
    return html`<div class="row colour">
      <span>${this._l(`field_${key}`)}</span>
      <ha-appearance-color-picker
        .label=${this._l(`field_${key}`)}
        .value=${value}
        .key=${key}
        .contrastWith=${this._backgroundColor()}
        .contrastName=${this._l("picker_the_background")}
        @appearance-color-changed=${this._scalarColorChanged}
        @appearance-color-committed=${this._flushPersist}
      ></ha-appearance-color-picker>
      ${this._clearButton(key)}
    </div>`;
  }

  private _clearButton(key: ScalarKey) {
    return this._appearance[key] === undefined
      ? nothing
      : html`<button
          class="icon small"
          .key=${key}
          aria-label=${this._l("use_theme")}
          title=${this._l("use_theme")}
          @click=${this._clearScalar}
        >
          <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
        </button>`;
  }

  private _scalarRange(
    key: "radius" | "borderWidth" | "zoom" | "opacity",
    min: number,
    max: number,
    step: number,
    fallback: number,
    format: (value: number) => string,
    scale = 1
  ) {
    const value = this._appearance[key];
    return html`<div class="row">
      <span>${this._l(`field_${key}`)}</span>
      <input
        type="range"
        aria-label=${this._l(`field_${key}`)}
        min=${min}
        max=${max}
        step=${step}
        .value=${String((value ?? fallback) * scale)}
        .key=${key}
        .scale=${scale}
        @input=${this._scalarRangeChanged}
      />
      <output
        >${value === undefined ? this._l("from_theme") : format(value)}</output
      >
      ${this._clearButton(key)}
    </div>`;
  }

  private _renderText() {
    return html`
      <section>
        <span class="label">${this._l("text")}</span>
        ${this._scalarColor("textColor")}
        <label class="row">
          <span>${this._l("field_fontFamily")}</span>
          <select .key=${"fontFamily"} @change=${this._scalarSelect}>
            ${FONT_FAMILIES.map(
              (family) =>
                html`<option
                  value=${family}
                  ?selected=${
                    (this._appearance.fontFamily ?? "theme") === family
                  }
                >
                  ${family === "theme" ? this._l("from_theme") : family}
                </option>`
            )}
          </select>
        </label>
        <label class="row">
          <span>${this._l("field_fontWeight")}</span>
          <select .key=${"fontWeight"} @change=${this._scalarSelect}>
            <option value="" ?selected=${!this._appearance.fontWeight}>
              ${this._l("from_theme")}
            </option>
            ${FONT_WEIGHTS.map(
              (weight) =>
                html`<option
                  value=${weight}
                  ?selected=${this._appearance.fontWeight === weight}
                >
                  ${this._l(`weight_${weight}`)}
                </option>`
            )}
          </select>
        </label>
      </section>
    `;
  }

  private _renderShape() {
    return html`
      <section>
        <span class="label">${this._l("shape")}</span>
        ${this._scalarRange(
          "radius",
          0,
          APPEARANCE_LIMITS.radius,
          2,
          24,
          (value) => `${value} px`
        )}
        ${this._scalarRange(
          "borderWidth",
          0,
          APPEARANCE_LIMITS.borderWidth,
          1,
          0,
          (value) => `${value} px`
        )}
        ${this._scalarColor("borderColor")}
        <label class="row">
          <span>${this._l("field_shadow")}</span>
          <select .key=${"shadow"} @change=${this._scalarSelect}>
            <option value="" ?selected=${this._appearance.shadow === undefined}>
              ${this._l("from_theme")}
            </option>
            ${[0, 1, 2, 3].map(
              (level) =>
                html`<option
                  value=${level}
                  ?selected=${this._appearance.shadow === level}
                >
                  ${this._l(`shadow_${level}`)}
                </option>`
            )}
          </select>
        </label>
      </section>
    `;
  }

  private _renderAccent() {
    return html`
      <section>
        <span class="label">${this._l("accent")}</span>
        ${this._scalarColor("accentColor")}
      </section>
    `;
  }

  private _renderSize() {
    return html`
      <section>
        <span class="label">${this._l("size")}</span>
        ${this._scalarRange(
          "zoom",
          APPEARANCE_LIMITS.zoomMin * 100,
          APPEARANCE_LIMITS.zoomMax * 100,
          5,
          1,
          (value) => `${Math.round(value * 100)}%`,
          100
        )}
        ${this._scalarRange(
          "opacity",
          APPEARANCE_LIMITS.opacityMin * 100,
          100,
          5,
          1,
          (value) => `${Math.round(value * 100)}%`,
          100
        )}
      </section>
    `;
  }

  // The colour behind the text: the top opaque colour layer, or the first
  // solid background found walking outward from the element.
  private _backgroundColor(): string | undefined {
    const top = (this._appearance.layers ?? []).find(
      (layer) => layer.visible && layer.type === "color" && layer.opacity >= 0.5
    );
    if (top?.type === "color") {
      return top.color;
    }
    let node: Node | null | undefined = this._element;
    while (node) {
      if (node instanceof HTMLElement) {
        const value = cssColorToHex(getComputedStyle(node).backgroundColor);
        if (value) {
          return value;
        }
      }
      node = composedParent(node);
    }
    return undefined;
  }

  private _renderContrast() {
    const element = this._element;
    if (!element) {
      return nothing;
    }
    const text =
      this._appearance.textColor ??
      cssColorToHex(getComputedStyle(element).color);
    const background = this._backgroundColor();
    if (!text || !background) {
      return nothing;
    }
    const ratio = contrastRatio(text, background);
    const passes = ratio >= 4.5;
    return html`
      <p class=${classMap({ contrast: true, low: !passes })} role="status">
        <ha-svg-icon .path=${mdiContrastCircle}></ha-svg-icon>
        ${this._l(passes ? "contrast_pass" : "contrast_low", {
          ratio: ratio.toFixed(1),
        })}
      </p>
    `;
  }

  // ---- Handlers ----

  private _keydown(ev: KeyboardEvent) {
    ev.stopPropagation();
    if (ev.key === "Escape") {
      ev.preventDefault();
      this.close();
    } else if (
      ev.key.toLowerCase() === "z" &&
      (ev.ctrlKey || ev.metaKey) &&
      !ev.shiftKey
    ) {
      ev.preventDefault();
      this._undoStep();
    }
  }

  private _pickIndex(ev: Event) {
    this._index = (ev.currentTarget as HTMLElement & { index: number }).index;
    this.updateComplete.then(this._follow);
  }

  private _pickScope(ev: Event) {
    this._scope = (
      ev.currentTarget as HTMLElement & { scope: AppearanceScope }
    ).scope;
  }

  private _undoStep() {
    const previous = this._undo[this._undo.length - 1];
    const element = this._element;
    if (!previous || !element) {
      return;
    }
    this._dropPending();
    this._undo = this._undo.slice(0, -1);
    this._appearance = previous;
    this._lastUndoKey = "";
    updateChoice(element, this._scope, previous);
  }

  private _reset() {
    this._commit({}, "reset");
  }

  private _resetEverything() {
    this._dropPending();
    resetAllAppearance();
    this._appearance = {};
    this._undo = [];
  }

  private _clearScalar(ev: Event) {
    this._set(
      (ev.currentTarget as HTMLElement & { key: ScalarKey }).key,
      undefined
    );
  }

  private _scalarColorChanged(ev: Event) {
    const picker = ev.currentTarget as HTMLElement & {
      key: "textColor" | "accentColor" | "borderColor";
    };
    this._set(picker.key, (ev as CustomEvent<{ value: string }>).detail.value);
  }

  private _scalarRangeChanged(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement & {
      key: "radius" | "borderWidth" | "zoom" | "opacity";
      scale: number;
    };
    this._set(input.key, Number(input.value) / input.scale);
  }

  private _scalarSelect(ev: Event) {
    const select = ev.currentTarget as HTMLSelectElement & {
      key: "fontFamily" | "fontWeight" | "shadow";
    };
    if (select.key === "fontFamily") {
      this._set(
        "fontFamily",
        select.value === "theme" ? undefined : select.value
      );
    } else {
      this._set(
        select.key,
        select.value === "" ? undefined : Number(select.value)
      );
    }
  }

  private _layers(): FillLayer[] {
    return [...(this._appearance.layers ?? [])];
  }

  private _replaceLayer(patch: Partial<FillLayer>, undoKey: string) {
    const layers = this._layers();
    const layer = layers[this._selectedLayer];
    if (!layer) {
      return;
    }
    layers[this._selectedLayer] = { ...layer, ...patch } as FillLayer;
    this._setLayers(layers, `layer-${this._selectedLayer}-${undoKey}`);
  }

  private _addLayer(ev: Event) {
    const type = (
      ev.currentTarget as HTMLElement & { layerType: FillLayer["type"] }
    ).layerType;
    const base = { opacity: 1, blend: "normal" as BlendMode, visible: true };
    const layer: FillLayer =
      type === "color"
        ? { ...base, type, color: "#cfe3ff" }
        : type === "gradient"
          ? { ...base, type, angle: 160, from: "#cfe3ff", to: "#ead7ff" }
          : {
              ...base,
              type,
              // A picture layer needs an address before it is valid; until
              // one is typed it holds a one-pixel clear picture.
              url: "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==",
              size: "cover",
              position: "center",
              repeat: false,
            };
    this._selectedLayer = 0;
    this._setLayers([layer, ...this._layers()], "add");
  }

  private _selectLayer(ev: Event) {
    this._selectedLayer = (
      ev.currentTarget as HTMLElement & { index: number }
    ).index;
    this._urlError = false;
  }

  private _toggleLayer(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    const layers = this._layers();
    layers[index] = { ...layers[index], visible: !layers[index].visible };
    this._setLayers(layers, `toggle-${index}`);
  }

  private _moveLayer(ev: Event) {
    const { index, delta } = ev.currentTarget as HTMLElement & {
      index: number;
      delta: number;
    };
    const layers = this._layers();
    const target = index + delta;
    if (target < 0 || target >= layers.length) {
      return;
    }
    [layers[index], layers[target]] = [layers[target], layers[index]];
    this._selectedLayer = target;
    this._setLayers(layers, "move");
  }

  private _removeLayer(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    const layers = this._layers();
    layers.splice(index, 1);
    this._selectedLayer = Math.max(0, Math.min(index, layers.length - 1));
    this._setLayers(layers, "remove");
  }

  private _layerColor(ev: Event) {
    const picker = ev.currentTarget as HTMLElement & { field: string };
    this._replaceLayer(
      { [picker.field]: (ev as CustomEvent<{ value: string }>).detail.value },
      picker.field
    );
  }

  private _layerNumber(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement & { field: string };
    const value = Number(input.value);
    this._replaceLayer(
      { [input.field]: input.field === "opacity" ? value / 100 : value },
      input.field
    );
  }

  private _layerText(ev: Event) {
    const select = ev.currentTarget as HTMLSelectElement & { field: string };
    this._replaceLayer({ [select.field]: select.value }, select.field);
  }

  private _layerBlend(ev: Event) {
    this._replaceLayer(
      { blend: (ev.currentTarget as HTMLSelectElement).value as BlendMode },
      "blend"
    );
  }

  private _layerRepeat(ev: Event) {
    this._replaceLayer(
      { repeat: (ev.currentTarget as HTMLInputElement).checked },
      "repeat"
    );
  }

  private _layerUrl(ev: Event) {
    const url = (ev.currentTarget as HTMLInputElement).value.trim();
    if (!isSafeImageUrl(url)) {
      this._urlError = true;
      return;
    }
    this._urlError = false;
    this._replaceLayer({ url }, "url");
  }

  static styles: CSSResultGroup = css`
    :host {
      font-family: var(--ha-font-family-body);
    }
    [popover] {
      border: none;
      margin: 0;
      padding: 0;
      inset: auto;
    }
    #outline {
      position: fixed;
      box-sizing: border-box;
      border: 3px solid var(--primary-color);
      border-radius: var(--ha-border-radius-lg);
      background: none;
      pointer-events: none;
      overflow: visible;
    }
    #panel {
      position: fixed;
      top: var(--ha-space-4);
      bottom: var(--ha-space-4);
      width: min(400px, calc(100vw - var(--ha-space-8)));
      height: auto;
      max-height: calc(100dvh - var(--ha-space-8));
      border-radius: var(--ha-border-radius-3xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
      overflow: hidden;
    }
    #panel:popover-open {
      display: flex;
      flex-direction: column;
    }
    #panel.right {
      right: var(--ha-space-4);
    }
    #panel.left {
      left: var(--ha-space-4);
    }
    header,
    footer {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-3)
        var(--ha-space-6);
    }
    footer {
      flex-wrap: wrap;
      padding: var(--ha-space-3) var(--ha-space-6) var(--ha-space-4);
      border-top: 1px solid var(--divider-color);
    }
    .heading {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .title {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .subtitle,
    .hint,
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .note {
      flex: 1 1 100%;
      white-space: normal;
    }
    ha-instance-sync-status {
      flex: 1 1 100%;
      font-size: var(--ha-font-size-s);
    }
    .body {
      flex: 1;
      overflow-y: auto;
      padding: 0 var(--ha-space-6) var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-5);
    }
    /* Rows of a scrolling column keep their height instead of being squeezed. */
    .body > * {
      flex-shrink: 0;
    }
    section {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .section-head {
      display: flex;
      align-items: baseline;
      gap: var(--ha-space-2);
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      padding: 0;
    }
    button:focus-visible,
    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    button[disabled] {
      opacity: 0.4;
      cursor: default;
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-pill);
      flex: none;
      --mdc-icon-size: 20px;
    }
    .icon.small {
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      --mdc-icon-size: 18px;
    }
    .icon:hover:not([disabled]) {
      background: var(--ha-color-fill-neutral-quiet-hover);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--outline-color);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 16px;
    }
    .chip.on {
      border-color: transparent;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .text {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-height: var(--ha-space-10);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
      --mdc-icon-size: 18px;
    }
    .text.danger {
      color: var(--error-color);
      margin-inline-start: auto;
    }
    .layers {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .layer {
      display: flex;
      align-items: center;
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    .layer.on {
      background: var(--ha-color-fill-primary-normal-resting);
    }
    .layer.hidden .layer-main {
      opacity: 0.55;
    }
    .layer-main {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      flex: 1;
      min-width: 0;
      min-height: var(--ha-space-12);
      text-align: start;
    }
    .layer-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .swatch {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--divider-color);
      flex: none;
      --mdc-icon-size: 18px;
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      border: 1px solid var(--divider-color);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: var(--ha-space-10);
    }
    .row > span:first-child {
      flex: 0 0 104px;
      font-size: var(--ha-font-size-s);
    }
    .row.stacked {
      flex-direction: column;
      align-items: stretch;
      gap: var(--ha-space-1);
    }
    .row.stacked > span:first-child {
      flex: none;
    }
    .row input[type="range"],
    .row select,
    .row input[type="url"] {
      flex: 1;
      min-width: 0;
      accent-color: var(--primary-color);
    }
    .row select,
    .row input[type="url"] {
      height: var(--ha-space-9);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
      font-size: var(--ha-font-size-s);
    }
    .row input.invalid {
      border-color: var(--error-color);
    }
    .row.colour {
      flex-wrap: wrap;
    }
    .row.colour > span {
      flex: 1;
    }
    .row.colour ha-appearance-color-picker {
      order: 3;
      flex: 1 1 100%;
    }
    .row input[type="color"] {
      width: var(--ha-space-10);
      height: var(--ha-space-8);
      padding: 0;
      border: 1px solid var(--outline-color);
      border-radius: var(--ha-border-radius-md);
      background: none;
      flex: none;
    }
    .row input[type="checkbox"] {
      width: 20px;
      height: 20px;
      accent-color: var(--primary-color);
    }
    output {
      flex: 0 0 76px;
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      text-align: end;
      font-variant-numeric: tabular-nums;
    }
    .row input[type="color"] + output {
      flex: 1;
      text-align: start;
    }
    .error {
      margin: 0;
      color: var(--error-color);
      font-size: var(--ha-font-size-s);
    }
    .contrast {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      margin: 0;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-success-quiet-resting);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 20px;
    }
    .contrast.low {
      background: var(--ha-color-fill-warning-quiet-resting);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-appearance-editor": HaAppearanceEditor;
  }
}
