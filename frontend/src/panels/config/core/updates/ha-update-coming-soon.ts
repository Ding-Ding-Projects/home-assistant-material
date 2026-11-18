import {
  mdiCancel,
  mdiCheckCircle,
  mdiChevronDown,
  mdiChevronUp,
  mdiCircleOutline,
  mdiCloseCircle,
  mdiCloudOffOutline,
  mdiMinusCircleOutline,
  mdiProgressClock,
  mdiRefresh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import type { ChangeList } from "../../../../data/build-changes";
import {
  fetchChangeList,
  loadedRepository,
} from "../../../../data/build-changes";
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
  alreadyInstalled,
  buildRelation,
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
  jobNameKey,
  jobStateCounts,
  parseBuildNumber,
  splitMinutes,
  stageCount,
  startedBy,
} from "../../../../data/build-progress";
import type { PartText } from "../../../../common/language-mode/language-mode";
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

// How many changes the card lists before it says "and N more".
const MAX_CHANGES = 3;

// The open or closed state of the card is remembered in this browser.
const OPEN_KEY = "ha-update-coming-soon-open";

// A phone starts with the card closed, a wide window with it open.
const defaultOpen = (): boolean =>
  !window.matchMedia("(max-width: 600px)").matches;

const readOpen = (): boolean => {
  try {
    const stored = window.localStorage.getItem(OPEN_KEY);
    if (stored === "1") {
      return true;
    }
    if (stored === "0") {
      return false;
    }
  } catch (_err) {
    // Storage is not available; use the default.
  }
  return defaultOpen();
};

const STATE_ICONS: Record<JobState, string> = {
  waiting: mdiCircleOutline,
  running: mdiProgressClock,
  done: mdiCheckCircle,
  failed: mdiCloseCircle,
  cancelled: mdiCancel,
  skipped: mdiMinusCircleOutline,
};

