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

  @state() private _phase?: "converting" | "uploading";

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
    this._abort?.abort();
    this._working = false;
    this._phase = undefined;
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
    this._abort?.abort();
    this._open = false;
    return true;
  }

  public disconnectedCallback() {
    this._abort?.abort();
    super.disconnectedCallback();
  }

  private _cancel = () => {
    const uploading = this._working && this._phase === "uploading";
    this._abort?.abort();
    if (uploading) {
      this._working = false;
      this._phase = undefined;
      this._problem = this._localize(`${MANAGE}.convert_upload_cancelled`);
    } else this.closeDialog();
  };

  private _bounded<T>(
    operation: () => Promise<T>,
    controller: AbortController,
    milliseconds: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const signal = controller.signal;
      const abort = () => {
        clearTimeout(timer);
        reject(signal.reason || new DOMException("Cancelled", "AbortError"));
      };
      const timer = setTimeout(
        () => controller.abort(new DOMException("Timed out", "TimeoutError")),
        milliseconds
      );
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) {
        abort();
        return;
      }
      Promise.resolve()
        .then(() => {
          if (signal.aborted) throw signal.reason;
          return operation();
        })
        .then(resolve, reject)
        .finally(() => {
          clearTimeout(timer);
          signal.removeEventListener("abort", abort);
        });
    });
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
    const controller = new AbortController();
    this._abort = controller;
    try {
      // The converter's own wording (format names, notes, errors) is in the
      // settings translations, which the Media page has not loaded
      await this._bounded(
        () => this._i18n.loadFragmentTranslation("config"),
        controller,
        15_000
      );
    } catch (_err) {
      // The names then fall back to the format identifiers
    }
    if (this._params !== params || !this._open) return;
    const reader = new AbortController();
    this._abort = reader;
    try {
      const bytes = await this._bounded(
        async () => {
          const file = await fetchItemFile(
            {
              ...this._api,
              fetchWithAuth: (path, init) =>
                this._api.fetchWithAuth(path, {
                  ...init,
                  signal: reader.signal,
                }),
            },
            params.item,
            MAX_READ
          );
          return new Uint8Array(await file.blob.arrayBuffer());
        },
        reader,
        60_000
      );
      if (this._params !== params || reader.signal.aborted) {
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
      if (this._params === params && !reader.signal.aborted) {
        this._problem =
          err instanceof ItemFileError && err.code === "too_large"
            ? this._errorText("too_large", params.item.title)
            : this._localize(`${MANAGE}.convert_read_failed`);
      }
      if (
        this._params === params &&
        reader.signal.reason?.name === "TimeoutError"
      ) {
        this._problem = this._localize(`${MANAGE}.convert_timeout`);
      }
    } finally {
      if (this._params === params) this._loading = false;
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
              : this._problem && !this._target
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
          ${this._target && this._problem ? html`<p class="problem" role="alert">${this._problem}</p>` : nothing}
          ${this._phase ? html`<p class="info" role="status" aria-live="polite">${this._localize(`${MANAGE}.convert_phase_${this._phase}`)}</p>` : nothing}
        </div>
        <div class="actions">
          <ha-button
            .disabled=${this._loading || this._working || !this._target}
            .loading=${this._working}
            @click=${this._convert}
          >
            ${this._localize(`${MANAGE}.convert`)}
          </ha-button>
          <ha-button appearance="plain" @click=${this._cancel}>
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
    const controller = new AbortController();
    this._abort = controller;
    this._phase = "converting";
    const current = () =>
      this._params === params &&
      this._abort === controller &&
      !controller.signal.aborted;
    try {
      const result = await this._bounded(
        () =>
          convertItem(
            params.item.title,
            bytes,
            source,
            target,
            controller.signal
          ),
        controller,
        60_000
      );
      if (!current()) return;
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
      this._phase = "uploading";
      await this._bounded(
        () =>
          params.store === "image"
            ? createImage(
                this._api.fetchWithAuth,
                this._localize,
                result.file,
                controller.signal,
                params.destination || undefined
              )
            : uploadLocalMedia(
                this._api.fetchWithAuth,
                this._localize,
                params.destination,
                result.file,
                controller.signal
              ),
        controller,
        60_000
      );
      if (!current()) return;
      const losses = this._notesText(result.notes);
      showToast(this, {
        message: `${this._localize(`${MANAGE}.convert_done`, { name: result.file.name })}${losses ? ` ${losses}` : ""}`,
        duration: 10000,
        dismissable: true,
      });
      params.onStored?.();
      this.closeDialog();
    } catch (error) {
      if (this._params !== params || this._abort !== controller) return;
      if (controller.signal.reason?.name === "TimeoutError") {
        this._problem = this._localize(
          this._phase === "uploading"
            ? `${MANAGE}.convert_upload_cancelled`
            : `${MANAGE}.convert_timeout`
        );
      } else if (!controller.signal.aborted) {
        this._problem =
          this._phase === "uploading"
            ? this._localize(`${MANAGE}.upload_failed`, {
                reason:
                  (error as Error)?.message ||
                  this._localize("ui.common.unknown_error"),
              })
            : this._errorText("image_canvas_failed");
      }
    } finally {
      if (this._abort === controller) {
        this._working = false;
        this._phase = undefined;
      }
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
