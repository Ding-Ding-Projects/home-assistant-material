import { mdiCloudOutline } from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { isComponentLoaded } from "../../../common/config/is_component_loaded";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import { playPageEntry } from "../../../common/motion/page-entry";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type { CloudHostInfo } from "../../../data/hassio/cloud-host";
import {
  checkCloudHost,
  cloudHostErrorMessage,
  fetchCloudHostInfo,
  fetchCloudHostSignIn,
  pauseCloudHost,
  removeCloudHost,
  resumeCloudHost,
  setupCloudHost,
} from "../../../data/hassio/cloud-host";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-subpage";
import { ChildPanelReady } from "../../../layouts/panel-ready";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import type { CloudHostAction, Step } from "./cloud-host";
import {
  allowedActions,
  buildSteps,
  hostnameProblem,
  isSafeSignInUrl,
  normalizeHostname,
  proxyBlock,
  proxyConfigLines,
  RUNNER_NOT_INSTALLED,
  shouldPoll,
  SIGN_IN_POLL_MS,
} from "./cloud-host";

const PREFIX = "ui.panel.config.cloud_host.";

@customElement("ha-config-cloud-host")
class HaConfigCloudHost extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _info?: CloudHostInfo;

  @state() private _loading = false;

  @state() private _busy = false;

  @state() private _error?: string;

  @state() private _address = "";

  @state() private _addressTouched = false;

  /** The pending sign-in address. Kept only in this component's memory. */
  @state() private _signInUrl?: string;

  @queryAll(".hero, .card") private _blocks!: NodeListOf<Element>;

  private _timer?: number;

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  private get _hasSupervisor(): boolean {
    return isComponentLoaded(this.hass.config, "hassio");
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`${PREFIX}${key}` as any, values as any);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopPolling();
  }

  protected firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    playPageEntry([...this._blocks]);
    if (this._hasSupervisor) {
      this._load();
    }
  }

  // ------------------------------------------------------------- data

  private async _load(): Promise<void> {
    this._loading = true;
    try {
      this._applyInfo(await fetchCloudHostInfo(this.hass));
      this._error = undefined;
    } catch (err) {
      this._error = cloudHostErrorMessage(err) || this._t("load_failed");
    } finally {
      this._loading = false;
    }
  }

  private _applyInfo(info: CloudHostInfo, signInUrl?: string | null): void {
    this._info = info;
    if (info.state !== "waiting_for_sign_in") {
      this._signInUrl = undefined;
    } else if (signInUrl) {
      this._signInUrl = signInUrl;
    }
    if (shouldPoll(info.state)) {
      this._startPolling();
    } else {
      this._stopPolling();
    }
  }

  private _startPolling(): void {
    if (this._timer !== undefined) {
      return;
    }
    this._timer = window.setTimeout(() => this._poll(), SIGN_IN_POLL_MS);
  }

  private _stopPolling(): void {
    if (this._timer !== undefined) {
      window.clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private async _poll(): Promise<void> {
    this._timer = undefined;
    if (!this.isConnected) {
      return;
    }
    try {
      const info = await fetchCloudHostInfo(this.hass);
      let url: string | null = null;
      if (info.state === "waiting_for_sign_in" && !this._signInUrl) {
        url = await fetchCloudHostSignIn(this.hass);
      }
      this._applyInfo(info, url);
    } catch (_err) {
      // Keep waiting; the next round asks again while the page is open.
      if (this._info && shouldPoll(this._info.state)) {
        this._startPolling();
      }
    }
  }

  private async _run(
    action: () => Promise<CloudHostInfo>,
    after?: (info: CloudHostInfo) => void
  ): Promise<void> {
    this._busy = true;
    this._error = undefined;
    try {
      const info = await action();
      this._applyInfo(info);
      after?.(info);
    } catch (err) {
      this._error = cloudHostErrorMessage(err) || this._t("action_failed");
      await this._load();
    } finally {
      this._busy = false;
    }
  }

  // ------------------------------------------------------------ actions

  private async _setup(): Promise<void> {
    this._addressTouched = true;
    const hostname = normalizeHostname(this._address);
    if (!hostname) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_setup_title"),
      text: this._t("confirm_setup_text", { hostname }),
      confirmText: this._t("set_up"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    this._busy = true;
    this._error = undefined;
    try {
      const result = await setupCloudHost(this.hass, hostname);
      this._applyInfo(result.info, result.signInUrl);
    } catch (err) {
      this._error = cloudHostErrorMessage(err) || this._t("action_failed");
    } finally {
      this._busy = false;
    }
  }

  private async _pause(): Promise<void> {
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_pause_title"),
      text: this._t("confirm_pause_text"),
      confirmText: this._t("pause"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (confirmed) {
      await this._run(() => pauseCloudHost(this.hass));
    }
  }

  private async _remove(): Promise<void> {
    const confirmed = await showConfirmationDialog(this, {
      title: this._t("confirm_remove_title"),
      text: this._t("confirm_remove_text"),
      confirmText: this._t("remove"),
      dismissText: this.hass.localize("ui.common.cancel"),
      destructive: true,
    });
    if (confirmed) {
      await this._run(() => removeCloudHost(this.hass));
    }
  }

  private _resume(): void {
    this._run(() => resumeCloudHost(this.hass));
  }

  private _check(): void {
    this._run(() => checkCloudHost(this.hass));
  }

  private _openSignIn(): void {
    if (this._signInUrl && isSafeSignInUrl(this._signInUrl)) {
      window.open(this._signInUrl, "_blank", "noopener,noreferrer");
    }
  }

  private _addressChanged(ev: Event): void {
    this._address = (ev.target as HaInput).value ?? "";
  }

  private _addressBlur(): void {
    this._addressTouched = true;
  }

  private _addressKey(ev: KeyboardEvent): void {
    if (ev.key === "Enter") {
      ev.preventDefault();
      this._setup();
    }
  }

  // ------------------------------------------------------------- render

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        back-path="/config/system"
        .header=${this._t("caption")}
        .narrow=${this.narrow}
      >
        <div class="page">
          ${this._hasSupervisor ? this._renderManaged() : this._renderPlain()}
        </div>
      </hass-subpage>
    `;
  }

  private _renderHero(heading: string, text: string): TemplateResult {
    return html`
      <section class="hero">
        <ha-svg-icon .path=${mdiCloudOutline}></ha-svg-icon>
        <div class="hero-text">
          <h2>${heading}</h2>
          <p>${text}</p>
        </div>
      </section>
    `;
  }

  private _renderNotice(): TemplateResult {
    return html`
      <section class="card notice" role="note">
        <h3>${this._t("risk_title")}</h3>
        <p>${this._t("risk_text")}</p>
      </section>
    `;
  }

  /** No Supervisor: the tunnel is started from the host script instead. */
  private _renderPlain(): TemplateResult {
    return html`
      ${this._renderHero(this._t("summary"), this._t("summary_text"))}
      ${this._renderNotice()}
      <section class="card">
        <h3>${this._t("plain_title")}</h3>
        <p>${this._t("plain_text")}</p>
        <p class="mono">host.bat --cloud --detached</p>
        <p class="mono">./host.sh --cloud --detached</p>
        <p>${this._t("plain_settings")}</p>
        <pre class="mono code">
http:
  use_x_forwarded_for: true
  trusted_proxies:
    - &lt;tunnel container address&gt;</pre>
        <p>${this._t("plain_proxy_hint")}</p>
      </section>
    `;
  }

  private _renderManaged(): TemplateResult {
    const info = this._info;
    if (!info) {
      return html`
        ${
          this._error
            ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
            : nothing
        }
        ${
          this._loading
            ? html`<div class="loading" role="status">
                <ha-spinner size="small"></ha-spinner>
                <span>${this._t("loading")}</span>
              </div>`
            : html`<ha-button @click=${this._load}
                >${this._t("try_again")}</ha-button
              >`
        }
      `;
    }
    const actions = allowedActions(info.state, info.hostname !== null);
    const steps = buildSteps(info);
    const live = info.state !== "not_set_up";
    return html`
      ${this._renderHero(this._t("summary"), this._t("summary_text"))}
      ${this._renderNotice()}
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      ${info.state === "error" ? this._renderErrorAlert(info) : nothing}
      ${actions.includes("setup") ? this._renderSetup() : nothing}
      ${live ? this._renderStatus(info, actions) : nothing}
      <section class="card">
        <h3>${this._t("steps_title")}</h3>
        <ol class="steps" aria-label=${this._t("steps_title")}>
          ${steps.map((step) => this._renderStep(step))}
        </ol>
        ${actions.includes("open_sign_in") ? this._renderSignIn() : nothing}
        ${this._renderProxy(info)}
      </section>
    `;
  }

  private _renderErrorAlert(info: CloudHostInfo): TemplateResult {
    const reason = info.error ?? "";
    return html`
      <ha-alert alert-type="error" .title=${this._t("error_title")}>
        <div class="reason">${reason}</div>
        ${
          reason === RUNNER_NOT_INSTALLED
            ? html`<div>${this._t("error_runner_missing")}</div>`
            : nothing
        }
      </ha-alert>
    `;
  }

  private _renderSetup(): TemplateResult {
    const problem = hostnameProblem(this._address);
    const showProblem = this._addressTouched && problem !== undefined;
    return html`
      <section class="card">
        <h3>${this._t("address_title")}</h3>
        <ha-input
          appearance="outlined"
          type="text"
          autocapitalize="none"
          autocomplete="off"
          spellcheck="false"
          .label=${this._t("address_label")}
          .value=${this._address}
          .disabled=${this._busy}
          @input=${this._addressChanged}
          @blur=${this._addressBlur}
          @keydown=${this._addressKey}
        ></ha-input>
        <p class=${classMap({ hint: true, problem: showProblem })}>
          ${
            showProblem
              ? this._t(`address_${problem}`)
              : this._t("address_helper")
          }
        </p>
        <ha-button
          class="big"
          size="large"
          ?disabled=${this._busy}
          @click=${this._setup}
        >
          ${this._t("set_up")}
        </ha-button>
      </section>
    `;
  }

  private _renderSignIn(): TemplateResult {
    const url = this._signInUrl;
    return html`
      <div class="sign-in">
        <p>${this._t("sign_in_text")}</p>
        <ha-button
          ?disabled=${this._busy || !isSafeSignInUrl(url)}
          @click=${this._openSignIn}
        >
          ${this._t("open_sign_in")}
        </ha-button>
      </div>
    `;
  }

  private _renderProxy(info: CloudHostInfo): TemplateResult | typeof nothing {
    const block = proxyBlock(info);
    if (block === "none") {
      return nothing;
    }
    if (block === "waiting" || !info.trusted_proxy) {
      return html`<div class="proxy"><p>${this._t("proxy_unknown")}</p></div>`;
    }
    return html`
      <div class="proxy">
        <p>${this._t("proxy_text")}</p>
        <pre class="mono code">${proxyConfigLines(info.trusted_proxy)}</pre>
        <p>${this._t("proxy_restart")}</p>
        <ha-button appearance="filled" @click=${this._copyProxy}>
          ${this._t("proxy_copy")}
        </ha-button>
      </div>
    `;
  }

  private async _copyProxy(): Promise<void> {
    const address = this._info?.trusted_proxy;
    if (!address) {
      return;
    }
    try {
      await copyToClipboard(proxyConfigLines(address), this);
      showToast(this, {
        message: this.hass.localize("ui.common.copied_clipboard"),
      });
    } catch (_err) {
      showToast(this, { message: this._t("proxy_copy_failed") });
    }
  }

  private _renderStatus(
    info: CloudHostInfo,
    actions: CloudHostAction[]
  ): TemplateResult {
    const check = info.last_check;
    const reachable = info.state === "running" && check?.ok === true;
    const paused = info.state === "paused";
    return html`
      <section class="card status">
        <h3>${this._t("status_title")}</h3>
        <p class="state-line">
          <span
            class=${classMap({
              dot: true,
              ok: reachable,
              off: !reachable,
            })}
          ></span>
          <strong>
            ${
              paused
                ? this._t("status_paused")
                : reachable
                  ? this._t("status_reachable")
                  : this._t("status_not_reachable")
            }
          </strong>
        </p>
        ${
          info.hostname
            ? html`<p>
                ${this._t("status_address")}
                <span class="mono">${info.hostname}</span>
              </p>`
            : nothing
        }
        ${
          check
            ? html`<p>
                  ${this._t("status_checked", { time: this._formatTime(check.time) })}
                </p>
                ${
                  !check.ok
                    ? html`<p class="problem">
                        ${
                          check.status !== null
                            ? this._t("check_failed_status", {
                                status: check.status,
                              })
                            : this._t("check_failed_reason", {
                                reason: check.reason ?? "",
                              })
                        }
                      </p>`
                    : nothing
                }`
            : info.state === "running"
              ? html`<p>${this._t("status_never_checked")}</p>`
              : nothing
        }
        <div class="buttons">
          ${
            actions.includes("check")
              ? html`<ha-button
                  appearance="filled"
                  ?disabled=${this._busy}
                  @click=${this._check}
                  >${this._t("check_again")}</ha-button
                >`
              : nothing
          }
          ${
            actions.includes("resume")
              ? html`<ha-button
                  appearance="filled"
                  ?disabled=${this._busy}
                  @click=${this._resume}
                  >${this._t("resume")}</ha-button
                >`
              : nothing
          }
          ${
            actions.includes("pause")
              ? html`<ha-button
                  appearance="plain"
                  ?disabled=${this._busy}
                  @click=${this._pause}
                  >${this._t("pause")}</ha-button
                >`
              : nothing
          }
          ${
            actions.includes("remove")
              ? html`<ha-button
                  variant="danger"
                  appearance="plain"
                  ?disabled=${this._busy}
                  @click=${this._remove}
                  >${this._t("remove")}</ha-button
                >`
              : nothing
          }
        </div>
      </section>
    `;
  }

  private _renderStep(step: Step): TemplateResult {
    return html`
      <li class="step step-${step.status}">
        <span class="step-mark" aria-hidden="true"></span>
        <span class="step-text">${this._t(`step_${step.id}`)}</span>
        <span class="step-state">${this._t(`step_state_${step.status}`)}</span>
      </li>
    `;
  }

  /** 24-hour date and time in the home's time zone. */
  private _formatTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    return new Intl.DateTimeFormat(this.hass.locale?.language, {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: this.hass.config.time_zone,
    }).format(date);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .page {
          box-sizing: border-box;
          max-width: 900px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
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
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(
            --md-sys-color-secondary-container,
            var(--ha-color-fill-primary-quiet-resting)
          );
          color: var(--md-sys-color-on-secondary-container, inherit);
          --mdc-icon-size: 32px;
        }
        .hero-text {
          flex: 1;
          min-width: 200px;
        }
        h2 {
          margin: 0;
          white-space: normal;
          overflow: visible;
          text-overflow: clip;
          font-size: var(--ha-font-size-3xl);
          font-weight: 800;
          font-stretch: 116%;
          letter-spacing: -0.02em;
          line-height: var(--ha-line-height-condensed);
          overflow-wrap: anywhere;
        }
        :host([narrow]) h2 {
          font-size: var(--ha-font-size-2xl);
        }
        h3 {
          margin: 0 0 var(--ha-space-2);
          font-size: var(--ha-font-size-xl);
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        .hero p {
          margin: var(--ha-space-1) 0 0;
          line-height: var(--ha-line-height-normal);
        }
        .card {
          margin-bottom: var(--ha-space-4);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(
            --md-sys-color-surface-container,
            var(--card-background-color)
          );
        }
        .card p {
          margin: var(--ha-space-2) 0;
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        .notice {
          background: var(
            --md-sys-color-tertiary-container,
            var(--ha-color-fill-warning-quiet-resting)
          );
          color: var(--md-sys-color-on-tertiary-container, inherit);
        }
        ha-alert {
          display: block;
          margin-bottom: var(--ha-space-4);
        }
        .reason {
          font-weight: 600;
          overflow-wrap: anywhere;
        }
        ha-input {
          display: block;
          width: 100%;
        }
        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
        }
        .hint.problem,
        .problem {
          color: var(--error-color);
        }
        .big {
          min-height: 56px;
          min-width: 48px;
        }
        ha-button {
          min-height: 48px;
        }
        .buttons {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-3);
          margin-top: var(--ha-space-3);
        }
        .mono {
          font-family: var(--ha-font-family-code, monospace);
          overflow-wrap: anywhere;
        }
        .code {
          margin: var(--ha-space-2) 0;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          overflow-x: auto;
          white-space: pre;
        }
        .state-line {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .dot {
          flex: none;
          width: 12px;
          height: 12px;
          border-radius: 50%;
          background: var(--warning-color);
        }
        .dot.ok {
          background: var(--success-color);
        }
        .dot.off {
          background: var(--warning-color);
        }
        .steps {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .step {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 48px;
        }
        .step-mark {
          flex: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          border: 2px solid var(--secondary-text-color);
        }
        .step-done .step-mark {
          background: var(--success-color);
          border-color: var(--success-color);
        }
        .step-current .step-mark {
          border-color: var(--md-sys-color-primary, var(--primary-color));
          background: var(--md-sys-color-primary, var(--primary-color));
        }
        .step-failed .step-mark {
          background: var(--error-color);
          border-color: var(--error-color);
        }
        .step-text {
          flex: 1;
          min-width: 160px;
          overflow-wrap: anywhere;
        }
        .step-state {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
        }
        .sign-in {
          margin-top: var(--ha-space-3);
        }
        .loading {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
        }
        @media (prefers-reduced-motion: reduce) {
          * {
            transition: none !important;
            animation: none !important;
          }
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-cloud-host": HaConfigCloudHost;
  }
}
