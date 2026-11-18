import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiClose,
  mdiHarddisk,
  mdiMinusCircleOutline,
  mdiNas,
  mdiProgressClock,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import { modeText } from "../../../../../common/language-mode/language-mode";
import { isComponentLoaded } from "../../../../../common/config/is_component_loaded";
import { computeDomain } from "../../../../../common/entity/compute_domain";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-spinner";
import "../../../../../components/ha-svg-icon";
import type { BackupAgent, BackupContent } from "../../../../../data/backup";
import {
  computeBackupAgentName,
  computeBackupSize,
  isLocalAgent,
  isNetworkMountAgent,
} from "../../../../../data/backup";
import type { ManagerStateEvent } from "../../../../../data/backup_manager";
import type { HomeAssistant } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { bytesToString } from "../../../../../util/bytes-to-string";
import { findUploadFailureReason } from "../../helper/backup-log";
import type {
  LocationRow,
  RunSnapshot,
  StageRowView,
  StageState,
} from "../../helper/backup-progress";
import {
  computeOverall,
  computeStageRows,
  formatClock,
  formatDuration,
  UPLOAD_ROW_ID,
} from "../../helper/backup-progress";
import { progressText } from "../../helper/backup-progress-text";
import { summarizeSelfCheck } from "../../helper/backup-self-check";
import "./ha-backup-progress-log";

const STATE_ICONS: Record<StageState, string> = {
  waiting: mdiCircleOutline,
  running: mdiProgressClock,
  done: mdiCheckCircle,
  failed: mdiAlertCircle,
  skipped: mdiMinusCircleOutline,
};

/**
 * Detailed progress for a backup operation: a stage list with times, one row
 * for every location an upload goes to with its own bytes, speed and state,
 * the live output, and the outcome once the operation ends.
 */
