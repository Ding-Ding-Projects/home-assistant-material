import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../../../common/dom/fire_event";
import { LanguageModeController } from "../../../../common/language-mode/language-mode-controller";
import "../../../../components/ha-dialog";
import "../../../../components/ha-dialog-footer";
import "../../../../components/ha-alert";
import "../../../../components/ha-form/ha-form";
import "../../../../components/ha-button";
import type { SchemaUnion } from "../../../../components/ha-form/types";
import {
  resourceUploadConsentValues,
  validateResourceUpload,
} from "../../../../data/lovelace/resource";
import "../../../../components/ha-button-toggle-group";
import type { LovelaceResourcesMutableParams } from "../../../../data/lovelace/resource";
import { DirtyStateProviderMixin } from "../../../../mixins/dirty-state-provider-mixin";
import type { HomeAssistant } from "../../../../types";
import type { LovelaceResourceDetailsDialogParams } from "./show-dialog-lovelace-resource-detail";

const detectResourceType = (url?: string) => {
  if (!url) {
    return undefined;
  }
  const ext = url.split(".").pop() || "";

  if (ext === "css") {
    return "css";
  }

  if (ext === "js") {
    return "module";
  }

  return undefined;
};

@customElement("dialog-lovelace-resource-detail")
export class DialogLovelaceResourceDetail extends DirtyStateProviderMixin<
  Partial<LovelaceResourcesMutableParams>
