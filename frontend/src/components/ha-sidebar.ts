import {
  mdiBell,
  mdiCellphoneCog,
  mdiCog,
  mdiHammer,
  mdiMenu,
  mdiMenuOpen,
  mdiMicrophone,
} from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import memoizeOne from "memoize-one";
import { fireEvent } from "../common/dom/fire_event";
import { stringCompare } from "../common/string/compare";
import { computeRTL } from "../common/util/compute_rtl";
import { throttle } from "../common/util/throttle";
import { subscribeFrontendUserData } from "../data/frontend";
import type { ActionHandlerEvent } from "../data/lovelace/action_handler";
import {
  FIXED_PANELS,
  getDefaultPanelUrlPath,
  getPanelIcon,
  getPanelIconPath,
  getPanelTitle,
} from "../data/panel";
import { activityStore } from "../common/activity/activity-store";
import { adoptRunningInstalls } from "./update-progress/update-install-tracker";
import type { PersistentNotification } from "../data/persistent_notification";
import { subscribeNotifications } from "../data/persistent_notification";
import { subscribeRepairsIssueRegistry } from "../data/repairs";
import type { UpdateEntity } from "../data/update";
import { updateCanInstall } from "../data/update";
import { showEditSidebarDialog } from "../dialogs/sidebar/show-dialog-edit-sidebar";
import { ScrollableFadeMixin } from "../mixins/scrollable-fade-mixin";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import {
  IDENTITY_CHANGED_EVENT,
  readIdentity,
} from "../common/identity/identity";
import { subscribeSharedIdentity } from "../common/identity/shared-identity";
import { InstanceSyncStarter } from "../common/instance-sync/start-instance-sync";
import { subscribeSharedPreferenceDefaults } from "../common/preferences/shared-preference-defaults";
import { setScheduleZoneSetting } from "../common/preferences/preference-schedule-store";
import {
  getPersonalPreferences,
  isDeveloperToolsHidden,
  subscribePersonalPreferences,
} from "../common/preferences/personal-preferences";
import "../panels/config/identity/ha-identity-logo";
import { actionHandler } from "../panels/lovelace/common/directives/action-handler-directive";
import { haStyleScrollbar } from "../resources/styles";
import type { HomeAssistant, PanelInfo, Route } from "../types";
import { isMobileClient } from "../util/is_mobile";
import "./animation/ha-fade-in";
import "./ha-icon";
import "./ha-icon-button";
import "./ha-spinner";
import "./ha-svg-icon";
import "./ha-tooltip";
import "./item/ha-list-item-button";
import "./list/ha-list-nav";
import "./user/ha-user-badge";
import { showVoiceCommandDialog } from "../dialogs/voice-command-dialog/show-ha-voice-command-dialog";

const SORT_VALUE_URL_PATHS = {
  energy: 1,
  map: 2,
  logbook: 3,
  history: 4,
};

const panelSorter = (
  reverseSort: string[],
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  const indexA = reverseSort.indexOf(a.url_path);
  const indexB = reverseSort.indexOf(b.url_path);
  if (indexA !== indexB) {
    if (indexA < indexB) {
      return 1;
    }
    return -1;
  }
  return defaultPanelSorter(defaultPanel, a, b, language);
};

const defaultPanelSorter = (
  defaultPanel: string,
  a: PanelInfo,
  b: PanelInfo,
  language: string
) => {
  // Put all the Lovelace at the top.
  const aLovelace = a.component_name === "lovelace";
  const bLovelace = b.component_name === "lovelace";

  if (a.url_path === defaultPanel) {
    return -1;
  }
  if (b.url_path === defaultPanel) {
    return 1;
  }

  if (aLovelace && bLovelace) {
    return stringCompare(a.title!, b.title!, language);
  }
  if (aLovelace && !bLovelace) {
    return -1;
  }
  if (bLovelace) {
    return 1;
  }

  const aBuiltIn = a.url_path in SORT_VALUE_URL_PATHS;
  const bBuiltIn = b.url_path in SORT_VALUE_URL_PATHS;

  if (aBuiltIn && bBuiltIn) {
    return SORT_VALUE_URL_PATHS[a.url_path] - SORT_VALUE_URL_PATHS[b.url_path];
  }
  if (aBuiltIn) {
    return -1;
  }
  if (bBuiltIn) {
    return 1;
  }
  // both not built in, sort by title
  return stringCompare(a.title!, b.title!, language);
};

