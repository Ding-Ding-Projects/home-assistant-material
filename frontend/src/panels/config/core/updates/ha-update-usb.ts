import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiChevronDown,
  mdiClockOutline,
  mdiRefresh,
  mdiUsbFlashDrive,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../../../common/config/is_component_loaded";
import { fireEvent } from "../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import type { SupervisorJobData } from "../../../../common/app-jobs/app-job-logic";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/progress/ha-progress-bar";
import { extractApiErrorMessage } from "../../../../data/hassio/common";
import { fetchHassioHassOsInfo } from "../../../../data/hassio/host";
import type {
  OfflineCandidate,
  OfflineProgress,
} from "../../../../data/hassio/os-offline-update";
import {
  canInstallCandidate,
  driveName,
  fetchOfflineUpdateCandidates,
  isOfflineJob,
  megabytes,
  offlineErrorKind,
  offlineUpdateSupported,
  progressFromJob,
  startOfflineUpdate,
} from "../../../../data/hassio/os-offline-update";
import { showConfirmationDialog } from "../../../../dialogs/generic/show-dialog-box";
import { showRestartDialog } from "../../../../dialogs/restart/show-dialog-restart";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";

const PREFIX = "ui.panel.config.updates.usb";

// While a run is followed, the job list is also read now and then in case an
// event was missed. The list of files on the sticks is never read on a timer.
const JOB_POLL_MS = 4000;

declare global {
  interface HASSDomEvents {
    "usb-update-running": { running: boolean };
  }
}

interface UsbRun extends OfflineProgress {
  jobId: string;
  version: string;
}

/**
 * "Install from USB storage": install the operating system update from a file
 * on a USB stick. It shows nothing at all unless the operating system reports
 * that it can do this.
 */
