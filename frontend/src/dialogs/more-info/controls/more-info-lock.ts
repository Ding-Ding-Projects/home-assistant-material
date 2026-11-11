import { mdiCheck } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { stateColorCss } from "../../../common/entity/state_color";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-control-button";
import "../../../components/ha-control-button-group";
import "../../../components/ha-state-icon";
import { apiContext, formattersContext } from "../../../data/context";
import type { LockEntity } from "../../../data/lock";
import {
  LockEntityFeature,
  callProtectedLockService,
  canOpen,
  isJammed,
} from "../../../data/lock";
import "../../../state-control/lock/ha-state-control-lock-toggle";
import type { HomeAssistantApi, HomeAssistantFormatters } from "../../../types";
import "../../../components/ha-relative-time";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";

const CONFIRM_TIMEOUT_SECOND = 5;
const DONE_TIMEOUT_SECOND = 2;

type ButtonState = "normal" | "confirm" | "done";

@customElement("more-info-lock")
class MoreInfoLock extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @property({ attribute: false }) public stateObj?: LockEntity;

  @state() public _buttonState: ButtonState = "normal";

  private _buttonTimeout?: number;

  private _setButtonState(buttonState: ButtonState, timeoutSecond?: number) {
    clearTimeout(this._buttonTimeout);
    this._buttonState = buttonState;
    if (timeoutSecond) {
      this._buttonTimeout = window.setTimeout(() => {
        this._buttonState = "normal";
      }, timeoutSecond * 1000);
    }
  }

  private async _open() {
    if (this._buttonState !== "confirm") {
      this._setButtonState("confirm", CONFIRM_TIMEOUT_SECOND);
      return;
    }

    callProtectedLockService(
      this,
      this._api.callService,
      this._api.callWS,
      this._localize,
      this.stateObj!,
      "open"
    );

    this._setButtonState("done", DONE_TIMEOUT_SECOND);
  }

  private _resetButtonState() {
    this._setButtonState("normal");
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._resetButtonState();
  }

  private async _lock() {
    callProtectedLockService(
      this,
      this._api.callService,
      this._api.callWS,
      this._localize,
      this.stateObj!,
      "lock"
    );
  }

  private async _unlock() {
    callProtectedLockService(
      this,
      this._api.callService,
      this._api.callWS,
      this._localize,
      this.stateObj!,
      "unlock"
    );
  }

  private _headlineClass() {
    if (isJammed(this.stateObj!)) {
      return "headline bad";
    }
    if (this.stateObj!.state === "locked") {
      return "headline ok";
    }
    return this.stateObj!.state === "unlocked" ? "headline warn" : "headline";
  }

  protected render() {
    if (!this._localize || !this.stateObj) {
      return nothing;
    }

    const supportsOpen = supportsFeature(this.stateObj, LockEntityFeature.OPEN);

    const color = stateColorCss(this.stateObj);
    const style = {
      "--state-color": color,
    };

    return html`
      <p class=${this._headlineClass()}>
        ${this._formatters.formatEntityState(this.stateObj)}
      </p>
      <p class="subline">
        <ha-relative-time
          .datetime=${this.stateObj.last_changed}
          capitalize
        ></ha-relative-time>
      </p>
      <div class="controls" style=${styleMap(style)}>
        ${
          isJammed(this.stateObj)
            ? html`
                <div class="status">
                  <span></span>
                  <div class="icon">
                    <ha-state-icon .stateObj=${this.stateObj}></ha-state-icon>
                  </div>
                </div>
              `
            : html`
                <ha-state-control-lock-toggle
                  @lock-service-called=${this._resetButtonState}
                  .stateObj=${this.stateObj}
                >
                </ha-state-control-lock-toggle>
              `
        }
        ${
          supportsOpen
            ? html`
                <div class="buttons">
                  ${
                    this._buttonState === "done"
                      ? html`
                          <p class="open-done">
                            <ha-svg-icon path=${mdiCheck}></ha-svg-icon>
                            ${this._localize("ui.card.lock.open_door_done")}
                          </p>
                        `
                      : html`
                          <ha-control-button
                            .disabled=${!canOpen(this.stateObj)}
                            class="open-button ${this._buttonState}"
                            @click=${this._open}
                          >
                            ${
                              this._buttonState === "confirm"
                                ? this._localize(
                                    "ui.card.lock.open_door_confirm"
                                  )
                                : this._localize("ui.card.lock.open_door")
                            }
                          </ha-control-button>
                        `
                  }
                </div>
              `
            : nothing
        }
      </div>
      <div>
        ${
          isJammed(this.stateObj)
            ? html`
                <ha-control-button-group class="jammed">
                  <ha-control-button @click=${this._unlock}>
                    ${this._localize("ui.card.lock.unlock")}
                  </ha-control-button>
                  <ha-control-button @click=${this._lock}>
                    ${this._localize("ui.card.lock.lock")}
                  </ha-control-button>
                </ha-control-button-group>
              `
            : nothing
        }
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      moreInfoBoardStyle,
      css`
        ha-control-button {
          font-size: var(--ha-font-size-m);
          height: 60px;
          --control-button-border-radius: var(--ha-border-radius-3xl);
        }
        .open-button {
          width: 130px;
          --control-button-background-color: var(--state-color);
        }
        .open-button.confirm {
          --control-button-background-color: var(--warning-color);
        }
        .open-done {
          line-height: 60px;
          display: flex;
          align-items: center;
          flex-direction: row;
          gap: var(--ha-space-2);
          font-weight: var(--ha-font-weight-medium);
          color: var(--success-color);
        }
        ha-control-button-group.jammed {
          --control-button-group-thickness: 60px;
          width: 100%;
          max-width: 400px;
          margin: 0 auto;
        }
        @keyframes pulse {
          0% {
            opacity: 1;
          }
          50% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        .status {
          display: flex;
          align-items: center;
          flex-direction: column;
          justify-content: center;
          height: 45vh;
          max-height: 320px;
          min-height: 200px;
        }
        .status .icon {
          position: relative;
          --mdc-icon-size: 80px;
          animation: pulse 1s infinite;
          color: var(--state-color);
          border-radius: var(--ha-border-radius-circle);
          width: 144px;
          height: 144px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .status .icon::before {
          content: "";
          position: absolute;
          top: 0;
          left: 0;
          height: 100%;
          width: 100%;
          border-radius: var(--ha-border-radius-circle);
          background-color: var(--state-color);
          transition: background-color 180ms ease-in-out;
          opacity: 0.2;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-lock": MoreInfoLock;
  }
}
