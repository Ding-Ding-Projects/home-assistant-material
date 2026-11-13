import {
  mdiArrowDown,
  mdiArrowUp,
  mdiClose,
  mdiDragHorizontalVariant,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { BUILDER_PIECE_DRAG_TYPE } from "../../common/string-builder/drag";
import {
  ARITHMETIC_OPS,
  COMPARE_OPS,
  CUSTOM_DATETIME,
  DATETIME_PRESETS,
  ELAPSED_STYLES,
  NAME_CHOICES,
  presetIdForFormat,
} from "../../common/string-builder/presets";
import type {
  CompareValue,
  ConditionPiece,
  Piece,
} from "../../common/string-builder/types";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "../entity/ha-entities-picker";
import "../entity/ha-entity-attribute-picker";
import "../entity/ha-entity-picker";
import "../ha-icon-button";
import "../ha-select";
import type { HaSelectSelectEvent } from "../ha-select";
import "../ha-svg-icon";
import "../ha-switch";
import "../ha-textarea";
import "../input/ha-input";
import "./ha-string-builder-editor";
import { PIECE_ICONS } from "./piece-icons";

declare global {
  interface HASSDomEvents {
    "piece-changed": { piece: Piece };
    "piece-remove": undefined;
    "piece-move": { delta: number };
  }
}

const KEY = "ui.components.string_builder";

type Convert = (value: any) => unknown;

const toNumber: Convert = (value) => Number(value) || 0;
const toPrecision: Convert = (value) => Number(value) || 1;
const toDecimals: Convert = (value) =>
  Math.max(0, Math.min(6, Math.trunc(Number(value)) || 0));
const toFallback: Convert = (checked) => (checked ? "" : undefined);

/** A copy of `target` with the value at `path` replaced. */
const setIn = (target: any, path: string[], value: unknown): any => {
  if (path.length === 0) {
    return value;
  }
  const [head, ...rest] = path;
  return { ...target, [head]: setIn(target?.[head], rest, value) };
};

/** One piece of the text, shown as a card that edits it in place. */
@customElement("ha-string-builder-piece")
export class HaStringBuilderPiece extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public piece!: Piece;

  @property({ type: Number }) public depth = 0;

  @property({ type: Boolean }) public first = false;

  @property({ type: Boolean }) public last = false;

  @property({ type: Boolean }) public disabled = false;

  @query(
    ".body textarea, .body ha-entity-picker, .body ha-input, .body ha-textarea, .body ha-select"
  )
  private _editor?: HTMLElement;

  public async focusEditor() {
    await this.updateComplete;
    this._editor?.focus();
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`${KEY}.${key}` as any, values as any);
  }

  protected render() {
    const piece = this.piece;
    return html`
      <div class="card kind-${piece.kind}">
        <div class="head">
          <ha-svg-icon
            class="handle"
            .path=${mdiDragHorizontalVariant}
            aria-hidden="true"
          ></ha-svg-icon>
          <span class="tile"
            ><ha-svg-icon .path=${PIECE_ICONS[piece.kind]}></ha-svg-icon
          ></span>
          <span class="title">${this._t(`kinds.${piece.kind}`)}</span>
          <ha-icon-button
            .label=${this._t("move_up")}
            .path=${mdiArrowUp}
            .disabled=${this.disabled || this.first}
            @click=${this._moveUp}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this._t("move_down")}
            .path=${mdiArrowDown}
            .disabled=${this.disabled || this.last}
            @click=${this._moveDown}
          ></ha-icon-button>
          <ha-icon-button
            .label=${this._t("remove")}
            .path=${mdiClose}
            .disabled=${this.disabled}
            @click=${this._remove}
          ></ha-icon-button>
        </div>
        <div class="body">${this._renderBody(piece)}</div>
      </div>
    `;
  }

  private _renderBody(piece: Piece): TemplateResult | typeof nothing {
    switch (piece.kind) {
      case "text":
        return this._renderText(piece.text);
      case "state":
        return this._renderState(piece);
      case "attribute":
        return this._renderAttribute(piece);
      case "name":
        return this._renderName(piece);
      case "datetime":
        return this._renderDateTime(piece);
      case "elapsed":
        return this._renderElapsed(piece);
      case "number":
        return this._renderNumber(piece);
      case "condition":
        return this._renderCondition(piece);
      case "count":
        return this._renderCount(piece);
      case "raw":
        return this._renderRaw(piece.template);
      default:
        return nothing;
    }
  }

  // Event handlers, each bound to one field of the piece by its path.

  private _onPicker = (path: string) => (ev: CustomEvent) => {
    ev.stopPropagation();
    this._commit(path, ev.detail.value ?? "");
  };

  private _onEntities = (path: string) => (ev: CustomEvent) => {
    ev.stopPropagation();
    this._commit(path, ev.detail.value ?? []);
  };

  private _onInput = (path: string, convert?: Convert) => (ev: Event) => {
    ev.stopPropagation();
    const value = (ev.target as HTMLInputElement).value;
    this._commit(path, convert ? convert(value) : value);
  };

  private _onSelected =
    (path: string, convert?: Convert) => (ev: HaSelectSelectEvent) => {
      ev.stopPropagation();
      if (ev.detail.value !== undefined) {
        this._commit(
          path,
          convert ? convert(ev.detail.value) : ev.detail.value
        );
      }
    };

  private _onSwitch = (path: string, convert?: Convert) => (ev: Event) => {
    ev.stopPropagation();
    const checked = (ev.target as HTMLInputElement).checked;
    this._commit(path, convert ? convert(checked) : checked);
  };

  private _onBranch = (path: string) => (ev: CustomEvent) => {
    ev.stopPropagation();
    this._commit(path, ev.detail.pieces);
  };

  private _onPreset = (ev: HaSelectSelectEvent) => {
    ev.stopPropagation();
    const preset = DATETIME_PRESETS.find((item) => item.id === ev.detail.value);
    if (preset) {
      this._commit("format", preset.format);
    } else if (ev.detail.value === CUSTOM_DATETIME) {
      this._commit("format", this._formatOr("%H:%M"));
    }
  };

  private _onOperator = (ev: HaSelectSelectEvent) => {
    ev.stopPropagation();
    const op = ev.detail.value as ConditionPiece["op"];
    if (!op) {
      return;
    }
    const piece = this.piece as ConditionPiece;
    const leftAs =
      op === "above" || op === "below" || op === "between"
        ? "number"
        : op === "contains"
          ? "text"
          : piece.leftAs;
    fireEvent(this, "piece-changed", { piece: { ...piece, op, leftAs } });
  };

  private _formatOr(fallback: string): string {
    return this.piece.kind === "datetime" ? this.piece.format : fallback;
  }

  // Shared controls

  private _entityPicker(value: string, path: string) {
    return html`<ha-entity-picker
      .hass=${this.hass}
      .label=${this._t("fields.entity")}
      .value=${value}
      .disabled=${this.disabled}
      @value-changed=${this._onPicker(path)}
    ></ha-entity-picker>`;
  }

  private _input(
    label: string,
    value: string | number,
    path: string,
    type?: "number",
    convert?: Convert
  ) {
    return html`<ha-input
      .label=${label}
      .value=${String(value)}
      .type=${type}
      .disabled=${this.disabled}
      @input=${this._onInput(path, convert)}
    ></ha-input>`;
  }

  private _select(
    label: string,
    value: string,
    options: { value: string; label: string }[],
    onSelected: (ev: HaSelectSelectEvent) => void
  ) {
    return html`<ha-select
      .label=${label}
      .value=${value}
      .options=${options}
      .disabled=${this.disabled}
      @selected=${onSelected}
    ></ha-select>`;
  }

  private _switch(
    label: string,
    checked: boolean,
    path: string,
    convert?: Convert
  ) {
    return html`<label class="switch-row">
      <ha-switch
        .checked=${checked}
        .disabled=${this.disabled}
        @change=${this._onSwitch(path, convert)}
      ></ha-switch>
      <span>${label}</span>
    </label>`;
  }

  private _fallbackControls(fallback: string | undefined) {
    return html`
      ${this._switch(
        this._t("fields.use_fallback"),
        fallback !== undefined,
        "fallback",
        toFallback
      )}
      ${
        fallback !== undefined
          ? this._input(this._t("fields.fallback"), fallback, "fallback")
          : nothing
      }
    `;
  }

  // One renderer per kind

  private _renderText(text: string) {
    return html`
      <label class="text-label">
        ${this._t("fields.text")}
        <textarea
          .value=${text}
          .disabled=${this.disabled}
          rows="2"
          autocapitalize="none"
          spellcheck="false"
          @input=${this._textInput}
          @click=${this._textCaret}
          @keyup=${this._textCaret}
          @select=${this._textCaret}
          @dragover=${this._textDragOver}
          @drop=${this._textDrop}
        ></textarea>
      </label>
    `;
  }

  private _textInput(ev: Event) {
    this._onInput("text")(ev);
    this._textCaret(ev);
  }

  private _textCaret(ev: Event) {
    const text = ev.currentTarget as HTMLTextAreaElement;
    fireEvent(this, "builder-text-caret", {
      pieceId: this.piece.id,
      offset: text.selectionEnd,
    });
  }

  private _textDragOver(ev: DragEvent) {
    if (
      !this.disabled &&
      ev.dataTransfer?.types.includes(BUILDER_PIECE_DRAG_TYPE)
    ) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "copy";
    }
  }

  private _textDrop(ev: DragEvent) {
    if (
      this.disabled ||
      !ev.dataTransfer?.types.includes(BUILDER_PIECE_DRAG_TYPE)
    ) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    const field = ev.currentTarget as HTMLTextAreaElement;
    const shadowRoots: ShadowRoot[] = [];
    let parent: Node = field;
    while (parent.getRootNode() instanceof ShadowRoot) {
      const root = parent.getRootNode() as ShadowRoot;
      shadowRoots.push(root);
      parent = root.host;
    }
    const doc = field.ownerDocument;
    const caret = doc.caretPositionFromPoint?.(ev.clientX, ev.clientY, {
      shadowRoots,
    });
    const fallback =
      caret?.offsetNode === field
        ? null
        : doc.caretRangeFromPoint?.(ev.clientX, ev.clientY);
    const offset =
      caret?.offsetNode === field
        ? caret.offset
        : fallback?.startContainer === field
          ? fallback.startOffset
          : field.selectionEnd;
    fireEvent(this, "builder-text-drop", { pieceId: this.piece.id, offset });
  }

  private _renderState(piece: Piece & { kind: "state" }) {
    return html`
      ${this._entityPicker(piece.entity, "entity")}
      ${this._switch(this._t("fields.with_unit"), piece.withUnit, "withUnit")}
      ${this._fallbackControls(piece.fallback)}
    `;
  }

  private _renderAttribute(piece: Piece & { kind: "attribute" }) {
    return html`
      ${this._entityPicker(piece.entity, "entity")}
      <ha-entity-attribute-picker
        .hass=${this.hass}
        .label=${this._t("fields.attribute")}
        .entityId=${piece.entity || undefined}
        .value=${piece.attribute}
        .disabled=${this.disabled || !piece.entity}
        allow-custom-value
        @value-changed=${this._onPicker("attribute")}
      ></ha-entity-attribute-picker>
      ${this._fallbackControls(piece.fallback)}
    `;
  }

  private _renderName(piece: Piece & { kind: "name" }) {
    return html`
      ${this._entityPicker(piece.entity, "entity")}
      ${this._select(
        this._t("fields.show"),
        piece.what,
        NAME_CHOICES.map((choice) => ({
          value: choice,
          label: this._t(`name_choices.${choice}`),
        })),
        this._onSelected("what")
      )}
    `;
  }

  private _renderDateTime(piece: Piece & { kind: "datetime" }) {
    const presetId = presetIdForFormat(piece.format);
    return html`
      ${this._select(
        this._t("fields.format"),
        presetId,
        [
          ...DATETIME_PRESETS.map((preset) => ({
            value: preset.id,
            label: this._t(`datetime_presets.${preset.id}`),
          })),
          {
            value: CUSTOM_DATETIME,
            label: this._t("datetime_presets.custom"),
          },
        ],
        this._onPreset
      )}
      ${
        presetId === CUSTOM_DATETIME
          ? this._input(this._t("fields.custom_format"), piece.format, "format")
          : nothing
      }
    `;
  }

  private _renderElapsed(piece: Piece & { kind: "elapsed" }) {
    return html`
      ${this._entityPicker(piece.entity, "entity")}
      ${this._select(
        this._t("fields.direction"),
        piece.direction,
        (["since", "until"] as const).map((direction) => ({
          value: direction,
          label: this._t(`elapsed_directions.${direction}`),
        })),
        this._onSelected("direction")
      )}
      ${this._select(
        this._t("fields.elapsed_source"),
        piece.source,
        (["last_changed", "last_updated", "state"] as const).map((source) => ({
          value: source,
          label: this._t(`elapsed_sources.${source}`),
        })),
        this._onSelected("source")
      )}
      ${this._select(
        this._t("fields.elapsed_style"),
        piece.style,
        ELAPSED_STYLES.map((style) => ({
          value: style,
          label: this._t(`elapsed_styles.${style}`),
        })),
        this._onSelected("style")
      )}
      ${
        piece.style === "words"
          ? this._select(
              this._t("fields.precision"),
              String(piece.precision),
              ["1", "2", "3"].map((value) => ({ value, label: value })),
              this._onSelected("precision", toPrecision)
            )
          : nothing
      }
    `;
  }

  private _renderNumber(piece: Piece & { kind: "number" }) {
    return html`
      ${this._entityPicker(piece.entity, "entity")}
      ${this._input(
        this._t("fields.decimals"),
        piece.decimals,
        "decimals",
        "number",
        toDecimals
      )}
      ${this._select(
        this._t("fields.arithmetic"),
        piece.op,
        ARITHMETIC_OPS.map((op) => ({
          value: op,
          label: this._t(`arithmetic.${op}`),
        })),
        this._onSelected("op")
      )}
      ${
        piece.op !== "none"
          ? this._input(
              this._t("fields.operand"),
              piece.operand,
              "operand",
              "number",
              toNumber
            )
          : nothing
      }
      ${this._input(this._t("fields.not_a_number"), piece.fallback, "fallback")}
    `;
  }

  private _renderValue(
    label: string,
    value: CompareValue,
    asNumber: boolean,
    path: string
  ) {
    return html`
      <div class="value-group" role="group" aria-label=${label}>
        ${this._select(
          label,
          value.mode,
          (["literal", "entity"] as const).map((mode) => ({
            value: mode,
            label: this._t(`value_modes.${mode}`),
          })),
          this._onSelected(`${path}.mode`)
        )}
        ${
          value.mode === "entity"
            ? this._entityPicker(value.entity, `${path}.entity`)
            : this._input(
                this._t(asNumber ? "fields.number_value" : "fields.text_value"),
                value.literal,
                `${path}.literal`,
                asNumber ? "number" : undefined
              )
        }
      </div>
    `;
  }

  private _renderBranch(
    piece: ConditionPiece,
    key: "thenPieces" | "elsePieces",
    label: string
  ) {
    return html`
      <div class="branch">
        <div class="branch-title">${label}</div>
        <ha-string-builder-editor
          .hass=${this.hass}
          .pieces=${piece[key]}
          .depth=${this.depth + 1}
          .disabled=${this.disabled}
          @pieces-changed=${this._onBranch(key)}
        ></ha-string-builder-editor>
      </div>
    `;
  }

  private _renderCondition(piece: ConditionPiece) {
    const numeric =
      piece.op !== "contains" &&
      (piece.leftAs === "number" ||
        piece.op === "above" ||
        piece.op === "below" ||
        piece.op === "between");
    return html`
      ${this._entityPicker(piece.leftEntity, "leftEntity")}
      ${this._select(
        this._t("fields.compare"),
        piece.op,
        COMPARE_OPS.map((op) => ({
          value: op,
          label: this._t(`compare_ops.${op}`),
        })),
        this._onOperator
      )}
      ${
        piece.op === "is" || piece.op === "is_not"
          ? this._select(
              this._t("fields.compare_as"),
              piece.leftAs,
              (["text", "number"] as const).map((as) => ({
                value: as,
                label: this._t(`compare_as.${as}`),
              })),
              this._onSelected("leftAs")
            )
          : nothing
      }
      ${this._renderValue(
        this._t(piece.op === "between" ? "fields.from_value" : "fields.value"),
        piece.right,
        numeric,
        "right"
      )}
      ${
        piece.op === "between"
          ? this._renderValue(
              this._t("fields.to_value"),
              piece.rightEnd,
              true,
              "rightEnd"
            )
          : nothing
      }
      ${this._renderBranch(piece, "thenPieces", this._t("then_show"))}
      ${this._renderBranch(piece, "elsePieces", this._t("else_show"))}
    `;
  }

  private _renderCount(piece: Piece & { kind: "count" }) {
    return html`
      <ha-entities-picker
        .hass=${this.hass}
        .label=${this._t("fields.entities")}
        .value=${piece.entities}
        .disabled=${this.disabled}
        @value-changed=${this._onEntities("entities")}
      ></ha-entities-picker>
      ${this._input(this._t("fields.counted_state"), piece.state, "state")}
    `;
  }

  private _renderRaw(template: string) {
    return html`<ha-textarea
      class="code"
      dir="ltr"
      .label=${this._t("fields.raw")}
      .value=${template}
      .disabled=${this.disabled}
      resize="auto"
      autocapitalize="none"
      spellcheck="false"
      @input=${this._onInput("template")}
    ></ha-textarea>`;
  }

  private _commit(path: string, value: unknown) {
    fireEvent(this, "piece-changed", {
      piece: setIn(this.piece, path.split("."), value) as Piece,
    });
  }

  private _moveUp() {
    fireEvent(this, "piece-move", { delta: -1 });
  }

  private _moveDown() {
    fireEvent(this, "piece-move", { delta: 1 });
  }

  private _remove() {
    fireEvent(this, "piece-remove");
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .card {
        border: 1px solid var(--ha-color-outline, var(--divider-color));
        border-radius: var(--ha-border-radius-xl);
        background: var(--card-background-color);
        overflow: hidden;
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-1);
        padding: var(--ha-space-1) var(--ha-space-1) var(--ha-space-1)
          var(--ha-space-2);
        background: var(
          --ha-color-surface-tone-1,
          var(--secondary-background-color)
        );
      }
      .handle {
        cursor: grab;
        color: var(--secondary-text-color);
        flex: none;
      }
      .tile {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: none;
        width: 28px;
        height: 28px;
        border-radius: var(--ha-border-radius-md);
        background: var(--ha-color-primary-container, var(--primary-color));
        color: var(--ha-color-on-primary-container, var(--text-primary-color));
      }
      .tile ha-svg-icon {
        --mdc-icon-size: 18px;
        width: 18px;
        height: 18px;
      }
      .title {
        flex: 1;
        min-width: 0;
        font-weight: var(--ha-font-weight-semibold);
        overflow-wrap: anywhere;
        margin-inline: var(--ha-space-1);
      }
      .text-label {
        display: grid;
        gap: var(--ha-space-1);
      }
      .text-label textarea {
        box-sizing: border-box;
        width: 100%;
        min-height: 48px;
        resize: vertical;
        padding: var(--ha-space-3);
        color: var(--primary-text-color);
        background: var(
          --ha-color-surface-tone-1,
          var(--secondary-background-color)
        );
        border: 1px solid var(--divider-color);
        border-radius: var(--ha-border-radius-md);
        font: inherit;
      }
      .text-label textarea:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: 1px;
      }
      ha-icon-button {
        --ha-icon-button-size: 36px;
        flex: none;
      }
      .body {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3);
      }
      .body > * {
        min-width: 0;
      }
      ha-select,
      ha-input,
      ha-textarea,
      ha-entity-picker,
      ha-entities-picker,
      ha-entity-attribute-picker {
        display: block;
        width: 100%;
      }
      .code {
        font-family: var(--ha-font-family-code);
      }
      .switch-row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        cursor: pointer;
      }
      .value-group {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .branch {
        border-inline-start: 3px solid
          var(--ha-color-outline, var(--divider-color));
        padding-inline-start: var(--ha-space-3);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .branch-title {
        font-weight: var(--ha-font-weight-semibold);
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-string-builder-piece": HaStringBuilderPiece;
  }
}
