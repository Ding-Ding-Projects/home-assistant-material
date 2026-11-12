import { mdiDelete, mdiPencil } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { relativeTime } from "../../common/datetime/relative_time";
import type { HASSDomCurrentTargetEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-icon-button";
import type { HaIconButton } from "../../components/ha-icon-button";
import "../../components/ha-settings-row";
import type { Passkey } from "../../data/passkey";
import {
  deleteAllPasskeys,
  deletePasskey,
  fetchPasskeys,
  isPasskeySupported,
  registerPasskey,
  renamePasskey,
  toPasskeyError,
} from "../../data/passkey";
import {
  showAlertDialog,
  showConfirmationDialog,
  showPromptDialog,
} from "../../dialogs/generic/show-dialog-box";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";

@customElement("ha-passkeys-card")
class HaPasskeysCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _passkeys?: Passkey[];

  @state() private _unavailable = false;

  @state() private _loadFailed = false;

  @state() private _busy = false;

  private _supported = isPasskeySupported();

  // Draws the card again when the language mode changes.
  private _lang = new LanguageModeController(this);

  /** A string of this card, in the chosen language mode. */
  private _text(key: string, values?: Record<string, string | number>): string {
    return this._lang.text(this.hass.localize, key, values);
  }

  public connectedCallback() {
    super.connectedCallback();
    this._load();
  }

  protected render(): TemplateResult | typeof nothing {
    if (this._unavailable) {
      return nothing;
    }

    return html`
      <ha-card .header=${this._text("ui.panel.profile.passkeys.header")}>
        <div class="card-content">
          <p>${this._text("ui.panel.profile.passkeys.description")}</p>
          <p class="note">
            ${this._text("ui.panel.profile.passkeys.mfa_note")}
          </p>
          <p class="note">
            ${this._text("ui.panel.profile.passkeys.persistence_note")}
          </p>
          ${
            this._supported
              ? nothing
              : html`<ha-alert alert-type="info">
                  ${this._text("ui.panel.profile.passkeys.unsupported")}
                </ha-alert>`
          }
          ${
            this._loadFailed
              ? html`<ha-alert alert-type="error">
                  ${this._text("ui.panel.profile.passkeys.load_failed")}
                </ha-alert>`
              : nothing
          }
          ${
            this._passkeys && !this._passkeys.length && !this._loadFailed
              ? html`<p>${this._text("ui.panel.profile.passkeys.empty")}</p>`
              : nothing
          }
          ${(this._passkeys ?? []).map(
            (passkey) =>
              html`<ha-settings-row two-line>
                <span slot="heading">${passkey.name}</span>
                <div slot="description">${this._describe(passkey)}</div>
                <ha-icon-button
                  .passkey=${passkey}
                  .disabled=${this._busy}
                  .label=${this._text("ui.panel.profile.passkeys.rename")}
                  .path=${mdiPencil}
                  @click=${this._rename}
                ></ha-icon-button>
                <ha-icon-button
                  .passkey=${passkey}
                  .disabled=${this._busy}
                  .label=${this.hass.localize("ui.common.delete")}
                  .path=${mdiDelete}
                  @click=${this._delete}
                ></ha-icon-button>
              </ha-settings-row>`
          )}
        </div>
        ${
          this._supported || this._passkeys?.length
            ? html`<div class="card-actions">
                ${
                  this._passkeys?.length
                    ? html`<ha-button
                        appearance="plain"
                        variant="danger"
                        .disabled=${this._busy}
                        @click=${this._deleteAll}
                      >
                        ${this._text("ui.panel.profile.passkeys.delete_all")}
                      </ha-button>`
                    : nothing
                }
                ${
                  this._supported
                    ? html`<ha-button
                        @click=${this._add}
                        .loading=${this._busy}
                      >
                        ${this._text("ui.panel.profile.passkeys.add")}
                      </ha-button>`
                    : nothing
                }
              </div>`
            : nothing
        }
      </ha-card>
    `;
  }

  private _describe(passkey: Passkey): string {
    const created = this._text("ui.panel.profile.passkeys.created", {
      date: relativeTime(new Date(passkey.created), this.hass.locale),
    });
    const used = passkey.last_used
      ? this._text("ui.panel.profile.passkeys.last_used", {
          date: relativeTime(new Date(passkey.last_used), this.hass.locale),
        })
      : this._text("ui.panel.profile.passkeys.never_used");
    return `${created} · ${used}`;
  }

  private async _load(): Promise<void> {
    try {
      this._passkeys = await fetchPasskeys(this.hass);
      this._loadFailed = false;
    } catch (err: any) {
      if (err?.code === "unknown_command") {
        this._unavailable = true;
        return;
      }
      this._loadFailed = true;
    }
  }

  private async _add(): Promise<void> {
    const name = await showPromptDialog(this, {
      title: this._text("ui.panel.profile.passkeys.add_title"),
      inputLabel: this._text("ui.panel.profile.passkeys.name"),
      defaultValue: this.hass.localize(
        "ui.panel.profile.passkeys.default_name"
      ),
      confirmText: this._text("ui.panel.profile.passkeys.add"),
    });
    if (name === null) {
      return;
    }
    this._busy = true;
    try {
      await registerPasskey(this.hass, name.trim());
      await this._load();
    } catch (err) {
      const { kind } = toPasskeyError(err);
      if (kind !== "cancelled") {
        await showAlertDialog(this, {
          title: this._text("ui.panel.profile.passkeys.add_failed"),
          text: this.hass.localize(
            kind === "sign_in_required"
              ? "ui.panel.profile.passkeys.sign_in_again"
              : "ui.panel.profile.passkeys.add_failed_text"
          ),
        });
      }
    } finally {
      this._busy = false;
    }
  }

  private async _rename(
    ev: HASSDomCurrentTargetEvent<HaIconButton & { passkey: Passkey }>
  ): Promise<void> {
    const passkey = ev.currentTarget.passkey;
    const name = await showPromptDialog(this, {
      title: this._text("ui.panel.profile.passkeys.rename"),
      inputLabel: this._text("ui.panel.profile.passkeys.name"),
      defaultValue: passkey.name,
    });
    if (name === null || !name.trim() || name.trim() === passkey.name) {
      return;
    }
    this._busy = true;
    try {
      await renamePasskey(this.hass, passkey.id, name.trim());
      await this._load();
    } catch (_err: any) {
      await showAlertDialog(this, {
        text: this._text("ui.panel.profile.passkeys.rename_failed"),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _delete(
    ev: HASSDomCurrentTargetEvent<HaIconButton & { passkey: Passkey }>
  ): Promise<void> {
    const passkey = ev.currentTarget.passkey;
    if (
      !(await showConfirmationDialog(this, {
        title: this._text("ui.panel.profile.passkeys.confirm_delete_title"),
        text: this._text("ui.panel.profile.passkeys.confirm_delete_text", {
          name: passkey.name,
        }),
        confirmText: this.hass.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }
    this._busy = true;
    try {
      await deletePasskey(this.hass, passkey.id);
      await this._load();
    } catch (err) {
      await showAlertDialog(this, {
        text: this.hass.localize(
          toPasskeyError(err).kind === "sign_in_required"
            ? "ui.panel.profile.passkeys.sign_in_again_to_remove"
            : "ui.panel.profile.passkeys.delete_failed"
        ),
      });
    } finally {
      this._busy = false;
    }
  }

  private async _deleteAll(): Promise<void> {
    if (
      !(await showConfirmationDialog(this, {
        title: this._text("ui.panel.profile.passkeys.confirm_delete_all_title"),
        text: this._text("ui.panel.profile.passkeys.confirm_delete_all_text"),
        confirmText: this._text("ui.panel.profile.passkeys.delete_all"),
        destructive: true,
      }))
    ) {
      return;
    }
    this._busy = true;
    try {
      await deleteAllPasskeys(this.hass);
      await this._load();
    } catch (err) {
      await showAlertDialog(this, {
        text: this.hass.localize(
          toPasskeyError(err).kind === "sign_in_required"
            ? "ui.panel.profile.passkeys.sign_in_again_to_remove"
            : "ui.panel.profile.passkeys.delete_failed"
        ),
      });
    } finally {
      this._busy = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        ha-settings-row {
          padding: 0;
        }
        ha-icon-button {
          color: var(--primary-text-color);
        }
        .card-actions {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .note {
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-passkeys-card": HaPasskeysCard;
  }
}
