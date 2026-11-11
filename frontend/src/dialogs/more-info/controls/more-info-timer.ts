import { mdiCheck, mdiPause, mdiPlay, mdiStop } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../../common/decorators/consume";
import { TimerRemainingTimeController } from "../../../common/controllers/timer-remaining-time-controller";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import durationToSeconds from "../../../common/datetime/duration_to_seconds";
import secondsToDuration from "../../../common/datetime/seconds_to_duration";
import type { HASSDomCurrentTargetEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-control-button";
import "../../../components/ha-svg-icon";
import type { HaButton } from "../../../components/ha-button";
import "../../../components/ha-duration-input";
import type { HaDurationData } from "../../../components/ha-duration-input";
import { apiContext, formattersContext } from "../../../data/context";
import type { ExtEntityRegistryEntry } from "../../../data/entity/entity_registry";
import { shouldShowFavoriteOptions } from "../../../data/entity/entity_registry";
import type { TimerEntity } from "../../../data/timer";
import {
  computeDisplayTimer,
  timerDurationData,
  timerJustFinished,
} from "../../../data/timer";
import type {
  HomeAssistantApi,
  HomeAssistantFormatters,
  ValueChangedEvent,
} from "../../../types";
import "../components/timers/ha-more-info-timer-presets";
import { moreInfoControlStyle } from "../components/more-info-control-style";

const RING_RADIUS = 88;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

@customElement("more-info-timer")
class MoreInfoTimer extends LitElement {
  @property({ attribute: false }) public stateObj?: TimerEntity;

  @property({ attribute: false }) public entry?: ExtEntityRegistryEntry | null;

  @property({ attribute: false }) public editMode?: boolean;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state() private _duration?: HaDurationData;

  @state() private _finished = false;

  private _remainingTime = new TimerRemainingTimeController(this);

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    // Seed the field once from the configured duration and keep it static,
    // so it never jumps to the live remaining time as the timer ticks.
    if (this._duration === undefined && this.stateObj) {
      this._duration = timerDurationData(this.stateObj);
    }
    if (changedProps.has("stateObj")) {
      this._remainingTime.setStateObj(this.stateObj);
      if (
        this.stateObj &&
        timerJustFinished(changedProps.get("stateObj"), this.stateObj)
      ) {
        this._finished = true;
      }
    }
  }

  private _finishedAnimationEnded(): void {
    this._finished = false;
  }

  protected render() {
    if (!this._localize || !this._formatters || !this.stateObj) {
      return nothing;
    }

    const timerState = this.stateObj.state;

    const showPresets = Boolean(
      this.entry &&
      (this.editMode ||
        shouldShowFavoriteOptions(this.entry.options?.timer?.presets))
    );

    const totalSeconds = durationToSeconds(this.stateObj.attributes.duration);
    const remaining = this._remainingTime.timeRemaining;
    const fraction =
      timerState === "idle" || !totalSeconds || remaining === undefined
        ? 0
        : Math.min(Math.max(remaining / totalSeconds, 0), 1);
    const dash = (fraction * RING_CIRCUMFERENCE).toFixed(2);
    const display =
      computeDisplayTimer(
        this._formatters.formatEntityState,
        this.stateObj,
        remaining
      ) ?? "";

    return html`
      <div class="controls">
        <div
          class=${classMap({ ring: true, finished: this._finished })}
          role="img"
          aria-label=${display}
          @animationend=${this._finishedAnimationEnded}
        >
          <svg viewBox="0 0 200 200" aria-hidden="true">
            <circle class="track" cx="100" cy="100" r=${RING_RADIUS}></circle>
            <circle
              class="progress"
              cx="100"
              cy="100"
              r=${RING_RADIUS}
              stroke-dasharray="${dash} ${RING_CIRCUMFERENCE}"
              transform="rotate(-90 100 100)"
            ></circle>
          </svg>
          <div class="ring-text">
            <div class="remaining">${display}</div>
            ${
              totalSeconds
                ? html`<div class="of">
                    ${this._localize(
                      "ui.dialogs.more_info_control.timer.of_duration",
                      { duration: secondsToDuration(totalSeconds) ?? "0" }
                    )}
                  </div>`
                : nothing
            }
          </div>
        </div>
        <div class="round-actions">
          ${
            timerState === "active"
              ? html`
                  <ha-control-button
                    class="primary"
                    .label=${this._localize("ui.card.timer.actions.pause")}
                    .action=${"pause"}
                    @click=${this._handleActionClick}
                  >
                    <ha-svg-icon .path=${mdiPause}></ha-svg-icon>
                  </ha-control-button>
                `
              : nothing
          }
          ${
            timerState === "paused"
              ? html`
                  <ha-control-button
                    class="primary"
                    .label=${this._localize("ui.card.timer.actions.start")}
                    .action=${"start"}
                    @click=${this._handleActionClick}
                  >
                    <ha-svg-icon .path=${mdiPlay}></ha-svg-icon>
                  </ha-control-button>
                `
              : nothing
          }
          ${
            timerState === "active" || timerState === "paused"
              ? html`
                  <ha-control-button
                    .label=${this._localize("ui.card.timer.actions.cancel")}
                    .action=${"cancel"}
                    @click=${this._handleActionClick}
                  >
                    <ha-svg-icon .path=${mdiStop}></ha-svg-icon>
                  </ha-control-button>
                  <ha-control-button
                    .label=${this._localize("ui.card.timer.actions.finish")}
                    .action=${"finish"}
                    @click=${this._handleActionClick}
                  >
                    <ha-svg-icon .path=${mdiCheck}></ha-svg-icon>
                  </ha-control-button>
                `
              : nothing
          }
        </div>
        <ha-duration-input
          .data=${this._duration}
          required
          @value-changed=${this._durationChanged}
        ></ha-duration-input>
        <div class="actions">
          <ha-button appearance="filled" size="s" @click=${this._start}>
            ${
              timerState === "idle"
                ? this._localize("ui.card.timer.actions.start")
                : this._localize("ui.card.timer.actions.set")
            }
          </ha-button>
        </div>
        ${
          showPresets
            ? html`
                <ha-more-info-timer-presets
                  .stateObj=${this.stateObj}
                  .entry=${this.entry}
                  .editMode=${this.editMode}
                ></ha-more-info-timer-presets>
              `
            : nothing
        }
      </div>
    `;
  }

  private _durationChanged(
    ev: ValueChangedEvent<HaDurationData | undefined>
  ): void {
    this._duration = ev.detail.value;
  }

  // Used by idle "Start" and active/paused "Set": (re)starts the timer with the
  // entered duration. timer.start has no upper bound, so values beyond the
  // configured duration are accepted.
  private _start(): void {
    this._api.callService("timer", "start", {
      entity_id: this.stateObj!.entity_id,
      ...(this._duration ? { duration: this._duration } : {}),
    });
  }

  private _handleActionClick(
    e: MouseEvent & HASSDomCurrentTargetEvent<HaButton & { action: string }>
  ): void {
    const action = e.currentTarget.action;
    this._api.callService("timer", action, {
      entity_id: this.stateObj!.entity_id,
    });
  }

  static styles = [
    moreInfoControlStyle,
    css`
      ha-duration-input {
        display: flex;
        justify-content: center;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        justify-content: center;
      }
      .ring {
        position: relative;
        width: min(100%, 240px);
        aspect-ratio: 1;
      }
      .ring svg {
        display: block;
        width: 100%;
        height: 100%;
      }
      .ring circle {
        fill: none;
        stroke-width: 14;
      }
      .ring .track {
        stroke: var(--divider-color);
      }
      .ring .progress {
        stroke: var(--primary-color);
        stroke-linecap: round;
      }
      .ring-text {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
        padding: var(--ha-space-8);
      }
      .remaining {
        font-size: var(--ha-font-size-4xl, 40px);
        line-height: var(--ha-line-height-condensed);
        font-weight: var(--ha-font-weight-medium);
        direction: ltr;
      }
      .of {
        color: var(--secondary-text-color);
        direction: ltr;
      }
      .round-actions {
        display: flex;
        justify-content: center;
        gap: var(--ha-space-3);
      }
      .round-actions ha-control-button {
        --control-button-border-radius: 50%;
        --control-button-icon-color: var(--primary-text-color);
        width: 56px;
        height: 56px;
        flex: none;
      }
      .round-actions ha-control-button.primary {
        --control-button-background-color: var(--primary-color);
        --control-button-background-opacity: 1;
        --control-button-icon-color: var(--text-primary-color);
      }
      .ring.finished {
        animation: timer-finished-pulse 0.5s ease-in-out 2;
      }
      @keyframes timer-finished-pulse {
        50% {
          opacity: 0.4;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .ring.finished {
          animation-duration: var(--ha-animation-duration-none);
        }
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-timer": MoreInfoTimer;
  }
}
