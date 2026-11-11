import {
  mdiChevronRight,
  mdiCloudUpload,
  mdiCompare,
  mdiDelete,
  mdiMinus,
  mdiPencil,
  mdiPlus,
  mdiRestore,
  mdiSourceBranch,
  mdiUndo,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { consume } from "../../../common/decorators/consume";
import { fireEvent } from "../../../common/dom/fire_event";
import { searchMatcher } from "../../../common/regex/filter";
import { WORKING } from "../../../common/automation/version-tests";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  AutomationConfig,
  Condition,
  Trigger,
} from "../../../data/automation";
import {
  fetchAutomationFileConfig,
  migrateAutomationTrigger,
  saveAutomationConfig,
} from "../../../data/automation";
import {
  describeCondition,
  describeTrigger,
} from "../../../data/automation_i18n";
import type {
  AutomationCommit,
  AutomationRepository,
} from "../../../data/automation_repos";
import {
  fetchAutomationDiff,
  forgetAutomationHistory,
  fetchAutomationHistory,
  fetchAutomationReposStatus,
  fetchAutomationVersion,
  pushAutomationRepos,
  recordAutomation,
} from "../../../data/automation_repos";
import { fullEntitiesContext, manifestsContext } from "../../../data/context";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import type { DomainManifestLookup } from "../../../data/integration";
import type { Action } from "../../../data/script";
import { describeAction } from "../../../data/script_i18n";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import type { HomeAssistant } from "../../../types";
import "./ha-automation-diff";
import type { ConfigChange } from "./automation-config-diff";
import {
  compareAutomationConfigs,
  suggestCommitMessage,
} from "./automation-config-diff";

declare global {
  interface HASSDomEvents {
    "automation-repo-commit-selected": { sha: string };
  }
}

/** Commits listed before Show all. */
const COMMITS_SHOWN = 6;

/** What is shown for the selected version. */
interface Detail {
  key: string;
  changes: ConfigChange[];
  diff: string;
  /** The commit the changes are measured against, when there is one. */
  against?: string;
  error?: string;
}

/**
 * The version history of one automation: its commits, what is waiting to be
 * committed, and the ways to look at, compare, commit and go back.
 *
 * It is shown by the history manager when the address names a repository, and
 * reads what the automation repositories integration reports.
 */
