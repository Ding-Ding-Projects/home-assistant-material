import { mdiChevronRight, mdiRestore, mdiSourceBranch, mdiTab } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { formatShortDateTime } from "../../../common/datetime/format_date_time";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/history/ha-version-picker";
import type { VersionPickerItem } from "../../../components/history/ha-version-picker";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  DashboardCommit,
  DashboardArchive,
  DashboardRepository,
  DashboardRepositoryView,
  DashboardReposStatus,
} from "../../../data/dashboard_repos";
import { describeHistoryError } from "../../../data/automation_repos";
import {
  CURRENT_STATE_NOT_RECORDED,
  dashboardHistoryQueryParamConfig,
  dashboardHistoryUrl,
  fetchDashboardArchives,
  fetchDashboardDiff,
  fetchDashboardHistory,
  fetchDashboardReposStatus,
  fetchDashboardVersion,
  forgetDashboardArchive,
  forgetDashboardHistory,
  forgetRemovedDashboardView,
  isValidDashboardRemote,
  pushDashboardRepository,
  restoreDashboardVersion,
  setDashboardRemote,
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

  @state() private _overviewSearch = "";

  @state() private _showAll = false;

  @state() private _detail?: Detail;

  @state() private _compareWith = "";

  @state() private _compareDiff?: string;

  @state() private _busy = false;

  @state() private _archives: DashboardArchive[] = [];

  @state() private _notice?: string;

  @state() private _remoteInput = "";

  @state() private _remoteBusy = false;

  @state() private _pushing = false;

  @state() private _pushResult?: { ok: boolean; text: string };

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

  private _errorText(err: unknown): string {
    return describeHistoryError(
      this.hass,
      err,
      "ui.panel.config.dashboard_history"
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
      this._pushResult = undefined;
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
      this._remoteInput = this._repository?.remote ?? "";
      try {
        this._archives = (await fetchDashboardArchives(this.hass)).archives;
      } catch (_err) {
        this._archives = [];
      }
      if (this._dashboard && this._repository) {
        this._commits = await fetchDashboardHistory(
          this.hass,
          this._dashboard,
          this._view
        );
      }
    } catch (err: any) {
      this._error = this._errorText(err);
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
          error: this._errorText(err),
        };
      }
    }
  }

  private _visibleCommits(): DashboardCommit[] {
    const matches = searchMatcher(this._search);
    return this._commits.filter((commit) =>
      matches(
        commit.message,
        commit.author,
        commit.sha,
        this._absoluteDate(commit)
      )
    );
  }

  private _absoluteDate(commit: DashboardCommit): string {
    return formatShortDateTime(
      new Date(commit.timestamp * 1000),
      this.hass.locale,
      this.hass.config
    );
  }

  /** The dashboards, and their tabs, that match the overview search. */
  private _overviewMatches(): {
    item: DashboardRepository;
    views: DashboardRepositoryView[];
  }[] {
    const matches = searchMatcher(this._overviewSearch);
    return (this._status?.dashboards ?? []).flatMap((item) => {
      const own = matches(item.title, item.url_path, item.id);
      const views = own
        ? item.views
        : item.views.filter((view) => matches(view.title, view.key, view.path));
      return own || views.length ? [{ item, views }] : [];
    });
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
    const visible = this._overviewMatches();
    const totalTabs = status.dashboards.reduce(
      (sum, item) => sum + item.views.length,
      0
    );
    const shownTabs = visible.reduce((sum, row) => sum + row.views.length, 0);
    const search = this._l("overview_search", {
      dashboards: status.dashboards.length,
      tabs: totalTabs,
    });
    return html`
      <h1>${this._l("title")}</h1>
      <p class="secondary">${this._l("description")}</p>
      ${
        status.dashboards.length
          ? html`<div class="toolbar">
                <ha-input-search
                  appearance="outlined"
                  .value=${this._overviewSearch}
                  .placeholder=${search}
                  .accessibleLabel=${search}
                  .patternSamples=${status.dashboards.flatMap((item) => [
                    item.title,
                    ...item.views.map((view) => view.title || view.key),
                  ])}
                  @input=${this._overviewSearchChanged}
                ></ha-input-search>
              </div>
              ${
                this._overviewSearch
                  ? html`<p class="secondary" role="status">
                      ${this._l("overview_matches", {
                        dashboards: visible.length,
                        tabs: shownTabs,
                      })}
                    </p>`
                  : nothing
              }`
          : nothing
      }
      ${
        status.dashboards.length && !visible.length
          ? html`<div class="empty">
              <p>${this._l("overview_no_match")}</p>
              <ha-button appearance="plain" @click=${this._clearOverviewSearch}
                >${this._l("clear_search")}</ha-button
              >
            </div>`
          : nothing
      }
      ${
        status.dashboards.length
          ? html`<div class="grid">
              ${visible.map(
                ({ item, views }) => html`
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
                      ${views.map(
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
      ${this._renderArchives()}
    `;
  }

  private _renderArchives() {
    if (!this._archives.length) {
      return nothing;
    }
    return html`
      <ha-card class="dashboard">
        <div class="card-head">
          <div class="grow">
            <h2>${this._l("archives_title")}</h2>
            <span class="secondary">${this._l("archives_text")}</span>
          </div>
        </div>
        <ul class="links">
          ${this._archives.map(
            (item) => html`
              <li class="link-row">
                <span class="grow">${item.dashboard}</span>
                ${
                  item.archived_at
                    ? html`<ha-relative-time
                        .hass=${this.hass}
                        .datetime=${new Date(item.archived_at * 1000)}
                      ></ha-relative-time>`
                    : nothing
                }
                <ha-button
                  variant="danger"
                  appearance="plain"
                  size="small"
                  .archive=${item}
                  .disabled=${this._busy}
                  @click=${this._forgetArchive}
                  >${this._l("archive_forget")}</ha-button
                >
              </li>
            `
          )}
        </ul>
      </ha-card>
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
          ${
            filtering
              ? html`<p class="secondary" role="status">
                  ${this._l("commit_matches", { count: commits.length })}
                </p>`
              : nothing
          }
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
      ${this._renderRemote(repository)}
      ${this._view ? nothing : this._renderForget(repository)}
    `;
  }

  private _renderSecretsWarning() {
    return html`<ha-alert
      alert-type="warning"
      .title=${this._l("secrets_title")}
      >${this._l("secrets_text")}</ha-alert
    >`;
  }

  private get _remoteError(): string | undefined {
    const address = this._remoteInput.trim();
    return address && !isValidDashboardRemote(address)
      ? this._l("remote_invalid")
      : undefined;
  }

  private _renderRemote(repository: DashboardRepository) {
    const error = this._remoteError;
    const saved = repository.remote ?? "";
    const dirty = this._remoteInput.trim() !== saved;
    const last = repository.last_push;
    const canPush =
      !!repository.remote &&
      !repository.remote_unsafe &&
      !dirty &&
      !this._pushing &&
      !this._remoteBusy;
    const canSave =
      dirty && !!this._remoteInput.trim() && !error && !this._remoteBusy;
    const canRemove =
      (!!repository.remote || repository.remote_unsafe) && !this._remoteBusy;
    return html`
      <ha-card class="detail remote">
        <div class="detail-title">
          <h2>${this._l("remote_title")}</h2>
          <span class="secondary">${this._l("remote_description")}</span>
        </div>
        ${
          repository.remote_unsafe
            ? html`<ha-alert alert-type="warning"
                >${this._l("remote_unsafe")}</ha-alert
              >`
            : nothing
        }
        <div class="remote-line">
          <span class="secondary">${this._l("remote_current")}</span>
          <code class="remote-address"
            >${repository.remote ?? this._l("remote_none")}</code
          >
        </div>
        ${this._renderSecretsWarning()}
        <ha-input
          appearance="outlined"
          type="url"
          .label=${this._l("remote_label")}
          .hint=${this._l("remote_hint")}
          .placeholder=${"https://example.com/team/dashboard.git"}
          .value=${this._remoteInput}
          .invalid=${!!error}
          .validationMessage=${error ?? ""}
          .disabled=${this._remoteBusy}
          @input=${this._remoteChanged}
        ></ha-input>
        <div class="buttons">
          <ha-button .disabled=${!canSave} @click=${this._saveRemote}
            >${this._l("remote_save")}</ha-button
          >
          <ha-button
            appearance="plain"
            .disabled=${!canRemove}
            @click=${this._removeRemote}
            >${this._l("remote_remove")}</ha-button
          >
        </div>
        <h3>${this._l("push_heading")}</h3>
        <p class="statement">
          ${
            repository.remote
              ? this._l("push_statement", { address: repository.remote })
              : this._l("push_statement_no_remote")
          }
        </p>
        <div class="buttons">
          <ha-button .disabled=${!canPush} @click=${this._push}
            >${this._l("push_now")}</ha-button
          >
        </div>
        ${
          dirty && repository.remote
            ? html`<p class="secondary">${this._l("push_save_first")}</p>`
            : nothing
        }
        ${
          this._pushResult
            ? html`<ha-alert
                role="status"
                alert-type=${this._pushResult.ok ? "success" : "error"}
                >${this._pushResult.text}</ha-alert
              >`
            : nothing
        }
        ${
          last
            ? html`<p class="secondary">
                ${
                  last.ok
                    ? this._l("last_push_ok")
                    : this._l("last_push_failed", { error: last.error ?? "" })
                }
                <ha-relative-time
                  .hass=${this.hass}
                  .datetime=${new Date(last.time * 1000)}
                ></ha-relative-time>
              </p>`
            : html`<p class="secondary">${this._l("never_pushed")}</p>`
        }
      </ha-card>
    `;
  }

  private _renderForget(repository: DashboardRepository) {
    return html`
      <ha-card class="detail">
        <div class="detail-title">
          <h2>${this._l("forget_title")}</h2>
          <span class="secondary"
            >${this._l("forget_hint", { dashboard: repository.title })}</span
          >
        </div>
        <div class="buttons">
          <ha-button
            variant="danger"
            appearance="outlined"
            .disabled=${this._busy}
            @click=${this._forget}
            >${this._l("forget")}</ha-button
          >
        </div>
      </ha-card>
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
                ${this._renderSecretsWarning()}
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
                      <div class="compare-pick">
                        <span class="secondary"
                          >${this._l("compare_with")}</span
                        >
                        <ha-version-picker
                          .hass=${this.hass}
                          .label=${this._l("compare_with")}
                          .items=${this._pickerItems()}
                          .value=${this._compareWith}
                          .currentId=${sha ?? ""}
                          @version-picker-changed=${this._compareChanged}
                        ></ha-version-picker>
                        ${
                          this._compareWith
                            ? html`<button
                                class="link"
                                @click=${this._clearCompare}
                              >
                                ${this._l("compare_clear")}
                              </button>`
                            : nothing
                        }
                      </div>
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
                ${this._l("removed_views", {
                  list: repository.removed.join(", "),
                })}
              </p>
              <ul class="links">
                ${repository.removed.map(
                  (key) => html`
                    <li class="link-row">
                      <span class="grow">${key}</span>
                      <ha-button
                        variant="danger"
                        appearance="plain"
                        size="small"
                        .viewKey=${key}
                        .disabled=${this._busy}
                        @click=${this._forgetRemovedView}
                        >${this._l("removed_view_forget")}</ha-button
                      >
                    </li>
                  `
                )}
              </ul>`
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

  private _pickerItems(): VersionPickerItem[] {
    return this._commits.map((commit) => ({
      id: commit.sha,
      title: commit.message,
      short: commit.short,
      timestamp: commit.timestamp,
    }));
  }

  private _clearCompare() {
    this._compareWith = "";
    this._compareDiff = undefined;
  }

  private _overviewSearchChanged(ev: Event) {
    this._overviewSearch = (ev.target as HaInputSearch).value ?? "";
  }

  private _clearOverviewSearch() {
    this._overviewSearch = "";
  }

  private async _compareChanged(ev: CustomEvent<{ value: string }>) {
    const other = ev.detail.value;
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
        text: this._errorText(err),
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
    let retry = false;
    try {
      let result;
      try {
        result = await restoreDashboardVersion(
          this.hass,
          this._dashboard,
          sha,
          this._view
        );
      } catch (err: any) {
        if (err?.code !== CURRENT_STATE_NOT_RECORDED) {
          throw err;
        }
        const goAnyway = await showConfirmationDialog(this, {
          title: this._l("restore_unsaved_title"),
          text: this._l("restore_unsaved_text", {
            error: err?.message || "",
          }),
          confirmText: this._l("restore_unsaved_confirm"),
          destructive: true,
        });
        if (!goAnyway) {
          return;
        }
        result = await restoreDashboardVersion(
          this.hass,
          this._dashboard,
          sha,
          this._view,
          true
        );
      }
      this._notice = this._l(
        result.new_view ? "restore_done_new_tab" : "restore_done",
        { version: commit.short }
      );
      this._detail = undefined;
      this._commit = undefined;
      await this._load();
      this._writeUrl();
    } catch (err: any) {
      if (err?.code === "dashboard_changed") {
        retry = await showConfirmationDialog(this, {
          title: this._l("action_failed"),
          text: this._errorText(err),
          confirmText: this._l("retry"),
        });
      } else {
        showAlertDialog(this, {
          title: this._l("action_failed"),
          text: this._errorText(err),
        });
      }
    } finally {
      this._busy = false;
    }
    if (retry) {
      await this._restore();
    }
  }

  private _remoteChanged(ev: Event) {
    this._remoteInput = (ev.target as HaInput).value ?? "";
  }

  private async _refreshStatus() {
    this._status = await fetchDashboardReposStatus(this.hass);
  }

  private async _saveRemote() {
    if (!this._dashboard || this._remoteError) {
      return;
    }
    const current = this._repository?.remote;
    const next = this._remoteInput.trim();
    if (current && next && next !== current) {
      const replace = await showConfirmationDialog(this, {
        title: this._l("remote_replace_title"),
        text: this._l("remote_replace_text", { old: current, new: next }),
        confirmText: this._l("remote_replace"),
        destructive: true,
      });
      if (!replace) {
        return;
      }
    }
    this._remoteBusy = true;
    try {
      await setDashboardRemote(
        this.hass,
        this._dashboard,
        this._remoteInput.trim() || null
      );
      await this._refreshStatus();
      this._remoteInput = this._repository?.remote ?? "";
      this._pushResult = undefined;
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._remoteBusy = false;
    }
  }

  private async _removeRemote() {
    if (!this._dashboard) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("remote_remove_title"),
      text: this._l("remote_remove_text"),
      confirmText: this._l("remote_remove"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._remoteBusy = true;
    try {
      await setDashboardRemote(this.hass, this._dashboard, null);
      await this._refreshStatus();
      this._remoteInput = "";
      this._pushResult = undefined;
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._remoteBusy = false;
    }
  }

  private async _push() {
    const repository = this._repository;
    if (!this._dashboard || !repository?.remote) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("push_confirm_title"),
      text: this._l("push_statement", { address: repository.remote }),
      confirmText: this._l("push_now"),
    });
    if (!confirmed) {
      return;
    }
    this._pushing = true;
    this._pushResult = undefined;
    try {
      const result = await pushDashboardRepository(this.hass, this._dashboard);
      this._pushResult = result.pushed
        ? { ok: true, text: this._l("push_done") }
        : {
            ok: false,
            text: this._l("push_failed", { error: result.error ?? "" }),
          };
      await this._refreshStatus();
    } catch (err: any) {
      this._pushResult = {
        ok: false,
        text: this._l("push_failed", { error: this._errorText(err) }),
      };
    } finally {
      this._pushing = false;
    }
  }

  private async _forgetArchive(ev: Event) {
    const archive = (
      ev.currentTarget as HTMLElement & { archive: DashboardArchive }
    ).archive;
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("archive_forget_title", {
        dashboard: archive.dashboard,
        date: archive.archived_at
          ? formatShortDateTime(
              new Date(archive.archived_at * 1000),
              this.hass.locale,
              this.hass.config
            )
          : this._l("archive_date_unknown"),
      }),
      text: this._l("archive_forget_text"),
      confirmText: this._l("archive_forget"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    try {
      await forgetDashboardArchive(this.hass, archive.name);
      await this._load();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _forgetRemovedView(ev: Event) {
    const key = (ev.currentTarget as HTMLElement & { viewKey: string }).viewKey;
    if (!this._dashboard) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("removed_view_forget_title", { view: key }),
      text: this._l("removed_view_forget_text"),
      confirmText: this._l("removed_view_forget"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    try {
      await forgetRemovedDashboardView(this.hass, this._dashboard, key);
      await this._load();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _forget() {
    const repository = this._repository;
    if (!this._dashboard || !repository) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("forget_confirm_title", { dashboard: repository.title }),
      text: this._l("forget_confirm_text", {
        dashboard: repository.title,
        count: repository.commits,
      }),
      confirmText: this._l("forget"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    try {
      await forgetDashboardHistory(this.hass, this._dashboard);
      this._notice = this._l("forget_done");
      this._detail = undefined;
      this._commit = undefined;
      this._pushResult = undefined;
      await this._load();
      this._writeUrl();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: this._errorText(err),
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
    .compare-pick ha-version-picker {
      flex: 1 1 240px;
      min-width: 0;
    }
    .toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .toolbar ha-input-search {
      flex: 1 1 280px;
      min-width: 0;
    }
    .remote {
      min-width: 0;
    }
    .remote-line {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: var(--ha-space-2);
    }
    .remote-address {
      overflow-wrap: anywhere;
    }
    .statement {
      overflow-wrap: anywhere;
    }
    .buttons {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
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
