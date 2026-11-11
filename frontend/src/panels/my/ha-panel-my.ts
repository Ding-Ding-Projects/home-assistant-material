import { mdiLinkVariant } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import {
  protocolIntegrationPicked,
  PROTOCOL_INTEGRATIONS,
} from "../../common/integrations/protocolIntegrationPicked";
import { navigate } from "../../common/navigate";
import { extractSearchParamsObject } from "../../common/url/search-params";
import "../../components/ha-button";
import type { HaButton } from "../../components/ha-button";
import "../../components/ha-svg-icon";
import { domainToName } from "../../data/integration";
import "../../layouts/hass-error-screen";
import type { HomeAssistant, Route } from "../../types";
import { documentationUrl } from "../../util/documentation-url";
import type { MyRedirectPlan } from "./my-redirect-plan";
import { lookupMyRedirect, planMyRedirect } from "./my-redirect-plan";

// When a user presses "m", the user is redirected to the first redirect
// for which holds true currentPath.startsWith(redirect.redirect)
// That's why redirects should be sorted with more specific ones first
// Or else pressing "M" will link to the higher level page.

// The users table reads these from the link
const usersTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The Bluetooth monitor tables read these from the link
const bluetoothTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The DHCP, SSDP and Zeroconf discovery tables read these from the link
const discoveryTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The Marketplace tabs with a table read these from the link
const marketplaceTableParams = {
  search: "string?",
  type: "string?",
  status: "string?",
  source: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The labels table reads these from the link
const labelsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
} satisfies Redirect["params"];

// The helpers table reads these from the link
const helpersTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  floor: "string?",
  area: "string?",
  device: "string?",
  label: "string?",
  category: "string?",
  assistants: "string?",
} satisfies Redirect["params"];

// The LoRaWAN devices table reads these from the link
const lorawanDevicesParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  connection: "string?",
} satisfies Redirect["params"];

// The scenes table reads these from the link
const scenesTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  floor: "string?",
  area: "string?",
  device: "string?",
  entity: "string?",
  label: "string?",
  category: "string?",
  assistants: "string?",
} satisfies Redirect["params"];

// The scripts table reads these from the link
const scriptsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  floor: "string?",
  area: "string?",
  device: "string?",
  entity: "string?",
  label: "string?",
  category: "string?",
  assistants: "string?",
  blueprint: "string?",
} satisfies Redirect["params"];

// The blueprints table reads these from the link
const blueprintsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The tags table reads these from the link
const tagsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
} satisfies Redirect["params"];

// The statistics table reads these from the link
const statisticsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The application credentials table reads these from the link
const applicationCredentialsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
} satisfies Redirect["params"];

// The devices table reads these from the link
const devicesTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  status: "string?",
  floor: "string?",
  area: "string?",
  domain: "string?",
  label: "string?",
  config_entry: "string?",
  sub_entry: "string?",
} satisfies Redirect["params"];

// The entities table reads these from the link
const entitiesTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  status: "string?",
  floor: "string?",
  area: "string?",
  device: "string?",
  domain: "string?",
  entity_domain: "string?",
  label: "string?",
  assistants: "string?",
  config_entry: "string?",
  sub_entry: "string?",
} satisfies Redirect["params"];

// The automations table reads these from the link
const automationsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  floor: "string?",
  area: "string?",
  device: "string?",
  entity: "string?",
  label: "string?",
  category: "string?",
  assistants: "string?",
  blueprint: "string?",
} satisfies Redirect["params"];

