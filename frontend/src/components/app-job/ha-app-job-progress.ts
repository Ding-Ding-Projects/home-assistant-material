import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import type { AppJobView } from "../../common/app-jobs/app-job-logic";
import {
  deriveAppJobView,
  formatElapsed,
} from "../../common/app-jobs/app-job-logic";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../common/translations/localize";
import type { AppJobSnapshot } from "../../data/hassio/app-job-tracker";
import {
  appJobTracker,
  isAppJobVisible,
} from "../../data/hassio/app-job-tracker";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { haStyle } from "../../resources/styles";
import { showToast } from "../../util/toast";
import "../ha-alert";
import "../ha-app-icon";
import "../ha-button";
import "../log-terminal/ha-log-terminal";

/** The newest lines of the run's log that Copy details adds. */
const DETAIL_LINES = 20;

declare global {
  interface HTMLElementTagNameMap {
    "ha-app-job-progress": HaAppJobProgress;
  }
}

/**
 * The progress of one app install, update, rebuild or uninstall: the bar, the
 * steps, the time passed, how it ended, and the log terminal. It shows
 * nothing while the app has no run to show. The run is followed by
 * `appJobTracker`, so leaving the page and coming back shows it again.
 *
 * The numbers are the Supervisor's own. A percentage appears only when the
 * Supervisor reported one.
 */
@customElement("ha-app-job-progress")
export class HaAppJobProgress extends LitElement {
  @property() public slug = "";

  /** Only the bar and the step in words, for a card in a list. */
  @property({ type: Boolean }) public compact = false;

  /** Shows the log terminal under the steps. */
  @property({ type: Boolean }) public terminal = false;

  /** Keep a finished run on show until it is dismissed. */
  @property({ type: Boolean, attribute: "keep-finished" }) public keepFinished =
    false;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _snapshot?: AppJobSnapshot;

  @state() private _now = Date.now();

  private _lang = new LanguageModeController(this);

  private _unsubscribe?: () => void;

  private _tick?: ReturnType<typeof setInterval>;

  private _releaseLog?: () => void;

