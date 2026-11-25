import {
  mdiCheck,
  mdiContentCopy,
  mdiKeyVariant,
  mdiTrashCanOutline,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { live } from "lit/directives/live";
import { LanguageModeController } from "../../../common/language-mode/language-mode-controller";
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
  connectHost,
  describeKeys,
  fingerprintOf,
  SECURITY_KEY_TYPE,
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

  @state() private _port = SSH_PORT;

  @state() private _loading = true;

  @state() private _unsupported = false;

  @state() private _busy = false;

  /** Why the list could not be read; shown at the top. */
  @state() private _loadError?: string;

  /** Why an add or a remove failed; shown where the person pressed. */
  @state() private _actionError?: string;

  @state() private _actionWhere?: "add" | "remove";

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

  private _lang = new LanguageModeController(this);

  private _copiedTimer?: number;

  private _entered = false;

  public constructor() {
    super();
    new ChildPanelReady(this);
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, `${PREFIX}${key}`, values);
  }

  private _typeLabel(type: string): string {
    return type === SECURITY_KEY_TYPE ? this._t("type_security_key") : type;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._copiedTimer);
  }

  protected firstUpdated(): void {
    this._load();
  }

  // ------------------------------------------------------------- data

  private async _load(): Promise<void> {
    this._loading = true;
    try {
      const info = await fetchSshKeys(this.hass);
      this._mode = info.mode;
      this._port = info.port;
      this._unsupported = info.mode === "unsupported";
      this._keys = await describeKeys(info.keys);
      this._loadError = undefined;
    } catch (err) {
      this._loadError = sshErrorMessage(err) || this._t("load_failed");
    } finally {
      this._loading = false;
    }
    if (!this._entered && !this._loadError) {
      this._entered = true;
      await this.updateComplete;
      playPageEntry([...this._blocks]);
    }
  }

  private async _run(
    action: () => Promise<void>,
    where: "add" | "remove"
  ): Promise<boolean> {
    if (this._busy) {
      return false;
    }
    this._busy = true;
    this._actionError = undefined;
    let ok = true;
    try {
      await action();
    } catch (err) {
      ok = false;
      this._actionError = sshErrorMessage(err) || this._t("action_failed");
      this._actionWhere = where;
    }
    await this._load();
    this._busy = false;
    return ok;
  }

  // ------------------------------------------------------------ add

  private async _draftChanged(ev: Event): Promise<void> {
    const field = ev.target as HaTextArea;
    this._privateKeyRefused = false;
    this._newFingerprint = undefined;
    this._actionError = undefined;
    const kept = await this._analyse(field.value ?? "");
    if (!kept) {
      // The field keeps its own copy of what was pasted, so empty it too.
      field.value = "";
    }
  }

  /** Returns false when the text was a private key and has been dropped. */
  private async _analyse(value: string): Promise<boolean> {
    const check = checkKeyInput(value);
    if (check.state === "problem" && check.problem === "private_key") {
      // Never keep a private key in the page.
      this._draft = "";
      this._privateKeyRefused = true;
      this._problem = undefined;
      this._partial = false;
      this._preview = undefined;
      this._touched = false;
      return false;
    }
    this._draft = value;
    if (check.state === "empty") {
      this._problem = undefined;
      this._partial = false;
      this._preview = undefined;
      this._touched = false;
      return true;
    }
    if (check.state === "problem") {
      this._problem = check.problem;
      this._partial = check.partial;
      this._preview = undefined;
      return true;
    }
    const fingerprint = await fingerprintOf(check.key.bytes);
    if (this._draft !== value) {
      return true;
    }
    this._partial = false;
    if (this._keys.some((key) => key.fingerprint === fingerprint)) {
      this._problem = "duplicate";
      this._preview = undefined;
      return true;
    }
    this._problem = undefined;
    this._preview = {
      name: check.key.comment,
      type: check.key.type,
      fingerprint,
    };
    return true;
  }

  private _draftBlur(): void {
    if (this._draft.trim()) {
      this._touched = true;
    }
  }

  private _clearDraft(): void {
    this._draft = "";
    this._problem = undefined;
    this._partial = false;
    this._preview = undefined;
    this._touched = false;
    this._privateKeyRefused = false;
    this._actionError = undefined;
    this._focus("field");
  }

  private async _add(): Promise<void> {
    if (!this._preview || this._busy) {
      return;
    }
    const line = this._draft.trim();
    const { fingerprint } = this._preview;
    const ok = await this._run(() => addSshKey(this.hass, line), "add");
    if (ok) {
      this._draft = "";
      this._preview = undefined;
      this._problem = undefined;
      this._touched = false;
      this._newFingerprint = fingerprint;
      showToast(this, { message: this._t("added_toast") });
      await this.updateComplete;
      this._focus("field");
    }
  }

  // --------------------------------------------------------- remove

  private async _askRemove(ev: Event): Promise<void> {
    this._ask = (ev.currentTarget as HTMLElement).dataset.ask;
    this._actionError = undefined;
    await this.updateComplete;
    this._focus("cancel");
  }

  private async _cancelRemove(ev: Event): Promise<void> {
    const { returnTo } = (ev.currentTarget as HTMLElement).dataset;
    this._ask = undefined;
    this._actionError = undefined;
    await this.updateComplete;
    this._focus(returnTo ?? "");
  }

  private _focus(id: string): void {
    [...this._focusTargets]
      .find((element) => element.dataset.focus === id)
      ?.focus();
  }

  private async _afterRemove(
    ok: boolean,
    removed: string[],
    toast: string
  ): Promise<void> {
    await this.updateComplete;
    if (!ok) {
      // The question stays open: put focus back on its Remove button.
      this._focus("confirm");
      return;
    }
    this._ask = undefined;
    this._newFingerprint = undefined;
    showToast(this, {
      message: toast,
      action: {
        text: this._t("undo"),
        action: () => this._undo(removed),
      },
    });
    await this.updateComplete;
    this._focus("keys-heading");
  }

  /** Put removed keys back, one request each, as the person added them. */
  private async _undo(lines: string[]): Promise<void> {
    const ok = await this._run(async () => {
      for (const line of lines) {
        // eslint-disable-next-line no-await-in-loop
        await addSshKey(this.hass, line);
      }
    }, "add");
    if (!ok) {
      showToast(this, {
        message: this._actionError ?? this._t("action_failed"),
      });
    }
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
    const ok = await this._run(
      () => removeSshKey(this.hass, toPathFingerprint(key.fingerprint)),
      "remove"
    );
    await this._afterRemove(ok, [key.line], this._t("removed_toast"));
  }

  private async _removeAll(): Promise<void> {
    const lines = this._keys.map((key) => key.line);
    const ok = await this._run(() => clearSshKeys(this.hass), "remove");
    await this._afterRemove(ok, lines, this._t("removed_all_toast"));
  }

  // ----------------------------------------------------------- copy

  private get _command(): string {
    return connectCommand(connectHost(window.location.hostname), this._port);
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
        <div class="page" aria-busy=${this._busy ? "true" : "false"}>
          ${
            this._unsupported
              ? this._renderUnsupported()
              : this._loading && !this._keys.length && !this._loadError
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
    // Without a successful first read there is nothing to manage yet.
    const failedFirst = this._loadError !== undefined && !this._entered;
    return html`
      ${
        this._loadError
          ? html`<ha-alert alert-type="error">${this._loadError}</ha-alert>`
          : nothing
      }
      ${
        failedFirst
          ? nothing
          : html`<div class=${classMap({ cols: true, off: !on })}>
              <div class="col left">
                ${this._renderStatus(on)} ${this._renderContainerNote()}
                ${this._renderHowTo()}
                <p class="hint o-hint">${this._t("admin_only")}</p>
              </div>
              <div class="col right">
                ${this._renderKeys()} ${this._renderAdd(on)}
                ${on ? this._renderRemoveAll() : nothing}
              </div>
            </div>`
      }
    `;
  }

  private _renderStatus(on: boolean): TemplateResult {
    const count = this._keys.length;
    return html`
      <section class="card o-status" aria-label=${this._t("status_label")}>
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
          <code class="mono" dir="ltr"
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
          ${this._t("keys_only_warning", { port: this._port })}
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
            <b class="mono" dir="ltr">${SSH_USER}</b>
          </div>
          <div class="fact">
            <span class="label">${this._t("fact_port")}</span>
            <b class="mono" dir="ltr">${this._port}</b>
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
      <section class="card o-note" aria-label=${this._t("container_title")}>
        <h3>${this._t("container_title")}</h3>
        <p>${this._t("container_text", { port: this._port })}</p>
      </section>
    `;
  }

  private _renderHowTo(): TemplateResult {
    return html`
      <section class="card o-howto" aria-label=${this._t("howto_title")}>
        <h3>${this._t("howto_title")}</h3>
        <ol class="steps">
          <li>
            <span class="num" aria-hidden="true">1</span>
            <span>
              ${this._t("howto_1")}
              <code class="inline mono" dir="ltr">ssh-keygen -t ed25519</code>
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
      <section class="card o-keys" aria-labelledby="keys-heading">
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

  private _renderActionError(
    where: "add" | "remove"
  ): TemplateResult | typeof nothing {
    return this._actionError && this._actionWhere === where
      ? html`<ha-alert alert-type="error">${this._actionError}</ha-alert>`
      : nothing;
  }

  private _renderKey(key: ListedKey): TemplateResult {
    const name = key.name || this._t("unnamed_key");
    if (this._ask === key.fingerprint && key.fingerprint) {
      return html`
        <div
          class="ask"
          role="group"
          aria-label=${this._t("remove_label", { name })}
          aria-describedby="ask-question ask-last"
        >
          <div class="name">
            <b>${name}</b
            ><span class="tag primary">${this._typeLabel(key.type)}</span>
          </div>
          <p id="ask-question">${this._t("remove_question")}</p>
          ${
            this._keys.length === 1
              ? html`<p class="sub" id="ask-last">
                  ${this._t("remove_last_note")}
                </p>`
              : nothing
          }
          ${this._renderActionError("remove")}
          <div class="actions">
            <ha-button
              appearance="plain"
              data-focus="cancel"
              data-return-to=${`remove-${key.fingerprint}`}
              @click=${this._cancelRemove}
              >${this._lang.text(this.hass.localize, "ui.common.cancel")}</ha-button
            >
            <ha-button
              variant="danger"
              data-focus="confirm"
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
            ${
              key.type
                ? html`<span class="tag primary"
                    >${this._typeLabel(key.type)}</span
                  >`
                : nothing
            }
            ${
              this._newFingerprint === key.fingerprint
                ? html`<span class="tag on">${this._t("new_tag")}</span>`
                : nothing
            }
          </div>
          ${
            key.fingerprint
              ? html`<span class="mono fingerprint" dir="ltr"
                  >${key.fingerprint}</span
                >`
              : nothing
          }
        </div>
        ${
          key.fingerprint
            ? html`<ha-icon-button
                .path=${mdiTrashCanOutline}
                .label=${this._t("remove_label", { name })}
                data-focus=${`remove-${key.fingerprint}`}
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
    const waiting = this._partial && !this._touched && !!this._draft.trim();
    const message = showProblem ? this._t(`problem_${this._problem}`) : "";
    return html`
      <section
        class=${classMap({ card: true, "o-add": true, first: !on })}
        aria-labelledby="add-heading"
      >
        <div class="head">
          <h3 id="add-heading">${this._t("add_title")}</h3>
          ${on ? nothing : html`<span class="tag primary">${this._t("start_here")}</span>`}
        </div>
        <p class="sub" id="field-help">${this._t("field_help")}</p>
        <ha-textarea
          .label=${this._t("field_label")}
          .validationMessage=${message}
          placeholder="ssh-ed25519 AAAA... laptop"
          .rows=${4}
          resize="auto"
          spellcheck="false"
          autocomplete="off"
          autocapitalize="none"
          data-focus="field"
          aria-describedby="field-help"
          .value=${live(this._draft)}
          .readonly=${this._busy}
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
          waiting
            ? html`<p class="sub" role="status">
                ${this._t("problem_partial")}
              </p>`
            : nothing
        }
        ${this._renderActionError("add")}
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
          ${
            this._draft
              ? html`<ha-button appearance="plain" @click=${this._clearDraft}>
                  ${this._t("clear")}
                </ha-button>`
              : nothing
          }
          <ha-button
            appearance="filled"
            ?disabled=${!ready}
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
          <span class="tag primary">${this._typeLabel(preview.type)}</span>
        </div>
        <span class="mono fingerprint" dir="ltr">${preview.fingerprint}</span>
      </div>
    `;
  }

  private _renderRemoveAll(): TemplateResult {
    if (this._ask === "all") {
      return html`
        <div
          class="ask o-removeall"
          role="group"
          aria-label=${this._t("remove_all")}
          aria-describedby="ask-question"
        >
          <p id="ask-question">${this._t("remove_all_question")}</p>
          ${this._renderActionError("remove")}
          <div class="actions">
            <ha-button
              appearance="plain"
              data-focus="cancel"
              data-return-to="remove-all"
              @click=${this._cancelRemove}
              >${this._lang.text(this.hass.localize, "ui.common.cancel")}</ha-button
            >
            <ha-button
              variant="danger"
              data-focus="confirm"
              @click=${this._removeAll}
              >${this._t("remove_all_confirm")}</ha-button
            >
          </div>
        </div>
      `;
    }
    return html`
      <div class="foot end o-removeall">
        <ha-button
          variant="danger"
          appearance="plain"
          data-focus="remove-all"
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
          container-type: inline-size;
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
          padding-block: var(--ha-space-2);
          padding-inline: var(--ha-space-3) var(--ha-space-1);
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
          padding-block: var(--ha-space-1);
          padding-inline: var(--ha-space-4) var(--ha-space-1);
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
        ha-button {
          --ha-button-height: 48px;
        }
        ha-icon-button {
          min-height: 48px;
          min-width: 48px;
        }
        .help {
          margin: 0;
        }
        @container (max-width: 799px) {
          .cols {
            flex-direction: column;
            flex-wrap: nowrap;
            align-items: stretch;
          }
          .col {
            display: contents;
          }
          .o-status {
            order: 1;
          }
          .o-keys {
            order: 2;
          }
          .cols.off .o-keys {
            order: 3;
          }
          .o-add {
            order: 3;
          }
          .o-add.first {
            order: 2;
          }
          .o-removeall {
            order: 4;
          }
          .o-howto {
            order: 5;
          }
          .o-note {
            order: 6;
          }
          .o-hint {
            order: 7;
          }
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
