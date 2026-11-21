import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { searchCountText } from "../../../components/ha-top-bar-search";
import { searchMatcher } from "../../../common/regex/filter";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/chips/ha-filter-chip";
import type {
  ProblemLogOverview,
  RecordedProblem,
} from "../../../data/problem_log";
import { fetchProblemLog } from "../../../data/problem_log";
import type { ProblemSendState } from "../../../data/problem_log_send";
import {
  fetchProblemSendState,
  holdProblem,
} from "../../../data/problem_log_send";
import "./ha-problem-log-send";
import type { ProblemChip } from "./problem-log-send-logic";
import { chipCounts, matchesChip, statusOf } from "./problem-log-send-logic";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LocalizeFunc } from "../../../common/translations/localize";

@customElement("ha-config-problem-log")
class HaConfigProblemLog extends LitElement {
  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // The page's strings in the chosen language mode, where they have Cantonese.
  private get _modeLocalize(): LocalizeFunc {
    return this._lang.cachedLocalizer(this.hass.localize);
  }

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _overview?: ProblemLogOverview;

  @state() private _error?: string;

  @state() private _filter = "";

  @state() private _send?: ProblemSendState;

  @state() private _chip: ProblemChip = "all";

  // Opened from the search as /config/problem-log#send.
  @state() private _openSend = false;

