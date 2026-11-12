import {
  mdiDotsVertical,
  mdiPower,
  mdiRefresh,
  mdiUpdate,
  mdiWrench,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { ctrlOrCmdLabel } from "../../../common/keyboard/ctrl-or-cmd";
import { PageLockController } from "../../../common/locks/page-lock-controller";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-icon-next";
import "../../../components/ha-svg-icon";
import "../../../components/ha-menu-button";
import "../../../components/ha-tip";
import { openAllHelpArticles } from "../../../components/help/open-help-article";
import "../../../components/input/ha-input-search";
import type { HaInputSearch } from "../../../components/input/ha-input-search";
import "../../../components/page/ha-page-footer";
import "../../../components/page/ha-page-lock-banner";
import "../../../components/page/ha-page-tools";
import { getConfigEntries } from "../../../data/config_entries";
import type { CloudStatus } from "../../../data/cloud";
import type { RepairsIssue } from "../../../data/repairs";
import {
  severitySort,
  subscribeRepairsIssueRegistry,
} from "../../../data/repairs";
import type { UpdateEntity } from "../../../data/update";
import {
  checkForEntityUpdates,
  filterUpdateEntitiesParameterized,
} from "../../../data/update";
import { showRestartDialog } from "../../../dialogs/restart/show-dialog-restart";
import { showShortcutsDialog } from "../../../dialogs/shortcuts/show-shortcuts-dialog";
import type { PageNavigation } from "../../../layouts/hass-tabs-subpage";
import { ChildPanelReady } from "../../../layouts/panel-ready";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle, haStyleScrollbar } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { isMobileClient } from "../../../util/is_mobile";
import { configSections } from "../config-sections";
import "./ha-config-navigation";
import { sectionCounts, sectionSummaries } from "./section-summaries";

type DashboardSummary<Key extends string, Item> = Record<Key, Item[]> & {
  total: number;
};

const randomTip = (
  openFn: any,
  openHelpFn: any,
  hass: HomeAssistant,
  narrow: boolean
) => {
  const weighted: string[] = [];
  let tips = [
    {
      content: hass.localize("ui.panel.config.tips.help_articles", {
        help_link: html`<a href="#" @click=${openHelpFn}
          >${hass.localize("ui.panel.config.tips.help_articles_link")}</a
        >`,
      }),
      weight: 2,
      narrow: true,
    },
  ];

  if (hass?.enableShortcuts && !isMobileClient) {
    const localizeParam = {
      keyboard_shortcut: html`<a href="#" @click=${openFn}
        >${hass.localize("ui.tips.keyboard_shortcut")}</a
      >`,
    };

    if (hass.user?.is_admin) {
      tips.push({
        content: hass.localize("ui.tips.key_c_tip", localizeParam),
        weight: 1,
        narrow: false,
      });
    }
    tips.push(
      {
        content: hass.localize("ui.tips.key_m_tip", localizeParam),
        weight: 1,
        narrow: false,
      },
      {
        content: hass.localize("ui.tips.key_a_tip", localizeParam),
        weight: 1,
        narrow: false,
      },
      {
        content: hass.localize("ui.tips.key_shortcut_quick_search", {
          ...localizeParam,
          modifier: ctrlOrCmdLabel(hass.localize),
        }),
        weight: 1,
        narrow: false,
      }
    );
  }

  if (narrow) {
    tips = tips.filter((tip) => tip.narrow);
  }

  tips.forEach((tip) => {
    for (let i = 0; i < tip.weight; i++) {
      weighted.push(tip.content);
    }
  });

  return weighted[Math.floor(Math.random() * weighted.length)];
};

