import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { isComponentLoaded } from "../common/config/is_component_loaded";
import { consume } from "../common/decorators/consume";
import { consumeLocalize } from "../common/decorators/consume-context-entry";
import { fireEvent } from "../common/dom/fire_event";
import { stringCompare } from "../common/string/compare";
import type {
  LocalizeFunc,
  LocalizeKeys,
} from "../common/translations/localize";
import "../components/ha-button";
import "../components/ha-checkbox";
import "../components/ha-spinner";
import type { ConfigEntry } from "../data/config_entries";
import { subscribeConfigEntries } from "../data/config_entries";
import {
  localizeConfigFlowTitle,
  subscribeConfigFlowInProgress,
} from "../data/config_flow";
import { brandsAccessTokenContext } from "../data/context";
import type { DataEntryFlowProgress } from "../data/data_entry_flow";
import { domainToName } from "../data/integration";
import { scanUSBDevices } from "../data/usb";
import { showConfigFlowDialog } from "../dialogs/config-flow/show-dialog-config-flow";
import { SubscribeMixin } from "../mixins/subscribe-mixin";
import type { HomeAssistant } from "../types";
import { brandsUrl } from "../util/brands-url";
import type { DeviceItem, DeviceStatus } from "./onboarding-devices-logic";
import {
  buildDeviceItems,
  itemsToSetUp,
  runSetupQueue,
  sourceKey,
  syncChoice,
} from "./onboarding-devices-logic";
import { onBoardingStyles } from "./styles";

const HIDDEN_DOMAINS = new Set([
  "backup",
  "google_translate",
  "hassio",
  "met",
  "radio_browser",
  "rpi_power",
  "shopping_list",
  "sun",
]);

/**
 * The devices step. Each discovered item is a row with a choice to set it up
 * now or skip it. Chosen items are set up one after another in the existing
 * configuration flow dialog, and every row shows where it stands. The server
 * calls are the same as before: the flows in progress and the configuration
 * entries are subscribed to, and finishing marks the onboarding step done.
 */
