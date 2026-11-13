import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { listenMediaQuery } from "../../common/dom/media_query";
import type { CloudStatus } from "../../data/cloud";
import { fetchCloudStatus, subscribeCloudEvents } from "../../data/cloud";
import {
  entityRegistryByEntityId,
  entityRegistryById,
} from "../../data/entity/entity_registry";
import type { RouterOptions } from "../../layouts/hass-router-page";
import { HassRouterPage } from "../../layouts/hass-router-page";
import { setPageSectionResolver } from "../../layouts/hass-tabs-subpage";
import type { HomeAssistant, Route } from "../../types";
import { sectionTitleKey } from "./config-sections";

// Pages under Settings show their section in the breadcrumb.
setPageSectionResolver(sectionTitleKey);

declare global {
  // for fire event
  interface HASSDomEvents {
    "ha-refresh-cloud-status": undefined;
  }

  interface GlobalEventHandlersEventMap {
    "ha-refresh-cloud-status": HASSDomEvent<
      HASSDomEvents["ha-refresh-cloud-status"]
    >;
  }
}

@customElement("ha-panel-config")
class HaPanelConfig extends HassRouterPage {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  protected routerOptions: RouterOptions = {
    defaultPage: "dashboard",
    routes: {
      areas: {
        tag: "ha-config-areas",
        load: () => import("./areas/ha-config-areas"),
      },
      "voice-assistants": {
        tag: "ha-config-voice-assistants",
        load: () => import("./voice-assistants/ha-config-voice-assistants"),
      },
      automation: {
        tag: "ha-config-automation",
        load: () => import("./automation/ha-config-automation"),
      },
      automation_history: {
        tag: "ha-config-automation-history",
        load: () => import("./automation-history/ha-config-automation-history"),
      },
      dashboard_history: {
        tag: "ha-config-dashboard-history",
        load: () => import("./dashboard-history/ha-config-dashboard-history"),
      },
      "activity-record": {
        tag: "ha-config-activity-record",
        load: () => import("./activity-record/ha-config-activity-record"),
      },
      backup: {
        tag: "ha-config-backup",
        load: () => import("./backup/ha-config-backup"),
      },
      blueprint: {
        tag: "ha-config-blueprint",
        load: () => import("./blueprint/ha-config-blueprint"),
      },
      tags: {
        tag: "ha-config-tags",
        load: () => import("./tags/ha-config-tags"),
      },
      connectivity: {
        tag: "ha-config-connectivity",
        load: () => import("./connectivity/ha-config-connectivity"),
        waitForReady: true,
      },
      devices: {
        tag: "ha-config-devices",
        load: () => import("./devices/ha-config-devices"),
      },
      system: {
        tag: "ha-config-system-navigation",
        load: () => import("./core/ha-config-system-navigation"),
      },
      tools: {
        tag: "ha-panel-tools",
        load: () => import("./tools/ha-panel-tools"),
        cache: true,
      },
      logs: {
        tag: "ha-config-logs",
        load: () => import("./logs/ha-config-logs"),
      },
      info: {
        tag: "ha-config-info",
        load: () => import("./info/ha-config-info"),
        waitForReady: true,
      },
      // The older What changed page was merged into the release notes.
      changelog: "release-notes",
      identity: {
        tag: "ha-config-identity",
        load: () => import("./identity/ha-config-identity"),
      },
      extensions: {
        tag: "ha-config-extensions",
        load: () => import("./extensions/ha-config-extensions"),
      },
      help: {
        tag: "ha-config-help",
        load: () => import("./help/ha-config-help"),
      },
      support: {
        tag: "ha-config-support",
        load: () => import("./support/ha-config-support"),
      },
      "release-notes": {
        tag: "ha-config-release-notes",
        load: () => import("./release-notes/ha-config-release-notes"),
      },
      notifications: {
        tag: "ha-config-notifications",
        load: () => import("./notifications/ha-config-notifications"),
      },
      // customize was removed in 2021.12, fallback to dashboard
      customize: "dashboard",
      dashboard: {
        tag: "ha-config-dashboard",
        load: () => import("./dashboard/ha-config-dashboard"),
        waitForReady: true,
      },
      entities: {
        tag: "ha-config-entities",
        load: () => import("./entities/ha-config-entities"),
      },
      energy: {
        tag: "ha-config-energy",
        load: () => import("./energy/ha-config-energy"),
      },
      "problem-log": {
        tag: "ha-config-problem-log",
        load: () => import("./problem-log/ha-config-problem-log"),
      },
      "google-setup": {
        tag: "ha-config-google-setup",
        load: () => import("./google-setup/ha-config-google-setup"),
      },
      "guided-setup": {
        tag: "ha-config-guided-setup",
        load: () => import("./guided-setup/ha-config-guided-setup"),
      },
      ollama: {
        tag: "ha-config-ollama",
        load: () => import("./ollama/ha-config-ollama"),
      },
      minecraft: {
        tag: "ha-config-minecraft",
        load: () => import("./minecraft/ha-config-minecraft"),
      },
      hardware: {
        tag: "ha-config-hardware",
        load: () => import("./hardware/ha-config-hardware"),
      },
      integrations: {
        tag: "ha-config-integrations",
        load: () => import("./integrations/ha-config-integrations"),
        waitForReady: true,
      },
      labels: {
        tag: "ha-config-labels",
        load: () => import("./labels/ha-config-labels"),
      },
      lovelace: {
        tag: "ha-config-lovelace",
        load: () => import("./lovelace/ha-config-lovelace"),
      },
      network: {
        tag: "ha-config-section-network",
        load: () => import("./network/ha-config-section-network"),
      },
      person: {
        tag: "ha-config-person",
        load: () => import("./person/ha-config-person"),
      },
      script: {
        tag: "ha-config-script",
        load: () => import("./script/ha-config-script"),
      },
      scene: {
        tag: "ha-config-scene",
        load: () => import("./scene/ha-config-scene"),
      },
      helpers: {
        tag: "ha-config-helpers",
        load: () => import("./helpers/ha-config-helpers"),
      },
      performance: {
        tag: "ha-config-section-performance",
        load: () => import("./performance/ha-config-section-performance"),
      },
      storage: {
        tag: "ha-config-section-storage",
        load: () => import("./storage/ha-config-section-storage"),
        waitForReady: true,
      },
      updates: {
        tag: "ha-config-section-updates",
        load: () => import("./core/ha-config-section-updates"),
      },
      "radio-frequency": {
        tag: "radio-frequency-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/radio_frequency/radio-frequency-config-dashboard-router"),
      },
      repairs: {
        tag: "ha-config-repairs-dashboard",
        load: () => import("./repairs/ha-config-repairs-dashboard"),
      },
      users: {
        tag: "ha-config-users",
        load: () => import("./users/ha-config-users"),
      },
      roles: {
        tag: "ha-config-roles",
        load: () => import("./roles/ha-config-roles"),
      },
      zone: {
        tag: "ha-config-zone",
        load: () => import("./zone/ha-config-zone"),
      },
      general: {
        tag: "ha-config-section-general",
        load: () => import("./core/ha-config-section-general"),
      },
      personal: {
        tag: "ha-config-section-personal",
        load: () => import("./personal/ha-config-section-personal"),
      },
      "personal-sidebar": {
        tag: "ha-config-section-sidebar",
        load: () => import("./personal/ha-config-section-sidebar"),
      },
      "personal-links": {
        tag: "ha-config-section-links",
        load: () => import("./personal/ha-config-section-links"),
      },
      "personal-motion": {
        tag: "ha-config-section-motion",
        load: () => import("./personal/ha-config-section-motion"),
      },
      labs: {
        tag: "ha-config-labs",
        load: () => import("./labs/ha-config-labs"),
      },
      ai: {
        tag: "ha-config-section-ai",
        load: () => import("./core/ha-config-section-ai"),
      },
      "entity-id-format": {
        tag: "ha-config-section-entity-id-format",
        load: () => import("./core/ha-config-section-entity-id-format"),
      },
      zha: {
        tag: "zha-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/zha/zha-config-dashboard-router"),
      },
      lorawan: {
        tag: "lorawan-router",
        load: () =>
          import("./integrations/integration-panels/lorawan/lorawan-router"),
      },
      mqtt: {
        tag: "mqtt-config-panel",
        load: () =>
          import("./integrations/integration-panels/mqtt/mqtt-config-panel"),
      },
      zwave_js: {
        tag: "zwave_js-config-router",
        load: () =>
          import("./integrations/integration-panels/zwave_js/zwave_js-config-router"),
      },
      matter: {
        tag: "matter-config-panel",
        load: () =>
          import("./integrations/integration-panels/matter/matter-config-panel"),
      },
      thread: {
        tag: "thread-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/thread/thread-config-dashboard-router"),
      },
      bluetooth: {
        tag: "bluetooth-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/bluetooth/bluetooth-config-dashboard-router"),
      },
      infrared: {
        tag: "infrared-config-dashboard-router",
        load: () =>
          import("./integrations/integration-panels/infrared/infrared-config-dashboard-router"),
      },
      serial: {
        tag: "serial-config-dashboard",
        load: () =>
          import("./integrations/integration-panels/serial/serial-config-dashboard"),
        waitForReady: true,
      },
      modbus: {
        tag: "modbus-config-dashboard",
        load: () =>
          import("./integrations/integration-panels/modbus/modbus-config-dashboard"),
        waitForReady: true,
      },
      discovery: {
        tag: "discovery-config-panel",
        load: () =>
          import("./integrations/integration-panels/discovery-config-panel"),
      },
      dhcp: {
        tag: "dhcp-config-panel",
        load: () =>
          import("./integrations/integration-panels/dhcp/dhcp-config-panel"),
      },
      ssdp: {
        tag: "ssdp-config-panel",
        load: () =>
          import("./integrations/integration-panels/ssdp/ssdp-config-panel"),
      },
      zeroconf: {
        tag: "zeroconf-config-panel",
        load: () =>
          import("./integrations/integration-panels/zeroconf/zeroconf-config-panel"),
      },
      application_credentials: {
        tag: "ha-config-application-credentials",
        load: () =>
          import("./application_credentials/ha-config-application-credentials"),
      },
      apps: {
        tag: "ha-config-apps",
        load: () => import("./apps/ha-config-apps"),
      },
      app: {
        tag: "ha-config-app-dashboard",
        load: () => import("./apps/ha-config-app-dashboard"),
      },
    },
  };

  @state() private _wideSidebar = false;

  @state() private _wide = false;

  @state() private _cloudStatus?: CloudStatus;

  private _listeners: (() => void)[] = [];

  private _unsubCloudEvents?: Promise<UnsubscribeFunc>;

  private _cloudStatusRequestId = 0;

  private _cloudStatusTimeout?: number;

  public connectedCallback() {
    super.connectedCallback();
    this._listeners.push(
      listenMediaQuery("(min-width: 1040px)", (matches) => {
        this._wide = matches;
      })
    );
    this._listeners.push(
      listenMediaQuery("(min-width: 1296px)", (matches) => {
        this._wideSidebar = matches;
      })
    );
    this._listenOnWindow("ha-refresh-cloud-status", () => {
      if (this._cloudLoaded()) {
        this._updateCloudStatus();
      }
    });
    this._listenOnWindow("connection-status", (ev) => {
      if (ev.detail === "connected" && this._cloudLoaded()) {
        this._updateCloudStatus();
        this._subscribeCloudEvents();
      }
    });

    if (this._cloudLoaded()) {
      this._subscribeCloudEvents();
      this._updateCloudStatus();
    }
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    while (this._listeners.length) {
      this._listeners.pop()!();
    }
    this._unsubCloudEvents?.then((unsub) => unsub()).catch(() => undefined);
    this._unsubCloudEvents = undefined;
    this._clearCloudStatusTimeout();
    entityRegistryByEntityId.clear();
    entityRegistryById.clear();
  }

  private _cloudLoaded(): boolean {
    return !!this.hass && isComponentLoaded(this.hass.config, "cloud");
  }

  private _listenOnWindow<EventName extends keyof GlobalEventHandlersEventMap>(
    type: EventName,
    listener: (ev: GlobalEventHandlersEventMap[EventName]) => void
  ) {
    window.addEventListener(type, listener);
    this._listeners.push(() => window.removeEventListener(type, listener));
  }

  private _subscribeCloudEvents() {
    if (this._unsubCloudEvents || !this._cloudLoaded()) {
      return;
    }

    const subscription = subscribeCloudEvents(this.hass, () => {
      this._updateCloudStatus();
    });
    this._unsubCloudEvents = subscription;

    subscription.catch(() => {
      if (this._unsubCloudEvents === subscription) {
        this._unsubCloudEvents = undefined;
      }
    });
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
    this.hass.loadBackendTranslation("services");
    this.style.setProperty(
      "--app-header-background-color",
      "var(--sidebar-background-color)"
    );
    this.style.setProperty(
      "--app-header-text-color",
      "var(--sidebar-text-color)"
    );
    this.style.setProperty(
      "--app-header-border-bottom",
      "1px solid var(--divider-color)"
    );
  }

  protected updatePageEl(el) {
    const isWide =
      this.hass.dockedSidebar === "docked" ? this._wideSidebar : this._wide;

    el.route = this.routeTail;
    el.hass = this.hass;
    el.isWide = isWide;
    el.narrow = this.narrow;
    el.cloudStatus = this._cloudStatus;
  }

  private async _updateCloudStatus() {
    this._clearCloudStatusTimeout();
    const requestId = ++this._cloudStatusRequestId;
    const status = await fetchCloudStatus(this.hass.callWS);

    if (requestId !== this._cloudStatusRequestId || !this.isConnected) {
      return;
    }
    this._cloudStatus = status;

    if (
      // Relayer connecting
      this._cloudStatus.cloud === "connecting" ||
      // Remote connecting
      (this._cloudStatus.logged_in &&
        this._cloudStatus.prefs.remote_enabled &&
        !this._cloudStatus.remote_connected)
    ) {
      this._cloudStatusTimeout = window.setTimeout(
        () => this._updateCloudStatus(),
        5000
      );
    }
  }

  private _clearCloudStatusTimeout() {
    clearTimeout(this._cloudStatusTimeout);
    this._cloudStatusTimeout = undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-config": HaPanelConfig;
  }
}
