import { mdiCheck, mdiLock, mdiShieldCheckOutline } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { keyed } from "lit/directives/keyed";
import { fireEvent } from "../../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../../common/language-mode/language-mode-controller";
import { navigate } from "../../../../../common/navigate";
import "../../../../../components/ha-alert";
import "../../../../../components/ha-button";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/ha-two-key-confirm";
import { markBackupDeleteProof } from "../../../../../data/backup_delete_proof";
import { extractApiErrorMessage } from "../../../../../data/hassio/common";
import type { HomeAssistant } from "../../../../../types";
import { bytesToString } from "../../../../../util/bytes-to-string";
import type { GoBackNote } from "../update-history";
import type { DowngradeState, GoingBackView } from "./going-back-flow";
import {
  fetchDowngradeState,
  formatElapsed,
  goingBackView,
  installStarted,
  isNewDowngrade,
  requestSkipPass,
  startGoingBack,
  stopGoingBack,
} from "./going-back-flow";
import "./ha-going-back-super-confirm";

declare global {
  interface HASSDomEvents {
    /** The going back panel was closed without starting anything. */
    "going-back-close": undefined;
    /** A going back is running (the backup step) or has ended. */
    "going-back-active": { active: boolean };
    /** The backup step is over and the older build is being installed. */
    "going-back-install": {
      version: string;
      note: GoBackNote;
      startedAt: number;
    };
    /**
     * The backup is checked (or skipped by the super confirmation), so the
     * older build is about to be installed. Core may stop before this page
     * sees the install start, so the record is kept from here.
     */
    "going-back-backup-ready": {
      version: string;
      note: GoBackNote;
      startedAt: number;
    };
  }
}

const PREFIX = "ui.panel.config.updates.history";
const POLL_MS = 2000;

type Phase = "confirm" | "super" | "starting" | "backup" | "install" | "failed";

/**
 * Going back to an older Core build, from the confirmation to the moment the
 * older build is being installed: the backup that always comes first, its
 * two steps, the stop button and the red card when the backup did not
 * finish. The Supervisor enforces the rule; this panel only shows it.
 */
