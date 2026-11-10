import "@home-assistant/webawesome/dist/components/divider/divider";
import { mdiDotsVertical, mdiHeartPulse, mdiShieldCheck } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { navigate } from "../../../common/navigate";
import { extractSearchParam } from "../../../common/url/search-params";
import "../../../components/ha-button";
import "../../../components/ha-dropdown";
import "../../../components/ha-dropdown-item";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import type { HassioResolution } from "../../../data/hassio/resolution";
import { fetchHassioResolution } from "../../../data/hassio/resolution";
import type { IntegrationSetup } from "../../../data/integration";
import {
  domainToName,
  fetchIntegrationSetups,
} from "../../../data/integration";
import type { RepairsIssue } from "../../../data/repairs";
import {
  severitySort,
  subscribeRepairsIssueRegistry,
} from "../../../data/repairs";
import type { SystemHealthInfo } from "../../../data/system_health";
import { subscribeSystemHealthInfo } from "../../../data/system_health";
import "../../../layouts/hass-subpage";
import "../../../layouts/hass-loading-screen";
import { SubscribeMixin } from "../../../mixins/subscribe-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import "./ha-config-repairs";
import { showIntegrationStartupDialog } from "./show-integration-startup-dialog";
import { showSystemInformationDialog } from "./show-system-information-dialog";

// Home Assistant itself warns about an integration that takes this long
const SLOW_SETUP_SECONDS = 10;

