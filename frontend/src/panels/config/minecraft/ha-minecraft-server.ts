import { mdiContentCopy } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/input/ha-input";
import type {
  MinecraftHost,
  MinecraftServer,
  MinecraftServerAction,
  MinecraftStatus,
} from "../../../data/minecraft_manager";
import {
  deleteMinecraftData,
  fetchMinecraftLogs,
  fetchMinecraftStatus,
  isMinecraftFailure,
  MINECRAFT_EULA_URL,
  MINECRAFT_IMAGE,
  minecraftJoinAddress,
  runMinecraftAction,
  setMinecraftEula,
} from "../../../data/minecraft_manager";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

const LOG_LINES = 150;
const LOG_REFRESH_MS = 5000;
const STATUS_REFRESH_MS = 10000;

/** One server: its state, the controls, the address to join and its log. */
@customElement("ha-minecraft-server")
class HaMinecraftServer extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public server!: MinecraftServer;

  @property({ attribute: false }) public hosts: MinecraftHost[] = [];

  @state() private _status?: MinecraftStatus;

  @state() private _code?: string;

  @state() private _busy?: MinecraftServerAction | "data";

  @state() private _lines: string[] = [];

  @state() private _logCode?: string;

  @state() private _paused = false;

  @state() private _confirmName = "";

  private _statusTimer?: number;

  private _logTimer?: number;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.${key}` as any,
      values
    );
  }

  private _codeText(code: string): string {
    return this._l(`op_error.${code}`) || this._l("op_error.unknown");
  }

  private get _supported(): boolean {
    return (
      this.server.target === "ssh_docker" && this.server.edition === "java"
    );
  }

  public connectedCallback(): void {
    super.connectedCallback();
    if (this._supported) {
      this._refreshStatus();
      this._refreshLogs();
      this._statusTimer = window.setInterval(
        () => this._refreshStatus(),
        STATUS_REFRESH_MS
      );
      this._logTimer = window.setInterval(() => {
        if (!this._paused && !this._busy) {
          this._refreshLogs();
        }
      }, LOG_REFRESH_MS);
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._statusTimer);
    window.clearInterval(this._logTimer);
  }

  private async _refreshStatus(): Promise<void> {
    if (this._busy) {
      return;
    }
    try {
      const result = await fetchMinecraftStatus(this.hass, this.server.id);
      if (isMinecraftFailure(result)) {
        this._code = result.code;
        this._status = undefined;
      } else {
        this._code = undefined;
        this._status = result;
      }
    } catch {
      this._code = "unknown";
    }
  }

  private async _refreshLogs(): Promise<void> {
    try {
      const result = await fetchMinecraftLogs(
        this.hass,
        this.server.id,
        LOG_LINES
      );
      if (isMinecraftFailure(result)) {
        // An absent container has no log; that is not an error to show.
        this._logCode =
          result.code === "container_not_found" ? undefined : result.code;
        this._lines = [];
      } else {
        this._logCode = undefined;
        this._lines = result.lines;
      }
    } catch {
      this._logCode = "unknown";
    }
  }

  private async _act(ev: Event): Promise<void> {
    const action = (ev.currentTarget as HTMLElement).dataset
      .action as MinecraftServerAction;
    if (action === "remove_container") {
      const confirmed = await showConfirmationDialog(this, {
        title: this._l("detail.remove_title"),
        text: this._l("detail.remove_text", { name: this.server.name }),
        confirmText: this._l("detail.remove"),
        dismissText: this._l("cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    this._busy = action;
    this._code = undefined;
    try {
      const result = await runMinecraftAction(
        this.hass,
        this.server.id,
        action
      );
      if (isMinecraftFailure(result)) {
        this._code = result.code;
      } else if ("state" in result) {
        this._status = result;
      }
    } catch {
      this._code = "unknown";
    } finally {
      this._busy = undefined;
    }
    await this._refreshStatus();
    await this._refreshLogs();
  }

  private async _eulaChanged(ev: Event): Promise<void> {
    const accepted = (ev.target as HTMLInputElement).checked;
    try {
      const result = await setMinecraftEula(
        this.hass,
        this.server.id,
        accepted
      );
      this.server = result.server;
      fireEvent(this, "minecraft-server-changed");
    } catch {
      this._code = "unknown";
    }
  }

  private async _copy(ev: Event): Promise<void> {
    await copyToClipboard(
      (ev.currentTarget as HTMLElement).dataset.copy ?? "",
      this
    );
    showToast(this, { message: this.hass.localize("ui.common.copied") });
  }

  private async _copyLog(): Promise<void> {
    await copyToClipboard(this._lines.join("\n"), this);
    showToast(this, { message: this.hass.localize("ui.common.copied") });
  }

  private _togglePause(): void {
    this._paused = !this._paused;
    if (!this._paused) {
      this._refreshLogs();
    }
  }

  private _confirmInput(ev: Event): void {
    this._confirmName = (ev.target as HTMLInputElement).value ?? "";
  }

  private async _deleteData(): Promise<void> {
    this._busy = "data";
    this._code = undefined;
    try {
      const result = await deleteMinecraftData(
        this.hass,
        this.server.id,
        this._confirmName
      );
      if (isMinecraftFailure(result)) {
        this._code = result.code;
      } else {
        this._confirmName = "";
        showToast(this, { message: this._l("detail.data_deleted") });
      }
    } catch {
      this._code = "unknown";
    } finally {
      this._busy = undefined;
    }
  }

  private _back(): void {
    fireEvent(this, "minecraft-server-close");
  }

  private _host(): MinecraftHost | undefined {
    return this.hosts.find((item) => item.id === this.server.host_id);
  }

  protected render(): TemplateResult {
    const server = this.server;
    return html`<div class="content">
      <div class="row">
        <ha-button appearance="plain" @click=${this._back}
          >${this._l("back_to_servers")}</ha-button
        >
      </div>
      <header>
        <h2>${server.name}</h2>
        <p class="detail">
          ${this._l("server_detail", {
            edition: this._l(`edition.${server.edition}`),
            flavour: this._l(`flavour.${server.flavour}`),
            version: server.version,
            port: server.port,
            target: this._l(`target.${server.target}.name`),
          })}
        </p>
      </header>
      ${this._supported ? this._renderManaged() : this._renderUnsupported()}
    </div>`;
  }

  private _renderUnsupported(): TemplateResult {
    return html`<ha-alert alert-type="info"
      >${this._l(
        this.server.edition === "bedrock"
          ? "detail.bedrock_unsupported"
          : "detail.target_unsupported"
      )}</ha-alert
    >`;
  }

  private _renderManaged(): TemplateResult {
    const server = this.server;
    const status = this._status;
    const runState = status?.state;
    const host = this._host();
    const busy = Boolean(this._busy);
    return html`
      ${
        host
          ? nothing
          : html`<ha-alert alert-type="warning"
              >${this._l("detail.no_host")}</ha-alert
            >`
      }
      <div class="state-row">
        <span class=${classMap({ tag: true, [runState ?? "unknown"]: true })}
          >${this._l(`state.${runState ?? "unknown"}`)}</span
        >
        ${
          busy
            ? html`<ha-spinner
                size="small"
                .ariaLabel=${this._l("detail.working")}
              ></ha-spinner>`
            : nothing
        }
        <span class="grow"></span>
        ${
          runState === "running" || runState === "starting"
            ? html`<ha-button
                  appearance="plain"
                  .disabled=${busy}
                  data-action="restart"
                  @click=${this._act}
                  >${this._l("detail.restart")}</ha-button
                >
                <ha-button
                  appearance="filled"
                  .disabled=${busy}
                  data-action="stop"
                  @click=${this._act}
                  >${this._l("detail.stop")}</ha-button
                >`
            : html`<ha-button
                .disabled=${busy || !host || !server.eula_accepted}
                data-action="start"
                @click=${this._act}
                >${this._l("detail.start")}</ha-button
              >`
        }
      </div>
      ${
        this._code
          ? html`<ha-alert alert-type="error"
              >${this._codeText(this._code)}</ha-alert
            >`
          : nothing
      }
      ${this._renderEula()} ${this._renderAddress(status)}
      <p class="detail">
        ${this._l("detail.image_note", { image: MINECRAFT_IMAGE })}
        ${this._l("detail.settings_note")}
      </p>
      ${this._renderLogs()} ${this._renderDanger(runState)}
    `;
  }

  private _renderEula(): TemplateResult {
    return html`<section class="card">
      <label class="check">
        <input
          type="checkbox"
          .checked=${Boolean(this.server.eula_accepted)}
          @change=${this._eulaChanged}
        />
        <span>${this._l("detail.eula_accept")}</span>
      </label>
      <p class="detail">
        ${this._l("detail.eula_text", { url: MINECRAFT_EULA_URL })}
      </p>
    </section>`;
  }

  private _renderAddress(
    status?: MinecraftStatus
  ): TemplateResult | typeof nothing {
    if (!status || status.state === "absent") {
      return nothing;
    }
    const join = minecraftJoinAddress(status.address, status.port);
    return html`<section class="card">
      <h3>${this._l("detail.address_title")}</h3>
      <div class="code">
        <code>${join}</code>
        <ha-icon-button
          .path=${mdiContentCopy}
          .label=${this._l("detail.copy_address")}
          data-copy=${join}
          @click=${this._copy}
        ></ha-icon-button>
      </div>
      <p class="detail">
        ${this._l("detail.address_lan", {
          address: status.address,
          port: status.port,
        })}
      </p>
      ${
        status.state === "running"
          ? status.reachable
            ? html`<ha-alert alert-type="success"
                >${this._l("detail.reachable")}</ha-alert
              >`
            : html`<ha-alert alert-type="warning"
                >${this._l("detail.not_reachable")}</ha-alert
              >`
          : nothing
      }
    </section>`;
  }

  private _renderLogs(): TemplateResult {
    return html`<section class="card">
      <div class="row">
        <h3 class="grow">${this._l("detail.log_title")}</h3>
        <ha-button appearance="plain" @click=${this._togglePause}
          >${this._l(this._paused ? "detail.resume" : "detail.pause")}</ha-button
        >
        <ha-button
          appearance="plain"
          .disabled=${!this._lines.length}
          @click=${this._copyLog}
          >${this._l("detail.copy_log")}</ha-button
        >
      </div>
      ${
        this._logCode
          ? html`<ha-alert alert-type="warning"
              >${this._codeText(this._logCode)}</ha-alert
            >`
          : nothing
      }
      <pre class="log" tabindex="0" aria-label=${this._l("detail.log_title")}>
