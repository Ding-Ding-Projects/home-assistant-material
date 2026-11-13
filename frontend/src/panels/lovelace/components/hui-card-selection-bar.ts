import {
  mdiArrowRight,
  mdiClose,
  mdiContentCopy,
  mdiDelete,
  mdiPalette,
  mdiPlusCircleMultipleOutline,
} from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import type { LocalizeKeys } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-svg-icon";
import { pushClipboardHistory } from "../editor/card-clipboard-history";
import {
  cardSelection,
  SELECTION_CHANGED_EVENT,
} from "../editor/card-selection";
import {
  showCardsStyleDialog,
  showCardTargetsDialog,
} from "../editor/card-targets-dialog/show-dialog-card-targets";
import {
  deleteSelectedCards,
  duplicateSelectedCards,
  normalizeSelection,
  selectedCards,
} from "../editor/multi-select-actions";

/**
 * The bar that floats at the bottom of the dashboard while cards are
 * selected. It acts on every selected card at once; each change is one save,
 * so one undo brings it back.
 */
@customElement("hui-card-selection-bar")
export class HuiCardSelectionBar extends LitElement {
  @state() private _count = 0;

  private _changed = () => {
    this._count = normalizeSelection(cardSelection.paths).length;
  };

  connectedCallback(): void {
    super.connectedCallback();
    this._changed();
    cardSelection.addEventListener(SELECTION_CHANGED_EVENT, this._changed);
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    cardSelection.removeEventListener(SELECTION_CHANGED_EVENT, this._changed);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    const localize = cardSelection.localize;
    return localize
      ? localize(
          `ui.panel.lovelace.editor.multi_select.${key}` as LocalizeKeys,
          values
        )
      : "";
  }

  protected render() {
    const localize = cardSelection.localize;
    if (!this._count || !localize) {
      return nothing;
    }
    return html`
      <div class="bar" role="toolbar" aria-label=${this._t("toolbar")}>
        <span class="count" role="status">
          ${this._t("count", { count: this._count })}
        </span>
        <span class="hint">${this._t("hint")}</span>
        <ha-button appearance="plain" @click=${this._copy}>
          <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
          ${this._t("copy")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._duplicate}>
          <ha-svg-icon
            slot="start"
            .path=${mdiPlusCircleMultipleOutline}
          ></ha-svg-icon>
          ${this._t("duplicate")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._move}>
          <ha-svg-icon slot="start" .path=${mdiArrowRight}></ha-svg-icon>
          ${this._t("move")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._style}>
          <ha-svg-icon slot="start" .path=${mdiPalette}></ha-svg-icon>
          ${this._t("style")}
        </ha-button>
        <ha-button appearance="plain" variant="danger" @click=${this._delete}>
          <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
          ${this._t("delete")}
        </ha-button>
        <ha-button
          appearance="plain"
          @click=${this._clear}
          aria-label=${this._t("clear")}
        >
          <ha-svg-icon slot="start" .path=${mdiClose}></ha-svg-icon>
          ${this._t("clear")}
        </ha-button>
      </div>
    `;
  }

  private _clear = () => cardSelection.clear();

  private _undoAction() {
    return {
      action: () => fireEvent(window, "undo-change"),
      text: cardSelection.localize!("ui.common.undo"),
    };
  }

  private _copy() {
    const lovelace = cardSelection.lovelace;
    if (!lovelace) {
      return;
    }
    const cards = selectedCards(lovelace.config, cardSelection.paths);
    pushClipboardHistory(cards);
    lovelace.showToast({
      message: this._t("copied", { count: cards.length }),
    });
  }

  private async _duplicate() {
    const lovelace = cardSelection.lovelace;
    if (!lovelace) {
      return;
    }
    const paths = cardSelection.paths;
    const count = normalizeSelection(paths).length;
    cardSelection.clear();
    await lovelace.saveConfig(duplicateSelectedCards(lovelace.config, paths));
    lovelace.showToast({
      message: this._t("duplicated", { count }),
      duration: 8000,
      action: this._undoAction(),
    });
  }

  private async _delete() {
    const lovelace = cardSelection.lovelace;
    if (!lovelace) {
      return;
    }
    const paths = cardSelection.paths;
    const count = normalizeSelection(paths).length;
    cardSelection.clear();
    await lovelace.saveConfig(deleteSelectedCards(lovelace.config, paths));
    lovelace.showToast({
      message: this._t("deleted", { count }),
      duration: 8000,
      action: this._undoAction(),
    });
  }

  private _move() {
    const host = cardSelection.host;
    if (!host) {
      return;
    }
    const paths = cardSelection.paths;
    const first = paths[0];
    showCardTargetsDialog(host as unknown as HTMLElement, {
      mode: "move",
      lovelace: () => cardSelection.lovelace,
      paths,
      viewIndex: typeof first?.[1] === "number" ? first[1] : 0,
      onDone: () => cardSelection.clear(),
    });
  }

  private _style() {
    const host = cardSelection.host;
    if (!host) {
      return;
    }
    const paths = cardSelection.paths;
    showCardsStyleDialog(host as unknown as HTMLElement, {
      lovelace: () => cardSelection.lovelace,
      paths,
      onDone: () => cardSelection.clear(),
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      position: fixed;
      inset-inline: 0;
      inset-block-end: calc(16px + env(safe-area-inset-bottom));
      z-index: 8;
      display: flex;
      justify-content: center;
      pointer-events: none;
      padding: 0 var(--ha-space-4, 16px);
    }
    .bar {
      pointer-events: auto;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: var(--ha-space-1, 4px) var(--ha-space-2, 8px);
      max-width: 100%;
      padding: var(--ha-space-2, 8px) var(--ha-space-4, 16px);
      border-radius: var(--ha-border-radius-xl, 24px);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      border: 1px solid var(--ha-color-outline, var(--divider-color));
      box-shadow: var(--ha-shadow-overlay, 0 8px 24px rgb(0 0 0 / 25%));
    }
    .count {
      font-weight: var(--ha-font-weight-semibold, 500);
    }
    .hint {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s, 12px);
    }
    @media (max-width: 600px) {
      :host {
        inset-block-end: calc(88px + env(safe-area-inset-bottom));
      }
      .hint {
        display: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-card-selection-bar": HuiCardSelectionBar;
  }
}
