import type { ContextType } from "@lit/context";
import { mdiClose } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, query, state } from "lit/decorators";
import { consume } from "../../common/decorators/consume";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import { fireEvent } from "../../common/dom/fire_event";
import { formatBytes } from "../../common/file-drop/format-bytes";
import {
  IMAGE_MAX_BYTES,
  MEDIA_MAX_BYTES,
} from "../../common/file-drop/drop-routing";
import type { Capabilities } from "../../common/converter/capabilities";
import { detectCapabilities } from "../../common/converter/capabilities";
import type { TargetId } from "../../common/converter/formats";
import { outputFileName } from "../../common/converter/output-name";
import type { ConvertNote } from "../../common/converter/types";
import { MAX_BYTES } from "../../common/converter/types";
import type { ConvertSource } from "../../common/media-manage/convert-item";
import {
  convertItem,
  convertTargets,
  sourceOf,
} from "../../common/media-manage/convert-item";
import {
  fetchItemFile,
  ItemFileError,
} from "../../common/media-manage/item-file";
import { nameTaken } from "../../common/media-manage/names";
import type { LocalizeFunc } from "../../common/translations/localize";
import { apiContext, internationalizationContext } from "../../data/context";
import { createImage } from "../../data/image_upload";
import { uploadLocalMedia } from "../../data/media_source";
import { showToast } from "../../util/toast";
import "../ha-button";
import "../ha-dialog";
import "../ha-dialog-header";
import "../ha-icon-button";
import "../ha-spinner";
import type { MediaConvertDialogParams } from "./show-media-convert-dialog";

const CONVERTER = "ui.panel.config.tools.tabs.converter";
const MANAGE = "ui.components.media-browser.file_management";

/** Most bytes of an item that are read to be converted. */
const MAX_READ = MAX_BYTES;

const formatKey = (target: TargetId) => target.replace(/-/g, "_");

@customElement("dialog-media-convert")
class DialogMediaConvert extends LitElement {
  @state() @consumeLocalize() private _baseLocalize!: LocalizeFunc;

  private _lang = new LanguageModeController(this);

  // Every string follows the language mode, English, Cantonese or both
  private get _localize(): LocalizeFunc {
    return ((key: string, values?: Record<string, string | number>) =>
      this._lang.text(this._baseLocalize, key, values)) as LocalizeFunc;
  }

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: ContextType<typeof internationalizationContext>;

  @state() private _params?: MediaConvertDialogParams;

  @state() private _open = false;

  @state() private _loading = false;

  @state() private _working = false;

  @state() private _problem = "";

  @state() private _source?: ConvertSource;

  @state() private _targets: TargetId[] = [];

  @query('.target[aria-checked="true"]')
  private _checkedTarget?: HTMLElement;

  @state() private _target?: TargetId;

  private _bytes?: Uint8Array;

  private _caps: Capabilities = detectCapabilities();

  private _abort?: AbortController;

  public showDialog(params: MediaConvertDialogParams): void {
    this._params = params;
    this._problem = "";
    this._source = undefined;
    this._targets = [];
    this._target = undefined;
    this._bytes = undefined;
    this._open = true;
  }

  // The file is read once the dialog is in place and has its API context
  protected willUpdate(changedProps: PropertyValues) {
    if (changedProps.has("_params") && this._params) {
      void this._load(this._params);
    }
  }

  public closeDialog() {
    this._open = false;
    return true;
  }

  private _dialogClosed(): void {
    this._abort?.abort();
    this._params = undefined;
    this._bytes = undefined;
    this._working = false;
    fireEvent(this, "dialog-closed", { dialog: this.localName });
  }

  private _conv(key: string, values?: Record<string, string | number>) {
    return this._localize(`${CONVERTER}.${key}` as any, values);
  }

  private _errorText(code: string, detail?: string): string {
    const text = this._conv(`error_${code}`, {
      detail: detail ?? "",
      name: detail ?? "",
      limit: formatBytes(MAX_BYTES),
    });
    return text || this._localize("ui.common.unknown_error");
  }