@customElement("ha-update-usb")
export class HaUpdateUsb extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The name of another update that is running now, which holds this one back. */
  @property({ attribute: false }) public blockedBy?: string;

  @state() private _supported = false;

  @state() private _expanded = false;

  @state() private _scanning = false;

  @state() private _candidates?: OfflineCandidate[];

  @state() private _scanError?: string;

  @state() private _starting = false;

  @state() private _startError?: string;

  @state() private _run?: UsbRun;

  @state() private _pendingVersion?: string | null;

  private _lang = new LanguageModeController(this);

  private _unsub?: UnsubscribeFunc;

  private _pollTimer?: number;

  private _lastRunning = false;

  public connectedCallback(): void {
    super.connectedCallback();
    this._probe();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsub?.();
    this._unsub = undefined;
    window.clearInterval(this._pollTimer);
    this._pollTimer = undefined;
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    const running = this._isRunning();
    if (running !== this._lastRunning) {
      this._lastRunning = running;
      fireEvent(this, "usb-update-running", { running });
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  private _isRunning(): boolean {
    return (
      this._starting ||
      this._run?.stage === "copying" ||
      this._run?.stage === "installing"
    );
  }

  // ------------------------------------------------------------- start up

  private async _probe(): Promise<void> {
    if (
      !isComponentLoaded(this.hass.config, "hassio") ||
      !this.hass.user?.is_admin
    ) {
      return;
    }
    try {
      const info = await fetchHassioHassOsInfo(this.hass);
      this._supported = offlineUpdateSupported(info);
      this._pendingVersion = info.version_pending;
    } catch (_err) {
      // A container install has no operating system: show nothing.
      this._supported = false;
      return;
    }
    if (this._supported) {
      // Pick up a run that was started before this page was opened.
      await this._resumeRun();
    }
  }

  private async _resumeRun(): Promise<void> {
    const job = await this._findJob();
    if (job && !job.done) {
      this._follow(job.uuid, "");
    }
  }

  private async _findJob(
    uuid?: string
  ): Promise<
    (SupervisorJobData & { child_jobs?: SupervisorJobData[] }) | undefined
  > {
    try {
      const info = await this.hass.callWS<{
        jobs?: (SupervisorJobData & { child_jobs?: SupervisorJobData[] })[];
      }>({ type: "supervisor/api", endpoint: "/jobs/info", method: "get" });
      const queue = [...(info?.jobs ?? [])];
      while (queue.length) {
        const job = queue.shift()!;
        if (uuid ? job.uuid === uuid : isOfflineJob(job)) {
          return job;
        }
        queue.push(...(job.child_jobs ?? []));
      }
    } catch (_err) {
      // Without the job list the events still carry the run.
    }
    return undefined;
  }

  // ------------------------------------------------------------- scanning

  private _toggle = (): void => {
    this._expanded = !this._expanded;
    if (this._expanded && !this._candidates && !this._scanning) {
      this._scan();
    }
  };

  private _scan = async (): Promise<void> => {
    if (this._scanning || this._isRunning()) {
      return;
    }
    this._scanning = true;
    this._scanError = undefined;
    try {
      this._candidates = await fetchOfflineUpdateCandidates(this.hass);
    } catch (err: any) {
      this._candidates = undefined;
      this._scanError =
        offlineErrorKind(err) === "in_progress"
          ? this._t("scan_busy")
          : this._t("scan_failed", { error: extractApiErrorMessage(err) });
    } finally {
      this._scanning = false;
    }
  };

  // ----------------------------------------------------------- installing

  private async _install(candidate: OfflineCandidate): Promise<void> {
    if (
      this._isRunning() ||
      this.blockedBy ||
      !canInstallCandidate(candidate)
    ) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_title"),
      text: this._t("confirm_text", {
        version: candidate.version,
        drive: driveName(candidate),
      }),
      confirmText: this._t("confirm_action"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._starting = true;
    this._startError = undefined;
    this._run = undefined;
    try {
      const { job_id: jobId } = await startOfflineUpdate(this.hass, candidate);
      this._follow(jobId, candidate.version);
    } catch (err: any) {
      const kind = offlineErrorKind(err);
      this._startError =
        kind === "other"
          ? this._t("error_other", { error: extractApiErrorMessage(err) })
          : this._t(`error_${kind}`);
    } finally {
      this._starting = false;
    }
  }

  private _onInstall = (ev: Event): void => {
    const candidate = (
      ev.currentTarget as HTMLElement & {
        candidate: OfflineCandidate;
      }
    ).candidate;
    this._install(candidate);
  };

  private _follow(jobId: string, version: string): void {
    this._unsub?.();
    this._unsub = undefined;
    window.clearInterval(this._pollTimer);
    this._run = { jobId, version, stage: "copying", percent: 0 };
    this.hass.connection
      .subscribeMessage<{ event?: string; data?: SupervisorJobData }>(
        (message) => {
          if (message?.event === "job" && message.data) {
            this._applyJob(message.data);
          }
        },
        { type: "supervisor/subscribe" }
      )
      .then(
        (unsub) => {
          if (this._run?.jobId === jobId && this._isRunning()) {
            this._unsub = unsub;
          } else {
            unsub();
          }
        },
        () => {
          // Not an administrator: the job list below still reports it.
        }
      );
    this._pollTimer = window.setInterval(() => this._pollJob(), JOB_POLL_MS);
    this._pollJob();
  }

  private async _pollJob(): Promise<void> {
    const run = this._run;
    if (!run) {
      return;
    }
    const job = await this._findJob(run.jobId);
    if (job) {
      this._applyJob(job);
    }
  }

  private _applyJob(job: SupervisorJobData): void {
    const run = this._run;
    if (!run || (job.uuid !== run.jobId && !isOfflineJob(job))) {
      return;
    }
    // A stale event must never move the bar backwards.
    const next = progressFromJob(job);
    const finished = next.stage === "done" || next.stage === "failed";
    this._run = {
      ...run,
      jobId: job.uuid || run.jobId,
      stage: next.stage,
      percent: finished ? next.percent : Math.max(run.percent, next.percent),
      message: next.message,
    };
    if (finished) {
      this._unsub?.();
      this._unsub = undefined;
      window.clearInterval(this._pollTimer);
      this._pollTimer = undefined;
      if (next.stage === "done") {
        this._refreshPending();
      }
    }
  }

  private async _refreshPending(): Promise<void> {
    try {
      const info = await fetchHassioHassOsInfo(this.hass);
      this._pendingVersion = info.version_pending;
    } catch (_err) {
      // The version is only a detail of the message.
    }
  }

  private _restart = (): void => {
    showRestartDialog(this);
  };

  private _dismiss = (): void => {
    this._run = undefined;
    this._scan();
  };

  // --------------------------------------------------------------- render

  protected render(): TemplateResult | typeof nothing {
    if (!this._supported) {
      return nothing;
    }
    const running = this._isRunning();
    return html`
      <section class="card" aria-labelledby="usb-title">
        <h2 id="usb-title">
          <button
            type="button"
            class="head"
            aria-expanded=${this._expanded ? "true" : "false"}
            aria-controls="usb-body"
            @click=${this._toggle}
          >
            <span class="tile"
              ><ha-svg-icon .path=${mdiUsbFlashDrive}></ha-svg-icon
            ></span>
            <span class="head-text">
              <span class="title">${this._t("title")}</span>
              ${
                this._expanded
                  ? nothing
                  : html`<span class="sub">${this._t("intro")}</span>`
              }
            </span>
            <ha-svg-icon
              class="chevron ${classMap({ open: this._expanded })}"
              .path=${mdiChevronDown}
            ></ha-svg-icon>
          </button>
        </h2>
        ${
          this._expanded || running || this._run
            ? html`<div class="body" id="usb-body">
                <p class="intro">${this._t("intro")}</p>
                ${this._renderRun()}
                ${
                  this._run
                    ? nothing
                    : html`
                        ${
                          this._startError
                            ? html`<ha-alert alert-type="error"
                                >${this._startError}</ha-alert
                              >`
                            : nothing
                        }
                        <div class="actions">
                          <ha-button
                            appearance="filled"
                            .disabled=${this._scanning || running}
                            @click=${this._scan}
                          >
                            <ha-svg-icon
                              slot="start"
                              .path=${mdiRefresh}
                            ></ha-svg-icon>
                            ${
                              this._candidates
                                ? this._t("look_again")
                                : this._t("look")
                            }
                          </ha-button>
                          ${
                            this._scanning
                              ? html`<span class="looking" role="status">
                                  <ha-spinner size="small"></ha-spinner>
                                  ${this._t("looking")}
                                </span>`
                              : nothing
                          }
                        </div>
                        ${
                          this._scanError
                            ? html`<ha-alert alert-type="warning"
                                >${this._scanError}</ha-alert
                              >`
                            : nothing
                        }
                        ${this._renderCandidates()}
                      `
                }
              </div>`
            : nothing
        }
      </section>
    `;
  }

  private _renderCandidates(): TemplateResult | typeof nothing {
    const list = this._candidates;
    if (!list || this._scanning) {
      return nothing;
    }
    if (!list.length) {
      return html`<div class="empty">
        <strong>${this._t("empty_title")}</strong>
        <span
          >${this._t("empty_text", { name: "haos_<device>-<version>.raucb" })}</span
        >
      </div>`;
    }
    return html`
      <p class="count" role="status">
        ${this._t("found_count", { count: list.length })}
      </p>
      <ul class="files">
        ${list.map((candidate) => this._renderCandidate(candidate))}
      </ul>
    `;
  }

  private _renderCandidate(candidate: OfflineCandidate): TemplateResult {
    const ok = canInstallCandidate(candidate);
    const blocked = !!this.blockedBy;
    return html`
      <li class="file ${classMap({ ok, bad: !ok })}">
        <div class="file-main">
          <span class="file-name">${candidate.filename}</span>
          <span class="file-meta">
            ${driveName(candidate)}
            ${
              candidate.version
                ? html`·
                  ${this._t("file_version", { version: candidate.version })}`
                : nothing
            }
            · ${this._t("file_size", { size: megabytes(candidate.size) })}
          </span>
          <span class="verdict">
            <ha-svg-icon
              .path=${ok ? mdiCheckCircle : mdiAlertCircle}
            ></ha-svg-icon>
            <strong>${this._t(`verdict_${candidate.verdict}`)}</strong>
          </span>
          <span class="file-meta">${this._t(`hint_${candidate.verdict}`)}</span>
        </div>
        ${
          ok
            ? html`<div class="file-action">
                <ha-button
                  appearance="accent"
                  .candidate=${candidate}
                  .disabled=${blocked || this._isRunning()}
                  @click=${this._onInstall}
                >
                  ${this._t("install")}
                </ha-button>
                ${
                  blocked
                    ? html`<span class="file-meta"
                        >${this._t("blocked_other", {
                          name: this.blockedBy!,
                        })}</span
                      >`
                    : nothing
                }
              </div>`
            : nothing
        }
      </li>
    `;
  }

  private _renderRun(): TemplateResult | typeof nothing {
    const run = this._run;
    if (!run) {
      return this._starting
        ? html`<div class="looking" role="status">
            <ha-spinner size="small"></ha-spinner>
            ${this._t("starting")}
          </div>`
        : nothing;
    }
    if (run.stage === "done") {
      const version = this._pendingVersion || run.version;
      return html`
        <div class="result ok" role="status">
          <ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>
          <div>
            <h3>${this._t("success_title")}</h3>
            <p>
              ${
                version
                  ? this._t("success_text", { version })
                  : this._t("success_text_plain")
              }
            </p>
          </div>
        </div>
        <div class="actions">
          <ha-button appearance="filled" @click=${this._restart}>
            ${this._t("restart")}
          </ha-button>
          <ha-button appearance="plain" @click=${this._dismiss}>
            ${this._t("done")}
          </ha-button>
        </div>
      `;
    }
    if (run.stage === "failed") {
      return html`
        <div class="result bad" role="alert">
          <ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>
          <div>
            <h3>${this._t("failed_title")}</h3>
            <p>${run.message || this._t("failed_unknown")}</p>
          </div>
        </div>
        <div class="actions">
          <ha-button appearance="filled" @click=${this._dismiss}>
            ${this._t("look_again")}
          </ha-button>
        </div>
      `;
    }
    const copying = run.stage === "copying";
    const label = copying
      ? this._t("stage_copying")
      : this._t("stage_installing");
    return html`
      <div class="progress" role="status">
        <div class="progress-head">
          <ha-svg-icon .path=${mdiClockOutline}></ha-svg-icon>
          <strong>${label}</strong>
          <span class="percent"
            >${this._t("progress_text", { percent: run.percent })}</span
          >
        </div>
        <ha-progress-bar
          .value=${run.percent}
          .label=${`${this._t("progress_label")}: ${label}`}
        ></ha-progress-bar>
        <ol class="steps" aria-hidden="true">
          <li class=${classMap({ on: copying, past: !copying })}>
            ${this._t("stage_copying")}
          </li>
          <li class=${classMap({ on: !copying })}>
            ${this._t("stage_installing")}
          </li>
        </ol>
        <p class="file-meta">
          ${copying ? this._t("do_not_remove") : this._t("remove_note")}
        </p>
      </div>
    `;
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
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: calc(var(--ha-border-radius-6xl) + 4px);
          background: var(--card-background-color);
        }
        button {
          font: inherit;
          color: inherit;
          text-align: start;
          background: none;
          border: none;
          cursor: pointer;
        }
        button:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          width: 100%;
          min-height: 64px;
          padding: var(--ha-space-2);
          border-radius: var(--ha-border-radius-5xl);
        }
        .head-text {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        h2 {
          margin: 0;
          font-size: inherit;
        }
        .title {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-bold);
        }
        h3 {
          margin: 0 0 var(--ha-space-1);
          font-size: var(--ha-font-size-l);
        }
        p {
          margin: 0;
        }
        .sub,
        .file-meta,
        .count {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .tile {
          display: flex;
          flex: none;
          align-items: center;
          justify-content: center;
          width: 48px;
          height: 48px;
          border-radius: var(--ha-border-radius-3xl);
          background: color-mix(
            in srgb,
            var(--primary-color) 24%,
            var(--card-background-color)
          );
          color: var(--primary-text-color);
        }
        .chevron {
          flex: none;
          color: var(--secondary-text-color);
          transition: transform var(--ha-animation-duration-normal, 250ms)
            var(--ha-motion-spring, ease);
        }
        .chevron.open {
          transform: rotate(180deg);
        }
        .body {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          padding: var(--ha-space-2) var(--ha-space-2) var(--ha-space-3);
        }
        .intro {
          line-height: var(--ha-line-height-normal);
          max-width: 64ch;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }
        ha-button {
          --ha-button-height: 52px;
        }
        .looking {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          color: var(--secondary-text-color);
        }
        .empty {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-4xl);
          border: 2px dashed var(--divider-color);
          overflow-wrap: anywhere;
        }
        .files {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-3);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .file {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-4xl);
          background: var(--secondary-background-color);
        }
        .file.ok {
          background: color-mix(
            in srgb,
            var(--success-color) 16%,
            var(--card-background-color)
          );
        }
        .file-main {
          display: flex;
          flex: 1 1 220px;
          flex-direction: column;
          gap: var(--ha-space-1);
          min-width: 0;
        }
        .file-name {
          font-family: var(--ha-font-family-code, monospace);
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .verdict {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .file.ok .verdict {
          color: var(--success-color);
        }
        .file.bad .verdict {
          color: var(--warning-color, var(--secondary-text-color));
        }
        .verdict ha-svg-icon {
          --mdc-icon-size: 20px;
          flex: none;
        }
        .file-action {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: var(--ha-space-1);
        }
        .progress {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-5xl);
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--card-background-color)
          );
        }
        .progress-head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .percent {
          margin-inline-start: auto;
          font-variant-numeric: tabular-nums;
          font-weight: var(--ha-font-weight-bold);
        }
        ha-progress-bar {
          --ha-progress-bar-track-height: 14px;
          --ha-progress-bar-indicator-color: var(--primary-color);
        }
        .steps {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .steps li {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          border: 1px dashed var(--divider-color);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .steps li.on {
          border: 1px solid var(--primary-color);
          color: var(--primary-text-color);
          font-weight: var(--ha-font-weight-bold);
        }
        .steps li.past {
          border-style: solid;
          color: var(--success-color);
        }
        .result {
          display: flex;
          align-items: flex-start;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-5xl);
        }
        .result ha-svg-icon {
          --mdc-icon-size: 32px;
          flex: none;
        }
        .result.ok {
          background: color-mix(
            in srgb,
            var(--success-color) 22%,
            var(--card-background-color)
          );
        }
        .result.bad {
          background: color-mix(
            in srgb,
            var(--error-color) 18%,
            var(--card-background-color)
          );
        }
        .result.bad ha-svg-icon {
          color: var(--error-color);
        }
        @media (prefers-reduced-motion: reduce) {
          .chevron {
            transition: none;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-usb": HaUpdateUsb;
  }
}
