import {
  mdiCheck,
  mdiContentCopy,
  mdiKeyVariant,
  mdiTrashCanOutline,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { playPageEntry } from "../../../common/motion/page-entry";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-spinner";
import "../../../components/ha-svg-icon";
import "../../../components/ha-textarea";
import type { HaTextArea } from "../../../components/ha-textarea";
import type { SshAccessMode } from "../../../data/hassio/ssh-keys";
import {
  addSshKey,
  clearSshKeys,
  fetchSshKeys,
  isSshUnsupportedError,
  removeSshKey,
  sshErrorMessage,
} from "../../../data/hassio/ssh-keys";
import "../../../layouts/hass-subpage";
import { ChildPanelReady } from "../../../layouts/panel-ready";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { showToast } from "../../../util/toast";
import type { ListedKey } from "./ssh-access";
import {
  checkKeyInput,
  connectCommand,
  describeKeys,
  fingerprintOf,
  SSH_PORT,
  SSH_USER,
  toPathFingerprint,
} from "./ssh-access";

const PREFIX = "ui.panel.config.ssh_access.";

type Problem =
  "private_key" | "multiple" | "too_long" | "not_a_key" | "duplicate";

interface Preview {
  name: string;
  type: string;
  fingerprint: string;
}

@customElement("ha-config-ssh-access")
class HaConfigSshAccess extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: "is-wide", type: Boolean }) public isWide = false;

  @state() private _keys: ListedKey[] = [];

  @state() private _mode: SshAccessMode = "os";

  @state() private _loading = true;

  @state() private _unsupported = false;

  @state() private _busy = false;

  @state() private _error?: string;

  @state() private _draft = "";

  /** The format message waits until the field is left or Add key is pressed. */
  @state() private _touched = false;

  @state() private _problem?: Problem;

  @state() private _partial = false;

  @state() private _preview?: Preview;

  @state() private _privateKeyRefused = false;

  /** The fingerprint of the key that was just added. */
  @state() private _newFingerprint?: string;

  /** A fingerprint, or "all", while its removal question is open. */
  @state() private _ask?: string;

  @state() private _copied = false;

  @queryAll(".card") private _blocks!: NodeListOf<Element>;

  @queryAll("[data-focus]") private _focusTargets!: NodeListOf<HTMLElement>;

  private _copiedTimer?: number;

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`${PREFIX}${key}` as any, values as any);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._copiedTimer);
  }

  protected firstUpdated(changed: PropertyValues<this>): void {
    super.firstUpdated(changed);
    playPageEntry([...this._blocks]);
    this._load();
  }

  // ------------------------------------------------------------- data

  private async _load(): Promise<void> {
    this._loading = true;
    try {
      const info = await fetchSshKeys(this.hass);
      this._mode = info.mode;
      this._keys = await describeKeys(info.keys);
      this._unsupported = false;
      this._error = undefined;
    } catch (err) {
      if (isSshUnsupportedError(err)) {
        this._unsupported = true;
      } else {
        this._error = sshErrorMessage(err) || this._t("load_failed");
      }
    } finally {
      this._loading = false;
    }
  }

  private async _run(action: () => Promise<void>): Promise<boolean> {
    this._busy = true;
    this._error = undefined;
    try {
      await action();
      await this._load();
      return true;
    } catch (err) {
      this._error = sshErrorMessage(err) || this._t("action_failed");
      await this._load();
      return false;
    } finally {
      this._busy = false;
    }
  }

  // ------------------------------------------------------------ add

  private async _draftChanged(ev: Event): Promise<void> {
    const value = (ev.target as HaTextArea).value ?? "";
    this._privateKeyRefused = false;
    this._newFingerprint = undefined;
    await this._analyse(value);
  }

  private async _analyse(value: string): Promise<void> {
    const check = checkKeyInput(value);
    if (check.state === "problem" && check.problem === "private_key") {
      // Never keep a private key in the page.
      this._draft = "";
      this._privateKeyRefused = true;
      this._problem = undefined;
      this._preview = undefined;
      this._touched = false;
      return;
    }
    this._draft = value;
    if (check.state === "empty") {
      this._problem = undefined;
      this._partial = false;
      this._preview = undefined;
      this._touched = false;
      return;
    }
    if (check.state === "problem") {
      this._problem = check.problem;
      this._partial = check.partial;
      this._preview = undefined;
      return;
    }
    const fingerprint = await fingerprintOf(check.key.bytes);
    if (this._draft !== value) {
      return;
    }
    this._partial = false;
    if (this._keys.some((key) => key.fingerprint === fingerprint)) {
      this._problem = "duplicate";
      this._preview = undefined;
      return;
    }
    this._problem = undefined;
    this._preview = {
      name: check.key.comment,
      type: check.key.type,
      fingerprint,
    };
  }

  private _draftBlur(): void {
    if (this._draft.trim()) {
      this._touched = true;
    }
  }

  private async _add(): Promise<void> {
    if (!this._preview) {
      if (this._draft.trim()) {
        this._touched = true;
      }
      return;
    }
    const line = this._draft.trim();
    const { fingerprint } = this._preview;
    const ok = await this._run(() => addSshKey(this.hass, line));
    if (ok) {
      this._draft = "";
      this._preview = undefined;
      this._problem = undefined;
      this._touched = false;
      this._newFingerprint = fingerprint;
      showToast(this, { message: this._t("added_toast") });
    }
  }

  // --------------------------------------------------------- remove

  private async _askRemove(ev: Event): Promise<void> {
    this._ask = (ev.currentTarget as HTMLElement).dataset.ask;
    await this.updateComplete;
    this._focus("cancel");
  }

  private async _cancelRemove(ev: Event): Promise<void> {
    const { returnTo } = (ev.currentTarget as HTMLElement).dataset;
    this._ask = undefined;
    await this.updateComplete;
    this._focus(returnTo ?? "");
  }

  private _focus(id: string): void {
    [...this._focusTargets]
      .find((element) => element.dataset.focus === id)
      ?.focus();
  }

  private async _remove(ev: Event): Promise<void> {
    const key = this._keys.find(
      (item) =>
        item.fingerprint ===
        (ev.currentTarget as HTMLElement).dataset.fingerprint
    );
    if (!key) {
      return;
    }
    const ok = await this._run(() =>
      removeSshKey(this.hass, toPathFingerprint(key.fingerprint))
    );
    if (ok) {
      this._ask = undefined;
      this._newFingerprint = undefined;
      await this.updateComplete;
      this._focus("keys-heading");
    }
  }

  private async _removeAll(): Promise<void> {
    const ok = await this._run(() => clearSshKeys(this.hass));
    if (ok) {
      this._ask = undefined;
      this._newFingerprint = undefined;
      await this.updateComplete;
      this._focus("keys-heading");
    }
  }

  // ----------------------------------------------------------- copy

  private get _command(): string {
    return connectCommand(window.location.hostname || "homeassistant.local");
  }

  private async _copy(): Promise<void> {
    try {
      await copyToClipboard(this._command, this);
      this._copied = true;
      window.clearTimeout(this._copiedTimer);
      this._copiedTimer = window.setTimeout(() => {
        this._copied = false;
      }, 2000);
    } catch (_err) {
      showToast(this, { message: this._t("copy_failed") });
    }
  }

  // --------------------------------------------------------- render

  protected render(): TemplateResult {
    return html`
      <hass-subpage
        .hass=${this.hass}
        back-path="/config/system"
        .header=${this._t("caption")}
        .narrow=${this.narrow}
      >
        <div class="page">
          ${
            this._unsupported
              ? this._renderUnsupported()
              : this._loading && !this._keys.length && !this._error
                ? html`<div class="loading card" role="status">
                    <ha-spinner size="small"></ha-spinner>
                    <span>${this._t("loading")}</span>
                  </div>`
                : this._renderPage()
          }
        </div>
      </hass-subpage>
    `;
  }

  private _renderUnsupported(): TemplateResult {
    return html`
      <section class="card">
        <h3>${this._t("unsupported_title")}</h3>
        <p>${this._t("unsupported_text")}</p>
      </section>
    `;
  }

  private _renderPage(): TemplateResult {
    const on = this._keys.length > 0;
    return html`
      ${
        this._error
          ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
          : nothing
      }
      <div class="cols">
        <div class="col left">
          ${this._renderStatus(on)} ${this._renderContainerNote()}
          ${this._renderHowTo()}
          <p class="hint">${this._t("admin_only")}</p>
        </div>
        <div class="col right">
          ${this._renderKeys()} ${this._renderAdd(on)}
          ${on ? this._renderRemoveAll() : nothing}
        </div>
      </div>
    `;
  }

  private _renderStatus(on: boolean): TemplateResult {
    const count = this._keys.length;
    return html`
      <section class="card" aria-label=${this._t("status_label")}>
        <div class="status" role="status">
          <span class=${classMap({ lead: true, on })}>
            <ha-svg-icon .path=${mdiKeyVariant}></ha-svg-icon>
          </span>
          <div class="grow">
            <span class="title">
              ${on ? this._t("status_on") : this._t("status_off")}
            </span>
            <span class="sub">
              ${
                on
                  ? this._t("status_keys", { count })
                  : this._t("status_off_text")
              }
            </span>
          </div>
          <span class=${classMap({ tag: true, on })}>
            <span class="dot" aria-hidden="true"></span>
            ${on ? this._t("tag_on") : this._t("tag_off")}
          </span>
        </div>
        <span class="label">
          ${on ? this._t("connect_on") : this._t("connect_off")}
        </span>
        <div class="command">
          <code class="mono"
            ><span class="prompt" aria-hidden="true">$ </span
            >${this._command}</code
          >
          <ha-icon-button
            .path=${this._copied ? mdiCheck : mdiContentCopy}
            .label=${this._copied ? this._t("copied") : this._t("copy")}
            @click=${this._copy}
          ></ha-icon-button>
        </div>
        ${
          this._copied
            ? html`<span class="sub good" role="status"
                >${this._t("copied")}</span
              >`
            : nothing
        }
        <ha-alert alert-type="info">
          ${this._t("keys_only_warning", { port: SSH_PORT })}
        </ha-alert>
        <div class="facts">
          <div class="fact">
            <span class="label">${this._t("fact_sign_in")}</span>
            <b>${this._t("fact_sign_in_value")}</b>
          </div>
          <div class="fact">
            <span class="label">${this._t("fact_keys")}</span>
            <b>${count}</b>
          </div>
          <div class="fact">
            <span class="label">${this._t("fact_user")}</span>
            <b class="mono">${SSH_USER}</b>
          </div>
          <div class="fact">
            <span class="label">${this._t("fact_port")}</span>
            <b class="mono">${SSH_PORT}</b>
          </div>
        </div>
      </section>
    `;
  }

  private _renderContainerNote(): TemplateResult | typeof nothing {
    if (this._mode !== "container") {
      return nothing;
    }
    return html`
      <section class="card" aria-label=${this._t("container_title")}>
        <h3>${this._t("container_title")}</h3>
        <p>${this._t("container_text", { port: SSH_PORT })}</p>
      </section>
    `;
  }

  private _renderHowTo(): TemplateResult {
    return html`
      <section class="card" aria-label=${this._t("howto_title")}>
        <h3>${this._t("howto_title")}</h3>
        <ol class="steps">
          <li>
            <span class="num" aria-hidden="true">1</span>
            <span>
              ${this._t("howto_1")}
              <code class="inline mono">ssh-keygen -t ed25519</code>
            </span>
          </li>
          <li>
            <span class="num" aria-hidden="true">2</span>
            <span>${this._t("howto_2")}</span>
          </li>
          <li>
            <span class="num" aria-hidden="true">3</span>
            <span>${this._t("howto_3")}</span>
          </li>
        </ol>
      </section>
    `;
  }

  private _renderKeys(): TemplateResult {
    return html`
      <section class="card" aria-labelledby="keys-heading">
        <div class="head">
          <h3 id="keys-heading" tabindex="-1" data-focus="keys-heading">
            ${this._t("keys_title")}
          </h3>
          <span class="tag">${this._keys.length}</span>
        </div>
        ${
          this._keys.length
            ? html`<ul class="keys">
                ${this._keys.map((key) => html`<li>${this._renderKey(key)}</li>`)}
              </ul>`
            : html`<div class="empty">${this._t("keys_empty")}</div>`
        }
      </section>
    `;
  }

  private _renderKey(key: ListedKey): TemplateResult {
    const name = key.name || this._t("unnamed_key");
    if (this._ask === key.fingerprint && key.fingerprint) {
      return html`
        <div
          class="ask"
          role="group"
          aria-label=${this._t("remove_label", { name })}
        >
          <div class="name">
            <b>${name}</b><span class="tag primary">${key.type}</span>
          </div>
          <p>${this._t("remove_question")}</p>
          ${
            this._keys.length === 1
              ? html`<p class="sub">${this._t("remove_last_note")}</p>`
              : nothing
          }
          <div class="actions">
            <ha-button
              appearance="plain"
              data-focus="cancel"
              ?disabled=${this._busy}
              data-return-to=${`remove-${key.fingerprint}`}
              @click=${this._cancelRemove}
              >${this.hass.localize("ui.common.cancel")}</ha-button
            >
            <ha-button
              variant="danger"
              ?disabled=${this._busy}
              data-fingerprint=${key.fingerprint}
              @click=${this._remove}
              >${this._t("remove")}</ha-button
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="key">
        <span class="lead"
          ><ha-svg-icon .path=${mdiKeyVariant}></ha-svg-icon
        ></span>
        <div class="grow">
          <div class="name">
            <b>${key.fingerprint ? name : this._t("unreadable_key")}</b>
            ${key.type ? html`<span class="tag primary">${key.type}</span>` : nothing}
            ${
              this._newFingerprint === key.fingerprint
                ? html`<span class="tag on">${this._t("new_tag")}</span>`
                : nothing
            }
          </div>
          ${
            key.fingerprint
              ? html`<span class="mono fingerprint">${key.fingerprint}</span>`
              : nothing
          }
        </div>
        ${
          key.fingerprint
            ? html`<ha-icon-button
                .path=${mdiTrashCanOutline}
                .label=${this._t("remove_label", { name })}
                data-focus=${`remove-${key.fingerprint}`}
                ?disabled=${this._busy}
                data-ask=${key.fingerprint}
                @click=${this._askRemove}
              ></ha-icon-button>`
            : nothing
        }
      </div>
    `;
  }

  private _renderAdd(on: boolean): TemplateResult {
    const showProblem =
      this._problem !== undefined && (!this._partial || this._touched);
    const ready = this._preview !== undefined;
    return html`
      <section
        class=${classMap({ card: true, first: !on })}
        aria-labelledby="add-heading"
      >
        <div class="head">
          <h3 id="add-heading">${this._t("add_title")}</h3>
          ${on ? nothing : html`<span class="tag primary">${this._t("start_here")}</span>`}
        </div>
        ${
          this._newFingerprint && !this._draft
            ? html`<ha-alert alert-type="success"
                >${this._t("added_toast")}</ha-alert
              >`
            : nothing
        }
        <ha-textarea
          .label=${this._t("field_label")}
          .hint=${this._t("field_help")}
          placeholder="ssh-ed25519 AAAA... laptop"
          .rows=${4}
          resize="auto"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="none"
          .value=${this._draft}
          .disabled=${this._busy}
          ?invalid=${this._privateKeyRefused || showProblem}
          @input=${this._draftChanged}
          @blur=${this._draftBlur}
        ></ha-textarea>
        ${
          this._privateKeyRefused
            ? html`<ha-alert
                alert-type="error"
                .title=${this._t("private_title")}
              >
                ${this._t("private_text")}
              </ha-alert>`
            : nothing
        }
        ${
          showProblem
            ? html`<ha-alert alert-type="error">
                ${this._t(`problem_${this._problem}`)}
              </ha-alert>`
            : nothing
        }
        ${this._preview ? this._renderPreview(this._preview) : nothing}
        <div class="foot">
          <span class="sub grow">
            ${
              ready
                ? on
                  ? this._t("hint_check")
                  : this._t("hint_first")
                : this._t("hint_idle")
            }
          </span>
          <ha-button
            appearance=${ready ? "filled" : "plain"}
            aria-disabled=${ready ? "false" : "true"}
            ?disabled=${this._busy}
            @click=${this._add}
          >
            ${this._t("add")}
          </ha-button>
        </div>
      </section>
    `;
  }

  private _renderPreview(preview: Preview): TemplateResult {
    return html`
      <div class="preview" role="status" aria-label=${this._t("preview_label")}>
        <div class="good strong">
          <ha-svg-icon .path=${mdiCheck}></ha-svg-icon>
          ${this._t("preview_ok")}
        </div>
        <div class="name">
          <b>${preview.name || this._t("unnamed_key")}</b>
          <span class="tag primary">${preview.type}</span>
        </div>
        <span class="mono fingerprint">${preview.fingerprint}</span>
      </div>
    `;
  }

  private _renderRemoveAll(): TemplateResult {
    if (this._ask === "all") {
      return html`
        <div class="ask" role="group" aria-label=${this._t("remove_all")}>
          <p>${this._t("remove_all_question")}</p>
          <div class="actions">
            <ha-button
              appearance="plain"
              data-focus="cancel"
              ?disabled=${this._busy}
              data-return-to="remove-all"
              @click=${this._cancelRemove}
              >${this.hass.localize("ui.common.cancel")}</ha-button
            >
            <ha-button
              variant="danger"
              ?disabled=${this._busy}
              @click=${this._removeAll}
              >${this._t("remove_all_confirm")}</ha-button
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="foot end">
        <ha-button
          variant="danger"
          appearance="plain"
          data-focus="remove-all"
          ?disabled=${this._busy}
          data-ask="all"
          @click=${this._askRemove}
          >${this._t("remove_all")}</ha-button
        >
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .page {
          box-sizing: border-box;
          max-width: 1120px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .cols {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-4);
          align-items: flex-start;
        }
        .col {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }
        .left {
          flex: 1 1 340px;
        }
        .right {
          flex: 1.5 1 440px;
        }
        .card {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          min-width: 0;
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          background: var(
            --md-sys-color-surface-container,
            var(--card-background-color)
          );
        }
        .card.first {
          order: -1;
          box-shadow: inset 0 0 0 2px
            var(--md-sys-color-primary, var(--primary-color));
        }
        :host([narrow]) .card {
          border-radius: 24px;
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-xl);
          font-weight: 700;
          overflow-wrap: anywhere;
        }
        p {
          margin: 0;
          line-height: var(--ha-line-height-normal);
          overflow-wrap: anywhere;
        }
        .head,
        .status,
        .foot,
        .name,
        .key {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .head,
        .name,
        .foot {
          flex-wrap: wrap;
        }
        .head h3 {
          flex: 1;
          min-width: 0;
        }
        .status {
          gap: var(--ha-space-3);
        }
        .key {
          align-items: flex-start;
          padding: var(--ha-space-2) var(--ha-space-1) var(--ha-space-2)
            var(--ha-space-3);
          border-radius: 16px;
          background: var(
            --md-sys-color-surface-container-low,
            var(--secondary-background-color)
          );
        }
        .grow {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .title {
          font-size: var(--ha-font-size-xl);
          font-weight: 500;
        }
        .sub,
        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-m);
        }
        .label {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: 600;
          letter-spacing: 0.4px;
        }
        .lead {
          flex: none;
          width: 40px;
          height: 40px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(
            --md-sys-color-secondary-container,
            var(--secondary-background-color)
          );
          color: var(--md-sys-color-on-secondary-container, inherit);
        }
        .lead.on {
          background: var(
            --ha-color-fill-success-quiet-resting,
            var(--secondary-background-color)
          );
          color: var(--success-color);
        }
        .tag {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          min-height: 24px;
          padding: 2px 10px;
          border-radius: 12px;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: 600;
          white-space: nowrap;
        }
        .tag.primary {
          background: var(
            --md-sys-color-primary-container,
            var(--secondary-background-color)
          );
          color: var(--md-sys-color-on-primary-container, inherit);
        }
        .tag.on {
          background: var(
            --ha-color-fill-success-quiet-resting,
            var(--secondary-background-color)
          );
          color: var(--success-color);
        }
        .dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          background: var(--secondary-text-color);
        }
        .tag.on .dot {
          background: var(--success-color);
        }
        .command {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
          min-height: 56px;
          padding: var(--ha-space-1) var(--ha-space-1) var(--ha-space-1)
            var(--ha-space-4);
          border-radius: 16px;
          background: var(--secondary-background-color);
          border: 1px solid var(--divider-color);
        }
        .command code {
          flex: 1;
          min-width: 0;
          padding: var(--ha-space-2) 0;
          overflow-wrap: anywhere;
        }
        .prompt {
          color: var(--secondary-text-color);
          user-select: none;
        }
        .mono {
          font-family: var(--ha-font-family-code, monospace);
        }
        .inline {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 6px;
          background: var(--secondary-background-color);
          overflow-wrap: anywhere;
        }
        .good {
          color: var(--success-color);
        }
        .strong {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-weight: 600;
        }
        .facts {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: var(--ha-space-2);
        }
        .fact {
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border-radius: 14px;
          background: var(
            --md-sys-color-surface-container-low,
            var(--secondary-background-color)
          );
        }
        .fact b {
          overflow-wrap: anywhere;
        }
        .steps {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .steps li {
          display: flex;
          gap: var(--ha-space-3);
          align-items: flex-start;
        }
        .num {
          flex: none;
          width: 24px;
          height: 24px;
          display: grid;
          place-items: center;
          border-radius: 50%;
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
          font-weight: 600;
        }
        .keys {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          margin: 0;
          padding: 0;
          list-style: none;
        }
        .name b {
          overflow-wrap: anywhere;
          min-width: 0;
        }
        .fingerprint {
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
          word-break: break-all;
        }
        .ask {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-3);
          border-radius: 16px;
          box-shadow: inset 0 0 0 2px var(--error-color);
          min-width: 0;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: var(--ha-space-2);
        }
        .empty {
          padding: var(--ha-space-3);
          border-radius: 16px;
          background: var(
            --md-sys-color-surface-container-low,
            var(--secondary-background-color)
          );
          color: var(--secondary-text-color);
        }
        .preview {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          padding: var(--ha-space-3);
          border-radius: 16px;
          border: 1px solid var(--divider-color);
        }
        .end {
          justify-content: flex-end;
        }
        ha-textarea {
          display: block;
        }
        ha-button,
        ha-icon-button {
          min-height: 48px;
        }
        ha-icon-button {
          min-width: 48px;
        }
        .loading {
          flex-direction: row;
          align-items: center;
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
    "ha-config-ssh-access": HaConfigSshAccess;
  }
}
