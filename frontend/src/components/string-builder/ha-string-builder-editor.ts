import { css, html, LitElement } from "lit";
import { customElement, property, queryAll } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { createPiece } from "../../common/string-builder/create-piece";
import { BUILDER_PIECE_DRAG_TYPE } from "../../common/string-builder/drag";
import type { TextInsertion } from "../../common/string-builder/insert-piece";
import { insertPiece } from "../../common/string-builder/insert-piece";
import { PIECE_KINDS } from "../../common/string-builder/presets";
import type { Piece, PieceKind } from "../../common/string-builder/types";
import { MAX_CONDITION_DEPTH } from "../../common/string-builder/types";
import type { HomeAssistant } from "../../types";
import "../chips/ha-assist-chip";
import "../ha-sortable";
import "../ha-svg-icon";
import "./ha-string-builder-piece";
import { PIECE_ICONS } from "./piece-icons";

declare global {
  interface HASSDomEvents {
    "pieces-changed": { pieces: Piece[] };
    "builder-text-caret": TextInsertion;
    "builder-text-drop": TextInsertion;
  }
}

const KEY = "ui.components.string_builder";

/** An ordered list of pieces with a row of chips that add more. */
@customElement("ha-string-builder-editor")
export class HaStringBuilderEditor extends LitElement {
  private _languageMode = new LanguageModeController(this);
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public pieces: Piece[] = [];

  /** 0 for the top level; a condition's branches are one deeper. */
  @property({ type: Number }) public depth = 0;

  @property({ type: Boolean }) public disabled = false;

  private _insertion?: TextInsertion;
  private _draggedKind?: PieceKind;
  @queryAll("ha-string-builder-piece")
  private _pieceElements!: NodeListOf<
    HTMLElementTagNameMap["ha-string-builder-piece"]
  >;

  protected render() {
    const kinds = PIECE_KINDS.filter(
      (kind) => kind !== "condition" || this.depth <= MAX_CONDITION_DEPTH
    );
    return html`
      ${
        this.pieces.length
          ? html`<ha-sortable
              handle-selector=".handle"
              draggable-selector="ha-string-builder-piece"
              .disabled=${this.disabled}
              @item-moved=${this._itemMoved}
            >
              <div class="pieces">
                ${repeat(
                  this.pieces,
                  (piece) => piece.id,
                  (piece, index) => html`
                    <ha-string-builder-piece
                      .hass=${this.hass}
                      .piece=${piece}
                      .depth=${this.depth}
                      .first=${index === 0}
                      .last=${index === this.pieces.length - 1}
                      .disabled=${this.disabled}
                      @piece-changed=${this._pieceChanged(index)}
                      @piece-remove=${this._pieceRemoved(index)}
                      @piece-move=${this._pieceMoved(index)}
                      @builder-text-caret=${this._rememberCaret}
                      @builder-text-drop=${this._dropPiece}
                    ></ha-string-builder-piece>
                  `
                )}
              </div>
            </ha-sortable>`
          : html`<p class="empty">
              ${this.hass.localize(`${KEY}.empty` as any)}
            </p>`
      }
      <p class="placement-help">
        ${this._languageMode.text(this.hass.localize, `${KEY}.insert_help`)}
      </p>
      <div
        class="chips"
        role="group"
        aria-label=${this.hass.localize(`${KEY}.add` as any)}
      >
        ${kinds.map(
          (kind) => html`
            <ha-assist-chip
              .label=${this.hass.localize(`${KEY}.kinds.${kind}` as any)}
              ?disabled=${this.disabled}
              draggable=${String(!this.disabled)}
              data-kind=${kind}
              @dragstart=${this._dragStart}
              @dragend=${this._dragEnd}
              @click=${this._addClicked}
            >
              <ha-svg-icon slot="icon" .path=${PIECE_ICONS[kind]}></ha-svg-icon>
            </ha-assist-chip>
          `
        )}
      </div>
    `;
  }

  private _emit(pieces: Piece[]) {
    fireEvent(this, "pieces-changed", { pieces });
  }

  private _addClicked(ev: Event) {
    const kind = (ev.currentTarget as HTMLElement).dataset.kind as PieceKind;
    if (!this.disabled) this._insert(kind);
  }

  private _rememberCaret(ev: CustomEvent<TextInsertion>) {
    ev.stopPropagation();
    this._insertion = ev.detail;
  }

  private _dragStart(ev: DragEvent) {
    ev.stopPropagation();
    if (this.disabled || !ev.dataTransfer) return;
    this._draggedKind = (ev.currentTarget as HTMLElement).dataset
      .kind as PieceKind;
    ev.dataTransfer.setData(BUILDER_PIECE_DRAG_TYPE, "");
    ev.dataTransfer.effectAllowed = "copy";
  }

  private _dragEnd() {
    this._draggedKind = undefined;
  }

  private _dropPiece(ev: CustomEvent<TextInsertion>) {
    ev.stopPropagation();
    const kind = this._draggedKind;
    this._draggedKind = undefined;
    if (!this.disabled && kind) this._insert(kind, ev.detail);
  }

  private _insert(kind: PieceKind, position = this._insertion) {
    this._insertion = undefined;
    const piece = createPiece(kind);
    this._emit(insertPiece(this.pieces, piece, position));
    void this.updateComplete.then(() => {
      const inserted = Array.from(this._pieceElements).find(
        (item) => item.piece.id === piece.id
      );
      inserted?.focusEditor();
    });
  }

  private _pieceChanged = (index: number) => (ev: CustomEvent) => {
    ev.stopPropagation();
    const pieces = [...this.pieces];
    pieces[index] = ev.detail.piece;
    this._emit(pieces);
  };

  private _pieceRemoved = (index: number) => (ev: Event) => {
    ev.stopPropagation();
    this._emit(this.pieces.filter((_piece, i) => i !== index));
  };

  private _pieceMoved = (index: number) => (ev: CustomEvent) => {
    ev.stopPropagation();
    this._reorder(index, index + ev.detail.delta);
  };

  private _itemMoved(ev: CustomEvent<{ oldIndex: number; newIndex: number }>) {
    ev.stopPropagation();
    this._reorder(ev.detail.oldIndex, ev.detail.newIndex);
  }

  private _reorder(from: number, to: number) {
    if (to < 0 || to >= this.pieces.length || from === to) {
      return;
    }
    const pieces = [...this.pieces];
    const [moved] = pieces.splice(from, 1);
    pieces.splice(to, 0, moved);
    this._emit(pieces);
  }

  static styles = css`
    :host {
      display: block;
    }
    .pieces {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
    }
    .empty {
      margin: 0 0 var(--ha-space-3);
      color: var(--secondary-text-color);
    }
    .placement-help {
      margin: 0 0 var(--ha-space-2);
      color: var(--secondary-text-color);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-string-builder-editor": HaStringBuilderEditor;
  }
}