export const getMyRedirects = (): Redirects => ({
  application_credentials: {
    redirect: "/config/application_credentials",
    params: applicationCredentialsTableParams,
  },
  tools_assist: {
    redirect: "/config/tools/assist",
  },
  tools_debug: {
    redirect: "/config/tools/debug",
  },
  tools_states: {
    redirect: "/config/tools/state",
  },
  tools_actions: {
    redirect: "/config/tools/action",
  },
  tools_perform_action: {
    redirect: "/config/tools/action",
    params: {
      service: "string",
    },
  },
  tools_template: {
    redirect: "/config/tools/template",
  },
  tools_events: {
    redirect: "/config/tools/event",
  },
  tools_statistics: {
    redirect: "/config/tools/statistics",
    params: statisticsTableParams,
  },
  tools_yaml: {
    redirect: "/config/tools/yaml",
  },
  developer_assist: {
    redirect: "/config/tools/assist",
  },
  developer_debug: {
    redirect: "/config/tools/debug",
  },
  developer_states: {
    redirect: "/config/tools/state",
  },
  developer_services: {
    redirect: "/config/tools/action",
  },
  developer_call_service: {
    redirect: "/config/tools/action",
    params: {
      service: "string",
    },
  },
  developer_template: {
    redirect: "/config/tools/template",
  },
  developer_events: {
    redirect: "/config/tools/event",
  },
  developer_statistics: {
    redirect: "/config/tools/statistics",
  },
  server_controls: {
    redirect: "/config/tools/yaml",
  },
  calendar: {
    component: "calendar",
    redirect: "/calendar",
  },
  companion_app: {
    redirect: "#external-app-configuration",
  },
  config: {
    redirect: "/config/dashboard",
  },
  cloud: {
    component: "cloud",
    redirect: "/config/cloud",
  },
  config_flow_start: {
    redirect: "/config/integrations/dashboard/add",
    params: {
      domain: "string",
    },
  },
  brand: {
    redirect: "/config/integrations/dashboard/add",
    params: {
      brand: "string",
    },
  },
  integration: {
    redirect: "/config/integrations/integration",
    params: {
      domain: "string",
      search: "string?",
    },
  },
  integrations: {
    redirect: "/config/integrations/dashboard",
    params: {
      search: "string?",
      status: "string?",
    },
  },
  config_mqtt: {
    component: "mqtt",
    redirect: "/config/mqtt",
  },
  config_zha: {
    component: "zha",
    redirect: "/config/zha/dashboard",
  },
  config_zwave_js: {
    component: "zwave_js",
    redirect: "/config/zwave_js/dashboard",
  },
  config_matter: {
    component: "matter",
    redirect: "/config/matter/dashboard",
  },
  config_thread: {
    component: "thread",
    redirect: "/config/thread",
  },
  config_lorawan: {
    component: "lorawan",
    redirect: "/config/lorawan/overview",
  },
  lorawan_devices: {
    component: "lorawan",
    redirect: "/config/lorawan/devices",
    params: lorawanDevicesParams,
  },
  add_zigbee_device: {
    component: "zha",
    redirect: "/config/zha/add",
  },
  add_zwave_device: {
    component: "zwave_js",
    redirect: "/config/zwave_js/add",
  },
  add_matter_device: {
    component: "matter",
    redirect: "/config/matter/add",
  },
  bluetooth_advertisement_monitor: {
    component: "bluetooth",
    redirect: "/config/bluetooth/advertisement-monitor",
    params: bluetoothTableParams,
  },
  bluetooth_connection_monitor: {
    component: "bluetooth",
    redirect: "/config/bluetooth/connection-monitor",
    params: bluetoothTableParams,
  },
  bluetooth_visualization: {
    component: "bluetooth",
    redirect: "/config/bluetooth/visualization",
  },
  config_ai: {
    redirect: "/config/ai",
  },
  config_ai_task: {
    redirect: "/config/ai",
  },
  config_bluetooth: {
    component: "bluetooth",
    redirect: "/config/bluetooth",
  },
  config_connectivity: {
    redirect: "/config/connectivity",
  },
  config_dhcp: {
    component: "dhcp",
    redirect: "/config/dhcp",
    params: discoveryTableParams,
  },
  config_energy: {
    component: "energy",
    redirect: "/config/energy",
  },
  config_infrared: {
    redirect: "/config/infrared",
  },
  config_modbus: {
    component: "modbus",
    redirect: "/config/modbus",
  },
  config_radiofrequency: {
    component: "radio_frequency",
    redirect: "/config/radio-frequency",
  },
  config_serial: {
    component: "usb",
    redirect: "/config/serial",
  },
  config_ssdp: {
    component: "ssdp",
    redirect: "/config/ssdp",
    params: discoveryTableParams,
  },
  config_zeroconf: {
    component: "zeroconf",
    redirect: "/config/zeroconf",
    params: discoveryTableParams,
  },
  devices: {
    redirect: "/config/devices/dashboard",
    params: devicesTableParams,
  },
  entities: {
    redirect: "/config/entities",
    params: entitiesTableParams,
  },
  labels: {
    redirect: "/config/labels",
    params: labelsTableParams,
  },
  energy: {
    component: "energy",
    redirect: "/energy",
  },
  areas: {
    redirect: "/config/areas/dashboard",
  },
  blueprint_import: {
    component: "blueprint",
    redirect: "/config/blueprint/dashboard/import",
    params: {
      blueprint_url: "url",
    },
  },
  blueprints: {
    component: "blueprint",
    redirect: "/config/blueprint/dashboard",
    params: blueprintsTableParams,
  },
  automations: {
    component: "automation",
    redirect: "/config/automation/dashboard",
    params: automationsTableParams,
  },
  scenes: {
    component: "scene",
    redirect: "/config/scene/dashboard",
    params: scenesTableParams,
  },
  scripts: {
    component: "script",
    redirect: "/config/script/dashboard",
    params: scriptsTableParams,
  },
  helpers: {
    redirect: "/config/helpers",
    params: helpersTableParams,
  },
  labs: {
    redirect: "/config/labs",
    params: {
      domain: "string?",
      preview_feature: "string?",
    },
  },
  tags: {
    component: "tag",
    redirect: "/config/tags",
    params: tagsTableParams,
  },
  voice_assistants: {
    redirect: "/config/voice-assistants",
  },
  lovelace_dashboards: {
    component: "lovelace",
    redirect: "/config/lovelace/dashboards",
    params: dashboardsTableParams,
  },
  lovelace_resources: {
    component: "lovelace",
    redirect: "/config/lovelace/resources",
    params: dashboardResourcesTableParams,
  },
  oauth: {
    redirect: "/auth/external/callback",
    navigate_outside_spa: true,
    params: {
      error: "string?",
      code: "string?",
      state: "string",
    },
  },
  people: {
    component: "person",
    redirect: "/config/person",
  },
  zones: {
    component: "zone",
    redirect: "/config/zone",
  },
  users: {
    redirect: "/config/users",
    params: usersTableParams,
  },
  general: {
    redirect: "/config/general",
  },
  logs: {
    redirect: "/config/logs",
    params: {
      provider: "string?",
      search: "string?",
      integration: "string?",
      raw: "string?",
    },
  },
  repairs: {
    component: "repairs",
    redirect: "/config/repairs",
  },
  info: {
    redirect: "/config/info",
  },
  system_health: {
    redirect: "/config/repairs?dialog=system-health",
  },
  hardware: {
    redirect: "/config/hardware",
  },
  storage: {
    redirect: "/config/storage",
  },
  network: {
    redirect: "/config/network",
  },
  updates: {
    redirect: "/config/updates",
  },
  system_dashboard: {
    redirect: "/config/system",
  },
  customize: {
    // customize was removed in 2021.12, fallback to dashboard
    redirect: "/config/dashboard",
  },
  profile_security: {
    redirect: "/profile/security",
  },
  profile_preferences: {
    redirect: "/profile/preferences",
  },
  profile_localization: {
    redirect: "/profile/localization",
  },
  profile_browser: {
    redirect: "/profile/browser",
  },
  profile: {
    redirect: "/profile",
  },
  logbook: {
    component: "logbook",
    redirect: "/logbook",
  },
  history: {
    component: "history",
    redirect: "/history",
  },
  maintenance: {
    redirect: "/maintenance",
  },
  overview: {
    redirect: "/home/overview",
  },
  climate: {
    redirect: "/climate",
  },
  lights: {
    redirect: "/light",
  },
  security: {
    redirect: "/security",
  },
  media_browser: {
    component: "media_source",
    redirect: "/media-browser",
  },
  backup_list: {
    component: "backup",
    redirect: "/config/backup/backups",
    params: backupsTableParams,
  },
  backup_config: {
    component: "backup",
    redirect: "/config/backup/settings",
  },
  backup: {
    component: "backup",
    redirect: "/config/backup",
  },
  supervisor_snapshots: {
    component: "backup",
    redirect: "/config/backup",
  },
  supervisor_backups: {
    component: "backup",
    redirect: "/config/backup",
  },
  supervisor_system: {
    // Moved from Supervisor panel in 2022.5
    redirect: "/config/system",
  },
  supervisor_logs: {
    // Moved from Supervisor panel in 2022.5
    redirect: "/config/logs?provider=supervisor",
  },
  supervisor_info: {
    // Moved from Supervisor panel in 2022.5
    redirect: "/config/info",
  },
  supervisor_store: {
    component: "hassio",
    redirect: "/config/apps/available",
  },
  supervisor_apps: {
    component: "hassio",
    redirect: "/config/apps",
  },
  supervisor_addons: {
    component: "hassio",
    redirect: "/config/apps",
  },
  supervisor: {
    // Supervisor panel was removed in 2026.2, fallback to apps
    component: "hassio",
    redirect: "/config/apps",
  },
  supervisor_app: {
    component: "hassio",
    redirect: "/config/app",
    params: {
      app: "string",
    },
    optional_params: {
      repository_url: "url",
    },
  },
  supervisor_addon: {
    component: "hassio",
    redirect: "/config/app",
    params: {
      addon: "string",
    },
    optional_params: {
      repository_url: "url",
    },
  },
  supervisor_add_addon_repository: {
    component: "hassio",
    redirect: "/config/apps/available",
    params: {
      repository_url: "url",
    },
  },
  hacs_repository: {
    component: "marketplace",
    redirect: "/marketplace/_my_redirect/hacs_repository",
    params: {
      owner: "string",
      repository: "string",
      category: "string?",
    },
  },
  marketplace_repository: {
    component: "marketplace",
    redirect: "/marketplace/_my_redirect/marketplace_repository",
    params: {
      owner: "string",
      repository: "string",
      category: "string?",
    },
  },
  marketplace_discover: {
    component: "marketplace",
    redirect: "/marketplace/discover",
  },
  marketplace_browse: {
    component: "marketplace",
    redirect: "/marketplace/browse",
    params: marketplaceTableParams,
  },
  marketplace_installed: {
    component: "marketplace",
    redirect: "/marketplace/installed",
    params: marketplaceTableParams,
  },
  marketplace_repositories: {
    component: "marketplace",
    redirect: "/marketplace/repositories",
  },
});

