import type { ContextType } from "@lit/context";
import {
  mdiChevronDown,
  mdiChip,
  mdiDns,
  mdiFilterVariant,
  mdiPackageVariant,
  mdiPuzzle,
  mdiRadar,
  mdiVolumeHigh,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { atLeastVersion } from "../../../common/config/version";
import { QueryParamsController } from "../../../common/controllers/query-params-controller";
import { consume } from "../../../common/decorators/consume";
import type {
  HASSDomEvent,
  HASSDomTargetEvent,
} from "../../../common/dom/fire_event";
import {
  getHistoryState,
  navigate,
  updateHistoryState,
} from "../../../common/navigate";
import { stringCompare } from "../../../common/string/compare";
import { currentPath } from "../../../common/url/current-path";
import { deepEqual } from "../../../common/util/deep-equal";
import {
  DEFAULT_LOG_PROVIDER,
  DEFAULT_LOGS_STATE,
  logsLinkFromUrl,
  logsQueryParamConfig,
  logsQueryParams,
} from "../../../common/url/logs-query-params";
import { createQueryString } from "../../../common/url/query-params";
import "../../../components/ha-app-icon";
import "../../../components/chips/ha-filter-chip";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-combo-box-item";
import "../../../components/ha-filter-integrations";
import "../../../components/ha-filter-pane";
import "../../../components/ha-filter-pane-chip";
import "../../../components/ha-generic-picker";
import type { HaGenericPicker } from "../../../components/ha-generic-picker";
import type { PickerComboBoxItem } from "../../../components/ha-picker-combo-box";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import { manifestsContext } from "../../../data/context";
import type { DataTableFiltersValue } from "../../../data/data_table_filters";
import type { LogProvider } from "../../../data/error_log";
import {
  fetchHassioAddonsInfo,
  type HassioAddonInfo,
} from "../../../data/hassio/addon";
import { domainToName } from "../../../data/integration";
import type { LoggedError } from "../../../data/system_log";
import {
  fetchSystemLog,
  getLoggedErrorIntegration,
} from "../../../data/system_log";
import { showAlertDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { mdiHomeAssistant } from "../../../resources/home-assistant-logo-svg";
import { haStyle } from "../../../resources/styles";
import type {
  HomeAssistant,
  Route,
  ToggleButton,
  ValueChangedEvent,
} from "../../../types";
import "./error-log-card";
import "./system-log-card";
import type { SystemLogCard } from "./system-log-card";

const NO_INTEGRATIONS: string[] = [];

const logProviders: LogProvider[] = [
  {
    key: "core",
    name: "Home Assistant Core",
  },
  {
    key: "supervisor",
    name: "Supervisor",
  },
  {
    key: "host",
    name: "Host",
  },
  {
    key: "dns",
    name: "DNS",
  },
  {
    key: "audio",
    name: "Audio",
  },
  {
    key: "multicast",
    name: "Multicast",
  },
];

const LOGS_HISTORY_STATE = "logsPage";

interface LogProviderPickerItem extends PickerComboBoxItem {
  addon?: HassioAddonInfo;
  hasAppIcon?: boolean;
}

@customElement("ha-config-logs")
export class HaConfigLogs extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _filter = "";

  @state() private _detail = false;

  @query("system-log-card") private systemLog?: SystemLogCard;

  @query("#provider-picker") private providerPicker?: HaGenericPicker;

  @state() private _selectedLogProvider = DEFAULT_LOG_PROVIDER;

  @state() private _integrations: string[] = [];

  @state() private _logProviders = logProviders;

  @state() private _showFilters = false;

  @state() private _integrationsExpanded = true;

  // The two kinds of entry the summary lists; a chip hides one of them
  @state() private _showErrors = true;

  @state() private _showWarnings = true;

  // What the summary holds, read separately so the figures under the log stay
  // on screen in the raw view too
  @state() private _loggedErrors?: LoggedError[];

  @state()
  @consume({ context: manifestsContext, subscribe: true })
  private _manifests?: ContextType<typeof manifestsContext>;

  // The add-on providers are only known after loading them, until then the
  // provider a link asks for is kept in the URL
  private _providersLoaded = false;

  private _queryParams = new QueryParamsController(this, logsQueryParamConfig, {
    enabled: () => true,
    navigated: () => this._applyUrl(),
  });

  public connectedCallback() {
    super.connectedCallback();
    const systemLog = this.systemLog;
    if (systemLog && systemLog.loaded) {
      systemLog.fetchData();
    }
    if (this.hasUpdated) {
      this._loadLoggedErrors();
    }
  }

  private async _loadLoggedErrors() {
    try {
      this._loggedErrors = await fetchSystemLog(this.hass);
    } catch (_err) {
      // The figures are left out when the summary cannot be read
      this._loggedErrors = undefined;
    }
  }

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);

    if (!this.hasUpdated) {
      this._applyUrl();
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    this._loadLoggedErrors();
    this._init();
  }

  private _filterChanged(ev: HASSDomTargetEvent<HaInputSearch>) {
    this._filter = ev.target.value ?? "";
    this._writeUrl(true);
  }

  private _flushUrl() {
    this._queryParams.flush();
  }

  protected render(): TemplateResult {
    const core = this._selectedLogProvider === DEFAULT_LOG_PROVIDER;
    const integrations = core ? this._integrations : NO_INTEGRATIONS;
    const filtersShown = core && this._showFilters;
    const filtersLabel = this.hass.localize(
      "ui.components.subpage-data-table.filters"
    );

    const selectedProvider = this._getActiveProvider(this._selectedLogProvider);

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this.hass.localize("ui.panel.config.logs.caption")}
        back-path="/config/system"
      >
        <div class="main">
          ${
            filtersShown
              ? html`<ha-filter-pane
                  .narrow=${this.narrow}
                  .count=${this._integrations.length}
                  @close-filter-pane=${this._closeFilters}
                  @clear-filter=${this._clearIntegrations}
                >
                  <ha-filter-integrations
                    .narrow=${this.narrow}
                    .value=${this._integrations}
                    .expanded=${this._integrationsExpanded}
                    @data-table-filter-changed=${this._integrationsChanged}
                    @expanded-changed=${this._integrationsExpandedChanged}
                  ></ha-filter-integrations>
                </ha-filter-pane>`
              : nothing
          }
          <div class="content-column">
            <div class="head">
              <div class="titles">
                <h2>${this.hass.localize("ui.panel.config.logs.caption")}</h2>
                <p>${this.hass.localize("ui.panel.config.logs.summary")}</p>
              </div>
              ${
                isComponentLoaded(this.hass.config, "hassio") &&
                this._logProviders
                  ? html`
                      <ha-generic-picker
                        id="provider-picker"
                        .getItems=${this._getLogProviderItems}
                        value=""
                        .rowRenderer=${this._providerRenderer}
                        @value-changed=${this._handleDropdownSelect}
                      >
                        <ha-button
                          slot="field"
                          appearance="outlined"
                          @click=${this._openPicker}
                        >
                          <span class="source-label"
                            >${this.hass.localize(
                              "ui.panel.config.logs.source"
                            )}</span
                          >
                          ${
                            selectedProvider
                              ? this._renderProviderIcon(selectedProvider)
                              : nothing
                          }
                          ${selectedProvider?.primary}
                          <ha-svg-icon
                            slot="end"
                            .path=${mdiChevronDown}
                          ></ha-svg-icon>
                        </ha-button>
                      </ha-generic-picker>
                    `
                  : nothing
              }
            </div>
            <div class="toolbar">
              ${
                core && (!filtersShown || this.narrow)
                  ? html`<ha-filter-pane-chip
                      .label=${filtersLabel}
                      .path=${mdiFilterVariant}
                      .count=${this._integrations.length}
                      .active=${this._integrations.length > 0}
                      @click=${this._toggleFilters}
                    ></ha-filter-pane-chip>`
                  : nothing
              }
              <ha-input-search
                appearance="outlined"
                @input=${this._filterChanged}
                @blur=${this._flushUrl}
                .value=${this._filter}
                .placeholder=${this.hass.localize("ui.panel.config.logs.search")}
              ></ha-input-search>
              ${
                core && !this._detail
                  ? html`<div class="level-chips">
                      <ha-filter-chip
                        .label=${this.hass.localize(
                          "ui.panel.config.logs.errors"
                        )}
                        .selected=${this._showErrors}
                        @click=${this._toggleErrors}
                      ></ha-filter-chip>
                      <ha-filter-chip
                        .label=${this.hass.localize(
                          "ui.panel.config.logs.warnings"
                        )}
                        .selected=${this._showWarnings}
                        @click=${this._toggleWarnings}
                      ></ha-filter-chip>
                    </div>`
                  : nothing
              }
              ${
                core
                  ? html`<ha-button-toggle-group
                      .buttons=${this._getViewButtons(this.hass.localize)}
                      .active=${this._detail ? "raw" : "summary"}
                      size="s"
                      no-wrap
                      @value-changed=${this._viewChanged}
                    ></ha-button-toggle-group>`
                  : nothing
              }
            </div>
            <div class="content">
              ${
                core && !this._detail
                  ? html`
                      <system-log-card
                        .hass=${this.hass}
                        .header=${
                          this._logProviders.find(
                            (p) => p.key === this._selectedLogProvider
                          )!.name
                        }
                        .filter=${this._filter}
                        .levels=${this._shownLevels(
                          this._showErrors,
                          this._showWarnings
                        )}
                        .integrations=${integrations}
                        .integrationLoggers=${this._getIntegrationLoggers(
                          integrations,
                          this._manifests
                        )}
                        no-title
                        @switch-log-view=${this._showDetail}
                        @show-all-levels=${this._showAllLevels}
                      ></system-log-card>
                    `
                  : html`<error-log-card
                      .header=${
                        this._logProviders.find(
                          (p) => p.key === this._selectedLogProvider
                        )!.name
                      }
                      .filter=${this._filter}
                      .provider=${this._selectedLogProvider}
                      .integrations=${integrations}
                      @switch-log-view=${this._showDetail}
                      allow-switch
                      no-title
                    ></error-log-card>`
              }
            </div>
            ${core ? this._renderTiles() : nothing}
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _showDetail() {
    this._detail = !this._detail;
    this._writeUrl();
  }

  private _viewChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    const raw = ev.detail?.value === "raw";
    if (raw !== this._detail) {
      this._showDetail();
    }
  }

  private _getViewButtons = memoizeOne(
    (localize: HomeAssistant["localize"]): ToggleButton[] => [
      {
        label: localize("ui.panel.config.logs.view_summary"),
        value: "summary",
      },
      { label: localize("ui.panel.config.logs.view_raw"), value: "raw" },
    ]
  );

  private _toggleErrors() {
    this._showErrors = !this._showErrors;
  }

  private _showAllLevels() {
    this._showErrors = true;
    this._showWarnings = true;
  }

  private _toggleWarnings() {
    this._showWarnings = !this._showWarnings;
  }

  private _shownLevels = memoizeOne(
    (errors: boolean, warnings: boolean): string[] => [
      ...(errors ? ["critical", "error"] : []),
      ...(warnings ? ["warning"] : []),
    ]
  );

  // "All from Tuya" or "Most from Tuya", for the entry source that appears
  // most often among the given entries
  private _sourceNote(entries: LoggedError[]): string | undefined {
    if (!entries.length) {
      return undefined;
    }
    const counts = new Map<string, number>();
    for (const entry of entries) {
      const domain = getLoggedErrorIntegration(entry);
      const source = domain
        ? domainToName(this.hass.localize, domain)
        : entry.source[0];
      counts.set(source, (counts.get(source) ?? 0) + 1);
    }
    const [top, topCount] = [...counts.entries()].sort(
      (a, b) => b[1] - a[1]
    )[0];
    return this.hass.localize(
      topCount === entries.length
        ? "ui.panel.config.logs.all_from"
        : "ui.panel.config.logs.most_from",
      { source: top }
    );
  }

  private _renderTiles() {
    if (!this._loggedErrors) {
      return nothing;
    }
    const localize = this.hass.localize;
    // Entries are kept with the time they last happened
    const dayAgo = Date.now() / 1000 - 24 * 60 * 60;
    const recent = this._loggedErrors.filter(
      (entry) => entry.timestamp >= dayAgo
    );
    const errors = recent.filter(
      (entry) => entry.level === "error" || entry.level === "critical"
    );
    const warnings = recent.filter((entry) => entry.level === "warning");
    return html`
      <div class="tiles">
        <div class="tile errors">
          <span class="tile-label"
            >${localize("ui.panel.config.logs.errors_last_day")}</span
          >
          <span class="tile-value">${errors.length}</span>
          <span class="tile-sub">${this._sourceNote(errors)}</span>
        </div>
        <div class="tile warnings">
          <span class="tile-label"
            >${localize("ui.panel.config.logs.warnings_last_day")}</span
          >
          <span class="tile-value">${warnings.length}</span>
          <span class="tile-sub">${this._sourceNote(warnings)}</span>
        </div>
      </div>
    `;
  }

  private _openPicker(ev: Event) {
    ev.stopPropagation();
    this.providerPicker?.open();
  }

  private _handleDropdownSelect(ev: ValueChangedEvent<string>) {
    const provider = ev.detail?.value;
    if (!provider) {
      return;
    }
    this._selectedLogProvider = provider;
    this._filter = "";
    this._integrations = [];
    // Keep the search typed so far on the entry Back returns to
    this._queryParams.flush();
    // Picking another provider is a navigation of its own, so Back returns
    // to the previous one. Both entries are marked, so going back to one
    // without params shows the default view instead of keeping the provider.
    updateHistoryState({ [LOGS_HISTORY_STATE]: true });
    const search = createQueryString(
      logsQueryParams({
        provider,
        search: "",
        integrations: [],
        raw: this._detail,
      }),
      logsQueryParamConfig
    );
    // From the current path, so a trailing slash still matches the controller
    navigate(`${currentPath()}${search ? `?${search}` : ""}`, {
      data: { [LOGS_HISTORY_STATE]: true },
    });
  }

  private _toggleFilters() {
    this._showFilters = !this._showFilters;
  }

  private _closeFilters() {
    this._showFilters = false;
  }

  private _integrationsChanged(
    ev: HASSDomEvent<{ value: DataTableFiltersValue }>
  ) {
    ev.stopPropagation();
    const value = ev.detail.value;
    this._integrations = Array.isArray(value) ? value : [];
    this._writeUrl();
  }

  private _clearIntegrations() {
    this._integrations = [];
    this._writeUrl();
  }

  private _integrationsExpandedChanged(
    ev: HASSDomEvent<{ expanded: boolean }>
  ) {
    this._integrationsExpanded = ev.detail.expanded;
  }

  private _writeUrl(debounced = false) {
    this._queryParams.write(
      logsQueryParams({
        // Until the apps are loaded, keep the provider the URL asks for
        provider: this._providersLoaded
          ? this._selectedLogProvider
          : (logsLinkFromUrl(this._queryParams.searchParams() ?? "")
              ?.provider ?? DEFAULT_LOG_PROVIDER),
        search: this._filter,
        integrations: this._integrations,
        raw: this._detail,
      }),
      debounced
    );
  }

  private async _init() {
    if (isComponentLoaded(this.hass.config, "hassio")) {
      await this._getInstalledAddons();
    }
    // Keep a search typed while the apps were loading
    this._queryParams.flush();
    this._providersLoaded = true;
    this._applyUrl();
  }

  private _applyUrl() {
    const searchParams = this._queryParams.searchParams();
    if (!searchParams) {
      return;
    }
    const link =
      logsLinkFromUrl(searchParams) ??
      (getHistoryState()?.[LOGS_HISTORY_STATE]
        ? DEFAULT_LOGS_STATE
        : undefined);
    let missingProvider: string | undefined;
    if (link) {
      // The provider is checked once the apps are loaded, the rest of the link
      // applies straight away
      if (this._providersLoaded) {
        const found =
          link.provider === DEFAULT_LOG_PROVIDER ||
          (isComponentLoaded(this.hass.config, "hassio") &&
            this._logProviders.some((p) => p.key === link.provider));
        missingProvider = found ? undefined : link.provider;
        this._selectedLogProvider = found
          ? link.provider
          : DEFAULT_LOG_PROVIDER;
      }
      const loaded = this._getLoadedIntegrations(this.hass.config.components);
      this._filter = link.search;
      if (link.provider === DEFAULT_LOG_PROVIDER) {
        this._detail = link.raw;
      }
      const integrations = link.integrations.filter((domain) =>
        loaded.includes(domain)
      );
      // A new list restarts the log streams, so keep the current one if equal
      if (!deepEqual(integrations, this._integrations)) {
        this._integrations = integrations;
      }
    }
    // Before the alert adds its history entry, so closing it doesn't go back
    // to the missing provider
    this._writeUrl();
    if (missingProvider) {
      showAlertDialog(this, {
        title:
          this.hass.localize("ui.panel.config.logs.provider_not_found") ||
          "Log provider not found",
        text: this.hass.localize(
          "ui.panel.config.logs.provider_not_available",
          { provider: missingProvider }
        ),
      });
    }
  }

  private async _getInstalledAddons() {
    try {
      const addonsInfo = await fetchHassioAddonsInfo(this.hass);
      const sortedAddons = addonsInfo.addons
        .filter((addon) => addon.version)
        .map((addon) => ({
          key: addon.slug,
          name: addon.name,
          addon,
        }))
        .sort((a, b) =>
          stringCompare(a.name, b.name, this.hass.locale.language)
        );

      this._logProviders = [...this._logProviders, ...sortedAddons];
    } catch (_err) {
      // Ignore, nothing the user can do anyway
    }
  }

  // Integrations that only provide a platform are only listed with it, like
  // `other.device_tracker`
  private _getLoadedIntegrations = memoizeOne((components: string[]) => [
    ...new Set(components.map((component) => component.split(".")[0])),
  ]);

  private _getIntegrationLoggers = memoizeOne(
    (
      integrations: string[],
      manifests: ContextType<typeof manifestsContext> | undefined
    ): string[] | undefined =>
      integrations.length
        ? integrations.flatMap((domain) => [
            `homeassistant.components.${domain}`,
            `custom_components.${domain}`,
            ...(manifests?.[domain]?.loggers ?? []),
          ])
        : undefined
  );

  private _getLogProviderItems = (): LogProviderPickerItem[] =>
    this._logProviders.map((provider) => ({
      id: provider.key,
      primary: provider.name,
      addon: provider.addon,
      hasAppIcon: provider.addon
        ? atLeastVersion(this.hass.config.version, 0, 105) &&
          provider.addon.icon
        : undefined,
      icon_path: provider.addon
        ? mdiPuzzle
        : this._getProviderIconPath(provider.key),
    }));

  private _renderProviderIcon(item: LogProviderPickerItem) {
    if (item.addon) {
      return html`<ha-app-icon
        slot="start"
        .alt=${item.primary}
        .hasIcon=${item.hasAppIcon}
        .slug=${item.addon.slug}
      >
        <ha-svg-icon .path=${item.icon_path}></ha-svg-icon>
      </ha-app-icon>`;
    }

    return item.icon_path
      ? html`<ha-svg-icon slot="start" .path=${item.icon_path}></ha-svg-icon>`
      : nothing;
  }

  private _providerRenderer = (item: LogProviderPickerItem) => html`
    <ha-combo-box-item>
      ${this._renderProviderIcon(item)}
      <span slot="headline">${item.primary}</span>
      ${
        item.secondary
          ? html`<span slot="supporting-text">${item.secondary}</span>`
          : nothing
      }
    </ha-combo-box-item>
  `;

  private _getActiveProvider = memoizeOne((selectedLogProvider: string) => {
    const provider = this._logProviders.find(
      (p) => p.key === selectedLogProvider
    );
    if (provider) {
      return {
        id: provider.key,
        primary: provider.name,
        addon: provider.addon,
        hasAppIcon: provider.addon
          ? atLeastVersion(this.hass.config.version, 0, 105) &&
            provider.addon.icon
          : undefined,
        icon_path: provider.addon
          ? mdiPuzzle
          : this._getProviderIconPath(provider.key),
      };
    }
    return undefined;
  });

  private _getProviderIconPath(providerKey: string): string | undefined {
    switch (providerKey) {
      case "core":
        return mdiHomeAssistant;
      case "supervisor":
        return mdiPackageVariant;
      case "host":
        return mdiChip;
      case "dns":
        return mdiDns;
      case "audio":
        return mdiVolumeHigh;
      case "multicast":
        return mdiRadar;
    }
    return undefined;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        :host {
          user-select: initial;
        }
        .main {
          display: flex;
          height: 100%;
        }
        .content-column {
          flex: 1;
          min-width: 0;
          overflow-y: auto;
        }
        .toolbar {
          position: sticky;
          top: 0;
          z-index: 2;
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-4);
          box-sizing: border-box;
          min-height: 56px;
          padding: var(--ha-space-2) var(--ha-space-4);
          background: var(
            --ha-panel-toolbar-background,
            var(--primary-background-color)
          );
          border-bottom: 1px solid var(--divider-color);
        }
        .toolbar ha-input-search {
          flex: 1;
          min-width: 180px;
        }
        .head {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-end;
          justify-content: space-between;
          gap: var(--ha-space-4);
          padding: var(--ha-space-4) var(--ha-space-4) var(--ha-space-2);
        }
        .titles h2 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-3xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .titles p {
          margin: var(--ha-space-1) 0 0;
          color: var(--secondary-text-color);
          line-height: var(--ha-line-height-normal);
        }
        .source-label {
          color: var(--secondary-text-color);
          margin-inline-end: var(--ha-space-1);
        }
        .level-chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .tiles {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 220px), 1fr)
          );
          gap: var(--ha-space-4);
          padding: 0 var(--ha-space-4) var(--ha-space-6);
        }
        .tile {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          box-sizing: border-box;
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          color: var(--primary-text-color);
          background: var(--card-background-color);
        }
        .tile.errors {
          background: color-mix(
            in srgb,
            var(--error-color) 30%,
            var(--primary-background-color)
          );
        }
        .tile.warnings {
          background: color-mix(
            in srgb,
            var(--warning-color) 45%,
            var(--primary-background-color)
          );
        }
        .tile-label {
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .tile-value {
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-2xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        .tile-sub {
          font-size: var(--ha-font-size-s);
        }
        @media (min-width: 871px) {
          .toolbar ha-input-search {
            --ha-input-search-height: 32px;
            --ha-input-search-border-radius: 10px;
          }
        }
        .content {
          direction: ltr;
        }
        ha-generic-picker {
          --ha-combo-box-item-start-color: var(--ha-color-primary-50);
          --mdc-icon-size: var(--ha-space-6);
        }

        ha-app-icon {
          --ha-app-icon-size: 32px;
        }

        @media all and (max-width: 870px) {
          ha-generic-picker {
            max-width: max(30%, 180px);
          }
          ha-button {
            max-width: 100%;
          }
          ha-button::part(label) {
            overflow: hidden;
            white-space: nowrap;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-logs": HaConfigLogs;
  }
}
