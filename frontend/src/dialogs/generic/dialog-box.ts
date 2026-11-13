import { mdiAlertOutline, mdiExitRun, mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-dialog";
import "../../components/ha-dialog-footer";
import "../../components/ha-dialog-header";
import "../../components/ha-svg-icon";
import "../../components/ha-two-key-confirm";
import "../../components/ha-textarea";
import type { HaTextArea } from "../../components/ha-textarea";
import "../../components/input/ha-input";
import type { HaInput } from "../../components/input/ha-input";
import { DirtyStateProviderMixin } from "../../mixins/dirty-state-provider-mixin";
import { getPersonalPreferences } from "../../common/preferences/personal-preferences";
import type { HomeAssistant } from "../../types";
import type { DialogBoxParams } from "./show-dialog-box";

interface DialogBoxDirtyState {
  value: string;
}

@customElement("dialog-box")
class DialogBox extends DirtyStateProviderMixin<DialogBoxDirtyState>()(
  LitElement
) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: DialogBoxParams;

  @state() private _open = false;

  @state() private _closeState?: "canceled" | "confirmed";

  @state() private _loading = false;

  @state() private _validInput = true;

  // A destructive confirmation has two steps: what will happen, then the guard.
  @state() private _step: 1 | 2 = 1;

  @state() private _typed = "";

  @query("ha-input, ha-textarea") private _textField?: HaInput | HaTextArea;

  private _closePromise?: Promise<void>;

  private _closeResolve?: () => void;

  // Set while a new opening waits for the previous one to finish closing
  private _reopening = false;

  public async showDialog(params: DialogBoxParams): Promise<void> {
    if (this._closePromise) {
      this._reopening = true;
      await this._closePromise;
      this._reopening = false;
    }
    this._params = params;
    this._validInput = true;
    this._step = 1;
    this._typed = "";
    this._open = true;
    this._initDirtyTracking(
      { type: "deep" },
      { value: params.defaultValue ?? "" }
    );
    await this.updateComplete;
    this._validateInput();
  }

  public closeDialog(): boolean {
    if (!this._open) {
      // Dialog is already closing
      return true;
    }
    if (this._params?.confirmation || this._params?.prompt) {
      return false;
    }
    if (this._params) {
      this._dismiss();
      return true;
    }
    return true;
  }

  // One emoji in front of the title, only when the person allows it. It is
  // hidden from screen readers, so the title still says everything.
  private _emoji() {
    const emoji = this._params?.emoji;
    const allowed = (() => {
      try {
        return getPersonalPreferences().dialogEmojis;
      } catch (_err) {
        return true;
      }
    })();
    return emoji && allowed
      ? html`<span class="emoji" aria-hidden="true">${emoji}</span> `
      : nothing;
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    const confirmPrompt = this._params.confirmation || !!this._params.prompt;
    // Anything that destroys data is confirmed in two steps: first what will
    // happen, then the name of the thing typed, or two keys and a slider where
    // there is no name to type.
    const twoStep =
      !!this._params.confirmation &&
      !this._params.prompt &&
      !!this._params.destructive;
    const confirmName = this._params.confirmName;
    const typed = twoStep && this._step === 2 && !!confirmName;
    const twoKey =
      confirmPrompt &&
      !!this._params.destructive &&
      (!twoStep || (this._step === 2 && !confirmName));
    const typedMatches = typed && this._typed.trim() === confirmName!.trim();
    const dialogTitle =
      this._params.title ||
      (this._params.confirmation &&
        this.hass.localize("ui.dialogs.generic.default_confirmation_title"));

    return html`
      <ha-dialog
        without-tools
        .open=${this._open}
        type=${confirmPrompt ? "alert" : "standard"}
        .preventScrimClose=${!!this._params.confirmation || this.isDirtyState}
        @closed=${this._dialogClosed}
        .accessibleLabel=${this._accessibleLabel(dialogTitle)}
        aria-describedby="dialog-box-description"
      >
        <ha-dialog-header slot="header">
          ${
            !confirmPrompt || this._params.showCloseButton
              ? html`<slot name="headerNavigationIcon" slot="navigationIcon">
                  <ha-icon-button
                    data-dialog="close"
                    .label=${this.hass?.localize("ui.common.close") ?? "Close"}
                    .path=${mdiClose}
                  ></ha-icon-button
                ></slot>`
              : nothing
          }
          <h1
            class=${classMap({ title: true, alert: confirmPrompt })}
            slot="title"
            id="dialog-box-title"
          >
            ${
              this._params.warning
                ? html`<ha-svg-icon
                    .path=${mdiAlertOutline}
                    style="color: var(--warning-color)"
                  ></ha-svg-icon> `
                : nothing
            }
            ${this._emoji()}${dialogTitle}
          </h1>
          ${
            this._params.subtitle
              ? html`<span slot="subtitle">${this._params.subtitle}</span>`
              : nothing
          }
        </ha-dialog-header>
        <div id="dialog-box-description">
          ${
            this._params.text && !(twoStep && this._step === 2)
              ? html` <p>${this._params.text}</p> `
              : ""
          }
          ${
            this._params.prompt && !this._params.multiline
              ? html`
                  <ha-input
                    autofocus
                    value=${ifDefined(this._params.defaultValue)}
                    .placeholder=${this._params.placeholder}
                    .label=${
                      this._params.inputLabel ? this._params.inputLabel : ""
                    }
                    .type=${
                      this._params.inputType ? this._params.inputType : "text"
                    }
                    .min=${this._params.inputMin}
                    .max=${this._params.inputMax}
                    .disabled=${this._loading}
                    @input=${this._validateInput}
                    @keydown=${this._inputKeydown}
                  >
                    ${
                      this._params.inputSuffix
                        ? html`<span slot="end"
                            >${this._params.inputSuffix}</span
                          >`
                        : nothing
                    }
                  </ha-input>
                `
              : this._params.prompt && this._params.multiline
                ? html`
                    <ha-textarea
                      resize="auto"
                      autofocus
                      .value=${this._params.defaultValue}
                      .placeholder=${this._params.placeholder}
                      .label=${this._params.inputLabel}
                      .disabled=${this._loading}
                      @input=${this._validateInput}
                    ></ha-textarea>
                  `
                : nothing
          }
          ${
            this._params.prompt && this._params.textBelowInput
              ? html`<div class="after-input">
                  ${this._params.textBelowInput}
                </div>`
              : nothing
          }
          ${
            typed
              ? html`<ha-input
                  class="typed"
                  autofocus
                  .label=${this.hass.localize("ui.dialogs.two_key.name_label")}
                  .hint=${this.hass.localize("ui.dialogs.two_key.type_name", {
                    name: confirmName,
                  })}
                  .value=${this._typed}
                  .disabled=${this._loading}
                  @input=${this._typedInput}
                ></ha-input>`
              : nothing
          }
          ${
            twoKey
              ? html`<ha-two-key-confirm
                  .disabled=${
                    this._loading ||
                    (!!this._params.prompt && !this._validInput)
                  }
                  @two-key-confirmed=${this._confirm}
                ></ha-two-key-confirm>`
              : nothing
          }
        </div>
        <ha-dialog-footer slot="footer">
          ${
            confirmPrompt
              ? html`
                  <ha-button
                    slot="secondaryAction"
                    @click=${twoStep && this._step === 2 ? this._back : this._dismiss}
                    ?autofocus=${!this._params.prompt && this._params.destructive && !typed}
                    ?disabled=${this._loading}
                    appearance=${twoKey && !twoStep ? "filled" : "plain"}
                  >
                    ${
                      twoStep && this._step === 2
                        ? this.hass.localize("ui.dialogs.two_key.back")
                        : twoKey
                          ? html`<ha-svg-icon
                                slot="start"
                                .path=${mdiExitRun}
                              ></ha-svg-icon
                              >${this.hass.localize("ui.dialogs.two_key.exit")}`
                          : this._params.dismissText
                            ? this._params.dismissText
                            : this.hass.localize("ui.common.cancel")
                    }
                  </ha-button>
                `
              : nothing
          }
          ${
            twoStep && this._step === 1
              ? html`<ha-button
                  slot="primaryAction"
                  @click=${this._next}
                  appearance="tonal"
                  variant="brand"
                >
                  ${this.hass.localize("ui.dialogs.two_key.continue")}
                </ha-button>`
              : twoKey
                ? nothing
                : html`<ha-button
                    slot="primaryAction"
                    @click=${this._confirm}
                    ?autofocus=${!this._params.prompt && !this._params.destructive}
                    ?disabled=${
                      this._loading ||
                      (!!this._params.prompt && !this._validInput) ||
                      (typed && !typedMatches)
                    }
                    .loading=${this._loading}
                    variant=${this._params.destructive ? "danger" : "brand"}
                  >
                    ${
                      this._params.confirmText
                        ? this._params.confirmText
                        : this.hass.localize("ui.common.ok")
                    }
                  </ha-button>`
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _next(): void {
    this._step = 2;
    this._typed = "";
  }

  private _back(): void {
    this._step = 1;
    this._typed = "";
  }

  private _typedInput(ev: Event): void {
    this._typed = (ev.target as HaInput).value ?? "";
  }

  private _cancel(): void {
    if (this._params?.cancel) {
      this._params.cancel();
    }
  }

  // Alerts often have no title. Their message is what a screen reader should
  // announce then, as long as it is plain text.
  private _accessibleLabel(dialogTitle: string | false | undefined) {
    if (dialogTitle) {
      return dialogTitle;
    }
    return typeof this._params?.text === "string"
      ? this._params.text
      : undefined;
  }

  private _dismiss(): void {
    this._closeState = "canceled";
    this._cancel();
    this._closeDialog();
  }

  private async _confirm(): Promise<void> {
    if (this._params?.prompt && !this._textField?.reportValidity()) {
      return;
    }

    if (this._params!.action) {
      this._loading = true;
      try {
        await this._params!.action(this._textField?.value);
      } catch (_err) {
        this._loading = false;
        return;
      }
      this._loading = false;
    }
    this._closeState = "confirmed";
    if (this._params!.confirm) {
      this._params!.confirm(this._textField?.value);
    }
    this._markDirtyStateClean();
    this._closeDialog();
  }

  /**
   * Enter in a one-line prompt confirms it, as pressing the button would.
   * Never for a destructive prompt: that one needs a deliberate press.
   */
  private _inputKeydown(ev: KeyboardEvent): void {
    if (
      ev.key !== "Enter" ||
      ev.isComposing ||
      !this._params?.prompt ||
      this._params.destructive ||
      this._loading ||
      !this._validInput
    ) {
      return;
    }
    ev.preventDefault();
    this._confirm();
  }

  private _validateInput(): void {
    this._validInput = this._params?.prompt
      ? (this._textField?.checkValidity() ?? true)
      : true;
    if (this._params?.prompt) {
      this._updateDirtyState({ value: this._textField?.value ?? "" });
    }
  }

  private _closeDialog() {
    this._open = false;
    this._closePromise = new Promise((resolve) => {
      this._closeResolve = resolve;
    });
  }

  private _dialogClosed() {
    // The dialog manager already tracks the new opening, which this close
    // must not end
    if (!this._reopening) {
      fireEvent(this, "dialog-closed", { dialog: this.localName });
    }
    if (!this._closeState) {
      this._cancel();
    }
    this._closeState = undefined;
    this._params = undefined;
    this._open = false;
    this._loading = false;
    this._closeResolve?.();
    this._closeResolve = undefined;
  }

  static styles = css`
    :host([inert]) {
      pointer-events: initial !important;
      cursor: initial !important;
    }
    /* A question must be readable in full: its title wraps instead of being cut. */
    ha-dialog {
      --ha-dialog-header-white-space: normal;
    }
    a {
      color: var(--primary-color);
    }
    p {
      margin: 0;
      color: var(--primary-text-color);
    }
    .no-bottom-padding {
      padding-bottom: 0;
    }
    .secondary {
      color: var(--secondary-text-color);
    }
    ha-input {
      width: 100%;
    }
    .after-input {
      margin-top: var(--ha-space-4);
    }
    .emoji {
      margin-inline-end: var(--ha-space-2);
    }
    .title {
      font-weight: inherit;
      font-size: inherit;
      margin: inherit;
    }
    .title.alert {
      padding: 0 var(--ha-space-2);
    }
    /* A touch screen needs a 44 px button. */
    @media (pointer: coarse) {
      ha-dialog-footer ha-button {
        --ha-button-height: 44px;
      }
    }
    @media all and (min-width: 450px) and (min-height: 500px) {
      .title.alert {
        padding: 0 var(--ha-space-1);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-box": DialogBox;
  }
}