// Only names in the list itself count; "constructor" and the like are
// inherited from every object and are not redirects.
const getRedirect = (path: string): Redirect | undefined =>
  lookupMyRedirect(getMyRedirects(), path);

// The backups table reads these from the link
const backupsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
  type: "string?",
  location: "string?",
} satisfies Redirect["params"];

export type ParamType = "url" | "string" | "string?";

export type Redirects = Record<string, Redirect>;
export interface Redirect {
  redirect: string;
  // Set to True to use browser redirect instead of frontend navigation
  navigate_outside_spa?: boolean;
  component?: string;
  params?: Record<string, ParamType>;
  optional_params?: Record<string, ParamType>;
}

// The dashboards table reads these from the link
const dashboardsTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
  group: "string?",
} satisfies Redirect["params"];

// The dashboard resources table reads these from the link
const dashboardResourcesTableParams = {
  search: "string?",
  sort: "string?",
  direction: "string?",
} satisfies Redirect["params"];

@customElement("ha-panel-my")
class HaPanelMy extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public route!: Route;

  @state() public _error?: string;

  @state() private _plan?: Extract<MyRedirectPlan, { type: "confirm" }>;

  @query("#cancel") private _cancelButton?: HaButton;

  private _redirect?: Redirect;

  connectedCallback() {
    super.connectedCallback();
    const path = this.route.path.substring(
      1,
      this.route.path.endsWith("/") ? this.route.path.length - 1 : undefined
    );

    this._redirect = getRedirect(path);

    const component = this._redirect?.component;
    const componentLoaded =
      !component || isComponentLoaded(this.hass.config, component);

    if (component) {
      // Only needed to show the destination's name on the card; a failure
      // leaves the card with the plain name and must not surface as an error.
      this.hass
        .loadBackendTranslation("title", component)
        .then(() => {
          this.requestUpdate();
        })
        .catch(() => undefined);
    }

    const plan = planMyRedirect(this._redirect, {
      params: extractSearchParamsObject(),
      hasExternalSettingsScreen:
        !!this.hass.auth.external?.config.hasSettingsScreen,
      componentLoaded,
      isProtocolIntegration:
        !!component &&
        (PROTOCOL_INTEGRATIONS as readonly string[]).includes(component),
    });

    if (plan.type === "error") {
      this._error = plan.error;
      return;
    }

    // Nothing is performed until the person chooses.
    this._plan = plan;
  }

  protected firstUpdated() {
    this._cancelButton?.focus();
  }

  protected updated(changedProps: PropertyValues) {
    if (changedProps.has("_plan") && this._plan) {
      this._cancelButton?.focus();
    }
  }

  private _handleKeydown(ev: KeyboardEvent) {
    if (ev.key === "Escape") {
      ev.preventDefault();
      this._cancel();
    }
  }

  private _cancel() {
    this._plan = undefined;
    navigate("/", { replace: true });
  }

  private _open() {
    const plan = this._plan;
    if (!plan) {
      return;
    }
    this._plan = undefined;

    if (plan.action === "external_app") {
      this.hass.auth.external!.fireMessage({ type: "config_screen/show" });
      return;
    }

    if (plan.action === "protocol_picker") {
      const component = plan.component!;
      this._error = plan.errorAfter;
      const params = extractSearchParamsObject();
      this.hass
        .loadFragmentTranslation("config")
        .then()
        .then(() => {
          protocolIntegrationPicked(this, this.hass, component, {
            domain: params.domain,
            brand: params.brand,
          });
        });
      return;
    }

    if (plan.navigateOutsideSpa) {
      location.assign(plan.url!);
    } else {
      navigate(plan.url!, { replace: true });
    }
  }

  private _destinationName(plan: MyRedirectPlan & { type: "confirm" }) {
    if (plan.action === "external_app") {
      return this.hass.localize("ui.panel.my.external_app_name");
    }
    if (plan.component) {
      return domainToName(this.hass.localize, plan.component);
    }
    return plan.path;
  }

  private _renderConfirm(plan: Extract<MyRedirectPlan, { type: "confirm" }>) {
    const destination = this._destinationName(plan);
    return html`
      <div class="wrapper" @keydown=${this._handleKeydown}>
        <section
          class="card"
          role="group"
          aria-labelledby="my-title"
          aria-describedby="my-description"
        >
          <div class="icon">
            <ha-svg-icon .path=${mdiLinkVariant}></ha-svg-icon>
          </div>
          <h1 id="my-title">
            ${this.hass.localize("ui.panel.my.confirm_title", { destination })}
          </h1>
          <p id="my-description">
            ${this.hass.localize("ui.panel.my.confirm_description", {
              destination,
            })}
          </p>
          ${
            plan.action === "external_app"
              ? nothing
              : html`
                  <div class="field">
                    <span class="label"
                      >${this.hass.localize("ui.panel.my.path_label")}</span
                    >
                    <span class="value" dir="ltr">${plan.path}</span>
                  </div>
                `
          }
          ${
            plan.params.length
              ? html`
                  <div class="field">
                    <span class="label"
                      >${this.hass.localize("ui.panel.my.params_label")}</span
                    >
                    <ul class="params" tabindex="0">
                      ${plan.params.map(
                        ([key, value]) =>
                          html`<li class="value" dir="ltr">
                            ${`${key}=${
                              plan.maskedParams?.includes(key)
                                ? this.hass.localize("ui.panel.my.param_set")
                                : value
                            }`}
                          </li>`
                      )}
                    </ul>
                  </div>
                `
              : nothing
          }
          <div class="field">
            <span class="label"
              >${this.hass.localize("ui.panel.my.instance_label")}</span
            >
            <span class="value">${location.origin}</span>
          </div>
          <div class="actions">
            <ha-button id="cancel" appearance="outlined" @click=${this._cancel}>
              ${this.hass.localize("ui.panel.my.cancel")}
            </ha-button>
            <ha-button id="open" @click=${this._open}>
              ${this.hass.localize("ui.panel.my.open")}
            </ha-button>
          </div>
        </section>
      </div>
    `;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100%;
      box-sizing: border-box;
    }
    .wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      padding: var(--ha-space-4);
      box-sizing: border-box;
    }
    .card {
      width: 100%;
      max-width: 560px;
      box-sizing: border-box;
      padding: var(--ha-space-8, 32px) var(--ha-space-6, 24px);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      box-shadow: var(--ha-card-box-shadow, none);
    }
    .icon {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 56px;
      height: 56px;
      border-radius: var(--ha-border-radius-xl);
      background: var(--ha-color-fill-primary-quiet-resting);
      color: var(--primary-color);
    }
    h1 {
      margin: var(--ha-space-5, 20px) 0 var(--ha-space-3);
      font-size: var(--ha-font-size-xl, 22px);
      font-weight: var(--ha-font-weight-normal);
      overflow-wrap: anywhere;
    }
    p {
      margin: 0 0 var(--ha-space-4);
      color: var(--secondary-text-color);
      line-height: var(--ha-line-height-normal);
    }
    .field {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      margin-bottom: var(--ha-space-3);
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--ha-color-fill-neutral-quiet-resting);
    }
    .label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .value {
      font-family: var(--ha-font-family-code);
      overflow-wrap: anywhere;
      unicode-bidi: isolate;
    }
    /* Long values scroll inside their field so the buttons stay reachable. */
    .field > .value,
    .params {
      max-height: 30vh;
      overflow-y: auto;
    }
    .params {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      gap: var(--ha-space-3);
      margin-top: var(--ha-space-4);
    }
    .actions ha-button {
      --ha-button-height: 44px;
      min-width: 44px;
    }
  `;

  protected render() {
    if (this._plan) {
      return this._renderConfirm(this._plan);
    }
    if (this._error) {
      let error: string;
      switch (this._error) {
        case "not_supported":
          error =
            this.hass.localize("ui.panel.my.not_supported", {
              link: html`<a
                target="_blank"
                rel="noreferrer noopener"
                href="https://my.home-assistant.io/faq.html#supported-pages"
                >${this.hass.localize("ui.panel.my.faq_link")}</a
              >`,
            }) || "This redirect is not supported.";
          break;
        case "no_component":
          error =
            this.hass.localize("ui.panel.my.component_not_loaded", {
              integration: html`<a
                target="_blank"
                rel="noreferrer noopener"
                href=${documentationUrl(
                  this.hass,
                  `/integrations/${this._redirect!.component!}`
                )}
                >${domainToName(
                  this.hass.localize,
                  this._redirect!.component!
                )}</a
              >`,
            }) || "This redirect is not supported.";
          break;
        case "no_supervisor":
          error = this.hass.localize("ui.panel.my.no_supervisor", {
            docs_link: html`<a
              target="_blank"
              rel="noreferrer noopener"
              href=${documentationUrl(this.hass, "/installation")}
              >${this.hass.localize("ui.panel.my.documentation")}</a
            >`,
          });
          break;
        case "not_app":
          error = this.hass.localize("ui.panel.my.not_app", {
            link: html`<a
              target="_blank"
              rel="noreferrer noopener"
              href="https://companion.home-assistant.io/download"
              >${this.hass.localize("ui.panel.my.download_app")}</a
            >`,
          });
          break;
        case "url_error":
          error = this.hass.localize("ui.panel.my.url_error");
          break;
        default:
          error = this.hass.localize("ui.panel.my.error") || "Unknown error";
      }
      return html`<hass-error-screen
        .error=${error}
        .hass=${this.hass}
      ></hass-error-screen>`;
    }
    return nothing;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-panel-my": HaPanelMy;
  }
}
