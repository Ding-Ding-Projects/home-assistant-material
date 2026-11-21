import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiCheckCircleOutline,
  mdiChevronRight,
  mdiClockOutline,
  mdiNewBox,
  mdiSkipNextCircle,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { formatElapsed } from "../../../../common/app-jobs/app-job-logic";
import { playTickDraw } from "../../../../common/motion/moments";
import { motionKindTiming } from "../../../../common/motion/page-entry";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/graphics/ha-drama-badge";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/progress/ha-progress-bar";
import type { UpdateRunRecord } from "../../../../data/auto-update";
import {
  clearUpdateRun,
  formatAutoUpdateTime,
} from "../../../../data/auto-update";
import { notesPageUrlForVersion } from "../../../../data/build-notes";
import type { UpdateEntity } from "../../../../data/update";
import { haMotionKeyframes } from "../../../../resources/motion-styles";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import type { QueueState, QueueStep } from "./update-queue";
import {
  queueIsActive,
  queueProgress,
  roleRestartsSystem,
} from "./update-queue";
import { ringFromSteps, ringOffset } from "./update-glance";
import { queueOrderOf, queuePositionOf } from "./update-progress-model";
import type { UpdateQueueController } from "./update-queue-controller";
import type { SharedStepState } from "./update-run-share";
import {
  DRIVER_SILENT_MS,
  sharedRunPhase,
  sharedRunView,
} from "./update-run-share";

const PREFIX = "ui.panel.config.updates.queue";

// The arc is drawn with a path length of 100, so the offset is a percentage.
const RING_LENGTH = 100;

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

// A shared run only says where it is, so a step it moved past is shown as
// finished, never as installed: it may have been skipped.
const SHARED_STEP_ICON: Partial<Record<SharedStepState, string>> = {
  finished: mdiCheckCircleOutline,
  failed: mdiAlertCircle,
  waiting: mdiClockOutline,
};

const SHARED_STEP_CLASS: Record<SharedStepState, string> = {
  finished: "finished",
  current: "updating",
  failed: "failed",
  waiting: "waiting",
  unknown: "unknown",
};