@customElement("ha-config-automation-repo")
export class HaConfigAutomationRepo extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public automationId!: string;

  /** The commit to show, or `working`. The newest one when left out. */
  @property({ attribute: false }) public selectedSha?: string;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  private _entityRegistry?: EntityRegistryEntry[];

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  private _manifests?: DomainManifestLookup;

  @state() private _info?: AutomationRepository;

  @state() private _commits: AutomationCommit[] = [];

  @state() private _loading = true;

  @state() private _error?: string;

  @state() private _search = "";

  @state() private _author = "";

  @state() private _showAll = false;

  @state() private _view: "steps" | "yaml" = "steps";

  @state() private _detail?: Detail;

  @state() private _message = "";

  @state() private _busy = false;

  @state() private _notice?: string;

  @state() private _compareWith = "";

  @state() private _compareDiff?: string;

  private _configs = new Map<string, AutomationConfig>();

  private _detailRequest = 0;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.automation_history.${key}` as any,
      values
    );
  }

  protected firstUpdated(changed: PropertyValues<this>) {
    super.firstUpdated(changed);
    this._load();
  }

  protected willUpdate(changed: PropertyValues<this>) {
    super.willUpdate(changed);
    if (changed.has("automationId") && changed.get("automationId")) {
      this._reset();
      this._load();
    }
  }

  protected updated(changed: PropertyValues) {
    super.updated(changed);
    if (
      (changed.has("selectedSha") || changed.has("_commits")) &&
      !this._loading
    ) {
      this._loadDetail();
    }
  }

  private _reset() {
    this._info = undefined;
    this._commits = [];
    this._detail = undefined;
    this._configs = new Map();
    this._search = "";
    this._author = "";
    this._showAll = false;
    this._notice = undefined;
    this._compareWith = "";
    this._compareDiff = undefined;
  }

  // ---- Loading ----

  private async _load() {
    this._loading = true;
    this._error = undefined;
    try {
      const [status, commits] = await Promise.all([
        fetchAutomationReposStatus(this.hass),
        fetchAutomationHistory(this.hass, this.automationId, 200),
      ]);
      this._info = status.automations.find(
        (item) => item.id === this.automationId
      );
      this._commits = commits;
    } catch (err: any) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
    }
  }

  /** What the page shows as selected: the one the link names, or the newest. */
  private get _selectedKey(): string | undefined {
    if (this.selectedSha) {
      return this.selectedSha;
    }
    return this._info?.dirty ? WORKING : this._commits[0]?.sha;
  }

  private async _config(sha: string): Promise<AutomationConfig> {
    const cached = this._configs.get(sha);
    if (cached) {
      return cached;
    }
    const config =
      sha === WORKING
        ? await fetchAutomationFileConfig(this.hass, this.automationId)
        : await fetchAutomationVersion(this.hass, this.automationId, sha);
    if (sha !== WORKING) {
      this._configs.set(sha, config);
    }
    return config;
  }

  private async _loadDetail() {
    const key = this._selectedKey;
    if (!key || this._detail?.key === key) {
      return;
    }
    const request = ++this._detailRequest;
    this._detail = undefined;
    this._compareDiff = undefined;
    this._compareWith = "";
    try {
      // Against the last commit for changes waiting, and against the commit
      // before it for a commit. A version the list does not hold has nothing
      // to be compared with.
      const index =
        key === WORKING ? -1 : this._commits.findIndex((c) => c.sha === key);
      if (key !== WORKING && index === -1) {
        this._detail = {
          key,
          changes: [],
          diff: "",
          error: this._l("vh_version_not_found"),
        };
        return;
      }
      const against =
        key === WORKING ? this._info?.head : this._commits[index + 1]?.sha;
      const [after, before, diff] = await Promise.all([
        this._config(key),
        against ? this._config(against) : Promise.resolve(undefined),
        against
          ? fetchAutomationDiff(
              this.hass,
              this.automationId,
              against,
              key === WORKING ? undefined : key
            ).then((result) => result.diff)
          : Promise.resolve(""),
      ]);
      if (request !== this._detailRequest) {
        return;
      }
      this._detail = {
        key,
        changes: compareAutomationConfigs(before, after),
        diff,
        against: against ?? undefined,
      };
    } catch (err: any) {
      if (request === this._detailRequest) {
        this._detail = {
          key,
          changes: [],
          diff: "",
          error: err?.message || String(err),
        };
      }
    }
  }

  // ---- Helpers ----

  private _short(sha: string): string {
    return sha === WORKING ? this._l("working") : sha.slice(0, 7);
  }

  /** Messages written on save start with the automation's name. */
  private _label(commit: AutomationCommit): string {
    const alias = this._info?.alias ?? "";
    return alias && commit.message.startsWith(`${alias}: `)
      ? commit.message.slice(alias.length + 2)
      : commit.message;
  }

  private _authors(): string[] {
    const counts = new Map<string, number>();
    this._commits.forEach((commit) =>
      counts.set(commit.author, (counts.get(commit.author) ?? 0) + 1)
    );
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([author]) => author);
  }

  private _visibleCommits(): AutomationCommit[] {
    const matches = searchMatcher(this._search);
    return this._commits.filter(
      (commit) =>
        (!this._author || commit.author === this._author) &&
        matches(commit.message, commit.author, commit.sha)
    );
  }

  private _describeStep(change: ConfigChange): string {
    const registry = this._entityRegistry ?? [];
    const config = (change.after ?? change.before) as Record<string, unknown>;
    try {
      if (change.section === "trigger") {
        return describeTrigger(
          migrateAutomationTrigger({
            ...config,
          } as unknown as Trigger) as Trigger,
          this.hass,
          registry
        );
      }
      if (change.section === "condition") {
        return describeCondition(
          config as unknown as Condition,
          this.hass,
          registry
        );
      }
      if (change.section === "action") {
        return describeAction(
          this.hass,
          registry,
          config as unknown as Action,
          undefined,
          undefined,
          this._manifests
        );
      }
    } catch (_err) {
      // A step that cannot be described is shown by its position only.
    }
    return "";
  }

  // ---- Rendering ----

  protected render(): TemplateResult {
    const alias = this._info?.alias ?? this.automationId;
    const breadcrumb = [
      this.hass.localize("panel.config"),
      this.hass.localize("ui.panel.config.automation.caption"),
      alias,
    ].join(", ");
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/automation_history"
        .header=${this._l("vh_title")}
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
              : !this._info && !this._error
                ? html`<p class="empty">${this._l("vh_not_found")}</p>`
                : this._info
                  ? html`${this._renderHeader(this._info)}
                      <div class="columns">
                        <div class="list-column">${this._renderCommits()}</div>
                        ${this._renderDetail(this._info)}
                      </div>`
                  : nothing
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderHeader(info: AutomationRepository) {
    return html`
      <div class="header">
        <span class="tile">
          <ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon>
        </span>
        <div class="header-text">
          <h1>${info.alias}</h1>
          <code>${info.repository}</code>
          <span class="secondary">
            ${
              info.remote_unsafe
                ? this._l("vh_remote_unsafe")
                : info.remote
                  ? this._l("vh_remote", { remote: info.remote })
                  : this._l("vh_no_remote")
            }
          </span>
          <span class="secondary">${this._l("vh_secrets_note")}</span>
        </div>
        <ha-button
          appearance="plain"
          variant="danger"
          ?disabled=${this._busy}
          @click=${this._forget}
        >
          <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
          ${this._l("forget")}
        </ha-button>
        <ha-button
          appearance="filled"
          href=${`/config/automation/edit/${encodeURIComponent(info.id)}`}
        >
          <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
          ${this._l("vh_open_editor")}
        </ha-button>
      </div>
    `;
  }

  private _renderCommits() {
    const info = this._info!;
    const commits = this._visibleCommits();
    const filtering = !!this._search || !!this._author;
    const shown =
      this._showAll || filtering ? commits : commits.slice(0, COMMITS_SHOWN);
    const key = this._selectedKey;
    return html`
      <div class="filters">
        <ha-input-search
          appearance="outlined"
          .value=${this._search}
          .placeholder=${this._l("vh_search_commits")}
          .patternSamples=${this._commits.map((commit) => commit.message)}
          @input=${this._searchChanged}
        ></ha-input-search>
        ${this._authors().map(
          (author) => html`
            <button
              class=${classMap({ chip: true, on: this._author === author })}
              aria-pressed=${this._author === author ? "true" : "false"}
              .author=${author}
              @click=${this._toggleAuthor}
            >
              ${this._l("vh_by_author", { author })}
            </button>
          `
        )}
      </div>
      <ul class="commits">
        ${
          info.dirty
            ? html`<li>
                ${this._renderCommitButton({
                  sha: WORKING,
                  title: this._l("vh_uncommitted"),
                  selected: key === WORKING,
                  meta: html`${this._l("not_committed_hint")}`,
                })}
              </li>`
            : nothing
        }
        ${shown.map(
          (commit) =>
            html`<li>
              ${this._renderCommitButton({
                sha: commit.sha,
                title: this._label(commit),
                selected: key === commit.sha,
                live: !info.dirty && commit.sha === info.head,
                meta: html`${commit.author},
                  <ha-relative-time
                    .hass=${this.hass}
                    .datetime=${new Date(commit.timestamp * 1000)}
                  ></ha-relative-time>`,
              })}
            </li>`
        )}
      </ul>
      ${
        !commits.length
          ? html`<p class="empty">
              ${this._l(this._commits.length ? "vh_no_commit_match" : "vh_no_commits")}
            </p>`
          : nothing
      }
      <div class="list-foot">
        <span class="secondary">
          ${this._l("vh_footer", { count: info.commits })}
        </span>
        ${
          !this._showAll && !filtering && commits.length > COMMITS_SHOWN
            ? html`<button class="link" @click=${this._showAllCommits}>
                ${this._l("vh_show_all")}
              </button>`
            : nothing
        }
      </div>
    `;
  }

  private _renderCommitButton(item: {
    sha: string;
    title: string;
    selected: boolean;
    live?: boolean;
    meta: TemplateResult;
  }) {
    return html`
      <button
        class=${classMap({ commit: true, on: item.selected })}
        aria-current=${item.selected ? "true" : "false"}
        .sha=${item.sha}
        @click=${this._pickCommit}
      >
        <span class="dot"></span>
        <span class="commit-text">
          <span class="primary">${item.title}</span>
          <span class="secondary">${item.meta}</span>
        </span>
        ${item.live ? html`<span class="live">${this._l("live")}</span>` : nothing}
        <code>${this._short(item.sha)}</code>
      </button>
    `;
  }

  private _renderDetail(info: AutomationRepository) {
    const key = this._selectedKey;
    const detail = this._detail;
    const working = key === WORKING;
    const commit = this._commits.find((item) => item.sha === key);
    const title = working
      ? detail
        ? `${this._l("vh_uncommitted")}: ${this._l("vh_uncommitted_count", {
            count: detail.changes.length,
          })}`
        : this._l("vh_uncommitted")
      : commit
        ? this._label(commit)
        : "";
    return html`
      <ha-card class="detail">
        ${
          key
            ? html`
                <div class="detail-head">
                  <div class="detail-title">
                    <h2>${title}</h2>
                    ${
                      commit
                        ? html`<span class="secondary"
                            >${commit.author},
                            <ha-relative-time
                              .hass=${this.hass}
                              .datetime=${new Date(commit.timestamp * 1000)}
                            ></ha-relative-time>
                            · <code>${this._short(commit.sha)}</code></span
                          >`
                        : nothing
                    }
                  </div>
                  <div class="segmented" role="group">
                    ${(["steps", "yaml"] as const).map(
                      (view) =>
                        html`<button
                          class=${classMap({ on: this._view === view })}
                          aria-pressed=${this._view === view ? "true" : "false"}
                          .view=${view}
                          @click=${this._pickView}
                        >
                          ${this._l(`vh_${view}`)}
                        </button>`
                    )}
                  </div>
                </div>
                ${this._renderChanges(detail, working)}
                ${working ? this._renderCommitForm(info, detail) : nothing}
              `
            : html`<p class="empty">${this._l("vh_no_commits")}</p>`
        }
        ${notice(this._notice)}
        <div class="actions-list">
          ${this._renderGoBack(info, key)} ${this._renderCompare(key)}
        </div>
      </ha-card>
    `;
  }

  private _renderChanges(detail: Detail | undefined, working: boolean) {
    if (!detail) {
      return html`<p class="secondary">${this._l("vh_loading_changes")}</p>`;
    }
    if (detail.error) {
      return html`<ha-alert alert-type="error"
        >${this._l("vh_changes_failed")} ${detail.error}</ha-alert
      >`;
    }
    const against = detail.against
      ? this._l(working ? "vh_compared_with" : "vh_compared_with_parent", {
          commit: this._short(detail.against),
        })
      : this._l(working ? "vh_no_last_commit" : "vh_first_commit");
    if (this._view === "yaml") {
      return html`
        ${
          detail.diff.trim()
            ? html`<ha-automation-diff
                .text=${detail.diff}
              ></ha-automation-diff>`
            : html`<p class="secondary">${this._l("diff_empty")}</p>`
        }
        <span class="secondary">${against}</span>
      `;
    }
    return html`
      ${
        detail.changes.length
          ? html`<ul class="changes">
              ${detail.changes.map((change) => this._renderChange(change))}
            </ul>`
          : html`<p class="secondary">${this._l("vh_no_changes")}</p>`
      }
      <span class="secondary">${against}</span>
    `;
  }

  private _renderChange(change: ConfigChange) {
    const section = this._l(`vh_section_${change.section}`);
    const description = this._describeStep(change);
    const name =
      change.section === "other" || change.section === "alias"
        ? `${section} “${change.key}”`
        : `${section} ${(change.index ?? 0) + 1}${description ? `: ${description}` : ""}`;
    return html`<li class=${classMap({ change: true, [change.kind]: true })}>
      <ha-svg-icon
        .path=${
          change.kind === "added"
            ? mdiPlus
            : change.kind === "removed"
              ? mdiMinus
              : mdiPencil
        }
      ></ha-svg-icon>
      <span class="change-text">
        <span class="visually-hidden"
          >${this._l(`vh_change_${change.kind}`)}:
        </span>
        <b>${name}</b>
        ${change.fields.map(
          (field) =>
            html`<span class="field">
              ${
                field.before !== undefined || field.after !== undefined
                  ? this._l("vh_field_change", {
                      field: field.key,
                      before: field.before ?? "…",
                      after: field.after ?? "…",
                    })
                  : this._l("vh_field_changed", { field: field.key })
              }
            </span>`
        )}
      </span>
    </li>`;
  }

  private _renderCommitForm(info: AutomationRepository, detail?: Detail) {
    const suggested = detail
      ? suggestCommitMessage(info.alias, detail.changes)
      : "";
    return html`
      <div class="commit-form">
        <p class="suggested">
          <span class="secondary">${this._l("vh_message_suggested")}</span>
          <span>${suggested || info.alias}</span>
        </p>
        <input
          class="message"
          type="text"
          maxlength="500"
          .value=${this._message}
          placeholder=${this._l("vh_master_message")}
          aria-label=${this._l("vh_master_message")}
          @input=${this._messageChanged}
        />
        <div class="form-actions">
          <ha-button
            appearance="plain"
            ?disabled=${this._busy || !info.head}
            @click=${this._discard}
          >
            <ha-svg-icon slot="start" .path=${mdiUndo}></ha-svg-icon>
            ${this._l("vh_discard")}
          </ha-button>
          <ha-button ?disabled=${this._busy} @click=${this._commit}>
            <ha-svg-icon slot="start" .path=${mdiCloudUpload}></ha-svg-icon>
            ${this._l("vh_commit")}
          </ha-button>
        </div>
        <span class="secondary">${this._l("vh_commit_hint")}</span>
      </div>
    `;
  }

  private _renderGoBack(info: AutomationRepository, key?: string) {
    const disabled =
      !key ||
      key === WORKING ||
      (!info.dirty && key === info.head) ||
      this._busy;
    return html`
      <button class="action" ?disabled=${disabled} @click=${this._goBack}>
        <span class="tile small">
          <ha-svg-icon .path=${mdiRestore}></ha-svg-icon>
        </span>
        <span class="action-text">
          <b>${this._l("vh_go_back")}</b>
          <span class="secondary">${this._l("vh_go_back_hint")}</span>
        </span>
        <ha-svg-icon .path=${mdiChevronRight}></ha-svg-icon>
      </button>
    `;
  }

  private _renderCompare(key?: string) {
    const options = this._commits.filter((commit) => commit.sha !== key);
    return html`
      <div class="action compare">
        <span class="tile small">
          <ha-svg-icon .path=${mdiCompare}></ha-svg-icon>
        </span>
        <span class="action-text">
          <b>${this._l("vh_compare")}</b>
          <span class="secondary">${this._l("vh_compare_hint")}</span>
          <label class="compare-pick">
            <span class="secondary">${this._l("vh_compare_with")}</span>
            <select
              .value=${this._compareWith}
              ?disabled=${!key || key === WORKING}
              @change=${this._compareChanged}
            >
              <option value="">…</option>
              <option value=${WORKING}>${this._l("vh_compare_now")}</option>
              ${options.map(
                (commit) =>
                  html`<option value=${commit.sha}>
                    ${this._short(commit.sha)}: ${this._label(commit)}
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
                : html`<span class="secondary">${this._l("diff_empty")}</span>`
              : nothing
          }
        </span>
      </div>
    `;
  }

  // ---- Handlers ----

  private _searchChanged(ev: Event) {
    this._search = (ev.target as HaInputSearch).value ?? "";
  }

  private _toggleAuthor(ev: Event) {
    const author = (ev.currentTarget as HTMLElement & { author: string })
      .author;
    this._author = this._author === author ? "" : author;
  }

  private _showAllCommits() {
    this._showAll = true;
  }

  private _pickCommit(ev: Event) {
    const sha = (ev.currentTarget as HTMLElement & { sha: string }).sha;
    this._notice = undefined;
    fireEvent(this, "automation-repo-commit-selected", { sha });
  }

  private _pickView(ev: Event) {
    this._view = (
      ev.currentTarget as HTMLElement & { view: "steps" | "yaml" }
    ).view;
  }

  private _messageChanged(ev: Event) {
    this._message = (ev.currentTarget as HTMLInputElement).value;
  }

  private async _commit() {
    this._busy = true;
    this._notice = undefined;
    try {
      const result = await pushAutomationRepos(
        this.hass,
        this._message.trim() || undefined,
        [this.automationId]
      );
      this._message = "";
      this._notice = result.skipped.length
        ? result.skipped.map((item) => item.reason).join(" ")
        : this._l("vh_commit_done", {
            commit: result.master_commit
              ? result.master_commit.slice(0, 7)
              : this._l("push_master_unchanged"),
          });
      this._detail = undefined;
      await this._load();
      fireEvent(this, "automation-repo-commit-selected", {
        sha: this._commits[0]?.sha ?? "",
      });
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _discard() {
    const head = this._info?.head;
    if (!head) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("vh_discard_title", { alias: this._info!.alias }),
      text: this._l("vh_discard_text", { version: this._short(head) }),
      confirmText: this._l("vh_discard"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    await this._saveVersion(head);
  }

  private async _forget() {
    const info = this._info;
    if (!info) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("forget_title", { alias: info.alias }),
      text: this._l("forget_text"),
      confirmText: this._l("forget"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    try {
      await forgetAutomationHistory(this.hass, this.automationId);
      this._detail = undefined;
      this._configs.clear();
      await this._load();
      fireEvent(this, "automation-repo-commit-selected", {
        sha: this._commits[0]?.sha ?? "",
      });
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _goBack() {
    const key = this._selectedKey;
    if (!key || key === WORKING) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("make_live_title", { alias: this._info!.alias }),
      text: this._l("make_live_text", { version: this._short(key) }),
      confirmText: this._l("make_live"),
    });
    if (!confirmed) {
      return;
    }
    await this._saveVersion(key);
  }

  /** Saves a version as the automation. Saving reloads and records it. */
  private async _saveVersion(sha: string) {
    this._busy = true;
    try {
      const config = await this._config(sha);
      await recordAutomation(this.hass, this.automationId, "Before going back");
      await saveAutomationConfig(this.hass, this.automationId, config);
      window.setTimeout(async () => {
        this._detail = undefined;
        await this._load();
        fireEvent(this, "automation-repo-commit-selected", {
          sha: this._info?.dirty ? WORKING : (this._commits[0]?.sha ?? ""),
        });
      }, 1500);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.body?.message || err?.message || String(err),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _compareChanged(ev: Event) {
    const other = (ev.currentTarget as HTMLSelectElement).value;
    this._compareWith = other;
    const key = this._selectedKey;
    if (!other || !key || key === WORKING) {
      this._compareDiff = undefined;
      return;
    }
    try {
      // The older of the two comes first, as a diff reads from old to new.
      const position = (sha: string) =>
        sha === WORKING
          ? -1
          : this._commits.findIndex((commit) => commit.sha === sha);
      const [older, newer] =
        position(key) > position(other) ? [key, other] : [other, key];
      const { diff } = await fetchAutomationDiff(
        this.hass,
        this.automationId,
        older,
        newer === WORKING ? undefined : newer
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
    p {
      margin: 0;
    }
    .secondary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
    }
    .empty {
      padding: var(--ha-space-6);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-4);
    }
    .header-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      flex: 1 1 240px;
      min-width: 0;
    }
    .tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-14);
      height: var(--ha-space-14);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-color));
    }
    .tile.small {
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      flex: none;
      background: var(--ha-color-fill-neutral-normal-resting);
      color: inherit;
    }
    code {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
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
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
    }
    .filters ha-input-search {
      flex: 1 1 200px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
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
    input:focus-visible,
    select:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .chip {
      min-height: var(--ha-space-9);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      font-size: var(--ha-font-size-s);
    }
    .chip.on {
      border-color: transparent;
      background: var(--ha-color-fill-primary-normal-resting);
      font-weight: var(--ha-font-weight-medium);
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
      min-height: var(--ha-space-14);
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
    .commit.on .primary {
      color: var(--ha-color-on-primary-normal, var(--primary-color));
    }
    .dot {
      flex: none;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--primary-color);
    }
    .commit.on .dot {
      outline: 3px solid var(--card-background-color);
    }
    .live {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-color));
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
    }
    .list-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .link {
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
    .detail-head {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
    }
    .detail-title {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
      flex: 1 1 200px;
    }
    .segmented {
      display: inline-flex;
      padding: var(--ha-space-1);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-neutral-normal-resting);
    }
    .segmented button {
      min-height: var(--ha-space-8);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-s);
    }
    .segmented button.on {
      background: var(--card-background-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .changes {
      list-style: none;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .change {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-3);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      --mdc-icon-size: 18px;
    }
    .change.changed {
      background: var(--ha-color-fill-warning-quiet-resting);
      color: var(--ha-color-on-warning-quiet, inherit);
    }
    .change.added {
      background: var(--ha-color-fill-success-quiet-resting);
      color: var(--ha-color-on-success-quiet, inherit);
    }
    .change.removed {
      background: var(--ha-color-fill-danger-quiet-resting);
      color: var(--ha-color-on-danger-quiet, inherit);
    }
    .change-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .field {
      font-size: var(--ha-font-size-s);
    }
    .commit-form {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding-top: var(--ha-space-3);
      border-top: 1px solid var(--divider-color);
    }
    .suggested {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      background: var(--ha-color-fill-neutral-quiet-resting);
      overflow-wrap: anywhere;
    }
    .message {
      height: var(--ha-space-10);
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
      min-width: 0;
    }
    .form-actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: var(--ha-space-2);
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
      min-height: var(--ha-space-9);
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

const notice = (text?: string) =>
  text ? html`<p class="notice" role="status">${text}</p>` : nothing;

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-automation-repo": HaConfigAutomationRepo;
  }
}
