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
import { keyed } from "lit/directives/keyed";
import { styleMap } from "lit/directives/style-map";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { computeStateName } from "../../../common/entity/compute_state_name";
import { ctrlOrCmdLabel } from "../../../common/keyboard/ctrl-or-cmd";
import { PageLockController } from "../../../common/locks/page-lock-controller";
import {
  joinForMode,
  textParts,
} from "../../../common/language-mode/language-mode";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
import type { LanguageMode } from "../../../common/preferences/personal-preferences";
import "../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/ha-menu-button";
import "../../../components/ha-tip";
import { navigate } from "../../../common/navigate";
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
import {
  SettingsDramaController,
  settingsMotionStyles,
} from "./settings-motion";

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

  // Keeps the motion strength attribute in step with the person's choice.
  protected readonly _drama = new SettingsDramaController(this);

  // The last attention count, so the numeral pops only when it changes.
  private _lastAttention?: number;

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
        ...configSections.backup,
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

  private _counts = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      states: HomeAssistant["states"],
      areas: HomeAssistant["areas"],
      floors: HomeAssistant["floors"],
      panels: HomeAssistant["panels"],
      config: HomeAssistant["config"],
      integrations: number | undefined
    ) =>
      sectionCounts(
        { devices, states, areas, floors, panels, config },
        integrations
      )
  );

  private _summaries = memoizeOne(
    (
      devices: HomeAssistant["devices"],
      states: HomeAssistant["states"],
      areas: HomeAssistant["areas"],
      floors: HomeAssistant["floors"],
      panels: HomeAssistant["panels"],
      config: HomeAssistant["config"],
      integrations: number | undefined,
      localize: HomeAssistant["localize"],
      mode: LanguageMode
    ) => {
      const counts = sectionCounts(
        { devices, states, areas, floors, panels, config },
        integrations
      );
      const english = sectionSummaries(counts, localize);
      if (mode === "english") {
        return english;
      }
      // Each summary is joined as a whole, so two languages read as one line
      // per language instead of being mixed inside the sentence.
      const cantonese = sectionSummaries(counts, (key, values) => {
        const parts = textParts(localize, key, values);
        return parts.cantonese ?? parts.english;
      });
      return Object.fromEntries(
        Object.entries(english).map(([path, text]) => [
          path,
          joinForMode({ english: text, cantonese: cantonese[path] }, mode),
        ])
      );
    }
  );

  // Draws the page again when the language mode changes.
  private _lang = new LanguageModeController(this);

  // A string that follows the language mode where it has Cantonese.
  private _t = (
    key: string,
    values?: Record<string, string | number>
  ): string => this._lang.text(this.hass.localize, key, values);

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

  /** Pending updates and repairs together: what needs the person. */
  private _attentionCount(): number {
    const { updates, total } = this._filterUpdateEntitiesParameterized(
      this.hass.states,
      this.hass.entities,
      this.hass.formatEntityName
    );
    return (
      (updates.length ? total : 0) +
      (this._repairsIssues.issues.length ? this._repairsIssues.total : 0)
    );
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

    const attention = this._attentionCount();
    const popped =
      this._lastAttention !== undefined && this._lastAttention !== attention;

    const locked = this._pageLock.locked;
    const title = this._t("panel.config");

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
        <div class="spacer"></div>
        <ha-page-tools
          no-find
          .compact=${this.narrow}
          .pageTitle=${title}
        ></ha-page-tools>
        <ha-dropdown ?inert=${locked} @wa-select=${this._handleMenuAction}>
          <ha-icon-button
            slot="trigger"
            .label=${this._t("ui.common.menu")}
            .path=${mdiDotsVertical}
          ></ha-icon-button>

          <ha-dropdown-item value="check-updates">
            ${this._t("ui.panel.config.updates.check_updates")}
            <ha-svg-icon slot="icon" .path=${mdiRefresh}></ha-svg-icon>
          </ha-dropdown-item>

          <ha-dropdown-item value="restart">
            ${this._t("ui.panel.config.system_dashboard.restart_homeassistant")}
            <ha-svg-icon slot="icon" .path=${mdiPower}></ha-svg-icon>
          </ha-dropdown-item>
        </ha-dropdown>
      </header>
      ${locked ? html`<ha-page-lock-banner></ha-page-lock-banner>` : nothing}
      <div class="content ha-scrollbar" ?inert=${locked}>
        <section class="hero rise">
          <h1>${title}</h1>
          ${this._renderSearch()}
        </section>
        ${
          attention
            ? html`<section
                class="attention rise"
                style=${styleMap({ "--i": "1" })}
              >
                ${keyed(
                  attention,
                  html`<span
                    class=${popped ? "numeral pop" : "numeral"}
                    aria-hidden="true"
                    >${attention}</span
                  >`
                )}
                <div class="attention-body">
                  <strong
                    >${this._t("ui.panel.config.dashboard.attention", {
                      count: attention,
                    })}</strong
                  >
                  <div class="attention-links">
                    ${
                      canInstallUpdates.length
                        ? html`<a href="/config/updates?historyBack=1">
                            <ha-svg-icon .path=${mdiUpdate}></ha-svg-icon>
                            <span class="link-text">
                              <span
                                >${this._t(
                                  "ui.panel.config.dashboard.updates_ready",
                                  { count: totalUpdates }
                                )}</span
                              >
                              <small
                                >${canInstallUpdates
                                  .map((entity) => computeStateName(entity))
                                  .join(", ")}</small
                              >
                            </span>
                            <span class="link-action"
                              >${this._t(
                                "ui.panel.config.dashboard.review_updates"
                              )}</span
                            >
                          </a>`
                        : nothing
                    }
                    ${
                      repairsIssues.length
                        ? html`<a href="/config/repairs?historyBack=1">
                            <ha-svg-icon .path=${mdiWrench}></ha-svg-icon>
                            <span class="link-text">
                              <span
                                >${this._t(
                                  "ui.panel.config.dashboard.repairs_waiting",
                                  { count: totalRepairIssues }
                                )}</span
                              >
                              <small
                                >${this._issueTitle(repairsIssues[0])}</small
                              >
                            </span>
                            <span class="link-action"
                              >${this._t(
                                "ui.panel.config.dashboard.fix_repairs"
                              )}</span
                            >
                          </a>`
                        : nothing
                    }
                  </div>
                </div>
              </section>`
            : nothing
        }
        <ha-config-navigation
          grid
          .hass=${this.hass}
          .counts=${this._counts(
            this.hass.devices,
            this.hass.states,
            this.hass.areas,
            this.hass.floors,
            this.hass.panels,
            this.hass.config,
            this._integrations
          )}
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
            this.hass.localize,
            this._lang.mode
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
    const label = this._t("ui.panel.config.dashboard.search");
    return html`<ha-input-search
      class="search"
      appearance="outlined"
      .placeholder=${this._t("ui.panel.config.dashboard.find_any")}
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

    // Remembered after the draw, so the next change of the count can pop.
    this._lastAttention = this._attentionCount();

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

    navigate("/config/help");
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
      settingsMotionStyles,
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
          padding: var(--ha-space-4) var(--ha-space-8) 0;
          padding-inline-end: calc(
            var(--ha-space-8) + var(--safe-area-inset-right, 0px)
          );
          color: var(--sidebar-icon-color);
        }
        :host([narrow]) header {
          padding: var(--ha-space-2) var(--ha-space-2) 0;
        }
        .spacer {
          flex: 1;
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

        .hero {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-5);
          margin-bottom: var(--ha-space-6);
        }
        /* The shared heading style keeps one line with an ellipsis; the big
           title wraps instead, so no word is ever cut. */
        .hero h1 {
          margin: 0;
          max-width: 100%;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          overflow-wrap: anywhere;
          font-family: var(--ha-font-family-heading, inherit);
          font-size: clamp(40px, 7vw, 72px);
          font-weight: 800;
          font-stretch: 125%;
          letter-spacing: -0.03em;
          line-height: 1;
          color: var(--primary-text-color);
          unicode-bidi: plaintext;
        }
        .search {
          display: block;
          width: 100%;
          max-width: 760px;
          --ha-input-search-height: 68px;
          --ha-input-search-border-radius: 34px;
        }

        .attention {
          display: flex;
          align-items: center;
          gap: var(--ha-space-5);
          margin-bottom: var(--ha-space-6);
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: 32px;
          color: var(--primary-text-color);
          background: color-mix(
            in srgb,
            var(--warning-color) 38%,
            var(--primary-background-color)
          );
        }
        .numeral {
          flex: none;
          display: inline-block;
          font-size: 76px;
          font-weight: 800;
          font-stretch: 125%;
          line-height: 1;
          letter-spacing: -0.03em;
          font-variant-numeric: tabular-nums;
        }
        .attention-body {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .attention-body > strong {
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
          unicode-bidi: plaintext;
        }
        .attention-links {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .attention-links a {
          flex: 1 1 240px;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 56px;
          box-sizing: border-box;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: 28px;
          color: var(--primary-text-color);
          text-decoration: none;
          background: color-mix(
            in srgb,
            var(--card-background-color) 60%,
            transparent
          );
        }
        .attention-links a:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .link-text {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          unicode-bidi: plaintext;
        }
        .link-text small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          color: var(--secondary-text-color);
        }
        .link-action {
          flex: none;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-pill);
          font-weight: var(--ha-font-weight-medium);
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
        }
        @media (max-width: 460px) {
          .attention {
            flex-direction: column;
            align-items: flex-start;
            padding: var(--ha-space-4);
          }
          .attention-body {
            align-self: stretch;
            width: 100%;
          }
          .attention-links {
            width: 100%;
          }
          .attention-links a {
            flex-basis: 100%;
            min-width: 0;
          }
        }
        /* Phone: a compact title, a 48 px search and a smaller attention
           block, so the first rows are on screen. */
        :host([narrow]) .hero {
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-3);
        }
        :host([narrow]) .hero h1 {
          font-size: 22px;
          font-weight: 700;
          font-stretch: 100%;
          letter-spacing: -0.01em;
          line-height: 1.2;
        }
        :host([narrow]) .search {
          --ha-input-search-height: 48px;
          --ha-input-search-border-radius: 24px;
        }
        :host([narrow]) .attention {
          gap: var(--ha-space-3);
          margin-bottom: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: 24px;
        }
        :host([narrow]) .numeral {
          font-size: 40px;
        }
        :host([narrow]) .attention-body {
          gap: var(--ha-space-2);
        }
        :host([narrow]) .attention-body > strong {
          font-size: 16px;
        }
        :host([narrow]) .attention-links a {
          min-height: 48px;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: 24px;
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