@customElement("ha-config-dashboard")
class HaConfigDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @property({ attribute: false }) public cloudStatus?: CloudStatus;

  @state() private _tip?: string;

  @state() private _repairsIssues: DashboardSummary<"issues", RepairsIssue> = {
    issues: [],
    total: 0,
  };

  @state() private _filter = "";

  @state() private _integrations?: number;

  private _pageLock = new PageLockController(this);

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  private _pages = memoizeOne(
    (hasExternalSettings, isAppsInfoDismissed, isHassioLoaded) => {
      const filterApps = (pages: PageNavigation[]) =>
        isAppsInfoDismissed && !isHassioLoaded
          ? pages.filter((page) => page.path !== "/config/apps")
          : pages;
      return [
        ...filterApps(configSections.dashboard),
        ...(hasExternalSettings
          ? configSections.dashboard_external_settings
          : []),
        ...configSections.dashboard_2,
        ...configSections.dashboard_3,
      ];
    }
  );

  public hassSubscribe(): UnsubscribeFunc[] {
    return [
      subscribeRepairsIssueRegistry(this.hass.connection!, (repairs) => {
        const repairsIssues = repairs.issues.filter((issue) => !issue.ignored);

        this._repairsIssues = {
          issues: repairsIssues
            .sort((a, b) => severitySort[a.severity] - severitySort[b.severity])
            .slice(0, repairsIssues.length === 3 ? repairsIssues.length : 2),
          total: repairsIssues.length,
        };

        const integrations = new Set<string>();
        for (const issue of this._repairsIssues.issues) {
          integrations.add(issue.domain);
        }
        this.hass.loadBackendTranslation("issues", [...integrations]);
      }),
    ];
  }

  private _summaries = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      states: HomeAssistant["states"],
      areas: HomeAssistant["areas"],
      floors: HomeAssistant["floors"],
      panels: HomeAssistant["panels"],
      config: HomeAssistant["config"],
      integrations: number | undefined,
      localize: HomeAssistant["localize"]
    ) =>
      sectionSummaries(
        sectionCounts(
          { devices, states, areas, floors, panels, config },
          integrations
        ),
        localize
      )
  );

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    if (this.hass.user?.is_admin) {
      getConfigEntries(this.hass).then(
        (entries) => {
          this._integrations = new Set(
            entries.map((entry) => entry.domain)
          ).size;
        },
        () => undefined
      );
    }
  }

  private _issueTitle(issue: RepairsIssue): string {
    return (
      this.hass.localize(
        `component.${issue.domain}.issues.${issue.translation_key || issue.issue_id}.title`,
        issue.translation_placeholders || {}
      ) || `${issue.domain}: ${issue.translation_key || issue.issue_id}`
    );
  }

  protected render(): TemplateResult {
    const { updates: canInstallUpdates, total: totalUpdates } =
      this._filterUpdateEntitiesParameterized(
        this.hass.states,
        this.hass.entities,
        this.hass.formatEntityName
      );

    const { issues: repairsIssues, total: totalRepairIssues } =
      this._repairsIssues;

    const locked = this._pageLock.locked;
    const title = this.hass.localize("panel.config");

    return html`
      <header>
        ${
          this.narrow
            ? html`<ha-menu-button
                .hass=${this.hass}
                .narrow=${this.narrow}
              ></ha-menu-button>`
            : nothing
        }
        <div class="titles">
          <h1>${title}</h1>
          ${
            this.narrow
              ? nothing
              : html`<p>
                  ${this.hass.localize("ui.panel.config.dashboard.summary")}
                </p>`
          }
        </div>
        ${this.narrow ? nothing : this._renderSearch()}
        <ha-page-tools
          no-find
          .compact=${this.narrow}
          .pageTitle=${title}
        ></ha-page-tools>
        <ha-dropdown ?inert=${locked} @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="check-updates">
            ${this.hass.localize("ui.panel.config.updates.check_updates")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="restart">
            ${this.hass.localize(
              "ui.panel.config.system_dashboard.restart_homeassistant"
            )}
            <ha-svg-icon slot="icon" .path=${mdiPower}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>
      </header>
      ${locked ? html`<ha-page-lock-banner></ha-page-lock-banner>` : nothing}
      <div class="content ha-scrollbar" ?inert=${locked}>
        ${this.narrow ? this._renderSearch() : nothing}
        ${
          canInstallUpdates.length || repairsIssues.length
            ? html`<div class="banners">
                ${
                  canInstallUpdates.length
                    ? html`<a
                        class="banner updates"
                        href="/config/updates?historyBack=1"
                      >
                        <ha-svg-icon .path=${mdiUpdate}></ha-svg-icon>
                        <span class="banner-text">
                          <strong
                            >${this.hass.localize(
                              "ui.panel.config.dashboard.updates_ready",
                              { count: totalUpdates }
                            )}</strong
                          >
                          <span
                            >${canInstallUpdates
                              .map((entity) => computeStateName(entity))
                              .join(", ")}</span
                          >
                        </span>
                        <ha-icon-next></ha-icon-next>
                      </a>`
                    : nothing
                }
                ${
                  repairsIssues.length
                    ? html`<a
                        class="banner repairs"
                        href="/config/repairs?historyBack=1"
                      >
                        <ha-svg-icon .path=${mdiWrench}></ha-svg-icon>
                        <span class="banner-text">
                          <strong
                            >${this.hass.localize(
                              "ui.panel.config.dashboard.repairs_waiting",
                              { count: totalRepairIssues }
                            )}</strong
                          >
                          <span>${this._issueTitle(repairsIssues[0])}</span>
                        </span>
                        <ha-icon-next></ha-icon-next>
                      </a>`
                    : nothing
                }
              </div>`
            : nothing
        }
        <ha-config-navigation
          grid
          .hass=${this.hass}
          .narrow=${this.narrow}
          .filter=${this._filter}
          .summaries=${this._summaries(
            this.hass.devices,
            this.hass.states,
            this.hass.areas,
            this.hass.floors,
            this.hass.panels,
            this.hass.config,
            this._integrations,
            this.hass.localize
          )}
          .pages=${this._pages(
            this.hass.auth.external?.config.hasSettingsScreen,
            this.hass.userData?.apps_info_dismissed,
            isComponentLoaded(this.hass.config, "hassio")
          )}
        ></ha-config-navigation>
        <ha-tip>${this._tip}</ha-tip>
      </div>
      ${
        this.narrow
          ? nothing
          : html`<ha-page-footer .locked=${locked}></ha-page-footer>`
      }
    `;
  }

  private _renderSearch(): TemplateResult {
    const label = this.hass.localize("ui.panel.config.dashboard.search");
    return html`<ha-input-search
      class="search"
      appearance="outlined"
      .placeholder=${label}
      .accessibleLabel=${label}
      .value=${this._filter}
      @input=${this._filterChanged}
    ></ha-input-search>`;
  }

  private _filterChanged(ev: Event): void {
    this._filter = (ev.target as HaInputSearch).value ?? "";
  }

  protected override updated(changedProps: PropertyValues<this>): void {
    super.updated(changedProps);

    if (!this._tip && changedProps.has("hass")) {
      this._tip = randomTip(
        this._openShortcutDialog,
        this._openHelpArticles,
        this.hass,
        this.narrow
      );
    }
  }

  private _openHelpArticles(ev: Event) {
    ev.preventDefault();

    openAllHelpArticles(this);
  }

  private _openShortcutDialog(ev: Event) {
    ev.preventDefault();

    showShortcutsDialog(this);
  }

  private _filterUpdateEntitiesParameterized = memoizeOne(
    (
      entities: HomeAssistant["states"],
      entityRegistry: HomeAssistant["entities"],
      formatEntityName: HomeAssistant["formatEntityName"]
    ): DashboardSummary<"updates", UpdateEntity> => {
      const updates = filterUpdateEntitiesParameterized(
        entities,
        formatEntityName,
        false,
        false
      ).filter((entity) => !entityRegistry[entity.entity_id]?.hidden);

      return {
        updates: updates.slice(0, updates.length === 3 ? updates.length : 2),
        total: updates.length,
      };
    }
  );

  private async _handleMenuAction(ev: HaDropdownSelectEvent) {
    const action = ev.detail.item.value;
    switch (action) {
      case "check-updates":
        checkForEntityUpdates(this, this.hass);
        break;
      case "restart":
        showRestartDialog(this);
        break;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      haStyleScrollbar,
      css`
        :host {
          display: flex;
          flex-direction: column;
          height: 100vh;
          height: 100dvh;
          box-sizing: border-box;
          padding-top: var(--safe-area-inset-top, 0px);
          background: var(--primary-background-color);
        }

        header {
          flex: none;
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          padding: var(--ha-space-6) var(--ha-space-8) var(--ha-space-3);
          padding-inline-end: calc(
            var(--ha-space-8) + var(--safe-area-inset-right, 0px)
          );
          color: var(--sidebar-icon-color);
        }
        :host([narrow]) header {
          padding: var(--ha-space-2) var(--ha-space-2);
        }
        .titles {
          flex: 1;
          min-width: 0;
          color: var(--primary-text-color);
        }
        h1 {
          margin: 0;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: var(--ha-font-size-4xl);
          font-weight: var(--ha-font-weight-medium);
          line-height: var(--ha-line-height-condensed);
        }
        :host([narrow]) h1 {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-normal);
        }
        .titles p {
          margin: var(--ha-space-1) 0 0;
          font-size: var(--ha-font-size-l);
          color: var(--secondary-text-color);
        }
        .search {
          width: clamp(200px, 26vw, 340px);
          --ha-input-search-height: var(--ha-space-12);
          --ha-input-search-border-radius: var(--ha-border-radius-pill);
        }
        :host([narrow]) .search {
          display: block;
          width: auto;
          margin-bottom: var(--ha-space-3);
        }
        ha-page-footer,
        ha-page-lock-banner {
          flex: none;
        }

        .content {
          flex: 1;
          min-height: 0;
          overflow: auto;
          box-sizing: border-box;
          padding: var(--ha-space-3) var(--ha-space-8) var(--ha-space-6);
          padding-right: calc(
            var(--ha-space-8) + var(--safe-area-inset-right, 0px)
          );
        }
        :host([narrow]) .content {
          padding: var(--ha-space-2) var(--ha-space-3)
            calc(var(--ha-space-6) + var(--safe-area-inset-bottom, 0px));
        }

        .banners {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-4);
        }
        .banner {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 56px;
          box-sizing: border-box;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          color: var(--primary-text-color);
          text-decoration: none;
        }
        .banner:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .banner.updates {
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--primary-background-color)
          );
        }
        .banner.repairs {
          background: color-mix(
            in srgb,
            var(--warning-color) 45%,
            var(--primary-background-color)
          );
        }
        .banner-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .banner-text strong {
          font-weight: var(--ha-font-weight-medium);
        }
        .banner-text span {
          font-size: var(--ha-font-size-s);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        ha-tip {
          margin-top: var(--ha-space-6);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-dashboard": HaConfigDashboard;
  }
}
