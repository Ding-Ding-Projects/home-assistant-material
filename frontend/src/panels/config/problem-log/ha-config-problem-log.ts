import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  ProblemLogOverview,
  RecordedProblem,
} from "../../../data/problem_log";
import { fetchProblemLog } from "../../../data/problem_log";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";

@customElement("ha-config-problem-log")
class HaConfigProblemLog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _overview?: ProblemLogOverview;

  @state() private _error?: string;

  @state() private _filter = "";

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._overview = await fetchProblemLog(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.problem_log.${key}` as any,
      values
    );
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _shown(): RecordedProblem[] {
    const matches = searchMatcher(this._filter);
    return (this._overview?.problems ?? []).filter((problem) =>
      matches(problem.title, problem.logger, problem.level, problem.detail)
    );
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/system"
        .header=${this._l("title")}
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
    const search = this._l("search", { count: total });
    return html`
      <ha-alert alert-type="info">${this._l("nothing_sent")}</ha-alert>
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
        <ha-input-search
          appearance="outlined"
          .placeholder=${search}
          .accessibleLabel=${search}
          .value=${this._filter}
          .patternSamples=${overview.problems.map((item) => item.title)}
          @input=${this._filterChanged}
        ></ha-input-search>
        <ha-button appearance="plain" @click=${this._load}
          >${this._l("refresh")}</ha-button
        >
      </div>
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
    `;
  }

  private _renderProblem(problem: RecordedProblem): TemplateResult {
    return html`<li>
      <details>
        <summary>
          <span class="title">${problem.title}</span>
          <span class="meta"
            >${this._l("count", { count: problem.count })} ·
            ${this._l("last_seen")} ${problem.last_seen}</span
          >
        </summary>
        <dl>
          <dt>${this._l("first_seen")}</dt>
          <dd>${problem.first_seen}</dd>
          <dt>${this._l("logger")}</dt>
          <dd>${problem.logger ?? ""}</dd>
          <dt>${this._l("version")}</dt>
          <dd>${problem.version ?? ""}</dd>
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
        .toolbar ha-input-search {
          flex: 1;
          min-width: 0;
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
