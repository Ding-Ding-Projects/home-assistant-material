import { mdiBell, mdiHammer, mdiRestore } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { getStorage } from "../../../common/decorators/storage";
import { searchMatcher } from "../../../common/regex/filter";
import type { TabAppearanceStore } from "../../../common/tabs/tab-appearance-store";
import {
  readTabAppearance,
  resetTabProperty,
  setTabAppearance,
  TAB_APPEARANCE_STORAGE_KEY,
  writeTabAppearance,
} from "../../../common/tabs/tab-appearance-store";
import type {
  DefaultPageEntry,
  SidebarDefaults,
} from "../../../common/tabs/tab-entry-defaults";
import {
  cleanDefaultPage,
  DEFAULT_SIDEBAR_DEFAULTS,
  readSidebarDefaults,
  subscribeSidebarDefaults,
  writeSidebarDefaults,
} from "../../../common/tabs/tab-entry-defaults";
import { MAIN_SURFACE } from "../../../components/tabs/tab-strip-layout";
import { computePageTabs } from "../../../components/tabs/compute-page-tabs";
import {
  computeSettingsEntries,
  computeToolEntries,
  loadCatalogTranslations,
} from "../../../components/page-catalog-entries";
import { renderTabIcon } from "../../../components/tabs/tab-icons";
import "../../../components/ha-card";
import "../../../components/ha-icon-button";
import "../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../components/ha-select";
import "../../../components/ha-switch";
import type { HaSwitch } from "../../../components/ha-switch";
import "../../../components/ha-svg-icon";
import "../../../components/ha-button";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import { getDefaultPanelUrlPath } from "../../../data/panel";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

/** The value of the choice that opens an entry on its own overview. */
const OVERVIEW = "__overview";

interface EntryRow {
  id: string;
  original: string;
  group: "pages" | "system";
  tab?: Parameters<typeof renderTabIcon>[0];
  iconPath?: string;
}

/**
 * Settings, Sidebar labels and defaults: rename the entries of the navigation,
 * keep Developer tools on it, and choose the page an entry opens on. Names are
 * kept with the other per-person tab choices, so the navigation pane, the
 * classic sidebar and the tab strip all show them.
 */
