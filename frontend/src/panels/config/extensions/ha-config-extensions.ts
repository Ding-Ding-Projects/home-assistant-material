import {
  mdiDelete,
  mdiOpenInApp,
  mdiPencil,
  mdiPlus,
  mdiPuzzleOutline,
  mdiShieldCheckOutline,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatDateTime } from "../../../common/datetime/format_date_time";
import type {
  ConsentStatus,
  ExtensionAbility,
  ExtensionConsent,
} from "../../../common/extensions/extension-logic";
import {
  consentStatus,
  extensionKey,
  extensionTitle,
  panelAbilities,
  resourceAbilities,
} from "../../../common/extensions/extension-logic";
import { navigate } from "../../../common/navigate";
import { stringCompare } from "../../../common/string/compare";
import { searchMatcher } from "../../../common/regex/filter";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import type { CustomPanelConfig } from "../../../data/panel_custom";
import type {
  LovelaceInfo,
  LovelaceResource,
} from "../../../data/lovelace/resource";
import {
  createResource,
  uploadResource,
  deleteResource,
  fetchLovelaceInfo,
  fetchResources,
  updateResource,
} from "../../../data/lovelace/resource";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { loadLovelaceResources } from "../../lovelace/common/load-resources";
import { showResourceDetailDialog } from "../lovelace/resources/show-dialog-lovelace-resource-detail";
import {
  consentBeforeResourceSave,
  loadExtensionConsents,
  recordExtensionConsent,
  recordResourceConsent,
  requestExtensionConsent,
} from "./extension-consent";

interface PanelExtension {
  urlPath: string;
  name: string;
  title: string;
  url: string;
  config: CustomPanelConfig;
}