  private async _load(params: MediaConvertDialogParams): Promise<void> {
    this._loading = true;
    try {
      // The converter's own wording (format names, notes, errors) is in the
      // settings translations, which the Media page has not loaded
      await this._i18n.loadFragmentTranslation("config");
    } catch (_err) {
      // The names then fall back to the format identifiers
    }
    try {
      const file = await fetchItemFile(this._api, params.item, MAX_READ);
      const bytes = new Uint8Array(await file.blob.arrayBuffer());
      if (this._params !== params) {
        return;
      }
      const source = sourceOf(bytes);
      if (!source) {
        this._problem = this._localize(`${MANAGE}.convert_unsupported`);
        return;
      }
      const targets = convertTargets(source, params.store, this._caps);
      if (!targets.length) {
        this._problem = this._localize(`${MANAGE}.convert_no_targets`);
        return;
      }
      this._bytes = bytes;
      this._source = source;
      this._targets = targets;
      this._target = targets[0];
    } catch (err) {
      if (this._params === params) {
        this._problem =
          err instanceof ItemFileError && err.code === "too_large"
            ? this._errorText("too_large", params.item.title)
            : this._localize(`${MANAGE}.convert_read_failed`);
      }
    } finally {
      this._loading = false;
    }
  }

  private get _outputName(): string {
    return this._params && this._target
      ? outputFileName(this._params.item.title, this._target, false)
      : "";
  }

  protected render() {
    if (!this._params) {
      return nothing;
    }
    const store = this._params.store;
    return html`
      <ha-dialog
        .open=${this._open}
        ?prevent-scrim-close=${this._working}
        @closed=${this._dialogClosed}
      >
        <ha-dialog-header slot="header">
          ${
            this._working
              ? nothing
              : html`<ha-icon-button
                  slot="navigationIcon"
                  data-dialog="close"
                  .label=${this._localize("ui.common.close")}
                  .path=${mdiClose}
                ></ha-icon-button>`
          }
          <h1 class="title" slot="title">
            ${this._localize(`${MANAGE}.convert_title`)}
          </h1>
        </ha-dialog-header>
        <div class="body">
          <p class="file">${this._params.item.title}</p>
          ${
            this._loading
              ? html`<div class="refresh"><ha-spinner></ha-spinner></div>`
              : this._problem
                ? html`<p class="problem" role="alert">${this._problem}</p>`
                : html`
                    <div
                      class="targets"
                      role="radiogroup"
                      aria-label=${this._localize(`${MANAGE}.convert_to`)}
                      @keydown=${this._targetKeydown}
                    >
                      <p class="legend">
                        ${this._localize(`${MANAGE}.convert_to`)}
                      </p>
                      ${this._targets.map(
                        (target) =>
                          html`<button
                            type="button"
                            class="target"
                            role="radio"
                            aria-checked=${
                              this._target === target ? "true" : "false"
                            }
                            tabindex=${this._target === target ? 0 : -1}
                            ?disabled=${this._working}
                            .target=${target}
                            @click=${this._targetChanged}
                          >
                            <span class="dot"></span>
                            <span
                              >${
                                this._conv(
                                  `format_${formatKey(target)}_name`
                                ) || target
                              }</span
                            >
                          </button>`
                      )}
                    </div>
                    <p class="info">
                      ${this._localize(`${MANAGE}.convert_result_name`, {
                        name: this._outputName,
                      })}
                    </p>
                    <p class="info">
                      ${this._localize(`${MANAGE}.convert_original_kept`)}
                      ${
                        store === "image"
                          ? this._localize(`${MANAGE}.convert_image_store`)
                          : nothing
                      }
                    </p>
                  `
          }
        </div>
        <div class="actions">
          <ha-button
            .disabled=${
              this._loading || this._working || !this._target || !!this._problem
            }
            .loading=${this._working}
            @click=${this._convert}
          >
            ${this._localize(`${MANAGE}.convert`)}
          </ha-button>
          <ha-button
            appearance="plain"
            .disabled=${this._working}
            @click=${this.closeDialog}
          >
            ${this._localize("ui.common.cancel")}
          </ha-button>
        </div>
      </ha-dialog>
    `;
  }

  private _targetChanged(ev: Event) {
    this._target = (
      ev.currentTarget as HTMLElement & { target: TargetId }
    ).target;
    this._problem = "";
  }

