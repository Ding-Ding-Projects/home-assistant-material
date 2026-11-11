import { mdiContentCopy } from "@mdi/js";
import type { TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { fireEvent } from "../../../common/dom/fire_event";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-checkbox";
import type { HaCheckbox } from "../../../components/ha-checkbox";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-tab-group";
import "../../../components/ha-tab-group-tab";
import "../../../components/input/ha-input";
import type {
  MinecraftHost,
  MinecraftServer,
  MinecraftServerAction,
  MinecraftStatus,
  MinecraftVersionLists,
} from "../../../data/minecraft_manager";
import {
  canForceDeleteMinecraftServer,
  deleteMinecraftData,
  deleteMinecraftServer,
  fetchMinecraftLogs,
  fetchMinecraftStatus,
  isMinecraftFailure,
  MINECRAFT_EULA_URL,
  minecraftImageFor,
  MinecraftPollGuard,
  minecraftJoinAddress,
  runMinecraftAction,
  setMinecraftEula,
  shouldPollMinecraftLogs,
} from "../../../data/minecraft_manager";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import "./ha-minecraft-server-settings";

const LOG_LINES = 150;
const LOG_REFRESH_MS = 5000;
const STATUS_REFRESH_MS = 10000;

const TABS = ["overview", "logs", "settings", "danger"] as const;
type Tab = (typeof TABS)[number];

/** One server: its state, the controls, and a tab for each kind of work. */
@customElement("ha-minecraft-server")
class HaMinecraftServer extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public server!: MinecraftServer;

  @property({ attribute: false }) public hosts: MinecraftHost[] = [];

  @property({ attribute: false }) public versions?: MinecraftVersionLists;

  @state() private _tab: Tab = "overview";

  @state() private _status?: MinecraftStatus;

  @state() private _code?: string;

  @state() private _busy?: MinecraftServerAction | "data" | "definition";

  @state() private _lines: string[] = [];

  @state() private _logCode?: string;

  @state() private _paused = false;

  @state() private _wrap = true;

  @state() private _confirmName = "";

  @query("pre.log") private _logBox?: HTMLElement;

  private _statusGuard = new MinecraftPollGuard();

  private _logGuard = new MinecraftPollGuard();

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
      this._statusTimer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          this._refreshStatus();
        }
      }, STATUS_REFRESH_MS);
      this._logTimer = window.setInterval(() => {
        if (this._shouldPollLogs()) {
          this._refreshLogs();
        }
      }, LOG_REFRESH_MS);
    }
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._statusTimer);
    window.clearInterval(this._logTimer);
    this._statusGuard.invalidate();
    this._logGuard.invalidate();
  }

  private _shouldPollLogs(): boolean {
    return shouldPollMinecraftLogs({
      tab: this._tab,
      pageVisible: document.visibilityState === "visible",
      paused: this._paused,
      busy: Boolean(this._busy),
    });
  }

  private _tabChanged(ev: CustomEvent): void {
    const tab = ev.detail.name as Tab;
    if (!TABS.includes(tab) || tab === this._tab) {
      return;
    }
    this._tab = tab;
    if (tab === "logs" && this._supported) {
      this._refreshLogs();
    }
  }

  private async _refreshStatus(): Promise<void> {
    if (this._busy) {
      return;
    }
    const ticket = this._statusGuard.begin();
    if (!ticket) {
      return;
    }
    try {
      const result = await fetchMinecraftStatus(this.hass, this.server.id);
      if (!this._statusGuard.isCurrent(ticket)) {
        return;
      }
      if (isMinecraftFailure(result)) {
        this._code = result.code;
        this._status = undefined;
      } else {
        this._code = undefined;
        this._status = result;
      }
    } catch {
      if (this._statusGuard.isCurrent(ticket)) {
        this._code = "unknown";
      }
    } finally {
      this._statusGuard.end(ticket);
    }
  }

  private async _refreshLogs(): Promise<void> {
    const ticket = this._logGuard.begin();
    if (!ticket) {
      return;
    }
    try {
      const result = await fetchMinecraftLogs(
        this.hass,
        this.server.id,
        LOG_LINES
      );
      if (!this._logGuard.isCurrent(ticket)) {
        return;
      }
      const follow = this._logAtBottom();
      if (isMinecraftFailure(result)) {
        // An absent container has no log; that is not an error to show.
        this._logCode =
          result.code === "container_not_found" ? undefined : result.code;
        this._lines = [];
      } else {
        this._logCode = undefined;
        this._lines = result.lines;
      }
      if (follow) {
        await this.updateComplete;
        if (this._logBox) {
          this._logBox.scrollTop = this._logBox.scrollHeight;
        }
      }
    } catch {
      if (this._logGuard.isCurrent(ticket)) {
        this._logCode = "unknown";
      }
    } finally {
      this._logGuard.end(ticket);
    }
  }

  /** Whether the log box is scrolled to its end, or not shown yet. */
  private _logAtBottom(): boolean {
    const box = this._logBox;
    if (!box) {
      return true;
    }
    return box.scrollHeight - box.scrollTop - box.clientHeight <= 24;
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
    if (action === "stop" || action === "restart") {
      const confirmed = await showConfirmationDialog(this, {
        title: this._l(`detail.${action}_title`),
        text: this._l(`detail.${action}_text`, { name: this.server.name }),
        confirmText: this._l(`detail.${action}`),
        dismissText: this._l("cancel"),
        destructive: true,
      });
      if (!confirmed) {
        return;
      }
    }
    this._statusGuard.invalidate();
    this._logGuard.invalidate();
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
      this._statusGuard.invalidate();
      this._logGuard.invalidate();
    }
    await this._refreshStatus();
    if (this._tab === "logs") {
      await this._refreshLogs();
    }
  }

  private async _eulaChanged(ev: Event): Promise<void> {
    const accepted = (ev.target as HaCheckbox).checked;
    try {
      const result = await setMinecraftEula(
        this.hass,
        this.server.id,
        accepted
      );
      this.server = result.server;
      fireEvent(this, "minecraft-server-changed");
    } catch {
      (ev.target as HTMLInputElement).checked = !accepted;
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

  private _toggleWrap(): void {
    this._wrap = !this._wrap;
  }

  private _confirmInput(ev: Event): void {
    this._confirmName = (ev.target as HTMLInputElement).value ?? "";
  }

  private async _deleteData(): Promise<void> {
    this._statusGuard.invalidate();
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
      this._statusGuard.invalidate();
    }
    await this._refreshStatus();
  }

  /** Removes the definition. `force` is offered only for an unreachable host. */
  private async _deleteDefinition(): Promise<void> {
    const name = this.server.name;
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("delete_title"),
      text: this._l("delete_text", { name }),
      confirmText: this._l("delete"),
      dismissText: this._l("cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = "definition";
    this._code = undefined;
    try {
      let result = await deleteMinecraftServer(this.hass, this.server.id);
      if (
        isMinecraftFailure(result) &&
        canForceDeleteMinecraftServer(result.code)
      ) {
        const anyway = await showConfirmationDialog(this, {
          title: this._l("delete_unverified_title"),
          text: this._l("delete_unverified_text", { name }),
          confirmText: this._l("delete_anyway"),
          dismissText: this._l("cancel"),
          destructive: true,
        });
        if (!anyway) {
          return;
        }
        result = await deleteMinecraftServer(this.hass, this.server.id, true);
      }
      if (isMinecraftFailure(result)) {
        this._code = result.code;
        return;
      }
      showToast(this, { message: this._l("deleted", { name }) });
      fireEvent(this, "minecraft-server-closed-deleted");
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
      >
      <section class="card danger">
        <h3>${this._l("detail.tab.danger")}</h3>
        ${this._renderDefinitionDelete()}
      </section>`;
  }

  private _renderManaged(): TemplateResult {
    const server = this.server;
    const runState = this._status?.state;
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
      <ha-tab-group @wa-tab-show=${this._tabChanged}>
        ${TABS.map(
          (tab) => html`
            <ha-tab-group-tab
              slot="nav"
              .active=${this._tab === tab}
              .panel=${tab}
            >
              ${this._l(`detail.tab.${tab}`)}
            </ha-tab-group-tab>
          `
        )}
      </ha-tab-group>
      ${this._renderTab(runState)}
    `;
  }

  private _renderTab(runState?: string): TemplateResult {
    switch (this._tab) {
      case "logs":
        return this._renderLogs();
      case "settings":
        return html`<section class="card">
          <ha-minecraft-server-settings
            .hass=${this.hass}
            .server=${this.server}
            .versions=${this.versions}
          ></ha-minecraft-server-settings>
        </section>`;
      case "danger":
        return this._renderDanger(runState);
      default:
        return this._renderOverview();
    }
  }

  private _renderOverview(): TemplateResult {
    const server = this.server;
    const host = this._host();
    return html`
      <section class="card">
        <dl class="facts">
          <div>
            <dt>${this._l("field.version")}</dt>
            <dd>${server.version}</dd>
          </div>
          <div>
            <dt>${this._l("field.memory")}</dt>
            <dd>
              ${this._l("detail.memory_value", { memory: server.memory_mb })}
            </dd>
          </div>
          <div>
            <dt>${this._l("field.host")}</dt>
            <dd>${host ? host.name : this._l("detail.no_host_short")}</dd>
          </div>
          <div>
            <dt>${this._l("field.port")}</dt>
            <dd>${server.port}</dd>
          </div>
        </dl>
      </section>
      ${this._renderEula()} ${this._renderAddress(this._status)}
      <p class="detail">
        ${this._l("detail.image_note", { image: minecraftImageFor(server.version) })}
      </p>
    `;
  }

  private _renderEula(): TemplateResult {
    return html`<section class="card">
      <ha-checkbox
        class="check"
        .checked=${Boolean(this.server.eula_accepted)}
        @change=${this._eulaChanged}
        >${this._l("detail.eula_accept")}</ha-checkbox
      >
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
        <ha-button appearance="plain" @click=${this._refreshLogs}
          >${this._l("detail.refresh_log")}</ha-button
        >
        <ha-button appearance="plain" @click=${this._togglePause}
          >${this._l(this._paused ? "detail.resume" : "detail.pause")}</ha-button
        >
        <ha-button appearance="plain" @click=${this._toggleWrap}
          >${this._l(this._wrap ? "detail.no_wrap" : "detail.wrap")}</ha-button
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
      <pre
        class=${classMap({ log: true, wrap: this._wrap })}
        tabindex="0"
        aria-label=${this._l("detail.log_title")}
      >
${
          this._lines.length
            ? this._lines.join("\n")
            : this._l("detail.log_empty")
        }</pre>
      <p class="detail">
        ${this._l("detail.log_last_part", { count: LOG_LINES })}
      </p>
      <p class="detail">
        ${this._l(this._paused ? "detail.log_paused" : "detail.log_live")}
      </p>
    </section>`;
  }

  private _renderDefinitionDelete(): TemplateResult {
    const busy = Boolean(this._busy);
    return html`<p class="detail">${this._l("detail.definition_info")}</p>
      <div class="row">
        <ha-button
          appearance="plain"
          variant="danger"
          .disabled=${busy}
          @click=${this._deleteDefinition}
          >${this._l("detail.delete_definition")}</ha-button
        >
      </div>`;
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
      ${this._renderDefinitionDelete()}
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
      ha-tab-group {
        display: block;
        min-width: 0;
        max-width: 100%;
        border-bottom: 1px solid var(--divider-color);
      }
      ha-tab-group-tab::part(base) {
        min-height: 44px;
        padding: 2px 16px;
      }
      @media (max-width: 400px) {
        ha-tab-group-tab::part(base) {
          padding: 2px 12px;
        }
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
      .facts {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(min(100%, 160px), 1fr));
        gap: var(--ha-space-3);
        margin: 0;
      }
      .facts dt {
        color: var(--secondary-text-color);
        font-size: var(--ha-font-size-s);
      }
      .facts dd {
        margin: 0;
        overflow-wrap: anywhere;
        font-weight: var(--ha-font-weight-medium);
      }
      .check {
        display: flex;
        align-items: flex-start;
        gap: var(--ha-space-3);
        min-height: 44px;
        cursor: pointer;
        --ha-checkbox-min-touch-size: 44px;
      }
      .check::part(base) {
        flex: 1;
        min-height: 44px;
        cursor: pointer;
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
        white-space: pre;
      }
      .log.wrap {
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
    "minecraft-server-closed-deleted": undefined;
  }
}
