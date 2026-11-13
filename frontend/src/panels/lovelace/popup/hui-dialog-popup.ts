import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import "../../../components/ha-adaptive-dialog";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "../cards/hui-card";
import { pushPopup } from "../common/popup-action";
import type { PopupDialogParams } from "./show-popup-dialog";

/**
 * The pop-up opened by the "Open a pop-up" action. It renders its own cards
 * with the normal card element, as a dialog on a large screen and as a bottom
 * sheet on a phone. A pop-up opened from inside a pop-up covers it, and
 * closing it shows the previous one again, up to a depth limit.
 */
@customElement("hui-dialog-popup")
export class HuiDialogPopup
  extends LitElement
  implements HassDialog<PopupDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: PopupDialogParams;

  @state() private _open = false;

  private _covered: PopupDialogParams[] = [];

  public async showDialog(params: PopupDialogParams): Promise<void> {
    if (this._open && this._params) {
      const covered = pushPopup(this._covered, this._params);
      if (!covered) {
        showToast(this, {
          message: this.hass.localize(
            "ui.panel.lovelace.cards.actions.popup_too_deep"
          ),
        });
        return;
      }
      this._covered = covered;
    } else {
      this._covered = [];
    }
    this._params = params;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    const previous = this._covered.pop();
    if (previous) {
      this._params = previous;
      this._open = true;
      return;
    }
    this._open = false;
    this._params = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const { title, cards, size, dismissOnOutside } = this._params;
    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        .width=${size}
        .preventScrimClose=${!dismissOnOutside}
        header-title=${title ?? ""}
        @closed=${this._dialogClosed}
      >
        <div class="cards">
          ${cards.map(
            (card) => html`
              <hui-card .hass=${this.hass} .config=${card}></hui-card>
            `
          )}
        </div>
      </ha-adaptive-dialog>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        .cards {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 220px), 1fr)
          );
          gap: var(--ha-space-3);
          align-items: start;
        }
        hui-card {
          display: block;
          min-width: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-dialog-popup": HuiDialogPopup;
  }
}