  private _watchedStart?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._unsubscribe = appJobTracker.subscribe(() => this._sync());
    this._sync();
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._stopTick();
    this._releaseLog?.();
    this._releaseLog = undefined;
    this._watchedStart = undefined;
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("slug")) {
      this._sync();
    }
    // An empty element would still take its gap in a flex column.
    this.hidden = !this._shown();
  }

  private _shown(): boolean {
    const snapshot = this._snapshot;
    return (
      !!snapshot && (this.keepFinished || isAppJobVisible(snapshot, this._now))
    );
  }

  private _sync(): void {
    const snapshot = this.slug ? appJobTracker.get(this.slug) : undefined;
    this._snapshot = snapshot;
    this._now = Date.now();
    const running = !!snapshot && !snapshot.run.done;
    if (running && !this._tick) {
      this._tick = setInterval(() => {
        this._now = Date.now();
      }, 1000);
    } else if (!running) {
      this._stopTick();
    }
    this._followLog(snapshot);
  }

  private _stopTick(): void {
    if (this._tick) {
      clearInterval(this._tick);
      this._tick = undefined;
    }
  }

  // The app's own log is read only while this view shows the terminal.
  private _followLog(snapshot: AppJobSnapshot | undefined): void {
    const wanted = !!snapshot && this.terminal && !this.compact;
    if (!wanted) {
      this._releaseLog?.();
      this._releaseLog = undefined;
      this._watchedStart = undefined;
      return;
    }
    if (this._watchedStart !== snapshot!.run.startedAt) {
      this._releaseLog?.();
      this._watchedStart = snapshot!.run.startedAt;
      this._releaseLog = appJobTracker.watchAppLog(this.slug);
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this._localize as never,
      `ui.app_job.${key}`,
      values
    );
  }

  protected render(): TemplateResult | typeof nothing {
    const snapshot = this._snapshot;
    if (!snapshot || !this._shown()) {
      return nothing;
    }
    const view = deriveAppJobView(snapshot.run, this._now);
    return this.compact
      ? this._renderCompact(snapshot, view)
      : this._renderFull(snapshot, view);
  }

  private _phaseText(snapshot: AppJobSnapshot, view: AppJobView): string {
    if (view.end === "done") {
      return this._l(`done.${snapshot.run.kind}`, { name: snapshot.name });
    }
    if (view.end === "failed") {
      return this._l("phase.failed");
    }
    return this._l(`phase.${view.phase}`);
  }

  private _renderBar(
    snapshot: AppJobSnapshot,
    view: AppJobView
  ): TemplateResult {
    const percent = view.end === "done" ? 100 : view.percent;
    const label = this._l("progress_label", { name: snapshot.name });
    return html`<div
      class=${classMap({
        bar: true,
        unknown: percent === undefined,
        failed: view.end === "failed",
      })}
      role="progressbar"
      aria-label=${label}
      aria-valuemin="0"
      aria-valuemax="100"
      aria-valuenow=${percent ?? nothing}
      aria-valuetext=${
        percent === undefined
          ? this._l("working_no_percent")
          : this._l("percent", { percent })
      }
    >
      <span
        class="fill"
        style=${styleMap({
          width: percent === undefined ? "" : `${percent}%`,
        })}
      ></span>
    </div>`;
  }

  private _renderCompact(
    snapshot: AppJobSnapshot,
    view: AppJobView
  ): TemplateResult {
    const percent = view.end === "done" ? 100 : view.percent;
    return html`<div class="compact">
      ${this._renderBar(snapshot, view)}
      <p class="phase-line">
        <span role="status" aria-live="polite" class="phase"
          >${this._phaseText(snapshot, view)}</span
        >${
          percent !== undefined && view.end === "running"
            ? html` <span class="percent">${percent}%</span>`
            : nothing
        }
      </p>
    </div>`;
  }

  private _renderFull(
    snapshot: AppJobSnapshot,
    view: AppJobView
  ): TemplateResult {
    const { run } = snapshot;
    const title = this._l(`title.${run.kind}`, { name: snapshot.name });
    return html`<section class="card" aria-label=${title}>
      <div class="head">
        <ha-app-icon
          .slug=${run.slug}
          .hasIcon=${snapshot.hasIcon}
          .alt=${snapshot.name}
        ></ha-app-icon>
        <h3>${title}</h3>
      </div>
      <p class="status">
        <span role="status" aria-live="polite" class="phase"
          >${this._phaseText(snapshot, view)}</span
        >${
          view.percent !== undefined && view.end === "running"
            ? html` <span class="percent">${view.percent}%</span>`
            : nothing
        }
      </p>
      ${this._renderBar(snapshot, view)}
      ${
        view.unknownStage
          ? html`<p class="note">
              ${this._l("stage_reported", { stage: view.unknownStage })}
            </p>`
          : nothing
      }
      ${
        view.steps.length
          ? html`<ol class="steps">
              ${view.steps.map(
                (step) =>
                  html`<li
                    class=${classMap({
                      [step.state]: true,
                      broke: view.failedStep === step.id,
                    })}
                    aria-current=${step.state === "current" ? "step" : "false"}
                  >
                    <span class="marker" aria-hidden="true"
                      >${
                        step.state === "done"
                          ? "✓"
                          : view.failedStep === step.id
                            ? "!"
                            : view.steps.indexOf(step) + 1
                      }</span
                    >
                    <span class="label"
                      >${this._l(`step.${step.id}`)}<span
                        class="visually-hidden"
                      >
                        ${
                          view.failedStep === step.id
                            ? this._l("step_state.failed")
                            : this._l(`step_state.${step.state}`)
                        }</span
                      ></span
                    >
                  </li>`
              )}
            </ol>`
          : nothing
      }
      <p class="elapsed">
        ${this._l("elapsed", { time: formatElapsed(view.elapsedMs) })}
      </p>
      ${
        view.end === "failed"
          ? html`<ha-alert
              alert-type="error"
              .title=${this._l("failed_heading", { name: snapshot.name })}
            >
              ${
                view.failedStep
                  ? html`<p class="broke-at">
                      ${this._l("failed_at", {
                        step: this._l(`step.${view.failedStep}`),
                      })}
                    </p>`
                  : nothing
              }
              ${view.errorMessage ?? this._l("failed_unknown")}
            </ha-alert>`
          : nothing
      }
      ${
        view.end === "running"
          ? html`<p class="note">${this._l("keep_open_note")}</p>`
          : html`${
                view.end === "failed" && snapshot.canRetry
                  ? html`<p class="note">${this._l("start_again_note")}</p>`
                  : nothing
              }
              <div class="actions">
                ${
                  view.end === "failed" && snapshot.canRetry
                    ? html`<ha-button @click=${this._retry}
                        >${this._l("start_again")}</ha-button
                      >`
                    : nothing
                }
                ${
                  view.end === "failed"
                    ? html`<ha-button
                        appearance="filled"
                        variant="neutral"
                        @click=${this._copyDetails}
                        >${this._l("copy_details")}</ha-button
                      >`
                    : nothing
                }
                <ha-button appearance="plain" @click=${this._dismiss}
                  >${this._l("dismiss")}</ha-button
                >
              </div>`
      }
      ${
        this.terminal
          ? html`<div class="terminal">
              <ha-log-terminal
                .lines=${snapshot.buffer.lines}
                .dropped=${snapshot.buffer.dropped}
                .name=${snapshot.name}
              ></ha-log-terminal>
            </div>`
          : nothing
      }
    </section>`;
  }

  private _dismiss(): void {
    appJobTracker.dismiss(this.slug);
  }

  private _retry(): void {
    void appJobTracker.retry(this.slug);
  }

  /** The facts of a failed run as plain text, for a message to someone else. */
  private async _copyDetails(): Promise<void> {
    const snapshot = this._snapshot;
    if (!snapshot) {
      return;
    }
    const { run } = snapshot;
    const view = deriveAppJobView(run, this._now);
    const recent = snapshot.buffer.lines
      .slice(-DETAIL_LINES)
      .map((line) => line.text);
    const text = [
      this._l(`title.${run.kind}`, { name: snapshot.name }),
      `${this._l("detail_app")}: ${run.slug}`,
      `${this._l("detail_started")}: ${new Date(run.startedAt).toISOString()}`,
      view.failedStep
        ? `${this._l("detail_step")}: ${this._l(`step.${view.failedStep}`)}`
        : undefined,
      `${this._l("detail_message")}: ${view.errorMessage ?? this._l("failed_unknown")}`,
      `${this._l("elapsed", { time: formatElapsed(view.elapsedMs) })}`,
      recent.length ? `${this._l("detail_log")}:` : undefined,
      ...recent,
    ]
      .filter((line): line is string => line !== undefined)
      .join("\n");
    await copyToClipboard(text, this);
    showToast(this, { message: this._l("details_copied") });
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
        min-width: 0;
        max-width: 100%;
      }
      :host([hidden]) {
        display: none;
      }
      .card {
        box-sizing: border-box;
        max-width: 100%;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .head {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        min-width: 0;
      }
      ha-app-icon {
        --ha-app-icon-size: 40px;
        flex: none;
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-l);
        overflow-wrap: anywhere;
        min-width: 0;
      }
      p {
        margin: var(--ha-space-2) 0 0;
        overflow-wrap: anywhere;
      }
      .phase {
        font-weight: var(--ha-font-weight-medium);
      }
      .percent {
        color: var(--secondary-text-color);
      }
      .elapsed,
      .note {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .bar {
        position: relative;
        height: 8px;
        margin-top: var(--ha-space-2);
        border-radius: 4px;
        background: var(--divider-color);
        overflow: hidden;
      }
      .fill {
        display: block;
        height: 100%;
        background: var(--primary-color);
        transition: width 0.25s linear;
      }
      .bar.failed .fill {
        background: var(--error-color);
      }
      .bar.unknown .fill {
        width: 40%;
        animation: slide 1.4s ease-in-out infinite;
      }
      @keyframes slide {
        from {
          margin-inline-start: -40%;
        }
        to {
          margin-inline-start: 100%;
        }
      }
      @media (prefers-reduced-motion: reduce) {
        .fill {
          transition: none;
        }
        .bar.unknown .fill {
          animation: none;
          width: 100%;
          opacity: 0.4;
        }
      }
      .compact .phase-line {
        margin-top: var(--ha-space-1);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .steps {
        list-style: none;
        margin: var(--ha-space-3) 0 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .steps li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 40px;
        padding: 0 var(--ha-space-3);
        border-radius: 999px;
        background: var(--ha-color-surface-tone-2, var(--divider-color));
        color: var(--secondary-text-color);
      }
      .steps li.done {
        background: var(--ha-color-success-container, var(--divider-color));
        color: var(--ha-color-on-success-container, inherit);
      }
      .steps li.current {
        background: var(--ha-color-primary-container);
        color: var(--ha-color-on-primary-container);
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .steps li.broke {
        background: var(--ha-color-error-container, var(--divider-color));
        color: var(--ha-color-on-error-container, inherit);
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .marker {
        display: grid;
        place-items: center;
        flex: none;
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: var(--card-background-color);
        font-size: var(--ha-font-size-s, 0.8125rem);
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .broke-at {
        margin: 0 0 var(--ha-space-1);
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      ha-alert {
        display: block;
        margin-top: var(--ha-space-3);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        margin-top: var(--ha-space-2);
      }
      .actions ha-button {
        min-height: 44px;
      }
      .terminal {
        margin-top: var(--ha-space-3);
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
    `,
  ];
}
