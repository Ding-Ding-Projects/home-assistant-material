import {
  mdiCheck,
  mdiClose,
  mdiCloudUpload,
  mdiCompare,
  mdiExport,
  mdiFlask,
  mdiMinus,
  mdiPlay,
  mdiRestore,
  mdiSourceBranch,
  mdiStop,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { ensureArray } from "../../../common/array/ensure-array";
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
} from "../../../data/automation_repos";
import { validateConfig } from "../../../data/config";
import type { Action } from "../../../data/script";
import { callExecuteScript } from "../../../data/service";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import { configSections } from "../config-sections";

interface VersionRow extends VersionRef {
  message: string;
  author?: string;
  /** Seconds since 1970; left out for uncommitted changes. */
  timestamp?: number;
  /** The version the automation runs now. */
  live: boolean;
}

type Filter = "failing" | "live" | "untested";

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

  private _configs = new Map<string, AutomationConfig>();

  protected firstUpdated(changed: PropertyValues) {
    super.firstUpdated(changed);
    this._load();
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
      this._pushResult = await pushAutomationRepos(
        this.hass,
        this._message.trim() || undefined
      );
      this._message = "";
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
    return this._rows.filter((row) => {
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
    return html`
      <hass-tabs-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config"
        .tabs=${configSections.automations}
      >
        <div class="page">
          <div class="heading">
            <h1>${this._l("title")}</h1>
            <p>${this._l("description")}</p>
          </div>
          ${
            this._error
              ? html`<ha-alert
                  alert-type="error"
                  .title=${this._l("load_failed")}
                  >${this._error}</ha-alert
                >`
              : nothing
          }
          ${this._renderMaster()} ${this._renderSelectionBar()}
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

  private _renderMaster() {
    const status = this._status;
    if (!status) {
      return nothing;
    }
    const waiting = status.automations.filter((item) => item.dirty).length;
    const result = this._pushResult;
    return html`
      <ha-card class="master">
        <div class="master-text">
          <span class="eyebrow">
            <ha-svg-icon .path=${mdiSourceBranch}></ha-svg-icon>
            ${this._l("master_eyebrow", {
              count: status.automations.length,
            })}
          </span>
          <span class="master-title"
            >${this._l("master_title", { count: waiting })}</span
          >
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
        <div class="master-actions">
          <input
            class="message"
            type="text"
            maxlength="500"
            .value=${this._message}
            placeholder=${this._l("message_placeholder")}
            aria-label=${this._l("message_placeholder")}
            @input=${this._messageChanged}
          />
          <ha-button ?disabled=${this._pushing} @click=${this._push}>
            <ha-svg-icon slot="start" .path=${mdiCloudUpload}></ha-svg-icon>
            ${this._l("commit_all")}
          </ha-button>
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
        ${(["failing", "live", "untested"] as const).map(
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
        </div>
        ${
          this._loading
            ? html`<p class="empty">${this._l("loading")}</p>`
            : rows.length
              ? rows.map((row) => {
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
                    </div>
                  `;
                })
              : html`<p class="empty">
                  ${this._l(this._rows.length ? "no_match" : "no_versions")}
                </p>`
        }
      </div>
      <p class="secondary count">
        ${this._l("showing", {
          shown: rows.length,
          total: this._rows.length,
          automations: this._status?.automations.length ?? 0,
        })}
      </p>
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
            href=${`/config/automation/edit/${failing.automationId}`}
          >
            ${this._l("open_automation")}
          </ha-button>
        </div>
      </ha-card>
    `;
  }

  private _renderDiff() {
    if (!this._diff) {
      return nothing;
    }
    return html`
      <ha-card class="diff">
        <div class="panel-head">
          <h2>${this._diff.title}</h2>
          <ha-button appearance="plain" size="small" @click=${this._closeDiff}>
            ${this._l("close")}
          </ha-button>
        </div>
        ${
          this._diff.text.trim()
            ? html`<div class="diff-text" role="group">
                ${this._diff.text
                  .split("\n")
                  .map(
                    (line) =>
                      html`<div
                        class=${
                          line.startsWith("+") && !line.startsWith("+++")
                            ? "added"
                            : line.startsWith("-") && !line.startsWith("---")
                              ? "removed"
                              : ""
                        }
                        .textContent=${line}
                      ></div>`
                  )}
              </div>`
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
  }

  private _toggleFilter(ev: Event) {
    const filter = (ev.currentTarget as HTMLElement & { filter: Filter })
      .filter;
    this._filters = this._filters.includes(filter)
      ? this._filters.filter((item) => item !== filter)
      : [...this._filters, filter];
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
      font-size: var(--ha-font-size-2xl);
    }
    .master-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      align-items: center;
    }
    .message {
      height: var(--ha-space-10);
      min-width: 240px;
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
      grid-template-columns: 40px minmax(0, 1fr) 132px 96px 96px;
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
    .diff-text {
      padding: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-neutral-quiet-resting);
      font-family: var(--ha-font-family-code);
      font-size: var(--ha-font-size-s);
      overflow-x: auto;
    }
    /* Lines are set as text, so only their own spaces show. */
    .diff-text > div {
      white-space: pre;
      min-height: 1.4em;
    }
    .diff-text .added {
      color: var(--success-color);
    }
    .diff-text .removed {
      color: var(--error-color);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-automation-history": HaConfigAutomationHistory;
  }
}
