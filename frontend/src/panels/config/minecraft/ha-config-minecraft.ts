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
  MinecraftServer,
  MinecraftTargetStatus,
} from "../../../data/minecraft_manager";
import {
  deleteMinecraftServer,
  fetchMinecraftServers,
  fetchMinecraftTargets,
} from "../../../data/minecraft_manager";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-minecraft-wizard";

@customElement("ha-config-minecraft")
class HaConfigMinecraft extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() private _servers?: MinecraftServer[];

  @state() private _targets: MinecraftTargetStatus[] = [];

  @state() private _error?: string;

  @state() private _creating = false;

  protected firstUpdated(): void {
    this._load();
  }

  private async _load(): Promise<void> {
    try {
      const [servers, targets] = await Promise.all([
        fetchMinecraftServers(this.hass),
        fetchMinecraftTargets(this.hass),
      ]);
      this._servers = servers.servers;
      this._targets = targets.targets;
      this._error = undefined;
    } catch (err: any) {
      this._error = err?.message ?? String(err);
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.${key}` as any,
      values
    );
  }

  private _startCreate(): void {
    this._creating = true;
  }

  private async _wizardClosed(ev: CustomEvent<{ created: boolean }>) {
    this._creating = false;
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
        ${
          this._creating
            ? html`<ha-minecraft-wizard
                .hass=${this.hass}
                .targets=${this._targets}
                @minecraft-wizard-closed=${this._wizardClosed}
              ></ha-minecraft-wizard>`
            : this._renderList()
        }
      </hass-subpage>
    `;
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
        ${servers.length ? this._l("summary_count", { count: servers.length }) : this._l("intro")}
      </p>
      <ha-alert alert-type="info">${this._l("not_started_note")}</ha-alert>
      ${servers.length ? this._renderServers(servers) : this._renderEmpty()}
      ${
        servers.length
          ? html`<div class="add">
              <ha-button @click=${this._startCreate}>
                <ha-svg-icon slot="start" .path=${mdiPlus}></ha-svg-icon>
                ${this._l("new_server")}
              </ha-button>
            </div>`
          : nothing
      }
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
            <span class="tag">${this._l("state_defined")}</span>
            <ha-button appearance="plain" disabled
              >${this._l("start_unavailable")}</ha-button
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
      .tag {
        flex: none;
        padding: 0 var(--ha-space-2);
        border-radius: 12px;
        background: var(--card-background-color);
        font-size: var(--ha-font-size-xs, 12px);
        color: var(--secondary-text-color);
      }
      .add {
        display: flex;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-minecraft": HaConfigMinecraft;
  }
}
