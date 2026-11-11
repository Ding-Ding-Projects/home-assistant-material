import { mdiDelete, mdiPlus } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import type {
  MinecraftHost,
  MinecraftServer,
  MinecraftTargetStatus,
  MinecraftVersionLists,
} from "../../../data/minecraft_manager";
import {
  deleteMinecraftServer,
  fetchMinecraftHosts,
  fetchMinecraftServers,
  fetchMinecraftTargets,
  fetchMinecraftVersions,
} from "../../../data/minecraft_manager";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-minecraft-hosts";
import "./ha-minecraft-server";
import "./ha-minecraft-wizard";

type View = "list" | "create" | "hosts" | "server";

@customElement("ha-config-minecraft")
class HaConfigMinecraft extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _servers?: MinecraftServer[];

  @state() private _targets: MinecraftTargetStatus[] = [];

  @state() private _hosts: MinecraftHost[] = [];

  @state() private _versions?: MinecraftVersionLists;

  @state() private _error?: string;

  @state() private _view: View = "list";

  @state() private _selectedId?: string;

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      const [servers, targets, hosts, versions] = await Promise.all([
        fetchMinecraftServers(this.hass),
        fetchMinecraftTargets(this.hass),
        fetchMinecraftHosts(this.hass),
        fetchMinecraftVersions(this.hass),
      ]);
      this._servers = servers.servers;
      this._targets = targets.targets;
      this._hosts = hosts.hosts;
      this._versions = versions;
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private async _reloadHosts(): Promise<void> {
    try {
      this._hosts = (await fetchMinecraftHosts(this.hass)).hosts;
    } catch (err: any) {
      showToast(this, { message: err?.message ?? String(err) });
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.${key}` as any,
      values
    );
  }

  private _show(view: View): void {
    this._view = view;
  }

  private _startCreate(): void {
    this._show("create");
  }

  private _openHosts(): void {
    this._show("hosts");
  }

  private async _closeSubview(): Promise<void> {
    this._show("list");
    await this._load();
  }

  private _open(ev: Event): void {
    this._selectedId = (ev.currentTarget as HTMLElement).dataset.server;
    this._show("server");
  }

  private async _wizardClosed(ev: CustomEvent<{ created: boolean }>) {
    this._show("list");
    if (ev.detail.created) {
      showToast(this, { message: this._l("created") });
      await this._load();
    }
  }

  private async _remove(ev: Event): Promise<void> {
    const server = this._servers?.find(
      (item) => item.id === (ev.currentTarget as HTMLElement).dataset.server
    );
    if (!server) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("delete_title"),
      text: this._l("delete_text", { name: server.name }),
      confirmText: this._l("delete"),
      dismissText: this._l("cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      await deleteMinecraftServer(this.hass, server.id);
      showToast(this, { message: this._l("deleted", { name: server.name }) });
      await this._load();
    } catch (err: any) {
      showToast(this, { message: err?.message ?? String(err) });
    }
  }

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config"
        .header=${this._l("title")}
      >
        ${this._renderView()}
      </hass-subpage>
    `;
  }

  private _renderView(): TemplateResult {
    if (this._view === "create") {
      return html`<ha-minecraft-wizard
        .hass=${this.hass}
        .targets=${this._targets}
        .hosts=${this._hosts}
        .versions=${this._versions}
        @minecraft-wizard-closed=${this._wizardClosed}
        @minecraft-wizard-open-hosts=${this._openHosts}
      ></ha-minecraft-wizard>`;
    }
    if (this._view === "hosts") {
      return html`<div class="content">
        <div class="row">
          <ha-button appearance="plain" @click=${this._closeSubview}
            >${this._l("back_to_servers")}</ha-button
          >
        </div>
        <h2>${this._l("hosts_title")}</h2>
        <ha-minecraft-hosts
          .hass=${this.hass}
          .hosts=${this._hosts}
          .usedHostIds=${(this._servers ?? [])
            .map((server) => server.host_id)
            .filter((id): id is string => Boolean(id))}
          @minecraft-hosts-changed=${this._reloadHosts}
        ></ha-minecraft-hosts>
      </div>`;
    }
    const selected = this._servers?.find(
      (item) => item.id === this._selectedId
    );
    if (this._view === "server" && selected) {
      return html`<ha-minecraft-server
        .hass=${this.hass}
        .server=${selected}
        .hosts=${this._hosts}
        @minecraft-server-close=${this._closeSubview}
        @minecraft-server-changed=${this._load}
      ></ha-minecraft-server>`;
    }
    return this._renderList();
  }

  private _renderList(): TemplateResult {
    if (this._error) {
      return html`<div class="content">
        <ha-alert alert-type="error">${this._error}</ha-alert>
      </div>`;
    }
    if (!this._servers) {
      return html`<div class="center">
        <ha-spinner .ariaLabel=${this._l("loading")}></ha-spinner>
      </div>`;
    }
    const servers = this._servers;
    return html`<div class="content">
      <p class="lead">
        ${
          servers.length
            ? this._l("summary_count", { count: servers.length })
            : this._l("intro")
        }
      </p>
      ${servers.length ? this._renderServers(servers) : this._renderEmpty()}
      <div class="row">
        ${
          servers.length
            ? html`<ha-button @click=${this._startCreate}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this._l("new_server")}
              </ha-button>`
            : nothing
        }
        <ha-button appearance="plain" @click=${this._openHosts}
          >${this._l("hosts_manage", { count: this._hosts.length })}</ha-button
        >
      </div>
    </div>`;
  }

  private _renderEmpty(): TemplateResult {
    return html`<div class="empty">
      <h2>${this._l("empty_title")}</h2>
      <p>${this._l("empty_text")}</p>
      <ha-button @click=${this._startCreate}>
        <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
        ${this._l("new_server")}
      </ha-button>
    </div>`;
  }

  private _renderServers(servers: MinecraftServer[]): TemplateResult {
    return html`<ul class="servers">
      ${servers.map(
        (server) =>
          html`<li class="server">
            <div class="text">
              <span class="name">${server.name}</span>
              <span class="detail"
                >${this._l("server_detail", {
                  edition: this._l(`edition.${server.edition}`),
                  flavour: this._l(`flavour.${server.flavour}`),
                  version: server.version,
                  port: server.port,
                  target: this._l(`target.${server.target}.name`),
                })}</span
              >
            </div>
            <ha-button
              appearance="plain"
              data-server=${server.id}
              @click=${this._open}
              >${this._l("open")}</ha-button
            >
            <ha-icon-button
              .path=${mdiDelete}
              .label=${this._l("delete_named", { name: server.name })}
              data-server=${server.id}
              @click=${this._remove}
            ></ha-icon-button>
          </li>`
      )}
    </ul>`;
  }

  static styles = [
    haStyle,
    css`
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-4);
        max-width: 900px;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .center {
        display: flex;
        justify-content: center;
        padding: var(--ha-space-8, 32px);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      h2 {
        margin: 0;
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
      }
      .lead {
        margin: 0;
        color: var(--secondary-text-color);
      }
      .empty {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: var(--ha-space-2);
        padding: var(--ha-space-6, 24px);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .empty h2,
      .empty p {
        margin: 0;
      }
      .servers {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .server {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .text {
        display: flex;
        flex-direction: column;
        flex: 1 1 200px;
        min-width: 0;
      }
      .name {
        overflow-wrap: anywhere;
        font-weight: var(--ha-font-weight-medium);
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
    "ha-config-minecraft": HaConfigMinecraft;
  }
}