/** The extensions of this installation: dashboard resources and custom panels. */
@customElement("ha-config-extensions")
class HaConfigExtensions extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _resources?: LovelaceResource[];

  @state() private _info?: LovelaceInfo;

  @state() private _failed = false;

  @state() private _consents: ExtensionConsent[] = loadExtensionConsents();

  @state() private _filter = "";

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      const [resources, info] = await Promise.all([
        fetchResources(this.hass.connection),
        fetchLovelaceInfo(this.hass),
      ]);
      this._resources = resources;
      this._info = info;
    } catch (_err) {
      this._failed = true;
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.extensions.${key}` as never,
      values as never
    ) as string;
  }

  private _panels(): PanelExtension[] {
    return Object.values(this.hass.panels)
      .filter((panel) => panel.component_name === "custom")
      .map((panel) => {
        const config = (panel.config as { _panel_custom?: CustomPanelConfig })
          ?._panel_custom;
        return config
          ? {
              urlPath: panel.url_path,
              name: config.name,
              title: panel.title ?? config.name,
              url: config.module_url ?? config.js_url ?? "",
              config,
            }
          : undefined;
      })
      .filter((panel): panel is PanelExtension => panel !== undefined)
      .sort((a, b) =>
        stringCompare(a.title, b.title, this.hass.locale.language)
      );
  }

  private get _editable(): boolean {
    return this._info?.resource_mode === "storage";
  }

  protected render(): TemplateResult {
    const resources = this._resources ?? [];
    const panels = this._panels();
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this._l("title")}
      >
        <div class="content">
          ${
            this._failed
              ? html`<p class="note" role="alert">${this._l("load_error")}</p>`
              : !this._resources
                ? html`<div class="center">
                    <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
                  </div>`
                : this._renderPage(resources, panels)
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderPage(
    resources: LovelaceResource[],
    panels: PanelExtension[]
  ): TemplateResult {
    const matches = searchMatcher(this._filter);
    const shownResources = resources.filter((r) => matches(r.url, r.type));
    const shownPanels = panels.filter((p) =>
      matches(p.title, p.name, p.url, p.urlPath)
    );
    const search = this._l("search");
    return html`
      <div class="head">
        <p class="summary">
          ${this._l("installed", { count: resources.length + panels.length })}
        </p>
        <ha-button ?disabled=${!this._editable} @click=${this._add}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this._l("add")}
        </ha-button>
      </div>
      ${
        this._editable
          ? nothing
          : html`<p class="note">${this._l("yaml_mode")}</p>`
      }
      <ha-input-search
        appearance="outlined"
        .placeholder=${search}
        .accessibleLabel=${search}
        .value=${this._filter}
        .patternSamples=${[
          ...resources.map((r) => r.url),
          ...panels.map((p) => p.title),
        ]}
        @input=${this._filterChanged}
      ></ha-input-search>
      <div class="columns">
        <section class="card" aria-labelledby="resources-title">
          <h2 id="resources-title">${this._l("resources_title")}</h2>
          <p class="note">${this._l("resources_note")}</p>
          ${
            shownResources.length
              ? html`<ul class="rows">
                  ${shownResources.map((resource) =>
                    this._renderResource(resource)
                  )}
                </ul>`
              : html`<p class="note" role="status">
                  ${this._l(resources.length ? "no_match" : "no_resources")}
                </p>`
          }
          ${
            this._editable
              ? html`<p class="note">${this._l("no_switch")}</p>`
              : nothing
          }
        </section>
        <section class="card" aria-labelledby="panels-title">
          <h2 id="panels-title">${this._l("panels_title")}</h2>
          <p class="note">${this._l("panels_note")}</p>
          ${
            shownPanels.length
              ? html`<ul class="rows">
                  ${shownPanels.map((panel) => this._renderPanel(panel))}
                </ul>`
              : html`<p class="note" role="status">
                  ${this._l(panels.length ? "no_match" : "no_panels")}
                </p>`
          }
        </section>
      </div>
    `;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  private _abilities(abilities: ExtensionAbility[]): TemplateResult {
    return html`<ul class="abilities">
      ${abilities.map(
        (ability) => html`<li>${this._l(`abilities.${ability}`)}</li>`
      )}
    </ul>`;
  }

  private _consentChip(status: ConsentStatus, key: string): TemplateResult {
    const consent = this._consents.find((item) => item.key === key);
    if (status === "allowed" && consent) {
      return html`<span class="chip ok">
        ${this._l("consent.allowed_by", {
          name: consent.by,
          date: formatDateTime(
            new Date(consent.at),
            this.hass.locale,
            this.hass.config
          ),
        })}
      </span>`;
    }
    return html`<span class="chip warn">
      ${this._l(
        status === "changed" ? "consent.changed" : "consent.not_recorded"
      )}
    </span>`;
  }

  private _renderResource(resource: LovelaceResource): TemplateResult {
    const key = extensionKey("resource", resource.id);
    const status = consentStatus(this._consents, key, resource.url);
    const title = extensionTitle(resource.url);
    return html`<li class="row">
      <span class="tile"
        ><ha-svg-icon .path=${mdiPuzzleOutline}></ha-svg-icon
      ></span>
      <div class="text">
        <span class="name">${title}</span>
        <span class="detail url">${resource.url}</span>
        <span class="chips">
          <span class="chip"
            >${
              this.hass.localize(
                `ui.panel.config.lovelace.resources.types.${resource.type}`
              ) || resource.type
            }</span
          >
          ${this._consentChip(status, key)}
        </span>
        ${this._abilities(resourceAbilities(resource.type))}
      </div>
      <div class="actions">
        ${
          status === "allowed"
            ? nothing
            : html`<ha-icon-button
                .path=${mdiShieldCheckOutline}
                .label=${this._l("consent.review", { name: title })}
                .resource=${resource}
                @click=${this._review}
              ></ha-icon-button>`
        }
        ${
          this._editable
            ? html`<ha-icon-button
                  .path=${mdiPencil}
                  .label=${this._l("edit", { name: title })}
                  .resource=${resource}
                  @click=${this._edit}
                ></ha-icon-button>
                <ha-icon-button
                  .path=${mdiDelete}
                  .label=${this._l("remove", { name: title })}
                  .resource=${resource}
                  @click=${this._remove}
                ></ha-icon-button>`
            : nothing
        }
      </div>
    </li>`;
  }

  private _renderPanel(panel: PanelExtension): TemplateResult {
    return html`<li class="row">
      <span class="tile"
        ><ha-svg-icon .path=${mdiPuzzleOutline}></ha-svg-icon
      ></span>
      <div class="text">
        <span class="name">${panel.title}</span>
        <span class="detail url">${panel.url || panel.urlPath}</span>
        <span class="chips">
          <span class="chip">${this._l("panel_chip")}</span>
        </span>
        ${this._abilities(panelAbilities(panel.config))}
      </div>
      <div class="actions">
        <ha-icon-button
          .path=${mdiOpenInApp}
          .label=${this._l("open", { name: panel.title })}
          .urlPath=${panel.urlPath}
          @click=${this._openPanel}
        ></ha-icon-button>
      </div>
    </li>`;
  }

  private _openPanel(ev: Event): void {
    navigate(`/${(ev.currentTarget as any).urlPath}`);
  }

  private async _review(ev: Event): Promise<void> {
    const resource = (ev.currentTarget as any).resource as LovelaceResource;
    const allowed = await requestExtensionConsent(this, this.hass, {
      url: resource.url,
      abilities: resourceAbilities(resource.type),
      previousUrl: this._consents.some(
        (c) => c.key === extensionKey("resource", resource.id)
      )
        ? this._consents.find(
            (c) => c.key === extensionKey("resource", resource.id)
          )!.url
        : undefined,
    });
    if (allowed) {
      this._consents = recordExtensionConsent(
        this.hass,
        extensionKey("resource", resource.id),
        resource.url
      );
    }
  }

  private _add(): void {
    this._openDialog();
  }

  private _edit(ev: Event): void {
    this._openDialog((ev.currentTarget as any).resource as LovelaceResource);
  }

  private _openDialog(resource?: LovelaceResource): void {
    showResourceDetailDialog(this, {
      resource,
      allowUpload: true,
      createResource: async (values, file) => {
        await consentBeforeResourceSave(this, this.hass, values);
        const created = file
          ? await uploadResource(this.hass, file)
          : await createResource(this.hass, values);
        recordResourceConsent(this.hass, created);
        this._consents = loadExtensionConsents();
        this._resources = [...(this._resources ?? []), created].sort((a, b) =>
          stringCompare(a.url, b.url, this.hass.locale.language)
        );
        loadLovelaceResources([created], this.hass);
      },
      updateResource: async (values) => {
        await consentBeforeResourceSave(this, this.hass, values, resource);
        const updated = await updateResource(this.hass, resource!.id, values);
        recordResourceConsent(this.hass, updated);
        this._consents = loadExtensionConsents();
        this._resources = (this._resources ?? []).map((res) =>
          res.id === updated.id ? updated : res
        );
        loadLovelaceResources([updated], this.hass);
      },
    });
  }

  private async _remove(ev: Event): Promise<void> {
    const resource = (ev.currentTarget as any).resource as LovelaceResource;
    const confirmed = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.lovelace.resources.confirm_delete_title"
      ),
      text: this.hass.localize(
        "ui.panel.config.lovelace.resources.confirm_delete_text",
        { url: resource.url }
      ),
      dismissText: this.hass.localize("ui.common.cancel"),
      confirmText: this.hass.localize("ui.common.delete"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteResource(this.hass, resource.id);
      this._resources = (this._resources ?? []).filter(
        ({ id }) => id !== resource.id
      );
      showAlertDialog(this, { text: this._l("removed_reload") });
    } catch (_err) {
      showAlertDialog(this, { text: this._l("remove_failed") });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          max-width: 1180px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-5) var(--ha-space-8);
          box-sizing: border-box;
        }
        .center {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8);
        }
        .head {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-3);
        }
        .summary {
          margin: 0;
        }
        .summary,
        .note,
        .detail {
          color: var(--secondary-text-color);
        }
        ha-input-search {
          display: block;
          max-width: 520px;
          margin: var(--ha-space-3) 0 var(--ha-space-4);
        }
        .columns {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 340px), 1fr)
          );
          gap: var(--ha-space-4);
          align-items: start;
        }
        .card {
          background: var(--card-background-color);
          border-radius: var(--ha-border-radius-xl, 20px);
          box-shadow: var(--ha-shadow-card);
          padding: var(--ha-space-4);
          min-width: 0;
        }
        .card h2 {
          margin: 0 0 var(--ha-space-1);
          font-size: var(--ha-font-size-xl, 1.25rem);
          font-weight: var(--ha-font-weight-title, 600);
        }
        .rows {
          list-style: none;
          margin: var(--ha-space-3) 0 0;
          padding: 0;
        }
        .row {
          display: flex;
          align-items: flex-start;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) 0;
          border-top: 1px solid var(--divider-color);
        }
        .row:first-child {
          border-top: none;
        }
        .tile {
          display: grid;
          place-items: center;
          flex: none;
          width: 40px;
          height: 40px;
          border-radius: var(--ha-border-radius-lg, 12px);
          background: var(--ha-color-primary-container);
          color: var(--ha-color-on-primary-container);
        }
        .text {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          flex: 1;
          min-width: 0;
        }
        .name {
          font-weight: var(--ha-font-weight-semibold, 600);
        }
        .url {
          overflow-wrap: anywhere;
          direction: ltr;
          text-align: start;
          font-size: var(--ha-font-size-s, 0.8125rem);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .chip {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: 999px;
          background: var(
            --ha-color-surface-tone-2,
            var(--secondary-background-color)
          );
          font-size: var(--ha-font-size-s, 0.8125rem);
        }
        .chip.ok {
          background: var(
            --ha-color-success-container,
            var(--secondary-background-color)
          );
          color: var(--ha-color-on-success-container, inherit);
        }
        .chip.warn {
          background: var(
            --ha-color-warning-container,
            var(--secondary-background-color)
          );
          color: var(--ha-color-on-warning-container, inherit);
        }
        .abilities {
          margin: 0;
          padding-inline-start: var(--ha-space-5);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s, 0.8125rem);
        }
        .actions {
          display: flex;
          flex: none;
        }
        ha-icon-button {
          min-width: 44px;
          min-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-extensions": HaConfigExtensions;
  }
}
