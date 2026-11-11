import { mdiCheck, mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-control-button";
import "../../components/ha-adaptive-dialog";
import "../../components/ha-dialog-footer";
import "../../components/input/ha-input";
import type { HaInput } from "../../components/input/ha-input";
import type { HomeAssistant } from "../../types";
import type { HassDialog } from "../make-dialog-manager";
import type { EnterCodeDialogParams } from "./show-enter-code-dialog";

const BUTTONS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "clear",
  "0",
  "submit",
];

/** Number of placeholder dots shown before the code is longer than that. */
const MIN_DOTS = 4;

@customElement("dialog-enter-code")
export class DialogEnterCode
  extends LitElement
  implements HassDialog<EnterCodeDialogParams>
{
  @property({ attribute: false }) public hass?: HomeAssistant;

  @state() private _dialogParams?: EnterCodeDialogParams;

  @state() private _open = false;

  @query("#code") private _input?: HaInput;

  @state() private _showClearButton = false;

  /** Only the length of the typed code, used to draw dots; never the code. */
  @state() private _codeLength = 0;

  @state() private _narrow = false;

  private _closeAction?: "submit" | "cancel";

  public async showDialog(dialogParams: EnterCodeDialogParams): Promise<void> {
    this._dialogParams = dialogParams;
    this._open = true;
    this._showClearButton = false;
    this._codeLength = 0;
    this._closeAction = undefined;
    this._narrow = matchMedia(
      "all and (max-width: 450px), all and (max-height: 500px)"
    ).matches;
    await this.updateComplete;
  }

  public closeDialog(): boolean {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    if (!this._closeAction) {
      this._dialogParams?.cancel?.();
    }
    this._dialogParams = undefined;
    this._showClearButton = false;
    this._closeAction = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _submit(): void {
    this._dialogParams?.submit?.(this._input?.value ?? "");
    this._closeAction = "submit";
    this.closeDialog();
  }

  private _cancel(): void {
    this._dialogParams?.cancel?.();
    this._closeAction = "cancel";
    this.closeDialog();
  }

  private _numberClick(e: MouseEvent): void {
    const val = (e.currentTarget! as any).value;
    this._input!.value = (this._input!.value ?? "") + val;
    this._showClearButton = true;
    this._codeLength = this._input!.value.length;
  }

  private _clear(): void {
    this._input!.value = "";
    this._showClearButton = false;
    this._codeLength = 0;
  }

  private _inputValueChange(e) {
    const field = e.currentTarget as HaInput;
    const val = field.value;
    this._showClearButton = !!val;
    this._codeLength = val?.length ?? 0;
  }

  private _handleKeyDown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._submit();
    }
  }

  protected render() {
    if (!this._dialogParams || !this.hass) {
      return nothing;
    }

    const isText = this._dialogParams.codeFormat === "text";

    if (isText) {
      return html`
        <ha-adaptive-dialog
          .open=${this._open}
          header-title=${
            this._dialogParams.title ??
            this.hass.localize("ui.dialogs.enter_code.title")
          }
          width="small"
          @closed=${this._dialogClosed}
        >
          <ha-input
            class="input"
            ?autofocus=${!this._narrow}
            id="code"
            .label=${this.hass.localize("ui.dialogs.enter_code.input_label")}
            type="password"
            auto-validate
            pattern=${ifDefined(this._dialogParams.codePattern)}
            @keydown=${this._handleKeyDown}
            inputmode="text"
          ></ha-input>
          <ha-dialog-footer slot="footer">
            <ha-button
              slot="secondaryAction"
              appearance="plain"
              @click=${this._cancel}
            >
              ${
                this._dialogParams.cancelText ??
                this.hass.localize("ui.common.cancel")
              }
            </ha-button>
            <ha-button slot="primaryAction" @click=${this._submit}>
              ${
                this._dialogParams.submitText ??
                this.hass.localize("ui.common.submit")
              }
            </ha-button>
          </ha-dialog-footer>
        </ha-adaptive-dialog>
      `;
    }

    return html`
      <ha-adaptive-dialog
        .open=${this._open}
        header-title=${
          this._dialogParams.title ??
          this.hass.localize("ui.dialogs.enter_code.title")
        }
        width="small"
        @closed=${this._dialogClosed}
      >
        <div class="container">
          <ha-input
            @input=${this._inputValueChange}
            id="code"
            .label=${this.hass.localize("ui.dialogs.enter_code.input_label")}
            type="password"
            inputmode="numeric"
            ?autofocus=${!this._narrow}
            password-toggle
            @keydown=${this._handleKeyDown}
          ></ha-input>
          <div class="dots" aria-hidden="true">
            ${Array.from(
              { length: Math.max(MIN_DOTS, this._codeLength) },
              (_, index) => html`
                <span
                  class="dot ${classMap({ filled: index < this._codeLength })}"
                ></span>
              `
            )}
          </div>
          <div class="keypad">
            ${BUTTONS.map((value) =>
              value === ""
                ? html`<span></span>`
                : value === "clear"
                  ? html`
                      <ha-control-button
                        @click=${this._clear}
                        class="clear"
                        .disabled=${!this._showClearButton}
                        .label=${this.hass!.localize("ui.common.clear")}
                      >
                        <ha-svg-icon path=${mdiClose}></ha-svg-icon>
                      </ha-control-button>
                    `
                  : value === "submit"
                    ? html`
                        <ha-control-button
                          @click=${this._submit}
                          class="submit"
                          .label=${
                            this._dialogParams!.submitText ??
                            this.hass!.localize("ui.common.submit")
                          }
                        >
                          <ha-svg-icon path=${mdiCheck}></ha-svg-icon>
                        </ha-control-button>
                      `
                    : html`
                        <ha-control-button
                          .value=${value}
                          @click=${this._numberClick}
                          .label=${value}
                        >
                          ${value}
                        </ha-control-button>
                      `
            )}
          </div>
        </div>
      </ha-adaptive-dialog>
    `;
  }

  static styles = css`
    ha-adaptive-dialog {
      /* Place above other dialogs */
      --dialog-z-index: 104;
    }
    ha-input {
      width: 100%;
      margin: auto;
    }
    .container {
      display: flex;
      align-items: center;
      flex-direction: column;
    }
    .keypad {
      --keypad-columns: 3;
      margin-top: 12px;
      padding: 12px;
      display: grid;
      grid-template-columns: repeat(var(--keypad-columns), auto);
      grid-auto-rows: auto;
      grid-gap: var(--ha-space-6);
      justify-items: center;
      align-items: center;
      direction: ltr;
    }
    .dots {
      display: flex;
      justify-content: center;
      gap: var(--ha-space-4);
      margin-top: var(--ha-space-3);
      min-height: 14px;
    }
    .dot {
      width: 14px;
      height: 14px;
      box-sizing: border-box;
      border-radius: var(--ha-border-radius-circle);
      border: 2px solid var(--primary-text-color);
    }
    .dot.filled {
      background: var(--primary-text-color);
    }
    @media all and (max-height: 450px) {
      .keypad {
        --keypad-columns: 6;
      }
      .clear {
        grid-row-start: 1;
        grid-column-start: 6;
      }
    }
    ha-control-button {
      width: 72px;
      height: 56px;
      min-width: 44px;
      min-height: 44px;
      --control-button-border-radius: var(--ha-border-radius-xl);
      --control-button-background-color: var(--secondary-text-color);
      --control-button-background-opacity: 0.12;
      --mdc-icon-size: 24px;
      font-size: var(--ha-font-size-2xl);
    }
    .submit {
      --control-button-background-color: var(--primary-color);
      --control-button-background-opacity: 1;
      --control-button-icon-color: var(--text-primary-color, #fff);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-enter-code": DialogEnterCode;
  }
}
