import {
  mdiAlertCircleOutline,
  mdiCheckCircleOutline,
  mdiUpload,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { formatTime24h } from "../../../common/datetime/format_time";
import { fireEvent } from "../../../common/dom/fire_event";
import type { LocalizeFunc } from "../../../common/translations/localize";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-button-toggle-group";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type {
  ProblemSendMode,
  ProblemSendSettings,
  ProblemSendState,
} from "../../../data/problem_log_send";
import {
  cancelProblemSendDeviceSignIn,
  fetchProblemSendState,
  previewProblemSend,
  sendProblemLogNow,
  setProblemSendToken,
  signOutProblemSend,
  startProblemSendDeviceSignIn,
  testProblemSend,
  updateProblemSendSettings,
} from "../../../data/problem_log_send";
import { showToast } from "../../../util/toast";
import type { HomeAssistant, ToggleButton } from "../../../types";
import {
  minutesLeft,
  sendReadiness,
  shortAddress,
} from "./problem-log-send-logic";

declare global {
  interface HASSDomEvents {
    "problem-send-state": ProblemSendState;
  }
  interface HTMLElementTagNameMap {
    "ha-problem-log-send": HaProblemLogSend;
  }
}

const KNOWN_ERRORS = new Set([
  "token_refused",
  "repository_missing",
  "repository_public",
  "visibility_unknown",
  "no_write",
  "unreachable",
  "rate_limited",
  "host_error",
  "redaction_failed",
  "not_signed_in",
  "no_repository",
  "off",
  "too_soon",
  "nothing_new",
  "no_client_id",
  "busy",
]);

/**
 * Sending the problem log to a private repository.
 *
 * `section="status"` draws the status card, the settings and the failure and
 * public-repository cards above the list; `section="actions"` draws the send bar
 * and "See what is sent" below it. Both read the same state from the page and
 * report a new state with `problem-send-state`.
 */
