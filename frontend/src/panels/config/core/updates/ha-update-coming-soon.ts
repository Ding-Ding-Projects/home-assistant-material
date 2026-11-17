import {
  mdiArrowRight,
  mdiCancel,
  mdiCheck,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiCloseCircle,
  mdiMinusCircleOutline,
  mdiProgressClock,
  mdiRefresh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing, svg } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
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
  estimateCore,
  estimateRemaining,
  fetchBuildSnapshot,
  formatElapsed,
  jobStateCounts,
  parseBuildNumber,
  splitMinutes,
  stageCount,
  startedBy,
} from "../../../../data/build-progress";
import type { PublicFetchFailure } from "../../../../data/public-json";
import { haMotionKeyframes } from "../../../../resources/motion-styles";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.updates.coming_soon";
const DATA_PREFIX = "ui.panel.config.updates.build_data";

// How often the elapsed time on a running build is redrawn.
const TICK_MS = 1000;

// When nothing is building, look again less often.
const IDLE_REFRESH_MS = 600_000;

// The circle of the ring: 2 * pi * 50.
const RING_LENGTH = 314;

const STATE_ICONS: Record<JobState, string> = {
  waiting: mdiCircleOutline,
  running: mdiProgressClock,
  done: mdiCheckCircle,
  failed: mdiCloseCircle,
  cancelled: mdiCancel,
  skipped: mdiMinusCircleOutline,
};

