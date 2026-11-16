import {
  mdiCancel,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiCloseCircle,
  mdiMinusCircleOutline,
  mdiProgressClock,
  mdiRefresh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-expansion-panel";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/progress/ha-progress-bar";
import { loadedRepository } from "../../../../data/build-changes";
import type {
  BuildRun,
  BuildSnapshot,
  JobState,
  StageSummary,
} from "../../../../data/build-progress";
import {
  BUILD_REPOSITORY,
  REFRESH_COOLDOWN_MS,
  REFRESH_INTERVAL_MS,
  buildStages,
  computeProgress,
  coreBase,
  coreUpdateOffered,
  coreVersionFor,
  currentStage,
  durationSeconds,
  estimateRemaining,
  fetchBuildSnapshot,
  formatElapsed,
  parseBuildNumber,
  startedBy,
} from "../../../../data/build-progress";
import type { PublicFetchFailure } from "../../../../data/public-json";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.updates.coming_soon";
const DATA_PREFIX = "ui.panel.config.updates.build_data";

// How often the elapsed time on a running build is redrawn.
const TICK_MS = 1000;

// When nothing is building, look again less often.
const IDLE_REFRESH_MS = 600_000;

const STATE_ICONS: Record<JobState, string> = {
  waiting: mdiCircleOutline,
  running: mdiProgressClock,
  done: mdiCheckCircle,
  failed: mdiCloseCircle,
  cancelled: mdiCancel,
  skipped: mdiMinusCircleOutline,
};

/**
 * The "Update coming soon" card: how far the next build has got.
 *
 * It reads public GitHub pages directly. While the card is on screen it looks
 * again every three minutes when a build is active, and it stops when the
 * page is hidden or the card is removed.
 */
@customElement("ha-update-coming-soon")
export class HaUpdateComingSoon extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _snapshot?: BuildSnapshot;

  @state() private _failure?: PublicFetchFailure;

  @state() private _loading = true;

  @state() private _cooling = false;

  @state() private _now = Date.now();

  private _lang = new LanguageModeController(this);

  private _abort?: AbortController;

  private _refreshTimer?: number;

  private _cooldownTimer?: number;

  private _tickTimer?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    document.addEventListener("visibilitychange", this._visibilityChanged);
    this._start();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    document.removeEventListener("visibilitychange", this._visibilityChanged);
    this._stop();
    window.clearTimeout(this._cooldownTimer);
  }

  private _visibilityChanged = () => {
    if (document.hidden) {
      this._stop();
    } else {
      this._start();
    }
  };

  private _start(): void {
    this._stop();
    this._tickTimer = window.setInterval(() => {
      if (this._snapshot?.choice.kind === "active") {
        this._now = Date.now();
      }
    }, TICK_MS);
    this._load();
  }

  private _stop(): void {
    this._abort?.abort();
    this._abort = undefined;
    window.clearTimeout(this._refreshTimer);
    window.clearInterval(this._tickTimer);
    this._refreshTimer = undefined;
    this._tickTimer = undefined;
  }

  private async _load(): Promise<void> {
    this._abort?.abort();
    window.clearTimeout(this._refreshTimer);
    const controller = new AbortController();
    this._abort = controller;
    this._loading = true;
    const result = await fetchBuildSnapshot(
      loadedRepository() ?? BUILD_REPOSITORY,
      parseBuildNumber(this.hass.config.version),
      controller.signal
    );
    if (controller.signal.aborted) {
      return;
    }
    this._loading = false;
    this._now = Date.now();
    let delay = IDLE_REFRESH_MS;
    if (result.ok) {
      this._snapshot = result.data;
      this._failure = undefined;
      const kind = result.data.choice.kind;
      if (kind === "active" || kind === "waiting") {
        delay = REFRESH_INTERVAL_MS;
      }
    } else {
      this._failure = result;
      if (result.reason === "rate_limited" && result.resetAt) {
        delay = Math.max(delay, result.resetAt.getTime() - Date.now());
      }
    }
    this._cooling = true;
    window.clearTimeout(this._cooldownTimer);
    this._cooldownTimer = window.setTimeout(() => {
      this._cooling = false;
    }, REFRESH_COOLDOWN_MS);
    this._refreshTimer = window.setTimeout(() => this._load(), delay);
  }

  private _refresh = () => {
    this._load();
  };

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  private _time(iso: string | number | undefined): string {
    const date = new Date(iso ?? NaN);
    return Number.isNaN(date.getTime())
      ? ""
      : formatTime(date, this.hass.locale, this.hass.config);
  }

  private _dateTime(iso: string): string {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ""
      : formatDateTime(date, this.hass.locale, this.hass.config);
  }

  protected render(): TemplateResult {
    return html`
      <ha-card aria-labelledby="soon-title">
        <div class="head">
          <h2 id="soon-title">${this._t(`${PREFIX}.title`)}</h2>
          <ha-button
            appearance="plain"
            .disabled=${this._loading || this._cooling}
            @click=${this._refresh}
            title=${ifDefined(
              this._cooling && !this._loading
                ? this._t(`${PREFIX}.refresh_wait`)
                : undefined
            )}
          >
            <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
            ${this._t(`${DATA_PREFIX}.refresh`)}
          </ha-button>
        </div>
        ${this._renderFailure()}
        ${
          this._snapshot
            ? this._renderSnapshot(this._snapshot)
            : this._loading
              ? html`<div class="loading" role="status">
                  <ha-spinner size="small"></ha-spinner>
                  <span>${this._t(`${PREFIX}.loading`)}</span>
                </div>`
              : nothing
        }
        <p class="privacy">${this._t(`${DATA_PREFIX}.privacy`)}</p>
      </ha-card>
    `;
  }

  private _failureText(failure: PublicFetchFailure): string {
    switch (failure.reason) {
      case "rate_limited":
        return failure.resetAt
          ? this._t(`${DATA_PREFIX}.error_rate`, {
              time: this._time(failure.resetAt.getTime()),
            })
          : this._t(`${DATA_PREFIX}.error_rate_unknown`);
      case "offline":
        return this._t(`${DATA_PREFIX}.error_offline`);
      case "not_found":
        return this._t(`${PREFIX}.not_found`);
      case "http":
        return this._t(`${DATA_PREFIX}.error_http`, {
          status: failure.status,
        });
      default:
        return this._t(`${DATA_PREFIX}.error_invalid`);
    }
  }

  private _renderFailure(): TemplateResult | typeof nothing {
    if (!this._failure) {
      return nothing;
    }
    return html`<ha-alert
      alert-type=${
        this._failure.reason === "rate_limited" ? "warning" : "error"
      }
    >
      ${this._failureText(this._failure)}
      <ha-button
        slot="action"
        appearance="plain"
        .disabled=${this._loading || this._cooling}
        @click=${this._refresh}
      >
        ${this._t(`${DATA_PREFIX}.retry`)}
      </ha-button>
    </ha-alert>`;
  }

  private _renderSnapshot(snapshot: BuildSnapshot): TemplateResult {
    const { choice } = snapshot;
    switch (choice.kind) {
      case "none":
        return html`<p class="stage">${this._t(`${PREFIX}.none`)}</p>
          ${this._renderChecked(snapshot)}`;
      case "waiting":
        return html`
          ${this._renderRunHeader(choice.run)}
          <p class="stage">${this._t(`${PREFIX}.waiting`)}</p>
          <p class="quiet">${this._t(`${PREFIX}.waiting_hint`)}</p>
          ${this._renderChecked(snapshot)}
        `;
      case "ready":
        return html`
          ${this._renderRunHeader(choice.run)}
          <p class="stage ok">
            ${this._t(`${PREFIX}.ready`, { build: choice.run.runNumber })}
          </p>
          <p class="quiet">${this._t(`${PREFIX}.ready_hint`)}</p>
          ${this._renderChecked(snapshot)}
        `;
      default:
        return this._renderRun(snapshot, choice.run, choice.kind === "failed");
    }
  }

  private _renderChecked(snapshot: BuildSnapshot): TemplateResult {
    return html`<p class="quiet">
      ${this._t(`${PREFIX}.last_checked`, {
        time: this._time(snapshot.fetchedAt),
      })}
    </p>`;
  }

  private _renderRunHeader(run: BuildRun): TemplateResult {
    const version = coreVersionFor(
      coreBase(this.hass.config.version),
      run.runNumber
    );
    const by = startedBy(run.event);
    return html`
      <div class="run">
        <div class="run-title">
          <strong
            >${this._t(`${PREFIX}.build`, { build: run.runNumber })}</strong
          >
          ${
            version
              ? html`<span class="quiet"
                  >${this._t(`${PREFIX}.becomes`, { version })}</span
                >`
              : nothing
          }
        </div>
        ${
          run.title
            ? html`<div class="commit">
                ${this._t(`${PREFIX}.commit_title`, { title: run.title })}
              </div>`
            : nothing
        }
        <div class="quiet">
          ${this._t(`${PREFIX}.started_${by}`)}
          ${
            run.startedAt
              ? html`·
                ${this._t(`${PREFIX}.started_at`, {
                  time: this._dateTime(run.startedAt),
                })}`
              : nothing
          }
        </div>
      </div>
    `;
  }

  private _renderRun(
    snapshot: BuildSnapshot,
    run: BuildRun,
    failed: boolean
  ): TemplateResult {
    const stages = buildStages(snapshot.jobs, run, this._now);
    const progress = computeProgress(snapshot.jobs);
    const stage = currentStage(stages);
    const choice = snapshot.choice;
    const active = choice.kind === "active";
    const hasFailure = failed || stages.some((item) => item.state === "failed");
    const elapsed = active
      ? durationSeconds(run.startedAt, null, this._now)
      : undefined;
    const estimate = active
      ? estimateRemaining(stages, run.startedAt, this._now)
      : undefined;
    const failedJob = snapshot.jobs.find((job) =>
      stages.some((item) =>
        item.jobs.some((j) => j.name === job.name && j.state === "failed")
      )
    );
    const progressText = progress.total
      ? this._t(`${PREFIX}.progress_text`, {
          done: progress.done,
          total: progress.total,
          percent: progress.percent,
        })
      : this._t(`${PREFIX}.progress_none`);
    return html`
      ${this._renderRunHeader(run)}
      ${
        elapsed !== undefined
          ? html`<div class="quiet">
              ${this._t(`${PREFIX}.elapsed`, {
                duration: formatElapsed(elapsed),
              })}
            </div>`
          : nothing
      }
      ${
        hasFailure
          ? html`<ha-alert
              alert-type="error"
              .title=${this._t(`${PREFIX}.failed`, {
                build: run.runNumber,
              })}
            >
              ${this._t(`${PREFIX}.failed_text`)}
              ${
                failedJob
                  ? html`<div>
                      ${this._t(`${PREFIX}.failed_step`, { job: failedJob.name })}
                    </div>`
                  : nothing
              }
            </ha-alert>`
          : nothing
      }
      <div class="progress ${classMap({ failed: hasFailure })}">
        <ha-progress-bar
          .value=${progress.percent}
          .label=${`${this._t(`${PREFIX}.progress_label`)}: ${progressText}`}
        ></ha-progress-bar>
        <div class="progress-text">
          <span>${progressText}</span>
        </div>
      </div>
      ${
        stage && !hasFailure
          ? html`<p class="stage">
              ${this._t(`${PREFIX}.stage_now`, {
                stage: this._t(`${PREFIX}.stage.${stage.id}`),
              })}
            </p>`
          : stage
            ? html`<p class="stage bad">
                ${this._t(`${PREFIX}.stage_failed`, {
                  stage: this._t(`${PREFIX}.stage.${stage.id}`),
                })}
              </p>`
            : nothing
      }
      ${active ? this._renderEstimate(estimate) : nothing}
      ${
        coreUpdateOffered(stages) && active
          ? html`<ha-alert alert-type="success">
              ${this._t(`${PREFIX}.core_offered`)}
            </ha-alert>`
          : nothing
      }
      ${
        choice.kind === "active" && choice.next
          ? html`<p class="next">
              ${this._t(`${PREFIX}.next_in_line`, {
                build: choice.next.runNumber,
              })}
            </p>`
          : nothing
      }
      ${this._renderChecked(snapshot)}
      ${stages.length ? this._renderDetails(stages) : nothing}
    `;
  }

  private _renderEstimate(
    estimate: number | "overdue" | undefined
  ): TemplateResult | typeof nothing {
    if (estimate === undefined) {
      return nothing;
    }
    if (estimate === "overdue") {
      return html`<p class="quiet">
        ${this._t(`${PREFIX}.estimate_overdue`)}
      </p>`;
    }
    const text =
      estimate >= 60
        ? this._t(`${PREFIX}.estimate_hours`, {
            hours: Math.floor(estimate / 60),
            minutes: estimate % 60,
          })
        : this._t(`${PREFIX}.estimate_minutes`, { minutes: estimate });
    return html`<p class="quiet">
      ${text}
      <span class="note">${this._t(`${PREFIX}.estimate_note`)}</span>
    </p>`;
  }

  private _renderState(jobState: JobState): TemplateResult {
    return html`<span class="state ${jobState}">
      <ha-svg-icon .path=${STATE_ICONS[jobState]}></ha-svg-icon>
      <span>${this._t(`${PREFIX}.state.${jobState}`)}</span>
    </span>`;
  }

  private _renderDetails(stages: StageSummary[]): TemplateResult {
    return html`
      <ha-expansion-panel outlined .header=${this._t(`${PREFIX}.details`)}>
        <ul class="stages">
          ${stages.map(
            (stage) => html`
              <li>
                <div class="stage-row">
                  <strong>${this._t(`${PREFIX}.stage.${stage.id}`)}</strong>
                  ${this._renderState(stage.state)}
                </div>
                ${
                  stage.jobs.length
                    ? html`<ul class="jobs">
                        ${stage.jobs.map(
                          (job) => html`
                            <li class="job">
                              <span class="job-name">${job.name}</span>
                              ${this._renderState(job.state)}
                              <span class="job-time">
                                ${
                                  job.startedAt
                                    ? this._t(`${PREFIX}.job_started`, {
                                        time: this._time(job.startedAt),
                                      })
                                    : ""
                                }
                                ${
                                  job.durationSeconds !== undefined &&
                                  job.state !== "waiting"
                                    ? formatElapsed(job.durationSeconds)
                                    : ""
                                }
                              </span>
                            </li>
                          `
                        )}
                      </ul>`
                    : nothing
                }
              </li>
            `
          )}
        </ul>
      </ha-expansion-panel>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          display: block;
        }
        ha-card {
          box-sizing: border-box;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-medium);
        }
        ha-button {
          --ha-button-height: 48px;
        }
        p {
          margin: 0;
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        .run {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .run-title {
          display: flex;
          flex-wrap: wrap;
          align-items: baseline;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-l);
        }
        .commit {
          overflow-wrap: anywhere;
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .note {
          display: block;
        }
        .stage {
          font-weight: var(--ha-font-weight-medium);
        }
        .stage.ok {
          color: var(--success-color);
        }
        .stage.bad {
          color: var(--error-color);
        }
        .progress {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .progress ha-progress-bar {
          --ha-progress-bar-track-height: 12px;
          --ha-progress-bar-indicator-color: var(--primary-color);
        }
        .progress.failed ha-progress-bar {
          --ha-progress-bar-indicator-color: var(--error-color);
        }
        .progress-text {
          font-size: var(--ha-font-size-s);
          font-variant-numeric: tabular-nums;
        }
        .next {
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
        }
        .stages,
        .jobs {
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .stages {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2) var(--ha-space-4) var(--ha-space-4);
        }
        .stage-row,
        .job {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-3);
        }
        .stage-row {
          justify-content: space-between;
        }
        .jobs {
          margin-block-start: var(--ha-space-1);
          padding-inline-start: var(--ha-space-4);
        }
        .job {
          padding-block: var(--ha-space-1);
          font-size: var(--ha-font-size-s);
        }
        .job-name {
          flex: 1 1 12em;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .job-time {
          color: var(--secondary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .state {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          font-size: var(--ha-font-size-s);
        }
        .state ha-svg-icon {
          --mdc-icon-size: 18px;
        }
        .state.done {
          color: var(--success-color);
        }
        .state.failed {
          color: var(--error-color);
        }
        .state.running {
          color: var(--primary-color);
        }
        .state.waiting,
        .state.skipped,
        .state.cancelled {
          color: var(--secondary-text-color);
        }
        .privacy {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          ha-progress-bar {
            --ha-animation-duration-slow: 0s;
          }
        }
        @media (max-width: 480px) {
          ha-card {
            padding: var(--ha-space-4);
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-coming-soon": HaUpdateComingSoon;
  }
}