@customElement("ha-problem-log-send")
export class HaProblemLogSend extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public localize!: LocalizeFunc;

  @property({ attribute: false }) public sendState?: ProblemSendState;

  @property() public section: "status" | "actions" = "status";

  /** Opens the settings when it becomes true, as when arriving from the search. */
  @property({ type: Boolean, attribute: false }) public openSettings = false;

  @state() private _settingsOpen = false;

  @state() private _useToken = false;

  @state() private _repository = "";

  @state() private _token = "";

  @state() private _clientId = "";

  @state() private _busy = false;

  @state() private _message?: { type: "error" | "success"; text: string };

  @state() private _preview?: Record<string, string>;

  @state() private _previewOpen = false;

  @state() private _now = new Date();

  private _tick?: number;

  private _poll?: number;

  public connectedCallback(): void {
    super.connectedCallback();
    this._tick = window.setInterval(() => {
      this._now = new Date();
    }, 30000);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearInterval(this._tick);
    window.clearTimeout(this._poll);
  }

  protected willUpdate(changed: PropertyValues<this>): void {
    if (changed.has("openSettings") && this.openSettings) {
      this._settingsOpen = true;
    }
    if (changed.has("sendState") && this.sendState) {
      const old = changed.get("sendState") as ProblemSendState | undefined;
      if (!old || old.repository !== this.sendState.repository) {
        this._repository = this.sendState.repository;
      }
      if (!old || old.client_id !== this.sendState.client_id) {
        this._clientId = this.sendState.client_id;
      }
      this._schedulePoll();
    }
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.localize(
      `ui.panel.config.problem_log.send.${key}` as any,
      values
    );
  }

  private _time(value: string | Date | null | undefined): string {
    if (!value) {
      return "";
    }
    const date = typeof value === "string" ? new Date(value) : value;
    return formatTime24h(date, this.hass.locale, this.hass.config);
  }

  private _errorText(code: string): string {
    return KNOWN_ERRORS.has(code)
      ? this._l(`error.${code}`)
      : this._l("error.unknown", { code });
  }

  private _schedulePoll(): void {
    window.clearTimeout(this._poll);
    const device = this.sendState?.device;
    if (
      this.section !== "status" ||
      !device ||
      (device.state !== "pending" && device.state !== "slow_down")
    ) {
      return;
    }
    this._poll = window.setTimeout(
      () => this._refresh(),
      Math.max(device.interval, 3) * 1000
    );
  }

  private async _refresh(): Promise<void> {
    try {
      fireEvent(
        this,
        "problem-send-state",
        await fetchProblemSendState(this.hass)
      );
    } catch (_err) {
      // The next refresh of the page tries again.
    }
  }

  private async _run(
    action: () => Promise<ProblemSendState | undefined>,
    success?: string
  ): Promise<void> {
    this._busy = true;
    this._message = undefined;
    try {
      const result = await action();
      if (result) {
        fireEvent(this, "problem-send-state", result);
      }
      if (success) {
        this._message = { type: "success", text: success };
      }
    } catch (err: any) {
      this._message = { type: "error", text: this._errorText(err?.code ?? "") };
      await this._refresh();
    } finally {
      this._busy = false;
    }
  }

  private _update(settings: ProblemSendSettings, success?: string) {
    return this._run(
      () => updateProblemSendSettings(this.hass, settings),
      success
    );
  }

  protected render(): TemplateResult | typeof nothing {
    const sendState = this.sendState;
    if (!sendState) {
      return nothing;
    }
    return this.section === "actions"
      ? this._renderActions(sendState)
      : this._renderStatus(sendState);
  }

  private _renderStatus(s: ProblemSendState): TemplateResult {
    const check = s.last_check;
    const notPrivate =
      check && !check.ok && check.error
        ? ["repository_public", "visibility_unknown"].includes(check.error)
          ? check.error
          : undefined
        : undefined;
    const details: string[] = [];
    if (s.enabled) {
      if (check?.ok) {
        details.push(this._l("private"));
      }
      details.push(
        s.last_sent
          ? this._l("last_sent", { time: this._time(s.last_sent) })
          : this._l("never_sent")
      );
      if (s.mode === "hourly" && s.next_allowed) {
        details.push(this._l("next", { time: this._time(s.next_allowed) }));
      }
    }
    return html`
      <section class="card status" aria-live="polite">
        <span class="icon ${s.enabled ? "on" : ""}">
          <ha-svg-icon .path=${mdiUpload}></ha-svg-icon>
        </span>
        <div class="text">
          <div class="primary">
            ${s.enabled ? this._l("status_title") : this._l("status_off")}
          </div>
          <div class="secondary">
            ${s.enabled ? details.join(" · ") : this._l("status_off_detail")}
          </div>
        </div>
        <ha-button
          appearance="plain"
          size="small"
          @click=${this._toggleSettings}
          aria-expanded=${this._settingsOpen ? "true" : "false"}
          >${
            this._settingsOpen ? this._l("close_settings") : this._l("settings")
          }</ha-button
        >
      </section>
      ${
        s.last_error
          ? html`<section class="card failed" role="alert">
              <ha-svg-icon .path=${mdiAlertCircleOutline}></ha-svg-icon>
              <div>
                <div class="primary">
                  ${this._l("failed_title", { time: this._time(s.last_error.at) })}
                </div>
                <div class="secondary">
                  ${this._errorText(s.last_error.code)}
                  ${this._l("failed_waiting", { count: s.counts.not_sent })}
                </div>
              </div>
            </section>`
          : nothing
      }
      ${
        notPrivate
          ? html`<section class="card public" role="alert">
              <div class="primary">
                ${
                  notPrivate === "repository_public"
                    ? this._l("public_title")
                    : this._l("unknown_title")
                }
              </div>
              <div class="secondary">
                ${
                  notPrivate === "repository_public"
                    ? this._l("public_text")
                    : this._l("unknown_text")
                }
              </div>
            </section>`
          : nothing
      }
      ${this._settingsOpen ? this._renderSettings(s) : nothing}
    `;
  }

  private _renderSettings(s: ProblemSendState): TemplateResult {
    const modes: ToggleButton[] = [
      { label: this._l("mode_by_hand"), value: "by_hand" },
      { label: this._l("mode_hourly"), value: "hourly" },
    ];
    const check = s.last_check;
    return html`
      <section class="card setup">
        <div class="overline">${this._l("setup_title")}</div>
        <div class="field">
          <ha-input
            .label=${this._l("repository")}
            .hint=${this._l("repository_hint")}
            .value=${this._repository}
            inputmode="url"
            autocomplete="off"
            @input=${this._repositoryInput}
          ></ha-input>
          <ha-button
            appearance="filled"
            size="small"
            .disabled=${this._busy || this._repository.trim() === s.repository}
            @click=${this._saveRepository}
            >${this._l("save_repository")}</ha-button
          >
        </div>
        ${s.signed_in ? this._renderSignedIn(s) : this._renderSignIn(s)}
        ${
          check?.ok
            ? html`<div class="ok">
                <ha-svg-icon .path=${mdiCheckCircleOutline}></ha-svg-icon>
                <span>${this._l("signed_in_ok")}</span>
              </div>`
            : nothing
        }
        <div class="divider"></div>
        <div class="mode">
          <span>${this._l("mode")}</span>
          <ha-button-toggle-group
            .buttons=${modes}
            .active=${s.mode}
            size="s"
            @value-changed=${this._modeChanged}
          ></ha-button-toggle-group>
        </div>
        <p class="note">${this._l("limit")}</p>
        ${
          this._message
            ? html`<ha-alert .alertType=${this._message.type}
                >${this._message.text}</ha-alert
              >`
            : nothing
        }
        <div class="buttons">
          <ha-button
            appearance="plain"
            .disabled=${this._busy || !s.signed_in || !s.repository}
            @click=${this._test}
            >${this._l("test")}</ha-button
          >
          ${
            s.enabled
              ? html`<ha-button
                  appearance="outlined"
                  .disabled=${this._busy}
                  @click=${this._turnOff}
                  >${this._l("turn_off")}</ha-button
                >`
              : html`<ha-button
                  appearance="filled"
                  .disabled=${this._busy || !s.signed_in || !s.repository}
                  @click=${this._turnOn}
                  >${this._l("turn_on")}</ha-button
                >`
          }
        </div>
      </section>
    `;
  }

  private _renderSignedIn(s: ProblemSendState): TemplateResult {
    return html`<div class="signed-in">
      <span
        >${
          s.sign_in_method === "device"
            ? this._l("signed_in_device")
            : this._l("signed_in_token")
        }</span
      >
      <ha-button
        appearance="plain"
        size="small"
        .disabled=${this._busy}
        @click=${this._signOut}
        >${this._l("sign_out")}</ha-button
      >
    </div>`;
  }

  private _renderSignIn(s: ProblemSendState): TemplateResult {
    if (this._useToken || !s.device_sign_in_available) {
      return html`
        ${
          s.device_sign_in_available
            ? nothing
            : html`<p class="note">${this._l("device_unavailable")}</p>`
        }
        <div class="field">
          <ha-input
            type="password"
            password-toggle
            autocomplete="off"
            .label=${this._l("token")}
            .value=${this._token}
            @input=${this._tokenInput}
          ></ha-input>
          <ha-button
            appearance="filled"
            size="small"
            .disabled=${this._busy || !this._token.trim()}
            @click=${this._saveToken}
            >${this._l("save_token")}</ha-button
          >
        </div>
        <details class="help">
          <summary>${this._l("token_help_title")}</summary>
          <p>${this._l("token_help")}</p>
        </details>
        ${
          s.device_sign_in_available
            ? html`<ha-button
                appearance="plain"
                size="small"
                @click=${this._useCode}
                >${this._l("use_code")}</ha-button
              >`
            : nothing
        }
        <details class="help">
          <summary>${this._l("client_id")}</summary>
          <p>${this._l("client_id_help")}</p>
          <div class="field">
            <ha-input
              .label=${this._l("client_id")}
              .value=${this._clientId}
              autocomplete="off"
              @input=${this._clientIdInput}
            ></ha-input>
            <ha-button
              appearance="plain"
              size="small"
              .disabled=${this._busy || this._clientId.trim() === s.client_id}
              @click=${this._saveClientId}
              >${this._l("save_client_id")}</ha-button
            >
          </div>
        </details>
      `;
    }
    const device = s.device;
    const waiting =
      device && (device.state === "pending" || device.state === "slow_down");
    return html`
      <p class="label">${this._l("device_intro")}</p>
      ${
        waiting && device
          ? html`<div class="device">
              <div class="code-row">
                <span class="code">${device.user_code}</span>
                <ha-button
                  appearance="plain"
                  size="small"
                  @click=${this._copyCode}
                  >${this._l("copy")}</ha-button
                >
              </div>
              <ha-button
                appearance="filled"
                href=${device.verification_uri}
                target="_blank"
                rel="noreferrer noopener"
                >${this._l("open_page", {
                  address: shortAddress(device.verification_uri),
                })}</ha-button
              >
              <p class="note">
                ${this._l("waiting", {
                  minutes: minutesLeft(device.expires_at, this._now),
                })}
              </p>
              <div class="buttons">
                <ha-button
                  appearance="plain"
                  size="small"
                  @click=${this._cancelDevice}
                  >${this._l("device_cancel")}</ha-button
                >
                <ha-button
                  appearance="plain"
                  size="small"
                  @click=${this._useTokenClick}
                  >${this._l("use_token")}</ha-button
                >
              </div>
            </div>`
          : html`
              ${
                device && device.state !== "approved"
                  ? html`<ha-alert alert-type="warning"
                      >${this._l(`device_${device.state}`)}</ha-alert
                    >`
                  : nothing
              }
              <div class="buttons">
                <ha-button
                  appearance="filled"
                  .disabled=${this._busy}
                  @click=${this._startDevice}
                  >${this._l("device_start")}</ha-button
                >
                <ha-button
                  appearance="plain"
                  size="small"
                  @click=${this._useTokenClick}
                  >${this._l("use_token")}</ha-button
                >
              </div>
            `
      }
    `;
  }

  private _renderActions(s: ProblemSendState): TemplateResult {
    const readiness = sendReadiness(s, this._now);
    let label: string;
    switch (readiness.kind) {
      case "ready":
        label = this._l("send_count", { count: readiness.count });
        break;
      case "wait":
        label = this._l("send_at", {
          count: readiness.count,
          time: this._time(readiness.at),
        });
        break;
      case "nothing_new":
        label = this._l("send_nothing");
        break;
      default:
        label = this._l("send_off");
    }
    return html`
      <div class="actions">
        <ha-button
          appearance="filled"
          .disabled=${this._busy || readiness.kind !== "ready"}
          @click=${this._sendNow}
          >${label}</ha-button
        >
        <ha-button
          appearance="outlined"
          aria-expanded=${this._previewOpen ? "true" : "false"}
          @click=${this._togglePreview}
          >${this._l("preview_title")}</ha-button
        >
      </div>
      ${
        this._message
          ? html`<ha-alert .alertType=${this._message.type}
              >${this._message.text}</ha-alert
            >`
          : nothing
      }
      ${this._previewOpen ? this._renderPreview(s) : nothing}
    `;
  }

  private _renderPreview(s: ProblemSendState): TemplateResult {
    const files = this._preview;
    return html`
      <section class="card preview">
        <div class="overline">${this._l("preview_title")}</div>
        ${
          files
            ? html`
                <div class="files">
                  ${Object.keys(files)
                    .sort()
                    .map(
                      (path) =>
                        html`<details ?open=${path === "latest.md"}>
                          <summary class="mono">${path}</summary>
                          <pre class="mono">${files[path]}</pre>
                        </details>`
                    )}
                </div>
              `
            : html`<div class="center">
                <ha-spinner
                  .ariaLabel=${this._l("preview_loading")}
                ></ha-spinner>
              </div>`
        }
        <p class="note">${this._l("preview_hidden")}</p>
        <label class="switch-row">
          <span>${this._l("keep_names")}</span>
          <ha-switch
            .checked=${s.keep_names}
            .disabled=${this._busy}
            @change=${this._keepNamesChanged}
          ></ha-switch>
        </label>
        <div class="overline">${this._l("arrives_title")}</div>
        <p class="note">${this._l("arrives_text")}</p>
      </section>
    `;
  }

  private _toggleSettings(): void {
    this._settingsOpen = !this._settingsOpen;
    this._message = undefined;
  }

  private _repositoryInput(ev: Event): void {
    this._repository = (ev.target as HaInput).value ?? "";
  }

  private _tokenInput(ev: Event): void {
    this._token = (ev.target as HaInput).value ?? "";
  }

  private _clientIdInput(ev: Event): void {
    this._clientId = (ev.target as HaInput).value ?? "";
  }

  private _saveRepository(): void {
    this._update({ repository: this._repository.trim() });
  }

  private _saveClientId(): void {
    this._update({ client_id: this._clientId.trim() });
  }

  private async _saveToken(): Promise<void> {
    const token = this._token.trim();
    await this._run(() => setProblemSendToken(this.hass, token));
    this._token = "";
  }

  private _signOut(): void {
    this._run(() => signOutProblemSend(this.hass));
  }

  private _modeChanged(ev: CustomEvent<{ value: string }>): void {
    this._update({ mode: ev.detail.value as ProblemSendMode });
  }

  private _turnOn(): void {
    this._update({ enabled: true }, this._l("turned_on"));
  }

  private _turnOff(): void {
    this._update({ enabled: false });
  }

  private _test(): void {
    this._run(async () => {
      await testProblemSend(this.hass);
      return fetchProblemSendState(this.hass);
    }, this._l("test_ok"));
  }

  private _useCode(): void {
    this._useToken = false;
  }

  private _useTokenClick(): void {
    this._useToken = true;
  }

  private _startDevice(): void {
    this._run(async () => {
      await startProblemSendDeviceSignIn(this.hass);
      return fetchProblemSendState(this.hass);
    });
  }

  private _cancelDevice(): void {
    this._run(() => cancelProblemSendDeviceSignIn(this.hass));
  }

  private async _copyCode(): Promise<void> {
    const code = this.sendState?.device?.user_code;
    if (!code) {
      return;
    }
    await copyToClipboard(code);
    showToast(this, { message: this._l("copied") });
  }

  private async _togglePreview(): Promise<void> {
    this._previewOpen = !this._previewOpen;
    if (this._previewOpen) {
      await this._loadPreview();
    }
  }

  private async _loadPreview(): Promise<void> {
    this._preview = undefined;
    try {
      this._preview = (await previewProblemSend(this.hass)).files;
    } catch (err: any) {
      this._previewOpen = false;
      this._message = { type: "error", text: this._errorText(err?.code ?? "") };
    }
  }

  private async _keepNamesChanged(ev: Event): Promise<void> {
    const checked = (ev.target as HTMLInputElement).checked;
    await this._update({ keep_names: checked });
    await this._loadPreview();
  }

  private _sendNow(): void {
    this._run(async () => {
      const result = await sendProblemLogNow(this.hass);
      this._message = {
        type: "success",
        text: this._l("sent_done", { count: result.sent }),
      };
      return fetchProblemSendState(this.hass);
    });
  }

  static readonly styles: CSSResultGroup = css`
    :host {
      display: grid;
      gap: var(--ha-space-3);
    }
    .card {
      background: var(--ha-card-background, var(--card-background-color));
      border-radius: var(--ha-border-radius-xl, 16px);
      padding: var(--ha-space-3) var(--ha-space-4);
      border: 1px solid var(--divider-color);
    }
    .status {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 52px;
    }
    .icon {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      flex: none;
      border-radius: 50%;
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      --mdc-icon-size: 18px;
    }
    .icon.on {
      background: rgba(var(--rgb-success-color, 67, 160, 71), 0.16);
      color: var(--success-color);
    }
    .text {
      flex: 1;
      min-width: 0;
    }
    .primary {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .secondary,
    .note {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .note {
      margin: var(--ha-space-2) 0;
    }
    .failed {
      display: flex;
      gap: var(--ha-space-3);
      align-items: flex-start;
      border-color: var(--error-color);
      color: var(--error-color);
    }
    .failed .secondary {
      color: var(--primary-text-color);
    }
    .public {
      border-color: var(--error-color);
      background: rgba(var(--rgb-error-color, 219, 68, 55), 0.12);
    }
    .public .primary {
      color: var(--error-color);
    }
    .overline {
      font-size: var(--ha-font-size-xs, 11px);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--secondary-text-color);
      font-weight: var(--ha-font-weight-medium);
      margin-bottom: var(--ha-space-2);
    }
    .field {
      display: grid;
      gap: var(--ha-space-2);
      margin: var(--ha-space-2) 0;
    }
    .field ha-button {
      justify-self: start;
    }
    .label {
      margin: var(--ha-space-3) 0 var(--ha-space-2);
    }
    .device {
      display: grid;
      gap: var(--ha-space-2);
      justify-items: start;
    }
    .code-row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .code,
    .mono {
      font-family: var(--ha-font-family-code);
    }
    .code {
      font-size: var(--ha-font-size-xl, 22px);
      letter-spacing: 0.12em;
      padding: var(--ha-space-2) var(--ha-space-3);
      border-radius: var(--ha-border-radius-md, 8px);
      background: var(--secondary-background-color);
    }
    .ok,
    .signed-in {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
    }
    .ok {
      color: var(--success-color);
    }
    .divider {
      height: 1px;
      background: var(--divider-color);
      margin: var(--ha-space-2) 0;
    }
    .mode,
    .switch-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      min-height: 52px;
    }
    .buttons,
    .actions {
      display: flex;
      flex-wrap: wrap;
      gap: var(--ha-space-2);
      align-items: center;
    }
    .actions ha-button {
      flex: 1 1 160px;
    }
    ha-button {
      min-height: 44px;
    }
    details.help summary {
      cursor: pointer;
      min-height: 44px;
      display: flex;
      align-items: center;
      color: var(--primary-color);
    }
    .files {
      display: grid;
      gap: var(--ha-space-1);
    }
    .files summary {
      cursor: pointer;
      min-height: 44px;
      display: flex;
      align-items: center;
    }
    pre {
      margin: 0;
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-md, 8px);
      background: var(--secondary-background-color);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      max-height: 320px;
      overflow: auto;
      font-size: var(--ha-font-size-s);
    }
    .center {
      display: flex;
      justify-content: center;
      padding: var(--ha-space-4);
    }
  `;
}
