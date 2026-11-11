import {
  mdiCheck,
  mdiClockOutline,
  mdiClose,
  mdiCloudUpload,
  mdiCog,
  mdiCompare,
  mdiDotsVertical,
  mdiExport,
  mdiFileCompare,
  mdiFlask,
  mdiHistory,
  mdiMinus,
  mdiPencil,
  mdiPlay,
  mdiRestore,
  mdiShieldCheck,
  mdiSourceBranch,
  mdiSourceRepository,
  mdiStop,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ensureArray } from "../../../common/array/ensure-array";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { navigate } from "../../../common/navigate";
import type {
  CheckState,
  VersionRef,
  VersionTestResult,
} from "../../../common/automation/version-tests";
import {
  guardedDomains,
  isFailing,
  runLimited,
  summarizeResults,
  versionKey,
  WORKING,
} from "../../../common/automation/version-tests";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { AutomationConfig, Condition } from "../../../data/automation";
import {
  fetchAutomationFileConfig,
  saveAutomationConfig,
  testAllConditions,
} from "../../../data/automation";
import type {
  AutomationCommit,
  AutomationPushResult,
  AutomationReposStatus,
} from "../../../data/automation_repos";
import {
  fetchAutomationDiff,
  fetchAutomationHistory,
  fetchAutomationReposStatus,
  fetchAutomationVersion,
  pushAutomationRepos,
  setAutomationRemote,
} from "../../../data/automation_repos";
import { validateConfig } from "../../../data/config";
import type { Action } from "../../../data/script";
import { callExecuteScript } from "../../../data/service";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import { configSections } from "../config-sections";
import "./ha-automation-diff";
import "./ha-config-automation-repo";
import type {
  HistoryFilter,
  HistoryRange,
} from "./automation-history-query-params";
import {
  automationHistoryQueryParamConfig,
  decodeAutomationHistoryQueryParams,
  HISTORY_FILTERS,
  HISTORY_RANGES,
  queryParamsFromState,
  repositoryUrl,
  stateFromQueryParams,
} from "./automation-history-query-params";

interface VersionRow extends VersionRef {
  message: string;
  author?: string;
  /** Seconds since 1970; left out for uncommitted changes. */
  timestamp?: number;
  /** The version the automation runs now. */
  live: boolean;
}

type Filter = HistoryFilter;

/** Versions listed before Load more. */
const PAGE_SIZE = 25;

/** Which repositories the list of repositories shows. */
type RepoFilter = "changes" | "clean";

/** How many tests run at the same time. */
const TESTS_AT_ONCE = 4;

/** Longest a single test may take. */
const TEST_TIMEOUT_MS = 10000;

const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> =>
  Promise.race([
    promise,
    new Promise<T>((_resolve, reject) => {
      setTimeout(() => reject(new Error("timeout")), ms);
    }),
  ]);

/**
 * The history manager for automations.
 *
 * Every save of an automation is a commit in that automation's own Git
 * repository. This page lists every version of every automation, and lets a
 * person test one or many (nothing in the house changes), run one or many
 * (the actions happen for real, after a confirmation), compare two, make an
 * old version live again, export, and commit everything to the master
 * repository in one step.
 */
