import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiClockOutline,
  mdiSkipNextCircle,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query } from "lit/decorators";
import { playRingFlash, playShake } from "../../../../common/motion/moments";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/progress/ha-progress-bar";
import type { UpdateEntity } from "../../../../data/update";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { QueueStep } from "./update-queue";
import { queueIsActive, queueProgress } from "./update-queue";
import type { UpdateQueueController } from "./update-queue-controller";

const PREFIX = "ui.panel.config.updates.queue";

/** The name an update is shown under. */
export const updateDisplayName = (
  hass: HomeAssistant,
  entityId: string,
  fallback?: string
): string => {
  const entity = hass.states[entityId] as UpdateEntity | undefined;
  if (!entity) {
    // The entity can be gone after a restart; the name kept with the step is
    // better than a raw id.
    return fallback || entityId;
  }
  return (
    entity.attributes.title || hass.formatEntityName(entity) || entity.entity_id
  );
};

const STATE_ICON: Partial<Record<QueueStep["state"], string>> = {
  waiting: mdiClockOutline,
  done: mdiCheckCircle,
  failed: mdiAlertCircle,
  skipped: mdiSkipNextCircle,
};

/** The card at the top of the updates page while "Update everything" runs. */
@customElement("ha-update-queue-card")
class HaUpdateQueueCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public controller!: UpdateQueueController;

  private _lang = new LanguageModeController(this);

  @query(".ring") private _ring?: SVGElement;

  @query(".card") private _card?: HTMLElement;

  // What the card showed last, so the finish and the failure play once.
  private _wasActive = false;

  private _wasFailed = false;

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  protected updated(): void {
    const queue = this.controller.queue;
    if (!queue) {
      this._wasActive = false;
      this._wasFailed = false;
      return;
    }
    const active = queueIsActive(queue);
    const failed = !!queue.failure && !this.controller.checking;
    if (this._wasActive && !active && !failed && !queue.stopRequested) {
      playRingFlash(this._ring);
    }
    if (failed && !this._wasFailed) {
      playShake(this._card);
    }
    this._wasActive = active;
    this._wasFailed = failed;
  }

  protected render(): TemplateResult | typeof nothing {
    const queue = this.controller.queue;
    if (!queue) {
      return nothing;
    }
    const active = queueIsActive(queue);
    const progress = queueProgress(queue);
    const current = queue.steps.find(
      (step) => step.state === "updating" || step.state === "failed"
    );
    const currentName = current
      ? updateDisplayName(this.hass, current.entityId, current.title)
      : "";
    const done = queue.steps.filter((step) => step.state === "done").length;
    const currentEntity = current
      ? (this.hass.states[current.entityId] as UpdateEntity | undefined)
      : undefined;
    const stepPercent = currentEntity?.attributes.update_percentage;

    let title: string;
    let text: string | undefined;
    const checking = this.controller.checking;
    if (checking) {
      title = this._t("checking_title");
      text = this._t("checking_text");
    } else if (queue.failure) {
      title = this._t("failed_title", { name: currentName });
      text = this._t(`failed_text_${queue.failure.reason}`, {
        error: this.controller.failureMessage || this._t("error_unknown"),
      });
    } else if (active) {
      title = this._t("progress_title", {
        position: progress.position,
        total: progress.total,
        name: currentName,
      });
      text = queue.stopRequested
        ? this._t("stopping", { name: currentName })
        : undefined;
    } else {
      title = queue.stopRequested
        ? this._t("stopped_title")
        : this._t("finished_title");
      text = this._t("finished_text", { done, total: progress.total });
    }

    const progressText = this._t("progress_text", {
      finished: progress.finished,
      total: progress.total,
    });

    return html`
      <section class="card" aria-labelledby="queue-title">
        <div class="title-row">
          <svg class="ring" viewBox="0 0 36 36" aria-hidden="true">
            <g transform="rotate(-90 18 18)">
              <circle class="ring-track" cx="18" cy="18" r="15" />
              <circle
                class="ring-arc"
                cx="18"
                cy="18"
                r="15"
                pathLength="100"
                stroke-dasharray="${Math.max(0, Math.min(100, progress.percent))} 100"
              />
            </g>
          </svg>
          <h2
            id="queue-title"
            class=${queue.failure && !checking ? "failed" : ""}
          >
            ${title}
          </h2>
        </div>
        ${text ? html`<p class="lead">${text}</p>` : nothing}
        <ha-progress-bar
          .value=${progress.percent}
          .label=${`${this._t("progress_label")}: ${progressText}`}
        ></ha-progress-bar>
        <p class="progress-text">
          ${progressText}${
            active && typeof stepPercent === "number"
              ? html` · ${currentName}: ${stepPercent}%`
              : nothing
          }
        </p>
        ${
          active && typeof stepPercent === "number"
            ? html`<ha-progress-bar
                class="step-bar"
                .value=${stepPercent}
                .label=${`${currentName}: ${stepPercent}%`}
              ></ha-progress-bar>`
            : nothing
        }
        <ol class="steps" aria-label=${this._t("steps_label")}>
          ${queue.steps.map((step) => this._renderStep(step, checking))}
        </ol>
        <div class="actions">
          ${
            checking
              ? nothing
              : queue.failure
                ? html`
                    <ha-button appearance="filled" @click=${this._retry}>
                      ${this._t("retry")}
                    </ha-button>
                    <ha-button appearance="outlined" @click=${this._skip}>
                      ${this._t("skip")}
                    </ha-button>
                  `
                : active
                  ? html`
                      <ha-button
                        appearance="outlined"
                        .disabled=${queue.stopRequested}
                        @click=${this._stop}
                      >
                        ${this._t("stop")}
                      </ha-button>
                      <span class="note">${this._t("stop_note")}</span>
                    `
                  : html`<ha-button appearance="filled" @click=${this._dismiss}>
                      ${this._t("dismiss")}
                    </ha-button>`
          }
        </div>
      </section>
    `;
  }

  private _renderStep(step: QueueStep, checking: boolean): TemplateResult {
    // While the restored page has no real data, a step that was running or
    // failed is shown as checking, never as failed.
    const shownState =
      checking && (step.state === "failed" || step.state === "updating")
        ? "checking"
        : step.state;
    const icon = STATE_ICON[step.state];
    return html`
      <li class="step ${shownState}">
        <span class="step-icon" aria-hidden="true">
          ${
            shownState === "updating" || shownState === "checking"
              ? html`<ha-spinner size="small"></ha-spinner>`
              : icon
                ? html`<ha-svg-icon .path=${icon}></ha-svg-icon>`
                : nothing
          }
        </span>
        <span class="step-name"
          >${updateDisplayName(this.hass, step.entityId, step.title)}</span
        >
        <span class="step-state">${this._t(`state_${shownState}`)}</span>
      </li>
    `;
  }

  private _stop(): void {
    this.controller.stopAfterCurrent();
  }

  private _retry(): void {
    this.controller.retry();
  }

  private _skip(): void {
    this.controller.skip();
  }

  private _dismiss(): void {
    this.controller.dismiss();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        /* The shared heading style keeps an h2 on one line and cuts it with an
           ellipsis. Headings on this page are long and must wrap. */
        h1,
        h2,
        h3 {
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: anywhere;
          max-width: 100%;
        }
        :host {
          display: block;
        }
        .card {
          box-sizing: border-box;
          padding: clamp(16px, 3vw, 32px);
          border-radius: calc(var(--ha-border-radius-6xl) + 4px);
          background: color-mix(
            in srgb,
            var(--primary-color) 16%,
            var(--card-background-color)
          );
          border: 2px solid var(--primary-color);
        }
        h2 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-bold);
          overflow-wrap: anywhere;
        }
        h2.failed {
          color: var(--error-color);
        }
        .title-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-2);
        }
        .title-row h2 {
          margin: 0;
          flex: 1;
          min-width: 0;
        }
        /* The ring fills as the queue advances and closes when it finishes. */
        .ring {
          flex: none;
          width: 36px;
          height: 36px;
        }
        .ring circle {
          fill: none;
          stroke-width: 4;
        }
        .ring-track {
          stroke: color-mix(
            in srgb,
            var(--primary-text-color) 14%,
            transparent
          );
        }
        .ring-arc {
          stroke: var(--primary-color);
          stroke-linecap: round;
          transition: stroke-dasharray 400ms ease-out;
        }
        @media (prefers-reduced-motion: reduce) {
          .ring-arc {
            transition: none;
          }
        }
        .lead {
          margin: 0 0 var(--ha-space-3);
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        ha-progress-bar {
          --ha-progress-bar-track-height: 16px;
          --ha-progress-bar-indicator-color: var(--primary-color);
        }
        .step-bar {
          --ha-progress-bar-track-height: 8px;
          margin-block-start: var(--ha-space-2);
        }
        .progress-text {
          margin: var(--ha-space-2) 0 var(--ha-space-3);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .steps {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .step {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 48px;
          padding: 0 var(--ha-space-4);
          border-radius: var(--ha-border-radius-2xl);
          background: var(--card-background-color);
        }
        .step-icon {
          display: inline-flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 24px;
          color: var(--secondary-text-color);
        }
        .step.done .step-icon {
          color: var(--success-color);
        }
        .step.failed .step-icon,
        .step.failed .step-state {
          color: var(--error-color);
        }
        .step.updating .step-name,
        .step.checking .step-name {
          font-weight: var(--ha-font-weight-medium);
        }
        .step-name {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .step-state {
          flex: none;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-4);
          margin-block-start: var(--ha-space-4);
        }
        .actions ha-button {
          min-height: 48px;
        }
        .note {
          flex: 1 1 200px;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          ha-progress-bar {
            --ha-progress-bar-animation-duration: 0s;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-queue-card": HaUpdateQueueCard;
  }
}