${
          this._lines.length
            ? this._lines.join("\n")
            : this._l("detail.log_empty")
        }</pre>
      <p class="detail">
        ${this._l(this._paused ? "detail.log_paused" : "detail.log_live")}
      </p>
    </section>`;
  }

  private _renderDanger(current?: string): TemplateResult {
    const busy = Boolean(this._busy);
    return html`<section class="card danger">
      <h3>${this._l("detail.danger_title")}</h3>
      <p class="detail">${this._l("detail.remove_info")}</p>
      <div class="row">
        <ha-button
          appearance="plain"
          .disabled=${busy || current !== "stopped"}
          data-action="remove_container"
          @click=${this._act}
          >${this._l("detail.remove")}</ha-button
        >
      </div>
      <p class="detail">${this._l("detail.data_info")}</p>
      <ha-input
        .label=${this._l("detail.confirm_label")}
        .hint=${this._l("detail.confirm_hint", { name: this.server.name })}
        .value=${this._confirmName}
        @input=${this._confirmInput}
      ></ha-input>
      <div class="row">
        <ha-button
          appearance="plain"
          variant="danger"
          .disabled=${
            busy ||
            current !== "absent" ||
            this._confirmName !== this.server.name
          }
          @click=${this._deleteData}
          >${this._l("detail.delete_data")}</ha-button
        >
      </div>
    </section>`;
  }

  static styles = [
    haStyle,
    css`
      :host {
        display: block;
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        padding: var(--ha-space-4);
        max-width: 900px;
        margin: 0 auto;
        box-sizing: border-box;
      }
      h2,
      h3,
      p {
        margin: 0;
      }
      h2 {
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
        overflow-wrap: anywhere;
      }
      h3 {
        font-size: var(--ha-font-size-l);
        font-weight: var(--ha-font-weight-medium);
      }
      .detail {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      .row,
      .state-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--ha-space-2);
      }
      .grow {
        flex: 1;
      }
      .tag {
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: 14px;
        background: var(--secondary-background-color);
        font-weight: var(--ha-font-weight-medium);
      }
      .tag.running {
        background: var(--success-color);
        color: var(--text-primary-color);
      }
      .tag.starting {
        background: var(--warning-color);
        color: var(--text-primary-color);
      }
      .card {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-3) var(--ha-space-4);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
        min-width: 0;
      }
      .card.danger {
        border: 1px solid var(--error-color);
      }
      .check {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-3);
        min-height: 44px;
        cursor: pointer;
      }
      .check input {
        width: 20px;
        height: 20px;
        margin: 2px 0 0;
        flex: none;
      }
      .code {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-1) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--card-background-color);
      }
      .code code {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-l);
      }
      .log {
        margin: 0;
        padding: var(--ha-space-2) var(--ha-space-3);
        max-height: 320px;
        overflow: auto;
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--card-background-color);
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
        white-space: pre-wrap;
        overflow-wrap: anywhere;
      }
      .log:focus-visible {
        outline: 2px solid var(--primary-color);
      }
      ha-input {
        width: 100%;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-minecraft-server": HaMinecraftServer;
  }
  interface HASSDomEvents {
    "minecraft-server-close": undefined;
    "minecraft-server-changed": undefined;
  }
}