>()(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _params?: LovelaceResourceDetailsDialogParams;

  @state() private _data?: Partial<LovelaceResourcesMutableParams>;

  @state() private _error?: Record<string, string>;

  @state() private _submitting = false;

  @state() private _open = false;
  @state() private _source: "url" | "upload" = "url";
  @state() private _file?: File;
  @query("input[type=file]") private _fileInput?: HTMLInputElement;
  private _languageMode = new LanguageModeController(this);

  private _text(key: string, values?: Record<string, string | number>) {
    return this._languageMode.text(this.hass.localize, key, values);
  }

  public showDialog(params: LovelaceResourceDetailsDialogParams): void {
    this._params = params;
    this._error = undefined;
    this._file = undefined;
    this._source = "url";
    this._submitting = false;
    if (this._params.resource) {
      this._data = {
        url: this._params.resource.url,
        res_type: this._params.resource.type,
      };
    } else {
      this._data = {
        url: "",
      };
    }
    this._open = true;
    this._initDirtyTracking({ type: "deep" }, this._data);
  }

  public closeDialog(): void {
    if (!this._submitting) this._open = false;
  }

  private _dialogClosed(): void {
    this._params = undefined;
    this._file = undefined;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const immutable = !!this._params.resource?.uploaded;
    const uploadInvalid = !this._file || !!validateResourceUpload(this._file);
    const urlInvalid = !this._data?.url || this._data.url.trim() === "";

    const dialogTitle =
      this._params.resource?.url ||
      this._text("ui.panel.config.lovelace.resources.detail.new_resource");

    return html`
      <ha-dialog
        .open=${this._open}
        .preventScrimClose=${this.isDirtyState || this._submitting}
        header-title=${dialogTitle}
        @closed=${this._dialogClosed}
      >
        <ha-alert
          alert-type="warning"
          .title=${this._text(
            "ui.panel.config.lovelace.resources.detail.warning_header"
          )}
        >
          ${this._text(
            "ui.panel.config.lovelace.resources.detail.warning_text"
          )}
        </ha-alert>

        ${
          !this._params.resource && this._params.allowUpload
            ? html` <ha-button-toggle-group
                .buttons=${[
                  {
                    value: "url",
                    label: this._text(
                      "ui.panel.config.lovelace.resources.detail.source_url"
                    ),
                  },
                  {
                    value: "upload",
                    label: this._text(
                      "ui.panel.config.lovelace.resources.detail.source_upload"
                    ),
                  },
                ]}
                .active=${this._source}
                .disabled=${this._submitting}
                @value-changed=${this._sourceChanged}
              ></ha-button-toggle-group>`
            : nothing
        }
        ${
          immutable
            ? html`
                <ha-alert alert-type="info"
                  >${this._text("ui.panel.config.lovelace.resources.detail.uploaded_readonly")}</ha-alert
                >
                <p class="filename">
                  ${this._params.resource?.filename || this._params.resource?.url}
                </p>
              `
            : this._source === "upload"
              ? html`
                  <div class="upload">
                    <p id="upload-help">
                      ${this._text("ui.panel.config.lovelace.resources.detail.upload_help")}
                    </p>
                    <input
                      type="file"
                      accept=".js,.mjs,.css"
                      hidden
                      @change=${this._filePicked}
                    />
                    <ha-button
                      .disabled=${this._submitting}
                      aria-describedby="upload-help"
                      @click=${this._chooseFile}
                    >
                      ${this._text("ui.panel.config.lovelace.resources.detail.upload_pick")}
                    </ha-button>
                    <p class="filename" role="status">
                      ${this._file ? this._text("ui.panel.config.lovelace.resources.detail.selected_file", { filename: this._file.name }) : nothing}
                    </p>
                    ${this._error?.base ? html`<ha-alert alert-type="error" role="alert">${this._error.base}</ha-alert>` : nothing}
                  </div>
                `
              : html`<ha-form
                  autofocus
                  .schema=${this._schema(this._data)}
                  .data=${this._data}
                  .hass=${this.hass}
                  .error=${this._error}
                  .disabled=${this._submitting}
                  .computeLabel=${this._computeLabel}
                  @value-changed=${this._valueChanged}
                ></ha-form>`
        }

        <ha-dialog-footer slot="footer">
          <ha-button
            appearance="plain"
            slot="secondaryAction"
            .disabled=${this._submitting}
            @click=${this.closeDialog}
          >
            ${this.hass!.localize(immutable ? "ui.common.close" : "ui.common.cancel")}
          </ha-button>
          ${
            immutable
              ? nothing
              : html`<ha-button
                  slot="primaryAction"
                  .loading=${this._submitting}
                  @click=${this._updateResource}
                  .disabled=${
                    immutable ||
                    this._submitting ||
                    (this._source === "upload"
                      ? uploadInvalid
                      : urlInvalid ||
                        !this._data?.res_type ||
                        !this.isDirtyState)
                  }
                >
                  ${
                    this._params.resource
                      ? this._text(
                          "ui.panel.config.lovelace.resources.detail.update"
                        )
                      : this._text(
                          "ui.panel.config.lovelace.resources.detail.create"
                        )
                  }
                </ha-button>`
          }
        </ha-dialog-footer>
      </ha-dialog>
    `;
  }

  private _sourceChanged(ev: CustomEvent<{ value: "url" | "upload" }>) {
    ev.stopPropagation();
    if (this._submitting) return;
    this._source = ev.detail.value;
    const invalid =
      this._source === "upload" && this._file
        ? validateResourceUpload(this._file)
        : undefined;
    this._error = invalid
      ? {
          base: this._text(
            `ui.panel.config.lovelace.resources.detail.${invalid}`
          ),
        }
      : undefined;
    this._updateDirtyState(
      this._source === "upload" && this._file
        ? resourceUploadConsentValues(this._file)
        : this._data!
    );
  }

  private _chooseFile() {
    if (!this._submitting) this._fileInput?.click();
  }

  private _filePicked(ev: Event) {
    if (this._submitting) return;
    const input = ev.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    this._file = file;
    input.value = "";
    const invalid = validateResourceUpload(file);
    this._error = invalid
      ? {
          base: this._text(
            `ui.panel.config.lovelace.resources.detail.${invalid}`
          ),
        }
      : undefined;
    this._updateDirtyState(resourceUploadConsentValues(file));
  }

  private _schema = memoizeOne(
    (data) =>
      [
        {
          name: "url",
          required: true,
          selector: {
            text: {},
          },
        },
        {
          name: "res_type",
          required: true,
          selector: {
            select: {
              options: [
                {
                  value: "module",
                  label: this.hass!.localize(
                    "ui.panel.config.lovelace.resources.types.module"
                  ),
                },
                {
                  value: "css",
                  label: this.hass!.localize(
                    "ui.panel.config.lovelace.resources.types.css"
                  ),
                },
                ...(data.type === "js"
                  ? ([
                      {
                        value: "js",
                        label: this.hass!.localize(
                          "ui.panel.config.lovelace.resources.types.js"
                        ),
                      },
                    ] as const)
                  : []),
                ...(data.type === "html"
                  ? ([
                      {
                        value: "html",
                        label: this.hass!.localize(
                          "ui.panel.config.lovelace.resources.types.html"
                        ),
                      },
                    ] as const)
                  : []),
              ],
            },
          },
        },
      ] as const
  );

  private _computeLabel = (
    entry: SchemaUnion<ReturnType<typeof this._schema>>
  ): string =>
    this._text(
      `ui.panel.config.lovelace.resources.detail.${
        entry.name === "res_type" ? "type" : entry.name
      }`
    );

  private _valueChanged(ev: CustomEvent) {
    this._data = ev.detail.value;
    if (!this._data!.res_type) {
      const type = detectResourceType(this._data!.url);
      if (!type) {
        this._updateDirtyState(this._data!);
        return;
      }
      this._data = {
        ...this._data,
        res_type: type,
      };
    }
    this._updateDirtyState(this._data!);
  }

  private async _updateResource() {
    if (this._submitting || !this._params || this._params.resource?.uploaded) {
      return;
    }
    const uploading = this._source === "upload";
    if (uploading) {
      if (!this._file || validateResourceUpload(this._file)) return;
    } else if (!this._data?.res_type || !this._data.url?.trim()) return;

    this._submitting = true;
    try {
      if (this._params!.resource) {
        await this._params!.updateResource(this._data!);
      } else {
        await this._params!.createResource(
          uploading
            ? resourceUploadConsentValues(this._file!)
            : (this._data! as LovelaceResourcesMutableParams),
          uploading ? this._file : undefined
        );
      }
      this._markDirtyStateClean();
      this._open = false;
    } catch (err: any) {
      this._error = {
        base:
          err?.message ||
          this.hass.localize(
            uploading
              ? "ui.panel.config.lovelace.resources.detail.upload_failed"
              : "ui.common.unknown_error"
          ),
      };
    } finally {
      this._submitting = false;
    }
  }
  static styles = css`
    ha-button-toggle-group {
      display: block;
      margin: 16px 0;
    }
    .upload {
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }
    .upload p {
      margin: 0;
    }
    .filename {
      overflow-wrap: anywhere;
      max-width: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-lovelace-resource-detail": DialogLovelaceResourceDetail;
  }
}