/** Which of the eight looks the card takes. */
type CardState = "active" | "core" | "waiting" | "ready" | "failed" | "none";

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

  // ------------------------------------------------------------------ render

  protected render(): TemplateResult {
    const failure = this._failure;
    const snapshot = this._snapshot;
    return html`
      <section class="soon" aria-labelledby="soon-h">
        ${failure ? this._renderFailureHero(failure, snapshot) : nothing}
        ${
          snapshot
            ? html`<div class="snap ${classMap({ stale: !!failure })}">
                ${this._renderSnapshot(snapshot)}
              </div>`
            : !failure && this._loading
              ? html`<div class="hero s-waiting">
                  <div class="hero-text">
                    <h2 id="soon-h">${this._t(`${PREFIX}.title`)}</h2>
                    <div class="loading" role="status">
                      <ha-spinner size="small"></ha-spinner>
                      <span>${this._t(`${PREFIX}.loading`)}</span>
                    </div>
                  </div>
                </div>`
              : nothing
        }
        <p class="privacy">${this._t(`${DATA_PREFIX}.privacy`)}</p>
      </section>
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
        return this._t(`${PREFIX}.unreachable_text`);
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

  // The "resting" and "cannot be reached" looks. The last known card is shown
  // below them, dimmed, so nothing read earlier is lost.
  private _renderFailureHero(
    failure: PublicFetchFailure,
    snapshot: BuildSnapshot | undefined
  ): TemplateResult {
    const resting = failure.reason === "rate_limited";
    const title = resting
      ? this._t(`${PREFIX}.resting_title`)
      : failure.reason === "offline"
        ? this._t(`${PREFIX}.unreachable_title`)
        : this._t(`${PREFIX}.title`);
    const until =
      resting && failure.resetAt ? this._time(failure.resetAt.getTime()) : "";
    const known = snapshot ? this._time(snapshot.fetchedAt) : "";
    return html`
      <div class="hero ${resting ? "s-rest" : "s-offline"}" role="alert">
        <div class="hero-text">
          ${
            !snapshot
              ? html`<h2 id="soon-h" class="title">${title}</h2>`
              : html`<h2 class="title">${title}</h2>`
          }
          <p>${this._failureText(failure)}</p>
          ${
            snapshot && known
              ? html`<p class="quiet">
                  ${this._t(`${PREFIX}.known_at`, { time: known })}
                </p>`
              : nothing
          }
          <div class="actions">
            <ha-button
              appearance="filled"
              .disabled=${this._loading || this._cooling || !!until}
              @click=${this._refresh}
            >
              <ha-svg-icon slot="start" .path=${mdiRefresh}></ha-svg-icon>
              ${
                until
                  ? this._t(`${PREFIX}.refresh_at`, { time: until })
                  : resting
                    ? this._t(`${DATA_PREFIX}.refresh`)
                    : this._t(`${DATA_PREFIX}.retry`)
              }
            </ha-button>
          </div>
        </div>
      </div>
    `;
  }

  private _cardState(
    snapshot: BuildSnapshot,
    stages: StageSummary[]
  ): CardState {
    const { choice } = snapshot;
    switch (choice.kind) {
      case "none":
        return "none";
      case "waiting":
        return "waiting";
      case "ready":
        return "ready";
      case "failed":
        return "failed";
      default:
        if (stages.some((stage) => stage.state === "failed")) {
          return "failed";
        }
        return coreUpdateOffered(stages) ? "core" : "active";
    }
  }

  private _renderSnapshot(snapshot: BuildSnapshot): TemplateResult {
    const { choice } = snapshot;
    if (choice.kind === "none") {
      return html`
        <div class="hero s-none">
          <div class="hero-text">
            <h2 id="soon-h" class="title">${this._t(`${PREFIX}.none`)}</h2>
            <p>${this._t(`${PREFIX}.none_text`)}</p>
            ${this._renderChecked(snapshot)}
            <div class="actions">${this._renderRefresh()}</div>
          </div>
        </div>
        ${this._renderReplaced(snapshot)}
      `;
    }
    const run = choice.run;
    const stages = buildStages(snapshot.jobs, run, this._now);
    const look = this._cardState(snapshot, stages);
    return html`
      ${this._renderHeroFor(snapshot, run, stages, look)}
      ${this._renderReplaced(snapshot)}
      ${
        stages.length && choice.kind !== "waiting"
          ? this._renderStages(snapshot, run, stages, look)
          : nothing
      }
    `;
  }

  private _renderRefresh(): TemplateResult {
    return html`<ha-button
      appearance="outlined"
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
    </ha-button>`;
  }

  private _renderChecked(snapshot: BuildSnapshot): TemplateResult {
    return html`<p class="quiet">
      ${this._t(`${PREFIX}.last_checked`, {
        time: this._time(snapshot.fetchedAt),
      })}
    </p>`;
  }

  private _renderReplaced(
    snapshot: BuildSnapshot
  ): TemplateResult | typeof nothing {
    const replaced = snapshot.replaced?.[0];
    if (!replaced) {
      return nothing;
    }
    return html`
      <div class="replaced" role="status">
        <span class="pill neutral">${this._t(`${PREFIX}.pill_replaced`)}</span>
        <div>
          <strong
            >${this._t(`${PREFIX}.replaced_title`, {
              build: replaced.runNumber,
            })}</strong
          >
          <p class="quiet">
            ${this._t(`${PREFIX}.replaced_text`, { build: replaced.runNumber })}
          </p>
        </div>
      </div>
    `;
  }

  private _renderRunLine(run: BuildRun): TemplateResult {
    const version = coreVersionFor(
      coreBase(this.hass.config.version),
      run.runNumber
    );
    return html`
      <p class="version-line">
        ${
          version
            ? html`${this._t(`${PREFIX}.build_becomes`, {
                  build: run.runNumber,
                })} <span class="chip">${version}</span>`
            : this._t(`${PREFIX}.build`, { build: run.runNumber })
        }
      </p>
      ${
        run.title
          ? html`<p class="commit">
              ${this._t(`${PREFIX}.commit_title`, { title: run.title })}
            </p>`
          : nothing
      }
    `;
  }

  private _pillFor(look: CardState): TemplateResult | typeof nothing {
    switch (look) {
      case "active":
        return html`<span class="pill on-hero">
          <ha-spinner size="small"></ha-spinner>
          ${this._t(`${PREFIX}.pill_building`)}
        </span>`;
      case "core":
        return html`<span class="pill on-hero">
          <ha-svg-icon .path=${mdiCheck}></ha-svg-icon>
          ${this._t(`${PREFIX}.pill_core`)}
        </span>`;
      case "ready":
        return html`<span class="pill on-hero">
          <ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>
          ${this._t(`${PREFIX}.pill_finished`)}
        </span>`;
      case "failed":
        return html`<span class="pill on-hero">
          <ha-svg-icon .path=${mdiCloseCircle}></ha-svg-icon>
          ${this._t(`${PREFIX}.pill_failed`)}
        </span>`;
      case "waiting":
        return html`<span class="pill on-hero">
          <ha-svg-icon .path=${mdiProgressClock}></ha-svg-icon>
          ${this._t(`${PREFIX}.waiting`)}
        </span>`;
      default:
        return nothing;
    }
  }

  private _renderHeroFor(
    snapshot: BuildSnapshot,
    run: BuildRun,
    stages: StageSummary[],
    look: CardState
  ): TemplateResult {
    const progress = computeProgress(snapshot.jobs);
    const counts = jobStateCounts(snapshot.jobs);
    const active = snapshot.choice.kind === "active";
    const failed = look === "failed";
    const version = coreVersionFor(
      coreBase(this.hass.config.version),
      run.runNumber
    );
    const failedStage = stages.find((stage) => stage.state === "failed");
    const failedJob = failedStage?.jobs.find((job) => job.state === "failed");
    const stageIndex = failedStage ? stages.indexOf(failedStage) + 1 : 0;
    const finishedAfter = formatElapsed(
      durationSeconds(run.startedAt, run.updatedAt, this._now)
    );
    const estimate = active
      ? estimateRemaining(stages, run.startedAt, this._now)
      : undefined;
    const stage = currentStage(stages);

    let heading: string;
    let body: TemplateResult | typeof nothing;
    switch (look) {
      case "core":
        heading = version
          ? this._t(`${PREFIX}.core_ready_title`, { version })
          : this._t(`${PREFIX}.core_ready_title_plain`);
        body = html`
          <p>
            ${
              stage
                ? this._t(`${PREFIX}.stage_of`, {
                    number: stages.indexOf(stage) + 1,
                    total: stages.length,
                    stage: this._t(`${PREFIX}.stage.${stage.id}`),
                  })
                : ""
            }
            ${this._estimateText(estimate)}
            ${this._t(`${PREFIX}.core_ready_wait`)}
          </p>
          <p class="strong">${this._t(`${PREFIX}.core_ready_hint`)}</p>
        `;
        break;
      case "ready":
        heading = this._t(`${PREFIX}.ready`, { build: run.runNumber });
        body = html`<p>
          ${this._t(`${PREFIX}.finished_text`, {
            time: this._time(run.updatedAt),
            duration: finishedAfter,
          })}
        </p>`;
        break;
      case "failed":
        heading = this._t(`${PREFIX}.failed`, { build: run.runNumber });
        body = html`
          <p role="alert">
            ${
              failedJob
                ? this._t(`${PREFIX}.failed_detail`, {
                    number: stageIndex,
                    job: failedJob.name,
                    duration: finishedAfter,
                  })
                : this._t(`${PREFIX}.failed_text`)
            }
          </p>
          <p class="strong">${this._t(`${PREFIX}.failed_next`)}</p>
        `;
        break;
      case "waiting":
        heading = this._t(`${PREFIX}.title`);
        body = html`
          ${this._renderRunLine(run)}
          <p>${this._t(`${PREFIX}.waiting_hint`)}</p>
        `;
        break;
      default:
        heading = this._t(`${PREFIX}.title`);
        body = html`
          ${this._renderRunLine(run)}
          ${
            snapshot.choice.kind === "active" && snapshot.choice.next
              ? html`<p class="quiet">
                  ${this._t(`${PREFIX}.next_in_line`, {
                    build: snapshot.choice.next.runNumber,
                  })}
                </p>`
              : nothing
          }
        `;
    }

    const showRing = look !== "waiting";
    const showTiles = look === "active" || look === "core";
    return html`
      <div class="top">
        <div class="hero s-${look}">
          ${showRing ? this._renderRing(progress, counts, failed) : nothing}
          <div class="hero-text">
            ${this._pillFor(look)}
            <h2 id="soon-h" class="title">${heading}</h2>
            ${body}
            ${
              look === "core" || look === "active"
                ? html`<p class="quiet">${this._renderStartedLine(run)}</p>`
                : nothing
            }
            ${
              look === "ready" || look === "failed" || look === "waiting"
                ? html`<div class="actions">${this._renderRefresh()}</div>`
                : nothing
            }
          </div>
        </div>
        ${showTiles ? this._renderTiles(stages, run, estimate) : nothing}
      </div>
    `;
  }

  private _renderStartedLine(run: BuildRun): string {
    const by = startedBy(run.event);
    const elapsed =
      this._snapshot?.choice.kind === "active"
        ? formatElapsed(durationSeconds(run.startedAt, null, this._now))
        : "";
    return [
      this._t(`${PREFIX}.started_${by}`),
      run.startedAt
        ? this._t(`${PREFIX}.started_at`, {
            time: this._dateTime(run.startedAt),
          })
        : "",
      elapsed ? this._t(`${PREFIX}.elapsed`, { duration: elapsed }) : "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  private _estimateText(estimate: number | "overdue" | undefined): string {
    if (estimate === undefined) {
      return "";
    }
    if (estimate === "overdue") {
      return this._t(`${PREFIX}.estimate_overdue`);
    }
    return estimate >= 60
      ? this._t(`${PREFIX}.estimate_hours`, splitMinutes(estimate))
      : this._t(`${PREFIX}.estimate_minutes`, { minutes: estimate });
  }

  private _renderRing(
    progress: { done: number; total: number; percent: number },
    counts: { running: number; failed: number },
    failed: boolean
  ): TemplateResult {
    const total = Math.max(1, progress.total);
    const doneLength = Math.round((progress.done / total) * RING_LENGTH);
    const runLength = Math.min(
      RING_LENGTH,
      doneLength + Math.round((counts.running / total) * RING_LENGTH)
    );
    const failLength = Math.round((counts.failed / total) * RING_LENGTH);
    const valueText = !progress.total
      ? this._t(`${PREFIX}.ring_valuetext_none`)
      : failed
        ? this._t(`${PREFIX}.ring_valuetext_failed`, {
            done: progress.done,
            total: progress.total,
            failed: counts.failed,
          })
        : this._t(`${PREFIX}.ring_valuetext`, {
            percent: progress.percent,
            done: progress.done,
            total: progress.total,
            running: counts.running,
          });
    const arc = (length: number, cls: string) => svg`<circle
      class="arc ${cls}"
      cx="60"
      cy="60"
      r="50"
      fill="none"
      stroke-width="14"
      stroke-linecap="round"
      stroke-dasharray="${length} ${RING_LENGTH}"
      style=${styleMap({ "--ring-len": String(length) })}
    ></circle>`;
    return html`
      <div
        class="ring ${classMap({ failed })}"
        role="progressbar"
        aria-label=${this._t(`${PREFIX}.progress_label`)}
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow=${progress.percent}
        aria-valuetext=${valueText}
      >
        <svg aria-hidden="true" viewBox="0 0 120 120">
          <circle
            class="track"
            cx="60"
            cy="60"
            r="50"
            fill="none"
            stroke-width="14"
          ></circle>
          ${runLength > doneLength ? arc(runLength, "running") : nothing}
          ${failLength ? arc(doneLength + failLength, "bad") : nothing}
          ${doneLength ? arc(doneLength, "done") : nothing}
        </svg>
        <div class="ring-text" aria-hidden="true">
          <div class="percent">${progress.percent}<span>%</span></div>
          <div class="jobs">
            ${this._t(`${PREFIX}.ring_jobs`, {
              done: progress.done,
              total: progress.total,
            })}
          </div>
        </div>
      </div>
    `;
  }

  private _bigTime(minutes: number | "overdue" | undefined): string {
    if (minutes === undefined) {
      return "";
    }
    if (minutes === "overdue") {
      return this._t(`${PREFIX}.tile_late`);
    }
    if (minutes === 0) {
      return this._t(`${PREFIX}.tile_core_now`);
    }
    return minutes >= 60
      ? this._t(`${PREFIX}.tile_hours`, splitMinutes(minutes))
      : this._t(`${PREFIX}.tile_minutes`, { minutes });
  }

  private _renderTiles(
    stages: StageSummary[],
    run: BuildRun,
    release: number | "overdue" | undefined
  ): TemplateResult {
    const core = estimateCore(stages, run.startedAt, this._now);
    const installed = parseBuildNumber(this.hass.config.version);
    const tile = (index: number) => styleMap({ "--i": String(index) });
    return html`
      <div class="tiles">
        ${
          core !== undefined
            ? html`<div class="tile ok" style=${tile(0)}>
                <div class="tile-label">
                  ${this._t(`${PREFIX}.tile_core_label`)}
                </div>
                <div class="big">${this._bigTime(core)}</div>
                <div class="tile-note">
                  ${
                    core === 0
                      ? this._t(`${PREFIX}.tile_core_done_note`)
                      : this._t(`${PREFIX}.tile_core_note`)
                  }
                </div>
              </div>`
            : nothing
        }
        ${
          release !== undefined
            ? html`<div class="tile" style=${tile(1)}>
                <div class="tile-label">
                  ${this._t(`${PREFIX}.tile_release_label`)}
                </div>
                <div class="big">${this._bigTime(release)}</div>
                <div class="tile-note">
                  ${this._t(`${PREFIX}.tile_release_note`)}
                </div>
              </div>`
            : nothing
        }
        ${
          installed !== undefined
            ? html`<div class="tile versions" style=${tile(2)}>
                <div>
                  <div class="tile-label">
                    ${this._t(`${PREFIX}.tile_have`)}
                  </div>
                  <div class="medium">${installed}</div>
                </div>
                <ha-svg-icon .path=${mdiArrowRight}></ha-svg-icon>
                <div class="end">
                  <div class="tile-label accent">
                    ${this._t(`${PREFIX}.tile_on_way`)}
                  </div>
                  <div class="medium accent">${run.runNumber}</div>
                </div>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  private _stageNote(stage: StageSummary): string {
    if (stage.id === "offer") {
      return this._t(`${PREFIX}.stage_note_offer`);
    }
    if (stage.id === "system") {
      const { done, total } = stageCount(stage);
      return `${this._t(`${PREFIX}.stage_count`, { done, total })}, ${this._t(
        `${PREFIX}.stage_note_system`
      )}`;
    }
    const { done, total } = stageCount(stage);
    return total ? this._t(`${PREFIX}.stage_count`, { done, total }) : "";
  }

  private _renderStages(
    snapshot: BuildSnapshot,
    run: BuildRun,
    stages: StageSummary[],
    look: CardState
  ): TemplateResult {
    const stage = currentStage(stages);
    const index = stage ? stages.indexOf(stage) + 1 : stages.length;
    const failed = look === "failed";
    return html`
      <section
        class="stages-panel"
        aria-label=${this._t(`${PREFIX}.stages_label`)}
      >
        <div class="stage-head">
          <h3>
            ${this._t(`${PREFIX}.stage_heading`, {
              number: index,
              total: stages.length,
            })}
            ${
              stage
                ? html`<span class=${classMap({ accent: !failed, bad: failed })}
                    >${this._t(`${PREFIX}.stage.${stage.id}`)}</span
                  >`
                : nothing
            }
          </h3>
          ${
            snapshot.choice.kind === "active"
              ? html`<div class="quiet">${this._renderStartedLine(run)}</div>`
              : nothing
          }
        </div>
        <div class="rail" aria-hidden="true">
          ${stages.map(
            (item) =>
              html`<div
                class="seg ${item.state}"
                style=${styleMap({
                  flex: String(Math.max(1, item.jobs.length)),
                })}
              ></div>`
          )}
        </div>
        <ol class="stage-tiles">
          ${stages.map((item, position) => this._renderStageTile(item, position, stage))}
        </ol>
        <details class="jobs-box">
          <summary>
            ${this._t(`${PREFIX}.details`)}
            <span class="count">${snapshot.jobs.length}</span>
          </summary>
          <ul class="job-list">
            ${stages.flatMap((item) =>
              item.jobs.map(
                (job) =>
                  html`<li class="job ${job.state}">
                    <i aria-hidden="true"></i>
                    <span class="job-name">${job.name}</span>
                    <span class="job-time">
                      ${this._t(`${PREFIX}.state.${job.state}`)}${
                        job.durationSeconds !== undefined &&
                        job.state !== "waiting"
                          ? html`, ${formatElapsed(job.durationSeconds)}`
                          : nothing
                      }
                    </span>
                  </li>`
              )
            )}
          </ul>
        </details>
        <div class="foot">
          <p class="quiet">
            ${this._t(`${PREFIX}.last_checked`, {
              time: this._time(snapshot.fetchedAt),
            })}
            ${
              snapshot.choice.kind === "active"
                ? this._t(`${PREFIX}.checked_again`)
                : ""
            }
          </p>
          ${this._renderRefresh()}
        </div>
      </section>
    `;
  }

  private _renderStageTile(
    item: StageSummary,
    position: number,
    current: StageSummary | undefined
  ): TemplateResult {
    const isCurrent = item === current;
    const waiting = item.state === "waiting";
    return html`
      <li
        class=${classMap({ "stage-tile": true, [item.state]: true, current: isCurrent })}
        aria-current=${ifDefined(isCurrent ? "step" : undefined)}
        style=${styleMap({ "--i": String(position) })}
      >
        <span class="stage-state">
          ${
            item.state === "running"
              ? html`<ha-spinner size="small"></ha-spinner>`
              : waiting
                ? nothing
                : html`<ha-svg-icon
                    .path=${STATE_ICONS[item.state]}
                  ></ha-svg-icon>`
          }
          ${position + 1} ${this._t(`${PREFIX}.state.${item.state}`)}
        </span>
        <span class="stage-name">${this._t(`${PREFIX}.stage.${item.id}`)}</span>
        <span class="stage-note">${this._stageNote(item)}</span>
      </li>
    `;
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
        .soon {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        .snap {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        .snap.stale {
          opacity: 0.72;
        }
        p {
          margin: 0;
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        h2,
        h3 {
          margin: 0;
        }
        ha-button {
          --ha-button-height: 52px;
        }
        .top {
          display: grid;
          grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
          gap: var(--ha-space-4);
        }
        .top:not(:has(.tiles)) {
          grid-template-columns: minmax(0, 1fr);
        }
        @media (max-width: 900px) {
          .top {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        /* The hero block: tonal, very large. */
        .hero {
          box-sizing: border-box;
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: clamp(20px, 4vw, 40px);
          min-width: 0;
          padding: clamp(22px, 4vw, 44px);
          border-radius: calc(var(--ha-border-radius-6xl) + 12px);
          color: var(--primary-text-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 26%,
            var(--card-background-color)
          );
          animation: ha-rise var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
        }
        .hero.s-waiting,
        .hero.s-none {
          background: color-mix(
            in srgb,
            var(--primary-color) 10%,
            var(--card-background-color)
          );
        }
        .hero.s-core,
        .hero.s-ready {
          background: color-mix(
            in srgb,
            var(--success-color) 26%,
            var(--card-background-color)
          );
        }
        .hero.s-failed {
          background: color-mix(
            in srgb,
            var(--error-color) 22%,
            var(--card-background-color)
          );
        }
        .hero.s-rest {
          background: color-mix(
            in srgb,
            var(--warning-color, var(--primary-color)) 24%,
            var(--card-background-color)
          );
        }
        .hero.s-offline {
          background: var(--secondary-background-color);
          border: 2px dashed var(--divider-color);
        }
        .hero-text {
          display: flex;
          flex: 1 1 260px;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .title {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: clamp(28px, 3.6vw, 48px);
          font-weight: var(--ha-font-weight-bold);
          line-height: 1.08;
          text-wrap: balance;
          letter-spacing: -0.02em;
          overflow-wrap: anywhere;
        }
        .strong {
          font-weight: var(--ha-font-weight-medium);
        }
        .version-line {
          font-size: var(--ha-font-size-xl);
        }
        .chip {
          display: inline-block;
          padding: 2px 10px;
          border-radius: var(--ha-border-radius-lg);
          background: color-mix(
            in srgb,
            var(--primary-color) 32%,
            var(--card-background-color)
          );
          font-family: var(--ha-font-family-code, monospace);
          font-size: 0.92em;
          overflow-wrap: anywhere;
        }
        .commit {
          max-width: 56ch;
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .pill {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 32px;
          padding: 0 14px;
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
        }
        .pill.on-hero {
          background: var(--card-background-color);
          color: var(--primary-text-color);
        }
        .pill.neutral {
          background: var(--secondary-background-color);
        }
        .pill ha-svg-icon {
          --mdc-icon-size: 16px;
        }
        .pill ha-spinner {
          --ha-spinner-size: 14px;
        }
        /* The progress ring. */
        .ring {
          position: relative;
          flex: none;
          width: clamp(168px, 26vw, 240px);
          aspect-ratio: 1;
          margin-inline: auto;
        }
        .ring svg {
          width: 100%;
          height: 100%;
          transform: rotate(-90deg);
        }
        .ring .track {
          stroke: color-mix(
            in srgb,
            var(--primary-text-color) 14%,
            transparent
          );
        }
        .ring .arc {
          animation: ring-draw var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-ease, ease-out) both;
        }
        .ring .arc.done {
          stroke: var(--primary-text-color);
        }
        .ring .arc.running {
          stroke: var(--primary-color);
        }
        .ring .arc.bad {
          stroke: var(--error-color);
        }
        .ring.failed .arc.done {
          stroke: var(--secondary-text-color);
        }
        @keyframes ring-draw {
          from {
            stroke-dasharray: 0 314;
          }
          to {
            stroke-dasharray: var(--ring-len) 314;
          }
        }
        .ring-text {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
        }
        .percent {
          font-size: clamp(44px, 7vw, 68px);
          font-weight: 800;
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .percent span {
          font-size: 0.5em;
        }
        .jobs {
          margin-top: 4px;
          font-size: var(--ha-font-size-s);
        }
        /* Three tiles beside the hero. */
        .tiles {
          display: grid;
          grid-template-rows: repeat(auto-fit, minmax(0, auto));
          gap: var(--ha-space-4);
          min-width: 0;
        }
        .tile {
          display: flex;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-6xl);
          background: var(--secondary-background-color);
          animation: ha-pop var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
          animation-delay: calc(var(--i, 0) * 70ms);
        }
        .tile.ok {
          background: color-mix(
            in srgb,
            var(--success-color) 28%,
            var(--card-background-color)
          );
        }
        .tile-label {
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          color: var(--secondary-text-color);
        }
        .tile.ok .tile-label {
          color: var(--primary-text-color);
        }
        .big {
          font-size: clamp(30px, 3.4vw, 44px);
          font-weight: 800;
          line-height: 1.1;
          overflow-wrap: anywhere;
        }
        .medium {
          font-size: 28px;
          font-weight: 800;
          line-height: 1.15;
          font-variant-numeric: tabular-nums;
        }
        .tile-note {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .tile.ok .tile-note {
          color: var(--primary-text-color);
        }
        .tile.versions {
          flex-direction: row;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .tile.versions .end {
          text-align: end;
        }
        .accent {
          color: var(--primary-color);
        }
        .bad {
          color: var(--error-color);
        }
        /* What a replaced build looks like. */
        .replaced {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3) var(--ha-space-4);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-5xl);
          border: 2px dashed var(--divider-color);
        }
        /* Stages. */
        .stages-panel {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-5);
          padding: clamp(20px, 3vw, 32px);
          border-radius: calc(var(--ha-border-radius-6xl) + 4px);
          background: var(--card-background-color);
        }
        .stage-head {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          align-items: baseline;
          gap: var(--ha-space-2);
        }
        .stage-head h3 {
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-bold);
          overflow-wrap: anywhere;
        }
        .rail {
          display: flex;
          gap: 6px;
          height: 20px;
        }
        .seg {
          border-radius: 4px;
          background: var(--secondary-background-color);
          min-width: 0;
        }
        .seg:first-child {
          border-start-start-radius: 10px;
          border-end-start-radius: 10px;
        }
        .seg:last-child {
          border-start-end-radius: 10px;
          border-end-end-radius: 10px;
        }
        .seg.done {
          background: var(--primary-color);
        }
        .seg.failed {
          background: var(--error-color);
        }
        .seg.running {
          background:
            linear-gradient(
                135deg,
                transparent 25%,
                color-mix(in srgb, var(--primary-color) 40%, black) 25%,
                color-mix(in srgb, var(--primary-color) 40%, black) 50%,
                transparent 50%,
                transparent 75%,
                color-mix(in srgb, var(--primary-color) 40%, black) 75%
              )
              0 0 / 34px 34px,
            var(--primary-color);
          animation: stripes 1.2s linear infinite;
        }
        @keyframes stripes {
          to {
            background-position:
              34px 0,
              0 0;
          }
        }
        .stage-tiles {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          gap: 10px;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .stage-tile {
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-width: 0;
          padding: 14px 16px;
          border-radius: var(--ha-border-radius-3xl);
          background: var(--secondary-background-color);
          animation: ha-rise var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
          animation-delay: calc(var(--i, 0) * 50ms);
        }
        .stage-tile.waiting,
        .stage-tile.skipped,
        .stage-tile.cancelled {
          background: transparent;
          border: 2px dashed var(--divider-color);
          padding: 12px 14px;
        }
        .stage-tile.current {
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        .stage-tile.current .stage-note {
          color: inherit;
        }
        .stage-tile.failed {
          background: color-mix(
            in srgb,
            var(--error-color) 22%,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
          border: 2px solid var(--error-color);
          padding: 12px 14px;
        }
        .stage-state {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
          color: var(--secondary-text-color);
        }
        .stage-tile.done .stage-state {
          color: var(--success-color);
        }
        .stage-tile.failed .stage-state {
          color: var(--error-color);
        }
        .stage-tile.current .stage-state {
          color: inherit;
        }
        .stage-state ha-svg-icon {
          --mdc-icon-size: 18px;
        }
        .stage-state ha-spinner {
          --ha-spinner-size: 16px;
        }
        .stage-name {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .stage-note {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        /* Every job. */
        .jobs-box {
          border-top: 1px solid var(--divider-color);
          padding-top: var(--ha-space-2);
        }
        .jobs-box summary {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 48px;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }
        .jobs-box summary:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .count {
          padding: 2px 10px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
        }
        .job-list {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 260px), 1fr)
          );
          gap: 8px;
          margin: var(--ha-space-2) 0 0;
          padding: 0;
          list-style: none;
          font-size: var(--ha-font-size-s);
        }
        .job {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
        }
        .job i {
          flex: none;
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--secondary-text-color);
        }
        .job.done i {
          background: var(--success-color);
        }
        .job.failed i {
          background: var(--error-color);
        }
        .job.waiting {
          background: transparent;
          border: 1px solid var(--divider-color);
        }
        .job.waiting i {
          background: transparent;
          border: 2px solid var(--secondary-text-color);
          box-sizing: border-box;
        }
        .job.running {
          background: color-mix(
            in srgb,
            var(--primary-color) 24%,
            var(--card-background-color)
          );
          font-weight: var(--ha-font-weight-medium);
        }
        .job.running i {
          background: var(--primary-color);
        }
        .job-name {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .job-time {
          color: var(--secondary-text-color);
          font-variant-numeric: tabular-nums;
          text-align: end;
        }
        .foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .foot .quiet {
          flex: 1 1 260px;
        }
        .privacy {
          padding-inline: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .hero,
          .tile,
          .stage-tile,
          .ring .arc,
          .seg.running {
            animation: none;
          }
        }
        @media (max-width: 480px) {
          .hero {
            padding: var(--ha-space-5);
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