@customElement("onboarding-integrations")
class OnboardingIntegrations extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state() private _entries: ConfigEntry[] = [];

  @state() private _flows = new Map<string, DataEntryFlowProgress>();

  @state() private _discoveredDomainsReceived = false;

  @state() private _progress = new Map<string, DeviceStatus>();

  @state() private _chosen = new Set<string>();

  @state() private _busy = false;

  @state() private _scanning = false;

  @state()
  @consume({ context: brandsAccessTokenContext, subscribe: true })
  // @ts-ignore re-render trigger only, its value is never read
  private _brandsAccessToken?: string;

  private _known = new Set<string>();

  private _leaving = false;

  public hassSubscribe(): (UnsubscribeFunc | Promise<UnsubscribeFunc>)[] {
    return [
      subscribeConfigFlowInProgress(this.hass, (messages) => {
        const flows = new Map(this._flows);
        messages.forEach((message) => {
          if (message.type === "removed") {
            // A flow being set up keeps its row until the dialog closes.
            if (this._progress.get(message.flow_id) !== "running") {
              flows.delete(message.flow_id);
            }
            return;
          }
          if (HIDDEN_DOMAINS.has(message.flow.handler)) {
            return;
          }
          flows.set(message.flow_id, message.flow);
        });
        this.hass.loadBackendTranslation(
          "title",
          Array.from(new Set(Array.from(flows.values(), (f) => f.handler)))
        );
        this._flows = flows;
        this._discoveredDomainsReceived = true;
      }),
      subscribeConfigEntries(
        this.hass,
        (messages) => {
          let fullUpdate = false;
          const newEntries: ConfigEntry[] = [];
          const integrations = new Set<string>();
          messages.forEach((message) => {
            if (message.type === null || message.type === "added") {
              if (HIDDEN_DOMAINS.has(message.entry.domain)) {
                return;
              }
              newEntries.push(message.entry);
              integrations.add(message.entry.domain);
              if (message.type === null) {
                fullUpdate = true;
              }
            } else if (message.type === "removed") {
              this._entries = this._entries!.filter(
                (entry) => entry.entry_id !== message.entry.entry_id
              );
            } else if (message.type === "updated") {
              if (HIDDEN_DOMAINS.has(message.entry.domain)) {
                return;
              }
              const newEntry = message.entry;
              this._entries = this._entries!.map((entry) =>
                entry.entry_id === newEntry.entry_id ? newEntry : entry
              );
            }
          });
          if (!newEntries.length && !fullUpdate) {
            return;
          }
          this.hass.loadBackendTranslation("title", Array.from(integrations));
          const existingEntries = fullUpdate ? [] : this._entries;
          this._entries = [...existingEntries!, ...newEntries];
        },
        { type: ["device", "hub", "service"] }
      ),
    ];
  }

  private _items(): DeviceItem[] {
    const language = this.hass.locale.language;
    return buildDeviceItems(
      Array.from(this._flows.values(), (flow) => ({
        flow_id: flow.flow_id,
        handler: flow.handler,
        title: localizeConfigFlowTitle(this.hass.localize, flow),
        source: flow.context.source,
      })),
      new Set(this._entries.map((entry) => entry.domain)),
      this._progress,
      (domain) => domainToName(this.hass.localize, domain),
      (a, b) => stringCompare(a, b, language)
    );
  }

  protected willUpdate(changedProps: PropertyValues) {
    super.willUpdate(changedProps);
    if (
      changedProps.has("_flows") ||
      changedProps.has("_entries") ||
      changedProps.has("_progress")
    ) {
      const { chosen, known } = syncChoice(
        this._chosen,
        this._known,
        this._items()
      );
      this._known = known;
      if (
        chosen.size !== this._chosen.size ||
        [...chosen].some((id) => !this._chosen.has(id))
      ) {
        this._chosen = chosen;
      }
    }
  }

  protected render() {
    if (!this._discoveredDomainsReceived) {
      return html`<div class="loading"><ha-spinner></ha-spinner></div>`;
    }
    const items = this._items();

    // there is a possibility that the user has no integrations
    if (items.length === 0) {
      return html`
        <div class="all-set-icon">🎉</div>
        <h1>
          ${this._localize("ui.panel.page-onboarding.integration.all_set")}
        </h1>
        <p>
          ${this._localize("ui.panel.page-onboarding.integration.lets_start")}
        </p>
        ${this._renderScan()}
        <div class="footer">
          <ha-button @click=${this._finish}>
            ${this._localize("ui.panel.page-onboarding.integration.finish")}
          </ha-button>
        </div>
      `;
    }

    const toSetUp = itemsToSetUp(items, this._chosen);

    return html`
      <h1>
        ${this._localize("ui.panel.page-onboarding.integration.found_devices", {
          count: items.length,
        })}
      </h1>
      <p>
        ${this._localize("ui.panel.page-onboarding.integration.devices_intro")}
      </p>
      ${this._renderScan()}
      <ul class="devices" aria-busy=${this._busy ? "true" : "false"}>
        ${items.map((item) => this._renderItem(item))}
      </ul>
      <div class="summary" role="status">
        ${this._localize("ui.panel.page-onboarding.integration.chosen_count", {
          count: toSetUp.length,
        })}
      </div>
      <div class="footer">
        <ha-button
          appearance="filled"
          .disabled=${this._busy || toSetUp.length === 0}
          @click=${this._setUpChosen}
        >
          ${this._localize("ui.panel.page-onboarding.integration.set_up", {
            count: toSetUp.length,
          })}
        </ha-button>
        <ha-button
          appearance=${toSetUp.length ? "plain" : "filled"}
          @click=${this._finish}
        >
          ${this._localize("ui.panel.page-onboarding.integration.finish")}
        </ha-button>
      </div>
    `;
  }

  private _renderScan() {
    // The only rescan the server offers is the USB one.
    if (!isComponentLoaded(this.hass.config, "usb")) {
      return nothing;
    }
    return html`<div class="scan">
      <ha-button
        appearance="plain"
        .disabled=${this._scanning || this._busy}
        @click=${this._scanUSBDevices}
      >
        ${this._localize(
          this._scanning
            ? "ui.panel.page-onboarding.integration.scanning"
            : "ui.panel.page-onboarding.integration.scan_usb"
        )}
      </ha-button>
    </div>`;
  }

  private _renderItem(item: DeviceItem) {
    const integration = domainToName(this.hass.localize, item.domain);
    const source = this._localize(
      `ui.panel.page-onboarding.integration.source.${sourceKey(item.source)}` as LocalizeKeys
    );
    const detail = item.flowId
      ? this._localize("ui.panel.page-onboarding.integration.item_detail", {
          integration,
          source,
        })
      : integration;
    return html`
      <li class="device ${item.status}">
        <div class="icon">
          <img
            alt=""
            src=${brandsUrl(
              {
                domain: item.domain,
                type: "icon",
                darkOptimized: this.hass.themes?.darkMode,
              },
              location.origin
            )}
            crossorigin="anonymous"
            referrerpolicy="no-referrer"
          />
        </div>
        <div class="text">
          <div class="name">${item.title}</div>
          <div class="detail">${detail}</div>
        </div>
        <span class="status ${item.status}">
          ${this._localize(
            `ui.panel.page-onboarding.integration.status_${item.status}`
          )}
        </span>
        ${
          item.selectable
            ? html`<ha-checkbox
                .checked=${this._chosen.has(item.id)}
                .disabled=${this._busy}
                .ariaLabel=${this._localize(
                  "ui.panel.page-onboarding.integration.choose_label",
                  { name: item.title }
                )}
                .itemId=${item.id}
                @change=${this._toggle}
              ></ha-checkbox>`
            : html`<span class="choice-space"></span>`
        }
      </li>
    `;
  }

  private _toggle(ev: Event) {
    const box = ev.currentTarget as HTMLInputElement & { itemId: string };
    const id = box.itemId;
    const checked = box.checked;
    const chosen = new Set(this._chosen);
    if (checked) {
      chosen.add(id);
    } else {
      chosen.delete(id);
    }
    this._chosen = chosen;
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    this.hass.loadBackendTranslation("title");
    this._scanUSBDevices();
  }

  private async _scanUSBDevices() {
    if (!isComponentLoaded(this.hass.config, "usb")) {
      return;
    }
    this._scanning = true;
    try {
      await scanUSBDevices(this.hass);
    } finally {
      this._scanning = false;
    }
  }

  private _setProgress(flowId: string, status: DeviceStatus) {
    this._progress = new Map(this._progress).set(flowId, status);
  }

  private async _setUpChosen() {
    if (this._busy) {
      return;
    }
    this._busy = true;
    try {
      await runSetupQueue(
        itemsToSetUp(this._items(), this._chosen),
        (flowId) =>
          new Promise<boolean>((resolve) => {
            showConfigFlowDialog(this, {
              continueFlowId: flowId,
              dialogClosedCallback: ({ flowFinished }) => resolve(flowFinished),
            });
          }),
        (flowId, status) => this._setProgress(flowId, status),
        () => this._leaving
      );
    } finally {
      this._busy = false;
    }
  }

  private async _finish() {
    // Leaving the step ends any set-up still waiting on a dialog.
    this._leaving = true;
    fireEvent(this, "onboarding-step", {
      type: "integration",
    });
  }

  static get styles(): CSSResultGroup {
    return [
      onBoardingStyles,
      css`
        .loading {
          display: flex;
          justify-content: center;
          padding: var(--ha-space-8) 0;
        }
        .all-set-icon {
          font-size: 64px;
          text-align: center;
        }
        .scan {
          display: flex;
          justify-content: flex-end;
          margin-bottom: var(--ha-space-2);
        }
        .devices {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .device {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: var(--ha-space-3) var(--ha-space-4);
          min-height: 64px;
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--primary-text-color);
        }
        .icon {
          flex: none;
          display: flex;
          align-items: center;
          justify-content: center;
          width: 40px;
          height: 40px;
          box-sizing: border-box;
          padding: var(--ha-space-1);
          border-radius: var(--ha-border-radius-lg);
          background: var(--card-background-color);
        }
        .icon img {
          max-width: 100%;
          max-height: 100%;
        }
        .text {
          flex: 1 1 140px;
          min-width: 0;
        }
        .name {
          font-weight: var(--ha-font-weight-medium);
          word-break: break-word;
        }
        .detail {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          word-break: break-word;
        }
        .status {
          flex: none;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          background: var(--divider-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .status.added {
          background: var(--success-color);
          color: var(--text-primary-color, #fff);
        }
        .status.unfinished {
          background: var(--warning-color);
          color: var(--text-primary-color, #fff);
        }
        ha-checkbox {
          flex: none;
          --ha-checkbox-min-touch-size: 44px;
        }
        .choice-space {
          flex: none;
          width: 44px;
        }
        .summary {
          margin-top: var(--ha-space-4);
          color: var(--secondary-text-color);
        }
        .footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--ha-space-2);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "onboarding-integrations": OnboardingIntegrations;
  }
}