/** The card at the top of the updates page while "Update everything" runs. */
@customElement("ha-update-queue-card")
class HaUpdateQueueCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public controller!: UpdateQueueController;

  /**
   * A run another browser is driving. It is shown only when this browser has
   * no queue of its own, and then read-only: nothing here can drive it.
   */
  @property({ attribute: false }) public sharedRun?: UpdateRunRecord;

  /**
   * When, on this browser's clock, the browser driving the shared run last
   * reported. A run not heard from for a while is shown as stranded.
   */
  @property({ attribute: false }) public sharedSeenAt?: number;

  // The ended shared run this browser closed, by its last change time.
  @state() private _hiddenShared?: string;

  // Clearing a stranded run is on its way, or was refused.
  @state() private _clearing = false;

  @state() private _clearFailed = false;

  // Wakes the card when a driven shared run would turn silent.
  private _silentTimer?: number;

  private _lang = new LanguageModeController(this);

  @query(".ring-arc") private _arc?: SVGCircleElement;

  @query(".card") private _card?: HTMLElement;

  @queryAll(".tick-path") private _ticks?: NodeListOf<SVGPathElement>;

  // What the card showed last, so the finish and the failure play once.
  private _wasActive = false;

  private _wasFailed = false;

  // The finished or failed moment that plays: set only when the state changed
  // while the page was open, so a reload does not replay it.
  private _moment?: "finished" | "failed";

  // How full the ring was at the last render, so it eases from there.
  private _shownFraction?: number;

  // The ticks already drawn, so each step's tick draws once.
  private _drawnTicks = new Set<string>();

  // The clock the elapsed times are measured against; it only ticks while a
  // queue is running.
  @state() private _now = Date.now();

  private _clock?: number;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopClock();
    this._stopSilentTimer();
  }

  private _stopSilentTimer(): void {
    if (this._silentTimer !== undefined) {
      window.clearTimeout(this._silentTimer);
      this._silentTimer = undefined;
    }
  }

  // A shared run that is still driven turns silent at a known time: the card
  // renders again then, without a clock ticking every second.
  private _planSilentCheck(): void {
    this._stopSilentTimer();
    if (this.controller?.queue || this.sharedSeenAt === undefined) {
      return;
    }
    if (
      sharedRunPhase(this.sharedRun, this.sharedSeenAt, Date.now()) !==
      "running"
    ) {
      return;
    }
    const wait = Math.max(0, this.sharedSeenAt + DRIVER_SILENT_MS - Date.now());
    this._silentTimer = window.setTimeout(() => {
      this._silentTimer = undefined;
      this._now = Date.now();
    }, wait + 50);
  }

  private _stopClock(): void {
    if (this._clock !== undefined) {
      window.clearInterval(this._clock);
      this._clock = undefined;
    }
  }

  private _progressText(key: string, elapsedMs: number): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.updates.progress.${key}`,
      { elapsed: formatElapsed(Math.max(0, elapsedMs)) }
    );
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  // Decides, before the render, whether the finished or the failed moment
  // plays: only for a change seen on this page, never on a reload.
  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (changedProps.has("sharedRun") || changedProps.has("sharedSeenAt")) {
      // Judge the shared run against the time it arrived, not a stale clock.
      this._now = Date.now();
      if (changedProps.has("sharedRun")) {
        this._clearFailed = false;
      }
    }
    const queue = this.controller?.queue;
    if (!queue) {
      this._wasActive = false;
      this._wasFailed = false;
      this._moment = undefined;
      return;
    }
    const active = queueIsActive(queue);
    const failed = !!queue.failure && !this.controller.checking;
    if (this._wasActive && !active && !failed && !queue.stopRequested) {
      this._moment = "finished";
    } else if (failed && !this._wasFailed) {
      this._moment = "failed";
    } else if (active || (!failed && this._moment === "failed")) {
      this._moment = undefined;
    }
    this._wasActive = active;
    this._wasFailed = failed;
  }

  protected updated(): void {
    const queue = this.controller.queue;
    if (!queue) {
      this._stopClock();
    } else {
      const active = queueIsActive(queue);
      if (active && this._clock === undefined) {
        this._clock = window.setInterval(() => {
          this._now = Date.now();
        }, 1000);
      } else if (!active) {
        this._stopClock();
      }
    }
    this._planSilentCheck();
    this._easeRing();
    this._drawTicks();
  }

  // The ring eases from where it stood to its new value, once per change,
  // with the duration and curve of the Arrivals motion kind.
  private _easeRing(): void {
    const arc = this._arc;
    if (!arc) {
      this._shownFraction = undefined;
      return;
    }
    const target = Number(arc.dataset.fraction ?? "0");
    const from = this._shownFraction ?? 0;
    this._shownFraction = target;
    if (from === target || typeof arc.animate !== "function") {
      return;
    }
    const timing = motionKindTiming("arrivals");
    if (!timing.enabled) {
      return;
    }
    arc.animate(
      [
        { strokeDashoffset: String(ringOffset(from, RING_LENGTH)) },
        { strokeDashoffset: String(ringOffset(target, RING_LENGTH)) },
      ],
      { duration: timing.duration, easing: timing.easing }
    );
  }

  // A finished step's tick draws once, the first time it shows.
  private _drawTicks(): void {
    this._ticks?.forEach((path) => {
      const key = path.dataset.key ?? "";
      if (this._drawnTicks.has(key)) {
        return;
      }
      this._drawnTicks.add(key);
      playTickDraw(path);
    });
  }

  // The ring of a run, the size of the one it replaces, filled to the steps
  // that finished. A finished run shows a tick, a moment plays its badge.
  private _renderRing(
    finished: number,
    total: number,
    finishedOk: boolean,
    failed: boolean
  ): TemplateResult {
    if (this._moment === "finished" && finishedOk) {
      return html`<ha-drama-badge
        class="ring moment"
        kind="finished"
      ></ha-drama-badge>`;
    }
    if (this._moment === "failed" && failed) {
      return html`<ha-drama-badge
        class="ring moment"
        kind="failed"
        .shakeTarget=${this._card}
      ></ha-drama-badge>`;
    }
    if (finishedOk) {
      return html`<ha-svg-icon
        class="ring tick"
        .path=${mdiCheckCircle}
      ></ha-svg-icon>`;
    }
    const ring = ringFromSteps(finished, total);
    return html`<svg
      class="ring ${failed ? "failed" : ""}"
      viewBox="0 0 36 36"
      aria-hidden="true"
    >
      <circle class="ring-track" cx="18" cy="18" r="15" />
      <circle
        class="ring-arc"
        cx="18"
        cy="18"
        r="15"
        pathLength=${RING_LENGTH}
        stroke-dasharray=${RING_LENGTH}
        stroke-dashoffset=${ringOffset(ring.fraction, RING_LENGTH)}
        data-fraction=${String(ring.fraction)}
        transform="rotate(-90 18 18)"
      />
    </svg>`;
  }

  private _cardClasses(shared: boolean) {
    return classMap({
      card: true,
      shared,
      rise: motionKindTiming("cards").enabled,
    });
  }

  protected render(): TemplateResult | typeof nothing {
    const queue = this.controller.queue;
    if (!queue) {
      return this._renderShared();
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
      const startedAt = Math.min(
        ...queue.steps.map((step) => step.startedAt ?? Infinity)
      );
      const endedAt = Math.max(...queue.steps.map((step) => step.endedAt ?? 0));
      text = this._t("finished_text", { done, total: progress.total });
      if (Number.isFinite(startedAt) && endedAt > startedAt) {
        text += ` ${this._t("finished_took", {
          time: formatElapsed(endedAt - startedAt),
        })}`;
      }
    }

    // A finished queue shows a tick where the ring was, never an empty ring.
    const finishedOk =
      !checking &&
      !queue.failure &&
      !active &&
      !queue.stopRequested &&
      done > 0;

    // The whole queue is timed from the first step that really started. A
    // queue with no recorded start shows no time at all, never a guess.
    const starts = queue.steps
      .map((step) => step.startedAt)
      .filter((at): at is number => typeof at === "number");
    const queueStart = starts.length ? Math.min(...starts) : undefined;
    const totalText =
      queueStart === undefined
        ? undefined
        : active
          ? this._progressText("elapsed", this._now - queueStart)
          : queue.finishedAt !== undefined
            ? this._progressText(
                "result_duration",
                queue.finishedAt - queueStart
              )
            : undefined;

    const progressText = this._t("progress_text", {
      finished: progress.finished,
      total: progress.total,
    });

    return html`
      <section class=${this._cardClasses(false)} aria-labelledby="queue-title">
        <div class="title-row">
          ${this._renderRing(
            progress.finished,
            progress.total,
            finishedOk,
            !!queue.failure && !checking
          )}
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
          }${totalText ? html` · ${totalText}` : nothing}
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
        ${this._renderBackupNotes(queue)}
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

  // A run another browser drives: the same progress, with nothing to press
  // that could change it. Only an ended run can be closed, and only here.
  private _renderShared(): TemplateResult | typeof nothing {
    const run = this.sharedRun;
    const view = sharedRunView(run);
    if (!run || !view) {
      return nothing;
    }
    const ended = view.state !== "running" && view.state !== "failed";
    const finishedOk = view.state === "done";
    if (ended && this._hiddenShared === run.updated) {
      return nothing;
    }
    // The browser driving the run has not reported for a while: say so, and
    // let an administrator remove the stranded record. Nothing here installs.
    const silent =
      sharedRunPhase(run, this.sharedSeenAt, this._now) === "driver_silent";
    const currentName = view.current
      ? updateDisplayName(this.hass, view.current)
      : "";
    let title: string;
    if (silent) {
      title = this._t("shared_silent_title");
    } else if (view.state === "running") {
      title = this._t("progress_title", {
        position: view.position,
        total: view.total,
        name: currentName,
      });
    } else if (view.state === "failed") {
      title = this._t("failed_title", { name: currentName });
    } else if (view.state === "cancelled") {
      title = this._t("stopped_title");
    } else {
      title = this._t("finished_title");
    }
    const startedAt = formatAutoUpdateTime(
      run.started,
      this.hass.locale?.language
    );
    const note = silent
      ? this._t("shared_silent_note")
      : view.state === "running" || view.state === "failed"
        ? this._t("shared_note_running")
        : this._t("shared_note_ended");
    const seenAt =
      silent && this.sharedSeenAt !== undefined
        ? formatAutoUpdateTime(
            new Date(this.sharedSeenAt).toISOString(),
            this.hass.locale?.language
          )
        : undefined;
    const stepText = (stepState: SharedStepState): string => {
      if (silent && stepState === "current") {
        return this._t("shared_state_stalled");
      }
      if (silent && stepState === "waiting") {
        return this._t("shared_state_not_started");
      }
      return this._t(`shared_state_${stepState}`);
    };
    const progressText = this._t("progress_text", {
      finished: view.finished,
      total: view.total,
    });
    return html`
      <section class=${this._cardClasses(true)} aria-labelledby="queue-title">
        <div class="title-row">
          ${this._renderRing(
            view.finished,
            view.total,
            finishedOk,
            view.state === "failed"
          )}
          <h2
            id="queue-title"
            class=${view.state === "failed" || silent ? "failed" : ""}
          >
            ${title}
          </h2>
        </div>
        <p class="lead">
          ${note}${
            startedAt
              ? html` ${this._t("shared_started", { time: startedAt })}`
              : nothing
          }${
            seenAt
              ? html` ${this._t("shared_silent_seen", { time: seenAt })}`
              : nothing
          }
        </p>
        <ha-progress-bar
          .value=${view.percent}
          .label=${`${this._t("progress_label")}: ${progressText}`}
        ></ha-progress-bar>
        <p class="progress-text">${progressText}</p>
        <ol class="steps" aria-label=${this._t("steps_label")}>
          ${view.steps.map(
            (step) => html`
              <li class="step ${SHARED_STEP_CLASS[step.state]}">
                <span class="step-icon" aria-hidden="true">
                  ${
                    silent && step.state === "current"
                      ? html`<ha-svg-icon
                          .path=${mdiClockOutline}
                        ></ha-svg-icon>`
                      : step.state === "current"
                        ? html`<ha-spinner size="small"></ha-spinner>`
                        : SHARED_STEP_ICON[step.state]
                          ? html`<ha-svg-icon
                              .path=${SHARED_STEP_ICON[step.state]}
                            ></ha-svg-icon>`
                          : nothing
                  }
                </span>
                <span class="step-name"
                  >${updateDisplayName(this.hass, step.entityId)}</span
                >
                ${
                  step.state === "unknown"
                    ? nothing
                    : html`<span class="step-state"
                        >${stepText(step.state)}</span
                      >`
                }
              </li>
            `
          )}
        </ol>
        ${
          silent
            ? this._renderClearStranded()
            : ended
              ? html`<div class="actions">
                  <ha-button appearance="outlined" @click=${this._hideShared}>
                    ${this._t("dismiss")}
                  </ha-button>
                </div>`
              : nothing
        }
      </section>
    `;
  }

  private _hideShared(): void {
    this._hiddenShared = this.sharedRun?.updated;
  }

  // Only an administrator may clear the record; for anyone else the button is
  // left out rather than shown disabled.
  private _renderClearStranded(): TemplateResult | typeof nothing {
    if (!this.hass.user?.is_admin) {
      return nothing;
    }
    return html`<div class="actions">
        <ha-button
          appearance="outlined"
          .loading=${this._clearing}
          .disabled=${this._clearing}
          @click=${this._clearStranded}
        >
          ${this._t("shared_clear")}
        </ha-button>
        <span class="note">${this._t("shared_clear_note")}</span>
      </div>
      ${
        this._clearFailed
          ? html`<p class="note" role="alert">
              ${this._t("shared_clear_failed")}
            </p>`
          : nothing
      }`;
  }

  // Removes only the shared display record. An install that is running is not
  // touched, and the driving browser, if it comes back, reports the run again.
  private async _clearStranded(): Promise<void> {
    if (this._clearing) {
      return;
    }
    this._clearing = true;
    this._clearFailed = false;
    try {
      await clearUpdateRun(this.hass);
    } catch (_err) {
      this._clearFailed = true;
    } finally {
      this._clearing = false;
    }
  }

  // Where the run makes its backups, in plain words.
  private _renderBackupNotes(
    queue: QueueState
  ): TemplateResult | typeof nothing {
    const carriers = queue.backupSteps ?? [];
    if (!carriers.length) {
      return nothing;
    }
    const isSystem = (step: QueueStep) => roleRestartsSystem(step.role);
    const systemWanting = queue.steps.filter(
      (step) => isSystem(step) && carriers.includes(step.entityId)
    ).length;
    const systemSteps = queue.steps.filter(isSystem).length;
    const appCarriers = queue.steps.filter(
      (step) => !isSystem(step) && carriers.includes(step.entityId)
    ).length;
    const prefix = "ui.panel.config.updates.backup_choice";
    const notes = [
      systemWanting && systemSteps > 1 ? "queue_system_covers" : "",
      appCarriers ? "queue_apps_own" : "",
    ].filter(Boolean);
    return notes.length
      ? html`<p class="backup-notes">
          ${notes
            .map((key) =>
              this._lang.text(this.hass.localize, `${prefix}.${key}`)
            )
            .join(" ")}
        </p>`
      : nothing;
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
              : shownState === "done"
                ? html`<svg class="done-tick" viewBox="0 0 24 24">
                    <circle cx="12" cy="12" r="10"></circle>
                    <path
                      class="tick-path"
                      data-key=${`${this.controller.queue?.startedAt ?? ""}:${step.entityId}`}
                      d="M7.5 12.5l3 3 6-6.5"
                    ></path>
                  </svg>`
                : icon
                  ? html`<ha-svg-icon .path=${icon}></ha-svg-icon>`
                  : nothing
          }
        </span>
        <span class="step-name"
          >${updateDisplayName(this.hass, step.entityId, step.title)}</span
        >
        <span class="step-state"
          >${this._t(`state_${shownState}`)}${
            shownState === "updating" && typeof step.startedAt === "number"
              ? html` ·
                ${formatElapsed(Math.max(0, this._now - step.startedAt))}`
              : nothing
          }</span
        >
        ${step.state === "waiting" ? this._renderWaiting(step) : nothing}
        ${step.state === "done" ? this._renderDone(step) : nothing}
      </li>
    `;
  }

  // A waiting step says its place and why it waits.
  private _renderWaiting(step: QueueStep): TemplateResult | typeof nothing {
    const order = queueOrderOf(this.controller.queue);
    const place = queuePositionOf(
      order,
      step.entityId,
      step.role === "other" ? "entity" : step.role
    );
    if (!place || order.length < 2) {
      return nothing;
    }
    const text = (key: string, values?: Record<string, string | number>) =>
      this._lang.text(
        this.hass.localize,
        `ui.panel.config.updates.progress.${key}`,
        values
      );
    const after = place.afterEntityId
      ? updateDisplayName(this.hass, place.afterEntityId)
      : undefined;
    return html`<span class="step-detail"
      >${
        after
          ? text("queue_after", {
              position: place.position,
              total: place.total,
              name: after,
            })
          : text("queue_place", {
              position: place.position,
              total: place.total,
            })
      }${place.restartsSystem ? html` · ${text("waiting_alone")}` : nothing}</span
    >`;
  }

  // What an installed step went from and to, and where to read what changed.
  private _renderDone(step: QueueStep): TemplateResult | typeof nothing {
    const entity = this.hass.states[step.entityId] as UpdateEntity | undefined;
    const to = step.targetVersion ?? entity?.attributes.installed_version;
    const from = step.fromVersion;
    const url =
      (step.role === "other" ? undefined : notesPageUrlForVersion(to)) ||
      entity?.attributes.release_url ||
      undefined;
    if (!to && !url) {
      return nothing;
    }
    const took =
      typeof step.startedAt === "number" && typeof step.endedAt === "number"
        ? formatElapsed(Math.max(0, step.endedAt - step.startedAt))
        : undefined;
    return html`<span class="step-detail">
      ${took ? html`<span class="took">${took}</span>` : nothing}
      ${
        to
          ? html`<span class="versions">
              ${from ? html`<span>${from}</span>` : nothing}
              <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
              <strong>${to}</strong>
            </span>`
          : nothing
      }
      ${
        url
          ? html`<a href=${url} target="_blank" rel="noopener noreferrer">
              <ha-svg-icon .path=${mdiNewBox}></ha-svg-icon>
              ${this._lang.text(
                this.hass.localize,
                "ui.panel.config.updates.progress.whats_new"
              )}
            </a>`
          : nothing
      }
    </span>`;
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
      haMotionKeyframes,
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
        }
        .ring.failed .ring-arc {
          stroke: var(--error-color);
        }
        /* The finished and failed moments play in the ring's place, at its size. */
        .ring.moment {
          --ha-drama-badge-size: 36px;
        }
        /* The card rises once when it appears, with the Cards motion kind. */
        .card.rise {
          animation: ha-rise var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
        }
        .done-tick {
          width: 24px;
          height: 24px;
        }
        .done-tick circle {
          fill: var(--success-color);
        }
        .done-tick path {
          fill: none;
          stroke: var(--card-background-color);
          stroke-width: 2.6;
          stroke-linecap: round;
          stroke-linejoin: round;
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
        .step {
          flex-wrap: wrap;
          padding-block: var(--ha-space-2);
        }
        /* Border-box: with the start padding added to a 100% basis, a long
           line (the Core versions and "What's new") ran past the row. */
        .step-detail {
          box-sizing: border-box;
          flex: 1 0 100%;
          min-width: 0;
          max-width: 100%;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1) var(--ha-space-4);
          padding-inline-start: calc(24px + var(--ha-space-3));
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .step-detail .versions {
          display: inline-flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1);
          min-width: 0;
          max-width: 100%;
          overflow-wrap: anywhere;
        }
        .step-detail .versions > * {
          min-width: 0;
        }
        .step-detail ha-svg-icon {
          --mdc-icon-size: 16px;
          width: 16px;
          height: 16px;
        }
        .step-detail a {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-height: 48px;
          max-width: 100%;
          overflow-wrap: anywhere;
          color: var(--primary-color);
          text-decoration: none;
        }
        .ring.tick {
          color: var(--success-color);
        }
        .ring[hidden] {
          display: none;
        }
        .step-state {
          flex: none;
          max-width: 100%;
          overflow-wrap: anywhere;
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
        .backup-notes {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .note {
          flex: 1 1 200px;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .card.rise {
            animation: none;
          }
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