  // Arrow keys move the choice, as in any group of radio buttons.
  private _targetKeydown(ev: KeyboardEvent) {
    const step =
      ev.key === "ArrowDown" || ev.key === "ArrowRight"
        ? 1
        : ev.key === "ArrowUp" || ev.key === "ArrowLeft"
          ? -1
          : 0;
    if (!step || this._working || !this._targets.length) {
      return;
    }
    ev.preventDefault();
    const index = this._target ? this._targets.indexOf(this._target) : -1;
    const next =
      this._targets[
        (index + step + this._targets.length) % this._targets.length
      ];
    this._target = next;
    this._problem = "";
    this.updateComplete.then(() => this._checkedTarget?.focus());
  }

  private _notesText(notes: ConvertNote[]): string {
    return notes
      .map((note) =>
        this._conv(`note_${note.code}`, { count: note.count ?? 0 })
      )
      .join(" ");
  }

  private async _convert(): Promise<void> {
    const params = this._params;
    const bytes = this._bytes;
    const source = this._source;
    const target = this._target;
    if (!params || !bytes || !source || !target || this._working) {
      return;
    }
    const name = this._outputName;
    if (nameTaken(name, params.existingNames)) {
      this._problem = this._localize(`${MANAGE}.convert_name_taken`, { name });
      return;
    }
    this._problem = "";
    this._working = true;
    this._abort = new AbortController();
    try {
      const result = await convertItem(
        params.item.title,
        bytes,
        source,
        target,
        this._abort.signal
      );
      if (!result.ok) {
        this._problem = this._errorText(result.error.code, result.error.detail);
        return;
      }
      const limit =
        params.store === "image" ? IMAGE_MAX_BYTES : MEDIA_MAX_BYTES;
      if (result.file.size > limit) {
        this._problem = this._localize(`${MANAGE}.convert_too_large`, {
          limit: formatBytes(limit),
        });
        return;
      }
      try {
        if (params.store === "image") {
          await createImage(
            this._api.fetchWithAuth,
            this._localize,
            result.file,
            undefined,
            params.destination || undefined
          );
        } else {
          await uploadLocalMedia(
            this._api.fetchWithAuth,
            this._localize,
            params.destination,
            result.file
          );
        }
      } catch (err: any) {
        this._problem = this._localize(`${MANAGE}.upload_failed`, {
          reason: err?.message || this._localize("ui.common.unknown_error"),
        });
        return;
      }
      const losses = this._notesText(result.notes);
      showToast(this, {
        message: `${this._localize(`${MANAGE}.convert_done`, {
          name: result.file.name,
        })}${losses ? ` ${losses}` : ""}`,
        duration: 10000,
        dismissable: true,
      });
      params.onStored?.();
      this.closeDialog();
    } finally {
      this._working = false;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      css`
        .title {
          font: inherit;
          font-size: inherit;
          margin: inherit;
        }
        .body {
          padding: 0 16px 8px;
        }
        .file {
          margin: 0 0 8px;
          overflow-wrap: anywhere;
          font-weight: var(--ha-font-weight-medium, 500);
        }
        .refresh {
          display: flex;
          height: 120px;
          justify-content: center;
          align-items: center;
        }
        .problem {
          color: var(--error-color);
          margin: 8px 0;
        }
        .info {
          margin: 8px 0;
          color: var(--secondary-text-color);
          overflow-wrap: anywhere;
        }
        .targets {
          border: 0;
          margin: 0;
          padding: 0;
        }
        .targets legend {
          padding: 0;
          margin-bottom: 4px;
          color: var(--secondary-text-color);
        }
        .target {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 44px;
          cursor: pointer;
        }
        button.target {
          width: 100%;
          border: none;
          background: none;
          padding: 0;
          font: inherit;
          color: inherit;
          text-align: start;
        }
        button.target:focus-visible {
          outline: 2px solid var(--primary-color);
          outline-offset: 2px;
          border-radius: var(--ha-border-radius-sm, 4px);
        }
        .target .dot {
          box-sizing: border-box;
          flex: none;
          width: 20px;
          height: 20px;
          border: 2px solid var(--secondary-text-color);
          border-radius: 50%;
        }
        .target[aria-checked="true"] .dot {
          border: 6px solid var(--primary-color);
        }
        .legend {
          margin: 0 0 4px;
          font-weight: 500;
        }
        .actions {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          padding: 8px 16px 16px;
        }
        .actions ha-button {
          --ha-button-height: 44px;
          --button-height: 44px;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "dialog-media-convert": DialogMediaConvert;
  }
}