@customElement("ha-config-section-sidebar")
export class HaConfigSectionSidebar extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _filter = "";

  @state() private _looks: TabAppearanceStore = readTabAppearance();

  @state() private _defaults: SidebarDefaults = readSidebarDefaults();

  /** Entries whose typed name was refused, so the field can say why. */
  @state() private _invalid = new Set<string>();

  @state() private _titlesLoaded = false;

  private _unsubscribe: (() => void)[] = [];

  public connectedCallback() {
    super.connectedCallback();
    this._looks = readTabAppearance();
    this._defaults = readSidebarDefaults();
    this._unsubscribe = [
      getStorage().subscribeChanges(TAB_APPEARANCE_STORAGE_KEY, () => {
        this._looks = readTabAppearance();
      }),
      subscribeSidebarDefaults((value) => {
        this._defaults = value;
      }),
    ];
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribe.forEach((unsubscribe) => unsubscribe());
    this._unsubscribe = [];
  }

  protected firstUpdated() {
    // The titles of settings pages and tools are loaded on demand.
    void loadCatalogTranslations(this.hass).then(() => {
      this._titlesLoaded = true;
    });
  }

  private _t = (key: string, values?: Record<string, string | number>) =>
    this.hass.localize(
      `ui.panel.config.sidebar_defaults.${key}` as any,
      values as any
    );

  private _rows(): EntryRow[] {
    const isAdmin = Boolean(this.hass.user?.is_admin);
    const pages = computePageTabs(
      this.hass.panels,
      getDefaultPanelUrlPath(this.hass),
      isAdmin,
      this.hass.localize
    );
    const rows: EntryRow[] = pages.map((tab) => ({
      id: tab.urlPath,
      original: tab.title,
      group: tab.urlPath === "config" ? "system" : "pages",
      tab,
    }));
    if (isAdmin) {
      rows.push({
        id: "tools",
        original: this.hass.localize("ui.sidebar.developer_tools"),
        group: "system",
        iconPath: mdiHammer,
      });
    }
    rows.push({
      id: "notifications",
      original: this.hass.localize("ui.notification_drawer.title"),
      group: "system",
      iconPath: mdiBell,
    });
    return rows;
  }

  private _label(row: EntryRow): string {
    return this._looks[MAIN_SURFACE]?.[row.id]?.label ?? "";
  }

  protected render(): TemplateResult {
    const matches = searchMatcher(this._filter);
    const rows = this._rows().filter((row) =>
      matches(row.original, this._label(row))
    );
    const searching = this._filter.trim() !== "";
    const groups = (["pages", "system"] as const).filter((group) =>
      rows.some((row) => row.group === group)
    );
    return html`
      <hass-subpage
        back-path="/config/personal"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${this._t("title")}
      >
        <div class="page">
          <div class="intro">
            <h2>${this._t("title")}</h2>
            <p>${this._t("summary")}</p>
          </div>
          <div class="columns">
            <ha-card class="entries">
              <h3 class="card-title">${this._t("entries_title")}</h3>
              <ha-input-search
                appearance="outlined"
                .placeholder=${this._t("search")}
                .accessibleLabel=${this._t("search")}
                .value=${this._filter}
                @input=${this._filterChanged}
              ></ha-input-search>
              ${
                searching
                  ? html`<p class="count" role="status">
                      ${this._t("search_count", { count: rows.length })}
                    </p>`
                  : nothing
              }
              ${
                rows.length
                  ? groups.map(
                      (group) => html`
                        <div class="group" role="group">
                          <div class="group-title">
                            ${this._t(`group_${group}`)}
                          </div>
                          ${rows
                            .filter((row) => row.group === group)
                            .map((row) => this._renderRow(row))}
                        </div>
                      `
                    )
                  : html`<p class="empty" role="status">${this._t("empty")}</p>`
              }
            </ha-card>
            <ha-card class="defaults">
              <h3 class="card-title">${this._t("defaults_title")}</h3>
              ${this._renderDefaults()}
              <div class="actions">
                <ha-button appearance="plain" @click=${this._resetAll}>
                  <ha-svg-icon slot="start" .path=${mdiRestore}></ha-svg-icon>
                  ${this._t("reset_all")}
                </ha-button>
              </div>
            </ha-card>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderRow(row: EntryRow): TemplateResult {
    const label = this._label(row);
    const invalid = this._invalid.has(row.id);
    return html`
      <div class="row">
        <span class="icon">
          ${
            row.tab
              ? renderTabIcon(row.tab)
              : html`<ha-svg-icon .path=${row.iconPath}></ha-svg-icon>`
          }
        </span>
        <div class="name">
          <ha-input
            .label=${this._t("name_label")}
            .placeholder=${row.original}
            .value=${label}
            maxlength="200"
            .hint=${
              invalid
                ? this._t("invalid_name")
                : this._t("original_name", { name: row.original })
            }
            .invalid=${invalid}
            data-id=${row.id}
            @input=${this._renameInput}
          ></ha-input>
        </div>
        <ha-icon-button
          .path=${mdiRestore}
          .label=${this._t("reset_name", { name: row.original })}
          .title=${this._t("reset_name", { name: row.original })}
          .disabled=${!label}
          data-id=${row.id}
          @click=${this._resetName}
        ></ha-icon-button>
      </div>
    `;
  }

  private _renderDefaults(): TemplateResult {
    const isAdmin = Boolean(this.hass.user?.is_admin);
    return html`
      ${
        isAdmin
          ? html`
              <div class="setting">
                <div class="setting-text">
                  <div class="setting-title" id="show-tools-label">
                    ${this._t("show_tools")}
                  </div>
                  <div class="setting-help">${this._t("show_tools_help")}</div>
                </div>
                <ha-switch
                  aria-labelledby="show-tools-label"
                  .checked=${this._defaults.showDeveloperTools}
                  @change=${this._toolsChanged}
                ></ha-switch>
              </div>
              <div class="page-heading">
                <div class="setting-title">${this._t("page_title")}</div>
                <div class="setting-help">${this._t("page_help")}</div>
              </div>
              ${this._renderPageSelect("config", "settings_opens_on")}
              ${this._renderPageSelect("tools", "tools_opens_on")}
            `
          : html`<p class="setting-help">${this._t("page_help")}</p>`
      }
    `;
  }

  private _pageOptions(entry: DefaultPageEntry) {
    if (!this._titlesLoaded) {
      return [];
    }
    const entries =
      entry === "config"
        ? computeSettingsEntries(this.hass)
        : computeToolEntries(this.hass);
    const seen = new Set<string>();
    return entries
      .filter((item) => {
        const path = cleanDefaultPage(entry, item.path);
        if (!path || seen.has(path)) {
          return false;
        }
        seen.add(path);
        return true;
      })
      .map((item) => ({
        value: cleanDefaultPage(entry, item.path)!,
        label: item.title,
      }));
  }

  private _renderPageSelect(entry: DefaultPageEntry, labelKey: string) {
    const chosen = this._defaults.defaultPages[entry];
    const options = [
      { value: OVERVIEW, label: this._t("page_overview") },
      ...this._pageOptions(entry),
    ];
    // A page saved earlier that this list no longer offers stays visible.
    if (chosen && !options.some((option) => option.value === chosen)) {
      options.push({ value: chosen, label: chosen });
    }
    return html`<ha-select
      class="page-select"
      .label=${this._t(labelKey)}
      .value=${chosen ?? OVERVIEW}
      .options=${options}
      data-entry=${entry}
      @selected=${this._pageChanged}
    ></ha-select>`;
  }

  private _filterChanged(ev: Event) {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _notSaved() {
    showToast(this, { message: this._t("not_saved") });
  }

  private _renameInput(ev: Event) {
    const input = ev.currentTarget as HaInput;
    const id = input.dataset.id!;
    const row = this._rows().find((item) => item.id === id);
    if (!row) {
      return;
    }
    const text = (input.value ?? "").trim();
    let store = readTabAppearance();
    const invalid = new Set(this._invalid);
    if (!text || text === row.original) {
      store = resetTabProperty(store, MAIN_SURFACE, id, "label");
      invalid.delete(id);
    } else {
      const next = setTabAppearance(store, MAIN_SURFACE, id, "label", text);
      if (next === store) {
        // The text holds a character the stored names do not allow.
        invalid.add(id);
        this._invalid = invalid;
        return;
      }
      store = next;
      invalid.delete(id);
    }
    this._invalid = invalid;
    this._saveLooks(store);
  }

  private _resetName(ev: Event) {
    const id = (ev.currentTarget as HTMLElement).dataset.id!;
    const invalid = new Set(this._invalid);
    invalid.delete(id);
    this._invalid = invalid;
    this._saveLooks(
      resetTabProperty(readTabAppearance(), MAIN_SURFACE, id, "label")
    );
  }

  private _saveLooks(store: TabAppearanceStore) {
    try {
      writeTabAppearance(store);
      this._looks = readTabAppearance();
    } catch (_err) {
      this._notSaved();
    }
  }

  private _toolsChanged(ev: Event) {
    const checked = (ev.target as HaSwitch).checked;
    this._saveDefaults({ ...this._defaults, showDeveloperTools: checked });
  }

  private _pageChanged(ev: HaSelectSelectEvent<string>) {
    ev.stopPropagation();
    const entry = (ev.currentTarget as HTMLElement).dataset
      .entry as DefaultPageEntry;
    const value = String(ev.detail.value);
    const defaultPages = { ...this._defaults.defaultPages };
    if (value === OVERVIEW) {
      delete defaultPages[entry];
    } else {
      defaultPages[entry] = value;
    }
    this._saveDefaults({ ...this._defaults, defaultPages });
  }

  private _saveDefaults(value: SidebarDefaults) {
    if (writeSidebarDefaults(value)) {
      this._defaults = readSidebarDefaults();
    } else {
      this._notSaved();
    }
  }

  private async _resetAll() {
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("reset_title"),
      text: this._t("reset_text"),
      confirmText: this._t("reset_confirm"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    let store = readTabAppearance();
    this._rows().forEach((row) => {
      store = resetTabProperty(store, MAIN_SURFACE, row.id, "label");
    });
    this._invalid = new Set();
    this._saveLooks(store);
    this._saveDefaults({ ...DEFAULT_SIDEBAR_DEFAULTS, defaultPages: {} });
  }

  static styles = [
    haStyle,
    css`
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
      }
      .intro {
        margin-bottom: var(--ha-space-4);
      }
      .intro h2 {
        margin: 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-3xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      .intro p {
        margin: var(--ha-space-1) 0 0;
        color: var(--secondary-text-color);
        line-height: var(--ha-line-height-normal);
      }
      .columns {
        display: grid;
        grid-template-columns: minmax(0, 2fr) minmax(0, 1fr);
        align-items: start;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .columns {
        grid-template-columns: minmax(0, 1fr);
      }
      @media (max-width: 800px) {
        .columns {
          grid-template-columns: minmax(0, 1fr);
        }
      }
      ha-card {
        padding: var(--ha-space-4) var(--ha-space-5) var(--ha-space-5);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
      }
      .card-title {
        margin: 0;
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-title, 600);
      }
      .count,
      .empty {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .group {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .group-title {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-semibold, 600);
        text-transform: uppercase;
        letter-spacing: 0.04em;
        padding-top: var(--ha-space-2);
      }
      .row {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) 0;
        border-top: 1px solid var(--divider-color);
      }
      .icon {
        flex: none;
        display: grid;
        place-items: center;
        width: 40px;
        height: 40px;
        border-radius: var(--ha-border-radius-lg);
        background: var(
          --ha-color-primary-container,
          var(--secondary-background-color)
        );
        color: var(--ha-color-on-primary-container, var(--primary-text-color));
      }
      .name {
        flex: 1;
        min-width: 0;
      }
      .name ha-input {
        width: 100%;
      }
      .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-3);
      }
      .setting-title {
        font-weight: var(--ha-font-weight-semibold, 600);
      }
      .setting-help {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        line-height: var(--ha-line-height-normal);
      }
      .page-heading {
        padding-top: var(--ha-space-2);
      }
      .page-select {
        display: block;
      }
      .actions {
        display: flex;
        justify-content: flex-end;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-section-sidebar": HaConfigSectionSidebar;
  }
}