@customElement("ha-backup-overview-progress")
export class HaBackupOverviewProgress extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public manager!: ManagerStateEvent;

  @property({ attribute: false }) public agents: BackupAgent[] = [];

  // Kept for pages that still pass the raw upload counters; the run below
  // already contains them
  @property({ attribute: false }) public uploadProgress: Record<
    string,
    { uploaded_bytes: number; total_bytes: number }
  > = {};

  @property({ attribute: false }) public run?: RunSnapshot;

  // Used to find the backup a finished run created
  @property({ attribute: false }) public backups: BackupContent[] = [];

  @state() private _now = Date.now();

  @state() private _announcement = "";

  @state() private _logLines: string[] = [];

  private _tick?: ReturnType<typeof setInterval>;

  private _lastAnnouncedStage?: string;

  private get _isHassio() {
    return isComponentLoaded(this.hass.config, "hassio");
  }

  private get _running() {
    return this.run?.state === "in_progress";
  }

  connectedCallback(): void {
    super.connectedCallback();
    this._startTick();
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopTick();
  }

  private _startTick() {
    if (!this._tick) {
      this._tick = setInterval(() => {
        this._now = Date.now();
      }, 1000);
    }
  }

  private _stopTick() {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = undefined;
    }
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (!changed.has("run") || !this.run) {
      return;
    }
    if (this._running) {
      this._startTick();
    } else {
      this._stopTick();
    }
    const key = `${this.run.state}:${this.run.stage ?? ""}`;
    if (key !== this._lastAnnouncedStage) {
      this._lastAnnouncedStage = key;
      const rows = computeStageRows(this.run, this._isHassio);
      const row =
        rows.find((r) => r.state === "running") ??
        rows.find((r) => r.state === "failed");
      if (row) {
        this._announcement = progressText(this.hass, "a11y.stage_changed", {
          stage: this._stageName(row.id),
          state: progressText(this.hass, `state.${row.state}`),
        });
      } else if (!this._running) {
        this._announcement = progressText(
          this.hass,
          `result.${this.run.state === "failed" ? "failed" : "success"}.${this.run.kind}`
        );
      }
    }
  }

  private _t(key: string, params?: Record<string, string | number>) {
    return progressText(this.hass, key, params);
  }

  private _stageName(rowId: string): string {
    return this._t(`stage.${this.run?.kind ?? "create"}.${rowId}`);
  }

  private _agentName(agentId: string) {
    return computeBackupAgentName(this.hass.localize, agentId, this.agents);
  }

  private _clock(ms: number) {
    return formatClock(ms, this.hass.config.time_zone);
  }

  private _renderAgentIcon(agentId: string) {
    if (isLocalAgent(agentId)) {
      return html`<ha-svg-icon .path=${mdiHarddisk}></ha-svg-icon>`;
    }
    if (isNetworkMountAgent(agentId)) {
      return html`<ha-svg-icon .path=${mdiNas}></ha-svg-icon>`;
    }
    return html`<img
      .src=${brandsUrl({
        domain: computeDomain(agentId),
        type: "icon",
        darkOptimized: this.hass.themes?.darkMode,
      })}
      crossorigin="anonymous"
      referrerpolicy="no-referrer"
      alt=""
      height="20"
    />`;
  }

  private _renderStateIcon(rowState: StageState) {
    return html`<span class="state-icon ${rowState}">
      ${
        rowState === "running"
          ? html`<ha-spinner size="tiny" class="spin"></ha-spinner>
              <ha-svg-icon
                class="still"
                .path=${STATE_ICONS.running}
              ></ha-svg-icon>`
          : html`<ha-svg-icon .path=${STATE_ICONS[rowState]}></ha-svg-icon>`
      }
    </span>`;
  }

  private _renderBar(
    name: string,
    percent: number | undefined,
    barState: StageState
  ) {
    const determinate = percent !== undefined;
    const valueText = determinate
      ? `${percent}%`
      : this._t(`state.${barState}`);
    return html`<div
      class="bar ${barState} ${determinate ? "" : "indeterminate"}"
      role="progressbar"
      aria-label=${this._t("a11y.progress", { name })}
      aria-valuemin=${determinate ? "0" : nothing}
      aria-valuemax=${determinate ? "100" : nothing}
      aria-valuenow=${determinate ? String(percent) : nothing}
      aria-valuetext=${valueText}
    >
      <div
        class="fill"
        style=${styleMap(determinate ? { width: `${percent}%` } : {})}
      ></div>
    </div>`;
  }

  private _renderLocation(location: LocationRow) {
    const name = this._agentName(location.agentId);
    const failureReason =
      location.state === "failed"
        ? findUploadFailureReason(this._logLines, location.agentId)
        : undefined;
    const figures: string[] = [];
    if (location.state === "running" && !location.reportsProgress) {
      figures.push(this._t("bytes.no_progress"));
    }
    if (location.total > 0 && location.reportsProgress) {
      figures.push(
        this._t("bytes.of", {
          done: bytesToString(location.uploaded),
          total: bytesToString(location.total),
        })
      );
    }
    if (location.bytesPerSecond) {
      figures.push(
        this._t("bytes.speed", {
          speed: bytesToString(location.bytesPerSecond),
        })
      );
    }
    if (location.etaSeconds !== undefined) {
      figures.push(
        this._t("bytes.eta", {
          time: formatDuration(location.etaSeconds * 1000),
        })
      );
    }
    const times: string[] = [
      this._t("stage.started", { time: this._clock(location.startedAt) }),
    ];
    if (location.finishedAt) {
      times.push(
        this._t("stage.took", {
          time: formatDuration(location.finishedAt - location.startedAt),
        })
      );
    }
    return html`
      <li class="location">
        <div class="location-head">
          <span class="agent-icon"
            >${this._renderAgentIcon(location.agentId)}</span
          >
          <span class="location-name">${name}</span>
          <span class="state-label ${location.state}">
            ${
              location.percent !== undefined && location.state === "running"
                ? `${location.percent}%`
                : location.state === "failed"
                  ? this._t("result.location_failed")
                  : this._t(`state.${location.state}`)
            }
          </span>
        </div>
        ${this._renderBar(name, location.percent, location.state)}
        <div class="figures">${[...figures, ...times].join(" · ")}</div>
        ${
          failureReason
            ? html`<div class="failure">
                ${this._t("result.location_error", { reason: failureReason })}
              </div>`
            : nothing
        }
      </li>
    `;
  }

  private _renderRow(row: StageRowView) {
    const times: string[] = [];
    if (row.startedAt) {
      times.push(
        this._t(row.approximate ? "stage.started_approx" : "stage.started", {
          time: this._clock(row.startedAt),
        })
      );
      const end =
        row.endedAt ?? (row.state === "running" ? this._now : undefined);
      if (end) {
        times.push(
          row.state === "running"
            ? formatDuration(end - row.startedAt)
            : this._t("stage.took", {
                time: formatDuration(end - row.startedAt),
              })
        );
      }
    }
    return html`
      <li class="stage ${row.state}">
        <div class="stage-head">
          ${this._renderStateIcon(row.state)}
          <div class="stage-text">
            <span class="stage-name">${this._stageName(row.id)}</span>
            ${
              times.length
                ? html`<span class="stage-meta">${times.join(" · ")}</span>`
                : nothing
            }
          </div>
          <span class="state-label ${row.state}">
            ${this._t(`state.${row.state}`)}
          </span>
        </div>
        ${
          row.id === UPLOAD_ROW_ID && row.locations.length
            ? html`<ul class="locations">
                ${row.locations.map((location) => this._renderLocation(location))}
              </ul>`
            : nothing
        }
      </li>
    `;
  }

  private _heading(): string {
    const run = this.run;
    if (run && !this._running) {
      return this._t(
        `result.${run.state === "failed" ? "failed" : "success"}.${run.kind}`
      );
    }
    const managerState = this.manager.manager_state;
    if (managerState === "idle" || managerState === "blocked") {
      return "";
    }
    return modeText(
      this.hass.localize as any,
      `ui.panel.config.backup.overview.progress.heading.${managerState}`
    );
  }

  private _summaryLine(): string {
    const run = this.run;
    if (!run) {
      return "";
    }
    const overall = computeOverall(run, this._isHassio, this._now);
    const parts: string[] = [];
    if (this._running) {
      if (run.stage === "upload_to_agents") {
        const names = Object.entries(run.uploads)
          .filter(
            ([, track]) => track.total === 0 || track.uploaded < track.total
          )
          .map(([agentId]) => this._agentName(agentId));
        if (names.length) {
          parts.push(
            this._t("overall.uploading_to", { names: names.join(", ") })
          );
        }
      }
      if (overall.step > 0) {
        parts.push(
          this._t("overall.step", { step: overall.step, steps: overall.steps })
        );
      }
      if (overall.uploadPercent !== undefined) {
        parts.push(
          this._t("overall.upload_percent", { percent: overall.uploadPercent })
        );
      }
    }
    parts.push(
      this._t(this._running ? "overall.elapsed" : "result.duration", {
        time: formatDuration(overall.elapsedMs),
      })
    );
    return parts.join(" · ");
  }

  private _renderResult() {
    const run = this.run;
    if (!run || this._running) {
      return nothing;
    }
    const rows = computeStageRows(run, this._isHassio);
    const failedRow = rows.find((row) => row.state === "failed");
    const created =
      run.kind === "create" && run.state === "completed"
        ? [...this.backups]
            .sort((a, b) => b.date.localeCompare(a.date))
            .find(
              (backup) =>
                new Date(backup.date).getTime() >= run.startedAt - 120000
            )
        : undefined;
    const selfCheck = created
      ? summarizeSelfCheck(created.self_check)
      : undefined;
    return html`
      <div class="result ${run.state}">
        ${
          run.state === "failed"
            ? html`
                ${
                  failedRow
                    ? html`<div>
                        ${this._t("result.failed_at", {
                          stage: this._stageName(failedRow.id),
                        })}
                      </div>`
                    : nothing
                }
                ${
                  run.reason
                    ? html`<div>
                        ${this._t("result.reason", { reason: run.reason })}
                      </div>`
                    : nothing
                }
                <div class="hint">${this._t("result.retry_hint")}</div>
              `
            : created
              ? html`
                  <div>${bytesToString(computeBackupSize(created))}</div>
                  <div class="chips" aria-label=${this._t("result.stored_in")}>
                    ${Object.keys(created.agents).map(
                      (agentId) =>
                        html`<span class="chip"
                          >${this._renderAgentIcon(agentId)}${this._agentName(agentId)}</span
                        >`
                    )}
                  </div>
                  <div class="hint">
                    ${
                      selfCheck
                        ? `${this._t("result.self_check")}: ${selfCheck.passed} / ${selfCheck.total}`
                        : this._t("result.self_check_pending")
                    }
                  </div>
                `
              : nothing
        }
      </div>
    `;
  }

  private _dismiss() {
    this.dispatchEvent(
      new CustomEvent("ha-dismiss-backup-run", {
        bubbles: true,
        composed: true,
      })
    );
  }

  private _handleLogLines(ev: CustomEvent<string[]>) {
    this._logLines = ev.detail;
  }

  protected render() {
    const run = this.run;
    if (!run) {
      return nothing;
    }
    const rows = computeStageRows(run, this._isHassio);
    const description =
      this._running && run.stage && run.kind !== "create"
        ? this.hass.localize(
            `ui.panel.config.backup.overview.progress.description.${run.kind === "restore" ? "restore_backup" : "receive_backup"}.${run.stage}` as any
          )
        : "";

    return html`
      <ha-card>
        <div class="top">
          <div class="top-text">
            <h2 class="title">${this._heading()}</h2>
            <div class="summary">${this._summaryLine()}</div>
            ${description ? html`<div class="summary">${description}</div>` : nothing}
            ${
              run.kind === "restore" && this._running
                ? html`<div class="summary">
                    ${this._t("overall.restore_note")}
                  </div>`
                : nothing
            }
          </div>
          ${
            this._running
              ? nothing
              : html`<ha-button
                  size="small"
                  appearance="plain"
                  @click=${this._dismiss}
                >
                  <ha-svg-icon slot="start" .path=${mdiClose}></ha-svg-icon>
                  ${this._t("result.dismiss")}
                </ha-button>`
          }
        </div>
        <ol class="stages">
          ${rows.map((row) => this._renderRow(row))}
        </ol>
        ${this._renderResult()}
        <ha-backup-progress-log
          .hass=${this.hass}
          .since=${run.startedAt}
          .agentIds=${Object.keys(run.uploads)}
          .running=${this._running}
          .hasSupervisor=${this._isHassio}
          @backup-log-lines=${this._handleLogLines}
        ></ha-backup-progress-log>
        <div class="sr-only" role="status" aria-live="polite">
          ${this._announcement}
        </div>
      </ha-card>
    `;
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    ha-card {
      box-sizing: border-box;
      padding: var(--ha-space-3) var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .top {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .top-text {
      min-width: 0;
    }
    .title {
      margin: 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
      overflow-wrap: anywhere;
    }
    .summary {
      margin-top: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    ol,
    ul {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .stages {
      display: flex;
      flex-direction: column;
      gap: var(--ha-list-row-gap, 6px);
    }
    .stage-head,
    .location-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 28px;
    }
    .stage-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .stage-name,
    .location-name {
      flex: 1;
      min-width: 0;
      font-size: var(--ha-list-row-title-size, 14px);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .stage-meta,
    .figures {
      font-size: var(--ha-font-size-xs);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .state-label {
      flex: none;
      font-size: var(--ha-font-size-xs);
      color: var(--secondary-text-color);
    }
    .state-label.failed {
      color: var(--error-color);
    }
    .state-label.done {
      color: var(--success-color);
    }
    .state-icon {
      flex: none;
      display: inline-flex;
      width: 20px;
      height: 20px;
      align-items: center;
      justify-content: center;
      --mdc-icon-size: 20px;
      color: var(--secondary-text-color);
    }
    .state-icon.done {
      color: var(--success-color);
    }
    .state-icon.failed {
      color: var(--error-color);
    }
    .state-icon.running {
      color: var(--primary-color);
    }
    .state-icon .still {
      display: none;
    }
    .stage.waiting .stage-name,
    .stage.skipped .stage-name {
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-normal);
    }
    .locations {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
      margin: var(--ha-space-1) 0 var(--ha-space-1) var(--ha-space-7);
    }
    .location {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .agent-icon {
      flex: none;
      display: inline-flex;
      --mdc-icon-size: 20px;
    }
    .agent-icon img {
      width: 20px;
      height: 20px;
    }
    .bar {
      height: 6px;
      border-radius: var(--ha-border-radius-pill);
      background: var(--divider-color);
      overflow: hidden;
    }
    .fill {
      height: 100%;
      border-radius: inherit;
      background: var(--primary-color);
      transition: width 0.3s ease;
    }
    .bar.done .fill {
      width: 100%;
      background: var(--success-color);
    }
    .bar.failed .fill {
      background: var(--error-color);
    }
    .bar.indeterminate.running .fill {
      width: 35%;
      animation: slide 1.6s ease-in-out infinite;
    }
    .bar.indeterminate.failed .fill,
    .bar.indeterminate.waiting .fill {
      width: 0;
    }
    @keyframes slide {
      0% {
        margin-inline-start: -35%;
      }
      100% {
        margin-inline-start: 100%;
      }
    }
    .failure {
      font-size: var(--ha-font-size-xs);
      color: var(--error-color);
      overflow-wrap: anywhere;
    }
    .result {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-lg);
      background: color-mix(
        in srgb,
        var(--success-color) 14%,
        var(--card-background-color)
      );
      font-size: var(--ha-font-size-s);
    }
    .result.failed {
      background: color-mix(
        in srgb,
        var(--error-color) 14%,
        var(--card-background-color)
      );
    }
    .hint {
      font-size: var(--ha-font-size-xs);
      color: var(--secondary-text-color);
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-1);
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--secondary-background-color);
      font-size: var(--ha-font-size-xs);
      --mdc-icon-size: 16px;
    }
    .chip img {
      width: 16px;
      height: 16px;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
    @media (prefers-reduced-motion: reduce) {
      .state-icon .spin {
        display: none;
      }
      .state-icon .still {
        display: inline-block;
      }
      .bar.indeterminate.running .fill {
        animation: none;
        width: 100%;
        opacity: 0.4;
      }
      .fill {
        transition: none;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-backup-overview-progress": HaBackupOverviewProgress;
  }
}
