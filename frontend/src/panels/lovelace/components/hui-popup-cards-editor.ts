import {
  mdiArrowDown,
  mdiArrowLeft,
  mdiArrowUp,
  mdiDelete,
  mdiPencil,
  mdiPlus,
} from "@mdi/js";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { keyed } from "lit/directives/keyed";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { HomeAssistant } from "../../../types";
import "../editor/card-editor/hui-card-element-editor";
import "../editor/card-editor/hui-card-picker";
import type { ConfigChangedEvent } from "../editor/hui-element-editor";
import { getConfigEntityId } from "../common/get-config-entity-id";
import { MAX_POPUP_CARDS, moveCard } from "../common/popup-action";

declare global {
  interface HASSDomEvents {
    "popup-cards-changed": { cards: LovelaceCardConfig[] };
  }
}

type View = "list" | "edit" | "add";

/**
 * The list of cards inside a pop-up action. Cards are added with the normal
 * card picker, edited with the normal card editor, and can be reordered and
 * removed. Everything happens inline, because the card edit dialog may
 * already be the place this editor is shown in.
 */
@customElement("hui-popup-cards-editor")
export class HuiPopupCardsEditor extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public lovelace?: LovelaceConfig;

  @property({ attribute: false }) public cards: LovelaceCardConfig[] = [];

  @state() private _view: View = "list";

  @state() private _index = 0;

  private _keys = new Map<string, string>();

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.lovelace.editor.action-editor.popup.${key}` as any,
      values
    );
  }

  private _cardLabel(card: LovelaceCardConfig): string {
    const named = card.title ?? card.name ?? card.heading;
    if (typeof named === "string" && named.trim()) {
      return named.trim();
    }
    const entityId = getConfigEntityId(card);
    if (entityId) {
      return this.hass.states[entityId]?.attributes.friendly_name ?? entityId;
    }
    return this._cardType(card);
  }

  private _cardType(card: LovelaceCardConfig): string {
    return (
      this.hass.localize(
        `ui.panel.lovelace.editor.card.${card.type}.name` as any
      ) || card.type
    );
  }

  protected render() {
    if (this._view === "add") {
      return html`
        ${this._backButton()}
        <hui-card-picker
          .hass=${this.hass}
          .lovelace=${this.lovelace}
          @config-changed=${this._cardPicked}
        ></hui-card-picker>
      `;
    }
    if (this._view === "edit" && this.cards[this._index]) {
      return html`
        ${this._backButton()}
        ${keyed(
          this._keyFor(this._index),
          html`<hui-card-element-editor
            .hass=${this.hass}
            .lovelace=${this.lovelace}
            .value=${this.cards[this._index]}
            @config-changed=${this._cardEdited}
          ></hui-card-element-editor>`
        )}
      `;
    }
    return html`
      ${
        this.cards.length
          ? html`<ul class="cards">
              ${this.cards.map((card, index) => this._renderRow(card, index))}
            </ul>`
          : html`<p class="empty">${this._t("empty")}</p>`
      }
      <ha-button
        appearance="filled"
        .disabled=${this.cards.length >= MAX_POPUP_CARDS}
        @click=${this._startAdd}
      >
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${this._t("add_card")}
      </ha-button>
    `;
  }

  private _backButton() {
    return html`<ha-button
      class="back"
      appearance="plain"
      size="small"
      @click=${this._showList}
    >
      <ha-svg-icon slot="start" .path=${mdiArrowLeft}></ha-svg-icon>
      ${this._t("back_to_list")}
    </ha-button>`;
  }

  private _renderRow(card: LovelaceCardConfig, index: number) {
    return html`
      <li>
        <div class="text">
          <span class="name">${this._cardLabel(card)}</span>
          <span class="type">${this._cardType(card)}</span>
        </div>
        <ha-icon-button
          .label=${this._t("move_up")}
          .path=${mdiArrowUp}
          .disabled=${index === 0}
          .index=${index}
          .move=${-1}
          @click=${this._move}
        ></ha-icon-button>
        <ha-icon-button
          .label=${this._t("move_down")}
          .path=${mdiArrowDown}
          .disabled=${index === this.cards.length - 1}
          .index=${index}
          .move=${1}
          @click=${this._move}
        ></ha-icon-button>
        <ha-icon-button
          .label=${this._t("edit_card")}
          .path=${mdiPencil}
          .index=${index}
          @click=${this._edit}
        ></ha-icon-button>
        <ha-icon-button
          .label=${this._t("remove_card")}
          .path=${mdiDelete}
          .index=${index}
          @click=${this._remove}
        ></ha-icon-button>
      </li>
    `;
  }

  private _keyFor(index: number): string {
    const key = `${index}-${this.cards.length}`;
    if (!this._keys.has(key)) {
      this._keys.set(key, Math.random().toString());
    }
    return this._keys.get(key)!;
  }

  private _emit(cards: LovelaceCardConfig[]) {
    this._keys.clear();
    fireEvent(this, "popup-cards-changed", { cards });
  }

  private _showList() {
    this._view = "list";
  }

  private _startAdd() {
    this._view = "add";
  }

  private _cardPicked(ev: CustomEvent<{ config: LovelaceCardConfig }>) {
    ev.stopPropagation();
    this._emit([...this.cards, ev.detail.config]);
    this._index = this.cards.length;
    this._view = "edit";
  }

  private _edit(ev: Event) {
    this._index = (ev.currentTarget as any).index;
    this._view = "edit";
  }

  private _cardEdited(ev: HASSDomEvent<ConfigChangedEvent>) {
    ev.stopPropagation();
    const cards = [...this.cards];
    cards[this._index] = ev.detail.config as LovelaceCardConfig;
    fireEvent(this, "popup-cards-changed", { cards });
  }

  private _move(ev: Event) {
    const target = ev.currentTarget as any;
    this._emit(moveCard(this.cards, target.index, target.index + target.move));
  }

  private _remove(ev: Event) {
    const index = (ev.currentTarget as any).index as number;
    this._emit(this.cards.filter((_card, i) => i !== index));
  }

  static styles = css`
    :host {
      display: block;
    }
    .cards {
      list-style: none;
      margin: 0 0 var(--ha-space-3);
      padding: 0;
      display: grid;
      gap: var(--ha-space-2);
    }
    li {
      display: flex;
      align-items: center;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-2)
        var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(
        --ha-color-surface-tone-1,
        var(--secondary-background-color)
      );
    }
    .text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .name {
      font-weight: var(--ha-font-weight-semibold);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .type,
    .empty {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .empty {
      margin: 0 0 var(--ha-space-3);
    }
    .back {
      margin-bottom: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-popup-cards-editor": HuiPopupCardsEditor;
  }
}