/** Which of the eight looks the card takes. */
// "have" is a build that is the installed build or older: nothing to install.
type CardState =
  "active" | "core" | "waiting" | "ready" | "failed" | "none" | "have";

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

  @state() private _changes?: ChangeList;

  @state() private _open = readOpen();

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
    // The change list is optional: without it the card shows only the latest
    // change of the build.
    if (result.ok && !this._changes) {
      fetchChangeList(false, controller.signal).then((changes) => {
        if (changes.ok && !controller.signal.aborted) {
          this._changes = changes.data;
        }
      });
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

  private _toggle = () => {
    this._open = !this._open;
    try {
      window.localStorage.setItem(OPEN_KEY, this._open ? "1" : "0");
    } catch (_err) {
      // Storage is not available; the card still works for this visit.
    }
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

  // A job name in the language being written; a name that is not known is
  // shown as the build data gives it.
  private _jobName(
    name: string,
    part?: (key: string, values?: Record<string, string | number>) => string
  ): string {
    const known = jobNameKey(name);
    if (!known) {
      return name;
    }
    const text = part
      ? part(known.key, known.values)
      : this._t(known.key, known.values);
    return `${text}${known.rest}`;
  }

  // ------------------------------------------------------------------ render

  protected render(): TemplateResult {
    const failure = this._failure;
    const snapshot = this._snapshot;
    return html`
      <section class="soon" aria-labelledby="soon-h">
        ${failure ? this._renderFailure(failure, snapshot) : nothing}
        ${
          snapshot
            ? html`<div class="snap ${classMap({ stale: !!failure })}">
                ${this._renderSnapshot(snapshot)}
              </div>`
            : !failure && this._loading
              ? html`<div class="card s-waiting">
                  <div class="head">
                    <ha-spinner size="small"></ha-spinner>
                    <div class="head-text">
                      <h2 id="soon-h" class="title">
                        ${this._t(`${PREFIX}.title`)}
                      </h2>
                      <p class="sub" role="status">
                        ${this._t(`${PREFIX}.loading`)}
                      </p>
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
  private _renderFailure(
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
      <div class="card ${resting ? "s-rest" : "s-offline"}" role="alert">
        <div class="head">
          <ha-svg-icon
            class="lead"
            .path=${resting ? mdiProgressClock : mdiCloudOffOutline}
          ></ha-svg-icon>
          <div class="head-text">
            ${
              !snapshot
                ? html`<h2 id="soon-h" class="title">${title}</h2>`
                : html`<h2 class="title">${title}</h2>`
            }
            <p class="sub">${this._failureText(failure)}</p>
            ${
              snapshot && known
                ? html`<p class="sub">
                    ${this._t(`${PREFIX}.known_at`, { time: known })}
                  </p>`
                : nothing
            }
          </div>
        </div>
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
        return this._alreadyInstalled(snapshot) ? "have" : "ready";
      case "failed":
        return "failed";
      default:
        if (stages.some((stage) => stage.state === "failed")) {
          return "failed";
        }
        if (this._alreadyInstalled(snapshot)) {
          return "have";
        }
        return coreUpdateOffered(stages) ? "core" : "active";
    }
  }

  // True when the build in this card is the installed build or an older one.
  private _alreadyInstalled(snapshot: BuildSnapshot): boolean {
    const run =
      snapshot.choice.kind === "active" || snapshot.choice.kind === "ready"
        ? snapshot.choice.run
        : undefined;
    return (
      !!run &&
      alreadyInstalled(
        buildRelation(parseBuildNumber(this.hass.config.version), run.runNumber)
      )
    );
  }

  private _renderSnapshot(snapshot: BuildSnapshot): TemplateResult {
    const { choice } = snapshot;
    if (choice.kind === "none") {
      return html`
        <div class="card s-none">
          <div class="head">
            <ha-svg-icon class="lead" .path=${mdiCheckCircle}></ha-svg-icon>
            <div class="head-text">
              <h2 id="soon-h" class="title">${this._t(`${PREFIX}.none`)}</h2>
              <p class="sub">${this._t(`${PREFIX}.none_text`)}</p>
            </div>
          </div>
          <div class="foot">
            ${this._renderChecked(snapshot)} ${this._renderRefresh()}
          </div>
        </div>
        ${this._renderReplaced(snapshot)}
      `;
    }
    const run = choice.run;
    const stages = buildStages(snapshot.jobs, run, this._now);
    const look = this._cardState(snapshot, stages);
    return html`
      ${this._renderCard(snapshot, run, stages, look)}
      ${this._renderReplaced(snapshot)}
    `;
  }

  private _renderRefresh(): TemplateResult {
    return html`<ha-button
      appearance="outlined"
      size="small"
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
      ${
        snapshot.choice.kind === "active"
          ? html`<span class="again"
              >${this._t(`${PREFIX}.checked_again`)}</span
            >`
          : nothing
      }
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
        <span class="pill">${this._t(`${PREFIX}.pill_replaced`)}</span>
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

  // "Build 517 becomes Core 2026.11.1.517", on one line.
  private _renderRunLine(run: BuildRun): TemplateResult {
    const version = coreVersionFor(
      coreBase(this.hass.config.version),
      run.runNumber
    );
    return version
      ? html`${this._t(`${PREFIX}.build_becomes`, { build: run.runNumber })}
          <span class="chip">${version}</span>`
      : html`${this._t(`${PREFIX}.build`, { build: run.runNumber })}`;
  }

  private _leadIcon(look: CardState): TemplateResult {
    switch (look) {
      case "active":
        return html`<ha-spinner class="lead" size="small"></ha-spinner>`;
      case "core":
      case "ready":
        return html`<ha-svg-icon
          class="lead good"
          .path=${mdiCheckCircle}
        ></ha-svg-icon>`;
      case "failed":
        return html`<ha-svg-icon
          class="lead bad"
          .path=${mdiCloseCircle}
        ></ha-svg-icon>`;
      case "have":
        return this._snapshot?.choice.kind === "active"
          ? html`<ha-spinner class="lead" size="small"></ha-spinner>`
          : html`<ha-svg-icon
              class="lead good"
              .path=${mdiCheckCircle}
            ></ha-svg-icon>`;
      default:
        return html`<ha-svg-icon
          class="lead"
          .path=${mdiProgressClock}
        ></ha-svg-icon>`;
    }
  }

  // The one card: a head with the build and the real percentage, a thin bar, and
  // behind the toggle the stages, what will be in the build and what to do.
  private _renderCard(
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
    let lines: (TemplateResult | typeof nothing)[];
    let canDo: string;
    switch (look) {
      case "core":
        heading = version
          ? this._t(`${PREFIX}.core_ready_title`, { version })
          : this._t(`${PREFIX}.core_ready_title_plain`);
        lines = [
          html`<p class="line">
            ${this._lang.compose(this.hass.localize, (part) =>
              [
                this._stageLine(part, stage, stages),
                this._estimateWith(part, estimate),
                part(`${PREFIX}.core_ready_wait`),
              ]
                .filter(Boolean)
                .join(" ")
            )}
          </p>`,
        ];
        canDo = this._t(`${PREFIX}.core_ready_hint`);
        break;
      case "have":
        heading = this._t(`${PREFIX}.have_title`, {
          build: parseBuildNumber(this.hass.config.version) ?? run.runNumber,
        });
        lines = [
          active
            ? html`<p class="line">
                ${this._lang.compose(this.hass.localize, (part) =>
                  [
                    this._stageLine(part, stage, stages),
                    this._estimateWith(part, estimate),
                    part(`${PREFIX}.have_rest`),
                  ]
                    .filter(Boolean)
                    .join(" ")
                )}
              </p>`
            : html`<p class="line">${this._t(`${PREFIX}.have_done`)}</p>`,
        ];
        canDo = this._t(`${PREFIX}.can_do_nothing`);
        break;
      case "ready":
        heading = this._t(`${PREFIX}.ready`, { build: run.runNumber });
        lines = [
          html`<p class="line">
            ${this._t(`${PREFIX}.finished_text`, {
              time: this._time(run.updatedAt),
              duration: finishedAfter,
            })}
          </p>`,
        ];
        canDo = this._t(`${PREFIX}.ready_hint`);
        break;
      case "failed":
        heading = this._t(`${PREFIX}.failed`, { build: run.runNumber });
        lines = [
          html`<p class="line" role="alert">
            ${
              failedJob
                ? this._lang.compose(this.hass.localize, (part) =>
                    part(`${PREFIX}.failed_detail`, {
                      number: stageIndex,
                      job: this._jobName(failedJob.name, part),
                      duration: finishedAfter,
                    })
                  )
                : this._t(`${PREFIX}.failed_text`)
            }
          </p>`,
        ];
        canDo = this._t(`${PREFIX}.failed_next`);
        break;
      case "waiting":
        heading = this._t(`${PREFIX}.title`);
        lines = [
          html`<p class="line">${this._t(`${PREFIX}.waiting_hint`)}</p>`,
        ];
        canDo = this._t(`${PREFIX}.can_do_wait`);
        break;
      default:
        heading = this._t(`${PREFIX}.title`);
        lines = [
          html`<p class="line">
            ${this._lang.compose(this.hass.localize, (part) =>
              [
                this._stageLine(part, stage, stages),
                this._estimateWith(part, estimate),
              ]
                .filter(Boolean)
                .join(" ")
            )}
          </p>`,
          snapshot.choice.kind === "active" && snapshot.choice.next
            ? html`<p class="line">
                ${this._t(`${PREFIX}.next_in_line`, {
                  build: snapshot.choice.next.runNumber,
                })}
              </p>`
            : nothing,
        ];
        canDo = this._t(`${PREFIX}.can_do_wait`);
    }

    const showBar = look !== "waiting";
    const open = this._open;
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
    const total = Math.max(1, progress.total);
    const doneWidth = Math.round((progress.done / total) * 100);
    const runWidth = Math.min(
      100 - doneWidth,
      Math.round((counts.running / total) * 100)
    );
    const meta =
      look === "active" || look === "core" || look === "have"
        ? this._renderStartedLine(run)
        : "";
    const items = this._changeItems(run);
    return html`
      <div class="card s-${look}">
        <div class="head">
          ${this._leadIcon(look)}
          <div class="head-text">
            <h2 id="soon-h" class="title">${heading}</h2>
            <p class="sub">${this._renderRunLine(run)}</p>
          </div>
          ${
            showBar && progress.total
              ? html`<span class="pct" aria-hidden="true"
                  >${progress.percent}%</span
                >`
              : nothing
          }
          <ha-icon-button
            class="toggle"
            .path=${open ? mdiChevronUp : mdiChevronDown}
            .label=${
              open
                ? this._t(`${PREFIX}.hide_details`)
                : this._t(`${PREFIX}.show_details`)
            }
            aria-expanded=${open ? "true" : "false"}
            aria-controls="soon-body"
            @click=${this._toggle}
          ></ha-icon-button>
        </div>
        ${
          showBar
            ? html`<div
                  class="bar ${classMap({ failed })}"
                  role="progressbar"
                  aria-label=${this._t(`${PREFIX}.progress_label`)}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${progress.percent}
                  aria-valuetext=${valueText}
                >
                  <i
                    class="done"
                    style=${styleMap({ width: `${doneWidth}%` })}
                  ></i
                  ><i
                    class="run"
                    style=${styleMap({ width: `${runWidth}%` })}
                  ></i>
                </div>
                <p class="meta">
                  ${
                    progress.total
                      ? this._t(`${PREFIX}.ring_jobs`, {
                          done: progress.done,
                          total: progress.total,
                        })
                      : this._t(`${PREFIX}.ring_valuetext_none`)
                  }${meta ? html` · ${meta}` : nothing}
                </p>`
            : html`<p class="meta">${this._renderStartedLine(run)}</p>`
        }
        ${
          open
            ? html`<div class="body" id="soon-body">
                ${lines}
                ${
                  estimate !== undefined
                    ? html`<p class="quiet">
                        ${this._t(`${PREFIX}.estimate_note`)}
                      </p>`
                    : nothing
                }
                ${stages.length && snapshot.choice.kind !== "waiting" ? this._renderStages(stages, stage) : nothing}
                ${items ? this._renderChanges(items) : nothing}
                <p class="line can-do">
                  <strong>${this._t(`${PREFIX}.can_do`)}</strong> ${canDo}
                </p>
                ${
                  snapshot.jobs.length
                    ? html`<details class="jobs-box">
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
                                  <span class="job-name"
                                    >${this._jobName(job.name)}</span
                                  >
                                  <span class="job-time">
                                    ${this._t(`${PREFIX}.state.${job.state}`)}${
                                      job.durationSeconds !== undefined &&
                                      job.state !== "waiting"
                                        ? html`,
                                          ${formatElapsed(job.durationSeconds)}`
                                        : nothing
                                    }
                                  </span>
                                </li>`
                            )
                          )}
                        </ul>
                      </details>`
                    : nothing
                }
                <div class="foot">
                  ${this._renderChecked(snapshot)} ${this._renderRefresh()}
                </div>
              </div>`
            : nothing
        }
      </div>
    `;
  }

  // The first three changes of this build, from the public change list, or
  // the latest change of the run when the list does not have the build yet.
  private _changeItems(
    run: BuildRun
  ): { titles: string[]; more: number } | undefined {
    const release = this._changes?.releases.find(
      (entry) => entry.build === run.runNumber
    );
    const titles = release?.changes.length
      ? release.changes.map((change) => change.title)
      : run.title
        ? [run.title]
        : [];
    if (!titles.length) {
      return undefined;
    }
    return {
      titles: titles.slice(0, MAX_CHANGES),
      more: Math.max(0, titles.length - MAX_CHANGES),
    };
  }

  private _renderChanges(items: {
    titles: string[];
    more: number;
  }): TemplateResult {
    return html`
      <div class="changes">
        <h3>${this._t(`${PREFIX}.whats_in`)}</h3>
        <ul>
          ${items.titles.map((title) => html`<li>${title}</li>`)}
        </ul>
        ${
          items.more
            ? html`<p class="quiet">
                ${this._t(`${PREFIX}.more_changes`, { count: items.more })}
              </p>`
            : nothing
        }
      </div>
    `;
  }

  // Each language gets its own line, with its own date, and the two lines are
  // joined for the mode, so no date or phrase is repeated inside a line.
  private _renderStartedLine(run: BuildRun): string {
    const by = startedBy(run.event);
    const elapsed =
      this._snapshot?.choice.kind === "active"
        ? formatElapsed(durationSeconds(run.startedAt, null, this._now))
        : "";
    return this._lang.compose(
      this.hass.localize,
      (part) => {
        return [
          run.startedAt
            ? part(`${PREFIX}.started_at`, {
                time: this._time(run.startedAt),
              })
            : part(`${PREFIX}.started_${by}`),
          elapsed ? part(`${PREFIX}.elapsed`, { duration: elapsed }) : "",
        ]
          .filter(Boolean)
          .join(" · ");
      },
      " / "
    );
  }

  // "Stage 3 of 7: Building the interface." in the language being built.
  private _stageLine(
    part: PartText,
    stage: StageSummary | undefined,
    stages: StageSummary[]
  ): string {
    return stage
      ? part(`${PREFIX}.stage_of`, {
          number: stages.indexOf(stage) + 1,
          total: stages.length,
          stage: part(`${PREFIX}.stage.${stage.id}`),
        })
      : "";
  }

  private _estimateWith(
    part: PartText,
    estimate: number | "overdue" | undefined
  ): string {
    if (estimate === undefined) {
      return "";
    }
    if (estimate === "overdue") {
      return part(`${PREFIX}.estimate_overdue`);
    }
    return estimate >= 60
      ? part(`${PREFIX}.estimate_hours`, splitMinutes(estimate))
      : part(`${PREFIX}.estimate_minutes`, { minutes: estimate });
  }

  private _renderStages(
    stages: StageSummary[],
    current: StageSummary | undefined
  ): TemplateResult {
    return html`
      <ol class="stages" aria-label=${this._t(`${PREFIX}.stages_label`)}>
        ${stages.map((item) => {
          const isCurrent = item === current;
          const { done, total } = stageCount(item);
          return html`<li
            class=${classMap({ st: true, [item.state]: true, current: isCurrent })}
            aria-current=${ifDefined(isCurrent ? "step" : undefined)}
          >
            <span class="st-icon">
              ${
                item.state === "running"
                  ? html`<ha-spinner size="tiny"></ha-spinner>`
                  : html`<ha-svg-icon
                      .path=${STATE_ICONS[item.state]}
                    ></ha-svg-icon>`
              }
            </span>
            <span class="st-name"
              >${this._t(`${PREFIX}.stage.${item.id}`)}${
                total > 1 && item.state !== "waiting"
                  ? html` <span class="quiet">${done}/${total}</span>`
                  : nothing
              }</span
            >
            <span class="st-state"
              >${this._t(`${PREFIX}.state.${item.state}`)}</span
            >
          </li>`;
        })}
      </ol>
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
          margin: 0;
        }
        :host {
          display: block;
        }
        .soon,
        .snap {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .snap.stale {
          opacity: 0.72;
        }
        p {
          margin: 0;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }
        ha-button {
          --ha-button-height: 44px;
        }
        /* One compact card: padding 12 to 16 px, text of 12 to 16 px. */
        .card {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          min-width: 0;
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          color: var(--primary-text-color);
          background: color-mix(
            in srgb,
            var(--primary-color) 14%,
            var(--card-background-color)
          );
          animation: ha-rise var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
        }
        .card.s-waiting,
        .card.s-none {
          background: var(--card-background-color);
        }
        .card.s-core,
        .card.s-ready {
          background: color-mix(
            in srgb,
            var(--success-color) 14%,
            var(--card-background-color)
          );
        }
        .card.s-failed {
          background: color-mix(
            in srgb,
            var(--error-color) 14%,
            var(--card-background-color)
          );
        }
        .card.s-rest {
          background: color-mix(
            in srgb,
            var(--warning-color, var(--primary-color)) 14%,
            var(--card-background-color)
          );
        }
        .card.s-offline {
          background: var(--secondary-background-color);
        }
        .head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-width: 0;
        }
        .lead {
          flex: none;
          --mdc-icon-size: 24px;
          --ha-spinner-size: 22px;
          color: var(--primary-color);
        }
        .lead.good {
          color: var(--success-color);
        }
        .lead.bad {
          color: var(--error-color);
        }
        .head-text {
          display: flex;
          flex: 1 1 auto;
          flex-direction: column;
          gap: 2px;
          min-width: 0;
        }
        .title {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-bold);
          line-height: 1.25;
        }
        .sub {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .pct {
          flex: none;
          font-size: 20px;
          font-weight: var(--ha-font-weight-bold);
          line-height: 1;
          font-variant-numeric: tabular-nums;
        }
        .toggle {
          flex: none;
          --ha-icon-button-size: 44px;
          margin-inline-end: -8px;
        }
        .chip {
          display: inline-block;
          padding: 0 6px;
          border-radius: var(--ha-border-radius-md);
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
          font-family: var(--ha-font-family-code, monospace);
          overflow-wrap: anywhere;
        }
        .bar {
          display: flex;
          height: 6px;
          border-radius: 3px;
          overflow: hidden;
          background: color-mix(
            in srgb,
            var(--primary-text-color) 14%,
            transparent
          );
        }
        .bar i {
          display: block;
          height: 100%;
          transition: width var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-ease, ease-out);
        }
        .bar .done {
          background: var(--primary-color);
        }
        .bar .run {
          background: color-mix(in srgb, var(--primary-color) 45%, transparent);
        }
        .bar.failed .done {
          background: var(--error-color);
        }
        .meta {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding-top: var(--ha-space-2);
          border-top: 1px solid var(--divider-color);
          font-size: var(--ha-font-size-m);
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .again::before {
          content: " · ";
        }
        .can-do strong {
          font-weight: var(--ha-font-weight-medium);
        }
        .stages {
          display: flex;
          flex-direction: column;
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .st {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 32px;
          font-size: var(--ha-font-size-m);
        }
        .st-icon {
          display: inline-flex;
          flex: none;
          width: 20px;
          justify-content: center;
          color: var(--secondary-text-color);
          --mdc-icon-size: 18px;
          --ha-spinner-size: 16px;
        }
        .st.done .st-icon {
          color: var(--success-color);
        }
        .st.failed .st-icon {
          color: var(--error-color);
        }
        .st.running .st-icon,
        .st.current .st-icon {
          color: var(--primary-color);
        }
        .st-name {
          flex: 1;
          min-width: 0;
          overflow-wrap: anywhere;
        }
        .st.current .st-name {
          font-weight: var(--ha-font-weight-medium);
        }
        .st.waiting .st-name,
        .st.skipped .st-name {
          color: var(--secondary-text-color);
        }
        .st-state {
          flex: none;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .changes h3 {
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        .changes ul {
          margin: var(--ha-space-1) 0 0;
          padding-inline-start: 18px;
          font-size: var(--ha-font-size-m);
        }
        .changes li {
          overflow-wrap: anywhere;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        /* Every job. */
        .jobs-box summary {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 44px;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }
        .jobs-box summary:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .count {
          padding: 0 8px;
          border-radius: var(--ha-border-radius-md);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
        }
        .job-list {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin: 0;
          padding: 0;
          list-style: none;
          font-size: var(--ha-font-size-s);
        }
        .job {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: 6px 0;
        }
        .job i {
          flex: none;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--secondary-text-color);
        }
        .job.done i {
          background: var(--success-color);
        }
        .job.failed i {
          background: var(--error-color);
        }
        .job.running i {
          background: var(--primary-color);
        }
        .job.waiting i {
          background: transparent;
          border: 2px solid var(--secondary-text-color);
          box-sizing: border-box;
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
          gap: var(--ha-space-2);
        }
        .foot .quiet {
          flex: 1 1 180px;
        }
        /* What a replaced build looks like. */
        .replaced {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          border: 1px dashed var(--divider-color);
          font-size: var(--ha-font-size-s);
        }
        .pill {
          display: inline-flex;
          align-items: center;
          min-height: 24px;
          padding: 0 10px;
          border-radius: var(--ha-border-radius-pill);
          background: var(--secondary-background-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
        }
        .privacy {
          padding-inline: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .card {
            animation: none;
          }
          .bar i {
            transition: none;
          }
        }
        @media (min-width: 900px) {
          .card {
            padding: var(--ha-space-4) var(--ha-space-5);
          }
          .title {
            font-size: var(--ha-font-size-xl);
          }
          .pct {
            font-size: 28px;
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
