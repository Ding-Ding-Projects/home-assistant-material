import { mdiDelete, mdiPencil } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import { navigate } from "../../../common/navigate";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type {
  GuidedSetupCatalog,
  GuidedSetupEntry,
  GuidedSetupIntegration,
} from "../../../data/guided_setup";
import {
  deleteGuidedSetupEntry,
  fetchGuidedSetupCatalog,
} from "../../../data/guided_setup";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-guided-setup-wizard";

/** The grid starts with this many integrations and grows on request. */
const FIRST_VIEW = 9;
const MORE_STEP = 30;

@customElement("ha-config-guided-setup")
class HaConfigGuidedSetup extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _catalog?: GuidedSetupCatalog;

  @state() private _error?: string;

  @state() private _filter = "";

  @state() private _active?: GuidedSetupIntegration;

  @state() private _editing?: GuidedSetupEntry;

  /** How many integrations the grid shows while the search is empty. */
  @state() private _limit = FIRST_VIEW;

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      this._catalog = await fetchGuidedSetupCatalog(this.hass);
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
      return;
    }
    // The address names an integration only for the first load. Loading the
    // list again after the wizard closed must not open the wizard once more.
    if (this._addressHandled) {
      return;
    }
    this._addressHandled = true;
    const domain = new URLSearchParams(window.location.search).get("domain");
    if (domain && !this._active) {
      this._active = this._catalog.integrations.find(
        (item) => item.domain === domain
      );
    }
  }

  private _addressHandled = false;

  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  /** A page string, in the chosen language mode where it has Cantonese. */
  private _l(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(
      this.hass.localize,
      `ui.panel.config.guided_setup.${key}`,
      values
    );
  }

  private _shown(): GuidedSetupIntegration[] {
    const matches = searchMatcher(this._filter);
    return [...(this._catalog?.integrations ?? [])]
      .filter((item) => matches(item.name, item.domain, item.description))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private _integrationFor(
    entry: GuidedSetupEntry
  ): GuidedSetupIntegration | undefined {
    return this._catalog?.integrations.find(
      (item) => item.domain === entry.domain
    );
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _showMore(): void {
    this._limit += MORE_STEP;
  }

  private _entryCount(domain: string): number {
    return (this._catalog?.entries ?? []).filter(
      (entry) => entry.domain === domain
    ).length;
  }

  private _open(ev: Event): void {
    const domain = (ev.currentTarget as HTMLElement).dataset.domain;
    this._editing = undefined;
    this._active = this._catalog?.integrations.find(
      (item) => item.domain === domain
    );
  }

  private _edit(ev: Event): void {
    const entry = this._catalog?.entries.find(
      (item) => item.id === (ev.currentTarget as HTMLElement).dataset.entry
    );
    const integration = entry && this._integrationFor(entry);
    if (entry && integration) {
      this._editing = entry;
      this._active = integration;
    }
  }

  private async _remove(ev: Event): Promise<void> {
    const entry = this._catalog?.entries.find(
      (item) => item.id === (ev.currentTarget as HTMLElement).dataset.entry
    );
    if (!entry) {
      return;
    }
    const name = this._integrationFor(entry)?.name ?? entry.domain;
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("remove_title"),
      text: this._l("remove_text", { name }),
      confirmText: this._l("remove"),
      dismissText: this._l("cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      const { apply } = await deleteGuidedSetupEntry(this.hass, entry.id);
      showToast(this, {
        message: this._l("removed", {
          apply:
            apply.mode === "reload"
              ? this._l("apply_reload", { service: apply.service ?? "" })
              : this._l("apply_restart"),
        }),
      });
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
    await this._load();
  }

  private _wizardClosed(): void {
    this._active = undefined;
    this._editing = undefined;
    // A wizard opened from an address that names the integration leaves that
    // name behind, so a reload or the back button does not open it again.
    if (new URLSearchParams(window.location.search).has("domain")) {
      navigate(window.location.pathname, { replace: true });
    }
    this._load();
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/integrations"
        .header=${this._l("title")}
      >
        ${
          this._active
            ? html`<ha-guided-setup-wizard
                .hass=${this.hass}
                .narrow=${this.narrow}
                .integration=${this._active}
                .entry=${this._editing}
                @guided-setup-closed=${this._wizardClosed}
              ></ha-guided-setup-wizard>`
            : this._renderList()
        }
      </hass-subpage>
    `;
  }

  private _renderList(): TemplateResult {
    if (this._error) {
      return html`<div class="content">
        <ha-alert alert-type="error">${this._error}</ha-alert>
      </div>`;
    }
    if (!this._catalog) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    const shown = this._shown();
    const total = this._catalog.integrations.length;
    const searching = this._filter.trim() !== "";
    const visible = searching ? shown : shown.slice(0, this._limit);
    const hidden = shown.length - visible.length;
    const search = this._l("search_n", { count: total });
    const entries = this._catalog.entries;
    return html`
      <div class=${classMap({ content: true, narrow: this.narrow })}>
        <p class="intro">${this._l("intro")}</p>
        ${
          entries.length
            ? html`<h3>
                  ${this._l("your_setups_count", { count: entries.length })}
                </h3>
                ${this._renderEntries(entries)}`
            : html`<div class="empty">
                <h3>${this._l("no_entries")}</h3>
                <p class="note">${this._l("no_entries_text")}</p>
              </div>`
        }
        <h3>${this._l("can_set_up")}</h3>
        <ha-input-search
          appearance="outlined"
          .placeholder=${search}
          .accessibleLabel=${search}
          .value=${this._filter}
          .patternSamples=${this._catalog.integrations.map((item) => item.name)}
          @input=${this._filterChanged}
        ></ha-input-search>
        ${
          searching
            ? html`<p class="note" role="status">
                ${this._l("matches", { count: shown.length, total })}
              </p>`
            : nothing
        }
        ${
          shown.length
            ? html`<ul class="rows grid">
                  ${visible.map((item) => this._renderIntegration(item))}
                </ul>
                ${
                  hidden > 0
                    ? html`<div class="more">
                        <span class="note"
                          >${this._l("more", { count: hidden })}</span
                        >
                        <ha-button appearance="plain" @click=${this._showMore}
                          >${this._l("show_more")}</ha-button
                        >
                      </div>`
                    : nothing
                }`
            : html`<p class="note" role="status">
                ${this._l("empty", { query: this._filter.trim() })}
              </p>`
        }
      </div>
    `;
  }

  private _entryDetail(entry: GuidedSetupEntry): string {
    return `${
      entry.entity_domain
        ? this._l("works_with", {
            domains:
              this.hass.localize(`component.${entry.entity_domain}.title`) ||
              entry.entity_domain,
          })
        : this._l("domain_level")
    } · ${this._l("entry_summary", { count: Object.keys(entry.data).length })}`;
  }

  private _renderEntries(entries: GuidedSetupEntry[]): TemplateResult {
    if (this.narrow) {
      return html`<ul class="rows">
        ${entries.map((entry) => this._renderEntry(entry))}
      </ul>`;
    }
    return html`<table class="entries">
      <thead>
        <tr>
          <th scope="col">${this._l("col_integration")}</th>
          <th scope="col">${this._l("col_what")}</th>
          <th scope="col">
            <span class="sr-only">${this._l("col_actions")}</span>
          </th>
        </tr>
      </thead>
      <tbody>
        ${entries.map((entry) => {
          const name = this._integrationFor(entry)?.name ?? entry.domain;
          return html`<tr>
            <td>${name}</td>
            <td class="detail">${this._entryDetail(entry)}</td>
            <td class="actions">${this._renderEntryActions(entry, name)}</td>
          </tr>`;
        })}
      </tbody>
    </table>`;
  }

  private _renderEntryActions(
    entry: GuidedSetupEntry,
    name: string
  ): TemplateResult {
    return html`<ha-icon-button
        .path=${mdiPencil}
        .label=${`${this._l("edit")} ${name}`}
        data-entry=${entry.id}
        @click=${this._edit}
      ></ha-icon-button>
      <ha-icon-button
        .path=${mdiDelete}
        .label=${`${this._l("remove")} ${name}`}
        data-entry=${entry.id}
        @click=${this._remove}
      ></ha-icon-button>`;
  }

  private _renderEntry(entry: GuidedSetupEntry): TemplateResult {
    const name = this._integrationFor(entry)?.name ?? entry.domain;
    return html`<li class="row">
      <div class="text">
        <span class="name">${name}</span>
        <span class="detail">${this._entryDetail(entry)}</span>
      </div>
      ${this._renderEntryActions(entry, name)}
    </li>`;
  }

  private _renderIntegration(item: GuidedSetupIntegration): TemplateResult {
    const domains = item.entity_domains.map(
      (domain) => this.hass.localize(`component.${domain}.title`) || domain
    );
    const made = this._entryCount(item.domain);
    return html`<li>
      <button
        type="button"
        class="row pick"
        data-domain=${item.domain}
        @click=${this._open}
      >
        <span class="text">
          <span class="name">${item.name}</span>
          <span class="detail">
            ${
              item.description
                ? item.description
                : html`${
                    domains.length
                      ? this._l("works_with", { domains: domains.join(", ") })
                      : nothing
                  }${
                    item.has_domain_schema
                      ? html`${domains.length ? " · " : nothing}${this._l(
                          "domain_level"
                        )}`
                      : nothing
                  }`
            }
          </span>
        </span>
        ${
          made
            ? html`<span class="tag"
                >${this._l("made_tag", { count: made })}</span
              >`
            : nothing
        }
      </button>
    </li>`;
  }

  static styles = [
    haStyle,
    css`
      .content {
        max-width: 720px;
        margin: 0 auto;
        padding: var(--ha-space-4);
        box-sizing: border-box;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8);
      }
      .intro,
      .note {
        color: var(--secondary-text-color);
      }
      ha-input-search {
        display: block;
        margin: var(--ha-space-4) 0 var(--ha-space-2);
      }
      .rows {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .content:not(.narrow) .grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: var(--ha-space-3);
      }
      /* Wide: each integration is a rounded card. */
      .content:not(.narrow) .grid .pick {
        height: 100%;
        min-height: 72px;
        border: 1px solid var(--ha-color-outline, var(--divider-color));
        border-radius: var(--ha-border-radius-xl, 20px);
        background: var(--card-background-color);
        box-shadow: var(--ha-shadow-card, none);
        padding: var(--ha-space-4);
      }
      .content:not(.narrow) .grid .pick:hover {
        background: var(
          --ha-color-surface-tone-2,
          var(--secondary-background-color)
        );
      }
      /* Narrow: the list is one rounded group of rows. */
      .content.narrow ul.rows {
        border: 1px solid var(--ha-color-outline, var(--divider-color));
        border-radius: var(--ha-border-radius-xl, 20px);
        background: var(--card-background-color);
        overflow: hidden;
        margin-bottom: var(--ha-space-4);
      }
      .content.narrow ul.rows .row {
        min-height: 56px;
      }
      .content.narrow ul.rows li:last-child .row {
        border-bottom: 0;
      }
      .content:not(.narrow) {
        max-width: 1100px;
      }
      .entries {
        width: 100%;
        border-collapse: collapse;
        margin-bottom: var(--ha-space-4);
      }
      .entries th,
      .entries td {
        text-align: start;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-bottom: 1px solid var(--divider-color);
      }
      .entries th {
        color: var(--secondary-text-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .entries .actions {
        text-align: end;
        white-space: nowrap;
      }
      .sr-only {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      .tag {
        flex: none;
        padding: 0 var(--ha-space-2);
        border-radius: 12px;
        background: var(--secondary-background-color);
        font-size: var(--ha-font-size-xs, 12px);
        color: var(--secondary-text-color);
      }
      .more {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) 0;
      }
      .row {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        width: 100%;
        box-sizing: border-box;
        padding: var(--ha-space-2) var(--ha-space-3);
        border-bottom: 1px solid var(--divider-color);
        background: none;
        border-inline: 0;
        border-top: 0;
        font: inherit;
        color: var(--primary-text-color);
        text-align: start;
      }
      .pick {
        cursor: pointer;
      }
      .pick:hover {
        background: var(--secondary-background-color);
      }
      .pick:focus-visible {
        outline: 2px solid var(--primary-color);
        outline-offset: -2px;
      }
      .text {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
      }
      .name {
        overflow-wrap: anywhere;
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-guided-setup": HaConfigGuidedSetup;
  }
}
