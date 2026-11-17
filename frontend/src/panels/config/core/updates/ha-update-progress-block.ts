import {
  mdiAlertCircle,
  mdiCheckCircle,
  mdiCircleOutline,
  mdiMinusCircleOutline,
  mdiNewBox,
} from "@mdi/js";
import type { TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../../common/dom/fire_event";
import { formatElapsed } from "../../../../common/app-jobs/app-job-logic";
import "../../../../components/ha-button";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/progress/ha-progress-bar";
import { haStyle } from "../../../../resources/styles";
import "./ha-update-output";
import type { ProgressView } from "./update-progress-feed";
import type { StageRow, StageState } from "./update-progress-model";
import { formatClock, minutesLeft } from "./update-progress-model";
import type { ProgressText } from "./update-progress-strings";

declare global {
  interface HTMLElementTagNameMap {
    "ha-update-progress-block": HaUpdateProgressBlock;
  }
  interface HASSDomEvents {
    "update-progress-dismiss": { entityId: string };
  }
}

const STATE_ICON: Partial<Record<StageState, string>> = {
  waiting: mdiCircleOutline,
  done: mdiCheckCircle,
  failed: mdiAlertCircle,
  skipped: mdiMinusCircleOutline,
};

/**
 * The detail of one update that installs or has just ended: an overall bar
 * with a percentage only when the source gave one, the steps with a state
 * each, times, and the live output. Nothing here starts, retries or undoes an
 * update; it only shows what is reported.
 */
@customElement("ha-update-progress-block")
class HaUpdateProgressBlock extends LitElement {
  @property({ attribute: false }) public view!: ProgressView;

  @property({ attribute: false }) public text!: ProgressText;

  /** The name of the update, for labels. */
  @property() public name = "";

  /** A link to what the new version changes, when one exists. */
  @property({ attribute: false }) public notesUrl?: string;

  @state() private _now = Date.now();

  private _timer?: ReturnType<typeof setInterval>;

  public connectedCallback(): void {
    super.connectedCallback();
    this._timer = setInterval(() => {
      if (this.view?.running) {
        this._now = Date.now();
      }
    }, 1000);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    clearInterval(this._timer);
    this._timer = undefined;
  }

  protected render(): TemplateResult | typeof nothing {
    if (!this.view || !this.text) {
      return nothing;
    }
    return this.view.running ? this._renderRunning() : this._renderEnded();
  }

  private _renderRunning(): TemplateResult {
    const t = this.text;
    const { view } = this;
    const { record, percent } = view;
    const elapsed = Math.max(0, this._now - record.startedAt);
    const running = view.stages.find((row) => row.state === "running");
    return html`
      <div class="block" data-state="running">
        <div class="bar">
          ${
            percent !== undefined
              ? html`<ha-progress-bar
                  loading
                  .value=${percent}
                  aria-label=${t("bar_label", { name: this.name })}
                  aria-valuetext=${t("percent_value", { percent })}
                ></ha-progress-bar>`
              : html`<ha-progress-bar
                  indeterminate
                  aria-label=${t("bar_label", { name: this.name })}
                  aria-valuetext=${t("no_percentage")}
                ></ha-progress-bar>`
          }
          <span class="percent">
            ${percent !== undefined ? `${percent}%` : t("no_percentage")}
          </span>
        </div>
        <p class="meta">
          <span>${t("started", { time: formatClock(record.startedAt) })}</span>
          <span>${t("elapsed", { elapsed: formatElapsed(elapsed) })}</span>
          ${
            view.estimateMs !== undefined
              ? html`<span
                  >${t("estimate", {
                    minutes: minutesLeft(view.estimateMs),
                  })}</span
                >`
              : nothing
          }
        </p>
        ${this._renderStages(view.stages)}
        <div class="visually-hidden" role="status" aria-live="polite">
          ${
            running
              ? t("stage_announce", {
                  name: this.name,
                  stage: t(`stage.${running.id}`),
                })
              : ""
          }
        </div>
        ${this._renderOutput()}
      </div>
    `;
  }

  private _renderEnded(): TemplateResult {
    const t = this.text;
    const { record } = this.view;
    const duration = formatElapsed(
      (record.finishedAt ?? this._now) - record.startedAt
    );
    if (record.result === "done") {
      return html`
        <div class="block" data-state="done">
          <p class="result ok">
            <ha-svg-icon .path=${mdiCheckCircle}></ha-svg-icon>
            <span>
              ${
                record.fromVersion
                  ? t("result_done", {
                      from: record.fromVersion,
                      to: record.toVersion ?? "",
                    })
                  : t("result_done_unknown_from", {
                      to: record.toVersion ?? "",
                    })
              }
            </span>
          </p>
          <p class="meta">
            <span>${t("result_duration", { elapsed: duration })}</span>
            ${
              record.finishedAt
                ? html`<span
                    >${t("result_finished_at", {
                      time: formatClock(record.finishedAt),
                    })}</span
                  >`
                : nothing
            }
          </p>
          <div class="actions">
            ${
              this.notesUrl
                ? html`<ha-button
                    appearance="plain"
                    size="s"
                    href=${this.notesUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ha-svg-icon slot="start" .path=${mdiNewBox}></ha-svg-icon>
                    ${t("whats_new")}
                  </ha-button>`
                : nothing
            }
            <ha-button appearance="plain" size="s" @click=${this._dismiss}
              >${this.dismissLabel}</ha-button
            >
          </div>
          ${this._renderOutput()}
        </div>
      `;
    }
    const failedRow = this.view.stages.find((row) => row.state === "failed");
    return html`
      <div class="block" data-state="failed">
        <p class="result bad" role="alert">
          <ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>
          <span>${t("result_failed")}</span>
        </p>
        ${
          failedRow
            ? html`<p class="detail">
                ${t("result_failed_at", { stage: t(`stage.${failedRow.id}`) })}
              </p>`
            : nothing
        }
        <p class="detail reason">
          ${
            record.error
              ? t("result_reason", { reason: record.error })
              : t("result_reason_unknown")
          }
        </p>
        ${this._renderStages(this.view.stages)} ${this._renderOutput()}
        <div class="next">
          <strong>${t("next_steps")}</strong>
          <ul>
            <li>${t("next_retry")}</li>
            ${record.backup ? html`<li>${t("next_backup")}</li>` : nothing}
            <li>${t("next_log")}</li>
          </ul>
        </div>
        <div class="actions">
          <ha-button appearance="plain" size="s" @click=${this._dismiss}
            >${this.dismissLabel}</ha-button
          >
        </div>
      </div>
    `;
  }

  /** Text of the close button; the block borrows the label the page uses. */
  @property({ attribute: false }) public dismissLabel = "";

  private _renderStages(stages: StageRow[]): TemplateResult {
    const t = this.text;
    return html`
      <ol class="stages">
        ${stages.map(
          (row) => html`
            <li
              class=${classMap({ [row.state]: true })}
              aria-current=${row.state === "running" ? "step" : "false"}
            >
              ${
                row.state === "running"
                  ? html`<ha-spinner size="small"></ha-spinner>`
                  : html`<ha-svg-icon
                      .path=${STATE_ICON[row.state] ?? mdiCircleOutline}
                    ></ha-svg-icon>`
              }
              <span class="label">
                ${t(`stage.${row.id}`)}
                <span class="visually-hidden"
                  >, ${t(`stage_state.${row.state}`)}</span
                >
                ${
                  row.id === "backup" && row.state === "skipped"
                    ? html`<span class="note"
                        >${t("stage_note.backup_skipped")}</span
                      >`
                    : nothing
                }
                ${
                  row.id === "restart" &&
                  this.view.kind === "os" &&
                  row.state !== "skipped"
                    ? html`<span class="note"
                        >${t("stage_note.restart_os")}</span
                      >`
                    : nothing
                }
              </span>
            </li>
          `
        )}
      </ol>
    `;
  }

  private _renderOutput(): TemplateResult {
    return html`<ha-update-output
      .text=${this.text}
      .name=${this.name}
      .lines=${this.view.output.lines}
      .outputState=${this.view.output.state}
    ></ha-update-output>`;
  }

  private _dismiss(): void {
    fireEvent(this, "update-progress-dismiss", {
      entityId: this.view.record.entityId,
    });
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
        min-width: 0;
      }
      .block {
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-xl, 16px);
        background: var(--secondary-background-color);
      }
      .bar {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
      }
      ha-progress-bar {
        flex: 1 1 auto;
        min-width: 0;
      }
      .percent {
        flex: none;
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      p {
        margin: 0;
        overflow-wrap: anywhere;
      }
      .meta {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1) var(--ha-space-3);
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .stages {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
        gap: var(--ha-space-1) var(--ha-space-3);
        margin: 0;
        padding: 0;
        list-style: none;
      }
      .stages li {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 28px;
        font-size: var(--ha-font-size-s);
        color: var(--secondary-text-color);
      }
      .stages li.running {
        color: var(--primary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .stages li.done ha-svg-icon {
        color: var(--success-color);
      }
      .stages li.failed {
        color: var(--error-color);
      }
      .stages li ha-svg-icon,
      .stages li ha-spinner {
        flex: none;
        --mdc-icon-size: 18px;
        --ha-spinner-size: 18px;
        width: 18px;
        height: 18px;
      }
      .label {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .note {
        font-size: var(--ha-font-size-xs, 12px);
        font-weight: var(--ha-font-weight-normal);
        color: var(--secondary-text-color);
      }
      .result {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        font-weight: var(--ha-font-weight-medium);
      }
      .result.ok ha-svg-icon {
        color: var(--success-color);
      }
      .result.bad {
        color: var(--error-color);
      }
      .result ha-svg-icon {
        flex: none;
        --mdc-icon-size: 20px;
      }
      .detail {
        font-size: var(--ha-font-size-s);
      }
      .next {
        font-size: var(--ha-font-size-s);
      }
      .next ul {
        margin: var(--ha-space-1) 0 0;
        padding-inline-start: var(--ha-space-5);
        color: var(--secondary-text-color);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-1);
      }
      .actions ha-button {
        --ha-button-height: 40px;
      }
      .visually-hidden {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
      }
      @media (prefers-reduced-motion: reduce) {
        ha-progress-bar {
          --ha-progress-bar-indicator-highlight-image: none;
          --ha-progress-bar-animation-duration: 0s;
        }
      }
    `,
  ];
}
