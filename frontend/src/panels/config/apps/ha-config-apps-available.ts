import { mdiDotsVertical, mdiRefresh, mdiSourceRepository } from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { HASSDomEvent } from "../../../common/dom/fire_event";
import { navigate } from "../../../common/navigate";
import { extractSearchParam } from "../../../common/url/search-params";
import "../../../components/chips/ha-filter-chip";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type {
  HassioAddonRepository,
  HassioAddonsInfo,
} from "../../../data/hassio/addon";
import { fetchHassioAddonsInfo } from "../../../data/hassio/addon";
import { extractApiErrorMessage } from "../../../data/hassio/common";
import type {
  StoreAddon,
  SupervisorStore,
} from "../../../data/supervisor/store";
import {
  addStoreRepository,
  fetchSupervisorStore,
} from "../../../data/supervisor/store";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-error-screen";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import type { HomeAssistant, Route } from "../../../types";
import { checkForAppUpdates } from "./common/check-for-updates";

import "./supervisor-apps-repository";

type StoreFilter = "official" | "community" | "not_installed" | "available";

const STORE_FILTERS: StoreFilter[] = [
  "official",
  "community",
  "not_installed",
  "available",
];

const sortRepos = (a: HassioAddonRepository, b: HassioAddonRepository) => {
  if (a.slug === "local") {
    return -1;
  }
  if (b.slug === "local") {
    return 1;
  }
  if (a.slug === "core") {
    return -1;
  }
  if (b.slug === "core") {
    return 1;
  }
  return a.name.toUpperCase() < b.name.toUpperCase() ? -1 : 1;
};