@customElement("ha-config-automation-history")
export class HaConfigAutomationHistory extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _status?: AutomationReposStatus;

  @state() private _rows: VersionRow[] = [];

  @state() private _error?: string;

  @state() private _loading = true;

  @state() private _search = "";

  @state() private _filters: Filter[] = [];

  /** The automation the list is limited to; empty for all of them. */
  @state() private _automation = "";

  @state() private _range: HistoryRange = "all";

  /** Versions shown before Load more. */
  @state() private _limit = PAGE_SIZE;

  /** The automation whose version history is open, and the commit shown. */
  @state() private _repository?: string;

  @state() private _commit?: string;

  /** When the running bulk test started, for the time it has left. */
  private _testStartedAt = 0;

  private _urlParams = new QueryParamsController(
    this,
    automationHistoryQueryParamConfig,
    {
      enabled: () => true,
      navigated: () => this._applyUrl(),
    }
  );

  @state() private _selected: string[] = [];

  @state() private _results: Record<string, VersionTestResult> = {};

  @state() private _testing?: VersionRef[];

  @state() private _testRunning = false;

  @state() private _stopTests = false;

  @state() private _diff?: { title: string; text: string };

  @state() private _askEach = true;

  @state() private _skipGuarded = true;

  @state() private _running = false;

  @state() private _runLog: { alias: string; outcome: string }[] = [];

  @state() private _message = "";

  @state() private _pushing = false;

  @state() private _pushResult?: AutomationPushResult;

  @state() private _preview?: { title: string; text: string };

  @state() private _repoSearch = "";

  @state() private _repoFilter?: RepoFilter;

  @state() private _repoSelected: string[] = [];

  private _configs = new Map<string, AutomationConfig>();

  protected firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    this._applyUrl();
    this._load();
  }

  /**
   * A link names the state it wants, so it replaces what was chosen before:
   * a filter left over would hide part of what the link shows.
   */
  private _applyUrl() {
    const params = this._urlParams.searchParams();
    if (!params) {
      return;
    }
    const next = stateFromQueryParams(
      decodeAutomationHistoryQueryParams(params)
    );
    this._search = next.search;
    this._filters = next.filters;
    this._automation = next.automation;
    this._range = next.range;
    this._repository = next.repository;
    this._commit = next.commit;
    this._limit = PAGE_SIZE;
  }

  private _writeUrl(debounced = false) {
    this._urlParams.write(
      queryParamsFromState({
        search: this._search,
        filters: this._filters,
        automation: this._automation,
        range: this._range,
        repository: this._repository,
        commit: this._commit,
      }),
      debounced
    );
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      // The keys of this page live under one node.
      `ui.panel.config.automation_history.${key}` as any,
      values
    );
  }

  // ---- Loading ----

  private async _load() {
    this._loading = true;
    this._error = undefined;
    try {
      const status = await fetchAutomationReposStatus(this.hass);
      const histories = await Promise.all(
        status.automations.map((automation) =>
          fetchAutomationHistory(this.hass, automation.id).then(
            (commits): [string, AutomationCommit[]] => [automation.id, commits]
          )
        )
      );
      const byId = new Map(histories);
      const rows: VersionRow[] = [];
      status.automations.forEach((automation) => {
        if (automation.dirty) {
          rows.push({
            automationId: automation.id,
            alias: automation.alias,
            sha: WORKING,
            message: this._l("not_committed"),
            live: true,
          });
        }
        (byId.get(automation.id) ?? []).forEach((commit) => {
          rows.push({
            automationId: automation.id,
            alias: automation.alias,
            sha: commit.sha,
            message: commit.message,
            author: commit.author,
            timestamp: commit.timestamp,
            live: !automation.dirty && commit.sha === automation.head,
          });
        });
      });
      rows.sort(
        (a, b) => (b.timestamp ?? Infinity) - (a.timestamp ?? Infinity)
      );
      this._status = status;
      this._rows = rows;
      const known = new Set(rows.map(versionKey));
      this._selected = this._selected.filter((key) => known.has(key));
      this._repoSelected = this._repoSelected.filter((id) =>
        status.automations.some((automation) => automation.id === id)
      );
    } catch (err: any) {
      this._error = err?.message || String(err);
    } finally {
      this._loading = false;
    }
  }

  private async _config(ref: VersionRef): Promise<AutomationConfig> {
    const key = versionKey(ref);
    const cached = this._configs.get(key);
    if (cached) {
      return cached;
    }
    const config =
      ref.sha === WORKING
        ? await fetchAutomationFileConfig(this.hass, ref.automationId)
        : await fetchAutomationVersion(this.hass, ref.automationId, ref.sha);
    if (ref.sha !== WORKING) {
      this._configs.set(key, config);
    }
    return config;
  }

  // ---- Testing ----

  /**
   * Tests one version without changing anything: does it load, and do its
   * conditions pass at this moment.
   */
  private async _testOne(ref: VersionRef): Promise<void> {
    const result: VersionTestResult = {
      loads: "none",
      conditions: "none",
      testedAt: Date.now(),
    };
    try {
      const config = await withTimeout(this._config(ref), TEST_TIMEOUT_MS);
      const triggers = ensureArray(config.triggers ?? (config as any).trigger);
      const conditions = ensureArray(
        config.conditions ?? (config as any).condition
      ).filter(Boolean) as Condition[];
      const actions = ensureArray(config.actions ?? (config as any).action);
      const validation = await withTimeout(
        validateConfig(this.hass, {
          triggers: triggers ?? [],
          conditions,
          actions: actions ?? [],
        }),
        TEST_TIMEOUT_MS
      );
      const invalid = (["triggers", "conditions", "actions"] as const).find(
        (part) => !validation[part].valid
      );
      if (invalid) {
        result.loads = "fail";
        const failed = validation[invalid];
        result.detail = `${this._l(`part_${invalid}`)}: ${
          "error" in failed ? failed.error : ""
        }`;
      } else {
        result.loads = "pass";
        if (conditions.length) {
          // A condition that cannot be evaluated is a failed condition, not
          // an automation that does not load.
          try {
            const tested = await withTimeout(
              testAllConditions(this.hass, conditions),
              TEST_TIMEOUT_MS
            );
            result.conditions = tested.result ? "pass" : "fail";
            if (!tested.result) {
              result.detail = this._l("conditions_not_met");
            }
          } catch (err: any) {
            result.conditions = "fail";
            result.detail =
              err?.message === "timeout"
                ? this._l("test_timeout", { seconds: TEST_TIMEOUT_MS / 1000 })
                : err?.message || String(err);
          }
        }
      }
    } catch (err: any) {
      result.loads = "fail";
      result.detail =
        err?.message === "timeout"
          ? this._l("test_timeout", { seconds: TEST_TIMEOUT_MS / 1000 })
          : err?.message || String(err);
    }
    this._results = { ...this._results, [versionKey(ref)]: result };
  }

  private async _testMany(refs: VersionRef[]) {
    if (!refs.length || this._testRunning) {
      return;
    }
    this._testing = refs;
    this._testStartedAt = Date.now();
    this._testRunning = true;
    this._stopTests = false;
    const cleared = { ...this._results };
    refs.forEach((ref) => delete cleared[versionKey(ref)]);
    this._results = cleared;
    await runLimited(
      refs,
      TESTS_AT_ONCE,
      (ref) => this._testOne(ref),
      () => this._stopTests
    );
    this._testRunning = false;
  }

  // ---- Running ----

  private async _runMany(refs: VersionRef[]) {
    if (!refs.length || this._running) {
      return;
    }
    const plans: {
      ref: VersionRef;
      config: AutomationConfig;
      guarded: string[];
    }[] = [];
    for (const ref of refs) {
      // Read one at a time: the confirmation below needs all of them.
      // eslint-disable-next-line no-await-in-loop
      const config = await this._config(ref);
      const actions = config.actions ?? (config as any).action;
      plans.push({ ref, config, guarded: guardedDomains(actions) });
    }
    const willRun = plans.filter(
      (plan) => !(this._skipGuarded && plan.guarded.length)
    );
    const left = plans.length - willRun.length;
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("run_confirm_title", { count: willRun.length }),
      text: `${this._l("run_confirm_text")} ${willRun
        .map((plan) => `${plan.ref.alias} (${this._short(plan.ref.sha)})`)
        .join(
          ", "
        )}.${left ? ` ${this._l("run_left_out", { count: left })}` : ""}`,
      confirmText: this._l("run_confirm_button", { count: willRun.length }),
      destructive: true,
    });
    if (!confirmed || !willRun.length) {
      return;
    }
    this._running = true;
    this._runLog = plans
      .filter((plan) => this._skipGuarded && plan.guarded.length)
      .map((plan) => ({
        alias: plan.ref.alias,
        outcome: this._l("run_skipped_guarded", {
          domains: plan.guarded.join(", "),
        }),
      }));
    for (const plan of willRun) {
      if (this._askEach) {
        // One question at a time, in order.
        // eslint-disable-next-line no-await-in-loop
        const go = await showConfirmationDialog(this, {
          title: this._l("run_one_title", { alias: plan.ref.alias }),
          text: this._l("run_one_text", {
            count: ensureArray(
              plan.config.actions ?? (plan.config as any).action ?? []
            ).length,
            version: this._short(plan.ref.sha),
          }),
          confirmText: this._l("run_one_button"),
        });
        if (!go) {
          this._runLog = [
            ...this._runLog,
            { alias: plan.ref.alias, outcome: this._l("run_declined") },
          ];
          continue;
        }
      }
      try {
        // One after another, as the page says.
        // eslint-disable-next-line no-await-in-loop
        await callExecuteScript(
          this.hass,
          ensureArray(
            plan.config.actions ?? (plan.config as any).action ?? []
          ) as Action[]
        );
        this._runLog = [
          ...this._runLog,
          { alias: plan.ref.alias, outcome: this._l("run_done") },
        ];
      } catch (err: any) {
        this._runLog = [
          ...this._runLog,
          {
            alias: plan.ref.alias,
            outcome: this._l("run_failed", {
              error: err?.message || String(err),
            }),
          },
        ];
      }
    }
    this._running = false;
  }

  // ---- Compare, make live, export, commit ----

  private async _compare(refs: VersionRef[]) {
    try {
      if (refs.length === 2 && refs[0].automationId === refs[1].automationId) {
        const [newer, older] = refs;
        if (newer.sha === WORKING || older.sha === WORKING) {
          const commit = newer.sha === WORKING ? older : newer;
          const { diff } = await fetchAutomationDiff(
            this.hass,
            commit.automationId,
            commit.sha
          );
          this._diff = {
            title: this._l("diff_title_now", {
              alias: commit.alias,
              version: this._short(commit.sha),
            }),
            text: diff,
          };
          return;
        }
        const { diff } = await fetchAutomationDiff(
          this.hass,
          older.automationId,
          older.sha,
          newer.sha
        );
        this._diff = {
          title: this._l("diff_title", {
            alias: older.alias,
            old: this._short(older.sha),
            new: this._short(newer.sha),
          }),
          text: diff,
        };
        return;
      }
      const ref = refs[0];
      if (!ref || ref.sha === WORKING) {
        return;
      }
      const { diff } = await fetchAutomationDiff(
        this.hass,
        ref.automationId,
        ref.sha
      );
      this._diff = {
        title: this._l("diff_title_now", {
          alias: ref.alias,
          version: this._short(ref.sha),
        }),
        text: diff,
      };
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    }
  }

  private async _makeLive(ref: VersionRef) {
    if (ref.sha === WORKING) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("make_live_title", { alias: ref.alias }),
      text: this._l("make_live_text", { version: this._short(ref.sha) }),
      confirmText: this._l("make_live"),
    });
    if (!confirmed) {
      return;
    }
    try {
      const config = await this._config(ref);
      await saveAutomationConfig(this.hass, ref.automationId, config);
      // Saving reloads automations, and the reload commits the change.
      window.setTimeout(() => this._load(), 1500);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.body?.message || err?.message || String(err),
      });
    }
  }

  private async _export(refs: VersionRef[]) {
    const versions = await Promise.all(
      refs.map(async (ref) => ({
        automation_id: ref.automationId,
        alias: ref.alias,
        commit: ref.sha,
        config: await this._config(ref),
        test: this._results[versionKey(ref)] ?? null,
      }))
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify({ exported: versions }, null, 2)], {
        type: "application/json",
      })
    );
    fileDownload(url, "automation-versions.json");
    window.setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  private async _push() {
    this._pushing = true;
    this._pushResult = undefined;
    try {
      // With repositories ticked, only those are committed; without, all
      this._pushResult = await pushAutomationRepos(
        this.hass,
        this._message.trim() || undefined,
        this._repoSelected.length ? this._repoSelected : undefined
      );
      this._message = "";
      this._repoSelected = [];
      await this._load();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    } finally {
      this._pushing = false;
    }
  }

  // The address of the remote of the master repository. Empty removes it.
  private async _editRemote() {
    const answer = await showPromptDialog(this, {
      title: this._l("remote_title"),
      inputLabel: this._l("remote_label"),
      textBelowInput: this._l("remote_hint"),
      defaultValue: this._status?.master.remote ?? "",
      confirmText: this._l("remote_save"),
    });
    if (answer === null) {
      return;
    }
    try {
      await setAutomationRemote(this.hass, null, answer.trim() || null);
      await this._load();
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    }
  }

  // Every change that waits, as one piece of text: each changed automation
  // compared with its last commit. An automation that has no commit yet has
  // nothing to compare with, and is counted instead.
  private async _previewChanges() {
    const waiting = (this._status?.automations ?? []).filter(
      (item) => item.dirty
    );
    try {
      const parts = await Promise.all(
        waiting
          .filter((item) => item.head)
          .map(async (item) => {
            const { diff } = await fetchAutomationDiff(
              this.hass,
              item.id,
              item.head!
            );
            return `=== ${item.alias} ===\n${diff}`;
          })
      );
      const uncommitted = waiting.filter((item) => !item.head);
      this._preview = {
        title: this._l("preview_title", { count: waiting.length }),
        text: [
          ...parts,
          ...uncommitted.map(
            (item) => `=== ${item.alias} ===\n${this._l("preview_new")}`
          ),
        ].join("\n"),
      };
    } catch (err: any) {
      showAlertDialog(this, {
        title: this._l("action_failed"),
        text: err?.message || String(err),
      });
    }
  }

  // ---- Rendering ----

  private _short(sha: string): string {
    return sha === WORKING ? this._l("working") : sha.slice(0, 7);
  }

  // Messages written on save already start with the automation's name.
  private _label(row: VersionRow): string {
    return row.message.startsWith(`${row.alias}:`)
      ? row.message
      : `${row.alias}: ${row.message}`;
  }

  private _visibleRows(): VersionRow[] {
    const matches = searchMatcher(this._search);
    // Changes that are not committed yet have no time, and are always shown.
    const since =
      this._range === "all"
        ? 0
        : Date.now() / 1000 - Number(this._range) * 86400;
    return this._rows.filter((row) => {
      if (this._automation && row.automationId !== this._automation) {
        return false;
      }
      if (row.timestamp !== undefined && row.timestamp < since) {
        return false;
      }
      if (!matches(row.alias, row.message, row.sha, row.author)) {
        return false;
      }
      const result = this._results[versionKey(row)];
      return this._filters.every((filter) =>
        filter === "live"
          ? row.live
          : filter === "failing"
            ? isFailing(result)
            : !result
      );
    });
  }

  private _selectedRefs(): VersionRow[] {
    const selected = new Set(this._selected);
    return this._rows.filter((row) => selected.has(versionKey(row)));
  }

  protected render(): TemplateResult {
    if (this._repository) {
      return html`<ha-config-automation-repo
        .hass=${this.hass}
        .narrow=${this.narrow}
        .automationId=${this._repository}
        .selectedSha=${this._commit}
        @automation-repo-commit-selected=${this._repoCommitSelected}
      ></ha-config-automation-repo>`;
    }
    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.automations}
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
          ${this._renderMaster()}
          <div class="repos-grid">
            ${this._renderRepositories()} ${this._renderSteps()}
          </div>
          ${this._renderDiff(this._preview, this._closePreview)}
          ${this._renderRemoteCards()}
          <div class="heading history-heading">
            <div class="heading-text">
              <h2>${this._l("title")}</h2>
              <p>${this._l("description")}</p>
            </div>
            ${this._renderScope()}
          </div>
          ${this._renderSelectionBar()}
          <div class="columns">
            <div class="main">${this._renderList()}</div>
            <div class="side">
              ${this._renderBulkTest()} ${this._renderBulkRun()}
              ${this._renderFailure()}
            </div>
          </div>
          ${this._renderDiff()}
        </div>
      </hass-tabs-subpage>
    `;
  }

  private _commitLabel(status: AutomationReposStatus): string {
    if (this._repoSelected.length) {
      return this._l("commit_selected", { count: this._repoSelected.length });
    }
    const hasRemote =
      !!status.master.remote || status.automations.some((item) => item.remote);
    return this._l(hasRemote ? "commit_all_push" : "commit_all");
  }

  private _renderMaster() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const waiting = status.automations.filter((item) => item.dirty).length;
    const result = this._pushResult;
    return html`
      <div class="hero">
        <ha-card class="master">
          <div class="master-text">
            <span class="eyebrow">
              <ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon>
              ${this._l("master_eyebrow", {
                count: status.automations.length,
              })}
            </span>
            <h1 class="master-title">
              ${this._l("master_title", { count: waiting })}
            </h1>
            <p class="master-sentence">
              ${this._l("master_text", { count: status.automations.length })}
            </p>
            <span class="secondary">
              ${
                status.master.head
                  ? this._l("master_head", {
                      commit: status.master.head.slice(0, 7),
                    })
                  : this._l("master_empty")
              }
              ${
                status.master.remote
                  ? this._l("master_remote", { remote: status.master.remote })
                  : this._l("master_no_remote")
              }
            </span>
          </div>
          ${
            result
              ? html`<div class="push-result" role="status">
                  <span
                    >${this._l("push_result", {
                      committed: result.committed.length,
                      unchanged: result.unchanged,
                    })}
                    ${
                      result.master_commit
                        ? this._l("push_master", {
                            commit: result.master_commit.slice(0, 7),
                          })
                        : this._l("push_master_unchanged")
                    }
                    ${
                      result.pushed.length
                        ? this._l("push_sent", { count: result.pushed.length })
                        : ""
                    }</span
                  >
                  ${[...result.skipped, ...result.push_errors].map(
                    (item) =>
                      html`<span class="warning"
                        >${item.id}:
                        ${"reason" in item ? item.reason : item.error}</span
                      >`
                  )}
                </div>`
              : nothing
          }
        </ha-card>
        <div class="hero-actions">
          <ha-button size="l" ?disabled=${this._pushing} @click=${this._push}>
            <ha-svg-icon slot="start" .path=${mdiCloudUpload}></ha-svg-icon>
            ${this._commitLabel(status)}
          </ha-button>
          <ha-button appearance="outlined" size="l" @click=${this._editRemote}>
            <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
            ${this._l("remote_settings")}
          </ha-button>
        </div>
      </div>
    `;
  }

  private _visibleRepos() {
    const matches = searchMatcher(this._repoSearch);
    return (this._status?.automations ?? []).filter(
      (item) =>
        matches(item.alias, item.repository) &&
        (this._repoFilter === "changes"
          ? item.dirty
          : this._repoFilter === "clean"
            ? !item.dirty
            : true)
    );
  }

  // Every automation has its own repository inside the master
  private _renderRepositories() {
    const status = this._status;
    if (!status) {
      return this._loading
        ? html`<div class="repos">
            <p class="empty">${this._l("loading")}</p>
          </div>`
        : nothing;
    }
    const repos = this._visibleRepos();
    const selected = new Set(this._repoSelected);
    return html`
      <div class="repos">
        <div class="filters">
          <ha-input-search
            appearance="outlined"
            .value=${this._repoSearch}
            .placeholder=${this._l("repo_search")}
            .patternSamples=${status.automations.map(
              (item) => `${item.alias} ${item.repository}`
            )}
            @input=${this._repoSearchChanged}
          ></ha-input-search>
          ${(["changes", "clean"] as const).map(
            (filter) => html`
              <button
                class=${classMap({
                  chip: true,
                  on: this._repoFilter === filter,
                })}
                aria-pressed=${this._repoFilter === filter ? "true" : "false"}
                .repoFilter=${filter}
                @click=${this._toggleRepoFilter}
              >
                ${this._l(`repo_filter_${filter}`)}
              </button>
            `
          )}
        </div>
        <div class="table" role="table" aria-label=${this._l("repo_title")}>
          <div class="row repo head" role="row">
            <span role="columnheader" class="check">
              <input
                type="checkbox"
                aria-label=${this._l("repo_select_all")}
                .checked=${
                  repos.length > 0 &&
                  repos.every((item) => selected.has(item.id))
                }
                @change=${this._toggleAllRepos}
              />
            </span>
            <span role="columnheader"
              >${this._l("repo_column_automation")}</span
            >
            <span role="columnheader">${this._l("repo_column_state")}</span>
            <span role="columnheader" class="push-column"
              >${this._l("repo_column_push")}</span
            >
          </div>
          ${
            this._loading
              ? html`<p class="empty">${this._l("loading")}</p>`
              : repos.length
                ? repos.map((item) => {
                    const doing = item.dirty
                      ? item.remote || status.master.remote
                        ? "repo_do_commit_push"
                        : "repo_do_commit"
                      : "repo_do_nothing";
                    return html`
                      <div
                        class=${classMap({
                          row: true,
                          repo: true,
                          on: selected.has(item.id),
                        })}
                        role="row"
                      >
                        <span role="cell" class="check">
                          <input
                            type="checkbox"
                            aria-label=${this._l("repo_select", {
                              alias: item.alias,
                            })}
                            .checked=${selected.has(item.id)}
                            .repoId=${item.id}
                            @change=${this._toggleRepo}
                          />
                        </span>
                        <span role="cell" class="repo-name">
                          <span class="tile">
                            <ha-svg-icon
                              .path=${mdiSourceRepository}
                            ></ha-svg-icon>
                          </span>
                          <span class="version">
                            <span class="primary">${item.alias}</span>
                            <span class="secondary"
                              ><code>${item.repository}</code> ·
                              ${this._l("repo_commits", {
                                count: item.commits,
                              })}</span
                            >
                          </span>
                        </span>
                        <span role="cell">
                          <span
                            class=${classMap({
                              "state-chip": true,
                              changes: item.dirty,
                              clean: !item.dirty,
                            })}
                            >${this._l(
                              item.dirty
                                ? "repo_state_changes"
                                : "repo_state_clean"
                            )}</span
                          >
                        </span>
                        <span role="cell" class="push-column"
                          >${this._l(doing)}</span
                        >
                      </div>
                    `;
                  })
                : html`<p class="empty">
                    ${this._l(
                      status.automations.length ? "repo_no_match" : "repo_none"
                    )}
                  </p>`
          }
        </div>
        <p class="secondary count">
          ${this._l("repo_showing", {
            shown: repos.length,
            total: status.automations.length,
          })}
        </p>
      </div>
    `;
  }

  // What a push does, step by step, with the message and the two buttons
  private _renderSteps() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const waiting = status.automations.filter((item) => item.dirty).length;
    const steps = [
      { title: "step_check_title", text: "step_check_text" },
      { title: "step_commit_title", text: "step_commit_text" },
      { title: "step_master_title", text: "step_master_text" },
      { title: "step_send_title", text: "step_send_text" },
    ];
    return html`
      <ha-card class="panel steps">
        <h2>${this._l("steps_title")}</h2>
        <ol>
          ${steps.map(
            (step, index) => html`
              <li>
                <span class="step-number">${index + 1}</span>
                <span class="setting-text">
                  <span class="primary">${this._l(step.title)}</span>
                  <span class="secondary"
                    >${this._l(step.text, { count: waiting })}</span
                  >
                </span>
              </li>
            `
          )}
        </ol>
        <input
          class="message"
          type="text"
          maxlength="500"
          .value=${this._message}
          placeholder=${this._l("message_placeholder")}
          aria-label=${this._l("message_placeholder")}
          @input=${this._messageChanged}
        />
        <p class="safe">
          <ha-svg-icon .path=${mdiShieldCheck}></ha-svg-icon>
          ${this._l("steps_safe")}
        </p>
        <div class="panel-actions">
          <ha-button
            appearance="plain"
            ?disabled=${!waiting}
            @click=${this._previewChanges}
          >
            <ha-svg-icon slot="start" .path=${mdiFileCompare}></ha-svg-icon>
            ${this._l("preview_changes")}
          </ha-button>
          <ha-button ?disabled=${this._pushing} @click=${this._push}>
            <ha-svg-icon slot="start" .path=${mdiCloudUpload}></ha-svg-icon>
            ${this._commitLabel(status)}
          </ha-button>
        </div>
      </ha-card>
    `;
  }

  // Where the master goes, and what is left out of it
  private _renderRemoteCards() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const remote = status.master.remote;
    return html`
      <div class="cards">
        <ha-card class="panel">
          <h2>${this._l("card_remote_title")}</h2>
          <div class="setting">
            <span class="tile">
              <ha-svg-icon .path=${mdiCloudUpload}></ha-svg-icon>
            </span>
            <span class="setting-text">
              <span class="primary remote-address"
                >${remote ?? this._l("card_remote_none")}</span
              >
              <span class="secondary">
                ${
                  status.master.last_commit
                    ? html`${this._l("card_remote_last")}
                        <ha-relative-time
                          .hass=${this.hass}
                          .datetime=${new Date(status.master.last_commit * 1000)}
                        ></ha-relative-time>`
                    : this._l("master_empty")
                }
              </span>
            </span>
            <ha-button appearance="plain" size="s" @click=${this._editRemote}>
              <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
              ${this._l(remote ? "card_remote_change" : "card_remote_add")}
            </ha-button>
          </div>
        </ha-card>
        <ha-card class="panel">
          <h2>${this._l("card_secrets_title")}</h2>
          <div class="setting">
            <span class="tile">
              <ha-svg-icon .path=${mdiShieldCheck}></ha-svg-icon>
            </span>
            <span class="setting-text">
              <span class="secondary">${this._l("card_secrets_text")}</span>
            </span>
          </div>
        </ha-card>
      </div>
    `;
  }

  private _renderSelectionBar() {
    const selected = this._selectedRefs();
    if (!selected.length) {
      return nothing;
    }
    const sameAutomation =
      selected.length === 2 &&
      selected[0].automationId === selected[1].automationId;
    const single = selected.length === 1 ? selected[0] : undefined;
    return html`
      <div class="selection" role="toolbar">
        <span class="selection-count"
          >${this._l("selected", { count: selected.length })}</span
        >
        <button class="link" @click=${this._selectLive}>
          ${this._l("select_live")}
        </button>
        <button class="link" @click=${this._clearSelection}>
          ${this._l("clear_selection")}
        </button>
        <span class="spacer"></span>
        <ha-button
          size="small"
          ?disabled=${this._testRunning}
          @click=${this._testSelected}
        >
          <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
          ${this._l("test_selected")}
        </ha-button>
        <ha-button
          size="small"
          ?disabled=${this._running}
          @click=${this._runSelected}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this._l("run_selected")}
        </ha-button>
        <ha-button
          size="small"
          ?disabled=${!(sameAutomation || (single && single.sha !== WORKING))}
          @click=${this._compareSelected}
        >
          <ha-svg-icon slot="start" .path=${mdiCompare}></ha-svg-icon>
          ${this._l("compare")}
        </ha-button>
        <ha-button
          size="small"
          ?disabled=${!single || single.sha === WORKING || single.live}
          @click=${this._makeLiveSelected}
        >
          <ha-svg-icon slot="start" .path=${mdiRestore}></ha-svg-icon>
          ${this._l("make_live")}
        </ha-button>
        <ha-button size="small" @click=${this._exportSelected}>
          <ha-svg-icon slot="start" .path=${mdiExport}></ha-svg-icon>
          ${this._l("export")}
        </ha-button>
      </div>
    `;
  }

  private _badge(check: CheckState, label: string) {
    return html`<span
      class=${classMap({ badge: true, [check]: true })}
      role="img"
      aria-label=${`${label}: ${this._l(`state_${check}`)}`}
      title=${`${label}: ${this._l(`state_${check}`)}`}
    >
      <ha-svg-icon
        .path=${check === "pass" ? mdiCheck : check === "fail" ? mdiClose : mdiMinus}
      ></ha-svg-icon>
    </span>`;
  }

  private _renderList() {
    const rows = this._visibleRows();
    const shown = rows.slice(0, this._limit);
    const selected = new Set(this._selected);
    return html`
      <div class="filters">
        <ha-input-search
          appearance="outlined"
          .value=${this._search}
          .placeholder=${this._l("search")}
          .patternSamples=${this._rows.map(
            (row) => `${row.alias}: ${row.message}`
          )}
          @input=${this._searchChanged}
        ></ha-input-search>
        ${HISTORY_FILTERS.map(
          (filter) => html`
            <button
              class=${classMap({
                chip: true,
                on: this._filters.includes(filter),
              })}
              aria-pressed=${this._filters.includes(filter) ? "true" : "false"}
              .filter=${filter}
              @click=${this._toggleFilter}
            >
              ${this._l(`filter_${filter}`)}
            </button>
          `
        )}
      </div>
      <div class="table" role="table" aria-label=${this._l("title")}>
        <div class="row head" role="row">
          <span role="columnheader" class="check">
            <input
              type="checkbox"
              aria-label=${this._l("select_all")}
              .checked=${
                rows.length > 0 &&
                rows.every((row) => selected.has(versionKey(row)))
              }
              @change=${this._toggleAll}
            />
          </span>
          <span role="columnheader" class="version"
            >${this._l("column_version")}</span
          >
          <span role="columnheader" class="commit"
            >${this._l("column_commit")}</span
          >
          <span role="columnheader" class="checks"
            >${this._l("column_checks")}</span
          >
          <span role="columnheader" class="actions"></span>
          <span role="columnheader" class="menu"></span>
        </div>
        ${
          this._loading
            ? html`<p class="empty">${this._l("loading")}</p>`
            : rows.length
              ? shown.map((row) => {
                  const key = versionKey(row);
                  const result = this._results[key];
                  return html`
                    <div
                      class=${classMap({
                        row: true,
                        on: selected.has(key),
                      })}
                      role="row"
                    >
                      <span role="cell" class="check">
                        <input
                          type="checkbox"
                          aria-label=${this._l("select_version", {
                            alias: row.alias,
                            version: this._short(row.sha),
                          })}
                          .checked=${selected.has(key)}
                          .key=${key}
                          @change=${this._toggleRow}
                        />
                      </span>
                      <span role="cell" class="version">
                        <span class="primary">${this._label(row)}</span>
                        <span class="secondary">
                          ${
                            row.timestamp
                              ? html`${row.author},
                                  <ha-relative-time
                                    .hass=${this.hass}
                                    .datetime=${new Date(row.timestamp * 1000)}
                                  ></ha-relative-time>`
                              : this._l("not_committed_hint")
                          }
                        </span>
                      </span>
                      <span role="cell" class="commit">
                        <code>${this._short(row.sha)}</code>
                        ${
                          row.live
                            ? html`<span class="live">${this._l("live")}</span>`
                            : nothing
                        }
                      </span>
                      <span role="cell" class="checks">
                        ${
                          result
                            ? html`${this._badge(
                                result.loads,
                                this._l("check_loads")
                              )}${this._badge(
                                result.conditions,
                                this._l("check_conditions")
                              )}`
                            : this._waiting(row)
                              ? this._waitingBadges()
                              : html`<span class="secondary"
                                  >${this._l("never_tested")}</span
                                >`
                        }
                      </span>
                      <span role="cell" class="actions">
                        <ha-button
                          appearance="plain"
                          size="small"
                          .row=${row}
                          ?disabled=${this._testRunning}
                          @click=${this._testRow}
                        >
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiFlask}
                          ></ha-svg-icon>
                          ${this._l("test")}
                        </ha-button>
                      </span>
                      <span role="cell" class="menu">
                        ${this._renderRowMenu(row)}
                      </span>
                    </div>
                  `;
                })
              : html`<p class="empty">
                  ${this._l(this._rows.length ? "no_match" : "no_versions")}
                </p>`
        }
      </div>
      <div class="list-foot">
        <p class="secondary count">
          ${this._l("showing", {
            shown: shown.length,
            total: this._rows.length,
            automations: this._status?.automations.length ?? 0,
          })}
        </p>
        ${
          rows.length > shown.length
            ? html`<button class="link" @click=${this._loadMore}>
                ${this._l("load_more")}
              </button>`
            : nothing
        }
      </div>
    `;
  }

  /** A version that is in the test that is running and has no result yet. */
  private _waiting(row: VersionRow): boolean {
    return (
      this._testRunning &&
      !!this._testing?.some((ref) => versionKey(ref) === versionKey(row))
    );
  }

  private _waitingBadges() {
    return html`${[this._l("check_loads"), this._l("check_conditions")].map(
      (label) =>
        html`<span
          class="badge"
          role="img"
          aria-label=${`${label}: ${this._l("state_running")}`}
          title=${`${label}: ${this._l("state_running")}`}
        >
          <ha-svg-icon .path=${mdiClockOutline}></ha-svg-icon>
        </span>`
    )}`;
  }

  private _renderRowMenu(row: VersionRow) {
    const working = row.sha === WORKING;
    return html`
      <ha-dropdown .row=${row} @wa-select=${this._rowMenuSelected}>
        <ha-icon-button
          slot="trigger"
          .label=${this._l("row_menu", { alias: row.alias })}
          .path=${mdiDotsVertical}
        ></ha-icon-button>
        <ha-dropdown-item value="history">
          ${this._l("row_history")}
          <ha-svg-icon slot="icon" .path=${mdiHistory}></ha-svg-icon>
        </ha-dropdown-item>
        <ha-dropdown-item value="compare" .disabled=${working}>
          ${this._l("row_compare")}
          <ha-svg-icon slot="icon" .path=${mdiCompare}></ha-svg-icon>
        </ha-dropdown-item>
        <ha-dropdown-item value="make_live" .disabled=${working || row.live}>
          ${this._l("make_live")}
          <ha-svg-icon slot="icon" .path=${mdiRestore}></ha-svg-icon>
        </ha-dropdown-item>
        <ha-dropdown-item value="export">
          ${this._l("export")}
          <ha-svg-icon slot="icon" .path=${mdiExport}></ha-svg-icon>
        </ha-dropdown-item>
      </ha-dropdown>
    `;
  }

  private _renderScope() {
    const automations = this._status?.automations ?? [];
    return html`
      <div class="scope">
        <label class="scope-field">
          <span class="secondary">${this._l("scope_automation")}</span>
          <select .value=${this._automation} @change=${this._automationChanged}>
            <option value="" ?selected=${!this._automation}>
              ${this._l("scope_all", { count: automations.length })}
            </option>
            ${automations.map(
              (automation) =>
                html`<option
                  value=${automation.id}
                  ?selected=${this._automation === automation.id}
                >
                  ${automation.alias}
                </option>`
            )}
          </select>
        </label>
        <label class="scope-field">
          <span class="secondary">${this._l("scope_versions")}</span>
          <select .value=${this._range} @change=${this._rangeChanged}>
            ${HISTORY_RANGES.map(
              (range) =>
                html`<option value=${range} ?selected=${this._range === range}>
                  ${this._l(`range_${range}`)}
                </option>`
            )}
          </select>
        </label>
      </div>
    `;
  }

  private _renderBulkTest() {
    const refs = this._testing;
    const summary = refs
      ? summarizeResults(refs, this._results)
      : { total: 0, done: 0, passed: 0, failed: 0 };
    return html`
      <ha-card class="panel">
        <div class="panel-head">
          <h2>${this._l("bulk_test")}</h2>
          ${
            this._testRunning
              ? html`<span class="live">${this._l("running")}</span>`
              : nothing
          }
        </div>
        ${
          refs
            ? html`
                <progress
                  max=${summary.total}
                  .value=${summary.done}
                  aria-label=${this._l("bulk_test")}
                ></progress>
                <p role="status">
                  ${this._l("bulk_test_summary", {
                    total: summary.total,
                    done: summary.done,
                    passed: summary.passed,
                    failed: summary.failed,
                  })}
                  ${this._testRunning ? this._timeLeft(summary) : nothing}
                </p>
              `
            : html`<p class="secondary">${this._l("bulk_test_idle")}</p>`
        }
        <dl>
          <dt>${this._l("fact_pretend")}</dt>
          <dd>${this._l("fact_pretend_value")}</dd>
          <dt>${this._l("fact_limit")}</dt>
          <dd>
            ${this._l("fact_limit_value", {
              seconds: TEST_TIMEOUT_MS / 1000,
            })}
          </dd>
          <dt>${this._l("fact_at_once")}</dt>
          <dd>${TESTS_AT_ONCE}</dd>
        </dl>
        <div class="panel-actions">
          ${
            this._testRunning
              ? html`<ha-button
                  appearance="outlined"
                  size="small"
                  @click=${this._stopTesting}
                >
                  <ha-svg-icon slot="start" .path=${mdiStop}></ha-svg-icon>
                  ${this._l("stop")}
                </ha-button>`
              : html`<ha-button
                  appearance="outlined"
                  size="small"
                  ?disabled=${!this._rows.length}
                  @click=${this._testLive}
                >
                  <ha-svg-icon slot="start" .path=${mdiFlask}></ha-svg-icon>
                  ${this._l("test_every_live")}
                </ha-button>`
          }
        </div>
      </ha-card>
    `;
  }

  private _renderBulkRun() {
    const selected = this._selectedRefs();
    return html`
      <ha-card class="panel">
        <h2>${this._l("bulk_run")}</h2>
        <p>${this._l("bulk_run_description")}</p>
        <label class="setting">
          <span class="setting-text">
            <span>${this._l("ask_each")}</span>
            <span class="secondary">${this._l("ask_each_hint")}</span>
          </span>
          <ha-switch
            .checked=${this._askEach}
            @change=${this._askEachChanged}
          ></ha-switch>
        </label>
        <label class="setting">
          <span class="setting-text">
            <span>${this._l("skip_guarded")}</span>
            <span class="secondary">${this._l("skip_guarded_hint")}</span>
          </span>
          <ha-switch
            .checked=${this._skipGuarded}
            @change=${this._skipGuardedChanged}
          ></ha-switch>
        </label>
        <div class="panel-actions">
          <ha-button
            ?disabled=${!selected.length || this._running}
            @click=${this._runSelected}
          >
            <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
            ${this._l("run_count", { count: selected.length })}
          </ha-button>
        </div>
        ${
          this._runLog.length
            ? html`<ul class="log" role="status">
                ${this._runLog.map(
                  (entry) =>
                    html`<li><b>${entry.alias}</b>: ${entry.outcome}</li>`
                )}
              </ul>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _renderFailure() {
    const failing = this._rows.find((row) =>
      isFailing(this._results[versionKey(row)])
    );
    if (!failing) {
      return nothing;
    }
    const result = this._results[versionKey(failing)];
    return html`
      <ha-card class="panel failure">
        <h2>
          ${this._l("failure_title", {
            alias: failing.alias,
            version: this._short(failing.sha),
          })}
        </h2>
        <p>${result?.detail ?? ""}</p>
        <div class="panel-actions">
          <ha-button
            appearance="outlined"
            size="small"
            href=${repositoryUrl(
              failing.automationId,
              failing.sha === WORKING ? undefined : failing.sha
            )}
          >
            <ha-svg-icon slot="start" .path=${mdiHistory}></ha-svg-icon>
            ${this._l("open_version")}
          </ha-button>
          <ha-button
            appearance="outlined"
            size="small"
            href=${`/config/automation/edit/${failing.automationId}`}
          >
            ${this._l("open_automation")}
          </ha-button>
        </div>
      </ha-card>
    `;
  }

  private _renderDiff(diff = this._diff, close: () => void = this._closeDiff) {
    if (!diff) {
      return nothing;
    }
    return html`
      <ha-card class="diff">
        <div class="panel-head">
          <h2>${diff.title}</h2>
          <ha-button appearance="plain" size="small" @click=${close}>
            ${this._l("close")}
          </ha-button>
        </div>
        ${
          diff.text.trim()
            ? html`<ha-automation-diff .text=${diff.text}></ha-automation-diff>`
            : html`<p class="secondary">${this._l("diff_empty")}</p>`
        }
      </ha-card>
    `;
  }

  // ---- Handlers ----

  private _messageChanged(ev: Event) {
    this._message = (ev.currentTarget as HTMLInputElement).value;
  }

  private _searchChanged(ev: Event) {
    this._search = (ev.target as HaInputSearch).value ?? "";
    this._limit = PAGE_SIZE;
    this._writeUrl(true);
  }

  private _toggleFilter(ev: Event) {
    const filter = (ev.currentTarget as HTMLElement & { filter: Filter })
      .filter;
    this._filters = this._filters.includes(filter)
      ? this._filters.filter((item) => item !== filter)
      : [...this._filters, filter];
    this._limit = PAGE_SIZE;
    this._writeUrl();
  }

  private _automationChanged(ev: Event) {
    this._automation = (ev.currentTarget as HTMLSelectElement).value;
    this._limit = PAGE_SIZE;
    this._writeUrl();
  }

  private _rangeChanged(ev: Event) {
    this._range = (ev.currentTarget as HTMLSelectElement).value as HistoryRange;
    this._limit = PAGE_SIZE;
    this._writeUrl();
  }

  private _loadMore() {
    this._limit += PAGE_SIZE;
  }

  /** What is left of a running test, guessed from how long it has taken. */
  private _timeLeft(summary: { total: number; done: number }) {
    if (!summary.done || summary.done >= summary.total) {
      return nothing;
    }
    const perVersion = (Date.now() - this._testStartedAt) / summary.done;
    const seconds = Math.max(
      1,
      Math.round((perVersion * (summary.total - summary.done)) / 1000)
    );
    return this._l("bulk_test_left", { seconds });
  }

  private _rowMenuSelected(ev: HaDropdownSelectEvent) {
    const row = (ev.currentTarget as HTMLElement & { row: VersionRow }).row;
    switch (ev.detail?.item?.value) {
      case "history":
        this._openRepository(row.automationId, row.sha);
        break;
      case "compare":
        this._compare([row]);
        break;
      case "make_live":
        this._makeLive(row);
        break;
      case "export":
        this._export([row]);
        break;
    }
  }

  private _openRepository(automationId: string, sha?: string) {
    navigate(repositoryUrl(automationId, sha === WORKING ? undefined : sha));
  }

  private _repoCommitSelected(ev: CustomEvent<{ sha: string }>) {
    this._commit = ev.detail.sha || undefined;
    this._writeUrl();
  }

  private _toggleRow(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement & { key: string };
    this._selected = input.checked
      ? [...new Set([...this._selected, input.key])]
      : this._selected.filter((key) => key !== input.key);
  }

  private _toggleAll(ev: Event) {
    const keys = this._visibleRows().map(versionKey);
    this._selected = (ev.currentTarget as HTMLInputElement).checked
      ? [...new Set([...this._selected, ...keys])]
      : this._selected.filter((key) => !keys.includes(key));
  }

  private _selectLive() {
    this._selected = this._rows.filter((row) => row.live).map(versionKey);
  }

  private _clearSelection() {
    this._selected = [];
  }

  private _testRow(ev: Event) {
    this._testMany([
      (ev.currentTarget as HTMLElement & { row: VersionRow }).row,
    ]);
  }

  private _testSelected() {
    this._testMany(this._selectedRefs());
  }

  private _testLive() {
    this._testMany(this._rows.filter((row) => row.live));
  }

  private _stopTesting() {
    this._stopTests = true;
  }

  private _runSelected() {
    this._runMany(this._selectedRefs());
  }

  private _compareSelected() {
    this._compare(this._selectedRefs());
  }

  private _makeLiveSelected() {
    const [ref] = this._selectedRefs();
    if (ref) {
      this._makeLive(ref);
    }
  }

  private _exportSelected() {
    this._export(this._selectedRefs());
  }

  private _askEachChanged(ev: Event) {
    this._askEach = (ev.currentTarget as HTMLInputElement).checked;
  }

  private _skipGuardedChanged(ev: Event) {
    this._skipGuarded = (ev.currentTarget as HTMLInputElement).checked;
  }

  private _closePreview = () => {
    this._preview = undefined;
  };

  private _repoSearchChanged(ev: Event) {
    this._repoSearch = (ev.target as HaInputSearch).value ?? "";
  }

  private _toggleRepoFilter(ev: Event) {
    const filter = (
      ev.currentTarget as HTMLElement & { repoFilter: RepoFilter }
    ).repoFilter;
    this._repoFilter = this._repoFilter === filter ? undefined : filter;
  }

  private _toggleRepo(ev: Event) {
    const input = ev.currentTarget as HTMLInputElement & { repoId: string };
    this._repoSelected = input.checked
      ? [...new Set([...this._repoSelected, input.repoId])]
      : this._repoSelected.filter((id) => id !== input.repoId);
  }

  private _toggleAllRepos(ev: Event) {
    const ids = this._visibleRepos().map((item) => item.id);
    this._repoSelected = (ev.currentTarget as HTMLInputElement).checked
      ? [...new Set([...this._repoSelected, ...ids])]
      : this._repoSelected.filter((id) => !ids.includes(id));
  }

  private _closeDiff() {
    this._diff = undefined;
  }

  static styles: CSSResultGroup = css`
    .page {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
      padding: var(--ha-space-6);
      max-width: 1320px;
      margin: 0 auto;
    }
    h1 {
      margin: 0;
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-normal);
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    p {
      margin: 0;
    }
    .heading p,
    .secondary {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .heading p {
      font-size: var(--ha-font-size-m);
      margin-top: var(--ha-space-1);
    }
    .master {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-4);
      padding: var(--ha-space-6);
      --ha-card-background: var(--ha-color-fill-primary-quiet-resting);
    }
    .master-text {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      flex: 1 1 320px;
    }
    .eyebrow {
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
      font-size: var(--ha-font-size-s);
      --mdc-icon-size: 18px;
    }
    .master-title {
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-normal);
      line-height: var(--ha-line-height-condensed);
    }
    .master-sentence {
      font-size: var(--ha-font-size-m);
      line-height: var(--ha-line-height-normal);
    }
    .hero {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(200px, 260px);
      gap: var(--ha-space-4);
      align-items: start;
    }
    .hero-actions {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
    .repos-grid {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
      gap: var(--ha-space-4);
      align-items: start;
    }
    .repos {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .row.repo {
      grid-template-columns: 40px minmax(0, 1.6fr) 120px minmax(0, 1.2fr);
    }
    .repo-name {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-width: 0;
    }
    .tile {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: var(--ha-space-10);
      height: var(--ha-space-10);
      border-radius: var(--ha-border-radius-lg);
      background: var(--ha-color-fill-neutral-normal-resting);
      --mdc-icon-size: 20px;
    }
    .state-chip {
      display: inline-block;
      padding: 2px var(--ha-space-3);
      border-radius: var(--ha-border-radius-pill);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .state-chip.changes {
      background: var(--ha-color-fill-warning-normal-resting);
      color: var(--ha-color-on-warning-normal);
    }
    .state-chip.clean {
      background: var(--ha-color-fill-success-normal-resting);
      color: var(--ha-color-on-success-normal, var(--success-color));
    }
    .steps ol {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .steps li {
      display: flex;
      align-items: flex-start;
      gap: var(--ha-space-3);
    }
    .step-number {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      border-radius: 50%;
      background: var(--ha-color-fill-primary-normal-resting);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
    }
    .steps .message {
      min-width: 0;
      width: 100%;
      box-sizing: border-box;
    }
    .safe {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
      --mdc-icon-size: 20px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(min(280px, 100%), 1fr));
      gap: var(--ha-space-4);
    }
    .remote-address {
      overflow-wrap: anywhere;
    }
    @media (max-width: 600px) {
      .page {
        padding: var(--ha-space-3);
      }
    }
    @media (max-width: 900px) {
      .hero,
      .repos-grid {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    @media (max-width: 700px) {
      .row.repo {
        grid-template-columns: 40px minmax(0, 1fr) auto;
      }
      .row.repo .push-column {
        display: none;
      }
    }
    .message {
      height: var(--ha-space-10);
      min-width: 0;
      max-width: 100%;
      box-sizing: border-box;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
    }
    .push-result {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      flex: 1 1 100%;
      font-size: var(--ha-font-size-s);
    }
    .warning {
      color: var(--error-color);
    }
    .selection {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: var(--ha-border-radius-pill);
      background: var(--primary-text-color);
      color: var(--card-background-color);
    }
    .selection-count {
      font-weight: var(--ha-font-weight-medium);
      margin-inline-end: var(--ha-space-2);
    }
    .spacer {
      flex: 1;
    }
    button {
      font: inherit;
      color: inherit;
      border: none;
      background: none;
      cursor: pointer;
    }
    .link {
      text-decoration: underline;
      font-size: var(--ha-font-size-s);
    }
    button:focus-visible,
    input:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .columns {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr);
      gap: var(--ha-space-4);
      align-items: start;
    }
    @media (max-width: 900px) {
      .columns {
        grid-template-columns: minmax(0, 1fr);
      }
    }
    .main,
    .side {
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
      flex: 1 1 260px;
      --ha-input-search-border-radius: var(--ha-border-radius-pill);
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
    .table {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
    }
    .row {
      display: grid;
      grid-template-columns: 40px minmax(0, 1fr) 132px 96px 96px 40px;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: var(--ha-space-14);
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    .row.head {
      min-height: 0;
      background: none;
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .row.on {
      background: var(--ha-color-fill-primary-normal-resting);
    }
    .check input {
      width: 20px;
      height: 20px;
      accent-color: var(--primary-color);
    }
    .version {
      display: flex;
      flex-direction: column;
      min-width: 0;
    }
    .primary {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .commit {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }
    code {
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
    }
    .live {
      padding: 2px var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill);
      background: var(--ha-color-fill-primary-normal-resting);
      color: var(--ha-color-on-primary-normal, var(--primary-color));
      font-size: var(--ha-font-size-xs);
      font-weight: var(--ha-font-weight-medium);
    }
    .checks {
      display: flex;
      gap: var(--ha-space-1);
    }
    .badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: var(--ha-space-8);
      height: var(--ha-space-8);
      border-radius: var(--ha-border-radius-md);
      background: var(--ha-color-fill-neutral-normal-resting);
      --mdc-icon-size: 18px;
    }
    .badge.pass {
      background: var(--ha-color-fill-success-normal-resting);
      color: var(--ha-color-on-success-normal, var(--success-color));
    }
    .badge.fail {
      background: var(--ha-color-fill-danger-normal-resting);
      color: var(--ha-color-on-danger-normal, var(--error-color));
    }
    .actions {
      justify-self: end;
    }
    .menu {
      justify-self: end;
    }
    /* On a phone the row has two lines: the version, then what was checked. */
    @media (max-width: 700px) {
      .row {
        grid-template-columns: 40px minmax(0, 1fr) auto;
        grid-template-areas:
          "check version menu"
          ". commit commit"
          ". checks checks"
          ". actions actions";
      }
      .row .check {
        grid-area: check;
      }
      .row .version {
        grid-area: version;
      }
      .row .commit {
        grid-area: commit;
      }
      .row .checks {
        grid-area: checks;
      }
      .row .actions {
        grid-area: actions;
        justify-self: start;
      }
      .row .menu {
        grid-area: menu;
      }
      .row.head {
        grid-template-columns: 40px minmax(0, 1fr);
        grid-template-areas: "check version";
      }
      .row.head .commit,
      .row.head .checks,
      .row.head .actions,
      .row.head .menu {
        display: none;
      }
    }
    .history-heading {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-end;
      justify-content: space-between;
      gap: var(--ha-space-4);
    }
    .heading-text {
      flex: 1 1 280px;
      min-width: 0;
    }
    .scope {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .scope-field {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      min-width: 160px;
    }
    .scope-field select {
      min-height: var(--ha-space-10);
      padding: 0 var(--ha-space-3);
      border-radius: var(--ha-border-radius-md);
      border: 1px solid var(--outline-color);
      background: var(--card-background-color);
      color: inherit;
      font: inherit;
    }
    .scope-field select:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .list-foot {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .list-foot .link {
      color: var(--primary-color);
      font-weight: var(--ha-font-weight-medium);
    }
    .empty {
      padding: var(--ha-space-6);
      text-align: center;
      color: var(--secondary-text-color);
    }
    .panel {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
      padding: var(--ha-space-6);
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-2);
    }
    .panel-actions {
      display: flex;
      justify-content: flex-end;
      gap: var(--ha-space-2);
    }
    progress {
      width: 100%;
      height: 6px;
      accent-color: var(--primary-color);
    }
    dl {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--ha-space-2) var(--ha-space-4);
      margin: 0;
      font-size: var(--ha-font-size-s);
    }
    dt {
      color: var(--secondary-text-color);
    }
    dd {
      margin: 0;
      font-weight: var(--ha-font-weight-medium);
      text-align: end;
    }
    .setting {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
    }
    .setting-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .log {
      margin: 0;
      padding-inline-start: var(--ha-space-5);
      font-size: var(--ha-font-size-s);
    }
    .failure {
      --ha-card-background: var(--ha-color-fill-danger-quiet-resting);
      color: var(--ha-color-on-danger-quiet, var(--error-color));
    }
    .diff {
      padding: var(--ha-space-6);
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-3);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-automation-history": HaConfigAutomationHistory;
  }
}
