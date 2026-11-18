import type { ContextType } from "@lit/context";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { consume } from "../../common/decorators/consume";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { fireEvent } from "../../common/dom/fire_event";
import { stateColorCss } from "../../common/entity/state_color";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-control-button";
import "../../components/ha-control-switch";
import "../../components/ha-state-icon";
import { apiContext, formattersContext } from "../../data/context";
import { UNAVAILABLE, UNKNOWN } from "../../data/entity/entity";
import { forwardHaptic } from "../../data/haptics";
import { modeText } from "../../common/language-mode/language-mode";
import type { LockEntity } from "../../data/lock";
import { callProtectedLockService } from "../../data/lock";
import {
  stateControlPulseStyle,
  stateControlToggleStyle,
} from "../../resources/state-control-styles";
import type { HomeAssistantApi } from "../../types";

declare global {
  interface HASSDomEvents {
    "lock-service-called": undefined;
  }
}

@customElement("ha-state-control-lock-toggle")
export class HaStateControlLockToggle extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: ContextType<typeof formattersContext>;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @property({ attribute: false }) public stateObj!: LockEntity;

  /** Opt-in presentation used by the entity dialog: one large rounded tile. */
  @property({ type: Boolean, reflect: true }) public board = false;

  @state() private _isOn = false;

  /** How far the slide thumb has been dragged, in pixels. */
  @state() private _slideX = 0;

  private _slideStart?: { x: number; max: number; id: number };

  private _onSlideDown(ev: PointerEvent) {
    const thumb = ev.currentTarget as HTMLElement;
    const track = thumb.parentElement as HTMLElement;
    const max = Math.max(track.clientWidth - thumb.offsetWidth - 8, 1);
    this._slideStart = { x: ev.clientX, max, id: ev.pointerId };
    thumb.setPointerCapture(ev.pointerId);
  }

  private _onSlideMove(ev: PointerEvent) {
    if (!this._slideStart || ev.pointerId !== this._slideStart.id) {
      return;
    }
    this._slideX = Math.min(
      Math.max(ev.clientX - this._slideStart.x, 0),
      this._slideStart.max
    );
  }

  private _onSlideUp(ev: PointerEvent) {
    if (!this._slideStart || ev.pointerId !== this._slideStart.id) {
      return;
    }
    const done = this._slideX >= this._slideStart.max * 0.85;
    this._slideStart = undefined;
    this._slideX = 0;
    if (done) {
      this._turnOff();
    }
  }

  private _onSlideKey(ev: KeyboardEvent) {
    // A pointer press alone never unlocks; the keyboard and assistive
    // technology activate the thumb as an ordinary button.
    if (ev.key === "Enter" || ev.key === " " || ev.key === "ArrowRight") {
      ev.preventDefault();
      this._turnOff();
    }
  }

  private _onSlideClick(ev: MouseEvent) {
    if (ev.detail === 0) {
      this._turnOff();
    }
  }

  public willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (changedProps.has("stateObj")) {
      this._isOn =
        this.stateObj.state === "locked" || this.stateObj.state === "locking";
    }
  }

  private _valueChanged(ev) {
    const checked = ev.target.checked as boolean;

    if (checked) {
      this._turnOn();
    } else {
      this._turnOff();
    }
  }

  private _tileClicked() {
    if (this._isOn) {
      this._turnOff();
    } else {
      this._turnOn();
    }
  }

  private async _turnOn() {
    this._isOn = true;
    try {
      await this._callService(true);
    } catch (_err) {
      this._isOn = false;
    }
  }

  private async _turnOff() {
    this._isOn = false;
    try {
      await this._callService(false);
    } catch (_err) {
      this._isOn = true;
    }
  }

  private async _callService(turnOn: boolean): Promise<void> {
    if (!this.stateObj) {
      return;
    }
    forwardHaptic(this, "light");
    fireEvent(this, "lock-service-called");
    callProtectedLockService(
      this,
      this._api.callService,
      this._api.callWS,
      this._localize,
      this.stateObj,
      turnOn ? "lock" : "unlock"
    );
  }

  protected render(): TemplateResult {
    const locking = this.stateObj.state === "locking";
    const unlocking = this.stateObj.state === "unlocking";

    const color = stateColorCss(this.stateObj);

    if (this.stateObj.state === UNKNOWN) {
      return html`
        <div class="buttons">
          <ha-control-button
            .label=${modeText(this._localize as any, "ui.card.lock.lock")}
            @click=${this._turnOn}
          >
            <ha-state-icon
              .stateObj=${this.stateObj}
              .stateValue=${locking ? "locking" : "locked"}
            ></ha-state-icon>
          </ha-control-button>
          <ha-control-button
            .label=${modeText(this._localize as any, "ui.card.lock.unlock")}
            @click=${this._turnOff}
          >
            <ha-state-icon
              .stateObj=${this.stateObj}
              .stateValue=${unlocking ? "unlocking" : "unlocked"}
            ></ha-state-icon>
          </ha-control-button>
        </div>
      `;
    }

    if (this.board && this._isOn && !locking) {
      return html`
        <div class="slide" style=${styleMap({ "--tile-color": color })}>
          <span class="slide-label" aria-hidden="true"
            >${modeText(this._localize as any, "ui.entity_sheet.slide_to_unlock")}</span
          >
          <button
            type="button"
            class="thumb"
            aria-label=${modeText(
              this._localize as any,
              "ui.entity_sheet.slide_to_unlock"
            )}
            style=${styleMap({ transform: `translateX(${this._slideX}px)` })}
            .disabled=${this.stateObj.state === UNAVAILABLE}
            @pointerdown=${this._onSlideDown}
            @pointermove=${this._onSlideMove}
            @pointerup=${this._onSlideUp}
            @pointercancel=${this._onSlideUp}
            @keydown=${this._onSlideKey}
            @click=${this._onSlideClick}
          >
            <ha-state-icon
              .stateObj=${this.stateObj}
              .stateValue=${"locked"}
            ></ha-state-icon>
          </button>
        </div>
        <p class="tile-state" role="status" aria-live="polite">
          ${this._formatters?.formatEntityState(this.stateObj)}
        </p>
      `;
    }

    if (this.board) {
      return html`
        <button
          type="button"
          class="tile"
          role="switch"
          aria-checked=${this._isOn ? "true" : "false"}
          aria-label=${modeText(this._localize as any, "ui.card.lock.lock")}
          style=${styleMap({ "--tile-color": color })}
          .disabled=${this.stateObj.state === UNAVAILABLE}
          @click=${this._tileClicked}
        >
          <ha-state-icon
            .stateObj=${this.stateObj}
            .stateValue=${
              this._isOn
                ? locking
                  ? "locking"
                  : "locked"
                : unlocking
                  ? "unlocking"
                  : "unlocked"
            }
            class=${classMap({ pulse: locking || unlocking })}
          ></ha-state-icon>
        </button>
        <p class="tile-state" role="status" aria-live="polite">
          ${this._formatters?.formatEntityState(this.stateObj)}
        </p>
      `;
    }

    return html`
      <ha-control-switch
        touch-action="none"
        vertical
        reversed
        .checked=${this._isOn}
        @change=${this._valueChanged}
        .label=${
          this._isOn
            ? modeText(this._localize as any, "ui.card.lock.unlock")
            : modeText(this._localize as any, "ui.card.lock.lock")
        }
        style=${styleMap({
          "--control-switch-on-color": color,
          "--control-switch-off-color": color,
        })}
        .disabled=${this.stateObj.state === UNAVAILABLE}
      >
        <ha-state-icon
          slot="icon-on"
          .stateObj=${this.stateObj}
          .stateValue=${locking ? "locking" : "locked"}
          class=${classMap({ pulse: locking })}
        ></ha-state-icon>
        <ha-state-icon
          slot="icon-off"
          .stateObj=${this.stateObj}
          .stateValue=${unlocking ? "unlocking" : "unlocked"}
          class=${classMap({ pulse: unlocking })}
        ></ha-state-icon>
      </ha-control-switch>
    `;
  }

  static styles = [
    stateControlToggleStyle,
    stateControlPulseStyle,
    css`
      :host([board]) {
        display: block;
        width: 100%;
      }
      .tile {
        appearance: none;
        position: relative;
        overflow: hidden;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 168px;
        height: 168px;
        margin: 0 auto;
        padding: 0;
        border: none;
        border-radius: var(--ha-border-radius-6xl);
        background: none;
        color: var(--tile-color, var(--primary-text-color));
        cursor: pointer;
        --mdc-icon-size: 40px;
        -webkit-tap-highlight-color: transparent;
      }
      @media (max-width: 600px) {
        .tile {
          width: 100%;
          max-width: 320px;
          height: 64px;
          border-radius: var(--ha-border-radius-pill, 32px);
        }
      }
      .slide {
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        box-sizing: border-box;
        width: 100%;
        max-width: 400px;
        height: 64px;
        margin: 0 auto;
        border-radius: var(--ha-border-radius-pill, 32px);
        background: color-mix(
          in srgb,
          var(--tile-color, var(--disabled-color)) 30%,
          transparent
        );
        color: var(--primary-text-color);
        overflow: hidden;
        touch-action: pan-y;
      }
      .slide-label {
        font-weight: var(--ha-font-weight-medium);
        pointer-events: none;
      }
      .thumb {
        appearance: none;
        position: absolute;
        left: 4px;
        top: 4px;
        width: 56px;
        height: 56px;
        padding: 0;
        border: none;
        border-radius: 50%;
        background: var(--tile-color, var(--primary-color));
        color: var(--text-primary-color, #fff);
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: grab;
        touch-action: none;
        --mdc-icon-size: 28px;
      }
      .thumb:focus-visible {
        outline: 2px solid var(--primary-text-color);
        outline-offset: 2px;
      }
      .tile::before {
        content: "";
        position: absolute;
        inset: 0;
        background: var(--tile-color, var(--disabled-color));
        opacity: 0.3;
        pointer-events: none;
      }
      .tile:focus-visible {
        outline: 2px solid var(--tile-color, var(--primary-text-color));
        outline-offset: 3px;
      }
      .tile-state {
        margin: var(--ha-space-3) 0 0;
        text-align: center;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-m);
      }
      .tile:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-lock-toggle": HaStateControlLockToggle;
  }
}
