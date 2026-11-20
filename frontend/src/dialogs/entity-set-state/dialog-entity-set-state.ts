import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { modeText } from "../../common/language-mode/language-mode";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-code-editor";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-switch";
import "../../components/input/ha-input";
import type { ParsedValue } from "../../data/entity-details";
import { editorText, parseEditedValue } from "../../data/entity-details";
import { haStyleDialog } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import type { HassDialog } from "../make-dialog-manager";
import type { EntitySetStateDialogParams } from "./show-dialog-entity-set-state";

/**
 * Asks for one new value of an entity's state or attribute, with the input
 * that fits the value: text, a number, a switch, or the code editor for lists
 * and objects. It only collects the value; the caller confirms and writes it.
 */
@customElement("dialog-entity-set-state")
export class DialogEntitySetState
  extends LitElement
  implements HassDialog<EntitySetStateDialogParams>
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _params?: EntitySetStateDialogParams;

  @state() private _open = false;

  @state() private _text = "";

  @state() private _checked = false;

  @state() private _error?: Extract<ParsedValue, { ok: false }>["error"];

  private _submitted = false;

  public async showDialog(params: EntitySetStateDialogParams): Promise<void> {
    this._params = params;
    this._text = editorText(params.value, params.kind);
    this._checked = params.value === true;
    this._error = undefined;
    this._submitted = false;
    this._open = true;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return modeText(
      this.hass!.localize,
      `ui.components.entity_details.${key}`,
      values
    );
  }

  protected render() {
    if (!this._params || !this.hass) {
      return nothing;
    }
    const { kind } = this._params;
    return html`
      <ha-dialog
        without-tools
        .open=${this._open}
        header-title=${this._params.title}
        @closed=${this._dialogClosed}
      >
        ${
          kind === "boolean"
            ? html`<label class="switch-row">
                <span>${this._t("edit.switch_value")}</span>
                <ha-switch
                  .checked=${this._checked}
                  @change=${this._switchChanged}
                ></ha-switch>
              </label>`
            : kind === "structured"
              ? html`<ha-code-editor
                  mode="yaml"
                  in-dialog
                  autofocus
                  .hass=${this.hass}
                  .value=${this._text}
                  .error=${!!this._error}
                  @value-changed=${this._codeChanged}
                ></ha-code-editor>`
              : html`<ha-input
                  autofocus
                  .label=${this._t("edit.value")}
                  .type=${kind === "number" ? "number" : "text"}
                  step="any"
                  .value=${this._text}
                  .invalid=${!!this._error}
                  @input=${this._inputChanged}
                  @keydown=${this._keydown}
                ></ha-input>`
        }
        ${
          this._error
            ? html`<ha-alert alert-type="error"
                >${this._t(`edit.${this._error}`)}</ha-alert
              >`
            : nothing
        }
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this.closeDialog}
          >
            ${modeText(this.hass.localize, "ui.common.cancel")}
          </ha-button>
          <ha-button slot="primaryAction" @click=${this._submit}>
            ${this._t("edit.save")}
          </ha-button>
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _switchChanged(ev: Event) {
    this._checked = (ev.target as HTMLInputElement).checked;
  }

  private _codeChanged(ev: CustomEvent<{ value: string }>) {
    this._text = ev.detail.value;
    this._error = undefined;
  }

  private _inputChanged(ev: Event) {
    this._text = (ev.target as HTMLInputElement).value ?? "";
    this._error = undefined;
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._submit();
    }
  }

  private _submit() {
    if (!this._params) {
      return;
    }
    const parsed = parseEditedValue(
      this._params.kind,
      this._params.kind === "boolean" ? this._checked : this._text
    );
    if (!parsed.ok) {
      this._error = parsed.error;
      return;
    }
    this._submitted = true;
    this._params.submit(parsed.value);
    this.closeDialog();
  }

  private _dialogClosed() {
    if (!this._submitted) {
      this._params?.cancel?.();
    }
    this._params = undefined;
    this._open = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  static styles = [
    haStyleDialog,
    css`
      .switch-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-4);
        min-height: 48px;
      }
      ha-alert {
        display: block;
        margin-top: var(--ha-space-3);
      }
      ha-input {
        display: block;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-entity-set-state": DialogEntitySetState;
  }
}
