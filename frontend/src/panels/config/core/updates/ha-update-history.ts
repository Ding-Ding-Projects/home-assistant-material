import { mdiHistory, mdiUndoVariant } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { formatDateTime } from "../../../../common/datetime/format_date_time";
import { formatTime } from "../../../../common/datetime/format_time";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import { formatForMode } from "../../../../common/language-mode/mode-format";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import { isConnectionLostError } from "../../../../components/update-progress/update-progress-logic";
import { fetchChangeList, findRelease } from "../../../../data/build-changes";
import { parseBuildNumber } from "../../../../data/build-progress";
import { extractApiErrorMessage } from "../../../../data/hassio/common";
import type { UpdateEntity } from "../../../../data/update";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { haMotionKeyframes } from "../../../../resources/motion-styles";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { TimeFormat } from "../../../../data/translation";
import type { HistoryEntry, RollbackBlock } from "./update-history";
import {
  anyUpdateInProgress,
  historyRows,
  loadPendingGoBack,
  markGoBackShown,
  installCoreVersion,
  loadHistory,
  recordVersion,
  rollbackBlockReason,
  rollbackTargets,
  splitDuration,
  storeHistory,
  storePendingGoBack,
  takeGoBackNotice,
} from "./update-history";
import { evaluateStep } from "./update-queue";

const PREFIX = "ui.panel.config.updates.history";

/** The update entity the Supervisor keeps for Home Assistant Core. */
const CORE_UPDATE_ENTITY = "update.home_assistant_core_update";

const TICK_MS = 5000;

interface RollbackJob {
  version: string;
  startedAt: number;
  seenInProgress: boolean;
  idleSince: number | null;
  /** The call to the Supervisor has not answered yet. */
  callPending: boolean;
  outcome: "running" | "done" | "failed";
  error?: string;
}

/**
 * "Update history": the Core builds this browser has seen installed, how long
 * each ran, and a deliberate way back to an earlier one. Going back is never
 * started by itself and is refused while anything else is updating.
 */
