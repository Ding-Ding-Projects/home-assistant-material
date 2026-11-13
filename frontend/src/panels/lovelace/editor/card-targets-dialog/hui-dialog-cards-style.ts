import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-button";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import { haStyleDialog } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import "../card-editor/hui-card-style-editor";
import {
  normalizeSelection,
  styleSelectedCards,
} from "../multi-select-actions";
import type { CardsStyleDialogParams } from "./show-dialog-card-targets";

/**
 * The style that is shared by every card: size and colours of text and icon,
 * background, border, corners, shadow and press feedback. Only the values that
 * are set here are written to the selected cards; their other style values
 * stay as they are.
 */
@customElement("hui-dialog-cards-style")
export class HuiDialogCardsStyle extends LitElement {
  public hass!: HomeAssistant;

  @state() private _params?: CardsStyleDialogParams;

  @state() private _open = false;

  @state() private _draft: LovelaceCardConfig = { type: "tile" };

  @state() private _busy = false;

  public showDialog(params: CardsStyleDialogParams): void {
    this._params = params;
    this._draft = { type: "tile" };
    this._open = true;
  }

  public closeDialog(): void {
    this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const count = normalizeSelection(this._params.paths).length;
    const hasValues = Boolean(
      Object.keys((this._draft.style as object | undefined) ?? {}).length ||
      Object.keys((this._draft.gesture_feedback as object | undefined) ?? {})
        .length
    );
    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${this.hass.localize(
          "ui.panel.lovelace.editor.multi_select.style_title",
          { count }
        )}
        @closed=${this._dialogClosed}
      >
        <p class="hint">
          ${this.hass.localize("ui.panel.lovelace.editor.multi_select.style_hint")}
        </p>
        <hui-card-style-editor
          .hass=${this.hass}
          .config=${this._draft}
          @value-changed=${this._changed}
        ></hui-card-style-editor>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button
            slot="primaryAction"
            .disabled=${!hasValues || this._busy}
            @click=${this._apply}
          >
            ${this.hass.localize("ui.panel.lovelace.editor.multi_select.apply")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _changed(ev: CustomEvent<{ value: LovelaceCardConfig }>): void {
    ev.stopPropagation();
    this._draft = ev.detail.value;
  }

  private async _apply(): Promise<void> {
    const lovelace = this._params?.lovelace();
    if (!lovelace || !this._params || this._busy) {
      return;
    }
    this._busy = true;
    const count = normalizeSelection(this._params.paths).length;
    try {
      await lovelace.saveConfig(
        styleSelectedCards(
          lovelace.config,
          this._params.paths,
          (this._draft.style as Record<string, unknown> | undefined) ?? {},
          this._draft.gesture_feedback as Record<string, unknown> | undefined
        )
      );
    } catch (_err: unknown) {
      this._busy = false;
      return;
    }
    this._busy = false;
    lovelace.showToast({
      message: this.hass.localize(
        "ui.panel.lovelace.editor.multi_select.styled",
        { count }
      ),
      duration: 8000,
      action: {
        action: () => fireEvent(window, "undo-change"),
        text: this.hass.localize("ui.common.undo"),
      },
    });
    this._params.onDone?.();
    this.closeDialog();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .hint {
          margin: 0 0 var(--ha-space-3);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-cards-style": HuiDialogCardsStyle;
  }
}