@customElement("ha-config-repairs-dashboard")
class HaConfigRepairsDashboard extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _repairsIssues: RepairsIssue[] = [];

  @state() private _loaded = false;

  @state() private _showIgnored = false;

  @state() private _healthInfo?: SystemHealthInfo;

  @state() private _healthDone = false;

  @state() private _resolution?: HassioResolution;

  @state() private _setups?: IntegrationSetup[];

  private _getFilteredIssues = memoizeOne(
    (showIgnored: boolean, repairsIssues: RepairsIssue[]) =>
      showIgnored
        ? repairsIssues
        : repairsIssues.filter((issue) => !issue.ignored)
  );

  public connectedCallback(): void {
    super.connectedCallback();

    const searchParam = extractSearchParam("dialog");

    if (searchParam === "system-health") {
      navigate("/config/repairs", { replace: true });
      showSystemInformationDialog(this);
    }
  }

  protected firstUpdated(changedProps: PropertyValues<this>): void {
    super.firstUpdated(changedProps);
    if (isComponentLoaded(this.hass.config, "hassio")) {
      fetchHassioResolution(this.hass).then(
        (resolution) => {
          this._resolution = resolution;
        },
        () => undefined
      );
    }
    fetchIntegrationSetups(this.hass).then(
      (setups) => {
        this._setups = setups;
      },
      () => undefined
    );
  }

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    const subscriptions: (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] = [
      subscribeRepairsIssueRegistry(this.hass.connection!, (repairs) => {
        this._repairsIssues = repairs.issues.sort(
          (a, b) => severitySort[a.severity] - severitySort[b.severity]
        );
        this._loaded = true;
        const integrations = new Set<string>();
        for (const issue of this._repairsIssues) {
          integrations.add(issue.domain);
        }
        this.hass.loadBackendTranslation("issues", [...integrations]);
      }),
    ];
    if (isComponentLoaded(this.hass.config, "system_health")) {
      subscriptions.push(
        subscribeSystemHealthInfo(this.hass, (info) => {
          if (info) {
            this._healthInfo = info;
          } else {
            this._healthDone = true;
          }
        })
      );
    }
    return subscriptions;
  }

  protected render(): TemplateResult {
    if (!this._loaded) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }

    const issues = this._getFilteredIssues(
      this._showIgnored,
      this._repairsIssues
    );
    const ignoredCount = this._repairsIssues.filter(
      (issue) => issue.ignored
    ).length;
    const localize = this.hass.localize;

    return html`
      <hass-subpage
        back-path="/config/system"
        .hass=${this.hass}
        .narrow=${this.narrow}
        .header=${localize("ui.panel.config.repairs.caption")}
      >
        <div slot="toolbar-icon">
          <ha-dropdown @wa-select=${this._handleDropdownSelect}>
            <ha-icon-button
              slot="trigger"
              .label=${localize("ui.common.menu")}
              .path=${mdiDotsVertical}
            ></ha-icon-button>
            <ha-dropdown-item
              type="checkbox"
              value="toggle_ignored"
              .checked=${this._showIgnored}
            >
              ${localize("ui.panel.config.repairs.show_ignored")}
            </ha-dropdown-item>
            <wa-divider></wa-divider>
            ${
              isComponentLoaded(this.hass.config, "system_health") ||
              isComponentLoaded(this.hass.config, "hassio")
                ? html`
                    <ha-dropdown-item value="system_information">
                      ${localize("ui.panel.config.repairs.system_information")}
                    </ha-dropdown-item>
                  `
                : nothing
            }
            <ha-dropdown-item value="integration_startup_time">
              ${localize("ui.panel.config.repairs.integration_startup_time")}
            </ha-dropdown-item>
          </ha-dropdown>
        </div>
        <div class="page">
          <div class="intro">
            <h2>${localize("ui.panel.config.repairs.caption")}</h2>
            <p>${localize("ui.panel.config.repairs.summary")}</p>
          </div>
          <ha-config-repairs
            .hass=${this.hass}
            .narrow=${this.narrow}
            .repairsIssues=${issues}
          ></ha-config-repairs>
          ${this._renderStatus(issues, ignoredCount)}
          <div class="tiles">
            ${this._renderHealthTile()} ${this._renderStartupTile()}
            ${this._renderUnsupportedTile()}
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderStatus(
    issues: RepairsIssue[],
    ignoredCount: number
  ): TemplateResult | typeof nothing {
    const localize = this.hass.localize;
    const active = issues.filter((issue) => !issue.ignored).length;
    if (active && !ignoredCount) {
      return nothing;
    }
    return html`
      <section class="status">
        <span class="status-icon"
          ><ha-svg-icon .path=${mdiShieldCheck}></ha-svg-icon
        ></span>
        <div class="status-text">
          <strong>
            ${
              active
                ? localize("ui.panel.config.repairs.nothing_else")
                : localize("ui.panel.config.repairs.no_repairs")
            }
          </strong>
          ${
            ignoredCount
              ? html`<span
                  >${localize("ui.panel.config.repairs.ignored_count", {
                    count: ignoredCount,
                  })}</span
                >`
              : nothing
          }
        </div>
        ${
          ignoredCount
            ? html`<ha-button appearance="plain" @click=${this._toggleIgnored}>
                ${localize(
                  this._showIgnored
                    ? "ui.panel.config.repairs.hide_ignored"
                    : "ui.panel.config.repairs.show_ignored_short"
                )}
              </ha-button>`
            : nothing
        }
      </section>
    `;
  }

  private _healthProblems(): number {
    let problems = 0;
    for (const domain of Object.values(this._healthInfo ?? {})) {
      for (const value of Object.values(domain?.info ?? {})) {
        if (
          value !== null &&
          typeof value === "object" &&
          "type" in value &&
          value.type === "failed"
        ) {
          problems++;
        }
      }
    }
    return problems + (this._resolution?.unhealthy.length ?? 0);
  }

  private _renderHealthTile(): TemplateResult | typeof nothing {
    const hasHealth = isComponentLoaded(this.hass.config, "system_health");
    const hasHassio = isComponentLoaded(this.hass.config, "hassio");
    if (!hasHealth && !hasHassio) {
      return nothing;
    }
    const localize = this.hass.localize;
    const waiting =
      (hasHealth && !this._healthDone) || (hasHassio && !this._resolution);
    const problems = this._healthProblems();
    const tone = problems ? "bad" : waiting ? "wait" : "good";
    return html`
      <button
        class="tile health ${tone}"
        @click=${this._showSystemInformationDialog}
      >
        <span class="tile-label"
          ><ha-svg-icon .path=${mdiHeartPulse}></ha-svg-icon>
          ${localize("ui.panel.config.repairs.system_health")}</span
        >
        <span class="tile-value">
          ${
            tone === "bad"
              ? localize("ui.panel.config.repairs.health_problems", {
                  count: problems,
                })
              : tone === "wait"
                ? localize("ui.panel.config.repairs.health_checking")
                : localize("ui.panel.config.repairs.health_good")
          }
        </span>
        <span class="tile-sub">
          ${
            tone === "good"
              ? localize("ui.panel.config.repairs.health_good_hint")
              : tone === "bad"
                ? localize("ui.panel.config.repairs.health_problems_hint")
                : nothing
          }
        </span>
      </button>
    `;
  }

  private _renderStartupTile(): TemplateResult | typeof nothing {
    if (!this._setups) {
      return nothing;
    }
    const localize = this.hass.localize;
    const timed = this._setups.filter((setup) => setup.seconds !== undefined);
    const slow = timed.filter(
      (setup) => (setup.seconds as number) >= SLOW_SETUP_SECONDS
    );
    const slowest = [...timed].sort(
      (a, b) => (b.seconds as number) - (a.seconds as number)
    )[0];
    return html`
      <button class="tile" @click=${this._showIntegrationStartupDialog}>
        <span class="tile-label"
          >${localize("ui.panel.config.repairs.slow_startup")}</span
        >
        <span class="tile-value">
          ${
            slow.length ? slow.length : localize("ui.panel.config.repairs.none")
          }
        </span>
        <span class="tile-sub">
          ${
            slowest
              ? localize("ui.panel.config.repairs.slowest", {
                  integration: domainToName(localize, slowest.domain),
                  seconds: (slowest.seconds as number).toFixed(1),
                })
              : nothing
          }
        </span>
      </button>
    `;
  }

  private _renderUnsupportedTile(): TemplateResult | typeof nothing {
    if (!this._resolution) {
      return nothing;
    }
    const localize = this.hass.localize;
    const count = this._resolution.unsupported.length;
    return html`
      <button class="tile" @click=${this._showSystemInformationDialog}>
        <span class="tile-label"
          >${localize("ui.panel.config.repairs.unsupported")}</span
        >
        <span class="tile-value">
          ${
            count
              ? localize("ui.panel.config.repairs.unsupported_reasons", {
                  count,
                })
              : localize("ui.panel.config.repairs.nothing")
          }
        </span>
        <span class="tile-sub">
          ${
            count
              ? localize("ui.panel.config.repairs.unsupported_hint")
              : localize("ui.panel.config.repairs.supported_hint")
          }
        </span>
      </button>
    `;
  }

  private _showSystemInformationDialog(): void {
    showSystemInformationDialog(this);
  }

  private _showIntegrationStartupDialog(): void {
    showIntegrationStartupDialog(this);
  }

  private _toggleIgnored(): void {
    this._showIgnored = !this._showIgnored;
  }

  private _handleDropdownSelect(ev: HaDropdownSelectEvent) {
    const action = ev.detail?.item?.value;

    switch (action) {
      case "toggle_ignored":
        this._toggleIgnored();
        break;
      case "system_information":
        this._showSystemInformationDialog();
        break;
      case "integration_startup_time":
        this._showIntegrationStartupDialog();
        break;
    }
  }

  static styles = [
    haStyle,
    css`
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
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
      .status {
        display: flex;
        align-items: center;
        gap: var(--ha-space-4);
        box-sizing: border-box;
        padding: var(--ha-space-4) var(--ha-space-5);
        border-radius: var(--ha-border-radius-3xl);
        background: var(--card-background-color);
      }
      .status-icon {
        display: flex;
        flex: none;
        align-items: center;
        justify-content: center;
        width: 48px;
        height: 48px;
        border-radius: var(--ha-border-radius-xl);
        background: color-mix(
          in srgb,
          var(--success-color) 30%,
          var(--primary-background-color)
        );
      }
      .status-text {
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .status-text strong {
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-medium);
        color: var(--primary-text-color);
      }
      .tiles {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 220px), 1fr));
        gap: var(--ha-space-4);
      }
      .tile {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-1);
        box-sizing: border-box;
        padding: var(--ha-space-5);
        border: none;
        border-radius: var(--ha-border-radius-3xl);
        font: inherit;
        text-align: start;
        color: var(--primary-text-color);
        background: var(--card-background-color);
        cursor: pointer;
      }
      .tile:focus-visible {
        outline: 3px solid var(--primary-color);
        outline-offset: 2px;
      }
      .tile.good {
        background: color-mix(
          in srgb,
          var(--success-color) 30%,
          var(--primary-background-color)
        );
      }
      .tile.bad {
        background: color-mix(
          in srgb,
          var(--error-color) 30%,
          var(--primary-background-color)
        );
      }
      .tile-label {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
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
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-repairs-dashboard": HaConfigRepairsDashboard;
  }
}
