import { mdiCheckCircle, mdiNfcVariant } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { NfcListener, NfcStatus } from "../../common/locks/nfc-reader";
import { listenForNfcTag } from "../../common/locks/nfc-reader";
import "../ha-svg-icon";
import { lockText } from "./lock-text";

declare global {
  interface HASSDomEvents {
    "lock-nfc-tag": { identity: string };
  }
}

/**
 * Waits for an NFC tag while it is on the page: a tap on this device's
 * reader, or a scan with the Home Assistant app on a phone. Says which of the
 * two it can hear, and fires `lock-nfc-tag` with the tag's identity.
 */
@customElement("ha-lock-nfc-listen")
export class HaLockNfcListen extends LitElement {
  protected _languageMode = new LanguageModeController(this);

  /** What to ask for, such as "Tap your tag to unlock". */
  @property() public prompt = "";

  /** Shows the "Tag read" state instead of waiting. */
  @property({ type: Boolean }) public done = false;

  @property({ type: Boolean }) public disabled = false;

  @state() private _status: NfcStatus = "none";

  @state() private _error?: "denied" | "failed";

  private _listener?: NfcListener;

  public connectedCallback(): void {
    super.connectedCallback();
    this._start();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._listener?.stop();
    this._listener = undefined;
  }

  /** Listens again, after "Scan again". */
  public restart(): void {
    this._listener?.stop();
    this._error = undefined;
    this._start();
  }

  private _start() {
    this._listener = listenForNfcTag(
      (identity) => {
        if (!this.disabled) {
          fireEvent(this, "lock-nfc-tag", { identity });
        }
      },
      (reason) => {
        this._error = reason;
      }
    );
    this._status = this._listener.status;
  }

  protected render(): TemplateResult {
    return html`
      <div class="ring ${this.done ? "done" : ""}" aria-hidden="true">
        <ha-svg-icon
          .path=${this.done ? mdiCheckCircle : mdiNfcVariant}
        ></ha-svg-icon>
      </div>
      <p class="prompt" role="status">
        ${this.done ? lockText("nfc_read") : this.prompt}
      </p>
      ${
        this.done
          ? nothing
          : html`<p class="note">
              ${lockText(
                this._status === "both"
                  ? "nfc_listening_both"
                  : this._status === "app"
                    ? "nfc_listening_app"
                    : "nfc_listening_none"
              )}
            </p>`
      }
      ${
        this._error && !this.done
          ? html`<p class="note warn">
              ${lockText(
                this._error === "denied" ? "nfc_denied" : "nfc_device_failed"
              )}
            </p>`
          : nothing
      }
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: grid;
      justify-items: center;
      gap: var(--ha-space-2, 8px);
      text-align: center;
    }
    .ring {
      display: grid;
      place-items: center;
      width: 96px;
      height: 96px;
      border-radius: 32px;
      color: var(--primary-color);
      background: color-mix(in srgb, var(--primary-color) 14%, transparent);
      animation: breathe 2s ease-in-out infinite;
    }
    .ring.done {
      color: var(--success-color);
      background: color-mix(in srgb, var(--success-color) 16%, transparent);
      animation: pop 0.35s ease-out both;
    }
    .ring ha-svg-icon {
      --mdc-icon-size: 48px;
    }
    @keyframes breathe {
      50% {
        transform: scale(1.06);
        box-shadow: 0 0 0 10px
          color-mix(in srgb, var(--primary-color) 12%, transparent);
      }
    }
    @keyframes pop {
      from {
        transform: scale(0.8);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ring,
      .ring.done {
        animation: none;
      }
    }
    :host-context(html[data-a11y-reduce-motion]) .ring {
      animation: none;
    }
    .prompt {
      margin: 0;
      font-weight: 600;
    }
    .note {
      margin: 0;
      color: var(--secondary-text-color);
      font-size: 14px;
    }
    .note.warn {
      color: var(--warning-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-lock-nfc-listen": HaLockNfcListen;
  }
}
