import { mdiContentCopy, mdiDelete } from "@mdi/js";
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
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type {
  MinecraftFieldError,
  MinecraftHost,
  MinecraftHostDraft,
  MinecraftProbeResult,
  MinecraftTestResult,
} from "../../../data/minecraft_manager";
import {
  authorizedKeysCommand,
  createMinecraftHost,
  deleteMinecraftHost,
  emptyMinecraftHostDraft,
  HOST_LIMITS,
  isMinecraftFailure,
  MINECRAFT_LIMITS,
  parseMinecraftNumber,
  probeMinecraftHost,
  testMinecraftHost,
  trustMinecraftHost,
  validateMinecraftHostDraft,
} from "../../../data/minecraft_manager";
import { showConfirmationDialog } from "../../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";

const STEPS = ["details", "key", "trust", "test"] as const;
type Step = (typeof STEPS)[number];

/** Manage the SSH hosts and run the add-host wizard. */
@customElement("ha-minecraft-hosts")
class HaMinecraftHosts extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public hosts: MinecraftHost[] = [];

  /** Names of hosts that servers still use, so they cannot be removed. */
  @property({ attribute: false }) public usedHostIds: string[] = [];

  @state() private _step?: Step;

  @state() private _draft: MinecraftHostDraft = emptyMinecraftHostDraft();

  @state() private _touched = new Set<string>();

  @state() private _serverErrors: MinecraftFieldError[] = [];

  @state() private _host?: MinecraftHost;

  @state() private _busy = false;

  @state() private _failure?: string;

  @state() private _probe?: MinecraftProbeResult;

  @state() private _test?: MinecraftTestResult;

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.minecraft.host.${key}` as any,
      values
    );
  }

  private _code(code: string): string {
    const key = `ui.panel.config.minecraft.op_error.${code}` as any;
    return (
      this.hass.localize(key) ||
      this.hass.localize("ui.panel.config.minecraft.op_error.unknown")
    );
  }

  private _errors(): MinecraftFieldError[] {
    return [...validateMinecraftHostDraft(this._draft), ...this._serverErrors];
  }

  private _errorFor(field: string): string | undefined {
    if (!this._touched.has(field)) {
      return undefined;
    }
    const error = this._errors().find((item) => item.field === field);
    if (!error) {
      return undefined;
    }
    if (error.code === "out_of_range") {
      return this.hass.localize(
        "ui.panel.config.minecraft.error.out_of_range",
        {
          min: HOST_LIMITS.portMin,
          max: HOST_LIMITS.portMax,
        }
      );
    }
    return this.hass.localize(
      `ui.panel.config.minecraft.error.${error.code}` as any,
      { max: MINECRAFT_LIMITS.nameMax }
    );
  }

  private _touch(ev: Event): void {
    const field = (ev.target as HTMLElement).dataset.field ?? "";
    this._touched = new Set([...this._touched, field]);
  }

  private _input(ev: Event): void {
    const target = ev.target as HTMLInputElement;
    const value = target.value ?? "";
    switch (target.dataset.field) {
      case "name":
        this._draft = { ...this._draft, name: value };
        break;
      case "address":
        this._draft = { ...this._draft, address: value };
        break;
      case "port":
        this._draft = { ...this._draft, port: parseMinecraftNumber(value) };
        break;
      case "user":
        this._draft = { ...this._draft, user: value };
        break;
    }
    this._serverErrors = [];
    this._failure = undefined;
  }

  private _startAdd(): void {
    this._draft = emptyMinecraftHostDraft();
    this._touched = new Set();
    this._serverErrors = [];
    this._host = undefined;
    this._probe = undefined;
    this._test = undefined;
    this._failure = undefined;
    this._step = "details";
  }

  private _startSetup(ev: Event): void {
    const host = this.hosts.find(
      (item) => item.id === (ev.currentTarget as HTMLElement).dataset.host
    );
    if (!host) {
      return;
    }
    this._host = host;
    this._probe = undefined;
    this._test = undefined;
    this._failure = undefined;
    this._step = "key";
  }

  private _close(): void {
    this._step = undefined;
    fireEvent(this, "minecraft-hosts-changed");
  }

  private _back(): void {
    this._failure = undefined;
    this._step = STEPS[Math.max(0, STEPS.indexOf(this._step!) - 1)];
  }

  private async _saveDetails(): Promise<void> {
    this._touched = new Set(["name", "address", "port", "user"]);
    if (this._errors().length) {
      return;
    }
    this._busy = true;
    this._failure = undefined;
    try {
      const result = await createMinecraftHost(this.hass, this._draft);
      if (!result.saved) {
        this._serverErrors = result.errors.filter(
          (error) => error.field !== "host"
        );
        const general = result.errors.find((error) => error.field === "host");
        if (general) {
          this._failure = this._code(general.code);
        }
        return;
      }
      this._host = result.host;
      this._step = "key";
      fireEvent(this, "minecraft-hosts-changed");
    } catch (err: any) {
      this._failure = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _copy(ev: Event): Promise<void> {
    const text = (ev.currentTarget as HTMLElement).dataset.copy ?? "";
    await copyToClipboard(text, this);
    showToast(this, { message: this.hass.localize("ui.common.copied") });
  }

  private async _readKey(): Promise<void> {
    if (!this._host) {
      return;
    }
    this._busy = true;
    this._failure = undefined;
    this._probe = undefined;
    try {
      const result = await probeMinecraftHost(this.hass, this._host.id);
      if (isMinecraftFailure(result)) {
        this._failure = this._code(result.code);
      } else {
        this._probe = result;
      }
    } catch (err: any) {
      this._failure = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _trust(): Promise<void> {
    if (!this._host || !this._probe) {
      return;
    }
    if (this._probe.status === "changed") {
      const replace = await showConfirmationDialog(this, {
        title: this._l("replace_title", { name: this._host.name }),
        text: this._l("replace_text", {
          name: this._host.name,
          stored: this._probe.trusted_fingerprint ?? "",
          presented: this._probe.fingerprint,
        }),
        confirmText: this._l("replace_key"),
        dismissText: this.hass.localize("ui.panel.config.minecraft.cancel"),
        destructive: true,
      });
      if (!replace) {
        return;
      }
    }
    this._busy = true;
    this._failure = undefined;
    try {
      const result = await trustMinecraftHost(
        this.hass,
        this._host.id,
        this._probe.fingerprint,
        this._probe.status === "changed"
      );
      if (isMinecraftFailure(result)) {
        this._failure = this._code(result.code);
        return;
      }
      this._host = result.host;
      this._probe = { ...this._probe, status: "match" };
      fireEvent(this, "minecraft-hosts-changed");
    } catch (err: any) {
      this._failure = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _runTest(): Promise<void> {
    if (!this._host) {
      return;
    }
    this._busy = true;
    this._failure = undefined;
    this._test = undefined;
    try {
      const result = await testMinecraftHost(this.hass, this._host.id);
      if (isMinecraftFailure(result)) {
        this._failure = this._code(result.code);
      } else {
        this._test = result;
      }
    } catch (err: any) {
      this._failure = err?.message ?? String(err);
    } finally {
      this._busy = false;
    }
  }

  private async _remove(ev: Event): Promise<void> {
    const host = this.hosts.find(
      (item) => item.id === (ev.currentTarget as HTMLElement).dataset.host
    );
    if (!host) {
      return;
    }
    const confirmed = await showConfirmationDialog(this, {
      title: this._l("delete_title"),
      text: this._l("delete_text", { name: host.name }),
      confirmText: this.hass.localize("ui.panel.config.minecraft.delete"),
      dismissText: this.hass.localize("ui.panel.config.minecraft.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }
    try {
      const result = await deleteMinecraftHost(this.hass, host.id);
      if (isMinecraftFailure(result)) {
        showToast(this, { message: this._code(result.code) });
        return;
      }
      showToast(this, {
        message: this._l("deleted", { name: host.name }),
      });
      fireEvent(this, "minecraft-hosts-changed");
    } catch (err: any) {
      showToast(this, { message: err?.message ?? String(err) });
    }
  }

  protected render(): TemplateResult {
    return this._step ? this._renderWizard() : this._renderList();
  }

  private _renderList(): TemplateResult {
    return html`<div class="content">
      <p class="lead">${this._l("intro")}</p>
      ${
        this.hosts.length
          ? html`<ul class="hosts">
              ${this.hosts.map(
                (host) =>
                  html`<li class="host">
                    <div class="text">
                      <span class="name">${host.name}</span>
                      <span class="detail"
                        >${host.user}@${host.address}:${host.port}</span
                      >
                      <span class="detail"
                        >${
                          host.host_key_fingerprint
                            ? this._l("trusted", {
                                fingerprint: host.host_key_fingerprint,
                              })
                            : this._l("not_trusted")
                        }</span
                      >
                    </div>
                    <ha-button
                      appearance="plain"
                      data-host=${host.id}
                      @click=${this._startSetup}
                      >${this._l("check")}</ha-button
                    >
                    <ha-icon-button
                      .path=${mdiDelete}
                      .label=${this._l("delete_named", { name: host.name })}
                      .disabled=${this.usedHostIds.includes(host.id)}
                      data-host=${host.id}
                      @click=${this._remove}
                    ></ha-icon-button>
                  </li>`
              )}
            </ul>`
          : html`<div class="empty">
              <h2>${this._l("empty_title")}</h2>
              <p>${this._l("empty_text")}</p>
            </div>`
      }
      <div class="row">
        <ha-button @click=${this._startAdd}>${this._l("add")}</ha-button>
      </div>
    </div>`;
  }

  private _field(
    field: string,
    value: string,
    options: { type?: "text" | "number" } = {}
  ): TemplateResult {
    const error = this._errorFor(field);
    return html`<ha-input
      data-field=${field}
      .label=${this._l(`field.${field}`)}
      .value=${value}
      .type=${options.type ?? "text"}
      .invalid=${Boolean(error)}
      .hint=${error ?? this._l(`hint.${field}`)}
      @input=${this._input}
      @blur=${this._touch}
    ></ha-input>`;
  }

  private _renderRail(): TemplateResult {
    const current = STEPS.indexOf(this._step!);
    return html`<ol class="rail" aria-label=${this._l("steps")}>
      ${STEPS.map(
        (step, index) =>
          html`<li
            class=${classMap({
              item: true,
              active: step === this._step,
              done: index < current,
            })}
            aria-current=${step === this._step ? "step" : "false"}
          >
            <span class="num" aria-hidden="true">${index + 1}</span>
            ${this._l(`step.${step}`)}
          </li>`
      )}
    </ol>`;
  }

  private _renderWizard(): TemplateResult {
    return html`<div class="content wizard">
      ${this._renderRail()}
      <section class="step" aria-labelledby="host-step-title">
        <h2 id="host-step-title">${this._l(`step.${this._step}`)}</h2>
        ${this._renderStep()}
        ${
          this._failure
            ? html`<ha-alert alert-type="error">${this._failure}</ha-alert>`
            : nothing
        }
        ${
          this._busy
            ? html`<ha-spinner
                size="small"
                .ariaLabel=${this._l("working")}
              ></ha-spinner>`
            : nothing
        }
        <div class="row">
          <ha-button appearance="plain" @click=${this._close}
            >${this._l(this._step === "test" ? "done" : "close")}</ha-button
          >
          <span class="grow"></span>
          ${
            this._step !== "details" && this._step !== "key"
              ? html`<ha-button appearance="plain" @click=${this._back}
                  >${this.hass.localize(
                    "ui.panel.config.minecraft.back"
                  )}</ha-button
                >`
              : nothing
          }
          ${this._renderNext()}
        </div>
      </section>
    </div>`;
  }

  private _renderNext(): TemplateResult | typeof nothing {
    switch (this._step) {
      case "details":
        return html`<ha-button
          .disabled=${this._busy}
          @click=${this._saveDetails}
          >${this._l("save_details")}</ha-button
        >`;
      case "key":
        return html`<ha-button @click=${this._goTrust}
          >${this.hass.localize("ui.panel.config.minecraft.next")}</ha-button
        >`;
      case "trust":
        return this._host?.host_key_fingerprint
          ? html`<ha-button @click=${this._goTest}
              >${this.hass.localize("ui.panel.config.minecraft.next")}</ha-button
            >`
          : nothing;
      default:
        return nothing;
    }
  }

  private _goTrust(): void {
    this._failure = undefined;
    this._step = "trust";
  }

  private _goTest(): void {
    this._failure = undefined;
    this._step = "test";
  }

  private _renderStep(): TemplateResult {
    switch (this._step) {
      case "details":
        return html`
          <p class="lead">${this._l("details_intro")}</p>
          ${this._field("name", this._draft.name)}
          ${this._field("address", this._draft.address)}
          <div class="pair">
            ${this._field(
              "port",
              this._draft.port === undefined ? "" : String(this._draft.port),
              { type: "number" }
            )}
            ${this._field("user", this._draft.user)}
          </div>
        `;
      case "key":
        return this._renderKey();
      case "trust":
        return this._renderTrust();
      default:
        return this._renderTest();
    }
  }

  private _renderKey(): TemplateResult {
    const host = this._host!;
    const command = authorizedKeysCommand(host.public_key);
    return html`
      <p class="lead">
        ${this._l("key_intro", {
          target: `${host.user}@${host.address}`,
        })}
      </p>
      <p class="label">${this._l("public_key")}</p>
      <div class="code">
        <code>${host.public_key}</code>
        <ha-icon-button
          .path=${mdiContentCopy}
          .label=${this._l("copy_key")}
          data-copy=${host.public_key}
          @click=${this._copy}
        ></ha-icon-button>
      </div>
      <p class="label">${this._l("command_label")}</p>
      <div class="code">
        <code>${command}</code>
        <ha-icon-button
          .path=${mdiContentCopy}
          .label=${this._l("copy_command")}
          data-copy=${command}
          @click=${this._copy}
        ></ha-icon-button>
      </div>
      <ha-alert alert-type="info">${this._l("key_note")}</ha-alert>
      <ha-alert alert-type="warning"
        >${this._l("docker_root_warning")}</ha-alert
      >
      <ha-alert alert-type="info">${this._l("key_storage_note")}</ha-alert>
    `;
  }

  private _renderTrust(): TemplateResult {
    const host = this._host!;
    const probe = this._probe;
    return html`
      <p class="lead">${this._l("trust_intro")}</p>
      ${
        host.host_key_fingerprint
          ? html`<ha-alert alert-type="success"
              >${this._l("trusted", {
                fingerprint: host.host_key_fingerprint,
              })}</ha-alert
            >`
          : nothing
      }
      <div class="row">
        <ha-button .disabled=${this._busy} @click=${this._readKey}
          >${this._l("read_key")}</ha-button
        >
      </div>
      ${
        probe
          ? html`<div class="code">
                <code>${probe.fingerprint}</code>
                <ha-icon-button
                  .path=${mdiContentCopy}
                  .label=${this._l("copy_fingerprint")}
                  data-copy=${probe.fingerprint}
                  @click=${this._copy}
                ></ha-icon-button>
              </div>
              ${
                probe.status === "changed"
                  ? html`<ha-alert
                      alert-type="warning"
                      .title=${this._l("changed_title")}
                      >${this._l("changed_text", {
                        stored: probe.trusted_fingerprint ?? "",
                      })}</ha-alert
                    >`
                  : nothing
              }
              ${
                probe.status === "match"
                  ? html`<ha-alert alert-type="success"
                      >${this._l("matches")}</ha-alert
                    >`
                  : html`<p class="detail">
                        ${this._l("key_type", { type: probe.algorithm })}
                        ${this._l("compare_hint", {
                          type: probe.key_file_type ?? "<type>",
                        })}
                      </p>
                      <div class="row">
                        <ha-button .disabled=${this._busy} @click=${this._trust}
                          >${this._l(
                            probe.status === "changed"
                              ? "replace_key"
                              : "confirm_key"
                          )}</ha-button
                        >
                      </div>`
              }`
          : nothing
      }
    `;
  }

  private _renderTest(): TemplateResult {
    const test = this._test;
    return html`
      <p class="lead">${this._l("test_intro")}</p>
      <div class="row">
        <ha-button .disabled=${this._busy} @click=${this._runTest}
          >${this._l("run_test")}</ha-button
        >
      </div>
      ${
        test
          ? html`<ha-alert alert-type="success"
                >${this._l("test_ok", {
                  version: test.docker_version ?? "?",
                  address: test.address,
                })}</ha-alert
              >
              ${
                test.lan
                  ? nothing
                  : html`<ha-alert alert-type="warning"
                      >${this._l("not_lan")}</ha-alert
                    >`
              }`
          : nothing
      }
    `;
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
        max-width: 760px;
        margin: 0 auto;
        box-sizing: border-box;
      }
      .lead,
      .detail,
      h2,
      p {
        margin: 0;
      }
      .lead,
      .detail,
      .label {
        color: var(--secondary-text-color);
      }
      .detail {
        font-size: var(--ha-font-size-s);
        overflow-wrap: anywhere;
      }
      h2 {
        font-size: var(--ha-font-size-xl);
        font-weight: var(--ha-font-weight-medium);
      }
      .hosts {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .host {
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
        flex: 1 1 220px;
        min-width: 0;
      }
      .name {
        overflow-wrap: anywhere;
        font-weight: var(--ha-font-weight-medium);
      }
      .empty {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
        padding: var(--ha-space-4);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .row {
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
        align-items: center;
      }
      .grow {
        flex: 1;
      }
      .rail {
        list-style: none;
        margin: 0;
        padding: 0;
        display: flex;
        flex-wrap: wrap;
        gap: var(--ha-space-2);
      }
      .rail .item {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        min-height: 44px;
        padding: 0 var(--ha-space-3);
        border-radius: 22px;
        color: var(--secondary-text-color);
      }
      .rail .item.active {
        background: var(--primary-color);
        color: var(--text-primary-color);
      }
      .rail .item.done {
        color: var(--primary-text-color);
      }
      .num {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 1px solid currentColor;
        font-size: var(--ha-font-size-s);
      }
      .step {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-3);
        min-width: 0;
      }
      ha-input {
        width: 100%;
      }
      .pair {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: var(--ha-space-3);
      }
      .code {
        display: flex;
        align-items: center;
        gap: var(--ha-space-2);
        padding: var(--ha-space-2) var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg, 12px);
        background: var(--secondary-background-color);
      }
      .code code {
        flex: 1;
        min-width: 0;
        overflow-wrap: anywhere;
        font-family: var(--ha-font-family-code, monospace);
        font-size: var(--ha-font-size-s);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-minecraft-hosts": HaMinecraftHosts;
  }
  interface HASSDomEvents {
    "minecraft-hosts-changed": undefined;
  }
}
