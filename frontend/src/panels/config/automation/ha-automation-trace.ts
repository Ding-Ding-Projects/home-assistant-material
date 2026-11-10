import "@home-assistant/webawesome/dist/components/divider/divider";
import {
  mdiDotsVertical,
  mdiDownload,
  mdiInformationOutline,
  mdiPencil,
  mdiRayEndArrow,
  mdiRayStartArrow,
  mdiRefresh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import {
  fireEvent,
  type HASSDomTargetEvent,
} from "../../../common/dom/fire_event";
import { navigate, replaceCurrentUrl } from "../../../common/navigate";
import { formatDateTimeWithSeconds } from "../../../common/datetime/format_date_time";
import { formatNumber } from "../../../common/number/format_number";
import { computeRTL } from "../../../common/util/compute_rtl";
import { debounce } from "../../../common/util/debounce";
import "../../../components/ha-button";
import "../../../components/ha-card";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-tab-group";
import "../../../components/ha-tab-group-tab";
import "../../../components/trace/ha-trace-blueprint-config";
import "../../../components/trace/ha-trace-config";
import "../../../components/trace/ha-trace-logbook";
import "../../../components/trace/ha-trace-path-details";
import "../../../components/trace/ha-trace-step-facts";
import "../../../components/trace/ha-trace-step-list";
import "../../../components/trace/ha-trace-timeline";
import "../../../components/trace/hat-script-graph";
import type { NodeInfo } from "../../../components/trace/hat-script-graph";
import {
  describeTraceStep,
  getTraceStepState,
} from "../../../components/trace/trace-step-info";
import type { AutomationEntity } from "../../../data/automation";
import {
  fireRelatedContext,
  fullEntitiesContext,
  manifestsContext,
} from "../../../data/context";
import type { DomainManifestLookup } from "../../../data/integration";
import { buildTraceLabels } from "../../../data/trace-labels";
import type { EntityRegistryEntry } from "../../../data/entity/entity_registry";
import type { LogbookEntry } from "../../../data/logbook";
import { getLogbookDataForContext } from "../../../data/logbook";
import type {
  AutomationTrace,
  AutomationTraceExtended,
} from "../../../data/trace";
import { getTracePath, loadTrace, loadTraces } from "../../../data/trace";
import { TraceRunController } from "../../../data/trace-run-controller";
import { TraceTree } from "../../../data/trace-tree";
import {
  showAlertDialog,
  showPromptDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { fileDownload } from "../../../util/file_download";
import "../../../components/ha-trace-picker";
import "../../../components/ha-split-panel";
import type { HaSplitPanel } from "../../../components/ha-split-panel";

// What one step shows, then what the whole run shows.
const STEP_TABS = [
  "details",
  "changed_variables",
  "step_activity",
  "step_code",
] as const;

const RUN_TABS = ["timeline", "logbook", "automation_config"] as const;

const TABS = [...STEP_TABS, ...RUN_TABS] as const;

/** The tabs of one step show the parts of the step details component. */
const STEP_PART = {
  changed_variables: "changed_variables",
  step_activity: "logbook",
  step_code: "step_config",
} as const;

/** The label of each tab, where it is not the tab's own name. */
const TAB_LABEL: Partial<Record<(typeof TABS)[number], string>> = {
  logbook: "run_activity",
};

type LeftView = "steps" | "graph";

const STORAGE_KEY_LEFT_VIEW = "automation-trace-left-view";

const STORAGE_KEY_SPLIT_POSITION = "automation-trace-split-position";
const DEFAULT_SPLIT_POSITION = 20;

@customElement("ha-automation-trace")
export class HaAutomationTrace extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public automationId!: string;

  @property({ attribute: false }) public automations!: AutomationEntity[];

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  _manifests?: DomainManifestLookup;

  @state()
  @consume({ context: fullEntitiesContext, subscribe: true })
  _entityRegistry?: EntityRegistryEntry[];

  @state() private _entityId?: string;

  @state() private _traces?: AutomationTrace[];

  @state() private _runId?: string;

  @state() private _selected?: NodeInfo;

  @state() private _trace?: AutomationTraceExtended;

  @state() private _logbookEntries?: LogbookEntry[];

  @state() private _view: (typeof TABS)[number] | "blueprint" = "details";

  @state() private _splitPosition = DEFAULT_SPLIT_POSITION;

  @state() private _leftView: LeftView = "steps";

  private _tree = memoizeOne(
    (trace: AutomationTraceExtended) => new TraceTree(trace)
  );

  private _runNavigation = new TraceRunController(this, {
    tracePath: () => getTracePath("automation", this.automationId),
    shownRunId: () => this._runId,
    loadRun: (runId) => {
      this._selected = undefined;
      this._loadTraces(runId);
    },
  });

  /**
   * `hass` is replaced on every state update, so comparing it would rebuild
   * every label on every state event. The run already happened, so only the
   * trace and the registries the descriptions read can change the result.
   */
  private _traceLabels = memoizeOne(
    buildTraceLabels,
    ([trace, , entities, manifests], [pTrace, , pEntities, pManifests]) =>
      trace === pTrace && entities === pEntities && manifests === pManifests
  );

  private get _isRTL() {
    return computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.automation.trace.${key}` as any,
      values
    );
  }

  protected render(): TemplateResult {
    const stateObj = this._entityId
      ? this.hass.states[this._entityId]
      : undefined;

    const title =
      (stateObj && this.hass.formatEntityName(stateObj)) || this._entityId;

    const breadcrumb = [
      this.hass.localize("panel.config"),
      this.hass.localize("ui.panel.config.automation.caption"),
      title,
    ]
      .filter(Boolean)
      .join(", ");

    let devButtons: TemplateResult | string = "";
    if (__DEV__) {
      devButtons = html`<div style="position: absolute; right: 0; z-index: 1;">
        <button @click=${this._importTrace}>Import trace</button>
        <button @click=${this._loadLocalStorageTrace}>Load stored trace</button>
      </div>`;
    }

    return html`
      ${devButtons}
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/automation/dashboard"
        .header=${this._l("title")}
        .breadcrumb=${breadcrumb}
        .scrollable=${this.narrow}
      >
        <ha-dropdown
          slot="toolbar-icon"
          @wa-select=${this._handleDropdownSelect}
        >
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item .disabled=${!stateObj} value="show_info">
            ${this.hass.localize("ui.panel.config.automation.editor.show_info")}
            <ha-svg-icon
              slot="icon"
              .path=${mdiInformationOutline}
            ></ha-svg-icon>
          </ha-dropdown-item>

          ${
            stateObj?.attributes.id
              ? html`
                  <ha-dropdown-item value="edit_automation">
                    ${this.hass.localize(
                      "ui.panel.config.automation.trace.edit_automation"
                    )}
                    <ha-svg-icon slot="icon" .path=${mdiPencil}></ha-svg-icon>
                  </ha-dropdown-item>
                `
              : nothing
          }

          <wa-divider></wa-divider>

          <ha-dropdown-item value="refresh">
            ${this.hass.localize("ui.panel.config.automation.trace.refresh")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item .disabled=${!this._trace} value="download_trace">
            ${this.hass.localize(
              "ui.panel.config.automation.trace.download_trace"
            )}
            <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        ${
          this._traces === undefined
            ? html`<div class="container">
                ${this.hass!.localize("ui.common.loading")}
              </div>`
            : this._traces.length === 0
              ? html`<div class="container">
                  ${this.hass!.localize(
                    "ui.panel.config.automation.trace.no_traces_found"
                  )}
                </div>`
              : this._trace === undefined
                ? ""
                : html`
                    <div class="main">
                      ${
                        this.narrow
                          ? this._renderPanes()
                          : html`
                              <ha-split-panel
                                class="split"
                                dir=${this._isRTL ? "rtl" : "ltr"}
                                .position=${
                                  this._isRTL
                                    ? 100 - this._splitPosition
                                    : this._splitPosition
                                }
                                @wa-reposition=${this._splitRepositioned}
                              >
                                ${this._renderPanes()}
                              </ha-split-panel>
                            `
                      }
                    </div>
                  `
        }
      </hass-subpage>
    `;
  }

  private _renderPanes(): TemplateResult {
    return html`
      <div class="pane" slot="start">${this._renderRunCard()}</div>
      <div class="pane" slot="end">${this._renderStepCard()}</div>
    `;
  }

  /** How long a run took and how it ended, in one or two sentences. */
  private _runSummary(): string {
    const trace = this._trace!;
    const tree = this._tree(trace);
    const states = tree.trackedPaths.map((path) =>
      getTraceStepState(trace, tree.trackedNodes[path])
    );
    const failed = states.filter(
      (outcome) => outcome === "failed" || outcome === "error"
    ).length;
    const sentences: string[] = [];
    if (trace.timestamp.finish) {
      const seconds =
        (new Date(trace.timestamp.finish).getTime() -
          new Date(trace.timestamp.start).getTime()) /
        1000;
      sentences.push(
        this._l("run_finished_in", {
          seconds: formatNumber(seconds, this.hass.locale, {
            maximumFractionDigits: 1,
          }),
        })
      );
    }
    if (trace.script_execution === null || trace.state === "running") {
      sentences.push(this._l("run_outcome.running"));
    } else if (trace.script_execution === "finished") {
      sentences.push(
        failed
          ? this._l("run_steps_failed", { count: failed })
          : this._l("run_all_succeeded")
      );
    } else {
      sentences.push(this._l(`run_outcome.${trace.script_execution}`));
    }
    return sentences.join(" ");
  }

  private _renderRunCard(): TemplateResult {
    const trace = this._trace!;
    const index = this._traces!.findIndex(
      (item) => item.run_id === this._runId
    );
    const stateObj = this._entityId
      ? this.hass.states[this._entityId]
      : undefined;
    const name =
      (stateObj && this.hass.formatEntityName(stateObj)) || this._entityId;
    const rtl = this._isRTL;
    return html`
      <ha-card class="run">
        ${this.narrow && name ? html`<span class="secondary">${name}</span>` : nothing}
        <h2>
          ${this._l("run_title", {
            time: formatDateTimeWithSeconds(
              new Date(trace.timestamp.start),
              this.hass.locale,
              this.hass.config
            ),
          })}
        </h2>
        <p class="secondary" role="status">${this._runSummary()}</p>
        <div class="segmented" role="group" aria-label=${this._l("view")}>
          ${(["steps", "graph"] as const).map(
            (view) =>
              html`<button
                class=${classMap({ on: this._leftView === view })}
                aria-pressed=${this._leftView === view ? "true" : "false"}
                .view=${view}
                @click=${this._pickLeftView}
              >
                ${this._l(`view_${view}`)}
              </button>`
          )}
        </div>
        ${
          this._leftView === "steps"
            ? html`<ha-trace-step-list
                .hass=${this.hass}
                .trace=${trace}
                .selected=${this._selected?.path}
                @graph-node-selected=${this._pickNode}
              ></ha-trace-step-list>`
            : html`<div class="graph">
                <hat-script-graph
                  .trace=${trace}
                  .selected=${this._selected?.path}
                  .labels=${this._traceLabels(
                    trace,
                    this.hass,
                    this._entityRegistry,
                    this._manifests
                  )}
                  @graph-node-selected=${this._pickNode}
                ></hat-script-graph>
              </div>`
        }
        <div class="pager">
          <ha-icon-button
            .label=${this.hass!.localize(
              "ui.panel.config.automation.trace.older_trace"
            )}
            .path=${rtl ? mdiRayStartArrow : mdiRayEndArrow}
            .disabled=${
              this._traces![this._traces!.length - 1].run_id === this._runId
            }
            @click=${this._pickOlderTrace}
          ></ha-icon-button>
          <ha-trace-picker
            .traces=${this._traces}
            .value=${this._runId}
            @value-changed=${this._pickTrace}
          ></ha-trace-picker>
          <ha-icon-button
            .label=${this.hass!.localize(
              "ui.panel.config.automation.trace.newer_trace"
            )}
            .path=${rtl ? mdiRayEndArrow : mdiRayStartArrow}
            .disabled=${this._traces![0].run_id === this._runId}
            @click=${this._pickNewerTrace}
          ></ha-icon-button>
        </div>
        ${
          index >= 0
            ? html`<span class="secondary position">
                ${this._l("run_position", {
                  number: this._traces!.length - index,
                  total: this._traces!.length,
                })}
              </span>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _renderStepCard(): TemplateResult {
    const trace = this._trace!;
    const selected = this._selected;
    const stateObj = this._entityId
      ? this.hass.states[this._entityId]
      : undefined;
    const stepState = selected ? getTraceStepState(trace, selected) : undefined;
    const tabs = trace.blueprint_inputs
      ? ([...TABS, "blueprint"] as const)
      : TABS;
    return html`
      <ha-card class="step">
        ${
          selected
            ? html`<div class="step-head">
                <h2>
                  ${describeTraceStep(
                    this.hass,
                    this._entityRegistry,
                    this._manifests,
                    selected
                  )}
                </h2>
                ${
                  stepState
                    ? html`<span
                        class=${classMap({ chip: true, [stepState]: true })}
                        >${this._l(`state_${stepState}`)}</span
                      >`
                    : nothing
                }
              </div>`
            : nothing
        }
        <ha-tab-group @wa-tab-show=${this._handleTabChanged}>
          ${tabs.map(
            (view) => html`
              <ha-tab-group-tab
                slot="nav"
                .active=${this._view === view}
                .panel=${view}
              >
                ${
                  view === "blueprint"
                    ? this._l("tabs.blueprint_config")
                    : this._l(`tabs.${TAB_LABEL[view] ?? view}`)
                }
              </ha-tab-group-tab>
            `
          )}
        </ha-tab-group>
        <div class="tab-body">${this._renderTabBody()}</div>
        <div class="step-foot">
          <ha-button
            appearance="plain"
            size="small"
            @click=${this._downloadTrace}
          >
            <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
            ${this._l("download_this")}
          </ha-button>
          ${
            stateObj?.attributes.id
              ? html`<ha-button
                  appearance="outlined"
                  size="small"
                  href="/config/automation/edit/${encodeURIComponent(
                    stateObj.attributes.id
                  )}"
                >
                  <ha-svg-icon slot="start" .path=${mdiPencil}></ha-svg-icon>
                  ${this._l("open_editor")}
                </ha-button>`
              : nothing
          }
        </div>
      </ha-card>
    `;
  }

  private _renderTabBody() {
    if (this._selected === undefined || this._logbookEntries === undefined) {
      return nothing;
    }
    const tree = this._tree(this._trace!);
    const view = this._view;
    const details = (
      part: "info" | "step_config" | "changed_variables" | "logbook"
    ) =>
      html`<ha-trace-path-details
        .hass=${this.hass}
        .narrow=${this.narrow}
        .trace=${this._trace}
        .selected=${this._selected}
        .logbookEntries=${this._logbookEntries}
        .trackedNodes=${tree.trackedNodes}
        .renderedNodes=${tree.renderedNodes}
        .section=${part}
      ></ha-trace-path-details>`;
    if (view === "details") {
      return html`
        <ha-trace-step-facts
          .hass=${this.hass}
          .trace=${this._trace}
          .selected=${this._selected}
          .trackedNodes=${tree.trackedNodes}
        ></ha-trace-step-facts>
        <details class="recorded">
          <summary>${this._l("all_recorded")}</summary>
          ${details("info")}
        </details>
      `;
    }
    if (
      view === "changed_variables" ||
      view === "step_activity" ||
      view === "step_code"
    ) {
      return details(STEP_PART[view]);
    }
    if (view === "automation_config") {
      return html`<ha-trace-config .trace=${this._trace}></ha-trace-config>`;
    }
    if (view === "logbook") {
      return html`<ha-trace-logbook
        .hass=${this.hass}
        .narrow=${this.narrow}
        .trace=${this._trace}
        .logbookEntries=${this._logbookEntries}
      ></ha-trace-logbook>`;
    }
    if (view === "blueprint") {
      return html`<ha-trace-blueprint-config
        .trace=${this._trace}
      ></ha-trace-blueprint-config>`;
    }
    return html`<ha-trace-timeline
      .hass=${this.hass}
      .trace=${this._trace}
      .logbookEntries=${this._logbookEntries}
      .selected=${this._selected}
      @value-changed=${this._timelinePathPicked}
    ></ha-trace-timeline>`;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    this.hass.loadBackendTranslation("triggers");
    this.hass.loadBackendTranslation("conditions");

    const storedPosition = localStorage?.[STORAGE_KEY_SPLIT_POSITION];
    if (storedPosition) {
      const parsed = parseFloat(storedPosition);
      if (!isNaN(parsed) && parsed > 0 && parsed < 100) {
        this._splitPosition = parsed;
      }
    }

    try {
      const storedView = localStorage?.[STORAGE_KEY_LEFT_VIEW];
      if (storedView === "steps" || storedView === "graph") {
        this._leftView = storedView;
      }
    } catch (_err) {
      // Without storage the page opens on the steps.
    }

    if (!this.automationId) {
      return;
    }

    const params = new URLSearchParams(location.search);
    this._loadTraces(params.get("run_id") || undefined);
  }

  protected updated(changedProps: PropertyValues) {
    super.updated(changedProps);

    // Only reset if automationId has changed and we had one before.
    if (changedProps.get("automationId")) {
      this._traces = undefined;
      this._entityId = undefined;
      this._runId = undefined;
      this._selected = undefined;
      this._trace = undefined;
      this._logbookEntries = undefined;
      if (this.automationId) {
        // A link from another trace reuses this page and names the run.
        const params = new URLSearchParams(location.search);
        this._loadTraces(params.get("run_id") || undefined);
      }
    }

    if (changedProps.has("_runId") && this._runId) {
      this._trace = undefined;
      this._logbookEntries = undefined;
      this._loadTrace();
      this._runNavigation.writeRunIdToUrl(this._runId);
    }

    // A run opens on its first step, as the graph does when it is shown.
    if (changedProps.has("_trace") && this._trace) {
      const tree = this._tree(this._trace);
      if (!this._selected || !tree.trackedNodes[this._selected.path]) {
        this._selected = tree.firstTracked;
      }
    }

    if (
      (changedProps.has("automationId") || changedProps.has("automations")) &&
      this.automationId &&
      !this._entityId
    ) {
      const automation = this.automations.find(
        (entity: AutomationEntity) => entity.attributes.id === this.automationId
      );
      this._entityId = automation?.entity_id;
    }

    if (
      changedProps.has("automationId") ||
      changedProps.has("_entityId") ||
      changedProps.has("_entityRegistry")
    ) {
      this._setRelatedContext();
    }
  }

  private _setRelatedContext() {
    const areaId = this._entityId
      ? this._entityRegistry?.find(
          (entry) => entry.entity_id === this._entityId
        )?.area_id
      : undefined;
    fireRelatedContext(
      this,
      areaId
        ? {
            itemType: "area",
            itemId: areaId,
          }
        : undefined
    );
  }

  private _pickOlderTrace() {
    const curIndex = this._traces!.findIndex((tr) => tr.run_id === this._runId);
    this._pickRun(this._traces![curIndex + 1].run_id);
  }

  private _pickNewerTrace() {
    const curIndex = this._traces!.findIndex((tr) => tr.run_id === this._runId);
    this._pickRun(this._traces![curIndex - 1].run_id);
  }

  private _pickTrace(ev) {
    this._pickRun(ev.detail.value);
  }

  private _pickRun(runId: string) {
    this._runNavigation.cancelLinkRequest();
    this._runId = runId;
    this._selected = undefined;
  }

  private _pickNode(ev) {
    this._selected = ev.detail;
  }

  private _pickLeftView(ev: Event) {
    this._leftView = (
      ev.currentTarget as HTMLElement & { view: LeftView }
    ).view;
    try {
      localStorage[STORAGE_KEY_LEFT_VIEW] = this._leftView;
    } catch (_err) {
      // The choice only lasts until the page is closed.
    }
  }

  private _splitRepositioned(ev: HASSDomTargetEvent<HaSplitPanel>) {
    const position = this._isRTL
      ? 100 - ev.target.position
      : ev.target.position;
    // Ignore reposition events caused by applying the current position.
    if (position === this._splitPosition) {
      return;
    }

    this._splitPosition = position;
    this._storeSplitPosition();
  }

  private _storeSplitPosition = debounce(
    () => {
      localStorage[STORAGE_KEY_SPLIT_POSITION] = String(this._splitPosition);
    },
    500,
    false
  );

  private _refreshTraces() {
    // Keep the run of a link that is still loading.
    this._loadTraces(this._runNavigation.requestedRunId);
  }

  private async _loadTraces(runId?: string) {
    const request = this._runNavigation.startListRequest(runId);
    const traces = await loadTraces(this.hass, "automation", this.automationId);
    if (!this._runNavigation.isLatestListRequest(request)) {
      return;
    }
    this._runNavigation.endListRequest();
    this._traces = traces;
    // Newest will be on top.
    this._traces.reverse();

    if (runId) {
      this._runId = runId;
    }

    // Check if current run ID still exists
    if (
      this._runId &&
      !this._traces.some((trace) => trace.run_id === this._runId)
    ) {
      this._runId = undefined;
      this._selected = undefined;

      // If we came here from a trace passed into the url, clear it.
      if (runId) {
        const params = new URLSearchParams(location.search);
        params.delete("run_id");
        replaceCurrentUrl(`${location.pathname}?${params.toString()}`);
      }

      await showAlertDialog(this, {
        text: this.hass!.localize(
          "ui.panel.config.automation.trace.trace_no_longer_available"
        ),
      });
      if (!this._runNavigation.isLatestListRequest(request)) {
        return;
      }
    }

    // See if we can set a default runID
    if (!this._runId && this._traces.length > 0) {
      this._runId = this._traces[0].run_id;
    }
  }

  private async _loadTrace() {
    const request = this._runNavigation.startTraceRequest();
    const runId = this._runId!;
    const trace = await loadTrace(
      this.hass,
      "automation",
      this.automationId,
      runId
    );
    const logbookEntries = isComponentLoaded(this.hass.config, "logbook")
      ? await getLogbookDataForContext(
          this.hass,
          trace.timestamp.start,
          trace.context.id
        )
      : [];

    // Another run was picked, or the same run loaded again, meanwhile.
    if (
      !this._runNavigation.isLatestTraceRequest(request) ||
      runId !== this._runId
    ) {
      return;
    }
    this._logbookEntries = logbookEntries;
    this._trace = trace;
  }

  private _downloadTrace() {
    const json = JSON.stringify(
      {
        trace: this._trace,
        logbookEntries: this._logbookEntries,
      },
      undefined,
      2
    );
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    fileDownload(
      url,
      `trace ${this._entityId} ${this._trace!.timestamp.start}.json`
    );
  }

  private async _importTrace() {
    const traceText = await showPromptDialog(this, {
      title: this.hass.localize("ui.replaced_dialogs.open_trace_title"),
      text: this.hass.localize(
        "ui.panel.config.automation.trace.enter_downloaded_trace"
      ),
      inputLabel: this.hass.localize("ui.replaced_dialogs.trace_label"),
      multiline: true,
      confirmText: this.hass.localize("ui.replaced_dialogs.open"),
    });
    if (!traceText) {
      return;
    }
    window.localStorage.setItem("devTrace", traceText);
    this._loadLocalTrace(traceText);
  }

  private _loadLocalStorageTrace() {
    const devTrace = window.localStorage.getItem("devTrace");
    if (devTrace) {
      this._loadLocalTrace(devTrace);
    }
  }

  private _loadLocalTrace(traceText: string) {
    const traceInfo = JSON.parse(traceText);
    this._trace = traceInfo.trace;
    this._logbookEntries = traceInfo.logbookEntries;
  }

  private _handleTabChanged(ev: CustomEvent) {
    this._view = ev.detail.name as typeof this._view;
  }

  private _timelinePathPicked(ev: CustomEvent) {
    const path = ev.detail.value;
    const nodes = this._tree(this._trace!).trackedNodes;
    if (nodes[path]) {
      this._selected = nodes[path];
    }
  }

  private _showInfo() {
    if (!this.hass || !this._entityId) {
      return;
    }
    fireEvent(this, "hass-more-info", { entityId: this._entityId });
  }

  private _navigateToAutomation() {
    if (this._entityId && this.hass.states[this._entityId]) {
      navigate(
        `/config/automation/edit/${encodeURIComponent(this.hass.states[this._entityId].attributes.id)}`
      );
    }
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "show_info":
        this._showInfo();
        break;
      case "refresh":
        this._refreshTraces();
        break;
      case "download_trace":
        this._downloadTrace();
        break;
      case "edit_automation":
        this._navigateToAutomation();
        break;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .main {
          flex: 1;
          min-height: 0;
          display: flex;
          overflow: hidden;
        }

        :host([narrow]) .main {
          flex: none;
          height: auto;
          flex-direction: column;
          overflow: visible;
        }

        .container {
          padding: 16px;
        }

        ha-split-panel.split {
          flex: 1;
          min-height: 0;
          min-width: 0;
          --ha-split-panel-min: 10%;
          --ha-split-panel-max: 80%;
          --ha-split-panel-divider-hit-area: var(--ha-space-4);
        }

        ha-split-panel.split[dir="rtl"] {
          --ha-split-panel-min: 20%;
          --ha-split-panel-max: 90%;
        }

        .pane {
          box-sizing: border-box;
          height: 100%;
          min-width: 0;
          min-height: 0;
          overflow: auto;
          padding: var(--ha-space-4);
        }
        :host([narrow]) .pane {
          height: auto;
          overflow: visible;
          padding: var(--ha-space-3) var(--ha-space-4);
        }

        ha-card.run,
        ha-card.step {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          padding: var(--ha-space-5);
          box-sizing: border-box;
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

        .segmented {
          align-self: flex-start;
          display: inline-flex;
          padding: var(--ha-space-1);
          border-radius: var(--ha-border-radius-pill);
          background: var(--ha-color-fill-neutral-normal-resting);
        }
        .segmented button {
          min-height: var(--ha-space-8);
          padding: 0 var(--ha-space-4);
          border: none;
          border-radius: var(--ha-border-radius-pill);
          background: none;
          color: inherit;
          font: inherit;
          font-size: var(--ha-font-size-s);
          cursor: pointer;
        }
        .segmented button.on {
          background: var(--card-background-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .segmented button:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .graph {
          overflow: auto;
          min-height: 200px;
        }
        hat-script-graph {
          min-width: 0;
        }

        .pager {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }
        .pager ha-trace-picker {
          flex: 1;
          min-width: 0;
          max-width: 500px;
        }
        .position {
          text-align: center;
        }

        .step-head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
        .chip {
          padding: 2px var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          background: var(--ha-color-fill-success-normal-resting);
          color: var(--ha-color-on-success-normal, inherit);
        }
        .chip.failed,
        .chip.error {
          background: var(--ha-color-fill-danger-normal-resting);
          color: var(--ha-color-on-danger-normal, inherit);
        }
        .chip.not_triggered,
        .chip.skipped,
        .chip.not_run {
          background: var(--ha-color-fill-neutral-normal-resting);
          color: var(--secondary-text-color);
        }

        ha-tab-group {
          border-bottom: 1px solid var(--divider-color);
        }
        ha-tab-group-tab::part(base) {
          padding: 2px 16px;
        }

        .tab-body {
          min-width: 0;
        }
        .recorded {
          margin-top: var(--ha-space-3);
        }
        .recorded summary {
          cursor: pointer;
          color: var(--primary-color);
          font-weight: var(--ha-font-weight-medium);
        }
        .recorded summary:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
        }

        .step-foot {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-trace": HaAutomationTrace;
  }
}
