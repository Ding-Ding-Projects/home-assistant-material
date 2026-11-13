import {
  mdiCellphoneKey,
  mdiCheck,
  mdiDeleteOutline,
  mdiDevices,
  mdiDotsVertical,
  mdiInformationOutline,
  mdiLanConnect,
  mdiPlus,
} from "@mdi/js";
import type { PropertyValues, TemplateResult } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { ifDefined } from "lit/directives/if-defined";
import memoizeOne from "memoize-one";
import { isComponentLoaded } from "../../../../../common/config/is_component_loaded";
import { stringCompare } from "../../../../../common/string/compare";
import { extractSearchParam } from "../../../../../common/url/search-params";
import "../../../../../components/ha-button";
import "../../../../../components/ha-card";
import "../../../../../components/ha-dropdown";
import type { HaDropdownSelectEvent } from "../../../../../components/ha-dropdown";
import "../../../../../components/ha-dropdown-item";
import "../../../../../components/ha-icon-button";
import "../../../../../components/ha-icon-next";
import "../../../../../components/ha-list-item";
import "../../../../../components/ha-svg-icon";
import "../../../../../components/item/ha-list-item-button";
import "../../../../../components/list/ha-list-nav";
import { getSignedPath } from "../../../../../data/auth";
import { getConfigEntryDiagnosticsDownloadUrl } from "../../../../../data/diagnostics";
import type { OTBRInfo, OTBRInfoDict } from "../../../../../data/otbr";
import {
  OTBRCreateNetwork,
  OTBRSetChannel,
  OTBRSetNetwork,
  findOTBRInfoForDataset,
  getOTBRInfo,
} from "../../../../../data/otbr";
import type { ThreadDataSet, ThreadRouter } from "../../../../../data/thread";
import {
  addThreadDataSet,
  getThreadDataSetTLV,
  listThreadDataSets,
  removeThreadDataSet,
  setPreferredBorderAgent,
  setPreferredThreadDataSet,
  subscribeDiscoverThreadRouters,
} from "../../../../../data/thread";
import { showConfigFlowDialog } from "../../../../../dialogs/config-flow/show-dialog-config-flow";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../../../../dialogs/generic/show-dialog-box";
import "../../../../../layouts/hass-subpage";
import "../ha-protocol-stat-tiles";
import type { ProtocolStatTile } from "../ha-protocol-stat-tiles";
import { SubscribeMixin } from "../../../../../mixins/subscribe-mixin";
import { haStyle } from "../../../../../resources/styles";
import type { HomeAssistant } from "../../../../../types";
import { brandsUrl } from "../../../../../util/brands-url";
import { documentationUrl } from "../../../../../util/documentation-url";
import { fileDownload } from "../../../../../util/file_download";

export interface ThreadNetwork {
  name: string;
  dataset?: ThreadDataSet;
  routers?: ThreadRouter[];
}