@customElement("ha-update-history")
export class HaUpdateHistory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The Supervisor answered, so its Core update call exists. */
  @property({ type: Boolean, attribute: false })
  public supervisorAvailable = false;

  /** The update queue, or an update from USB storage, is running. */
  @property({ type: Boolean, attribute: false }) public busy = false;

  /** The "make a backup first" choice of the page. */
  @property({ type: Boolean, attribute: false }) public backup = false;

  @state() private _history: HistoryEntry[] = [];

  @state() private _changeCount?: number;

  @state() private _job?: RollbackJob;

  /** The one-time line about a way back that finished or did not. */
  @state() private _notice?: {
    kind: "done" | "failed";
    build: string;
    time: number;
  };

  private _lang = new LanguageModeController(this);

  private _timer?: ReturnType<typeof setInterval>;

  private _abort?: AbortController;

  public connectedCallback(): void {
    super.connectedCallback();
    this._history = loadHistory();
    this._record();
    this._resolvePending();
    this._loadChangeCount();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._abort?.abort();
    this._abort = undefined;
    this._stopTimer();
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (changedProps.has("hass")) {
      const old = changedProps.get("hass") as HomeAssistant | undefined;
      if (!old || old.config.version !== this.hass.config.version) {
        this._record();
        this._loadChangeCount();
      }
      this._resolvePending();
      this._tick();
    }
  }

  // A way back that was started before this page loaded: report how it ended,
  // once, and forget it.
  private _resolvePending(): void {
    // While this page runs the way back itself, its own result is shown.
    if (!this.hass?.config || this._job) {
      return;
    }
    const notice = takeGoBackNotice(
      this._history,
      this.hass.config.version,
      Date.now()
    );
    if (notice) {
      this._notice = notice;
    }
  }

  // Times here read 24-hour unless the person chose the 12-hour clock.
  private _locale(language: string): HomeAssistant["locale"] {
    return {
      ...this.hass.locale,
      language,
      time_format:
        this.hass.locale.time_format === TimeFormat.am_pm
          ? TimeFormat.am_pm
          : TimeFormat.twenty_four,
    };
  }

  // The time of day in the language of the chosen mode.
  private _time(ms: number): string {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    return formatForMode(
      (language) => formatTime(date, this._locale(language), this.hass.config),
      this.hass.locale.language,
      this._lang.mode
    );
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  private _record(): void {
    if (!this.hass) {
      return;
    }
    const next = recordVersion(
      this._history,
      this.hass.config.version,
      Date.now()
    );
    if (next[0]?.version !== this._history[0]?.version) {
      this._history = next;
      storeHistory(next);
    } else if (!this._history.length && next.length) {
      this._history = next;
      storeHistory(next);
    }
  }

  private async _loadChangeCount(): Promise<void> {
    const build = parseBuildNumber(this.hass?.config.version);
    if (build === undefined) {
      this._changeCount = undefined;
      return;
    }
    this._abort?.abort();
    const controller = new AbortController();
    this._abort = controller;
    const result = await fetchChangeList(false, controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    this._changeCount = result.ok
      ? findRelease(result.data.releases, build)?.changes.length
      : undefined;
  }

  // The date in the language of the chosen mode.
  private _date(ms: number): string {
    const date = new Date(ms);
    if (Number.isNaN(date.getTime())) {
      return "";
    }
    const inLanguage = (language: string) =>
      formatDateTime(date, this._locale(language), this.hass.config);
    return formatForMode(
      inLanguage,
      this.hass.locale.language,
      this._lang.mode
    );
  }

  private _duration(ms: number): string {
    const { days, hours, minutes } = splitDuration(ms);
    if (days > 0) {
      return this._t("duration_days", { days, hours });
    }
    if (hours > 0) {
      return this._t("duration_hours", { hours, minutes });
    }
    return this._t("duration_minutes", { minutes });
  }

  private _rows = memoizeOne(
    (history: HistoryEntry[], version: string | undefined) =>
      historyRows(history, version)
  );

  private _targets = memoizeOne(
    (history: HistoryEntry[], version: string | undefined) =>
      rollbackTargets(history, version)
  );

  private _blockReason(): RollbackBlock | undefined {
    return rollbackBlockReason({
      isAdmin: !!this.hass.user?.is_admin,
      supervisorAvailable: this.supervisorAvailable,
      queueActive: this.busy,
      updateRunning: anyUpdateInProgress(this.hass.states),
      rollbackRunning: this._job?.outcome === "running",
    });
  }

  protected render(): TemplateResult {
    const version = this.hass.config.version;
    const rows = this._rows(this._history, version);
    const current = rows.find((row) => row.isCurrent);
    const earlier = rows.filter((row) => !row.isCurrent);
    const targets = new Set(this._targets(this._history, version));
    const block = this._blockReason();
    const offered = targets.size > 0;
    return html`
      <section class="panel" aria-labelledby="history-title">
        <div class="head">
          <span class="tile"
            ><ha-svg-icon .path=${mdiHistory}></ha-svg-icon
          ></span>
          <h2 id="history-title">${this._t("title")}</h2>
        </div>
        <p class="quiet">${this._t("intro")}</p>
        ${this._renderJob()} ${this._renderNotice()}
        ${
          current
            ? html`<div class="hero">
                <span class="chip">${this._t("now")}</span>
                <div class="hero-build">
                  ${
                    current.build !== undefined
                      ? this._t("build", { build: current.build })
                      : current.version
                  }
                </div>
                <div class="hero-facts">
                  <span
                    >${this._t("installed_at", {
                      time: this._date(current.installedAt),
                    })}</span
                  >
                  ${
                    this._changeCount !== undefined
                      ? html`<span
                          >${this._t(
                            this._changeCount === 1
                              ? "changes_one"
                              : "changes_many",
                            { count: this._changeCount }
                          )}</span
                        >`
                      : nothing
                  }
                </div>
              </div>`
            : nothing
        }
        <h3>${this._t("earlier")}</h3>
        ${
          earlier.length
            ? html`<ul class="rows">
                ${earlier.map((row, index) => this._renderRow(row, index, targets, block))}
              </ul>`
            : html`<p class="quiet">${this._t("none_earlier")}</p>`
        }
        ${this._renderNote(block, offered)}
      </section>
    `;
  }

  private _renderRow(
    row: ReturnType<typeof historyRows>[number],
    index: number,
    targets: ReadonlySet<string>,
    block: RollbackBlock | undefined
  ): TemplateResult {
    const label =
      row.build !== undefined
        ? this._t("build", { build: row.build })
        : row.version;
    const canGoBack = targets.has(row.version);
    return html`<li class="row" style=${styleMap({ "--i": String(index) })}>
      <div class="row-text">
        <span class="row-name">${label}</span>
        <span class="quiet"
          >${this._t("installed_at", { time: this._date(row.installedAt) })}${
            row.ranFor !== undefined
              ? ` · ${this._t("ran_for", { duration: this._duration(row.ranFor) })}`
              : ""
          }</span
        >
      </div>
      ${
        canGoBack
          ? html`<ha-button
              appearance="outlined"
              .version=${row.version}
              .disabled=${!!block}
              title=${ifDefined(block ? this._blockText(block) : undefined)}
              @click=${this._goBack}
            >
              <ha-svg-icon slot="start" .path=${mdiUndoVariant}></ha-svg-icon>
              ${this._t("go_back", { build: label })}
            </ha-button>`
          : nothing
      }
    </li>`;
  }

  private _blockText(block: RollbackBlock): string {
    return this._t(`block_${block}`);
  }

  // One line that says why there is no way back, when that is the case.
  private _renderNote(
    block: RollbackBlock | undefined,
    offered: boolean
  ): TemplateResult | typeof nothing {
    if (
      block === "not_admin" ||
      block === "no_supervisor" ||
      (block && offered)
    ) {
      if (block === "rollback_running") {
        return nothing;
      }
      return html`<p class="note">${this._blockText(block)}</p>`;
    }
    return nothing;
  }

  private _renderJob(): TemplateResult | typeof nothing {
    const job = this._job;
    if (!job) {
      return nothing;
    }
    const build = parseBuildNumber(job.version);
    const name = build !== undefined ? String(build) : job.version;
    if (job.outcome === "running") {
      return html`<div class="job" role="status" aria-live="polite">
        <ha-spinner size="small"></ha-spinner>
        <span>${this._t("job_running", { build: name })}</span>
      </div>`;
    }
    if (job.outcome === "done") {
      return html`<ha-alert alert-type="success">
        ${this._t("job_done", { build: name })}
        <ha-button slot="action" appearance="plain" @click=${this._dismissJob}>
          ${this._t("dismiss")}
        </ha-button>
      </ha-alert>`;
    }
    return html`<ha-alert alert-type="error">
      ${
        job.error
          ? this._t("job_failed_error", { build: name, error: job.error })
          : this._t("job_failed", { build: name })
      }
      <ha-button slot="action" appearance="plain" @click=${this._dismissJob}>
        ${this._t("dismiss")}
      </ha-button>
    </ha-alert>`;
  }

  private _renderNotice(): TemplateResult | typeof nothing {
    const notice = this._notice;
    if (!notice) {
      return nothing;
    }
    return html`<ha-alert
      alert-type=${notice.kind === "done" ? "success" : "warning"}
    >
      ${
        notice.kind === "done"
          ? this._t("went_back", {
              build: notice.build,
              time: this._time(notice.time),
            })
          : this._t("go_back_unfinished", { build: notice.build })
      }
      <ha-button slot="action" appearance="plain" @click=${this._dismissNotice}>
        ${this._t("dismiss")}
      </ha-button>
    </ha-alert>`;
  }

  private _dismissNotice = () => {
    this._notice = undefined;
  };

  private _dismissJob = () => {
    if (this._job && this._job.outcome !== "running") {
      // The person has seen the result; nothing is left to report later.
      storePendingGoBack(undefined);
      this._job = undefined;
    }
  };

  private async _goBack(ev: Event): Promise<void> {
    const version = (ev.currentTarget as HTMLElement & { version: string })
      .version;
    // Only a version that was really installed here and is older is offered.
    if (
      this._blockReason() ||
      !this._targets(this._history, this.hass.config.version).includes(version)
    ) {
      return;
    }
    const build = parseBuildNumber(version);
    const name = build !== undefined ? String(build) : version;
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_title", { build: name }),
      text: html`<p>${this._t("confirm_intro", { build: name })}</p>
        <p>
          ${
            this.backup
              ? this._t("confirm_backup_on")
              : this._t("confirm_backup_off")
          }
        </p>`,
      confirmText: this._t("confirm_action", { build: name }),
      dismissText: this._lang.text(this.hass.localize, "ui.common.cancel"),
      destructive: true,
    });
    // The page may have started something else while the dialog was open.
    if (!confirmed || this._blockReason()) {
      return;
    }
    // What this page can later show as evidence of the way back, even when the
    // older interface that loads next cannot record anything itself.
    const job: RollbackJob = {
      version,
      startedAt: Date.now(),
      seenInProgress: false,
      idleSince: null,
      callPending: true,
      outcome: "running",
    };
    this._job = job;
    this._notice = undefined;
    storePendingGoBack({
      version,
      startedAt: job.startedAt,
      fromVersion: this.hass.config.version,
    });
    this._startTimer();
    try {
      await installCoreVersion(this.hass, version, this.backup);
    } catch (err: any) {
      // A lost connection is what a Core restart looks like from here.
      // Any other rejection while Core restarts is judged by the result.
      const core = this.hass.states[CORE_UPDATE_ENTITY] as
        UpdateEntity | undefined;
      if (
        !isConnectionLostError(err) &&
        this.hass.connected !== false &&
        !core?.attributes.in_progress &&
        this.hass.config.version !== version
      ) {
        this._finishJob(
          job,
          "failed",
          extractApiErrorMessage(err) || undefined
        );
        return;
      }
    }
    job.callPending = false;
    this._tick();
  }

  private _startTimer(): void {
    this._stopTimer();
    this._timer = setInterval(() => this._tick(), TICK_MS);
  }

  private _stopTimer(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private _finishJob(
    job: RollbackJob,
    outcome: "done" | "failed",
    error?: string
  ): void {
    this._stopTimer();
    if (outcome === "done") {
      // The target was seen installed: keep that in the history, which
      // outlives the stored way back and is what the line is derived from.
      const next = recordVersion(this._history, job.version, Date.now());
      if (
        next !== this._history &&
        next[0]?.version !== this._history[0]?.version
      ) {
        this._history = next;
        storeHistory(next);
      }
      // This page reports the result itself; the line is not said again.
      markGoBackShown(this._history, job.version);
      // Kept as proof: the interface may reload onto the older build at once,
      // and a later page must not call a finished way back unfinished.
      storePendingGoBack({
        version: job.version,
        startedAt: job.startedAt,
        fromVersion: loadPendingGoBack()?.fromVersion,
        done: true,
        finishedAt: Date.now(),
      });
    } else {
      storePendingGoBack(undefined);
    }
    this._job = { ...job, outcome, error };
  }

  // Looks at the Core update and decides how the way back is going.
  private _tick(): void {
    const job = this._job;
    if (!job || job.outcome !== "running" || !this.hass?.states) {
      return;
    }
    const entity = this.hass.states[CORE_UPDATE_ENTITY] as
      UpdateEntity | undefined;
    // Either the running instance or the update entity shows the target.
    if (
      this.hass.config.version === job.version ||
      (!entity?.attributes.in_progress &&
        entity?.attributes.installed_version === job.version)
    ) {
      this._finishJob(job, "done");
      return;
    }
    const connected = this.hass.connected !== false;
    if (entity?.attributes.in_progress) {
      job.seenInProgress = true;
    }
    const idleNow =
      connected &&
      !!entity &&
      entity.state === "on" &&
      !entity.attributes.in_progress;
    job.idleSince = idleNow ? (job.idleSince ?? Date.now()) : null;
    const outcome = evaluateStep(
      entity,
      {
        targetVersion: job.version,
        seenInProgress: job.seenInProgress,
        startedAt: job.startedAt,
        idleSince: job.idleSince,
        role: "core",
      },
      Date.now(),
      connected,
      job.callPending
    );
    if (outcome.kind === "done") {
      this._finishJob(job, "done");
    } else if (outcome.kind === "failed") {
      this._finishJob(job, "failed");
    }
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
        .panel {
          box-sizing: border-box;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          padding: clamp(16px, 3vw, 32px);
          border-radius: calc(var(--ha-border-radius-6xl) + 4px);
          background: var(--card-background-color);
        }
        h2,
        h3,
        p,
        ul {
          margin: 0;
        }
        h2 {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: clamp(22px, 4.4vw, 44px);
          font-weight: var(--ha-font-weight-bold);
          line-height: 1.05;
          letter-spacing: -0.01em;
        }
        h3 {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-bold);
        }
        .head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .quiet {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .note {
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-2xl);
          border: 2px dashed var(--divider-color);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .hero {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-2);
          padding: var(--ha-space-6);
          border-radius: var(--ha-border-radius-6xl);
          background: color-mix(
            in srgb,
            var(--primary-color) 24%,
            var(--card-background-color)
          );
          animation: ha-pop var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
        }
        .chip {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-bold);
        }
        .hero-build {
          font-size: clamp(22px, 6vw, 56px);
          line-height: 1;
          font-weight: 800;
          font-variant-numeric: tabular-nums;
          overflow-wrap: anywhere;
        }
        .hero-facts {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-1) var(--ha-space-4);
          font-size: var(--ha-font-size-s);
        }
        .rows {
          padding: 0;
          list-style: none;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          min-height: 72px;
          padding: var(--ha-space-3) var(--ha-space-5);
          border-radius: var(--ha-border-radius-5xl);
          background: var(--secondary-background-color);
          animation: ha-rise var(--ha-animation-duration-enter, 450ms)
            var(--ha-motion-spring, ease) both;
          animation-delay: calc(var(--i, 0) * 50ms);
        }
        .row-text {
          display: flex;
          flex: 1 1 200px;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        .row-name {
          font-size: var(--ha-font-size-l);
          font-weight: var(--ha-font-weight-bold);
          font-variant-numeric: tabular-nums;
        }
        .row ha-button {
          --ha-button-height: 48px;
        }
        .job {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-2xl);
          background: var(--secondary-background-color);
        }
        ha-alert {
          display: block;
        }
        @media (prefers-reduced-motion: reduce) {
          .hero,
          .row {
            animation: none;
          }
        }
        @media (max-width: 480px) {
          .panel {
            padding: var(--ha-space-4);
          }
          .row ha-button {
            flex: 1 1 100%;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-history": HaUpdateHistory;
  }
}
