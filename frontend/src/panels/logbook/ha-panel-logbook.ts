import {
  mdiArchiveClockOutline,
  mdiDotsVertical,
  mdiDownload,
  mdiFilterRemove,
  mdiTextBoxOutline,
} from "@mdi/js";
import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import {
  customElement,
  property,
  query,
  queryAll,
  state,
} from "lit/decorators";
import memoizeOne from "memoize-one";
import { fromUnixTime } from "date-fns";
import { ensureArray } from "../../common/array/ensure-array";
import { storage } from "../../common/decorators/storage";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
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
import { deepEqual } from "../../common/util/deep-equal";
import { shallowEqual } from "../../common/util/shallow-equal";
import "../../components/date-picker/ha-date-range-nav";
import "../../components/ha-button";
import "../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../components/ha-dropdown";
import "../../components/ha-dropdown-item";
import "../../components/ha-empty-state";
import "../../components/ha-icon-button";
import "../../components/ha-source-filter-bar";
import type {
  HaSourceFilterBar,
  SourceFilterKey,
} from "../../components/ha-source-filter-bar";
import "../../components/ha-svg-icon";
import {
  applySourceFilters,
  countSourceFilters,
  setSourceFilter,
  countTargets,
} from "../../components/ha-sources-picker";
import type { SourceFilters } from "../../components/ha-sources-picker";
import { entityTypesNeedStates } from "../../data/entity/entity_type";
import "../../components/ha-top-app-bar-fixed";
import type { HaEntityPickerEntityFilterFunc } from "../../data/entity/entity";
import type { EntitySources } from "../../data/entity/entity_sources";
import { fetchEntitySourcesWithCache } from "../../data/entity/entity_sources";
import { filterLogbookCompatibleEntities } from "../../data/logbook";
import { resolveEntityIDs } from "../../data/selector";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import "./ha-logbook";
import "./ha-logbook-stats";
import type { HaLogbook } from "./ha-logbook";
import type { LogbookEntry } from "../../data/logbook";
import { showAlertDialog } from "../../dialogs/generic/show-dialog-box";
import { csvDownload, csvSafeString } from "../../util/csv";

const EMPTY_STATES: HomeAssistant["states"] = {};

interface LogbookFilters extends SourceFilters {
  /** Keys from `computeLogbookCauseKey`. */
  causes?: string[];
}

interface LogbookState {
  time: { range: [Date, Date] };
  targetPickerValue: HassServiceTarget;
}