@customElement("thread-config-panel")
export class ThreadConfigPanel extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _configEntryId: string | null = null;

  @state() private _routers: ThreadRouter[] = [];

  @state() private _datasets: ThreadDataSet[] = [];

  @state() private _otbrInfo?: OTBRInfoDict;

  protected render(): TemplateResult {
    const networks = this._groupRoutersByNetwork(this._routers, this._datasets);

    return html`
      <hass-subpage
        .narrow=${this.narrow}
        .hass=${this.hass}
        header="Thread"
        back-path="/config/connectivity"
      >
        <ha-dropdown slot="toolbar-icon">
          <ha-icon-button
            .path=${mdiDotsVertical}
            slot="trigger"
            .label=${this.hass.localize("ui.common.menu")}
          ></ha-icon-button>
          <a
            href=${getConfigEntryDiagnosticsDownloadUrl(
              this._configEntryId || ""
            )}
            target="_blank"
            rel="noreferrer"
            @click=${this._signUrl}
          >
            <ha-dropdown-item>
              ${this.hass.localize(
                "ui.panel.config.integrations.config_entry.download_diagnostics"
              )}
            </ha-dropdown-item>
          </a>
          <ha-dropdown-item @click=${this._addTLV}
            >${this.hass.localize(
              "ui.panel.config.thread.add_dataset_from_tlv"
            )}</ha-dropdown-item
          >
          <ha-dropdown-item @click=${this._addOTBR}
            >${this.hass.localize(
              "ui.panel.config.thread.add_open_thread_border_router"
            )}</ha-dropdown-item
          >
        </ha-dropdown>
        <div class="page">
          ${this._renderHero(networks)}
          <ha-protocol-stat-tiles
            class="tiles"
            .tiles=${this._statTiles(networks)}
          ></ha-protocol-stat-tiles>
          <div class="layout">
            <div class="main">
              <h2>
                ${this.hass.localize("ui.panel.config.thread.my_network")}${
                  networks.preferred?.name
                    ? html`: ${networks.preferred.name}`
                    : nothing
                }
              </h2>
              ${
                networks.preferred
                  ? this._renderNetwork(networks.preferred)
                  : html`<ha-card>
                      <div class="card-content no-routers">
                        <h3>
                          ${this.hass.localize(
                            "ui.panel.config.thread.no_preferred_network"
                          )}
                        </h3>
                        <ha-svg-icon .path=${mdiDevices}></ha-svg-icon>
                        <ha-button
                          appearance="plain"
                          size="s"
                          href=${documentationUrl(
                            this.hass,
                            `/integrations/thread`
                          )}
                          target="_blank"
                        >
                          ${this.hass.localize(
                            "ui.panel.config.thread.more_info"
                          )}</ha-button
                        >
                      </div>
                    </ha-card>`
              }
              ${
                networks.networks.length
                  ? html`<h2>
                        ${this.hass.localize(
                          "ui.panel.config.thread.other_networks"
                        )}
                      </h2>
                      ${networks.networks.map((network) =>
                        this._renderNetwork(network)
                      )}`
                  : nothing
              }
            </div>
            <div class="side">${this._renderSide(networks)}</div>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  // Numbers the discovered routers and the stored datasets report
  private _statTiles(networks: {
    preferred?: ThreadNetwork;
    networks: ThreadNetwork[];
  }): ProtocolStatTile[] {
    const networkCount =
      (networks.preferred ? 1 : 0) + networks.networks.length;
    const routerCount =
      (networks.preferred?.routers?.length ?? 0) +
      networks.networks.reduce((n, net) => n + (net.routers?.length ?? 0), 0);
    const localize = this.hass.localize;
    const tiles: ProtocolStatTile[] = [
      {
        label: localize("ui.panel.config.thread.tile_networks"),
        value: networkCount,
        icon: mdiLanConnect,
        tone: "primary",
      },
      {
        label: localize("ui.panel.config.thread.tile_border_routers"),
        value: routerCount,
        icon: mdiDevices,
        tone: "tertiary",
      },
    ];
    const channel = networks.preferred?.dataset?.channel;
    if (channel) {
      tiles.push({
        label: localize("ui.panel.config.thread.tile_channel"),
        value: channel,
        tone: "warning",
      });
    }
    return tiles;
  }

  private _renderHero(networks: {
    preferred?: ThreadNetwork;
    networks: ThreadNetwork[];
  }) {
    const networkCount =
      (networks.preferred ? 1 : 0) + networks.networks.length;
    const routerCount =
      (networks.preferred?.routers?.length ?? 0) +
      networks.networks.reduce((n, net) => n + (net.routers?.length ?? 0), 0);
    return html`
      <section class="hero">
        <div class="hero-card">
          <div class="eyebrow">
            <ha-svg-icon .path=${mdiLanConnect}></ha-svg-icon> Thread
          </div>
          <h1>
            ${
              networkCount
                ? this.hass.localize("ui.panel.config.thread.hero_title", {
                    networks: networkCount,
                    routers: routerCount,
                  })
                : this.hass.localize("ui.panel.config.thread.hero_title_none")
            }
          </h1>
          <p>
            ${
              networks.preferred?.name
                ? this.hass.localize("ui.panel.config.thread.hero_summary", {
                    name: networks.preferred.name,
                  })
                : this.hass.localize("ui.panel.config.thread.hero_summary_none")
            }
          </p>
        </div>
        <ha-button appearance="filled" @click=${this._addOTBR}>
          <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
          ${this.hass.localize("ui.panel.config.thread.add_border_router")}
        </ha-button>
      </section>
    `;
  }

  private _renderSide(networks: {
    preferred?: ThreadNetwork;
    networks: ThreadNetwork[];
  }) {
    const preferred = networks.preferred;
    const canImportKeychain =
      this.hass.auth.external?.config.canTransferThreadCredentialsToKeychain;
    const otbr =
      preferred?.dataset &&
      findOTBRInfoForDataset(this._otbrInfo, preferred.dataset);
    const showSend =
      canImportKeychain && preferred?.dataset && preferred.routers?.length;
    const showImport =
      this.hass.auth.external?.config.canImportThreadCredentials;
    const showChannel = preferred?.dataset && otbr?.channel;
    const sameNetwork =
      !!preferred &&
      networks.networks.length === 0 &&
      (preferred.routers?.length ?? 0) > 1;
    return html`
      ${
        sameNetwork
          ? html`<div class="banner">
              <ha-svg-icon .path=${mdiCheck}></ha-svg-icon>
              ${this.hass.localize("ui.panel.config.thread.same_network_note")}
            </div>`
          : nothing
      }
      ${
        showSend || showImport || showChannel
          ? html`<ha-card class="tools">
              ${
                showSend
                  ? html`<div class="tool">
                      <ha-svg-icon .path=${mdiCellphoneKey}></ha-svg-icon>
                      <div class="tool-text">
                        <strong
                          >${this.hass.localize(
                            "ui.panel.config.thread.thread_network_send_credentials_phone"
                          )}</strong
                        >
                        <span
                          >${this.hass.localize(
                            "ui.panel.config.thread.thread_network_send_credentials_phone_description"
                          )}</span
                        >
                      </div>
                      <ha-button
                        size="s"
                        .networkDataset=${preferred!.dataset}
                        @click=${this._sendCredentials}
                        >${this.hass.localize(
                          "ui.panel.config.thread.send"
                        )}</ha-button
                      >
                    </div>`
                  : nothing
              }
              ${
                showImport
                  ? html`<div class="tool">
                      <ha-svg-icon .path=${mdiCellphoneKey}></ha-svg-icon>
                      <div class="tool-text">
                        <strong
                          >${this.hass.localize(
                            "ui.panel.config.thread.thread_network_send_credentials_ha"
                          )}</strong
                        >
                        <span
                          >${this.hass.localize(
                            "ui.panel.config.thread.thread_network_send_credentials_ha_description"
                          )}</span
                        >
                      </div>
                      <ha-button
                        size="s"
                        @click=${this._importExternalThreadCredentials}
                        >${this.hass.localize(
                          "ui.panel.config.thread.import"
                        )}</ha-button
                      >
                    </div>`
                  : nothing
              }
              ${
                showChannel
                  ? html`<a
                      class="tool"
                      href=${`/config/thread/network-info/${preferred!.dataset!.dataset_id}${window.location.search}`}
                    >
                      <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
                      <div class="tool-text">
                        <strong
                          >${this.hass.localize(
                            "ui.panel.config.thread.change_channel_label"
                          )}</strong
                        >
                        <span>${otbr!.channel}</span>
                      </div>
                      <ha-icon-next></ha-icon-next>
                    </a>`
                  : nothing
              }
            </ha-card>`
          : nothing
      }
    `;
  }

  private _renderNetwork(network: ThreadNetwork) {
    const otbrForNetwork =
      network.dataset &&
      findOTBRInfoForDataset(this._otbrInfo, network.dataset);
    return html`<ha-card>
      <div class="card-header">
        ${network.name}${
          network.dataset &&
          !network.dataset.preferred &&
          !network.routers?.length
            ? html`<ha-icon-button
                .label=${this.hass.localize(
                  "ui.panel.config.thread.thread_network_delete_credentials"
                )}
                .networkDataset=${network.dataset}
                .path=${mdiDeleteOutline}
                @click=${this._removeDataset}
              ></ha-icon-button>`
            : ""
        }
      </div>
      ${
        network.routers?.length
          ? html`<div class="card-content routers">
                <h4>
                  ${this.hass.localize(
                    "ui.panel.config.thread.border_routers",
                    {
                      count: network.routers.length,
                    }
                  )}
                </h4>
              </div>
              ${network.routers.map((router) => {
                const otbr =
                  this._otbrInfo && this._otbrInfo[router.extended_address];
                const showDefaultRouter = !!network.dataset;
                const isDefaultRouter =
                  showDefaultRouter &&
                  router.extended_address ===
                    network.dataset!.preferred_extended_address;
                const showOverflow = showDefaultRouter || otbr;
                return html`<ha-list-item
                  class="router"
                  twoline
                  graphic=${ifDefined(router.brand ? "avatar" : undefined)}
                  .hasMeta=${showOverflow}
                >
                  ${
                    router.brand
                      ? html`<img
                          slot="graphic"
                          .src=${brandsUrl(
                            {
                              domain: router.brand,
                              type: "icon",
                              darkOptimized: this.hass.themes?.darkMode,
                            },
                            this.hass.auth.data.hassUrl
                          )}
                          alt=${router.brand}
                          crossorigin="anonymous"
                          referrerpolicy="no-referrer"
                          @error=${this._onImageError}
                          @load=${this._onImageLoad}
                        />`
                      : nothing
                  }
                  ${
                    router.instance_name ||
                    router.model_name ||
                    router.server?.replace(".local.", "") ||
                    ""
                  }
                  <span slot="secondary">${router.server}</span>
                  ${
                    showOverflow
                      ? html`${
                            isDefaultRouter
                              ? html`<ha-svg-icon
                                  .path=${mdiCellphoneKey}
                                  .title=${this.hass.localize(
                                    "ui.panel.config.thread.default_router"
                                  )}
                                ></ha-svg-icon>`
                              : ""
                          }
                          <ha-dropdown
                            slot="meta"
                            .network=${network}
                            .router=${router}
                            .otbr=${otbr}
                            @wa-select=${this._handleRouterAction}
                          >
                            <ha-icon-button
                              .label=${this.hass.localize(
                                "ui.common.overflow_menu"
                              )}
                              .path=${mdiDotsVertical}
                              slot="trigger"
                            ></ha-icon-button>
                            ${
                              showDefaultRouter
                                ? html`<ha-dropdown-item
                                    value="set-default"
                                    .disabled=${isDefaultRouter}
                                  >
                                    ${
                                      isDefaultRouter
                                        ? this.hass.localize(
                                            "ui.panel.config.thread.default_router"
                                          )
                                        : this.hass.localize(
                                            "ui.panel.config.thread.set_default_router"
                                          )
                                    }
                                  </ha-dropdown-item>`
                                : ""
                            }
                            ${
                              otbr
                                ? html`<ha-dropdown-item value="reset-router">
                                      ${this.hass.localize(
                                        "ui.panel.config.thread.reset_border_router"
                                      )}</ha-dropdown-item
                                    >
                                    <ha-dropdown-item value="change-channel">
                                      ${this.hass.localize(
                                        "ui.panel.config.thread.change_channel"
                                      )}</ha-dropdown-item
                                    >
                                    ${
                                      network.dataset?.preferred
                                        ? ""
                                        : html`<ha-dropdown-item
                                            value="add-to-network"
                                          >
                                            ${this.hass.localize(
                                              "ui.panel.config.thread.add_to_my_network"
                                            )}
                                          </ha-dropdown-item>`
                                    }`
                                : ""
                            }
                          </ha-dropdown>`
                      : ""
                  }
                </ha-list-item>`;
              })}`
          : html`<div class="card-content no-routers">
              <ha-svg-icon .path=${mdiDevices}></ha-svg-icon>
              ${
                otbrForNetwork
                  ? html`${this.hass.localize(
                        "ui.panel.config.thread.no_routers_otbr_network"
                      )}
                      <ha-button
                        appearance="plain"
                        size="s"
                        .otbr=${otbrForNetwork}
                        @click=${this._resetBorderRouterEvent}
                        >${this.hass.localize(
                          "ui.panel.config.thread.reset_border_router"
                        )}</ha-button
                      >`
                  : this.hass.localize(
                      "ui.panel.config.thread.no_border_routers"
                    )
              }
            </div> `
      }
      ${
        network.dataset
          ? html`<ha-list-nav
              .ariaLabel=${this.hass.localize(
                "ui.panel.config.thread.network_info.nav_label",
                {
                  name: network.name || network.dataset.extended_pan_id,
                }
              )}
            >
              <ha-list-item-button
                href=${`/config/thread/network-info/${network.dataset.dataset_id}${window.location.search}`}
              >
                <ha-svg-icon
                  slot="start"
                  .path=${mdiInformationOutline}
                ></ha-svg-icon>
                <div slot="headline">
                  ${this.hass.localize(
                    "ui.panel.config.thread.network_info.title"
                  )}
                </div>
                <div slot="supporting-text">
                  ${this.hass.localize(
                    "ui.panel.config.thread.network_info.description"
                  )}
                </div>
                <ha-icon-next slot="end"></ha-icon-next>
              </ha-list-item-button>
            </ha-list-nav>`
          : nothing
      }
      ${
        network.dataset && !network.dataset.preferred
          ? html`<div class="card-actions">
              <ha-button
                size="s"
                .datasetId=${network.dataset.dataset_id}
                @click=${this._setPreferred}
                >${this.hass.localize(
                  "ui.panel.config.thread.thread_network_make_preferred"
                )}</ha-button
              >
            </div>`
          : ""
      }
    </ha-card>`;
  }

  private async _sendCredentials(ev) {
    const dataset = (ev.currentTarget as any).networkDataset as ThreadDataSet;
    if (!dataset) {
      return;
    }
    if (
      !dataset.preferred_extended_address &&
      !dataset.preferred_border_agent_id
    ) {
      showAlertDialog(this, {
        title: "Error",
        text: this.hass.localize("ui.panel.config.thread.no_preferred_router"),
      });
      return;
    }
    this.hass.auth.external!.fireMessage({
      type: "thread/store_in_platform_keychain",
      payload: {
        mac_extended_address: dataset.preferred_extended_address,
        border_agent_id: dataset.preferred_border_agent_id,
        active_operational_dataset: (
          await getThreadDataSetTLV(this.hass, dataset.dataset_id)
        ).tlv,
        extended_pan_id: dataset.extended_pan_id,
      },
    });
  }

  private _importExternalThreadCredentials() {
    this.hass.auth.external!.fireMessage({
      type: "thread/import_credentials",
    });
  }

  private _onImageError(ev) {
    ev.target.style.display = "none";
  }

  private _onImageLoad(ev) {
    ev.target.style.display = "";
  }

  hassSubscribe() {
    return [
      subscribeDiscoverThreadRouters(this.hass, (routers: ThreadRouter[]) => {
        this._routers = routers;
      }),
    ];
  }

  protected override firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);

    this._refresh();

    this._configEntryId = extractSearchParam("config_entry");
  }

  private _groupRoutersByNetwork = memoizeOne(
    (
      routers: ThreadRouter[],
      datasets: ThreadDataSet[]
    ): { preferred?: ThreadNetwork; networks: ThreadNetwork[] } => {
      let preferred: ThreadNetwork | undefined;
      const networks: Record<string, ThreadNetwork> = {};
      for (const router of routers) {
        const network = router.extended_pan_id;
        if (network in networks) {
          networks[network].routers!.push(router);
        } else {
          networks[network] = {
            name: router.network_name || "",
            routers: [router],
          };
        }
      }
      for (const dataset of datasets) {
        const network = dataset.extended_pan_id;
        if (!network) {
          continue;
        }
        if (dataset.preferred) {
          preferred = {
            name: dataset.network_name || "",
            dataset: dataset,
            routers: networks[network]?.routers,
          };
          delete networks[network];
          continue;
        }
        if (network in networks) {
          networks[network].dataset = dataset;
        } else {
          networks[network] = {
            name: dataset.network_name || "",
            dataset: dataset,
          };
        }
      }
      return {
        preferred,
        networks: Object.values(networks).sort((a, b) =>
          stringCompare(a.name, b.name, this.hass.locale.language)
        ),
      };
    }
  );

  private async _refresh() {
    listThreadDataSets(this.hass).then((datasets) => {
      this._datasets = datasets.datasets;
    });
    if (!isComponentLoaded(this.hass.config, "otbr")) {
      return;
    }
    try {
      this._otbrInfo = await getOTBRInfo(this.hass);
    } catch (_err) {
      this._otbrInfo = undefined;
    }
  }

  private async _signUrl(ev) {
    const anchor = ev.target.closest("a");
    ev.preventDefault();
    const signedUrl = await getSignedPath(
      this.hass,
      anchor.getAttribute("href")
    );
    fileDownload(signedUrl.path);
  }

  private _addOTBR() {
    showConfigFlowDialog(this, {
      dialogClosedCallback: () => {
        this._refresh();
      },
      startFlowHandler: "otbr",
    });
  }

  private _handleRouterAction(ev: HaDropdownSelectEvent) {
    const network = (ev.currentTarget as any).network as ThreadNetwork;
    const router = (ev.currentTarget as any).router as ThreadRouter;
    const otbr = (ev.currentTarget as any).otbr as OTBRInfo;
    const action = ev.detail.item.value;
    switch (action) {
      case "set-default":
        this._setPreferredBorderAgent(network.dataset!, router);
        break;
      case "reset-router":
        this._resetBorderRouter(otbr);
        break;
      case "change-channel":
        this._changeChannel(otbr);
        break;
      case "add-to-network":
        this._setDataset(otbr);
        break;
    }
  }

  private _resetBorderRouterEvent(ev) {
    const otbr = (ev.currentTarget as any).otbr as OTBRInfo;
    this._resetBorderRouter(otbr);
  }

  private async _resetBorderRouter(otbr: OTBRInfo) {
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.thread.confirm_reset_border_router"
      ),
      text: this.hass.localize(
        "ui.panel.config.thread.confirm_reset_border_router_text"
      ),
      destructive: true,
    });
    if (!confirm) {
      return;
    }
    try {
      await OTBRCreateNetwork(this.hass, otbr.extended_address);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.thread.otbr_config_failed"),
        text: err.message,
      });
    }
    this._refresh();
  }

  private async _setDataset(otbr: OTBRInfo) {
    const networks = this._groupRoutersByNetwork(this._routers, this._datasets);
    const preferedDatasetId = networks.preferred?.dataset?.dataset_id;
    if (!preferedDatasetId) {
      return;
    }
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.thread.confirm_set_dataset_border_router"
      ),
      text: this.hass.localize(
        "ui.panel.config.thread.confirm_set_dataset_border_router_text"
      ),
    });
    if (!confirm) {
      return;
    }
    try {
      await OTBRSetNetwork(this.hass, otbr.extended_address, preferedDatasetId);
    } catch (err: any) {
      showAlertDialog(this, {
        title: this.hass.localize("ui.panel.config.thread.otbr_config_failed"),
        text: err.message,
      });
    }
    this._refresh();
  }

  private async _setPreferred(ev) {
    const datasetId = ev.target.datasetId;
    await setPreferredThreadDataSet(this.hass, datasetId);
    this._refresh();
  }

  private async _setPreferredBorderAgent(
    dataset: ThreadDataSet,
    router: ThreadRouter
  ) {
    await setPreferredBorderAgent(
      this.hass,
      dataset.dataset_id,
      router.border_agent_id,
      router.extended_address
    );
    this._refresh();
  }

  private async _addTLV() {
    const tlv = await showPromptDialog(this, {
      title: this.hass.localize("ui.panel.config.thread.add_dataset"),
      inputLabel: this.hass.localize(
        "ui.panel.config.thread.add_dataset_label"
      ),
      confirmText: this.hass.localize(
        "ui.panel.config.thread.add_dataset_button"
      ),
    });
    if (!tlv) {
      return;
    }
    try {
      await addThreadDataSet(this.hass, "manual", tlv);
    } catch (err: any) {
      showAlertDialog(this, {
        title: "Error",
        text: err.message || err,
      });
    }
    this._refresh();
  }

  private async _removeDataset(ev: Event) {
    const dataset = (ev.currentTarget as any).networkDataset as ThreadDataSet;
    const confirm = await showConfirmationDialog(this, {
      title: this.hass.localize(
        "ui.panel.config.thread.confirm_delete_dataset",
        { name: dataset.network_name || dataset.extended_pan_id }
      ),
      text: this.hass.localize(
        "ui.panel.config.thread.confirm_delete_dataset_text"
      ),
      destructive: true,
      confirmName: dataset.network_name || undefined,
      confirmText: this.hass.localize("ui.common.delete"),
    });
    if (!confirm) {
      return;
    }
    try {
      await removeThreadDataSet(this.hass, dataset.dataset_id);
    } catch (err: any) {
      showAlertDialog(this, {
        title: "Error",
        text: err.message || err,
      });
    }
    this._refresh();
  }

  private async _changeChannel(otbr: OTBRInfo) {
    const currentChannel = otbr.channel;
    const channelStr = await showPromptDialog(this, {
      title: this.hass.localize("ui.panel.config.thread.change_channel"),
      text: this.hass.localize("ui.panel.config.thread.change_channel_text"),
      inputLabel: this.hass.localize(
        "ui.panel.config.thread.change_channel_label"
      ),
      confirmText: this.hass.localize("ui.panel.config.thread.change_channel"),
      inputType: "number",
      inputMin: "11",
      inputMax: "26",
      defaultValue: currentChannel ? currentChannel.toString() : undefined,
    });
    if (!channelStr) {
      return;
    }
    const channel = parseInt(channelStr);
    if (channel < 11 || channel > 26) {
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.thread.change_channel_invalid"
        ),
        text: this.hass.localize("ui.panel.config.thread.change_channel_range"),
      });
      return;
    }
    try {
      const result = await OTBRSetChannel(
        this.hass,
        otbr.extended_address,
        channel
      );
      showAlertDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.thread.change_channel_initiated_title"
        ),
        text: this.hass.localize(
          "ui.panel.config.thread.change_channel_initiated_text",
          { delay: Math.floor(result.delay / 60) }
        ),
      });
    } catch (err: any) {
      if (err.code === "multiprotocol_enabled") {
        showAlertDialog(this, {
          title: this.hass.localize(
            "ui.panel.config.thread.change_channel_multiprotocol_enabled_title"
          ),
          text: this.hass.localize(
            "ui.panel.config.thread.change_channel_multiprotocol_enabled_text"
          ),
        });
        return;
      }
      showAlertDialog(this, {
        title: "Error",
        text: err.message || err,
      });
    }
    this._refresh();
  }

  static styles = [
    haStyle,
    css`
      .page {
        box-sizing: border-box;
        max-width: 1100px;
        margin: 0 auto;
        padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        direction: ltr;
      }
      :host([narrow]) .page {
        padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
      }
      .hero {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
      }
      .hero-card {
        flex: 1;
        min-width: 240px;
        padding: var(--ha-space-5) var(--ha-space-6);
        border-radius: var(--ha-border-radius-3xl);
        background: var(
          --primary-container-color,
          var(--card-background-color)
        );
      }
      .eyebrow {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        font-size: var(--ha-font-size-s);
        font-weight: var(--ha-font-weight-medium);
        --mdc-icon-size: 20px;
      }
      h1 {
        margin: var(--ha-space-2) 0;
        font-family: var(--ha-font-family-heading, inherit);
        font-size: var(--ha-font-size-3xl);
        font-weight: var(--ha-font-weight-medium);
        line-height: var(--ha-line-height-condensed);
      }
      .hero p {
        margin: 0;
        line-height: var(--ha-line-height-normal);
      }
      .tiles {
        margin-bottom: var(--ha-space-4);
      }
      .layout {
        display: grid;
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        gap: var(--ha-space-6);
        align-items: start;
      }
      :host([narrow]) .layout {
        grid-template-columns: minmax(0, 1fr);
      }
      .main h2 {
        margin: var(--ha-space-4) 0 var(--ha-space-2);
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .main h2:first-child {
        margin-top: 0;
      }
      .side {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
      }
      .banner {
        display: flex;
        gap: var(--ha-space-3);
        align-items: flex-start;
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-xl, 16px);
        background: color-mix(in srgb, var(--success-color) 22%, transparent);
        line-height: var(--ha-line-height-normal);
      }
      .tools .tool {
        display: flex;
        align-items: center;
        gap: var(--ha-space-3);
        padding: var(--ha-space-3) var(--ha-space-4);
        color: inherit;
        text-decoration: none;
      }
      .tool-text {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .tool-text span {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      ha-list-item.router {
        --mdc-list-item-meta-size: auto;
        --mdc-list-item-meta-display: flex;
        --mdc-list-side-padding: 16px;
        cursor: default;
        overflow: visible;
      }
      ha-list-item img {
        border-radius: var(--ha-border-radius-square);
      }
      ha-svg-icon[slot="meta"] {
        width: 24px;
      }
      ha-dropdown a {
        text-decoration: none;
      }
      .routers {
        padding-bottom: 0;
      }
      .no-routers {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
      }
      .no-routers ha-svg-icon {
        background-color: var(--light-primary-color);
        color: var(--secondary-text-color);
        padding: 16px;
        border-radius: var(--ha-border-radius-circle);
        margin-bottom: 8px;
      }
      ha-card {
        margin-bottom: var(--ha-space-4);
        overflow: hidden;
        border-radius: var(--ha-border-radius-3xl);
      }
      .side ha-card {
        margin-bottom: 0;
      }
      ha-list-nav {
        border-top: 1px solid var(--divider-color);
      }
      h3 {
        margin-top: 0;
      }
      h4 {
        margin: 0;
      }
      .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      .card-header ha-icon-button {
        margin-block: calc(var(--ha-space-3) * -1);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "thread-config-panel": ThreadConfigPanel;
  }
}
