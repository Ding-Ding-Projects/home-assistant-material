import {
  mdiChartBoxOutline,
  mdiDotsVertical,
  mdiDownload,
  mdiImagePlus,
  mdiRestart,
} from "@mdi/js";
import { differenceInHours } from "date-fns";
import type {
  HassServiceTarget,
  UnsubscribeFunc,
} from "home-assistant-js-websocket/dist/types";
import type { PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { ensureArray } from "../../common/array/ensure-array";
import { storage } from "../../common/decorators/storage";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { computeDomain } from "../../common/entity/compute_domain";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { playPageEntry } from "../../common/motion/page-entry";
import { navigate } from "../../common/navigate";
import { constructUrlCurrentPath } from "../../common/url/construct-url";
import {
  createHistoryLogbookUrl,
  decodeHistoryLogbookQueryParams,
  historyLogbookTargetFromQueryParams,
  historyLogbookTargetsEqual,
} from "../../common/url/history-logbook-query-params";
import {
  extractSearchParamsObject,
  removeSearchParam,
} from "../../common/url/search-params";
import { shallowEqual } from "../../common/util/shallow-equal";
import {
  DEFAULT_CHART_WIDTH,
  MIN_TIME_BETWEEN_UPDATES,
} from "../../components/chart/ha-chart-base";
import "../../components/chart/ha-chart-zoom-slider";
import "../../components/chart/state-history-charts";
import type { StateHistoryCharts } from "../../components/chart/state-history-charts";
import "../../components/date-picker/ha-date-range-nav";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-empty-state";
import "../../components/ha-icon-button";
import "../../components/ha-source-filter-bar";
import type { HaSourceFilterBar } from "../../components/ha-source-filter-bar";
import type { SourceFilters } from "../../components/ha-sources-picker";
import {
  applySourceFilters,
  countSourceFilters,
  countTargets,
  setSourceFilter,
} from "../../components/ha-sources-picker";
import "../../components/ha-select";
import type { HaSelectSelectEvent } from "../../components/ha-select";
import "../../components/ha-spinner";
import "../../components/ha-svg-icon";
import "../../components/ha-top-app-bar-fixed";
import type { EntitySources } from "../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../data/entity/entity_sources";
import { entityTypesNeedStates } from "../../data/entity/entity_type";
import type {
  ComparePeriod,
  HistoryResult,
  HistoryStates,
} from "../../data/history";
import {
  addComparisonToHistory,
  computeCompareShiftMs,
  computeHistory,
  computeHistoryUpdateDelay,
  convertStatisticsToHistory,
  countHistoryStates,
  fetchDateWS,
  mergeHistoryResults,
  subscribeHistory,
} from "../../data/history";
import {
  fetchStatistics,
  getStatisticMetadata,
  isExternalStatistic,
  type StatisticsMetaData,
} from "../../data/recorder";
import { resolveEntityIDs } from "../../data/selector";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import { haStyle, haStyleScrollbar } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { csvDownload, csvSafeString } from "../../util/csv";
import { addEntitiesToLovelaceView } from "../lovelace/editor/add-entities-to-view";

const EMPTY_STATES: HomeAssistant["states"] = {};

@customElement("ha-panel-history")
class HaPanelHistory extends LitElement {
  @property({ attribute: false }) hass!: HomeAssistant;

  @property({ reflect: true, type: Boolean }) public narrow = false;

  @property({ reflect: true, type: Boolean }) rtl = false;

  @state() private _startDate: Date;

  @state() private _endDate: Date;

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "historyPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  @state() private _isLoading = false;

  // The zoom window shared by all charts, in percent of their x-axis
  @state() private _zoomRange: [number, number] = [0, 100];

  @state() private _filters: SourceFilters = {};

  @storage({
    key: "historySourceFilters",
    state: false,
    subscribe: false,
  })
  private _storedFilters?: SourceFilters;

  // Whether the filter dialog or sheet is open, so that a phone waits for it
  // to close before it fetches the new results.
  @state() private _sheetOpen = false;

  @query("ha-source-filter-bar") private _filterBar?: HaSourceFilterBar;

  // The blocks that rise when the page is first shown.
  @queryAll(".entry") private _entryBlocks!: NodeListOf<Element>;

  @state() private _entitySources?: EntitySources;

  @state() private _stateHistory?: HistoryResult;

  private _mungedStateHistory?: HistoryResult;

  @state() private _statisticsHistory?: HistoryResult;

  @state()
  private _showBack?: boolean;

  @query("state-history-charts")
  private _stateHistoryCharts?: StateHistoryCharts;

  private _subscribed?: Promise<UnsubscribeFunc | undefined>;

  private _fetchedEntityIds?: string[];

  private _statsFetchId = 0;

  private _interval?: number;

  private _historyUpdateTimer?: number;

  private _historyGeneration = 0;

  private _lang = new LanguageModeController(this);

  @state() private _comparePeriod: ComparePeriod | "none" = "none";

  @state() private _comparison?: { history: HistoryResult; shift: number };

  @state() private _comparisonStatus?:
    "loading" | "unavailable" | "empty" | "limit";

  private _comparisonRequest = 0;

  public constructor() {
    super();

    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);
    this._startDate = start;

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);
    this._endDate = end;
  }

  public connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) {
      this._getHistory();
      this._getStats();
      this._getComparison();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeHistory();
    this._statsFetchId++;
  }

  protected render() {
    const entityIds = this._getEntityIds();
    const targetCount = countTargets(this._targetPickerValue);
    const filterCount = countSourceFilters(this._filters);
    const sourceCount = targetCount + filterCount;
    const hasTargets = targetCount > 0;
    // A target whose entities are all filtered out fetches nothing.
    const loading =
      this._isLoading || (entityIds.length > 0 && !this._mungedStateHistory);
    const hasResults =
      !!this._mungedStateHistory &&
      (this._mungedStateHistory.line.length > 0 ||
        this._mungedStateHistory.timeline.length > 0);
    const showZoomBar = !loading && hasTargets && hasResults;
    const comparisonStatus =
      this._comparison &&
      this._mungedStateHistory &&
      !this._mungedStateHistory.line.some((unit) =>
        unit.data.some((entity) => entity.compare)
      )
        ? "empty"
        : this._comparisonStatus || "hint";
    const sourcesLabel = sourceCount
      ? this.hass.localize("ui.panel.history.sources_count", {
          count: entityIds.length,
        })
      : this.hass.localize("ui.panel.history.sources");

    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
      >
        <h1 class="page-title" slot="title">
          ${this.hass.localize("panel.history")}
        </h1>
        ${
          this.narrow
            ? nothing
            : html`<ha-button
                slot="primaryAction"
                appearance="filled"
                variant="neutral"
                .disabled=${this._isLoading}
                @click=${this._downloadHistory}
              >
                <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                ${this.hass.localize("ui.panel.history.download_data")}
              </ha-button>`
        }
        <ha-dropdown slot="actionItems" @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          ${
            this.narrow
              ? html`<ha-dropdown-item
                  value="download"
                  .disabled=${this._isLoading}
                >
                  ${this.hass.localize("ui.panel.history.download_data")}
                  <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
                </ha-dropdown-item>`
              : nothing
          }

          <ha-dropdown-item value="add-card" .disabled=${this._isLoading}>
            ${this.hass.localize("ui.panel.history.add_card")}
            <ha-svg-icon slot="icon" .path=${mdiImagePlus}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>

        <div class="content">
          <div class="main">
            <div class="content-column">
              <div class="toolbar entry">
                <ha-source-filter-bar
                  .hass=${this.hass}
                  .narrow=${this.narrow}
                  .targets=${this._targetPickerValue}
                  .filters=${this._filters}
                  .entitySources=${this._entitySources}
                  .noTargetsText=${this.hass.localize(
                    "ui.panel.history.no_targets"
                  )}
                  .sourcesLabel=${this.hass.localize("ui.panel.history.sources")}
                  .sourcesCountLabel=${sourcesLabel}
                  .resultCount=${hasTargets ? entityIds.length : undefined}
                  .disabled=${this._isLoading}
                  @sources-changed=${this._targetsChanged}
                  @source-filter-changed=${this._filterChanged}
                  @sources-cleared=${this._clearSources}
                  @filter-sheet-changed=${this._sheetChanged}
                ></ha-source-filter-bar>
                <ha-date-range-nav
                  .disabled=${this._isLoading}
                  .startDate=${this._startDate}
                  .endDate=${this._endDate}
                  extended-presets
                  time-picker
                  @value-changed=${this._dateRangeChanged}
                ></ha-date-range-nav>
              </div>
              <div class="comparison-controls entry">
                <ha-select
                  .label=${this._lang.text(this.hass.localize, "ui.panel.history.comparison.label")}
                  .value=${this._comparePeriod}
                  .options=${(["none", "previous", "day", "week"] as const).map(
                    (value) => ({
                      value,
                      label: this._lang.text(
                        this.hass.localize,
                        `ui.panel.history.comparison.${value}`
                      ),
                    })
                  )}
                  @selected=${this._comparisonChanged}
                ></ha-select>
                <p role="status" aria-live="polite">
                  ${this._lang.text(
                    this.hass.localize,
                    `ui.panel.history.comparison.${comparisonStatus}`
                  )}
                </p>
              </div>
              <div
                class="results ha-scrollbar ${classMap({
                  "has-zoom-bar": showZoomBar,
                })}"
              >
                ${
                  loading
                    ? html`<div class="progress-wrapper">
                        <ha-spinner></ha-spinner>
                      </div>`
                    : !hasTargets || !hasResults
                      ? this._renderEmptyState(hasTargets)
                      : html`
                          <state-history-charts
                            .historyData=${this._mungedStateHistory}
                            .startTime=${this._startDate}
                            .endTime=${this._endDate}
                            .narrow=${this.narrow}
                            sync-charts
                            inside-labels
                            @history-charts-zoom=${this._chartsZoomChanged}
                          >
                          </state-history-charts>
                        `
                }
              </div>
              ${
                showZoomBar
                  ? html`<ha-card class="zoom-bar">
                      <ha-icon-button
                        .disabled=${!this._isZoomed()}
                        .label=${this.hass.localize(
                          "ui.components.history_charts.zoom_reset"
                        )}
                        .path=${mdiRestart}
                        @click=${this._resetZoom}
                      ></ha-icon-button>
                      <ha-chart-zoom-slider
                        .start=${this._zoomRange[0]}
                        .end=${this._zoomRange[1]}
                        @zoom-slider-changed=${this._zoomSliderChanged}
                        @zoom-slider-reset=${this._resetZoom}
                      ></ha-chart-zoom-slider>
                    </ha-card>`
                  : nothing
              }
            </div>
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  private _isZoomed() {
    const [start, end] = this._zoomRange;
    return start !== 0 || end !== 100;
  }

  private _chartsZoomChanged(
    ev: HASSDomEvent<HASSDomEvents["history-charts-zoom"]>
  ) {
    this._zoomRange = [ev.detail.start, ev.detail.end];
  }

  private _zoomSliderChanged(
    ev: HASSDomEvent<HASSDomEvents["zoom-slider-changed"]>
  ) {
    const { start, end } = ev.detail;
    this._zoomRange = [start, end];
    this._stateHistoryCharts?.zoom(start, end);
  }

  private _resetZoom() {
    this._zoomRange = [0, 100];
    this._stateHistoryCharts?.zoom(0, 100);
  }

  private _renderEmptyState(hasTargets: boolean) {
    return html`
      <ha-empty-state
        tone=${hasTargets ? "filtered" : "start"}
        .heading=${this.hass.localize(
          hasTargets
            ? "ui.panel.history.no_results_title"
            : "ui.panel.history.start_search_title"
        )}
        .description=${this.hass.localize(
          hasTargets
            ? "ui.panel.history.no_results"
            : "ui.panel.history.start_search"
        )}
      >
        <ha-svg-icon slot="icon" .path=${mdiChartBoxOutline}></ha-svg-icon>
        <ha-button
          slot="actions"
          appearance="plain"
          @click=${this._openSources}
        >
          ${this.hass.localize("ui.panel.history.change_sources")}
        </ha-button>
      </ha-empty-state>
    `;
  }

  public willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);

    if (
      changedProps.has("_startDate") ||
      changedProps.has("_endDate") ||
      changedProps.has("_targetPickerValue") ||
      changedProps.has("_filters") ||
      changedProps.has("_entitySources")
    ) {
      // Clear the old selection before rendering, including while the narrow
      // source sheet postpones fetching its replacement.
      this._unsubscribeHistory();
      this._statsFetchId++;
      this._stateHistory = undefined;
      this._statisticsHistory = undefined;
      this._mungedStateHistory = undefined;
      this._fetchedEntityIds = undefined;
    }

    if (
      changedProps.has("_stateHistory") ||
      changedProps.has("_statisticsHistory") ||
      changedProps.has("_comparison") ||
      changedProps.has("_startDate") ||
      changedProps.has("_endDate") ||
      changedProps.has("_targetPickerValue")
    ) {
      if (this._statisticsHistory && this._stateHistory) {
        this._mungedStateHistory = mergeHistoryResults(
          this._stateHistory,
          this._statisticsHistory
        );
      } else {
        this._mungedStateHistory =
          this._stateHistory || this._statisticsHistory;
      }
      if (this._mungedStateHistory && this._comparison) {
        this._mungedStateHistory = addComparisonToHistory(
          this._mungedStateHistory,
          this._comparison.history,
          this._comparison.shift
        );
      }
    }

    if (this.hasUpdated) {
      return;
    }

    const queryParams = decodeHistoryLogbookQueryParams(
      extractSearchParamsObject()
    );
    const urlTarget = historyLogbookTargetFromQueryParams(queryParams);
    const initialValue = urlTarget ?? this._storedTargetPickerValue;
    if (initialValue) {
      this._targetPickerValue = initialValue;
    }
    // A target linked from another page must not be narrowed by stored filters.
    if (
      this._storedFilters &&
      (!urlTarget ||
        historyLogbookTargetsEqual(
          urlTarget,
          this._storedTargetPickerValue ?? {}
        ))
    ) {
      this._filters = this._storedFilters;
    }
    if (queryParams.start_date) {
      this._startDate = queryParams.start_date;
    }
    if (queryParams.end_date) {
      this._endDate = queryParams.end_date;
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    playPageEntry(Array.from(this._entryBlocks));
    // The filters label themselves with keys from the config panel.
    this.hass.loadFragmentTranslation("config");
    fetchEntitySourcesWithCache(this.hass.callWS, this.hass.states).then(
      (sources) => {
        this._entitySources = sources;
      }
    );
    const searchParams = extractSearchParamsObject();
    if (searchParams.back === "1" && history.length > 1) {
      this._showBack = true;
      navigate(constructUrlCurrentPath(removeSearchParam("back")), {
        replace: true,
      });
    }
  }

  protected updated(changedProps: PropertyValues) {
    if (!this.isConnected) {
      return;
    }
    // On narrow screens, the sources sheet covers the results, so only fetch
    // once it is closed instead of on every source change.
    if (this.narrow && this._sheetOpen) {
      return;
    }
    if (
      changedProps.has("_startDate") ||
      changedProps.has("_endDate") ||
      !shallowEqual(this._getEntityIds(), this._fetchedEntityIds)
    ) {
      this._getHistory();
      this._getStats();
      this._getComparison();
    } else if (changedProps.has("_comparePeriod")) {
      this._getComparison();
    }
  }

  private _comparisonChanged(ev: HaSelectSelectEvent<ComparePeriod | "none">) {
    if (this._comparePeriod === ev.detail.value) {
      this._getComparison();
      return;
    }
    this._comparePeriod = ev.detail.value;
    this._clearComparison();
  }

  private _clearComparison() {
    this._comparisonRequest++;
    this._comparison = undefined;
    this._comparisonStatus = undefined;
  }

  private async _getComparison() {
    this._clearComparison();
    const request = this._comparisonRequest;
    const generation = this._historyGeneration;
    const entityIds = this._getEntityIds().filter(
      (id) => !isExternalStatistic(id)
    );
    if (
      !this.isConnected ||
      this._comparePeriod === "none" ||
      !entityIds.length
    ) {
      return;
    }
    // A range ending in the future compares only its elapsed portion.
    const end = Math.min(this._endDate.getTime(), Date.now());
    const start = this._startDate.getTime();
    const shift = computeCompareShiftMs(
      this._comparePeriod,
      (end - start) / 3_600_000
    );
    if (!shift) {
      this._comparisonStatus = "limit";
      return;
    }
    this._comparisonStatus = "loading";
    try {
      const states = await fetchDateWS(
        this.hass,
        new Date(start - shift),
        new Date(end - shift),
        entityIds
      );
      if (
        !this.isConnected ||
        generation !== this._historyGeneration ||
        request !== this._comparisonRequest
      ) {
        return;
      }
      // Never synthesize earlier samples from the entity's current state.
      const history = computeHistory(
        this.hass,
        states,
        Object.keys(states),
        this.hass.localize,
        true
      );
      this._comparison = { history, shift };
      this._comparisonStatus = history.line.some((unit) =>
        unit.data.some((entity) => entity.states.length > 0)
      )
        ? undefined
        : "empty";
    } catch (_err) {
      if (
        this.isConnected &&
        generation === this._historyGeneration &&
        request === this._comparisonRequest
      ) {
        this._comparison = undefined;
        this._comparisonStatus = "unavailable";
      }
    }
  }

  private _openSources() {
    this._filterBar?.openSources();
  }

  private _sheetChanged(
    ev: HASSDomEvent<HASSDomEvents["filter-sheet-changed"]>
  ) {
    this._sheetOpen = ev.detail.open;
  }

  private _filterChanged(
    ev: HASSDomEvent<HASSDomEvents["source-filter-changed"]>
  ) {
    // History offers the type and integration filters only.
    if (ev.detail.key === "causes") {
      return;
    }
    this._filters = setSourceFilter(
      this._filters,
      ev.detail.key,
      ev.detail.value
    );
    this._storedFilters = this._filters;
  }

  private _clearSources() {
    this._filters = {};
    this._storedFilters = this._filters;
    this._targetPickerValue = {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private async _getStats() {
    const statisticIds = this._getEntityIds();
    this._fetchedEntityIds = statisticIds;
    const fetchId = ++this._statsFetchId;

    // The previous statistics would otherwise show under the new selection
    // until the request is done, and with only external statistics nothing
    // else shows the loading.
    this._statisticsHistory = undefined;
    if (statisticIds.length === 0) {
      return;
    }

    const statsStartDate = new Date(this._startDate);
    // History uses the end datapoint of the statistic, so if we want the
    // graph to start at 7AM, need to fetch the statistic from 6AM.
    statsStartDate.setHours(statsStartDate.getHours() - 1);

    const externalIds = statisticIds.filter(isExternalStatistic);

    let statistics;
    let metadata: StatisticsMetaData[];
    try {
      [statistics, metadata] = await Promise.all([
        fetchStatistics(
          this.hass!.callWS,
          statsStartDate,
          this._endDate,
          statisticIds,
          "hour",
          undefined,
          ["mean", "state"]
        ),
        // External statistics take name and unit from the metadata. Without
        // it they are still shown, under their ID.
        externalIds.length
          ? getStatisticMetadata(this.hass!.callWS, externalIds).catch(() => [])
          : Promise.resolve([]),
      ]);
    } catch (_err) {
      // External statistics have no state history that would end the loading
      if (fetchId === this._statsFetchId) {
        this._statisticsHistory = { line: [], timeline: [] };
      }
      return;
    }

    if (fetchId !== this._statsFetchId) {
      return;
    }

    this._statisticsHistory = convertStatisticsToHistory(
      this.hass!,
      statistics,
      statisticIds,
      true,
      Object.fromEntries(metadata.map((meta) => [meta.statistic_id, meta]))
    );
  }

  private async _getHistory() {
    const sourceIds = this._getEntityIds();
    this._fetchedEntityIds = sourceIds;
    const entityIds = sourceIds.filter((id) => !isExternalStatistic(id));

    if (entityIds.length === 0) {
      // The running subscription would keep pushing the previous entities.
      this._unsubscribeHistory();
      this._stateHistory = undefined;
      this._isLoading = false;
      // Charts of external statistics stay mounted, so reset their zoom too
      this._resetZoom();
      return;
    }

    this._isLoading = true;
    // The charts are rebuilt once loaded, so they start unzoomed.
    this._zoomRange = [0, 100];

    this._unsubscribeHistory();
    this._stateHistory = undefined;

    const now = new Date();

    // The first message is applied right away, live updates to a large history are coalesced
    const generation = this._historyGeneration;
    let lastApplied = 0;
    let pending: HistoryStates | undefined;
    const applyHistory = (history: HistoryStates) => {
      if (!this.isConnected || generation !== this._historyGeneration) {
        return;
      }
      lastApplied = Date.now();
      this._isLoading = false;
      this._stateHistory = computeHistory(
        this.hass,
        history,
        entityIds,
        this.hass.localize,
        true
      );
    };

    this._subscribed = subscribeHistory(
      this.hass,
      (history) => {
        // A replaced subscription can still deliver until its unsubscribe is acknowledged
        if (!this.isConnected || generation !== this._historyGeneration) {
          return;
        }
        const delay = lastApplied
          ? computeHistoryUpdateDelay(
              countHistoryStates(history),
              Math.min(this._endDate.getTime(), Date.now()) -
                this._startDate.getTime(),
              (this._stateHistoryCharts?.clientWidth || DEFAULT_CHART_WIDTH) *
                window.devicePixelRatio,
              MIN_TIME_BETWEEN_UPDATES
            )
          : 0;
        const wait = lastApplied + delay - Date.now();
        if (wait <= 0) {
          window.clearTimeout(this._historyUpdateTimer);
          this._historyUpdateTimer = undefined;
          pending = undefined;
          applyHistory(history);
          return;
        }
        // Every message carries the complete history, so the latest one wins.
        pending = history;
        this._stateHistoryCharts?.requestUpdate();
        if (this._historyUpdateTimer === undefined) {
          this._historyUpdateTimer = window.setTimeout(() => {
            if (!this.isConnected || generation !== this._historyGeneration) {
              return;
            }
            this._historyUpdateTimer = undefined;
            if (pending) {
              const latest = pending;
              pending = undefined;
              applyHistory(latest);
            }
          }, wait);
        }
      },
      this._startDate,
      this._endDate,
      entityIds
    );
    this._subscribed.catch(() => {
      if (!this.isConnected || generation !== this._historyGeneration) {
        return;
      }
      this._isLoading = false;
      this._stateHistory = { line: [], timeline: [] };
      this._unsubscribeHistory();
    });
    if (this._endDate > now) {
      this._setRedrawTimer();
    }
  }

  private _setRedrawTimer() {
    clearInterval(this._interval);
    const now = new Date();
    const end = this._endDate > now ? now : this._endDate;
    const timespan = differenceInHours(end, this._startDate);
    this._interval = window.setInterval(
      () => this._stateHistoryCharts?.requestUpdate(),
      // if timespan smaller than 1 hour, update every 10 seconds, smaller than 5 hours, redraw every minute, otherwise every 5 minutes
      timespan < 2
        ? 10000
        : timespan < 10
          ? 60 * 1000
          : MIN_TIME_BETWEEN_UPDATES
    );
  }

  private _unsubscribeHistory() {
    this._clearComparison();
    if (this._interval) {
      clearInterval(this._interval);
      this._interval = undefined;
    }
    window.clearTimeout(this._historyUpdateTimer);
    this._historyUpdateTimer = undefined;
    this._historyGeneration++;
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub?.()).catch(() => undefined);
      this._subscribed = undefined;
    }
  }

  private _getEntityIds(): string[] {
    return this.__filterEntityIds(
      this.__resolveTargetEntityIds(
        this._targetPickerValue,
        this.hass.entities,
        this.hass.devices,
        this.hass.areas
      ),
      this._filters,
      // Only a device class narrows down using the states.
      entityTypesNeedStates(this._filters.types)
        ? this.hass.states
        : EMPTY_STATES,
      this.hass.entities,
      this._entitySources
    );
  }

  // Same rules as the target picker, so that the chip and the picker agree.
  private __resolveTargetEntityIds = memoizeOne(
    (
      targetPickerValue: HassServiceTarget,
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"]
    ): string[] => {
      const picked = new Set(ensureArray(targetPickerValue.entity_id));
      return resolveEntityIDs(
        this.hass,
        targetPickerValue,
        entities,
        devices,
        areas
      ).filter(
        (entityId) => picked.has(entityId) || !entities[entityId]?.hidden
      );
    }
  );

  private __filterEntityIds = memoizeOne(applySourceFilters);

  private _dateRangeChanged(ev) {
    this._startDate = ev.detail.value.startDate;
    this._endDate = ev.detail.value.endDate;
    this._updatePath();
  }

  private _targetsChanged(ev) {
    this._targetPickerValue = ev.detail.value || {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _updatePath() {
    navigate(
      createHistoryLogbookUrl(
        "/history",
        this._targetPickerValue,
        this._startDate,
        this._endDate
      ),
      { replace: true }
    );
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadHistory();
        break;
      case "add-card":
        this._suggestCard();
        break;
    }
  }

  private _downloadHistory() {
    // Make a copy because getEntityIDs is memoized and sort works in-place
    const entities = [...this._getEntityIds()].sort();
    if (entities.length === 0 || !this._mungedStateHistory) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.history.download_data_error"),
        text: this.hass.localize("ui.panel.history.error_no_data"),
        warning: true,
      });
      return;
    }

    const headers = ["entity_id", "state", "last_changed"];
    const csv: string[][] = [[]]; // headers will be replaced later.
    const processedDomainAttributes = new Set<string>();
    const domainAttributes: Record<string, Record<string, number>> = {
      climate: {
        current_temperature: 0,
        hvac_action: 0,
        target_temp_high: 0,
        target_temp_low: 0,
        temperature: 0,
      },
      humidifier: {
        action: 0,
        current_humidity: 0,
        humidity: 0,
      },
      water_heater: {
        current_temperature: 0,
        operation_mode: 0,
        temperature: 0,
      },
    };
    const formatDate = (number) => new Date(number).toISOString();

    for (const line of this._mungedStateHistory.line) {
      for (const entity of line.data) {
        // Comparison timestamps are shifted for display, never exported as records.
        if (entity.compare) {
          continue;
        }
        const entityId = entity.entity_id;
        const domain = computeDomain(entityId);
        const extraAttributes = domainAttributes[domain];

        // Add extra attributes to headers if needed
        if (extraAttributes && !processedDomainAttributes.has(domain)) {
          processedDomainAttributes.add(domain);
          let index = headers.length;
          for (const attr of Object.keys(extraAttributes)) {
            headers.push(attr);
            extraAttributes[attr] = index;
            index += 1;
          }
        }

        if (entity.statistics) {
          for (const s of entity.statistics) {
            csv.push([entityId, s.state, formatDate(s.last_changed)]);
          }
        }

        for (const s of entity.states) {
          const lastChanged = formatDate(s.last_changed);
          const data = [entityId, s.state, lastChanged];

          if (s.attributes && extraAttributes) {
            const attrs = s.attributes;
            for (const [attr, index] of Object.entries(extraAttributes)) {
              if (attr in attrs) {
                data[index] = attrs[attr];
              }
            }
          }

          csv.push(data);
        }
      }
    }
    for (const timeline of this._mungedStateHistory.timeline) {
      const entityId = timeline.entity_id;
      for (const s of timeline.data) {
        csv.push([
          entityId,
          csvSafeString(s.state),
          formatDate(s.last_changed),
        ]);
      }
    }
    csv[0] = headers;
    csvDownload(csv, "history.csv");
  }

  private _suggestCard() {
    const entities = this._getEntityIds();
    if (entities.length === 0 || !this._mungedStateHistory) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.history.add_card_error"),
        text: this.hass.localize("ui.panel.history.error_no_data"),
        warning: true,
      });
      return;
    }

    // If you pick things like "This week", the end date can be in the future
    const endDateTime = Math.min(this._endDate.getTime(), Date.now());
    const cards = [
      {
        title: this.hass.localize("panel.history"),
        type: "history-graph",
        hours_to_show: Math.round(
          (endDateTime - this._startDate.getTime()) / 1000 / 60 / 60
        ),
        entities,
        compare_period:
          this._comparePeriod === "none" ? undefined : this._comparePeriod,
      },
    ];
    addEntitiesToLovelaceView(this, this.hass, {
      cardConfig: cards,
      sectionConfig: {
        title: this.hass.localize("panel.history"),
        cards,
      },
      entities,
    });
  }

  static get styles() {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        ha-top-app-bar-fixed {
          height: 100vh;
          overflow-x: hidden;
          overflow-y: visible;
        }

        .page-title {
          font-size: inherit;
          margin: inherit;
          line-height: inherit;
        }

        :host {
          --ha-generic-picker-width: min(400px, calc(100vw - 32px));
          --ha-generic-picker-max-width: 400px;
        }

        .content {
          display: flex;
          flex-direction: column;
          /* The page fills what is left under the header, whatever its height. */
          height: 100%;
          box-sizing: border-box;
          overflow: hidden;
        }

        .main {
          display: flex;
          flex: 1;
          min-height: 0;
        }

        .content-column {
          position: relative;
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
          --zoom-bar-bottom: var(--ha-space-10);
        }
        :host([narrow]) .content-column {
          --zoom-bar-bottom: var(--ha-space-2);
        }

        .toolbar {
          display: flex;
          align-items: center;
          /* On a narrow screen the date navigator drops to its own row
             instead of running past the right edge. */
          flex-wrap: wrap;
          gap: var(--ha-space-2) var(--ha-space-4);
          box-sizing: border-box;
          min-height: 56px;
          flex-shrink: 0;
          padding: var(--ha-space-1) 16px;
          border-bottom: 1px solid var(--divider-color);
          direction: var(--direction);
        }
        /* On a phone the filter row is one line that scrolls sideways, with
           a fade at both edges. */
        :host([narrow]) .toolbar {
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
          mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 16px,
            #000 calc(100% - 16px),
            transparent 100%
          );
        }
        :host([narrow]) .toolbar::-webkit-scrollbar {
          display: none;
        }

        .toolbar > * {
          flex-shrink: 0;
          max-width: 100%;
        }

        .comparison-controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2) var(--ha-space-4);
          padding: var(--ha-space-2) var(--ha-space-4);
          border-bottom: 1px solid var(--divider-color);
        }
        .comparison-controls ha-select {
          flex: 1 1 240px;
          min-width: 0;
        }
        .comparison-controls p {
          flex: 1 1 240px;
          margin: 0;
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }

        .results {
          flex: 1;
          min-width: 0;
          overflow: hidden auto;
          padding: var(--ha-space-4);
        }

        /* Room to scroll the last chart out from under the zoom bar */
        .results.has-zoom-bar {
          padding-bottom: calc(
            56px + var(--zoom-bar-bottom) + var(--ha-space-4)
          );
        }

        /* Floats like the energy dashboard's date bar */
        .zoom-bar {
          position: absolute;
          inset-inline: var(--ha-space-4);
          bottom: var(--zoom-bar-bottom);
          z-index: 1;
          max-width: 600px;
          height: 56px;
          margin-inline: auto;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: 0 var(--ha-space-4);
          --ha-card-box-shadow: var(--ha-box-shadow-l);
        }
        :host([narrow]) .zoom-bar {
          inset-inline: var(--ha-space-2);
        }
        .zoom-bar ha-chart-zoom-slider {
          flex: 1;
          min-width: 0;
        }

        /* Narrow screens: keep the vertical rhythm but give the charts the
           horizontal space back. */
        :host([narrow]) .results {
          padding-inline: var(--ha-space-2);
        }

        .progress-wrapper {
          position: relative;
          display: flex;
          align-items: center;
          flex-direction: column;
          padding: 16px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-history": HaPanelHistory;
  }
}
