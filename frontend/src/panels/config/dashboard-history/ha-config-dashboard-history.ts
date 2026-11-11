import { mdiChevronRight, mdiRestore, mdiSourceBranch, mdiTab } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  DashboardCommit,
  DashboardRepository,
  DashboardReposStatus,
} from "../../../data/dashboard_repos";
import {
  dashboardHistoryQueryParamConfig,
  dashboardHistoryUrl,
  fetchDashboardDiff,
  fetchDashboardHistory,
  fetchDashboardReposStatus,
  fetchDashboardVersion,
  restoreDashboardVersion,
} from "../../../data/dashboard_repos";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "../automation-history/ha-automation-diff";

/** Commits listed before Show all. */
const COMMITS_SHOWN = 8;

interface Detail {
  sha: string;
  yaml: string;
  diff: string;
  /** The commit the diff is measured against, when there is one. */
  against?: string;
  error?: string;
}

/**
 * The history manager of a dashboard and of each of its views (tabs): the
 * commits, the content at a commit, what changed, a comparison of two commits
 * and a way back. Without a dashboard in the address it lists the dashboards
 * that have a history, with a link to each one and each of its tabs.
 */
@customElement("ha-config-dashboard-history")
export class HaConfigDashboardHistory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _status?: DashboardReposStatus;

  @state() private _commits: DashboardCommit[] = [];

  @state() private _dashboard?: string;

  @state() private _view?: string;

  @state() private _commit?: string;

  @state() private _loading = true;

  @state() private _error?: string;

  @state() private _search = "";

  @state() private _showAll = false;

  @state() private _detail?: Detail;

  @state() private _compareWith = "";

  @state() private _compareDiff?: string;

  @state() private _busy = false;

  @state() private _notice?: string;

  private _detailRequest = 0;

  private _urlParams = new QueryParamsController(
    this,
    dashboardHistoryQueryParamConfig,
    { enabled: () => true, navigated: () => this._applyUrl() }
  );

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.dashboard_history.${key}` as any,
      values
    );
  }

  protected firstUpdated(changed: PropertyValues<this>) {
    super.firstUpdated(changed);
    this._applyUrl();
    this._load();
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (
      (changed.has("_commit") || changed.has("_commits")) &&
      !this._loading &&
      this._dashboard
    ) {
      this._loadDetail();
    }
  }

  private _applyUrl() {
    const params = this._urlParams.searchParams();
    if (!params) {
      return;
    }
    const dashboard = params.get("dashboard") || undefined;
    const view = params.get("view") || undefined;
    const reload = dashboard !== this._dashboard || view !== this._view;
    this._dashboard = dashboard;
    this._view = view;
    this._commit = params.get("commit") || undefined;
    if (reload && this._status) {
      this._search = "";
      this._showAll = false;
      this._notice = undefined;
      this._load();
    }
  }

  private _writeUrl() {
    this._urlParams.write({
      dashboard: this._dashboard ?? "",
      view: this._view ?? "",
      commit: this._commit ?? "",
    });
  }

  private get _repository(): DashboardRepository | undefined {
    return this._status?.dashboards.find((item) => item.id === this._dashboard);
  }

  private async _load() {
    this._loading = true;
    this._error = undefined;
    this._detail = undefined;
    this._commits = [];
    try {
      this._status = await fetchDashboardReposStatus(this.hass);
      if (this._dashboard && this._repository) {
        this._commits = await fetchDashboardHistory(
          this.hass,
          this._dashboard,
          this._view
        );
      }
    } catch (err: any) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
    }
  }

  private get _selectedSha(): string | undefined {
    return this._commit || this._commits[0]?.sha;
  }

  private async _loadDetail() {
    const sha = this._selectedSha;
    if (!sha || this._detail?.sha === sha || !this._dashboard) {
      return;
    }
    const request = ++this._detailRequest;
    this._detail = undefined;
    this._compareDiff = undefined;
    this._compareWith = "";
    const index = this._commits.findIndex((commit) => commit.sha === sha);
    const against = index === -1 ? undefined : this._commits[index + 1]?.sha;
    try {
      const [version, diff] = await Promise.all([
        fetchDashboardVersion(this.hass, this._dashboard, sha, this._view),
        against
          ? fetchDashboardDiff(
              this.hass,
              this._dashboard,
              against,
              sha,
              this._view
            ).then((result) => result.diff)
          : Promise.resolve(""),
      ]);
      if (request === this._detailRequest) {
        this._detail = { sha, yaml: version.yaml, diff, against };
      }
    } catch (err: any) {
      if (request === this._detailRequest) {
        this._detail = {
          sha,
          yaml: "",
          diff: "",
          error: err?.message || String(err),
        };
      }
    }
  }

  private _visibleCommits(): DashboardCommit[] {
    const matches = searchMatcher(this._search);
    return this._commits.filter((commit) =>
      matches(commit.message, commit.author, commit.sha)
    );
  }

  private get _scopeTitle(): string {
    const repository = this._repository;
    if (!repository) {
      return "";
    }
    if (!this._view) {
      return repository.title;
    }
    const view = repository.views.find((item) => item.key === this._view);
    return view?.title || this._view;
  }

  protected render(): TemplateResult {
    const repository = this._repository;
    const breadcrumb = [
      this.hass.localize("panel.config"),
      this._l("caption"),
      ...(repository ? [repository.title] : []),
    ].join(", ");
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path=${
          this._dashboard ? "/config/dashboard_history" : "/config/dashboard"
        }
        .header=${this._l("title")}
        .breadcrumb=${breadcrumb}
      >
        <div class="page">
          ${
            this._error
              ? html`<ha-alert
                  alert-type="error"
                  .title=${this._l("load_failed")}
                  >${this._error}</ha-alert
                >`
              : nothing
          }
          ${
            this._loading
              ? html`<p class="empty">${this._l("loading")}</p>`
              : !this._dashboard
                ? this._renderOverview()
                : repository
                  ? this._renderHistory(repository)
                  : this._error
                    ? nothing
                    : html`<p class="empty">${this._l("not_found")}</p>`
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderOverview() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    return html`
      <h1>${this._l("title")}</h1>
      <p class="secondary">${this._l("description")}</p>
      ${
        status.dashboards.length
          ? html`<div class="grid">
              ${status.dashboards.map(
                (item) => html`
                  <ha-card class="dashboard">
                    <div class="card-head">
                      <span class="tile">
                        <ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon>
                      </span>
                      <div class="grow">
                        <h2>${item.title}</h2>
                        <span class="secondary">
                          ${this._l("dashboard_summary", {
                            commits: item.commits,
                            views: item.views.length,
                          })}
                        </span>
                      </div>
                    </div>
                    ${
                      item.error
                        ? html`<ha-alert alert-type="warning"
                            >${this._l("last_error", {
                              error: item.error,
                            })}</ha-alert
                          >`
                        : nothing
                    }
                    <ul class="links">
                      <li>
                        <a
                          class="link-row"
                          href=${dashboardHistoryUrl(item.id)}
                          @click=${this._navigateLink}
                        >
                          <span class="grow"
                            >${this._l("whole_dashboard")}</span
                          >
                          <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
                        </a>
                      </li>
                      ${item.views.map(
                        (view) =>
                          html`<li>
                            <a
                              class="link-row"
                              href=${dashboardHistoryUrl(item.id, view.key)}
                              @click=${this._navigateLink}
                            >
                              <ha-svg-icon .path=${mdiTab}></ha-svg-icon>
                              <span class="grow"
                                >${view.title || view.path || view.key}</span
                              >
                              <span class="secondary"
                                >${this._l("commit_count", {
                                  count: view.commits,
                                })}</span
                              >
                              <ha-svg-icon
                                .path=${mdiChevronRight}
                              ></ha-svg-icon>
                            </a>
                          </li>`
                      )}
                    </ul>
                  </ha-card>
                `
              )}
            </div>`
          : html`<p class="empty">${this._l("no_dashboards")}</p>`
      }
      ${
        status.skipped.length
          ? html`<p class="secondary">
              ${this._l("skipped", {
                list: status.skipped
                  .map((item) => `${item.title} (${item.mode})`)
                  .join(", "),
              })}
            </p>`
          : nothing
      }
    `;
  }

  private _renderHistory(repository: DashboardRepository) {
    const commits = this._visibleCommits();
    const filtering = !!this._search;
    const shown =
      this._showAll || filtering ? commits : commits.slice(0, COMMITS_SHOWN);
    const selected = this._selectedSha;
    const removedView =
      this._view && !repository.views.some((item) => item.key === this._view);
    return html`
      <div class="header">
        <span class="tile">
          <ha-svg-icon
            .path=${this._view ? mdiTab : mdiSourceBranch}
          ></ha-svg-icon>
        </span>
        <div class="grow">
          <h1>${this._scopeTitle}</h1>
          <span class="secondary">
            ${this._l(this._view ? "history_of_view" : "history_of_dashboard", {
              dashboard: repository.title,
            })}
          </span>
        </div>
        ${
          this._view
            ? nothing
            : html`<ha-button
                appearance="plain"
                href=${`/${repository.url_path ?? "lovelace"}`}
                >${this._l("open_dashboard")}</ha-button
              >`
        }
      </div>
      <div class="scope" role="group" aria-label=${this._l("scope")}>
        <button
          class=${classMap({ chip: true, on: !this._view })}
          aria-pressed=${this._view ? "false" : "true"}
          @click=${this._pickWhole}
        >
          ${this._l("whole_dashboard")}
        </button>
        ${repository.views.map(
          (view) =>
            html`<button
              class=${classMap({ chip: true, on: this._view === view.key })}
              aria-pressed=${this._view === view.key ? "true" : "false"}
              .key=${view.key}
              @click=${this._pickView}
            >
              ${view.title || view.path || view.key}
            </button>`
        )}
      </div>
      ${
        removedView
          ? html`<ha-alert alert-type="info"
              >${this._l("view_removed")}</ha-alert
            >`
          : nothing
      }
      ${
        repository.error
          ? html`<ha-alert alert-type="warning"
              >${this._l("last_error", { error: repository.error })}</ha-alert
            >`
          : nothing
      }
      <div class="columns">
        <div class="list-column">
          <ha-input-search
            appearance="outlined"
            .value=${this._search}
            .placeholder=${this._l("search_commits")}
            .patternSamples=${this._commits.map((commit) => commit.message)}
            @input=${this._searchChanged}
          ></ha-input-search>
          <ul class="commits">
            ${shown.map(
              (commit, index) =>
                html`<li>
                  <button
                    class=${classMap({
                      commit: true,
                      on: selected === commit.sha,
                    })}
                    aria-current=${selected === commit.sha ? "true" : "false"}
                    .sha=${commit.sha}
                    @click=${this._pickCommit}
                  >
                    <span class="dot"></span>
                    <span class="commit-text">
                      <span class="primary">${commit.message}</span>
                      <span class="secondary">
                        ${commit.author},
                        <ha-relative-time
                          .hass=${this.hass}
                          .datetime=${new Date(commit.timestamp * 1000)}
                        ></ha-relative-time>
                      </span>
                    </span>
                    ${
                      index === 0 && !filtering
                        ? html`<span class="live">${this._l("latest")}</span>`
                        : nothing
                    }
                    <code>${commit.short}</code>
                  </button>
                </li>`
            )}
          </ul>
          ${
            !commits.length
              ? html`<p class="empty">
                  ${this._l(
                    this._commits.length ? "no_commit_match" : "no_commits"
                  )}
                </p>`
              : nothing
          }
          ${
            !this._showAll && !filtering && commits.length > COMMITS_SHOWN
              ? html`<button class="link" @click=${this._showAllCommits}>
                  ${this._l("show_all")}
                </button>`
              : nothing
          }
        </div>
        ${this._renderDetail(repository, selected)}
      </div>
    `;
  }

  private _renderDetail(repository: DashboardRepository, sha?: string) {
    const commit = this._commits.find((item) => item.sha === sha);
    const detail = this._detail;
    return html`
      <ha-card class="detail">
        ${
          commit
            ? html`
                <div class="detail-title">
                  <h2>${commit.message}</h2>
                  <span class="secondary">
                    ${commit.author},
                    <ha-relative-time
                      .hass=${this.hass}
                      .datetime=${new Date(commit.timestamp * 1000)}
                    ></ha-relative-time>
                    · <code>${commit.short}</code>
                  </span>
                </div>
                ${
                  !detail
                    ? html`<p class="secondary">
                        ${this._l("loading_changes")}
                      </p>`
                    : detail.error
                      ? html`<ha-alert alert-type="error"
                          >${this._l("changes_failed")}
                          ${detail.error}</ha-alert
                        >`
                      : html`
                          <h3>${this._l("changes_heading")}</h3>
                          ${
                            detail.diff.trim()
                              ? html`<ha-automation-diff
                                  .text=${detail.diff}
                                ></ha-automation-diff>`
                              : html`<p class="secondary">
                                  ${this._l(
                                    detail.against
                                      ? "diff_empty"
                                      : "first_commit"
                                  )}
                                </p>`
                          }
                          <h3>${this._l("content_heading")}</h3>
                          <pre class="yaml" tabindex="0">${detail.yaml}</pre>
                        `
                }
                ${
                  this._notice
                    ? html`<p class="notice" role="status">${this._notice}</p>`
                    : nothing
                }
                <div class="actions-list">
                  <button
                    class="action"
                    ?disabled=${this._busy || !detail || !!detail.error}
                    @click=${this._restore}
                  >
                    <span class="tile small">
                      <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
                    </span>
                    <span class="action-text">
                      <b>${this._l("restore")}</b>
                      <span class="secondary"
                        >${this._l(
                          this._view ? "restore_view_hint" : "restore_hint"
                        )}</span
                      >
                    </span>
                    <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
                  </button>
                  <div class="action compare">
                    <span class="action-text">
                      <b>${this._l("compare")}</b>
                      <label class="compare-pick">
                        <span class="secondary"
                          >${this._l("compare_with")}</span
                        >
                        <select
                          .value=${this._compareWith}
                          @change=${this._compareChanged}
                        >
                          <option value="">…</option>
                          ${this._commits
                            .filter((item) => item.sha !== sha)
                            .map(
                              (item) =>
                                html`<option value=${item.sha}>
                                  ${item.short}: ${item.message}
                                </option>`
                            )}
                        </select>
                      </label>
                      ${
                        this._compareDiff !== undefined
                          ? this._compareDiff.trim()
                            ? html`<ha-automation-diff
                                .text=${this._compareDiff}
                              ></ha-automation-diff>`
                            : html`<span class="secondary"
                                >${this._l("diff_empty")}</span
                              >`
                          : nothing
                      }
                    </span>
                  </div>
                </div>
              `
            : html`<p class="empty">${this._l("no_commits")}</p>`
        }
      </ha-card>
      ${
        repository.removed.length && !this._view
          ? html`<p class="secondary">
              ${this._l("removed_views", { list: repository.removed.join(", ") })}
            </p>`
          : nothing
      }
    `;
  }

  private _navigateLink(ev: Event) {
    ev.preventDefault();
    navigate((ev.currentTarget as HTMLAnchorElement).getAttribute("href")!);
  }

  private _searchChanged(ev: Event) {
    this._search = (ev.target as HaInputSearch).value ?? "";
  }

  private _showAllCommits() {
    this._showAll = true;
  }

  private _pickWhole() {
    navigate(dashboardHistoryUrl(this._dashboard));
  }

  private _pickView(ev: Event) {
    const key = (ev.currentTarget as HTMLElement & { key: string }).key;
    navigate(dashboardHistoryUrl(this._dashboard, key));
  }

  private _pickCommit(ev: Event) {
    this._commit = (ev.currentTarget as HTMLElement & { sha: string }).sha;
    this._notice = undefined;
    this._writeUrl();
  }

  private async _compareChanged(ev: Event) {
    const other = (ev.currentTarget as HTMLSelectElement).value;
    this._compareWith = other;
    const sha = this._selectedSha;
    if (!other || !sha || !this._dashboard) {
      this._compareDiff = undefined;
      return;
    }
    // The older of the two comes first, as a diff reads from old to new.
    const position = (value: string) =>
      this._commits.findIndex((commit) => commit.sha === value);
    const [older, newer] =
      position(sha) > position(other) ? [sha, other] : [other, sha];
    try {
      const { diff } = await fetchDashboardDiff(
        this.hass,
        this._dashboard,
        older,
        newer,
        this._view
      );
      this._compareDiff = diff;
    } catch (err: any) {
      this._compareDiff = undefined;
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    }
  }

  private async _restore() {
    const repository = this._repository;
    const sha = this._selectedSha;
    const commit = this._commits.find((item) => item.sha === sha);
    if (!repository || !sha || !commit || !this._dashboard) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l(this._view ? "restore_view_title" : "restore_title", {
        title: this._scopeTitle,
      }),
      text: this._view
        ? this._l("restore_view_text", {
            view: this._scopeTitle,
            dashboard: repository.title,
            version: commit.short,
          })
        : this._l("restore_text", {
            dashboard: repository.title,
            count: repository.views.length,
            version: commit.short,
          }),
      confirmText: this._l("restore"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    try {
      await restoreDashboardVersion(
        this.hass,
        this._dashboard,
        sha,
        this._view
      );
      this._notice = this._l("restore_done", { version: commit.short });
      // The save is committed a moment after it returns.
      window.setTimeout(async () => {
        this._detail = undefined;
        this._commit = undefined;
        await this._load();
        this._writeUrl();
      }, 1500);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      padding: var(--ha-space-6);
      max-width: 1320px;
      margin: 0 auto;
    }
    :host([narrow]) .page {
      padding: var(--ha-space-4);
    }
    h1 {
      margin: 0;
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-normal);
      overflow-wrap: anywhere;
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    h3 {
      margin: var(--ha-space-2) 0 0;
      font-size: var(--ha-font-size-m);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: 0;
    }
    .secondary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .empty {
      padding: var(--ha-space-6);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .grow {
      flex: 1 1 200px;
      min-width: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-4);
    }
    .tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex: none;
      width: var(--ha-space-14);
      height: var(--ha-space-14);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-color));
    }
    .tile.small {
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      background: var(--ha-color-fill-neutral-normal-resting);
      color: inherit;
    }
    code {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr));
      gap: var(--ha-space-4);
    }
    .dashboard {
      padding: var(--ha-space-4);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .card-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .links {
      list-style: none;
      margin: 0;
      padding: 0;
    }
    .link-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 44px;
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-lg);
      color: inherit;
      text-decoration: none;
      overflow-wrap: anywhere;
    }
    .link-row:hover,
    .link-row:focus-visible {
      background: var(--ha-color-fill-neutral-quiet-resting);
      outline: none;
    }
    .scope {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
      text-align: start;
    }
    button:focus-visible,
    select:focus-visible,
    .yaml:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .chip {
      min-height: 44px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .chip.on {
      border-color: transparent;
      background: var(--ha-color-fill-primary-normal-resting);
      font-weight: var(--ha-font-weight-medium);
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
      gap: var(--ha-space-4);
      align-items: start;
    }
    :host([narrow]) .columns {
      grid-template-columns: minmax(0, 1fr);
    }
    .list-column {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .commits {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .commit {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      width: 100%;
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
      box-sizing: border-box;
    }
    .commit.on {
      background: var(--ha-color-fill-primary-normal-resting);
    }
    .commit-text {
      display: flex;
      flex-direction: column;
      flex: 1;
      min-width: 0;
    }
    .primary {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .live {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-primary-normal-resting);
      font-size: var(--ha-font-size-xs);
    }
    .link {
      min-height: 44px;
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .detail {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-6);
      min-width: 0;
    }
    :host([narrow]) .detail {
      padding: var(--ha-space-4);
    }
    .detail-title {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .yaml {
      margin: 0;
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      overflow: auto;
      max-height: 420px;
    }
    .actions-list {
      display: flex;
      flex-direction: column;
      border-top: 1px solid var(--divider-color);
    }
    .action {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 44px;
      padding: var(--ha-space-3) 0;
      width: 100%;
    }
    .action.compare {
      align-items: flex-start;
    }
    button.action:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .action-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      flex: 1;
      min-width: 0;
    }
    .compare-pick {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    select {
      max-width: 100%;
      min-height: 44px;
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
    }
    .notice {
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      background: var(--ha-color-fill-success-quiet-resting);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-dashboard-history": HaConfigDashboardHistory;
  }
}