@customElement("ha-panel-logbook")
export class HaPanelLogbook extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() _time: { range: [Date, Date] };

  @state() _entityIds?: string[];

  @state()
  private _showBack?: boolean;

  @state() private _filters: LogbookFilters = {};

  // Whether the filter dialog or sheet is open, so that a phone waits for it
  // to close before it fetches the new results.
  @state() private _sheetOpen = false;

  @query("ha-source-filter-bar") private _filterBar?: HaSourceFilterBar;

  // The blocks that rise when the page is first shown.
  @queryAll(".entry") private _entryBlocks!: NodeListOf<Element>;

  @state() private _entitySources?: EntitySources;

  @state() private _entries: LogbookEntry[] = [];

  @state() private _targetPickerValue: HassServiceTarget = {};

  // Remembers the last user-picked selection as a fallback for visits without
  // URL params. Kept separate from _targetPickerValue because localStorage is
  // synced across tabs and would leak one tab's selection into the others.
  @storage({
    key: "logbookPickedValue",
    state: false,
    subscribe: false,
  })
  private _storedTargetPickerValue?: HassServiceTarget;

  @storage({
    key: "logbookSourceFilters",
    state: false,
    subscribe: false,
  })
  private _storedFilters?: LogbookFilters;

  public constructor() {
    super();
    this._time = this._defaultState.time;
  }

  protected render() {
    const entityIds = this._getEntityIds();
    const filterCount = countSourceFilters(this._filters);
    const sourceCount = countTargets(this._targetPickerValue) + filterCount;
    const sourcesLabel = entityIds
      ? this.hass.localize("ui.panel.logbook.sources_count", {
          count: entityIds?.length ?? 0,
        })
      : this.hass.localize("ui.panel.logbook.sources");

    return html`
      <ha-top-app-bar-fixed
        .narrow=${this.narrow}
        .backButton=${!!this._showBack}
        .summary=${this.hass.localize("ui.panel.logbook.summary")}
      >
        <div slot="title">${this.hass.localize("panel.logbook")}</div>

        ${
          this.narrow
            ? nothing
            : html`<ha-button
                slot="primaryAction"
                appearance="filled"
                variant="neutral"
                @click=${this._downloadData}
              >
                <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                ${this.hass.localize("ui.panel.logbook.download_data")}
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
              ? html`<ha-dropdown-item value="download">
                  ${this.hass.localize("ui.panel.logbook.download_data")}
                  <ha-svg-icon slot="icon" .path=${mdiDownload}></ha-svg-icon>
                </ha-dropdown-item>`
              : nothing
          }

          <ha-dropdown-item value="reset" .disabled=${this._isDefaultState()}>
            ${this.hass.localize("ui.common.reset")}
            <ha-svg-icon slot="icon" .path=${mdiFilterRemove}></ha-svg-icon>
          </ha-dropdown-item>

          ${
            this.hass.user?.is_admin &&
            isComponentLoaded(this.hass.config, "activity_record")
              ? html`<ha-dropdown-item value="permanent_record">
                  ${this.hass.localize("ui.panel.logbook.permanent_record")}
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiArchiveClockOutline}
                  ></ha-svg-icon>
                </ha-dropdown-item>`
              : nothing
          }
        </ha-dropdown>

        <div class="content">
          <div class="main">
            <div class="content-column">
              ${
                this.narrow
                  ? nothing
                  : html`<ha-logbook-stats
                      class="entry"
                      .hass=${this.hass}
                      .entries=${this._entries}
                    ></ha-logbook-stats>`
              }
              <div class="toolbar entry">
                <ha-source-filter-bar
                  .hass=${this.hass}
                  .narrow=${this.narrow}
                  .targets=${this._targetPickerValue}
                  .filters=${this._filters}
                  .entitySources=${this._entitySources}
                  .entityFilter=${this._filterFunc}
                  .noTargetsText=${this.hass.localize(
                    "ui.panel.logbook.no_targets"
                  )}
                  .sourcesLabel=${this.hass.localize("ui.panel.logbook.sources")}
                  .sourcesCountLabel=${sourcesLabel}
                  .resultCount=${entityIds?.length}
                  show-causes
                  @sources-changed=${this._targetsChanged}
                  @source-filter-changed=${this._filterChanged}
                  @sources-cleared=${this._clearSources}
                  @filter-sheet-changed=${this._sheetChanged}
                ></ha-source-filter-bar>
                <ha-date-range-nav
                  .startDate=${this._time.range[0]}
                  .endDate=${this._time.range[1]}
                  @value-changed=${this._dateRangeChanged}
                  extended-presets
                  time-picker
                ></ha-date-range-nav>
              </div>

              <ha-logbook
                .hass=${this.hass}
                .time=${this._time}
                .entityIds=${this._shownEntityIds}
                .causeFilter=${this._shownCauses}
                .narrow=${this.narrow}
                @logbook-entries-changed=${this._entriesChanged}
                show-cause
                virtualize
              >
                ${
                  sourceCount > 0
                    ? html`<ha-empty-state
                        slot="empty"
                        tone="filtered"
                        .heading=${this.hass.localize(
                          "ui.panel.logbook.no_results_title"
                        )}
                        .description=${this.hass.localize(
                          "ui.panel.logbook.no_results"
                        )}
                      >
                        <ha-svg-icon
                          slot="icon"
                          .path=${mdiTextBoxOutline}
                        ></ha-svg-icon>
                        <ha-button
                          slot="actions"
                          appearance="plain"
                          @click=${this._openSources}
                        >
                          ${this.hass.localize(
                            "ui.panel.logbook.change_sources"
                          )}
                        </ha-button>
                      </ha-empty-state>`
                    : nothing
                }
              </ha-logbook>
            </div>
          </div>
        </div>
      </ha-top-app-bar-fixed>
    `;
  }

  private _entriesChanged(ev: Event) {
    this._entries = (ev.target as HaLogbook).getEntries();
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
    this._setFilter(ev.detail.key, ev.detail.value);
  }

  private _setFilter(
    key: SourceFilterKey,
    value: HASSDomEvents["source-filter-changed"]["value"]
  ) {
    this._filters = setSourceFilter(this._filters, key, value);
    this._storedFilters = this._filters;
  }

  private _clearSources() {
    this._filters = {};
    this._storedFilters = this._filters;
    this._targetPickerValue = {};
    this._storedTargetPickerValue = this._targetPickerValue;
    this._updatePath();
  }

  private _filterFunc: HaEntityPickerEntityFilterFunc = (entity) =>
    filterLogbookCompatibleEntities(entity);

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      this._applyURLParams();
    }

    // On narrow screens, the sources sheet covers the results, so only apply
    // the sources once it is closed instead of on every source change.
    if (!this.narrow || !this._sheetOpen) {
      this._shownEntityIds = this._getEntityIds();
      this._shownCauses = this._filters.causes;
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    playPageEntry(Array.from(this._entryBlocks));
    this.hass.loadBackendTranslation("title");
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

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener("location-changed", this._locationChanged);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener("location-changed", this._locationChanged);
  }

  private _locationChanged = () => {
    this._applyURLParams();
  };

  /** The entities to show activity for, or undefined for all of them. */
  private _getEntityIds(): string[] | undefined {
    const hasTargets = countTargets(this._targetPickerValue) > 0;
    const targetEntities = hasTargets
      ? this.__filterTargetEntityIds(
          this.__resolveTargetEntityIds(
            this._targetPickerValue,
            this.hass.entities,
            this.hass.devices,
            this.hass.areas
          ),
          this._targetPickerValue.entity_id,
          this.hass.entities,
          this.hass.states
        )
      : undefined;

    if (!this._filters.types?.length && !this._filters.integrations?.length) {
      return targetEntities;
    }

    return this.__filterEntityIds(
      targetEntities ?? this.__logbookEntityIds(this.hass.states),
      this._filters,
      // Only a device class narrows down using the states.
      entityTypesNeedStates(this._filters.types)
        ? this.hass.states
        : EMPTY_STATES,
      this.hass.entities,
      this._entitySources
    );
  }

  private __resolveTargetEntityIds = memoizeOne(
    (
      targetPickerValue: HassServiceTarget,
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      areas: HomeAssistant["areas"]
    ): string[] =>
      resolveEntityIDs(this.hass, targetPickerValue, entities, devices, areas)
  );

  // Same rules as the target picker, so that the chip and the picker agree.
  private __filterTargetEntityIds = memoizeOne(
    (
      entityIds: string[],
      pickedEntityIds: string | string[] | undefined,
      entities: HomeAssistant["entities"],
      states: HomeAssistant["states"]
    ): string[] => {
      const picked = new Set(ensureArray(pickedEntityIds));
      return this._stableEntityIds(
        entityIds.filter((entityId) => {
          if (picked.has(entityId)) {
            return true;
          }
          const stateObj = states[entityId];
          return (
            !entities[entityId]?.hidden &&
            stateObj &&
            filterLogbookCompatibleEntities(stateObj)
          );
        })
      );
    }
  );

  private __logbookEntityIds = memoizeOne(
    (states: HomeAssistant["states"]): string[] =>
      this._stableEntityIds(
        Object.values(states)
          .filter((stateObj) => filterLogbookCompatibleEntities(stateObj))
          .map((stateObj) => stateObj.entity_id)
      )
  );

  private __filterEntityIds = memoizeOne(applySourceFilters);

  private _lastEntityIds?: string[];

  private _shownEntityIds?: string[];

  private _shownCauses?: string[];

  // A list keyed on the states must keep its identity or ha-logbook resubscribes.
  private _stableEntityIds(entityIds: string[]): string[] {
    if (this._lastEntityIds && shallowEqual(this._lastEntityIds, entityIds)) {
      return this._lastEntityIds;
    }
    this._lastEntityIds = entityIds;
    return entityIds;
  }

  private _applyURLParams() {
    const queryParams = decodeHistoryLogbookQueryParams(
      extractSearchParamsObject()
    );
    const targetPickerValue = historyLogbookTargetFromQueryParams(queryParams);
    if (targetPickerValue) {
      this._targetPickerValue = targetPickerValue;
    } else if (!this.hasUpdated && this._storedTargetPickerValue) {
      this._targetPickerValue = this._storedTargetPickerValue;
    }

    // A target linked from another page must not be narrowed by the filters.
    if (
      targetPickerValue &&
      !historyLogbookTargetsEqual(
        targetPickerValue,
        this._storedTargetPickerValue ?? {}
      )
    ) {
      this._filters = {};
    } else if (!this.hasUpdated && this._storedFilters) {
      this._filters = this._storedFilters;
    }

    if (queryParams.start_date || queryParams.end_date) {
      const startDate = queryParams.start_date ?? this._time.range[0];
      const endDate = queryParams.end_date ?? this._time.range[1];

      // Only set if date has changed.
      if (
        startDate.getTime() !== this._time.range[0].getTime() ||
        endDate.getTime() !== this._time.range[1].getTime()
      ) {
        this._time = {
          range: [
            queryParams.start_date ?? this._time.range[0],
            queryParams.end_date ?? this._time.range[1],
          ],
        };
      }
    }
  }

  private _dateRangeChanged(ev) {
    const startDate = ev.detail.value.startDate;
    const endDate = ev.detail.value.endDate;
    this._time = {
      range: [startDate, endDate],
    };
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
        "/logbook",
        this._targetPickerValue,
        this._time.range[0],
        this._time.range[1]
      ),
      { replace: true }
    );
  }

  private get _defaultState(): LogbookState {
    const start = new Date();
    start.setHours(start.getHours() - 1, 0, 0, 0);

    const end = new Date();
    end.setHours(end.getHours() + 2, 0, 0, 0);

    return {
      time: { range: [start, end] },
      targetPickerValue: {},
    };
  }

  private _isDefaultState(): boolean {
    return (
      !countSourceFilters(this._filters) &&
      deepEqual(
        { time: this._time, targetPickerValue: this._targetPickerValue },
        this._defaultState
      )
    );
  }

  private _resetLogbook() {
    const defaultState = this._defaultState;
    this._time = defaultState.time;
    this._targetPickerValue = defaultState.targetPickerValue;
    this._storedTargetPickerValue = undefined;
    this._filters = {};
    this._storedFilters = undefined;
    navigate("/logbook", { replace: true });
  }

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "download":
        this._downloadData();
        break;
      case "reset":
        this._resetLogbook();
        break;
      case "permanent_record":
        navigate("/config/activity-record");
        break;
    }
  }

  private _downloadData() {
    const data =
      this.shadowRoot!.querySelector("ha-logbook")?.getEntries() || [];

    if (data.length === 0) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.logbook.download_data_error"),
        text: this.hass.localize("ui.panel.logbook.error_no_data"),
        warning: true,
      });
      return;
    }

    const headers = [
      "time",
      "entity_id",
      "state",
      "event_type",
      "name",
      "message",
      "source",
      "context_id",
      "context_user_id",
      "context_event_type",
      "context_domain",
      "context_service",
      "context_entity_id",
      "context_state",
      "context_source",
    ];
    const csv: string[][] = [headers];

    for (const d of data) {
      const time = fromUnixTime(d.when).toISOString();
      csv.push([
        time,
        d.entity_id || "",
        csvSafeString(d.state),
        csvSafeString(d.attributes?.event_type),
        csvSafeString(d.name),
        csvSafeString(d.message),
        csvSafeString(d.source),
        d.context_id || "",
        d.context_user_id || "",
        csvSafeString(d.context_event_type),
        d.context_domain || "",
        d.context_service || "",
        d.context_entity_id || "",
        csvSafeString(d.context_state),
        d.context_source || "",
      ]);
    }
    csvDownload(csv, "activity.csv");
  }

  static get styles() {
    return [
      haStyle,
      css`
        :host {
          --ha-generic-picker-width: min(400px, calc(100vw - 32px));
          --ha-generic-picker-max-width: 400px;
        }

        /* The page fills what is left under the header, whatever its height. */
        .content {
          display: flex;
          flex-direction: column;
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
          display: flex;
          flex-direction: column;
          flex: 1;
          min-width: 0;
        }

        .toolbar {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          box-sizing: border-box;
          height: 56px;
          flex-shrink: 0;
          padding: 0 16px;
          border-bottom: 1px solid var(--divider-color);
          direction: var(--direction);
          overflow-x: auto;
          scrollbar-width: none;
        }
        /* A fade at both edges shows that the row scrolls sideways. */
        :host([narrow]) .toolbar {
          mask-image: linear-gradient(
            to right,
            transparent 0,
            #000 16px,
            #000 calc(100% - 16px),
            transparent 100%
          );
        }

        .toolbar::-webkit-scrollbar {
          display: none;
        }

        .toolbar > * {
          flex-shrink: 0;
        }

        ha-logbook {
          flex: 1;
          min-height: 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-logbook": HaPanelLogbook;
  }
}