@customElement("ha-config-apps-available")
export class HaConfigAppsAvailable extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _store?: SupervisorStore;

  @state() private _addon?: HassioAddonsInfo;

  @state() private _error?: string;

  @state() private _filter?: string;

  @state() private _checkingUpdates = false;

  @state() private _storeFilters: StoreFilter[] = [];

  public connectedCallback(): void {
    super.connectedCallback();
    this.addEventListener(
      "apps-collection-refresh",
      this._handleCollectionRefresh as unknown as EventListener
    );
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this.removeEventListener(
      "apps-collection-refresh",
      this._handleCollectionRefresh as unknown as EventListener
    );
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    const repositoryUrl = extractSearchParam("repository_url");
    if (repositoryUrl) {
      navigate("/config/apps/available", { replace: true });
    }
    this._loadData().then(() => {
      if (repositoryUrl) {
        this._addRepository(repositoryUrl);
      }
    });
    this.addEventListener("hass-api-called", (ev) => this._apiCalled(ev));
  }

  protected render() {
    if (this._error) {
      return html`
        <hass-error-screen
          .hass=${this.hass}
          .error=${this._error}
        ></hass-error-screen>
      `;
    }

    if (!this._store || !this._addon) {
      return html`
        <hass-loading-screen
          .hass=${this.hass}
          .narrow=${this.narrow}
        ></hass-loading-screen>
      `;
    }

    let repos: (TemplateResult | typeof nothing)[] = [];

    if (this._store.repositories) {
      repos = this._addonRepositories(
        this._store.repositories,
        this._store.addons,
        this._filter,
        this._storeFilters
      );
    }

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        .route=${this.route}
        back-path="/config/apps"
        .header=${this.hass.localize("ui.panel.config.apps.store.title")}
      >
        <ha-dropdown slot="toolbar-icon" @wa-select=${this._handleAction}>
          <ha-icon-button
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
            slot="trigger"
          ></ha-icon-button>
          <ha-dropdown-item
            value="check_updates"
            .disabled=${this._checkingUpdates}
          >
            ${this.hass.localize("ui.panel.config.apps.store.check_updates")}
          </ha-dropdown-item>
          <ha-dropdown-item value="repositories">
            ${this.hass.localize("ui.panel.config.apps.store.repositories")}
          </ha-dropdown-item>
          <ha-dropdown-item value="registries">
            ${this.hass.localize("ui.panel.config.apps.store.registries")}
          </ha-dropdown-item>
        </ha-dropdown>
        ${
          repos.length === 0
            ? html`<hass-loading-screen no-toolbar></hass-loading-screen>`
            : html`
                <div class="page">
                  <header class="heading">
                    <div class="heading-text">
                      <h2>
                        ${this.hass.localize("ui.panel.config.apps.store.title")}
                      </h2>
                      <p>
                        ${this.hass.localize(
                          "ui.panel.config.apps.store.page_summary",
                          {
                            apps: this._store.addons.length,
                            repositories: this._store.repositories.length,
                          }
                        )}
                      </p>
                    </div>
                    <div class="heading-actions">
                      <ha-button
                        appearance="outlined"
                        @click=${this._manageRepositoriesClicked}
                      >
                        <ha-svg-icon
                          slot="start"
                          .path=${mdiSourceRepository}
                        ></ha-svg-icon>
                        ${this.hass.localize(
                          "ui.panel.config.apps.store.repositories"
                        )}
                      </ha-button>
                      <ha-button
                        appearance="plain"
                        .disabled=${this._checkingUpdates}
                        @click=${this._refreshData}
                      >
                        <ha-svg-icon
                          slot="start"
                          .path=${mdiRefresh}
                        ></ha-svg-icon>
                        ${this.hass.localize(
                          "ui.panel.config.apps.store.check_new_apps"
                        )}
                      </ha-button>
                    </div>
                  </header>
                  <div class="filters">
                    <ha-input-search
                      appearance="outlined"
                      .value=${this._filter}
                      .placeholder=${this.hass.localize(
                        "ui.panel.config.apps.store.search"
                      )}
                      @input=${this._filterChanged}
                    ></ha-input-search>
                    <div
                      class="chips"
                      role="group"
                      aria-label=${this.hass.localize(
                        "ui.panel.config.apps.store.filters"
                      )}
                    >
                      ${STORE_FILTERS.map(
                        (name) => html`
                          <ha-filter-chip
                            .selected=${this._storeFilters.includes(name)}
                            .label=${this.hass.localize(
                              `ui.panel.config.apps.store.filter_${name}`
                            )}
                            .storeFilter=${name}
                            @click=${this._storeChipClicked}
                          ></ha-filter-chip>
                        `
                      )}
                    </div>
                  </div>
                  ${
                    repos.every((repo) => repo === nothing)
                      ? html`<p class="no-matches">
                          ${this.hass.localize(
                            "ui.panel.config.apps.store.no_matches"
                          )}
                        </p>`
                      : repos
                  }
                </div>
              `
        }
      </hass-subpage>
    `;
  }

  private _storeChipClicked(ev: Event) {
    const name = (ev.currentTarget as any).storeFilter as StoreFilter;
    this._storeFilters = this._storeFilters.includes(name)
      ? this._storeFilters.filter((item) => item !== name)
      : [...this._storeFilters, name];
  }

  private _addonRepositories = memoizeOne(
    (
      repositories: HassioAddonRepository[],
      addons: StoreAddon[],
      filter?: string,
      storeFilters: StoreFilter[] = []
    ) =>
      [...repositories].sort(sortRepos).map((repo) => {
        const official = repo.slug === "core";
        const filteredAddons = addons.filter(
          (addon) =>
            addon.repository === repo.slug &&
            (!storeFilters.includes("official") || official) &&
            (!storeFilters.includes("community") || !official) &&
            (!storeFilters.includes("not_installed") || !addon.installed) &&
            (!storeFilters.includes("available") || addon.available)
        );

        return filteredAddons.length !== 0
          ? html`
              <supervisor-apps-repository
                .hass=${this.hass}
                .repo=${repo}
                .addons=${filteredAddons}
                .filter=${filter!}
              ></supervisor-apps-repository>
            `
          : nothing;
      })
  );

  private _handleAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;

    if (!action) {
      return;
    }

    switch (action) {
      case "check_updates":
        this._refreshData();
        break;
      case "repositories":
        this._manageRepositoriesClicked();
        break;
      case "registries":
        this._manageRegistries();
        break;
    }
  }

  private async _refreshData() {
    this._checkingUpdates = true;
    try {
      this._loadData(await checkForAppUpdates(this, this.hass));
    } finally {
      this._checkingUpdates = false;
    }
  }

  private _apiCalled(ev) {
    if (ev.detail.success) {
      this._loadData();
    }
  }

  private _manageRepositoriesClicked() {
    navigate("/config/apps/repositories");
  }

  private _manageRegistries() {
    navigate("/config/apps/registries");
  }

  private async _addRepository(repositoryUrl: string): Promise<void> {
    if (
      !this._store ||
      this._store.repositories.some((repo) => repo.source === repositoryUrl)
    ) {
      return;
    }

    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.apps.my.add_repository_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.apps.my.add_repository_store_description",
          { repository: repositoryUrl }
        ),
        confirmText: this.hass.localize("ui.common.add"),
        dismissText: this.hass.localize("ui.common.cancel"),
      }))
    ) {
      return;
    }

    try {
      await addStoreRepository(this.hass, repositoryUrl);
      await this._loadData();
    } catch (err: any) {
      showAlertDialog(this, {
        text: extractApiErrorMessage(err),
      });
    }
  }

  private async _loadData(addon?: HassioAddonsInfo): Promise<void> {
    try {
      const [addonInfo, store] = await Promise.all([
        addon ?? fetchHassioAddonsInfo(this.hass),
        fetchSupervisorStore(this.hass),
      ]);

      this._addon = addonInfo;
      this._store = store;
    } catch (err: any) {
      this._error =
        err.message || this.hass.localize("ui.panel.config.apps.error_loading");
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.apps.error_loading"),
        text: this._error,
      });
    }
  }

  private _handleCollectionRefresh = async (
    ev: HASSDomEvent<{ collection: "addon" | "store" }>
  ): Promise<void> => {
    const { collection } = ev.detail;
    try {
      if (collection === "addon") {
        this._addon = await fetchHassioAddonsInfo(this.hass);
      } else if (collection === "store") {
        this._store = await fetchSupervisorStore(this.hass);
      }
    } catch (_err: any) {
      // Silently fail on refresh errors
    }
  };

  private _filterChanged(e: InputEvent) {
    this._filter = (e.target as HTMLInputElement).value;
  }

  static styles = css`
    :host {
      display: block;
      height: 100%;
    }
    .page {
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
    }
    :host([narrow]) .page {
      padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
    }
    .heading {
      display: flex;
      flex-wrap: wrap;
      align-items: flex-start;
      justify-content: space-between;
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-4);
    }
    .heading-text {
      flex: 1;
      min-width: 220px;
    }
    h2 {
      margin: 0 0 var(--ha-space-1);
      font-family: var(--ha-font-family-heading, inherit);
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .heading p,
    .no-matches {
      margin: 0;
      color: var(--secondary-text-color);
      line-height: var(--ha-line-height-normal);
    }
    .heading-actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
    .filters {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-2);
    }
    ha-input-search {
      flex: 1 1 260px;
      min-width: 0;
      max-width: 420px;
    }
    .chips {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
    }
  `;
}

declare global {
  interface HASSDomEvents {
    "apps-collection-refresh": { collection: "addon" | "store" };
  }
  interface HTMLElementTagNameMap {
    "ha-config-apps-available": HaConfigAppsAvailable;
  }
}
