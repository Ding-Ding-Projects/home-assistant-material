import { mdiCheck } from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { keyed } from "lit/directives/keyed";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/ha-two-key-confirm";
import type { HomeAssistant } from "../../../../../types";
import "./ha-game-coin";
import "./ha-game-cookie";
import "./ha-game-four";
import "./ha-game-moles";
import type { SuperProgress, SuperStep } from "./super-confirm-steps";
import {
  SUPER_STEPS,
  allStepsDone,
  finishStep,
  leftPage,
  startSuperConfirm,
  stepState,
} from "./super-confirm-steps";

declare global {
  interface HASSDomEvents {
    /** All five steps are finished: go back without a backup. */
    "super-confirmed": undefined;
    /** The person chose to make a backup instead. */
    "super-make-backup": undefined;
  }
}

const PREFIX = "ui.panel.config.updates.history.super";

/**
 * The only way to go back without a backup: two keys and the slider, then
 * whack-a-mole, four in a row, a coin spun until heads and a cookie clicked
 * to 100, in that order and in one sitting. Leaving or hiding the page
 * starts again from step 1. Making a backup instead is always offered first.
 */
@customElement("ha-going-back-super-confirm")
export class HaGoingBackSuperConfirm extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The build being gone back to, as shown. */
  @property({ attribute: false }) public build = "";

  /** The pass is being asked for, or going back is being started. */
  @property({ type: Boolean, attribute: false }) public busy = false;

  @state() private _progress: SuperProgress = startSuperConfirm();

  /** Changes on every fresh start, so each game starts from nothing. */
  @state() private _attempt = 0;

  private _lang = new LanguageModeController(this);

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._visibility);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._visibility);
    this._restart();
  }

  private _visibility = () => {
    if (document.visibilityState === "hidden") {
      this._restart();
    }
  };

  private _restart(): void {
    this._progress = leftPage(this._progress);
    this._attempt += 1;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  protected render(): TemplateResult {
    const done = allStepsDone(this._progress);
    return html`<section class="panel" aria-labelledby="super-title">
      <h3 id="super-title">${this._t("title", { build: this.build })}</h3>
      <p class="quiet">${this._t("intro")}</p>
      <p class="progress" aria-live="polite">
        ${
          done
            ? this._t("state_done")
            : this._t("progress", { step: this._progress.done + 1 })
        }
      </p>
      <ol class="steps">
        ${SUPER_STEPS.map((step, index) => this._renderStep(step, index))}
      </ol>
      <div class="actions">
        <ha-button
          variant="brand"
          appearance="filled"
          @click=${this._makeBackup}
          .disabled=${this.busy}
        >
          ${this._t("make_backup")}
        </ha-button>
        <ha-button
          variant="danger"
          appearance="outlined"
          .disabled=${!done || this.busy}
          @click=${this._confirm}
        >
          ${this._t("go_without")}
        </ha-button>
      </div>
    </section>`;
  }

  private _renderStep(step: SuperStep, index: number): TemplateResult {
    const stateOf = stepState(this._progress, step);
    return html`<li class=${classMap({ step: true, [stateOf]: true })}>
      <div class="step-head">
        <span class="badge" aria-hidden="true">
          ${
            stateOf === "done"
              ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
              : index + 1
          }
        </span>
        <div class="step-text">
          <span class="step-name">${this._t(`step_${step}`)}</span>
          <span class="quiet">
            ${
              stateOf === "done"
                ? this._t("state_done")
                : stateOf === "waiting"
                  ? this._t("state_waiting")
                  : step === "keys"
                    ? nothing
                    : this._t(`rule_${step}`)
            }
          </span>
        </div>
      </div>
      ${
        stateOf === "current"
          ? keyed(
              this._attempt,
              html`<div class="game">${this._renderGame(step)}</div>`
            )
          : nothing
      }
    </li>`;
  }

  private _renderGame(step: SuperStep): TemplateResult {
    switch (step) {
      case "keys":
        return html`<ha-two-key-confirm
          @two-key-confirmed=${this._finishKeys}
        ></ha-two-key-confirm>`;
      case "moles":
        return html`<ha-game-moles
          .hass=${this.hass}
          @game-won=${this._finishMoles}
        ></ha-game-moles>`;
      case "four":
        return html`<ha-game-four
          .hass=${this.hass}
          @game-won=${this._finishFour}
        ></ha-game-four>`;
      case "coin":
        return html`<ha-game-coin
          .hass=${this.hass}
          @game-won=${this._finishCoin}
        ></ha-game-coin>`;
      default:
        return html`<ha-game-cookie
          .hass=${this.hass}
          @game-won=${this._finishCookie}
        ></ha-game-cookie>`;
    }
  }

  private _finish(step: SuperStep): void {
    this._progress = finishStep(this._progress, step);
  }

  private _finishKeys = (ev: Event) => {
    ev.stopPropagation();
    this._finish("keys");
  };

  private _finishMoles = () => this._finish("moles");

  private _finishFour = () => this._finish("four");

  private _finishCoin = () => this._finish("coin");

  private _finishCookie = () => this._finish("cookie");

  private _makeBackup = () => {
    fireEvent(this, "super-make-backup");
  };

  private _confirm = () => {
    if (allStepsDone(this._progress) && !this.busy) {
      fireEvent(this, "super-confirmed");
    }
  };

  static styles = css`
    :host {
      display: block;
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-4xl, 16px);
      background: var(--secondary-background-color);
    }
    h3,
    p,
    ol {
      margin: 0;
    }
    h3 {
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-bold);
      overflow-wrap: anywhere;
    }
    .quiet {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .progress {
      font-weight: var(--ha-font-weight-bold);
    }
    .steps {
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
    }
    .step {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) 0;
      border-top: 1px solid var(--divider-color);
    }
    .step:first-child {
      border-top: none;
    }
    .step.waiting {
      opacity: 0.6;
    }
    .step-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 44px;
    }
    .badge {
      flex: none;
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-bold);
      box-shadow: inset 0 0 0 2px var(--divider-color);
      --mdc-icon-size: 16px;
    }
    .current .badge {
      box-shadow: none;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .done .badge {
      box-shadow: none;
      background: var(--success-color, #2e7d32);
      color: #fff;
    }
    .step-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .step-name {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .game {
      padding-left: 0;
    }
    @media (min-width: 480px) {
      .game {
        padding-left: 36px;
      }
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .actions ha-button {
      flex: 1 1 160px;
      --ha-button-height: 44px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-going-back-super-confirm": HaGoingBackSuperConfirm;
  }
}
