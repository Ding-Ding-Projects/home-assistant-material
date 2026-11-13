import { mdiContentCopy, mdiNfc } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../common/dom/fire_event";
import type { NfcListener } from "../../../common/locks/nfc-reader";
import {
  listenForNfcTag,
  webNfcAvailable,
} from "../../../common/locks/nfc-reader";
import { copyToClipboard } from "../../../common/util/copy-clipboard";
import { generateUuidV4 } from "../../../common/util/uuid";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-dialog";
import "../../../components/ha-dialog-footer";
import "../../../components/ha-expansion-panel";
import "../../../components/ha-icon-button";
import "../../../components/ha-qr-code";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type { HaInput } from "../../../components/input/ha-input";
import type { Tag, UpdateTagParams } from "../../../data/tag";
import type { HassDialog } from "../../../dialogs/make-dialog-manager";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import { haStyleDialog } from "../../../resources/styles";
import type { HomeAssistant } from "../../../types";
import { documentationUrl } from "../../../util/documentation-url";
import { showToast } from "../../../util/toast";
import type { TagDetailDialogParams } from "./show-dialog-tag-detail";

interface TagFormState {
  name: string;
  id: string | undefined;
  useCustomId: boolean;
}

@customElement("dialog-tag-detail")
class DialogTagDetail
  extends DirtyStateProviderMixin<TagFormState>()(LitElement)
  implements HassDialog<TagDetailDialogParams>
{
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _id?: string;

  @state() private _name!: string;

  @state() private _useCustomId = false;

  @state() private _error?: string;

  @state() private _params?: TagDetailDialogParams;

  @state() private _submitting = false;

  @state() private _open = false;

  @state() private _qrReady = false;

  /** What the scan button is doing: listening, or what it heard. */
  @state() private _scan?: "listening" | "read" | "known" | "denied" | "failed";

  private _nfc?: NfcListener;

  public showDialog(params: TagDetailDialogParams): void {
    this._params = params;
    this._error = undefined;
    this._open = true;
    this._useCustomId = false;
    if (this._params.entry) {
      this._name = this._params.entry.name || "";
    } else {
      this._id = "";
      this._name = "";
    }
    this._initDirtyTracking({ type: "deep" }, this._currentState());

    // Defer QR until dialog has had a chance to apply styles
    requestAnimationFrame(() => {
      this._qrReady = true;
    });
  }

  private _currentState(): TagFormState {
    return {
      name: this._name,
      id: this._id,
      useCustomId: this._useCustomId,
    };
  }

  public closeDialog(): boolean {
    this._stopScan();
    this._open = false;
    return true;
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    this._stopScan();
  }

  private _stopScan(): void {
    this._nfc?.stop();
    this._nfc = undefined;
    if (this._scan === "listening") {
      this._scan = undefined;
    }
  }

  private _toggleScan(): void {
    if (this._nfc) {
      this._stopScan();
      return;
    }
    this._scan = "listening";
    this._nfc = listenForNfcTag(
      (identity) => this._tagHeard(identity),
      (reason) => {
        // The app route keeps listening when it can; say so only if it cannot.
        if (this._nfc?.status !== "both" || !this.hass?.connection) {
          this._stopScan();
        }
        this._scan = reason;
      }
    );
    if (this._nfc.status === "none") {
      this._stopScan();
      this._scan = "failed";
    }
  }

  private _tagHeard(identity: string): void {
    const separator = identity.indexOf(":");
    const source = identity.slice(0, separator);
    const value = identity.slice(separator + 1);
    this._stopScan();
    if (source === "tag") {
      // A scan with the app: Home Assistant has added this tag by itself.
      this._scan = "known";
      return;
    }
    this._useCustomId = true;
    this._id = value;
    this._error = undefined;
    this._scan = "read";
    this._updateDirtyState(this._currentState());
  }

  private _renderScan() {
    const here = webNfcAvailable();
    const text =
      this._scan === "listening"
        ? here
          ? "scan_listening_here"
          : "scan_listening_app"
        : this._scan === "read"
          ? "scan_read"
          : this._scan === "known"
            ? "scan_known"
            : this._scan === "denied"
              ? "scan_denied"
              : this._scan === "failed"
                ? "scan_failed"
                : here
                  ? "scan_hint_here"
                  : "scan_hint_app";
    return html`
      <div class="scan">
        <ha-button appearance="filled" @click=${this._toggleScan}>
          <ha-svg-icon slot="start" .path=${mdiNfc}></ha-svg-icon>
          ${this.hass!.localize(
            this._nfc
              ? "ui.panel.config.tag.detail.scan_stop"
              : "ui.panel.config.tag.detail.scan"
          )}
        </ha-button>
        <p class="scan-text" role="status">
          ${this.hass!.localize(`ui.panel.config.tag.detail.${text}`)}
        </p>
      </div>
    `;
  }

  private _dialogClosed() {
    this._params = undefined;
    this._qrReady = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }

    return html`
      <ha-dialog
        .open=${this._open}
        header-title=${
          this._params.entry
            ? this.hass!.localize("ui.panel.config.tag.detail.tag_details")
            : this.hass!.localize("ui.panel.config.tag.detail.new_tag")
        }
        .preventScrimClose=${this.isDirtyState}
        @closed=${this._dialogClosed}
      >
        <div>
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : ""
          }
          <div class="form">
            <ha-input
              autofocus
              .value=${this._name}
              .configValue=${"name"}
              @input=${this._valueChanged}
              .label=${this.hass!.localize("ui.panel.config.tag.detail.name")}
              .validationMessage=${this.hass!.localize(
                "ui.panel.config.tag.detail.required_error_msg"
              )}
              required
            ></ha-input>
            ${
              this._params.entry
                ? nothing
                : html`
                    ${this._renderScan()}
                    <ha-expansion-panel
                      outlined
                      .header=${this.hass!.localize(
                        "ui.panel.config.tag.detail.use_custom_id"
                      )}
                      .expanded=${this._useCustomId}
                      @expanded-changed=${this._useCustomIdChanged}
                    >
                      <ha-input
                        .value=${this._id || ""}
                        .configValue=${"id"}
                        @input=${this._valueChanged}
                        .label=${this.hass!.localize(
                          "ui.panel.config.tag.detail.tag_id"
                        )}
                        .placeholder=${this.hass!.localize(
                          "ui.panel.config.tag.detail.tag_id_placeholder"
                        )}
                      ></ha-input>
                      <ha-alert alert-type="info">
                        ${this.hass!.localize(
                          "ui.panel.config.tag.detail.custom_id_warning"
                        )}
                      </ha-alert>
                    </ha-expansion-panel>
                  `
            }
          </div>
          ${
            this._params.entry
              ? html`
                  <div>
                    <p>
                      ${this.hass!.localize(
                        "ui.panel.config.tag.detail.usage",
                        {
                          companion_link: this.hass!.localize(
                            "ui.panel.config.tag.detail.companion_apps"
                          ),
                        }
                      )}
                    </p>
                  </div>
                  <div id="qr">
                    ${
                      this._qrReady
                        ? html`
                            <ha-qr-code
                              .data=${`${documentationUrl(this.hass, "/tag/")}${this._params!.entry!.id}`}
                              center-image="/static/icons/favicon-192x192.png"
                              error-correction-level="quartile"
                              scale="5"
                            >
                            </ha-qr-code>
                          `
                        : nothing
                    }
                  </div>
                  <div class="tag-id">
                    <span class="tag-id-label">
                      ${this.hass!.localize("ui.panel.config.tag.detail.tag_id")}:
                    </span>
                    <span class="tag-id-value">${this._params.entry.id}</span>
                    <ha-icon-button
                      .path=${mdiContentCopy}
                      .label=${this.hass!.localize("ui.common.copy")}
                      @click=${this._copyId}
                    ></ha-icon-button>
                  </div>
                `
              : ``
          }
        </div>
        <ha-dialog-footer slot="footer">
          ${
            this._params.entry
              ? html`
                  <ha-button
                    slot="secondaryAction"
                    variant="danger"
                    appearance="plain"
                    @click=${this._deleteEntry}
                    .disabled=${this._submitting}
                  >
                    ${this.hass!.localize("ui.panel.config.tag.detail.delete")}
                  </ha-button>
                `
              : nothing
          }
          <ha-button
            slot="primaryAction"
            @click=${this._updateEntry}
            .disabled=${
              this._submitting ||
              !this._name ||
              (!!this._params.entry && !this.isDirtyState)
            }
          >
            ${
              this._params.entry
                ? this.hass!.localize("ui.panel.config.tag.detail.update")
                : this.hass!.localize("ui.panel.config.tag.detail.create")
            }
          </ha-button>
          ${
            this._params.openWrite && !this._params.entry
              ? html`<ha-button
                  slot="primaryAction"
                  @click=${this._updateWriteEntry}
                  .disabled=${this._submitting || !this._name}
                >
                  ${this.hass!.localize(
                    "ui.panel.config.tag.detail.create_and_write"
                  )}
                </ha-button>`
              : ""
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _valueChanged(ev: InputEvent) {
    const target = ev.target as HaInput;
    const configValue = (target as any).configValue;

    this._error = undefined;
    this[`_${configValue}`] = target.value;
    this._updateDirtyState(this._currentState());
  }

  private _useCustomIdChanged(ev: CustomEvent) {
    this._useCustomId = ev.detail.expanded;
    if (this._useCustomId) {
      if (!this._id) {
        this._id = generateUuidV4();
      }
    } else {
      this._id = "";
    }
    this._updateDirtyState(this._currentState());
  }

  private async _copyId() {
    if (!this._params?.entry) {
      return;
    }
    await copyToClipboard(this._params.entry.id);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private async _updateEntry() {
    this._submitting = true;
    let newValue: Tag | undefined;
    try {
      const values: UpdateTagParams = {
        name: this._name.trim(),
      };
      if (this._params!.entry) {
        newValue = await this._params!.updateEntry!(values);
      } else {
        newValue = await this._params!.createEntry(
          values,
          this._useCustomId ? this._id : ""
        );
      }
      this._markDirtyStateClean();
      this.closeDialog();
    } catch (err: any) {
      this._error = err ? err.message : "Unknown error";
    } finally {
      this._submitting = false;
    }
    return newValue;
  }

  private async _updateWriteEntry() {
    const openWrite = this._params?.openWrite;
    const tag = await this._updateEntry();
    if (!tag || !openWrite) {
      return;
    }
    openWrite(tag);
  }

  private async _deleteEntry() {
    this._submitting = true;
    try {
      if (await this._params!.removeEntry!()) {
        this._params = undefined;
      }
    } finally {
      this._submitting = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyleDialog,
      css`
        a {
          color: var(--primary-color);
        }
        #qr {
          text-align: center;
        }
        ha-input {
          --ha-input-padding-bottom: 0;
        }
        ha-input:not([required]) {
          margin-bottom: var(--ha-space-5);
        }
        ha-expansion-panel {
          display: block;
          margin-bottom: var(--ha-space-2);
        }
        ha-expansion-panel[expanded] {
          --expansion-panel-content-padding: var(--ha-space-3) var(--ha-space-2);
        }
        ha-alert {
          display: block;
          margin-top: var(--ha-space-2);
        }
        .scan {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          flex-wrap: wrap;
          margin: var(--ha-space-3) 0;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-xl);
          background: var(--ha-color-surface-tone-1);
        }
        .scan-text {
          flex: 1;
          min-width: 180px;
          margin: 0;
          color: var(--secondary-text-color);
        }
        .tag-id {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: var(--ha-space-1);
          margin-top: var(--ha-space-3);
          color: var(--secondary-text-color);
        }
        .tag-id-value {
          font-family: var(--ha-font-family-code);
          color: var(--primary-text-color);
        }
        ::slotted(img) {
          height: 100%;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-tag-detail": DialogTagDetail;
  }
}