export const computePanels = memoizeOne(
  (
    panels: HomeAssistant["panels"],
    defaultPanel: string,
    panelsOrder: string[],
    hiddenPanels: string[],
    locale: HomeAssistant["locale"]
  ): [PanelInfo[], PanelInfo[]] => {
    if (!panels) {
      return [[], []];
    }

    const beforeSpacer: PanelInfo[] = [];

    const allPanels = Object.values(panels).filter(
      (panel) => !FIXED_PANELS.includes(panel.url_path)
    );

    allPanels.forEach((panel) => {
      const isDefaultPanel = panel.url_path === defaultPanel;

      if (
        !isDefaultPanel &&
        (!panel.title ||
          panel.show_in_sidebar === false ||
          hiddenPanels.includes(panel.url_path) ||
          (panel.default_visible === false &&
            !panelsOrder.includes(panel.url_path)))
      ) {
        return;
      }
      beforeSpacer.push(panel);
    });

    const reverseSort = [...panelsOrder].reverse();

    beforeSpacer.sort((a, b) =>
      panelSorter(reverseSort, defaultPanel, a, b, locale.language)
    );

    return [beforeSpacer, []];
  }
);

@customElement("ha-sidebar")
class HaSidebar extends SubscribeMixin(ScrollableFadeMixin(LitElement)) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @property({ attribute: "always-expand", type: Boolean })
  public alwaysExpand = false;

  @property({ attribute: "sidebar-title" }) public sidebarTitle =
    "Home Assistant";

  @state() private _notifications?: PersistentNotification[];

  @state() private _updatesCount = 0;

  @state() private _activityCount = 0;

  private _unsubActivities?: () => void;

  @state() private _issuesCount = 0;

  @state() private _inTools = false;

  @state() private _panelOrder?: string[];

  @state() private _hiddenPanels?: string[];

  @state() private _identityName?: string;

  @state() private _hideDeveloperTools = false;

  private _unsubPreferences?: () => void;

  private _unsubPersistentNotifications: UnsubscribeFunc | undefined;

  @query(".before-spacer") private _scrollableList?: HTMLDivElement;

  protected get scrollableElement(): HTMLElement | null {
    return this._scrollableList as HTMLElement | null;
  }

  // The signed-in user can load after this subscribes, so the sync starts
  // from here or, later, from `updated` once the user id is known.
  private _instanceSync = new InstanceSyncStarter();

  public hassSubscribe() {
    this._instanceSync.ensure(this.hass.connection, this.hass.user?.id);
    if (this.hass.user?.is_admin) {
      // Installs already running after a reload show in the activity tray.
      adoptRunningInstalls(this.hass);
    }
    return [
      subscribeSharedIdentity(this.hass.connection),
      subscribeSharedPreferenceDefaults(this.hass.connection),
      () => this._instanceSync.release(),
      subscribeFrontendUserData(
        this.hass.connection,
        "sidebar",
        ({ value }) => {
          this._panelOrder = value?.panelOrder;
          this._hiddenPanels = value?.hiddenPanels;

          // fallback to old localStorage values
          if (!this._panelOrder) {
            const storedOrder = localStorage.getItem("sidebarPanelOrder");
            this._panelOrder = storedOrder ? JSON.parse(storedOrder) : [];
          }
          if (!this._hiddenPanels) {
            const storedHidden = localStorage.getItem("sidebarHiddenPanels");
            this._hiddenPanels = storedHidden ? JSON.parse(storedHidden) : [];
          }
        }
      ),
      ...(this.hass.user?.is_admin
        ? [
            subscribeRepairsIssueRegistry(this.hass.connection!, (repairs) => {
              this._issuesCount = repairs.issues.filter(
                (issue) => !issue.ignored
              ).length;
            }),
          ]
        : []),
    ];
  }

  public connectedCallback() {
    super.connectedCallback();
    this._unsubActivities ??= activityStore.subscribe(() => {
      this._activityCount = activityStore.attentionCount;
    });
    window.addEventListener("location-changed", this._pathChanged);
    window.addEventListener("popstate", this._pathChanged);
    window.addEventListener(IDENTITY_CHANGED_EVENT, this._identityChanged);
    this._hideDeveloperTools = isDeveloperToolsHidden(getPersonalPreferences());
    this._unsubPreferences = subscribePersonalPreferences((preferences) => {
      this._hideDeveloperTools = isDeveloperToolsHidden(preferences);
    });
    this._identityChanged();
    this._pathChanged();
  }

  private _identityChanged = () => {
    this._identityName = readIdentity().name;
  };

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubPreferences?.();
    this._unsubPreferences = undefined;
    this._unsubActivities?.();
    this._unsubActivities = undefined;
    window.removeEventListener(IDENTITY_CHANGED_EVENT, this._identityChanged);
    window.removeEventListener("location-changed", this._pathChanged);
    window.removeEventListener("popstate", this._pathChanged);
  }

  // The developer tools are pages of the settings panel, so the panel alone
  // does not say which of the two items is open.
  private _pathChanged = () => {
    this._inTools = /^\/config\/tools(\/|$)/.test(window.location.pathname);
  };

  protected render() {
    if (!this.hass) {
      return nothing;
    }

    const selectedPanel = this.hass.panelUrl;

    // prettier-ignore
    return html`
      ${this._renderHeader()} ${this._renderAssist()}
      ${this._renderAllPanels(selectedPanel)}
      ${this._renderProvenance()}`;
  }

  protected shouldUpdate(changedProps: PropertyValues): boolean {
    if (
      changedProps.has("expanded") ||
      changedProps.has("narrow") ||
      changedProps.has("alwaysExpand") ||
      changedProps.has("_updatesCount") ||
      changedProps.has("_issuesCount") ||
      changedProps.has("_inTools") ||
      changedProps.has("_notifications") ||
      changedProps.has("_activityCount") ||
      changedProps.has("_hiddenPanels") ||
      changedProps.has("_panelOrder") ||
      changedProps.has("_contentScrolled") ||
      changedProps.has("_contentScrollable")
    ) {
      return true;
    }
    if (!this.hass || !changedProps.has("hass")) {
      return false;
    }
    const oldHass = changedProps.get("hass") as HomeAssistant;
    if (!oldHass) {
      return true;
    }
    const hass = this.hass;
    return (
      hass.panels !== oldHass.panels ||
      hass.panelUrl !== oldHass.panelUrl ||
      hass.user !== oldHass.user ||
      hass.localize !== oldHass.localize ||
      hass.locale !== oldHass.locale ||
      hass.states !== oldHass.states ||
      hass.userData !== oldHass.userData ||
      hass.systemData !== oldHass.systemData ||
      hass.connected !== oldHass.connected
    );
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this._subscribePersistentNotifications();
  }

  private _subscribePersistentNotifications(): void {
    if (this._unsubPersistentNotifications) {
      this._unsubPersistentNotifications();
    }
    this._unsubPersistentNotifications = subscribeNotifications(
      this.hass.connection,
      (notifications) => {
        this._notifications = notifications;
      }
    );
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    if (changedProps.has("alwaysExpand")) {
      this.toggleAttribute("expanded", this.alwaysExpand);
    }
    if (!changedProps.has("hass")) {
      return;
    }

    if (this.isConnected && this.hass?.user?.id) {
      this._instanceSync.ensure(this.hass.connection, this.hass.user.id);
    }

    const oldHass = changedProps.get("hass") as HomeAssistant | undefined;
    if (
      this.hass.locale &&
      (this.hass.locale !== oldHass?.locale ||
        this.hass.config?.time_zone !== oldHass?.config?.time_zone)
    ) {
      // Schedules and quiet hours follow the profile's time zone setting.
      setScheduleZoneSetting(
        this.hass.locale.time_zone,
        this.hass.config.time_zone
      );
    }

    if (
      this.hass &&
      oldHass?.connected === false &&
      this.hass.connected === true
    ) {
      this._subscribePersistentNotifications();
    }

    this._calculateCounts();
  }

  private _calculateCounts = throttle(() => {
    let updateCount = 0;

    for (const entityId of Object.keys(this.hass.states)) {
      if (
        entityId.startsWith("update.") &&
        !this.hass.entities[entityId]?.hidden &&
        updateCanInstall(this.hass.states[entityId] as UpdateEntity)
      ) {
        updateCount++;
      }
    }

    this._updatesCount = updateCount;
  }, 5000);

  private _renderHeader() {
    return html`<div
      class="menu"
      @action=${this._handleAction}
      .actionHandler=${actionHandler({
        hasHold: true,
      })}
    >
      ${
        !this.narrow
          ? html`
              <ha-icon-button
                .label=${this.hass.localize("ui.sidebar.sidebar_toggle")}
                .path=${
                  this.hass.dockedSidebar === "docked" ? mdiMenuOpen : mdiMenu
                }
                @action=${this._toggleSidebar}
              ></ha-icon-button>
            `
          : nothing
      }
      <div class="title">
        <ha-identity-logo
          custom-only
          style="--identity-logo-size: 28px; margin-inline-end: 8px; vertical-align: middle"
        ></ha-identity-logo
        >${this._identityName || this.sidebarTitle}
      </div>
    </div>`;
  }

  /** The button at the top of the rail that opens Assist, when it is set up. */
  private _renderAssist() {
    if (!this.hass.config.components.includes("conversation")) {
      return nothing;
    }
    const label = this.hass.localize("ui.sidebar.assist");
    return html`<button
      type="button"
      class="assist"
      aria-label=${label}
      title=${label}
      @click=${this._openAssist}
    >
      <ha-svg-icon .path=${mdiMicrophone}></ha-svg-icon>
      <span class="assist-text">${label}</span>
    </button>`;
  }

  private _openAssist() {
    showVoiceCommandDialog(this, this.hass, { pipeline_id: "last_used" });
  }

  private _renderAllPanels(selectedPanel: string) {
    const renderList = (content, cls: string, scrollable: boolean) =>
      html`<ha-list-nav
        class=${classMap({
          "ha-scrollbar": scrollable,
          [cls]: true,
        })}
        >${content}</ha-list-nav
      >`;

    if (!this._panelOrder || !this._hiddenPanels) {
      return html`<div class="panels-list">
        <div class="wrapper">
          ${renderList(
            html`<slot name="main-navigation">
              <ha-fade-in .delay=${500}>
                <ha-spinner size="small"></ha-spinner>
              </ha-fade-in>
            </slot>`,
            "before-spacer",
            true
          )}
          ${this.renderScrollableFades()}
        </div>
        ${this._renderSpacer()}
        ${renderList(
          html`<slot name="fixed-navigation">
            ${this._renderFixedPanels(selectedPanel)}
          </slot>`,
          "after-spacer",
          false
        )}
      </div>`;
    }

    const defaultPanel = getDefaultPanelUrlPath(this.hass);

    const [beforeSpacer, afterSpacer] = computePanels(
      this.hass.panels,
      defaultPanel,
      this._panelOrder,
      this._hiddenPanels,
      this.hass.locale
    );

    // prettier-ignore
    return html`<div class="panels-list">
      <div class="wrapper">
        ${renderList(
      html`<slot name="main-navigation">
        ${this._renderPanels(beforeSpacer, selectedPanel)}
      </slot>`,
      "before-spacer",
      true
    )}
        ${this.renderScrollableFades()}
      </div>
      ${this._renderSpacer()}
      ${renderList(
      html`<slot name="fixed-navigation">
          ${this._renderPanels(afterSpacer, selectedPanel)}
          ${this._renderFixedPanels(selectedPanel)}
        </slot>`,
      "after-spacer",
      false
    )}
    </div>`;
  }

  private _renderFixedPanels(selectedPanel: string) {
    // prettier-ignore
    return html`
      ${this._renderNotifications()}
      ${this._renderDeveloperTools()}
      ${this.hass.user?.is_admin
        ? this._renderConfiguration(selectedPanel)
        : this._renderExternalConfiguration()}
      ${this._renderUserItem(selectedPanel)}
    `;
  }

  private _renderPanels(panels: PanelInfo[], selectedPanel: string) {
    return panels.map((panel) =>
      this._renderPanel(panel, panel.url_path === selectedPanel)
    );
  }

  private _renderPanel(panel: PanelInfo, isSelected: boolean) {
    const title = getPanelTitle(this.hass, panel);
    const urlPath = panel.url_path;
    const icon = getPanelIcon(panel);
    const iconPath = getPanelIconPath(panel);

    return html`
      <ha-list-item-button
        .href=${`/${urlPath}`}
        id="sidebar-panel-${urlPath}"
        class=${classMap({ selected: isSelected })}
      >
        ${
          iconPath
            ? html`<ha-svg-icon slot="start" .path=${iconPath}></ha-svg-icon>`
            : html`<ha-icon slot="start" .icon=${icon}></ha-icon>`
        }
        <span class="item-text" slot="headline">${title}</span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand && title
          ? this._renderToolTip(`sidebar-panel-${urlPath}`, title)
          : nothing
      }
    `;
  }

  private _renderSpacer() {
    return html`<div class="spacer" disabled></div>`;
  }

  private _renderDeveloperTools() {
    // School mode only leaves the entry out; the page itself stays reachable.
    if (!this.hass.user?.is_admin || this._hideDeveloperTools) {
      return nothing;
    }
    const title = this.hass.localize("ui.sidebar.developer_tools");
    return html`
      <ha-list-item-button
        class=${classMap({ selected: this._inTools })}
        href="/config/tools"
        id="sidebar-developer-tools"
        aria-label=${title}
      >
        <ha-svg-icon slot="start" .path=${mdiHammer}></ha-svg-icon>
        <span class="item-text item-short" slot="headline"
          >${this.hass.localize("ui.sidebar.developer_tools_short")}</span
        >
        <span class="item-text item-full" slot="headline">${title}</span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip("sidebar-developer-tools", title)
          : nothing
      }
    `;
  }

  private _renderConfiguration(selectedPanel: string) {
    if (!this.hass.user?.is_admin) {
      return nothing;
    }
    const isSelected = selectedPanel === "config" && !this._inTools;
    return html`
      <ha-list-item-button
        class="configuration ${classMap({ selected: isSelected })}"
        href="/config"
        id="sidebar-config"
      >
        <ha-svg-icon slot="start" .path=${mdiCog}></ha-svg-icon>
        ${
          this._updatesCount > 0 || this._issuesCount > 0
            ? html`
                <span class="badge" slot="start">
                  ${this._updatesCount + this._issuesCount}
                </span>
              `
            : nothing
        }
        <span class="item-text" slot="headline"
          >${this.hass.localize("panel.config")}</span
        >
        ${
          this._updatesCount > 0 || this._issuesCount > 0
            ? html`
                <span class="badge" slot="end"
                  >${this._updatesCount + this._issuesCount}</span
                >
              `
            : nothing
        }
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-config",
              this.hass.localize("panel.config")
            )
          : nothing
      }
    `;
  }

  private _renderNotifications() {
    const notificationCount =
      (this._notifications ? this._notifications.length : 0) +
      this._activityCount;

    return html`
      <ha-list-item-button
        class="notifications"
        @click=${this._handleShowNotificationDrawer}
        id="sidebar-notifications"
      >
        <ha-svg-icon slot="start" .path=${mdiBell}></ha-svg-icon>
        ${
          notificationCount > 0
            ? html`
                <span class="badge" slot="start"> ${notificationCount} </span>
              `
            : nothing
        }
        <span class="item-text" slot="headline"
          >${this.hass.localize("ui.notification_drawer.title")}</span
        >
        ${
          notificationCount > 0
            ? html`<span class="badge" slot="end">${notificationCount}</span>`
            : nothing
        }
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-notifications",
              this.hass.localize("ui.notification_drawer.title")
            )
          : nothing
      }
    `;
  }

  private _renderUserItem(selectedPanel: string) {
    const isRTL = computeRTL(
      this.hass.language,
      this.hass.translationMetadata.translations
    );
    const isSelected = selectedPanel === "profile";

    return html`
      <ha-list-item-button
        href="/profile"
        id="sidebar-profile"
        class=${classMap({
          user: true,
          selected: isSelected,
          rtl: isRTL,
        })}
      >
        <ha-user-badge slot="start" .user=${this.hass.user}></ha-user-badge>
        <span class="item-text" slot="headline"
          >${this.hass.user ? this.hass.user.name : nothing}</span
        >
      </ha-list-item-button>
      ${
        !this.alwaysExpand && this.hass.user
          ? this._renderToolTip("sidebar-profile", this.hass.user.name)
          : nothing
      }
    `;
  }

  /**
   * Version and build time of the running build, shown on the first screen.
   * Both come from constants fixed at build time. A build without a usable
   * time says so instead of showing another date.
   */
  private _renderProvenance() {
    const version =
      __MATERIAL_BUILD__ || this.hass.config?.version || __VERSION__;
    const built = new Date(__BUILD_TIME__);
    const language = this.hass.locale?.language || this.hass.language;
    let date: string | undefined;
    let time: string | undefined;
    if (!Number.isNaN(built.getTime())) {
      date = built.toLocaleDateString(language, {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
      time = built.toLocaleTimeString(language, {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
      });
    }
    const updated =
      date && time
        ? this.hass.localize("ui.sidebar.provenance_updated", { date, time })
        : this.hass.localize("ui.sidebar.provenance_unavailable");
    return html`
      <div
        class="provenance"
        role="note"
        aria-label=${`${this.hass.localize("ui.sidebar.provenance_version", {
          version,
        })}. ${updated}`}
      >
        <span class="version">${version}</span>
        ${
          date && time
            ? html`<span>${date}</span><span>${time}</span>`
            : html`<span>${updated}</span>`
        }
      </div>
    `;
  }

  private _renderExternalConfiguration() {
    if (!this.hass.auth.external?.config.hasSettingsScreen) {
      return nothing;
    }
    return html`
      <ha-list-item-button
        @click=${this._handleExternalAppConfiguration}
        id="sidebar-external-config"
      >
        <ha-svg-icon slot="start" .path=${mdiCellphoneCog}></ha-svg-icon>
        <span class="item-text" slot="headline">
          ${this.hass.localize("ui.sidebar.external_app_configuration")}
        </span>
      </ha-list-item-button>
      ${
        !this.alwaysExpand
          ? this._renderToolTip(
              "sidebar-external-config",
              this.hass.localize("ui.sidebar.external_app_configuration")
            )
          : nothing
      }
    `;
  }

  private _renderToolTip(id: string, text: string) {
    if (isMobileClient) {
      return nothing;
    }

    return html`<ha-tooltip
      for=${id}
      show-delay="0"
      hide-delay="0"
      placement="right"
    >
      ${text}
    </ha-tooltip>`;
  }

  private _handleExternalAppConfiguration(ev: Event) {
    ev.preventDefault();
    this.hass.auth.external!.fireMessage({
      type: "config_screen/show",
    });
  }

  private _handleAction(ev: ActionHandlerEvent) {
    if (ev.detail.action !== "hold") {
      return;
    }

    showEditSidebarDialog(this);
  }

  private _handleShowNotificationDrawer() {
    fireEvent(this, "hass-show-notifications");
  }

  private _toggleSidebar(ev: ActionHandlerEvent) {
    if (ev.detail.action !== "tap") {
      return;
    }
    fireEvent(this, "hass-toggle-menu");
  }

  static get styles() {
    return [
      ...super.styles,
      haStyleScrollbar,
      css`
        :host {
          overflow: visible;
          height: 100%;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          overscroll-behavior: contain;
          user-select: none;
          background-color: var(--sidebar-background-color);
          width: 100%;
          box-sizing: border-box;
          padding-bottom: var(--safe-area-inset-bottom, 0px);
        }
        .menu {
          height: calc(var(--header-height) + var(--safe-area-inset-top, 0px));
          box-sizing: border-box;
          display: flex;
          padding: 0 var(--ha-space-1);
          border-bottom: 1px solid transparent;
          white-space: nowrap;
          font-weight: var(--ha-font-weight-normal);
          color: var(
            --sidebar-menu-button-text-color,
            var(--primary-text-color)
          );
          background-color: var(
            --sidebar-menu-button-background-color,
            inherit
          );
          font-size: var(--ha-font-size-xl);
          align-items: center;
          overflow: hidden;
          width: calc(
            88px * var(--ha-font-size-scale, 1) +
              var(--safe-area-inset-left, 0px)
          );
          padding-left: calc(
            var(--ha-space-5) + var(--safe-area-inset-left, 0px)
          );
          padding-inline-start: calc(
            var(--ha-space-5) + var(--safe-area-inset-left, 0px)
          );
          padding-inline-end: initial;
          padding-top: var(--safe-area-inset-top, 0px);
          transition: width var(--ha-animation-duration-normal) ease;
        }
        :host([expanded]) .menu {
          width: calc(
            var(--ha-sidebar-expanded-width, 256px) +
              var(--safe-area-inset-left, 0px)
          );
        }
        :host([narrow][expanded]) .menu {
          width: 100%;
        }
        .menu ha-icon-button {
          color: var(--sidebar-icon-color);
        }
        .assist {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-3);
          flex: none;
          box-sizing: border-box;
          width: 56px;
          height: 56px;
          margin: var(--ha-space-2) auto var(--ha-space-3);
          padding: 0;
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }
        .assist-text {
          display: none;
        }
        :host([expanded]) .assist {
          width: calc(100% - 2 * var(--ha-space-4));
          margin-inline: var(--ha-space-4);
          justify-content: flex-start;
          padding: 0 var(--ha-space-5);
        }
        :host([expanded]) .assist-text {
          display: inline;
        }
        .assist:focus-visible {
          outline: 3px solid var(--primary-text-color);
          outline-offset: 2px;
        }
        .title {
          margin-left: 3px;
          margin-inline-start: 3px;
          margin-inline-end: initial;
          flex: 1;
          min-width: 0;
          max-width: 0;
          opacity: 0;
          transition:
            max-width var(--ha-animation-duration-normal) ease,
            opacity var(--ha-animation-duration-normal) ease;
        }
        :host([narrow]) .title {
          margin: 0;
          padding: 0 var(--ha-space-4);
        }
        :host([expanded]) .title {
          max-width: 100%;
          opacity: 1;
          transition-delay: 0ms, 80ms;
        }

        .panels-list {
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }

        ha-fade-in {
          padding: var(--ha-space-1) 0;
          box-sizing: border-box;
          display: flex;
          justify-content: center;
          align-items: center;
          min-height: 0;
          flex: 1;
        }

        ha-list-nav {
          overflow-x: hidden;
          margin-left: var(--safe-area-inset-left, 0px);
          margin-block: var(--ha-space-2);
        }

        .wrapper {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 0;
          flex: 1;
        }
        ha-list-nav.before-spacer {
          padding-bottom: 0;
        }
        ha-list-nav.after-spacer {
          padding-top: 0;
          min-height: fit-content;
        }

        ha-list-item-button {
          flex-shrink: 0;
          margin: 0 var(--ha-space-2) var(--ha-space-1);
          border-radius: var(--ha-border-radius-xl);
          --ha-list-item-focus-radius: var(--ha-border-radius-xl);
          --ha-row-item-min-height: var(--ha-space-14);
          --ha-row-item-padding-block: var(--ha-space-1);
          --ha-row-item-padding-inline: 0;
          --ha-row-item-gap: var(--ha-space-1);
          width: var(--ha-space-18);
          position: relative;
          transition: width var(--ha-animation-duration-normal) ease;
        }
        :host(:not([expanded])) ha-list-item-button {
          margin-inline: var(--ha-space-1);
          width: calc(var(--ha-space-20) * var(--ha-font-size-scale, 1));
        }
        /* Collapsed: a navigation rail. The icon sits in a pill that shows
           the selection, with the label under it. */
        ha-list-item-button::part(base) {
          flex-direction: column;
          justify-content: center;
        }
        ha-list-item-button::part(start) {
          width: var(--ha-space-14);
          height: var(--ha-space-8);
          justify-content: center;
          border-radius: var(--ha-border-radius-xl);
          position: relative;
          transition: background-color var(--ha-animation-duration-fast) ease;
        }
        ha-list-item-button::part(content) {
          flex: none;
          width: 100%;
        }
        ha-list-item-button.selected::part(start) {
          background-color: var(--ha-color-fill-primary-normal-resting);
        }
        /* Expanded: full-width rows with a pill selection. */
        :host([expanded]) ha-list-item-button {
          border-radius: var(--ha-border-radius-pill);
          --ha-list-item-focus-radius: var(--ha-border-radius-pill);
          /* 48 px rows: still a full touch target, and the whole menu fits a
             phone screen without scrolling. The collapsed rail keeps 56 px. */
          --ha-row-item-min-height: var(--ha-space-12);
          --ha-row-item-padding-block: 0;
          --ha-row-item-padding-inline: var(--ha-space-2) var(--ha-space-4);
          --ha-row-item-gap: var(--ha-space-2);
        }
        :host([expanded]) ha-list-item-button::part(base) {
          flex-direction: row;
        }
        :host([expanded]) ha-list-item-button::part(content) {
          flex: 1 1 auto;
          width: auto;
        }
        :host([expanded]) ha-list-item-button.selected::part(start) {
          background-color: transparent;
        }
        ha-list-item-button::part(headline) {
          color: var(--sidebar-text-color);
        }
        :host([expanded]) ha-list-item-button {
          width: var(--ha-sidebar-expanded-item-width, 248px);
        }
        :host([narrow][expanded]) ha-list-item-button {
          width: calc(240px - var(--safe-area-inset-left, 0px));
        }

        ha-list-item-button.selected::part(headline) {
          color: var(--sidebar-selected-icon-color);
        }
        :host([expanded]) ha-list-item-button.selected::before {
          border-radius: var(--ha-border-radius-pill);
          position: absolute;
          top: 0;
          right: 0;
          bottom: 0;
          left: 0;
          pointer-events: none;
          content: "";
          background-color: var(--ha-color-fill-primary-normal-resting);
          z-index: -1;
        }

        ha-icon[slot="start"],
        ha-svg-icon[slot="start"] {
          width: var(--ha-space-6);
          flex-shrink: 0;
          color: var(--sidebar-icon-color);
        }

        ha-list-item-button.selected ha-svg-icon[slot="start"],
        ha-list-item-button.selected ha-icon[slot="start"] {
          color: var(--sidebar-selected-icon-color);
        }

        ha-list-item-button .item-text {
          display: block;
          max-width: 100%;
          overflow: hidden;
          white-space: nowrap;
          text-overflow: ellipsis;
          text-align: center;
          font-size: var(--ha-font-size-s);
          line-height: var(--ha-line-height-condensed);
          font-weight: var(--ha-font-weight-medium);
          padding: 0 var(--ha-space-1);
        }
        ha-list-item-button .item-full,
        :host([expanded]) ha-list-item-button .item-short {
          display: none;
        }
        :host([expanded]) ha-list-item-button .item-full {
          display: block;
        }
        :host([expanded]) ha-list-item-button .item-text {
          text-align: start;
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-normal);
          padding: 0;
        }

        .badge {
          display: flex;
          justify-content: center;
          align-items: center;
          min-width: var(--ha-space-2);
          border-radius: var(--ha-border-radius-xl);
          font-weight: var(--ha-font-weight-normal);
          line-height: normal;
          background-color: var(--accent-color);
          padding: 2px 6px;
          color: var(--text-accent-color, var(--text-primary-color));
          transition:
            opacity var(--ha-animation-duration-normal) ease,
            transform var(--ha-animation-duration-normal) ease;
        }

        ha-svg-icon + .badge {
          position: absolute;
          top: calc(-1 * var(--ha-space-1));
          left: 30px;
          border-radius: var(--ha-border-radius-md);
          font-size: 0.65em;
          line-height: var(--ha-line-height-expanded);
          padding: 0 var(--ha-space-1);
        }
        :host([expanded]) .badge[slot="start"],
        :host(:not([expanded])) .badge[slot="end"] {
          opacity: 0;
          transform: scale(0.8);
          pointer-events: none;
        }

        /* Keep the rounded-square avatar clear of the row edges and
           centered in the collapsed item: 8px + 32px + 8px = 48px */
        ha-user-badge {
          width: var(--ha-space-8);
          height: var(--ha-space-8);
          flex-shrink: 0;
        }

        :host([expanded]) ha-list-item-button.user {
          --ha-row-item-padding-inline: var(--ha-space-3) var(--ha-space-4);
        }

        .spacer {
          margin-top: auto;
          pointer-events: none;
        }

        .provenance {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 2px;
          padding: var(--ha-space-1) var(--ha-space-1) var(--ha-space-2);
          margin-left: var(--safe-area-inset-left, 0px);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-xs);
          line-height: var(--ha-line-height-condensed);
          text-align: center;
          user-select: text;
        }
        .provenance span {
          max-width: 100%;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .provenance .version {
          font-weight: var(--ha-font-weight-medium);
          color: var(--primary-text-color);
        }

        .menu ha-icon-button {
          transform: scaleX(var(--scale-direction));
        }

        @media (prefers-reduced-motion: reduce) {
          .menu,
          ha-list-item-button,
          ha-list-item-button .item-text,
          .title {
            transition: 1ms;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-sidebar": HaSidebar;
  }
}