  protected firstUpdated(): void {
    this._openSend = window.location.hash === "#send";
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._overview = await fetchProblemLog(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    try {
      this._send = await fetchProblemSendState(this.hass);
    } catch (_err) {
      // Without sending, the page still lists what was recorded.
      this._send = undefined;
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this._modeLocalize(
      `ui.panel.config.problem_log.${key}` as any,
      values
    );
  }

  // A recorded time in the person's own date and time format; a value that
  // is not a time is shown as it was recorded.
  private _when(value: string | undefined): string {
    if (!value) {
      return "";
    }
    const date = new Date(value);
    return Number.isNaN(date.getTime())
      ? value
      : formatDateTime(date, this.hass.locale, this.hass.config);
  }

  private _filterChanged(ev: CustomEvent<{ value: string }>): void {
    this._filter = ev.detail.value;
  }

  private _shown(): RecordedProblem[] {
    const matches = searchMatcher(this._filter);
    const statuses = this._send?.statuses;
    return (this._overview?.problems ?? []).filter(
      (problem) =>
        matchesChip(problem.file, statuses, this._chip) &&
        matches(problem.title, problem.logger, problem.level, problem.detail)
    );
  }

  protected render(): TemplateResult {
    const overview = this._overview;
    const total = overview?.problems.length ?? 0;
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/system"
        .header=${this._l("title")}
        searchable
        .searchLabel=${this._l("search", { count: total })}
        .searchValue=${this._filter}
        .searchCountText=${
          this._filter.trim() !== ""
            ? searchCountText(this._modeLocalize, {
                current: this._shown().length,
                total,
              })
            : undefined
        }
        .searchSamples=${overview?.problems.map((item) => item.title)}
        @top-bar-search-input=${this._filterChanged}
      >
        <div class="content">${this._renderBody()}</div>
      </hass-subpage>
    `;
  }

  private _renderBody(): TemplateResult {
    if (this._error) {
      return html`<ha-alert alert-type="error">${this._error}</ha-alert>`;
    }
    const overview = this._overview;
    if (!overview) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    const shown = this._shown();
    const total = overview.problems.length;
    const searching = this._filter.trim() !== "";
    return html`
      <ha-alert alert-type="info"
        >${
          this._send?.enabled ? this._l("sending_on") : this._l("nothing_sent")
        }</ha-alert
      >
      ${this._renderSend("status")}
      <p class="note">
        ${this._l("location", { path: overview.path })}
        ${
          overview.git_available
            ? overview.has_remote
              ? this._l("remote_set")
              : this._l("remote_none")
            : this._l("git_missing")
        }
      </p>
      <div class="toolbar">
        <ha-button appearance="plain" @click=${this._load}
          >${this._l("refresh")}</ha-button
        >
      </div>
      ${this._send ? this._renderChips(overview.problems) : nothing}
      ${
        searching
          ? html`<p class="note" role="status">
              ${this._l("matches", { count: shown.length, total })}
            </p>`
          : nothing
      }
      ${
        shown.length
          ? html`<ul class="problems">
              ${shown.map((problem) => this._renderProblem(problem))}
            </ul>`
          : html`<p class="note" role="status">
              ${total ? this._l("empty_search") : this._l("empty")}
            </p>`
      }
      ${this._renderSend("actions")}
    `;
  }

  private _renderSend(section: "status" | "actions") {
    if (!this._send) {
      return nothing;
    }
    return html`<ha-problem-log-send
      .section=${section}
      .openSettings=${section === "status" && this._openSend}
      .hass=${this.hass}
      .localize=${this._modeLocalize}
      .sendState=${this._send}
      @problem-send-state=${this._sendStateChanged}
    ></ha-problem-log-send>`;
  }

  private _sendStateChanged(ev: CustomEvent<ProblemSendState>): void {
    this._send = ev.detail;
  }

  private _renderChips(problems: RecordedProblem[]): TemplateResult {
    const counts = chipCounts(
      problems.map((problem) => problem.file),
      this._send?.statuses
    );
    const chips: { chip: ProblemChip; label: string }[] = [
      { chip: "all", label: this._l("send.chip_all") },
      {
        chip: "not_sent",
        label: this._l("send.chip_count", {
          label: this._l("send.chip_not_sent"),
          count: counts.not_sent,
        }),
      },
      {
        chip: "held",
        label: this._l("send.chip_count", {
          label: this._l("send.chip_held"),
          count: counts.held,
        }),
      },
    ];
    return html`<div
      class="chips"
      role="group"
      aria-label=${this._l("send.chips_label")}
    >
      ${chips.map(
        (item) =>
          html`<ha-filter-chip
            .selected=${this._chip === item.chip}
            .label=${item.label}
            data-chip=${item.chip}
            @click=${this._chipClicked}
          ></ha-filter-chip>`
      )}
    </div>`;
  }

  private _chipClicked(ev: Event): void {
    const chip = (ev.currentTarget as HTMLElement).dataset.chip as ProblemChip;
    this._chip = chip;
  }

  private async _toggleHold(ev: Event): Promise<void> {
    const button = ev.currentTarget as HTMLElement;
    const file = button.dataset.file!;
    const held = button.dataset.held !== "true";
    try {
      this._send = await holdProblem(this.hass, file, held);
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private _renderSendStatus(problem: RecordedProblem): TemplateResult {
    const status = statusOf(problem.file, this._send?.statuses);
    return html`<span class="pill ${status}"
      >${this._l(`send.status_${status}`)}</span
    >`;
  }

  private _renderProblem(problem: RecordedProblem): TemplateResult {
    const held =
      this._send && statusOf(problem.file, this._send.statuses) === "held";
    return html`<li>
      <details>
        <summary>
          <span class="row">
            <span class="title">${problem.title}</span>
            ${this._send ? this._renderSendStatus(problem) : nothing}
          </span>
          <span class="meta"
            >${this._l("count", { count: problem.count })} ·
            ${this._l("last_seen")}
            ${this._when(problem.last_seen)}${
              held ? html` · ${this._l("send.held_by_you")}` : nothing
            }</span
          >
        </summary>
        ${
          this._send
            ? html`<ha-button
                appearance="plain"
                size="small"
                data-file=${problem.file}
                data-held=${held ? "true" : "false"}
                @click=${this._toggleHold}
                >${held ? this._l("send.release") : this._l("send.hold")}</ha-button
              >`
            : nothing
        }
        <dl>
          <dt>${this._l("first_seen")}</dt>
          <dd>${this._when(problem.first_seen)}</dd>
          ${
            problem.logger
              ? html`<dt>${this._l("logger")}</dt>
                  <dd>${problem.logger}</dd>`
              : nothing
          }
          ${
            problem.version
              ? html`<dt>${this._l("version")}</dt>
                  <dd>${problem.version}</dd>`
              : nothing
          }
          <dt>${this._l("file")}</dt>
          <dd>${problem.file}</dd>
        </dl>
        <pre>${problem.detail}</pre>
      </details>
    </li>`;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          max-width: 960px;
          margin: 0 auto;
          padding: var(--ha-space-4);
        }
        .note {
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .toolbar {
          display: flex;
          gap: var(--ha-space-2);
          align-items: center;
        }
        .center {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8);
        }
        .problems {
          list-style: none;
          margin: var(--ha-space-4) 0 0;
          padding: 0;
          display: grid;
          gap: var(--ha-space-2);
        }
        details {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-lg);
          padding: var(--ha-space-3);
          background: var(--card-background-color);
        }
        summary {
          cursor: pointer;
          display: grid;
          gap: var(--ha-space-1);
        }
        .title {
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        ha-problem-log-send {
          margin: var(--ha-space-3) 0;
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
          margin-top: var(--ha-space-3);
        }
        .row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          min-height: 28px;
        }
        .pill {
          flex: none;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          padding: 2px var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .pill.not_sent {
          background: rgba(var(--rgb-warning-color, 255, 166, 0), 0.18);
          color: var(--primary-text-color);
        }
        .pill.sent {
          background: rgba(var(--rgb-success-color, 67, 160, 71), 0.18);
          color: var(--primary-text-color);
        }
        .meta {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        dl {
          display: grid;
          grid-template-columns: max-content 1fr;
          gap: var(--ha-space-1) var(--ha-space-3);
          margin: var(--ha-space-3) 0;
        }
        dt {
          color: var(--secondary-text-color);
        }
        dd {
          margin: 0;
          overflow-wrap: anywhere;
        }
        pre {
          margin: 0;
          overflow: auto;
          font-family: var(--ha-font-family-code);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-problem-log": HaConfigProblemLog;
  }
}
