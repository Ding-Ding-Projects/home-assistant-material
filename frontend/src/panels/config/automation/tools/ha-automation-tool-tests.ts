import {
  mdiContentCopy,
  mdiDelete,
  mdiFlaskOutline,
  mdiPencil,
  mdiPlay,
  mdiPlus,
} from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { getStorage } from "../../../../common/decorators/storage";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-icon-button";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-select";
import "../../../../components/ha-spinner";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input";
import type { ManualAutomationConfig } from "../../../../data/automation";
import { haStyle } from "../../../../resources/styles";
import { buildFlowGraph } from "./flow-graph";
import type { FlowNode } from "./flow-graph";
import { flowNodeLabel } from "./node-label";
import "./ha-automation-situation-form";
import type { AutomationToolContext } from "./registry";
import type { Situation } from "./simulate";
import type {
  CaseMismatch,
  CaseResult,
  CoverageRow,
  TestCase,
} from "./test-cases";
import {
  buildPathIndex,
  computeCoverage,
  evaluateTestCase,
  exportCases,
  parseStoredCases,
  storageKeyFor,
  summarizeCoverage,
} from "./test-cases";

type Expectation = "none" | "run" | "skip";

interface Editing {
  draft: TestCase;
  isNew: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

const nowTime = () => {
  const now = new Date();
  return `${pad(now.getHours())}:${pad(now.getMinutes())}`;
};

const newId = () =>
  `case-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

@customElement("ha-automation-tool-tests")
export class HaAutomationToolTests extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _cases: TestCase[] = [];

  @state() private _loadedFor?: string;

  @state() private _editing?: Editing;

  @state() private _results: Record<string, CaseResult> = {};

  @state() private _ranConfig?: ManualAutomationConfig;

  @state() private _running = false;

  @state() private _error?: string;

  @state() private _copied = false;

  private _index = memoizeOne((config: unknown) => buildPathIndex(config));

  private _graph = memoizeOne((config: unknown) => buildFlowGraph(config));

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.tests.${key}` as any,
      vars as any
    );
  }

  protected willUpdate(): void {
    const id = this.context.automationId;
    if (id && this._loadedFor !== id) {
      this._loadedFor = id;
      this._cases = parseStoredCases(getStorage().getValue(storageKeyFor(id)));
      this._results = {};
      this._ranConfig = undefined;
    }
  }

  private _save(cases: TestCase[]) {
    this._cases = cases;
    const id = this.context.automationId;
    if (id) {
      getStorage().setValue(storageKeyFor(id), cases);
    }
  }

  private _nodeLabel(node: FlowNode): string {
    return flowNodeLabel(
      this.context.hass,
      this._graph(this.context.config).nodes,
      node
    );
  }

  private _pathLabel(path: string): string {
    const node = this._graph(this.context.config).nodes.find(
      (n) => n.path === path
    );
    return node ? this._nodeLabel(node) : path;
  }

  private _rowLabel(row: CoverageRow): string {
    const node = this._graph(this.context.config).nodes.find(
      (n) => n.path === row.path
    );
    const label = node ? this._nodeLabel(node) : row.path;
    if (row.kind === "condition_pass") {
      return this._t("condition_passes", { title: label });
    }
    if (row.kind === "condition_fail") {
      return this._t("condition_fails", { title: label });
    }
    return label;
  }

  private _mismatchText(m: CaseMismatch): string {
    const step = this._pathLabel(m.path);
    if (m.actual === "missing") {
      return this._t("mismatch_missing", { step });
    }
    return this._t(m.expected === "run" ? "mismatch_run" : "mismatch_skip", {
      step,
    });
  }

  protected render() {
    if (!this.context.automationId) {
      return html`<ha-alert alert-type="info"
        >${this._t("needs_save")}</ha-alert
      >`;
    }
    const config = this.context.config;
    const index = this._index(config);
    const results = this._cases
      .map((c) => this._results[c.id])
      .filter((r): r is CaseResult => !!r);
    const rows = computeCoverage(index.items, results);
    const summary = summarizeCoverage(rows);
    const ran = results.length > 0;
    const stale = ran && this._ranConfig !== config;
    return html`
      <div class="actions">
        <ha-button @click=${this._startNew}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this._t("add")}
        </ha-button>
        <ha-button
          appearance="outlined"
          .disabled=${!this._cases.length || this._running}
          @click=${this._runAll}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this._t("run_all")}
        </ha-button>
        <ha-button
          appearance="plain"
          .disabled=${!this._cases.length}
          @click=${this._copy}
        >
          <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
          ${this._copied ? this._t("copied") : this._t("copy")}
        </ha-button>
      </div>
      <p class="summary">
        ${
          ran
            ? this._t("summary", {
                covered: summary.branchesCovered,
                total: summary.branches,
                stepsCovered: summary.stepsCovered,
                steps: summary.steps,
              })
            : this._t("summary_none")
        }
      </p>
      ${stale ? html`<p class="hint">${this._t("summary_stale")}</p>` : nothing}
      ${this._error ? html`<ha-alert alert-type="error">${this._error}</ha-alert>` : nothing}
      ${this._editing ? this._renderForm(this._editing) : nothing}
      <div class="grid">
        <section class="card">
          <h3>${this._t("list_title")}</h3>
          ${
            this._cases.length
              ? html`<ul class="cases">
                  ${this._cases.map((c) => this._renderCase(c))}
                </ul>`
              : html`<p class="hint">${this._t("empty")}</p>`
          }
        </section>
        <section class="card">
          <h3>${this._t("coverage_title")}</h3>
          ${
            rows.length
              ? html`<ul class="coverage">
                  ${rows.map((row) => this._renderCoverage(row, ran))}
                </ul>`
              : html`<p class="hint">${this._t("no_flow")}</p>`
          }
          <p class="hint">${this._t("limits")}</p>
        </section>
      </div>
    `;
  }

  private _statusOf(c: TestCase): CaseResult["status"] | "not_run" {
    return this._results[c.id]?.status ?? "not_run";
  }

  private _renderCase(c: TestCase) {
    const status = this._statusOf(c);
    const result = this._results[c.id];
    const detail =
      status === "failed" && result?.mismatches.length
        ? this._mismatchText(result.mismatches[0])
        : status === "cannot_tell"
          ? this._t(
              c.expectRun.length || c.expectSkip.length
                ? "cannot_tell_detail"
                : "no_expectations_detail"
            )
          : "";
    return html`<li class="case">
      <span class=${classMap({ tile: true, [status]: true })}>
        <ha-svg-icon .path=${mdiFlaskOutline}></ha-svg-icon>
      </span>
      <span class="text">
        <span class="label">${c.name}</span>
        <span class="hint"
          >${detail || this._t("case_when", { time: c.situation.time })}</span
        >
      </span>
      <span class=${classMap({ pill: true, [status]: true })}>
        ${this._t(`status_${status}`)}
      </span>
      <ha-icon-button
        .label=${this._t("edit")}
        .path=${mdiPencil}
        .caseId=${c.id}
        @click=${this._edit}
      ></ha-icon-button>
      <ha-icon-button
        .label=${this._t("delete")}
        .path=${mdiDelete}
        .caseId=${c.id}
        @click=${this._delete}
      ></ha-icon-button>
    </li>`;
  }

  private _renderCoverage(row: CoverageRow, ran: boolean) {
    const covState = ran ? row.state : "untested";
    return html`<li class="cov">
      <span
        class=${classMap({ dot: true, [ran ? covState : "idle"]: true })}
      ></span>
      <span class="text"
        ><span class="label">${this._rowLabel(row)}</span></span
      >
      <span class="hint count">
        ${
          !ran
            ? ""
            : covState === "covered"
              ? this._t("tests_count", { count: row.tests })
              : covState === "cannot_tell"
                ? this._t("cannot_tell_short")
                : this._t("no_test")
        }
      </span>
      ${
        covState !== "covered"
          ? html`<ha-button
              appearance="plain"
              size="small"
              .coverageKey=${`${row.kind}|${row.path}`}
              @click=${this._startForRow}
            >
              <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
              ${this._t("write_test")}
            </ha-button>`
          : nothing
      }
    </li>`;
  }

  private _renderForm({ draft, isNew }: Editing) {
    const nodes = this._graph(this.context.config).nodes.filter(
      (n) => n.role !== "trigger"
    );
    const expectation = (path: string): Expectation =>
      draft.expectRun.includes(path)
        ? "run"
        : draft.expectSkip.includes(path)
          ? "skip"
          : "none";
    const none = !draft.expectRun.length && !draft.expectSkip.length;
    return html`<section class="card form">
      <h3>${this._t(isNew ? "form_new" : "form_edit")}</h3>
      <ha-input
        .label=${this._t("name")}
        .value=${draft.name}
        @input=${this._nameChanged}
      ></ha-input>
      <h4>${this._t("situation")}</h4>
      <ha-automation-situation-form
        .hass=${this.context.hass}
        .situation=${draft.situation}
        @situation-changed=${this._situationChanged}
      ></ha-automation-situation-form>
      <h4>${this._t("expect")}</h4>
      <p class="hint">${this._t("expect_hint")}</p>
      <ul class="expect">
        ${nodes.map(
          (node) =>
            html`<li>
              <span class="label">${this._nodeLabel(node)}</span>
              <ha-select
                .label=${this._t("expect")}
                .value=${expectation(node.path)}
                .options=${[
                  { value: "none", label: this._t("expect_none") },
                  { value: "run", label: this._t("expect_run") },
                  { value: "skip", label: this._t("expect_skip") },
                ]}
                .nodePath=${node.path}
                @selected=${this._expectChanged}
              ></ha-select>
            </li>`
        )}
      </ul>
      ${none ? html`<p class="hint">${this._t("no_expectations")}</p>` : nothing}
      <div class="actions">
        <ha-button
          .disabled=${none || !draft.name.trim()}
          @click=${this._saveDraft}
        >
          ${this._t("save")}
        </ha-button>
        <ha-button appearance="plain" @click=${this._cancel}>
          ${this._t("cancel")}
        </ha-button>
      </div>
    </section>`;
  }

  private _blankCase(): TestCase {
    return {
      id: newId(),
      name: this._t("name_default", { number: this._cases.length + 1 }),
      situation: { time: nowTime(), overrides: [] },
      expectRun: [],
      expectSkip: [],
    };
  }

  private _startNew() {
    this._editing = { draft: this._blankCase(), isNew: true };
  }

  private _startForRow(ev: Event) {
    const key = (ev.currentTarget as HTMLElement & { coverageKey: string })
      .coverageKey;
    const [kind, path] = key.split("|");
    const draft = this._blankCase();
    if (kind === "condition_fail") {
      draft.expectSkip = [path];
    } else {
      draft.expectRun = [path];
    }
    const node = this._graph(this.context.config).nodes.find(
      (n) => n.path === path
    );
    if (node) {
      draft.name = this._nodeLabel(node);
    }
    this._editing = { draft, isNew: true };
  }

  private _edit(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { caseId: string }).caseId;
    const found = this._cases.find((c) => c.id === id);
    if (found) {
      this._editing = { draft: structuredClone(found), isNew: false };
    }
  }

  private _delete(ev: Event) {
    const id = (ev.currentTarget as HTMLElement & { caseId: string }).caseId;
    this._save(this._cases.filter((c) => c.id !== id));
    const { [id]: _gone, ...rest } = this._results;
    this._results = rest;
    if (this._editing?.draft.id === id) {
      this._editing = undefined;
    }
  }

  private _cancel() {
    this._editing = undefined;
  }

  private _patchDraft(patch: Partial<TestCase>) {
    if (this._editing) {
      this._editing = {
        ...this._editing,
        draft: { ...this._editing.draft, ...patch },
      };
    }
  }

  private _nameChanged(ev: Event) {
    this._patchDraft({ name: (ev.target as HTMLInputElement).value });
  }

  private _situationChanged(ev: CustomEvent<{ situation: Situation }>) {
    ev.stopPropagation();
    this._patchDraft({ situation: ev.detail.situation });
  }

  private _expectChanged(ev: HaSelectSelectEvent<string>) {
    const path = (ev.currentTarget as HTMLElement & { nodePath: string })
      .nodePath;
    const value = ev.detail.value as Expectation | undefined;
    if (!this._editing || !value) {
      return;
    }
    const { draft } = this._editing;
    this._patchDraft({
      expectRun: [
        ...draft.expectRun.filter((p) => p !== path),
        ...(value === "run" ? [path] : []),
      ],
      expectSkip: [
        ...draft.expectSkip.filter((p) => p !== path),
        ...(value === "skip" ? [path] : []),
      ],
    });
  }

  private _saveDraft() {
    if (!this._editing) {
      return;
    }
    const draft: TestCase = {
      ...this._editing.draft,
      name: this._editing.draft.name.trim(),
      situation: {
        ...this._editing.draft.situation,
        overrides: this._editing.draft.situation.overrides.filter(
          (o) => o.entityId
        ),
      },
    };
    const exists = this._cases.some((c) => c.id === draft.id);
    this._save(
      exists
        ? this._cases.map((c) => (c.id === draft.id ? draft : c))
        : [...this._cases, draft]
    );
    // The saved case has not been run yet.
    const { [draft.id]: _old, ...rest } = this._results;
    this._results = rest;
    this._editing = undefined;
  }

  private async _runAll() {
    const { hass, config } = this.context;
    const index = this._index(config);
    this._running = true;
    this._error = undefined;
    try {
      const outcomes = await Promise.all(
        this._cases.map((c) => evaluateTestCase(hass, config, index, c))
      );
      this._results = Object.fromEntries(
        this._cases.map((c, i) => [c.id, outcomes[i]])
      );
      this._ranConfig = config;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    } finally {
      this._running = false;
    }
  }

  private async _copy() {
    await copyToClipboard(exportCases(this.context.config.alias, this._cases));
    this._copied = true;
    setTimeout(() => {
      this._copied = false;
    }, 2000);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .summary {
          font-weight: var(--ha-font-weight-semibold);
          margin: var(--ha-space-3) 0 var(--ha-space-1);
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-4);
          align-items: start;
          margin-top: var(--ha-space-3);
        }
        .card {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          box-shadow: var(--ha-shadow-card, none);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .form {
          margin-top: var(--ha-space-3);
        }
        h3,
        h4 {
          margin: 0;
        }
        ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .cases,
        .coverage {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .case,
        .cov {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .label {
          font-weight: var(--ha-font-weight-semibold);
          overflow-wrap: anywhere;
        }
        .hint {
          margin: 0;
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
        .count {
          flex: none;
        }
        .tile {
          flex: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg);
          background: var(
            --ha-color-surface-tone-3,
            var(--secondary-background-color)
          );
        }
        .tile.passed,
        .pill.passed {
          background: var(
            --ha-color-success-container,
            var(--ha-color-primary-container)
          );
          color: var(--ha-color-on-success-container, inherit);
        }
        .tile.failed,
        .pill.failed {
          background: var(
            --ha-color-error-container,
            var(--ha-color-primary-container)
          );
          color: var(--ha-color-on-error-container, inherit);
        }
        .tile.cannot_tell,
        .pill.cannot_tell {
          background: var(
            --ha-color-warning-container,
            var(--ha-color-primary-container)
          );
          color: var(--ha-color-on-warning-container, inherit);
        }
        .pill {
          flex: none;
          padding: 2px var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill, 999px);
          background: var(
            --ha-color-surface-tone-3,
            var(--secondary-background-color)
          );
          font-size: var(--ha-font-size-s);
        }
        .dot {
          flex: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--ha-color-outline, var(--divider-color));
        }
        .dot.covered {
          background: var(--ha-color-success, var(--success-color));
        }
        .dot.untested {
          background: var(--ha-color-error, var(--error-color));
        }
        .dot.cannot_tell {
          background: var(--ha-color-warning, var(--warning-color));
        }
        .expect {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .expect li {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(140px, 200px);
          gap: var(--ha-space-3);
          align-items: center;
        }
        @media (max-width: 480px) {
          .expect li {
            grid-template-columns: minmax(0, 1fr);
          }
        }
        ha-select {
          display: block;
          width: 100%;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-tests": HaAutomationToolTests;
  }
}