@customElement("ha-going-back-panel")
export class HaGoingBackPanel extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The version being gone back to. */
  @property({ attribute: false }) public version = "";

  /** The build being gone back to, as shown. */
  @property({ attribute: false }) public build = "";

  /** The build installed now, as shown. */
  @property({ attribute: false }) public currentBuild = "";

  /** Formats a time of day in the page's language mode and clock. */
  @property({ attribute: false }) public timeText: (ms: number) => string =
    () => "";

  @state() private _phase: Phase = "confirm";

  @state() private _keysTurned = false;

  @state() private _view: GoingBackView = {
    backup: "waiting",
    install: "waiting",
  };

  @state() private _now = Date.now();

  @state() private _error?: string;

  @state() private _stopping = false;

  @state() private _attempt = 0;

  /** The one-tap delete proof mark for the backup made first. */
  @state() private _proof?: "working" | "done" | { error: string };

  private _lang = new LanguageModeController(this);

  private _before?: DowngradeState | null;

  private _clickedAt = 0;

  /** When this page first saw the backup checked, after seeing it unchecked. */
  private _checkedSeenAt?: number;

  /** This page saw the backup step before it was checked. */
  private _sawUnchecked = false;

  /** The backup-ready record was sent for this run. */
  private _readySent = false;

  private _timer?: ReturnType<typeof setInterval>;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopPolling();
  }

  protected updated(changed: PropertyValues<this>): void {
    super.updated(changed);
    if (changed.has("version") && changed.get("version") !== undefined) {
      this._reset();
    }
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}.${key}`, values);
  }

  private _reset(): void {
    this._stopPolling();
    this._phase = "confirm";
    this._keysTurned = false;
    this._error = undefined;
    this._stopping = false;
    this._view = { backup: "waiting", install: "waiting" };
    this._attempt += 1;
    this._proof = undefined;
    this._resetTiming();
  }

  private _resetTiming(): void {
    this._checkedSeenAt = undefined;
    this._sawUnchecked = false;
    this._readySent = false;
  }

  /**
   * How long the backup took: from the moment going back was asked for until
   * this page saw the backup checked. Undefined when either moment is not
   * known, for example when the backup was already checked at the first look.
   */
  private _backupDuration(): number | undefined {
    if (!this._clickedAt || this._checkedSeenAt === undefined) {
      return undefined;
    }
    return Math.max(0, this._checkedSeenAt - this._clickedAt);
  }

  protected render(): TemplateResult {
    switch (this._phase) {
      case "confirm":
        return this._renderConfirm();
      case "super":
        return html`<ha-going-back-super-confirm
          .hass=${this.hass}
          .build=${this.build}
          @super-make-backup=${this._backToConfirm}
          @super-cancel=${this._cancel}
          @super-confirmed=${this._goWithoutBackup}
        ></ha-going-back-super-confirm>`;
      case "failed":
        return this._renderFailed();
      default:
        return this._renderRun();
    }
  }

  private _renderConfirm(): TemplateResult {
    return html`<section class="card" aria-labelledby="confirm-title">
      <h3 id="confirm-title">
        ${this._t("confirm_title", { build: this.build })}
      </h3>
      <p class="quiet">${this._t("confirm_intro", { build: this.build })}</p>
      <div class="facts">
        <span class="tile" aria-hidden="true"
          ><ha-svg-icon .path=${mdiShieldCheckOutline}></ha-svg-icon
        ></span>
        <div class="fact-text">
          <span class="strong">${this._t("confirm_backup_always")}</span>
          <span class="quiet">${this._t("confirm_backup_always_text")}</span>
        </div>
      </div>
      <p class="quiet">${this._t("confirm_keys")}</p>
      ${
        this._keysTurned
          ? nothing
          : keyed(
              this._attempt,
              html`<ha-two-key-confirm
                @two-key-confirmed=${this._keysDone}
              ></ha-two-key-confirm>`
            )
      }
      <button class="link" @click=${this._toSuper}>
        ${this._t("confirm_without_backup")}
      </button>
      <div class="actions">
        <ha-button appearance="outlined" @click=${this._cancel}>
          ${this._t("cancel")}
        </ha-button>
        <ha-button
          appearance="filled"
          .disabled=${!this._keysTurned}
          @click=${this._goWithBackup}
        >
          ${this._t("confirm_action")}
        </ha-button>
      </div>
    </section>`;
  }

  private _renderRun(): TemplateResult {
    const view = this._view;
    const started = view.startedAt ?? this._clickedAt;
    const elapsed = formatElapsed(this._now - started);
    const backupDone = view.backup === "done" || view.backup === "skipped";
    let backupTitle = this._t("step_backup");
    let backupText = this._t("step_backup_running_text", {
      time: this.timeText(started),
      elapsed,
    });
    if (view.backup === "waiting") {
      backupTitle = this._t("step_backup_waiting");
      backupText = this._t("step_backup_waiting_text", {
        time: this.timeText(started),
        elapsed,
      });
    } else if (view.backup === "checking") {
      backupTitle = this._t("step_backup_checking");
    } else if (view.backup === "skipped") {
      backupTitle = this._t("step_backup_skipped");
      backupText = "";
    } else if (view.backup === "done") {
      backupTitle = this._t("step_backup_done");
      const took = this._backupDuration();
      const values = {
        time: view.backupAt ? this.timeText(view.backupAt) : "",
        size: bytesToString(view.backupSize ?? 0),
      };
      backupText =
        took === undefined
          ? this._t("step_backup_done_text_no_duration", values)
          : this._t("step_backup_done_text", {
              ...values,
              elapsed: formatElapsed(took),
            });
    }
    const installing = view.install === "running";
    return html`<section class="card" aria-labelledby="run-title">
      <h3 id="run-title">${this._t("run_title", { build: this.build })}</h3>
      <p class="visually-hidden" role="status" aria-live="polite">
        ${
          installing
            ? this._t("step_going_back", { build: this.build })
            : backupTitle
        }
      </p>
      <ol class="run-steps">
        <li class=${classMap({ "run-step": true, finished: backupDone })}>
          <span
            class=${classMap({ badge: true, ok: backupDone, now: !backupDone })}
            >${
              backupDone
                ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                : "1"
            }</span
          >
          <div class="step-text">
            <span class="strong">${backupTitle}</span>
            ${
              backupText
                ? html`<span class="quiet">${backupText}</span>`
                : nothing
            }
            ${
              backupDone
                ? nothing
                : html`<span class="bar" aria-hidden="true"
                    ><span></span
                  ></span>`
            }
          </div>
        </li>
        <li class=${classMap({ "run-step": true, later: !installing })}>
          <span class=${classMap({ badge: true, now: installing })}>2</span>
          <div class="step-text">
            <span class="strong"
              >${
                installing
                  ? this._t("step_going_back", { build: this.build })
                  : this._t("step_go_back", { build: this.build })
              }</span
            >
            <span class="quiet"
              >${
                installing
                  ? this._t("step_going_back_text")
                  : this._t("step_go_back_waiting")
              }</span
            >
          </div>
        </li>
      </ol>
      ${view.backup === "done" && view.backupId ? this._renderProof() : nothing}
      ${
        this._error
          ? html`<ha-alert alert-type="warning">${this._error}</ha-alert>`
          : nothing
      }
      ${
        installing
          ? nothing
          : html`<ha-button
              appearance="outlined"
              .disabled=${this._stopping || this._phase === "starting"}
              @click=${this._stop}
            >
              ${this._stopping ? this._t("stopping") : this._t("stop")}
            </ha-button>`
      }
    </section>`;
  }

  private _renderProof(): TemplateResult {
    const proof = this._proof;
    if (proof === "done") {
      return html`<p class="proof" role="status">
        <ha-svg-icon .path=${mdiLock}></ha-svg-icon>
        <span>${this._t("delete_proof_done")}</span>
      </p>`;
    }
    return html`<div class="proof-action">
      <ha-button
        appearance="outlined"
        .disabled=${proof === "working"}
        @click=${this._markDeleteProof}
      >
        <ha-svg-icon slot="start" .path=${mdiLock}></ha-svg-icon>
        ${
          proof === "working"
            ? this._t("delete_proof_working")
            : this._t("delete_proof_button")
        }
      </ha-button>
      ${
        typeof proof === "object"
          ? html`<p class="proof failed" role="alert">
              ${this._t("delete_proof_failed", { error: proof.error })}
            </p>`
          : nothing
      }
    </div>`;
  }

  private _markDeleteProof = async () => {
    const backupId = this._view.backupId;
    if (!backupId || this._proof === "working") {
      return;
    }
    this._proof = "working";
    try {
      await markBackupDeleteProof(this.hass, backupId);
      this._proof = "done";
    } catch (err: any) {
      this._proof = {
        error: extractApiErrorMessage(err) || String(err?.message ?? err),
      };
    }
  };

  private _renderFailed(): TemplateResult {
    const reason = this._view.reason ?? "unknown";
    return html`<section class="card failed" role="alert">
      <h3>${this._t("failed_title", { build: this.build })}</h3>
      ${
        this._error
          ? html`<p>${this._error}</p>`
          : html`<p>
              ${this._t("failed_text", {
                reason: this._t(`reason_${reason}`),
                current: this.currentBuild,
              })}
            </p>`
      }
      ${
        this._view.detail
          ? html`<p class="detail">
              ${this._t("failed_detail", { detail: this._view.detail })}
            </p>`
          : nothing
      }
      <div class="actions">
        <ha-button
          appearance="outlined"
          variant="danger"
          @click=${this._openBackups}
        >
          ${this._t("open_backups")}
        </ha-button>
        <ha-button
          appearance="filled"
          variant="danger"
          @click=${this._tryAgain}
        >
          ${this._t("try_again")}
        </ha-button>
      </div>
      <ha-button appearance="plain" @click=${this._cancel}>
        ${this._t("dismiss")}
      </ha-button>
    </section>`;
  }

  private _keysDone = (ev: Event) => {
    ev.stopPropagation();
    this._keysTurned = true;
  };

  private _toSuper = () => {
    this._phase = "super";
  };

  private _backToConfirm = () => {
    this._keysTurned = false;
    this._attempt += 1;
    this._phase = "confirm";
  };

  private _cancel = () => {
    this._stopPolling();
    fireEvent(this, "going-back-active", { active: false });
    fireEvent(this, "going-back-close");
  };

  private _openBackups = () => {
    navigate("/config/backup");
  };

  private _tryAgain = () => {
    fireEvent(this, "going-back-active", { active: false });
    this._reset();
  };

  private _goWithBackup = () => {
    if (this._keysTurned) {
      this._start();
    }
  };

  private _goWithoutBackup = async () => {
    this._phase = "starting";
    this._clickedAt = Date.now();
    this._now = this._clickedAt;
    let pass: string;
    try {
      pass = await requestSkipPass(this.hass, this.version);
    } catch (err: any) {
      this._fail(
        this._t("super.pass_failed", {
          error: extractApiErrorMessage(err) || String(err?.message ?? err),
        })
      );
      return;
    }
    this._start(pass);
  };

  private async _start(pass?: string): Promise<void> {
    this._phase = "starting";
    this._error = undefined;
    // Without a pass the clock starts at the request; with one, it already
    // started when the pass was asked for.
    if (!pass) {
      this._clickedAt = Date.now();
    }
    this._now = Date.now();
    this._resetTiming();
    this._view = { backup: pass ? "skipped" : "waiting", install: "waiting" };
    fireEvent(this, "going-back-active", { active: true });
    try {
      this._before = await fetchDowngradeState(this.hass);
    } catch (_err) {
      this._before = null;
    }
    try {
      await startGoingBack(this.hass, this.version, pass);
    } catch (err: any) {
      this._fail(
        this._t("job_failed_error", {
          build: this.build,
          error: extractApiErrorMessage(err) || String(err?.message ?? err),
        })
      );
      return;
    }
    this._phase = "backup";
    this._startPolling();
    this._poll();
  }

  private _fail(error?: string): void {
    this._stopPolling();
    this._error = error;
    if (error) {
      this._view = { ...this._view, backup: "failed" };
    }
    this._phase = "failed";
    fireEvent(this, "going-back-active", { active: false });
  }

  private _startPolling(): void {
    this._stopPolling();
    this._timer = setInterval(() => this._poll(), POLL_MS);
  }

  private _stopPolling(): void {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = undefined;
    }
  }

  private async _poll(): Promise<void> {
    this._now = Date.now();
    if (this._phase !== "backup") {
      return;
    }
    let reported: DowngradeState | null;
    try {
      reported = await fetchDowngradeState(this.hass);
    } catch (_err) {
      // Core restarts while the older build is installed; the page that
      // tracks the install decides how it ends.
      return;
    }
    if (
      this._phase !== "backup" ||
      !isNewDowngrade(this._before, reported, this.version)
    ) {
      return;
    }
    const view = goingBackView(reported);
    this._view = view;
    if (view.backup === "failed") {
      this._error = undefined;
      this._fail();
      return;
    }
    if (view.backup === "done" || view.backup === "skipped") {
      if (
        view.backup === "done" &&
        this._sawUnchecked &&
        this._checkedSeenAt === undefined
      ) {
        this._checkedSeenAt = this._now;
      }
      const note: GoBackNote =
        view.backup === "skipped"
          ? { noBackup: true }
          : { backupAt: view.backupAt };
      if (!this._readySent) {
        this._readySent = true;
        fireEvent(this, "going-back-backup-ready", {
          version: this.version,
          note,
          startedAt: this._clickedAt,
        });
      }
      if (installStarted(view)) {
        this._phase = "install";
        this._stopPolling();
        fireEvent(this, "going-back-install", {
          version: this.version,
          note,
          startedAt: this._clickedAt,
        });
      }
      return;
    }
    this._sawUnchecked = true;
  }

  private _stop = async () => {
    this._stopping = true;
    try {
      await stopGoingBack(this.hass);
    } catch (err: any) {
      this._stopping = false;
      this._error = this._t("stop_failed", {
        error: extractApiErrorMessage(err) || String(err?.message ?? err),
      });
    }
  };

  static styles = css`
    :host {
      display: block;
    }
    .card {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-5) var(--ha-space-4) var(--ha-space-4);
      border-radius: var(--ha-border-radius-6xl, 28px);
      background: var(--secondary-background-color);
    }
    h3,
    p,
    ol {
      margin: 0;
    }
    h3 {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-bold);
      overflow-wrap: anywhere;
    }
    .quiet {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      overflow-wrap: anywhere;
    }
    .strong {
      font-weight: var(--ha-font-weight-medium, 500);
    }
    .proof-action {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: var(--ha-space-2);
    }
    .proof {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .proof ha-svg-icon {
      flex: none;
      --mdc-icon-size: 20px;
      color: var(--warning-color);
    }
    .proof.failed {
      color: var(--error-color);
    }
    .facts {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-2xl, 16px);
      background: var(--card-background-color);
    }
    .tile {
      flex: none;
      width: 32px;
      height: 32px;
      border-radius: 10px;
      display: grid;
      place-items: center;
      background: color-mix(
        in srgb,
        var(--success-color, #2e7d32) 22%,
        transparent
      );
      color: var(--success-color, #2e7d32);
      --mdc-icon-size: 18px;
    }
    .fact-text,
    .step-text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      flex: 1;
    }
    .link {
      align-self: flex-start;
      min-height: 44px;
      padding: 0;
      border: none;
      background: none;
      color: var(--error-color);
      font: inherit;
      font-weight: var(--ha-font-weight-bold);
      cursor: pointer;
      text-decoration: underline;
      text-underline-offset: 3px;
    }
    .link:focus-visible {
      outline: 3px solid var(--primary-color);
      outline-offset: 2px;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .actions ha-button {
      flex: 1 1 140px;
      --ha-button-height: 44px;
    }
    .run-steps {
      padding: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
    }
    .run-step {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-3);
      min-height: 52px;
      padding: var(--ha-space-2) 0;
      border-top: 1px solid var(--divider-color);
    }
    .run-step:first-child {
      border-top: none;
    }
    .run-step.later {
      opacity: 0.6;
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
      --mdc-icon-size: 14px;
    }
    .badge.now {
      box-shadow: none;
      background: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    .badge.ok {
      box-shadow: none;
      background: var(--success-color, #2e7d32);
      color: #fff;
    }
    .bar {
      display: block;
      position: relative;
      height: 4px;
      margin-top: 6px;
      border-radius: 2px;
      background: var(--divider-color);
      overflow: hidden;
    }
    .bar span {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 34%;
      border-radius: 2px;
      background: var(--primary-color);
      animation: sweep 1.6s ease-in-out infinite;
    }
    @keyframes sweep {
      from {
        left: -34%;
      }
      to {
        left: 100%;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .bar span {
        animation: none;
        left: 0;
        width: 100%;
        opacity: 0.5;
      }
    }
    .failed {
      background: color-mix(
        in srgb,
        var(--error-color) 22%,
        var(--card-background-color)
      );
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip: rect(0 0 0 0);
      white-space: nowrap;
    }
    .detail {
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-going-back-panel": HaGoingBackPanel;
  }
}
