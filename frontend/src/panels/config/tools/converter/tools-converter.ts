import {
  mdiAlertCircle,
  mdiChevronDown,
  mdiChevronRight,
  mdiContentCopy,
  mdiDelete,
  mdiDownload,
  mdiFileDocument,
  mdiFileImage,
  mdiFolderOpen,
  mdiFolderZip,
  mdiMusicNote,
  mdiSwapHorizontal,
  mdiTable,
  mdiTextBox,
  mdiVideo,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { visuallyHiddenFileInputStyles } from "../../../../resources/visually-hidden-file-input";
import type { ArchiveEntry } from "../../../../common/converter/archive-types";
import { baseName } from "../../../../common/converter/archive-types";
import { SAMPLE_RATES } from "../../../../common/converter/audio";
import type { Capabilities } from "../../../../common/converter/capabilities";
import {
  categoryStatus,
  detectCapabilities,
  NOT_OFFERED,
  targetAvailable,
} from "../../../../common/converter/capabilities";
import { searchMatcher } from "../../../../common/regex/filter";
import type {
  DataFormat,
  SniffedKind,
} from "../../../../common/converter/detect";
import {
  detectDataFormat,
  IMAGE_KINDS,
  sniffContents,
} from "../../../../common/converter/detect";
import type { TextTransform } from "../../../../common/converter/encodings";
import { transformBytes } from "../../../../common/converter/encodings";
import type {
  CategoryId,
  InputKind,
  TargetId,
} from "../../../../common/converter/formats";
import {
  CATEGORIES,
  categoryOf,
  isArchiveTarget,
  isAudioTarget,
  isDataTarget,
  isDocumentTarget,
  isImageTarget,
  isVideoTarget,
  targetsFor,
} from "../../../../common/converter/formats";
import type { HistoryEntry } from "../../../../common/converter/history";
import { addHistory } from "../../../../common/converter/history";
import type { ImageFormat } from "../../../../common/converter/image-convert";
import { convertImage } from "../../../../common/converter/image-convert";
import type { ResizeSpec } from "../../../../common/converter/image-size";
import {
  fitSize,
  readImageSize,
} from "../../../../common/converter/image-size";
import {
  outputFileName,
  safeFileName,
} from "../../../../common/converter/output-name";
import type { ExtraOptions, NamedFile } from "../../../../common/converter/run";
import {
  allImages,
  DEFAULT_EXTRA_OPTIONS,
  runExtra,
} from "../../../../common/converter/run";
import type { StructuredOptions } from "../../../../common/converter/structured";
import { convertStructured } from "../../../../common/converter/structured";
import type {
  ConvertError,
  ConvertNote,
} from "../../../../common/converter/types";
import {
  MAX_BYTES,
  MAX_SET_BYTES,
  MAX_SET_FILES,
} from "../../../../common/converter/types";
import {
  decodeUtf8Strict,
  encodeUtf8,
} from "../../../../common/converter/utf8";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
import "../../../../components/ha-select";
import type { HaSelectSelectEvent } from "../../../../components/ha-select";
import "../../../../components/ha-slider";
import type { HaSlider } from "../../../../components/ha-slider";
import "../../../../components/ha-svg-icon";
import "../../../../components/input/ha-input-search";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";

/** Longest result shown in full; the whole result is in the saved file. */
const SHOWN_CHARACTERS = 20000;

const CATEGORY_ICON: Record<CategoryId, string> = {
  images: mdiFileImage,
  documents: mdiFileDocument,
  data: mdiTable,
  audio: mdiMusicNote,
  video: mdiVideo,
  archives: mdiFolderZip,
  text: mdiTextBox,
};

const DATA_FORMATS: DataFormat[] = ["json", "yaml", "csv", "tsv", "markdown"];

/** Most files listed in full after opening an archive. */
const SHOWN_FILES = 300;

/** Conversions that run only when Convert is pressed, not as options change. */
const isExtraTarget = (target: TargetId): boolean =>
  isArchiveTarget(target) ||
  isAudioTarget(target) ||
  isVideoTarget(target) ||
  isDocumentTarget(target);

interface Output {
  /** What is shown: the text, or a picture. */
  text?: string;
  /** The picture, as an address that lives while it is shown. */
  imageUrl?: string;
  blob: Blob;
  name: string;
  target: TargetId;
  notes: ConvertNote[];
  inputBytes: number;
  width?: number;
  height?: number;
  isText: boolean;
  truncated: boolean;
  /** Size of the result; for a list of files, all of them added up. */
  outputBytes: number;
  /** The files an archive held, when the result is a list of them. */
  files?: ArchiveEntry[];
  folders?: number;
}

const formatKey = (target: TargetId) => target.replace(/-/g, "_");

/**
 * File converter: pictures, structured text, text encodings, archives (ZIP,
 * TAR, GZIP), PDF and Word documents, sound, and pictures taken from a video.
 * Everything runs in this browser; nothing is uploaded or fetched. What a
 * format can do depends on the browser for sound and video, and the page
 * lists a format only when it works on this device.
 */
@customElement("tools-converter")
class ToolsConverter extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  /** The chosen file, read into memory. */
  @state() private _fileBytes?: Uint8Array;

  @state() private _fileName = "";

  @state() private _sniffed: SniffedKind = "text";

  @state() private _text = "";

  @state() private _target?: TargetId;

  @state() private _readAs: DataFormat | "auto" = "auto";

  @state() private _quality = 85;

  @state() private _resize = "keep";

  @state() private _indent = "2";

  @state() private _header = true;

  @state() private _guessTypes = false;

  @state() private _protectFormulas = true;

  @state() private _urlSafe = false;

  @state() private _hexSpaced = true;

  @state() private _output?: Output;

  @state() private _error?: ConvertError;

  @state() private _busy = false;

  /** A document, archive, sound or video conversion is still running. */
  @state() private _working = false;

  @state() private _status = "";

  @state() private _history: HistoryEntry[] = [];

  @state() private _search = "";

  @state() private _open?: CategoryId;

  @state() private _dragging = false;

  /** Several files chosen together, for packing into an archive or a PDF. */
  @state() private _files: NamedFile[] = [];

  @state() private _docMode: ExtraOptions["docMode"] =
    DEFAULT_EXTRA_OPTIONS.docMode;

  @state() private _paper: ExtraOptions["paper"] = DEFAULT_EXTRA_OPTIONS.paper;

  @state() private _audioRate = DEFAULT_EXTRA_OPTIONS.audioRate;

  @state() private _audioChannels: 1 | 2 = DEFAULT_EXTRA_OPTIONS.audioChannels;

  @state() private _framePosition = DEFAULT_EXTRA_OPTIONS.framePosition;

  /** What this device can do; sound and video differ by browser. */
  private _caps: Capabilities = detectCapabilities();

  @query("#file") private _fileInput?: HTMLInputElement;

  private _run = 0;

  private _abort?: AbortController;

  private _loadRun = 0;

  private _timer?: number;

  private _nextId = 1;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
    this._run++;
    this._stopRunning();
    this._busy = false;
    this._release();
  }

  /** Tells a running sound conversion to stop, and drops its late result. */
  private _stopRunning(): void {
    this._abort?.abort();
    this._abort = undefined;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.tools.tabs.converter.${key}` as any,
      values
    );
  }

  private _number(value: number): string {
    return new Intl.NumberFormat(this.hass.locale?.language, {
      maximumFractionDigits: 1,
    }).format(value);
  }

  private _size(bytes: number): string {
    if (bytes < 1024) {
      return `${this._number(bytes)} B`;
    }
    if (bytes < 1048576) {
      return `${this._number(bytes / 1024)} KB`;
    }
    return `${this._number(bytes / 1048576)} MB`;
  }

  private _formatName(target: TargetId): string {
    return this._l(`format_${formatKey(target)}_name`);
  }

  /** What the input is, as far as the page goes. */
  private get _inputKind(): InputKind | undefined {
    if (this._files.length) {
      return allImages(this._files) ? "image-set" : "set";
    }
    if (this._fileBytes) {
      const kind = this._sniffed;
      if (IMAGE_KINDS.includes(kind)) {
        return "image";
      }
      if (kind === "zip" || kind === "tar" || kind === "gzip") {
        return "archive";
      }
      if (kind === "docx" || kind === "audio" || kind === "video") {
        return kind;
      }
      return kind === "text" ? "text" : "binary";
    }
    return this._text ? "text" : undefined;
  }

  /** The targets of an input that this device can write. */
  private _offered(kind: InputKind): TargetId[] {
    return targetsFor(kind).filter((target) =>
      targetAvailable(target, this._caps)
    );
  }

  private get _inputBytes(): Uint8Array | undefined {
    if (this._fileBytes) {
      return this._fileBytes;
    }
    return this._text ? encodeUtf8(this._text) : undefined;
  }

  private get _inputName(): string {
    if (this._files.length) {
      return this._inputKind === "image-set" ? "images" : "files";
    }
    return this._fileName;
  }

  private get _setBytes(): number {
    return this._files.reduce((sum, file) => sum + file.bytes.length, 0);
  }

  private _iconFor(kind: InputKind | undefined): string {
    switch (kind) {
      case "image":
      case "image-set":
        return mdiFileImage;
      case "audio":
        return mdiMusicNote;
      case "video":
        return mdiVideo;
      case "archive":
      case "set":
        return mdiFolderZip;
      default:
        return mdiFileDocument;
    }
  }

  protected render(): TemplateResult {
    return html`
      <div
        class=${classMap({ content: true, dragging: this._dragging })}
        @dragover=${this._dragOver}
        @dragleave=${this._dragLeave}
        @drop=${this._drop}
      >
        <div class="columns">
          <div class="work">
            ${this._renderSource()} ${this._renderTargets()}
            ${this._renderOptions()} ${this._renderAction()}
            ${this._renderError()} ${this._renderResult()}
            ${this._renderHistory()}
          </div>
          <div class="formats">${this._renderFormats()}</div>
        </div>
      </div>
    `;
  }

  // The file, or the text to be converted.
  private _renderSource(): TemplateResult {
    const bytes = this._fileBytes;
    if (this._files.length) {
      return html`
        <section class="card source">
          <div class="source-icon">
            <ha-svg-icon .path=${this._iconFor(this._inputKind)}></ha-svg-icon>
          </div>
          <div class="source-text">
            <strong class="source-name">
              ${this._l("files_chosen", {
                count: this._files.length,
                size: this._size(this._setBytes),
              })}
            </strong>
            <span class="source-names">
              ${this._files
                .slice(0, 5)
                .map(
                  (file, index) =>
                    html`${index ? ", " : ""}<bdi>${file.name}</bdi>`
                )}${this._files.length > 5 ? "…" : ""}
            </span>
          </div>
          <ha-button appearance="filled" @click=${this._chooseFile}>
            ${this._l("change_file")}
          </ha-button>
          <ha-button appearance="plain" @click=${this._clearFile}>
            ${this._l("remove_file")}
          </ha-button>
          <input
            class="file-input-hidden"
            tabindex="-1"
            aria-hidden="true"
            id="file"
            type="file"
            multiple
            @change=${this._fileChosen}
          />
        </section>
      `;
    }
    if (bytes) {
      const kind = this._sniffed;
      const size = IMAGE_KINDS.includes(kind)
        ? readImageSize(bytes, kind)
        : undefined;
      const details = [
        size
          ? this._l("dimensions", { width: size.width, height: size.height })
          : undefined,
        this._size(bytes.length),
      ]
        .filter(Boolean)
        .join(", ");
      return html`
        <section class="card source">
          <div class="source-icon">
            <ha-svg-icon .path=${this._iconFor(this._inputKind)}></ha-svg-icon>
          </div>
          <div class="source-text">
            <strong class="source-name"><bdi>${this._fileName}</bdi></strong>
            <span
              >${this._l("detected", {
                kind: this._l(`kind_${kind}`),
                details,
              })}</span
            >
          </div>
          <ha-button appearance="filled" @click=${this._chooseFile}>
            ${this._l("change_file")}
          </ha-button>
          <ha-button appearance="plain" @click=${this._clearFile}>
            ${this._l("remove_file")}
          </ha-button>
          <input
            class="file-input-hidden"
            tabindex="-1"
            aria-hidden="true"
            id="file"
            type="file"
            multiple
            @change=${this._fileChosen}
          />
          ${
            kind === "pdf"
              ? html`<p class="note source-note">
                  ${this._l("pdf_input_note")}
                </p>`
              : nothing
          }
        </section>
      `;
    }
    return html`
      <section class="card source-empty">
        <div class="drop-row">
          <ha-svg-icon .path=${mdiFolderOpen}></ha-svg-icon>
          <span>${this._l("drop_hint")}</span>
          <ha-button appearance="filled" @click=${this._chooseFile}>
            ${this._l("choose_file")}
          </ha-button>
          <input
            class="file-input-hidden"
            tabindex="-1"
            aria-hidden="true"
            id="file"
            type="file"
            multiple
            @change=${this._fileChosen}
          />
        </div>
        <label class="field">
          <span>${this._l("paste_label")}</span>
          <textarea
            spellcheck="false"
            .value=${this._text}
            @input=${this._textChanged}
          ></textarea>
        </label>
        <p class="note">
          ${this._l("limit", { limit: this._size(MAX_BYTES) })}
        </p>
      </section>
    `;
  }

  private _renderTargets(): TemplateResult | typeof nothing {
    const kind = this._inputKind;
    if (!kind) {
      return nothing;
    }
    const targets = this._offered(kind);
    return html`
      <section class="block">
        <h2 id="targets-label">${this._l("convert_to")}</h2>
        <div class="chips" role="group" aria-labelledby="targets-label">
          ${targets.map(
            (target) => html`
              <button
                type="button"
                class=${classMap({ chip: true, on: this._target === target })}
                aria-pressed=${this._target === target ? "true" : "false"}
                data-target=${target}
                @click=${this._pickTarget}
              >
                ${this._formatName(target)}
              </button>
            `
          )}
        </div>
      </section>
    `;
  }

  private _switch(
    label: string,
    on: boolean,
    handler: () => void,
    help?: string
  ): TemplateResult {
    return html`
      <div class="switch-row">
        <div class="switch-text">
          <span>${label}</span>
          ${help ? html`<small>${help}</small>` : nothing}
        </div>
        <button
          type="button"
          class=${classMap({ toggle: true, on })}
          role="switch"
          aria-checked=${on ? "true" : "false"}
          aria-label=${label}
          @click=${handler}
        >
          <span class="knob"></span>
        </button>
      </div>
    `;
  }

  private _renderOptions(): TemplateResult | typeof nothing {
    const target = this._target;
    if (!target || !this._inputKind) {
      return nothing;
    }
    if (isImageTarget(target)) {
      const size = this._fileBytes
        ? readImageSize(this._fileBytes, this._sniffed)
        : undefined;
      const keep = size
        ? this._l("size_keep", {
            size: this._l("dimensions", {
              width: size.width,
              height: size.height,
            }),
          })
        : this._l("size_keep_plain");
      const png = target === "png";
      return html`
        <section class="block options">
          <div class="field slider">
            <span class="slider-head" id="quality-label">
              <span>${this._l("quality")}</span>
              <output>${png ? "100" : this._quality}</output>
            </span>
            <ha-slider
              .min=${1}
              .max=${100}
              .step=${1}
              .value=${this._quality}
              .disabled=${png}
              aria-labelledby="quality-label"
              @change=${this._qualityChanged}
            ></ha-slider>
            ${png ? html`<small>${this._l("quality_png")}</small>` : nothing}
          </div>
          <ha-select
            class="field"
            .label=${this._l("size")}
            .value=${this._resize}
            .options=${[
              { value: "keep", label: keep },
              {
                value: "scale:0.75",
                label: this._l("size_percent", { percent: 75 }),
              },
              {
                value: "scale:0.5",
                label: this._l("size_percent", { percent: 50 }),
              },
              {
                value: "scale:0.25",
                label: this._l("size_percent", { percent: 25 }),
              },
              {
                value: "fit:1920",
                label: this._l("size_longest", { pixels: 1920 }),
              },
              {
                value: "fit:1280",
                label: this._l("size_longest", { pixels: 1280 }),
              },
              {
                value: "fit:640",
                label: this._l("size_longest", { pixels: 640 }),
              },
            ]}
            @selected=${this._resizeChanged}
          ></ha-select>
          <p class="note full">${this._l("metadata_removed")}</p>
        </section>
      `;
    }
    if (isDataTarget(target)) {
      return html`
        <section class="block options">
          <ha-select
            class="field"
            .label=${this._l("read_as")}
            .value=${this._readAs}
            .options=${[
              { value: "auto", label: this._l("read_auto") },
              ...DATA_FORMATS.map((format) => ({
                value: format as string,
                label: this._formatName(format),
              })),
            ]}
            @selected=${this._readAsChanged}
          ></ha-select>
          ${
            target === "json"
              ? html`<ha-select
                  class="field"
                  .label=${this._l("indent")}
                  .value=${this._indent}
                  .options=${[
                    {
                      value: "2",
                      label: this._l("indent_spaces", { count: 2 }),
                    },
                    {
                      value: "4",
                      label: this._l("indent_spaces", { count: 4 }),
                    },
                    { value: "tab", label: this._l("indent_tab") },
                    { value: "0", label: this._l("indent_none") },
                  ]}
                  @selected=${this._indentChanged}
                ></ha-select>`
              : nothing
          }
          <div class="switches full">
            ${this._switch(
              this._l("first_row_header"),
              this._header,
              this._toggleHeader,
              this._l("first_row_header_help")
            )}
            ${this._switch(
              this._l("guess_types"),
              this._guessTypes,
              this._toggleGuess,
              this._l("guess_types_help")
            )}
            ${
              target === "csv" || target === "tsv"
                ? this._switch(
                    this._l("protect_formulas"),
                    this._protectFormulas,
                    this._toggleProtect,
                    this._l("protect_formulas_help")
                  )
                : nothing
            }
          </div>
        </section>
      `;
    }
    if (isDocumentTarget(target) || isArchiveTarget(target)) {
      return this._renderDocumentOptions(target);
    }
    if (isAudioTarget(target)) {
      return this._renderAudioOptions(target);
    }
    if (isVideoTarget(target)) {
      return this._renderVideoOptions(target);
    }
    if (target === "base64") {
      return html`<section class="block options">
        <div class="switches full">
          ${this._switch(this._l("url_safe"), this._urlSafe, this._toggleUrlSafe, this._l("url_safe_help"))}
        </div>
      </section>`;
    }
    if (target === "hex") {
      return html`<section class="block options">
        <div class="switches full">
          ${this._switch(this._l("hex_spaced"), this._hexSpaced, this._toggleHexSpaced, this._l("hex_spaced_help"))}
        </div>
      </section>`;
    }
    return nothing;
  }

  private _renderDocumentOptions(
    target: TargetId
  ): TemplateResult | typeof nothing {
    if (target === "pdf" || target === "docx") {
      const fromText = this._inputKind === "text";
      return html`
        <section class="block options">
          ${
            fromText
              ? html`<ha-select
                  class="field"
                  .label=${this._l("document_from")}
                  .value=${this._docMode}
                  .options=${[
                    { value: "auto", label: this._l("document_from_auto") },
                    { value: "plain", label: this._l("document_from_plain") },
                    {
                      value: "markdown",
                      label: this._l("document_from_markdown"),
                    },
                  ]}
                  @selected=${this._docModeChanged}
                ></ha-select>`
              : nothing
          }
          <ha-select
            class="field"
            .label=${this._l("paper")}
            .value=${this._paper}
            .options=${[
              { value: "a4", label: this._l("paper_a4") },
              { value: "letter", label: this._l("paper_letter") },
            ]}
            @selected=${this._paperChanged}
          ></ha-select>
          <p class="note full">
            ${
              target === "docx"
                ? this._l("docx_note")
                : fromText
                  ? this._l("pdf_note_text")
                  : this._l("pdf_note_images")
            }
          </p>
        </section>
      `;
    }
    if (target === "doc-text" || target === "doc-markdown") {
      return html`<section class="block options">
        <p class="note full">${this._l("docx_read_note")}</p>
      </section>`;
    }
    return html`<section class="block options">
      <p class="note full">${this._l("archive_safety")}</p>
    </section>`;
  }

  private _renderAudioOptions(target: TargetId): TemplateResult {
    return html`
      <section class="block options">
        <ha-select
          class="field"
          .label=${this._l("audio_rate")}
          .value=${String(this._audioRate)}
          .options=${SAMPLE_RATES.map((rate) => ({
            value: String(rate),
            label: this._l("audio_rate_option", { rate }),
          }))}
          @selected=${this._audioRateChanged}
        ></ha-select>
        <ha-select
          class="field"
          .label=${this._l("audio_channels")}
          .value=${String(this._audioChannels)}
          .options=${[
            { value: "2", label: this._l("audio_stereo") },
            { value: "1", label: this._l("audio_mono") },
          ]}
          @selected=${this._audioChannelsChanged}
        ></ha-select>
        <p class="note full">
          ${
            target === "wav"
              ? this._l("audio_note_wav")
              : this._l("audio_note_realtime")
          }
        </p>
      </section>
    `;
  }

  private _renderVideoOptions(target: TargetId): TemplateResult {
    if (target === "video-info") {
      return html`<section class="block options">
        <p class="note full">${this._l("video_note")}</p>
      </section>`;
    }
    const png = target === "video-png";
    return html`
      <section class="block options">
        <div class="field slider">
          <span class="slider-head" id="frame-label">
            <span>${this._l("frame_position")}</span>
            <output
              >${this._l("percent_value", { percent: this._framePosition })}</output
            >
          </span>
          <ha-slider
            .min=${0}
            .max=${100}
            .step=${1}
            .value=${this._framePosition}
            aria-labelledby="frame-label"
            @change=${this._framePositionChanged}
          ></ha-slider>
        </div>
        ${
          png
            ? nothing
            : html`<div class="field slider">
                <span class="slider-head" id="video-quality-label">
                  <span>${this._l("quality")}</span>
                  <output>${this._quality}</output>
                </span>
                <ha-slider
                  .min=${1}
                  .max=${100}
                  .step=${1}
                  .value=${this._quality}
                  aria-labelledby="video-quality-label"
                  @change=${this._qualityChanged}
                ></ha-slider>
              </div>`
        }
        <p class="note full">${this._l("video_note")}</p>
      </section>
    `;
  }

  private _renderAction(): TemplateResult | typeof nothing {
    if (!this._target || !this._inputKind) {
      return nothing;
    }
    return html`
      <section class="action">
        <p class="note">${this._l("privacy")}</p>
        ${
          this._busy && isExtraTarget(this._target)
            ? html`<p class="note working" role="status">
                ${this._l("working")}
              </p>`
            : nothing
        }
        <ha-button
          appearance="filled"
          ?disabled=${this._busy || this._working}
          @click=${this._commit}
        >
          <ha-svg-icon slot="start" .path=${mdiSwapHorizontal}></ha-svg-icon>
          ${this._l("convert")}
        </ha-button>
      </section>
    `;
  }

  private _errorText(error: ConvertError): string {
    const values: Record<string, string | number> = {};
    for (const key of [
      "line",
      "column",
      "position",
      "character",
      "row",
      "detail",
    ] as const) {
      const value = error[key];
      if (value !== undefined) {
        values[key] = value;
      }
    }
    const limit =
      error.code === "set_too_large"
        ? this._size(MAX_SET_BYTES)
        : error.code === "too_many_files"
          ? MAX_SET_FILES
          : this._size(MAX_BYTES);
    return this._l(`error_${error.code}`, { limit, ...values });
  }

  private _renderError(): TemplateResult | typeof nothing {
    const error = this._error;
    if (!error) {
      return nothing;
    }
    return html`
      <section class="card error" role="alert">
        <ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>
        <div>
          <span>${this._errorText(error)}</span>
          ${
            error.detail
              ? html`<code class="detail"><bdi>${error.detail}</bdi></code>`
              : nothing
          }
        </div>
      </section>
    `;
  }

  private _renderResult(): TemplateResult | typeof nothing {
    const out = this._output;
    if (!out) {
      return nothing;
    }
    return html`
      <section class="card result">
        <header>
          <h2>${this._l("result")}</h2>
          ${
            out.isText && !out.files
              ? html`<ha-button appearance="plain" @click=${this._copy}>
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiContentCopy}
                  ></ha-svg-icon>
                  ${this._l("copy")}
                </ha-button>`
              : nothing
          }
          ${
            out.files
              ? nothing
              : html`<ha-button appearance="plain" @click=${this._download}>
                  <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                  ${this._l("download")}
                </ha-button>`
          }
        </header>
        <p class="sizes" role="status">
          ${
            out.files
              ? this._l("files_summary", {
                  count: out.files.length,
                  before: this._size(out.inputBytes),
                  after: this._size(out.outputBytes),
                })
              : this._l("sizes", {
                  before: this._size(out.inputBytes),
                  after: this._size(out.outputBytes),
                })
          }
          ${
            out.width
              ? html` ${this._l("dimensions", { width: out.width, height: out.height ?? 0 })}`
              : nothing
          }
        </p>
        ${out.files ? this._renderFiles(out) : nothing}
        ${
          out.files
            ? nothing
            : out.imageUrl
              ? html`<img
                  class="preview"
                  src=${out.imageUrl}
                  alt=${this._l("preview_alt", { name: out.name })}
                />`
              : html`<pre
                  tabindex="0"
                  aria-label=${this._l("result")}
                  .textContent=${out.text ?? ""}
                ></pre>`
        }
        ${
          out.truncated
            ? html`<p class="note">
                ${this._l("shown_part", { shown: SHOWN_CHARACTERS })}
              </p>`
            : nothing
        }
        ${
          out.notes.length
            ? html`<div class="notes">
                <h3>${this._l("kept_title")}</h3>
                <ul>
                  ${out.notes.map(
                    (note) =>
                      html`<li>
                        ${this._l(`note_${note.code}`, { count: note.count ?? 0 })}
                      </li>`
                  )}
                </ul>
              </div>`
            : nothing
        }
        ${
          out.files
            ? nothing
            : html`<p class="note">
                ${this._l("file_name", { name: out.name })}
              </p>`
        }
      </section>
    `;
  }

  private _renderFiles(out: Output): TemplateResult {
    const files = out.files ?? [];
    return html`
      <ul class="files">
        ${files.slice(0, SHOWN_FILES).map(
          (file, index) => html`
            <li>
              <div class="file-text">
                <strong><bdi>${file.path}</bdi></strong>
                <span>${this._size(file.data.length)}</span>
              </div>
              <ha-button
                appearance="plain"
                data-index=${index}
                @click=${this._downloadFile}
              >
                <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                ${this._l("download")}
              </ha-button>
            </li>
          `
        )}
      </ul>
      ${
        files.length > SHOWN_FILES
          ? html`<p class="note">
              ${this._l("files_partial", {
                shown: SHOWN_FILES,
                count: files.length,
              })}
            </p>`
          : nothing
      }
      ${
        out.folders
          ? html`<p class="note">
              ${this._l("folders_count", { count: out.folders })}
            </p>`
          : nothing
      }
    `;
  }

  private _renderHistory(): TemplateResult | typeof nothing {
    if (!this._history.length) {
      return nothing;
    }
    return html`
      <section class="card history">
        <header>
          <h2>${this._l("history")}</h2>
          <ha-button appearance="plain" @click=${this._clearHistory}>
            <ha-svg-icon slot="start" .path=${mdiDelete}></ha-svg-icon>
            ${this._l("clear_history")}
          </ha-button>
        </header>
        <p class="note">${this._l("history_note")}</p>
        <ul>
          ${this._history.map(
            (entry) => html`
              <li>
                <div class="history-text">
                  <strong><bdi>${entry.name}</bdi></strong>
                  <span>
                    ${this._l("history_line", {
                      source: entry.source,
                      target: this._formatName(entry.target as TargetId),
                      before: this._size(entry.inputBytes),
                      after: this._size(entry.outputBytes),
                      time: new Date(entry.at).toLocaleTimeString(
                        this.hass.locale?.language
                      ),
                    })}
                  </span>
                </div>
                <ha-button
                  appearance="plain"
                  data-id=${entry.id}
                  @click=${this._downloadEntry}
                >
                  <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
                  ${this._l("download")}
                </ha-button>
              </li>
            `
          )}
        </ul>
      </section>
    `;
  }

  // The list of what can be written, with a search.
  private _renderFormats(): TemplateResult {
    const matches = searchMatcher(this._search);
    const kind = this._inputKind;
    const offered = kind ? this._offered(kind) : undefined;
    const searching = this._search.trim() !== "";
    const total = CATEGORIES.reduce((sum, c) => sum + c.targets.length, 0);
    const formatRow = (target: TargetId) => {
      const here = targetAvailable(target, this._caps);
      const usable = here && (!offered || offered.includes(target));
      return html`
        <li>
          <button
            type="button"
            class=${classMap({ format: true, on: this._target === target })}
            ?disabled=${!usable}
            data-target=${target}
            @click=${this._pickFormat}
          >
            <span class="format-name">${this._formatName(target)}</span>
            <span class="format-desc">
              ${
                usable
                  ? this._l(`format_${formatKey(target)}_desc`)
                  : here
                    ? this._l("not_for_this_file")
                    : this._l("not_on_this_device")
              }
            </span>
          </button>
        </li>
      `;
    };
    const visible = CATEGORIES.map((category) => {
      const categoryName = this._l(`category_${category.id}`);
      if (!searching) {
        return {
          category,
          categoryName,
          targets: category.targets,
          show: true,
        };
      }
      const targets = category.targets.filter((target) =>
        matches(
          this._formatName(target),
          this._l(`format_${formatKey(target)}_desc`),
          categoryName,
          target
        )
      );
      const itself = category.targets.length === 0 && matches(categoryName);
      return {
        category,
        categoryName,
        targets,
        show: targets.length > 0 || itself,
      };
    }).filter((item) => item.show);
    return html`
      <ha-input-search
        appearance="outlined"
        .placeholder=${this._l("search_formats", { count: total })}
        .accessibleLabel=${this._l("search_formats", { count: total })}
        .value=${this._search}
        @input=${this._searchChanged}
      ></ha-input-search>
      ${
        visible.length
          ? html`<ul class="categories">
              ${visible.map(({ category, categoryName, targets }) => {
                const status = categoryStatus(category.id, this._caps);
                const available = status.state !== "unavailable";
                const open = searching || this._open === category.id;
                const ready = category.targets.filter((target) =>
                  targetAvailable(target, this._caps)
                ).length;
                const notOffered = (NOT_OFFERED[category.id] ?? []).filter(
                  (key) => !searching || matches(this._l(`not_offered_${key}`))
                );
                return html`
                  <li class="category">
                    <button
                      type="button"
                      class="category-head"
                      ?disabled=${!available}
                      aria-expanded=${available ? (open ? "true" : "false") : nothing}
                      data-category=${category.id}
                      @click=${this._toggleCategory}
                    >
                      <span class="category-icon">
                        <ha-svg-icon
                          .path=${CATEGORY_ICON[category.id]}
                        ></ha-svg-icon>
                      </span>
                      <span class="category-text">
                        <strong>${categoryName}</strong>
                        <span>
                          ${
                            status.reason
                              ? this._l(`status_reason_${status.reason}`)
                              : this._l("category_ready", { count: ready })
                          }
                        </span>
                      </span>
                      <span
                        class=${classMap({ pill: true, [status.state]: true })}
                        >${this._l(`status_${status.state}`)}</span
                      >
                      ${
                        available
                          ? html`<ha-svg-icon
                              .path=${open ? mdiChevronDown : mdiChevronRight}
                            ></ha-svg-icon>`
                          : nothing
                      }
                    </button>
                    ${
                      available && open
                        ? html`<ul class="format-list">
                              ${targets.map(formatRow)}
                            </ul>
                            ${
                              notOffered.length
                                ? html`<div class="not-offered">
                                    <h3>${this._l("not_offered_title")}</h3>
                                    <ul>
                                      ${notOffered.map(
                                        (key) =>
                                          html`<li>
                                            ${this._l(`not_offered_${key}`)}
                                          </li>`
                                      )}
                                    </ul>
                                  </div>`
                                : nothing
                            }`
                        : nothing
                    }
                  </li>
                `;
              })}
            </ul>`
          : html`<p class="note">${this._l("no_formats")}</p>`
      }
      ${
        this._status
          ? html`<p class="note" role="status">${this._status}</p>`
          : nothing
      }
    `;
  }

  // Choosing the input.

  private _chooseFile(): void {
    this._fileInput?.click();
  }

  private _fileChosen(ev: Event): void {
    const input = ev.currentTarget as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    input.value = "";
    if (files.length) {
      this._status = "";
      this._loadFiles(files);
    }
  }

  private _clearFile(): void {
    this._loadRun++;
    this._files = [];
    this._fileBytes = undefined;
    this._fileName = "";
    this._error = undefined;
    this._afterInputChanged();
  }

  private _textChanged(ev: Event): void {
    const text = (ev.currentTarget as HTMLTextAreaElement).value;
    this._text = text;
    this._error = undefined;
    // The limit is in bytes: the text is measured as UTF-8, which is up to
    // three times its length in characters.
    if (
      text.length > MAX_BYTES ||
      (text.length * 3 > MAX_BYTES &&
        new TextEncoder().encode(text).length > MAX_BYTES)
    ) {
      this._error = { code: "too_large" };
      this._clearOutput();
      return;
    }
    this._afterInputChanged();
  }

  private _dragOver(ev: DragEvent): void {
    if (ev.dataTransfer?.types.includes("Files")) {
      // Taking the event here keeps the app-wide file import from showing.
      ev.preventDefault();
      this._dragging = true;
    }
  }

  private _dragLeave(ev: DragEvent): void {
    if (
      !ev.relatedTarget ||
      !this.shadowRoot?.contains(ev.relatedTarget as Node)
    ) {
      this._dragging = false;
    }
  }

  private _drop(ev: DragEvent): void {
    this._dragging = false;
    const files = Array.from(ev.dataTransfer?.files ?? []);
    if (!files.length) {
      return;
    }
    // This tool took the file: the app-wide drop import must not see it.
    ev.preventDefault();
    ev.stopPropagation();
    this._status = "";
    this._loadFiles(files);
  }

  private async _loadFiles(files: File[]): Promise<void> {
    if (files.length === 1) {
      await this._loadFile(files[0]);
      return;
    }
    // Several files: they can be packed together, or become a PDF.
    const load = ++this._loadRun;
    this._error = undefined;
    if (files.length > MAX_SET_FILES) {
      this._error = { code: "too_many_files" };
      return;
    }
    let total = 0;
    for (const file of files) {
      total += file.size;
      if (file.size > MAX_BYTES) {
        this._error = { code: "too_large", detail: file.name };
        return;
      }
    }
    if (total > MAX_SET_BYTES) {
      this._error = { code: "set_too_large" };
      return;
    }
    const read: NamedFile[] = [];
    for (const file of files) {
      try {
        // One file at a time keeps the memory in use low.
        // eslint-disable-next-line no-await-in-loop
        const bytes = new Uint8Array(await file.arrayBuffer());
        read.push({ name: file.name, bytes, sniffed: sniffContents(bytes) });
      } catch (_err) {
        if (load === this._loadRun) {
          this._error = { code: "read_failed", detail: file.name };
        }
        return;
      }
      if (load !== this._loadRun) {
        return;
      }
    }
    this._files = read;
    this._fileBytes = undefined;
    this._fileName = "";
    this._afterInputChanged();
  }

  private async _loadFile(file: File): Promise<void> {
    // Two quick drops: only the latest read may set the file.
    const load = ++this._loadRun;
    this._error = undefined;
    if (file.size > MAX_BYTES) {
      this._error = { code: "too_large", detail: file.name };
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (_err) {
      if (load === this._loadRun) {
        this._error = { code: "read_failed", detail: file.name };
      }
      return;
    }
    if (load !== this._loadRun) {
      return;
    }
    const kind = sniffContents(bytes);
    if (kind === "svg") {
      this._error = { code: "svg_refused", detail: file.name };
      return;
    }
    if (kind === "heic") {
      this._error = { code: "heic_unsupported", detail: file.name };
      return;
    }
    this._files = [];
    this._fileBytes = bytes;
    this._fileName = file.name;
    this._sniffed = kind;
    if (kind === "text" && !decodeUtf8Strict(bytes).ok) {
      this._sniffed = "binary";
    }
    this._afterInputChanged();
  }

  /** Picks a sensible target for a new input and converts it. */
  private _afterInputChanged(): void {
    const kind = this._inputKind;
    if (!kind) {
      this._target = undefined;
      this._clearOutput();
      return;
    }
    const offered = this._offered(kind);
    if (!this._target || !offered.includes(this._target)) {
      const wanted = this._defaultTarget(kind);
      this._target = offered.includes(wanted) ? wanted : offered[0];
    }
    this._schedule();
  }

  private _defaultTarget(kind: InputKind): TargetId {
    switch (kind) {
      case "archive":
        return "extract";
      case "docx":
        return "doc-markdown";
      case "audio":
        return "wav";
      case "video":
        return "video-png";
      case "set":
        return "zip";
      case "image-set":
        return "pdf";
      default:
    }
    if (kind === "image") {
      return this._sniffed === "jpeg" ? "webp" : "jpeg";
    }
    if (kind === "binary") {
      return "base64";
    }
    const bytes = this._inputBytes;
    const decoded = bytes ? decodeUtf8Strict(bytes) : undefined;
    const format = decoded?.ok
      ? detectDataFormat(this._fileName, decoded.text)
      : undefined;
    if (!format) {
      return "base64";
    }
    return format === "json" ? "yaml" : "json";
  }

  private _pickTarget(ev: Event): void {
    this._setTarget(
      (ev.currentTarget as HTMLElement).dataset.target as TargetId
    );
  }

  private _pickFormat(ev: Event): void {
    this._setTarget(
      (ev.currentTarget as HTMLElement).dataset.target as TargetId
    );
  }

  private _setTarget(target: TargetId): void {
    this._target = target;
    this._open = categoryOf(target);
    this._schedule();
  }

  private _toggleCategory(ev: Event): void {
    const id = (ev.currentTarget as HTMLElement).dataset.category as CategoryId;
    this._open = this._open === id ? undefined : id;
  }

  private _searchChanged(ev: Event): void {
    this._search = (ev.currentTarget as HTMLInputElement).value ?? "";
  }

  // Options.

  private _qualityChanged(ev: Event): void {
    this._quality = Number((ev.currentTarget as HaSlider).value);
    this._schedule();
  }

  private _resizeChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._resize = String(ev.detail.value);
    this._schedule();
  }

  private _readAsChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._readAs = String(ev.detail.value) as DataFormat | "auto";
    this._schedule();
  }

  private _indentChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._indent = String(ev.detail.value);
    this._schedule();
  }

  private _docModeChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._docMode = String(ev.detail.value) as ExtraOptions["docMode"];
    this._schedule();
  }

  private _paperChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._paper = String(ev.detail.value) as ExtraOptions["paper"];
    this._schedule();
  }

  private _audioRateChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._audioRate = Number(ev.detail.value);
    this._schedule();
  }

  private _audioChannelsChanged(ev: HaSelectSelectEvent<string>): void {
    ev.stopPropagation();
    this._audioChannels = String(ev.detail.value) === "1" ? 1 : 2;
    this._schedule();
  }

  private _framePositionChanged(ev: Event): void {
    this._framePosition = Number((ev.currentTarget as HaSlider).value);
    this._schedule();
  }

  private _toggleHeader(): void {
    this._header = !this._header;
    this._schedule();
  }

  private _toggleGuess(): void {
    this._guessTypes = !this._guessTypes;
    this._schedule();
  }

  private _toggleProtect(): void {
    this._protectFormulas = !this._protectFormulas;
    this._schedule();
  }

  private _toggleUrlSafe(): void {
    this._urlSafe = !this._urlSafe;
    this._schedule();
  }

  private _toggleHexSpaced(): void {
    this._hexSpaced = !this._hexSpaced;
    this._schedule();
  }

  // Converting.

  private _schedule(): void {
    window.clearTimeout(this._timer);
    this._timer = window.setTimeout(() => this._convert(false), 250);
  }

  private _commit(): void {
    window.clearTimeout(this._timer);
    // A heavy conversion that is still running blocks a second one, even when
    // an option was changed meanwhile.
    if (this._busy || this._working) {
      return;
    }
    this._convert(true);
  }

  private _release(): void {
    if (this._output?.imageUrl) {
      URL.revokeObjectURL(this._output.imageUrl);
    }
  }

  private _clearOutput(): void {
    // With no input there is nothing to wait for: drop a waiting or running
    // conversion so its late result cannot come back, and free the button.
    window.clearTimeout(this._timer);
    this._run++;
    this._stopRunning();
    this._busy = false;
    this._release();
    this._output = undefined;
  }

  private get _resizeSpec(): ResizeSpec {
    const [mode, value] = this._resize.split(":");
    if (mode === "scale") {
      return { mode: "scale", factor: Number(value) };
    }
    if (mode === "fit") {
      return { mode: "fit", longest: Number(value) };
    }
    return { mode: "keep" };
  }

  private async _convert(commit: boolean): Promise<void> {
    const run = ++this._run;
    // A new run stops what an earlier one still has going.
    this._stopRunning();
    try {
      await this._convertNow(run, commit);
    } catch (_err) {
      // Whatever went wrong, the page must not stay busy.
      if (run === this._run) {
        this._error = { code: "write_failed" };
        this._output = undefined;
      }
    } finally {
      if (run === this._run && !this._working) {
        this._busy = false;
      }
    }
  }

  private async _convertNow(run: number, commit: boolean): Promise<void> {
    const bytes = this._inputBytes;
    const target = this._target;
    const kind = this._inputKind;
    if (!target || !kind || (!bytes && !this._files.length)) {
      this._clearOutput();
      return;
    }
    if (isExtraTarget(target)) {
      if (!commit) {
        // Sound, video, archives and documents take real work: they run when
        // Convert is pressed, and a result for other options is dropped.
        this._clearOutput();
        return;
      }
      await this._convertExtra(run, target, kind, bytes);
      return;
    }
    if (!bytes) {
      this._clearOutput();
      return;
    }
    if (bytes.length > MAX_BYTES) {
      this._error = { code: "too_large" };
      this._clearOutput();
      return;
    }
    this._busy = true;
    const name = this._inputName;
    let blob: Blob | undefined;
    let text: string | undefined;
    let notes: ConvertNote[] = [];
    let width: number | undefined;
    let height: number | undefined;
    let error: ConvertError | undefined;
    let isText = true;

    if (isImageTarget(target)) {
      const result = await convertImage(bytes, this._sniffed, {
        format: target as ImageFormat,
        quality: this._quality,
        resize: this._resizeSpec,
      });
      if (result.ok) {
        blob = result.blob;
        width = result.width;
        height = result.height;
        isText = false;
        if (result.flattened) {
          notes.push({ code: "flattened" });
        }
        notes.push({ code: "metadata_removed" });
        const header = readImageSize(bytes, this._sniffed);
        if (
          header &&
          fitSize(header.width, header.height, this._resizeSpec).width !==
            header.width
        ) {
          notes.push({ code: "resized" });
        }
      } else {
        error = result.error;
      }
    } else {
      const decoded = decodeUtf8Strict(bytes);
      let result;
      if (isDataTarget(target)) {
        if (!decoded.ok) {
          result = {
            ok: false as const,
            error: { code: "invalid_utf8", position: decoded.offset },
          };
        } else {
          const from =
            this._readAs === "auto"
              ? detectDataFormat(name, decoded.text)
              : this._readAs;
          if (!from) {
            result = { ok: false as const, error: { code: "format_unknown" } };
          } else {
            const options: StructuredOptions = {
              indent:
                this._indent === "tab"
                  ? "tab"
                  : (Number(this._indent) as 0 | 2 | 4),
              header: this._header,
              guessTypes: this._guessTypes,
              protectFormulas: this._protectFormulas,
            };
            result = convertStructured(decoded.text, from, target, options);
          }
        }
      } else {
        result = transformBytes(target as TextTransform, bytes, {
          urlSafe: this._urlSafe,
          hexSpaced: this._hexSpaced,
        });
      }
      if (result.ok) {
        notes = result.notes;
        if (result.kind === "text") {
          const written = result.text;
          text = written;
          blob = new Blob([written], { type: "text/plain;charset=utf-8" });
        } else {
          blob = new Blob([result.bytes as BlobPart], { type: result.mime });
          isText = false;
        }
      } else {
        error = result.error;
      }
    }
    if (run !== this._run) {
      return;
    }
    this._busy = false;
    this._release();
    if (error || !blob) {
      this._error = error ?? { code: "image_canvas_failed" };
      this._output = undefined;
      return;
    }
    this._error = undefined;
    const outName = outputFileName(name || "text", target, isText);
    const imageUrl = isImageTarget(target)
      ? URL.createObjectURL(blob)
      : undefined;
    const shown =
      text !== undefined ? text.slice(0, SHOWN_CHARACTERS) : undefined;
    this._output = {
      text: shown,
      imageUrl,
      blob,
      name: outName,
      target,
      notes,
      inputBytes: bytes.length,
      outputBytes: blob.size,
      width,
      height,
      isText: text !== undefined,
      truncated: text !== undefined && text.length > SHOWN_CHARACTERS,
    };
    if (!isText && !imageUrl) {
      this._output = {
        ...this._output,
        text: this._l("binary_result", { size: this._size(blob.size) }),
      };
    }
    if (commit) {
      this._history = addHistory(this._history, {
        id: this._nextId++,
        name: outName,
        source: name || this._l("pasted_text"),
        target,
        inputBytes: bytes.length,
        outputBytes: blob.size,
        at: Date.now(),
        blob,
      });
      this._status = this._l("saved_to_history", { name: outName });
    }
  }

  /** Archives, documents, sound and video: run when Convert is pressed. */
  private async _convertExtra(
    run: number,
    target: TargetId,
    kind: InputKind,
    bytes: Uint8Array | undefined
  ): Promise<void> {
    if (this._working) {
      return;
    }
    const controller = new AbortController();
    this._abort = controller;
    this._working = true;
    try {
      await this._convertExtraBody(run, target, kind, bytes, controller.signal);
    } finally {
      this._working = false;
      if (this._abort === controller) {
        this._abort = undefined;
      }
      if (run === this._run) {
        this._busy = false;
      }
    }
  }

  private async _convertExtraBody(
    run: number,
    target: TargetId,
    kind: InputKind,
    bytes: Uint8Array | undefined,
    signal: AbortSignal
  ): Promise<void> {
    this._busy = true;
    this._error = undefined;
    this._status = "";
    const result = await runExtra(
      target,
      {
        kind,
        name: this._inputName,
        bytes,
        sniffed: this._sniffed,
        files: this._files.length ? this._files : undefined,
      },
      {
        docMode: this._docMode,
        paper: this._paper,
        audioRate: this._audioRate,
        audioChannels: this._audioChannels,
        framePosition: this._framePosition,
        quality: this._quality,
      },
      signal
    );
    if (run !== this._run) {
      return;
    }
    this._busy = false;
    this._release();
    if (!result.ok) {
      this._error = result.error;
      this._output = undefined;
      return;
    }
    const inputBytes = this._files.length
      ? this._setBytes
      : (bytes?.length ?? 0);
    const sourceName = this._inputName || this._l("pasted_text");
    const stem = this._inputName || "text";
    if (result.kind === "files") {
      this._output = {
        blob: new Blob([]),
        name: "",
        target,
        notes: result.notes,
        inputBytes,
        outputBytes: result.entries.reduce(
          (sum, entry) => sum + entry.data.length,
          0
        ),
        isText: false,
        truncated: false,
        files: result.entries,
        folders: result.folders,
      };
      return;
    }
    let blob: Blob;
    let text: string | undefined;
    let width: number | undefined;
    let height: number | undefined;
    if (result.kind === "bytes") {
      blob = new Blob([result.bytes as BlobPart], { type: result.mime });
      width = result.width;
      height = result.height;
    } else if (result.kind === "text") {
      text = result.text;
      blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    } else {
      text = this._l("video_info_text", {
        duration: this._number(result.duration),
        width: result.width,
        height: result.height,
        size: this._size(inputBytes),
      });
      blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    }
    const imageUrl = blob.type.startsWith("image/")
      ? URL.createObjectURL(blob)
      : undefined;
    const name = outputFileName(stem, target, text !== undefined);
    this._output = {
      text:
        text !== undefined
          ? text.slice(0, SHOWN_CHARACTERS)
          : imageUrl
            ? undefined
            : this._l("binary_result", { size: this._size(blob.size) }),
      imageUrl,
      blob,
      name,
      target,
      notes: result.notes,
      inputBytes,
      outputBytes: blob.size,
      width,
      height,
      isText: text !== undefined,
      truncated: text !== undefined && text.length > SHOWN_CHARACTERS,
    };
    this._history = addHistory(this._history, {
      id: this._nextId++,
      name,
      source: sourceName,
      target,
      inputBytes,
      outputBytes: blob.size,
      at: Date.now(),
      blob,
    });
    this._status = this._l("saved_to_history", { name });
  }

  private _downloadFile(ev: Event): void {
    const index = Number((ev.currentTarget as HTMLElement).dataset.index);
    const entry = this._output?.files?.[index];
    if (entry) {
      fileDownload(
        URL.createObjectURL(new Blob([entry.data as BlobPart])),
        safeFileName(baseName(entry.path))
      );
    }
  }

  // Using the result.

  private async _copy(): Promise<void> {
    const out = this._output;
    if (!out?.isText) {
      return;
    }
    await copyToClipboard(await out.blob.text());
    this._status = this._l("copied");
  }

  private _download(): void {
    const out = this._output;
    if (out) {
      fileDownload(URL.createObjectURL(out.blob), out.name);
      this._status = this._l("saved", { name: out.name });
    }
  }

  private _downloadEntry(ev: Event): void {
    const id = Number((ev.currentTarget as HTMLElement).dataset.id);
    const entry = this._history.find((item) => item.id === id);
    if (entry) {
      fileDownload(URL.createObjectURL(entry.blob), entry.name);
    }
  }

  private _clearHistory(): void {
    this._history = [];
    this._status = this._l("history_cleared");
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      visuallyHiddenFileInputStyles,
      css`
        :host {
          display: block;
        }
        .content {
          box-sizing: border-box;
          max-width: 1280px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-8);
          min-height: 60vh;
        }
        :host([narrow]) .content {
          padding: var(--ha-space-3) var(--ha-space-4) var(--ha-space-8);
        }
        .content.dragging {
          outline: 3px dashed var(--primary-color);
          outline-offset: -6px;
        }
        .columns {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 340px), 1fr)
          );
          gap: var(--ha-space-6);
          align-items: start;
        }
        .work,
        .formats {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }
        ha-button {
          --ha-button-height: 44px;
        }
        .card {
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
          min-width: 0;
        }
        .source {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          background: color-mix(
            in srgb,
            var(--primary-color) 16%,
            var(--primary-background-color)
          );
        }
        .source-icon {
          display: grid;
          place-items: center;
          width: 56px;
          height: 56px;
          border-radius: var(--ha-border-radius-2xl);
          background: var(--primary-background-color);
          color: var(--primary-color);
          flex: none;
        }
        .source-text {
          flex: 1 1 160px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          font-size: var(--ha-font-size-s);
        }
        .source-name {
          font-size: var(--ha-font-size-l);
          overflow-wrap: anywhere;
        }
        .source-empty {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .drop-row {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .drop-row span {
          flex: 1 1 160px;
        }
        .block {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        h2 {
          margin: 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        h3 {
          margin: 0;
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
        }
        .chip {
          min-height: 44px;
          min-width: 44px;
          padding: 0 var(--ha-space-4);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: none;
          font-weight: var(--ha-font-weight-medium);
        }
        .chip.on {
          border-color: transparent;
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--primary-background-color)
          );
        }
        button:focus-visible,
        textarea:focus-visible,
        pre:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .options {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 200px), 1fr)
          );
          gap: var(--ha-space-3);
        }
        .full {
          grid-column: 1 / -1;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .field small {
          font-size: var(--ha-font-size-s);
        }
        .slider-head {
          display: flex;
          justify-content: space-between;
        }
        .slider ha-slider {
          width: 100%;
          min-width: 0;
          min-height: 44px;
        }
        ha-select.field {
          min-width: 0;
        }
        textarea {
          box-sizing: border-box;
          width: 100%;
          min-height: 160px;
          padding: var(--ha-space-3);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-m);
          resize: vertical;
        }
        .switches {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .switch-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          min-height: 44px;
        }
        .switch-text {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        .switch-text small {
          color: var(--secondary-text-color);
        }
        .toggle {
          position: relative;
          flex: none;
          width: 56px;
          min-height: 44px;
          padding: 0;
          border: none;
          background: none;
        }
        .toggle::before {
          content: "";
          position: absolute;
          inset: 8px 0;
          border-radius: var(--ha-border-radius-pill);
          background: var(--disabled-color);
        }
        .toggle.on::before {
          background: var(--primary-color);
        }
        .knob {
          position: absolute;
          top: 12px;
          left: 4px;
          width: 20px;
          height: 20px;
          border-radius: 50%;
          background: var(--card-background-color);
          transition: transform 150ms ease;
        }
        .toggle.on .knob {
          transform: translateX(28px);
        }
        @media (prefers-reduced-motion: reduce) {
          .knob {
            transition: none;
          }
        }
        .action {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }
        .action .note {
          flex: 1 1 200px;
        }
        .note {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .error {
          display: flex;
          gap: var(--ha-space-3);
          background: color-mix(
            in srgb,
            var(--error-color) 18%,
            var(--primary-background-color)
          );
        }
        .error ha-svg-icon {
          color: var(--error-color);
          flex: none;
        }
        .detail {
          display: block;
          margin-top: var(--ha-space-1);
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .result,
        .history {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .result header,
        .history header {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-1);
        }
        .result header h2,
        .history header h2 {
          flex: 1 1 auto;
        }
        .sizes {
          margin: 0;
          font-weight: var(--ha-font-weight-medium);
        }
        pre {
          box-sizing: border-box;
          width: 100%;
          max-height: 420px;
          margin: 0;
          padding: var(--ha-space-3);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-m);
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .preview {
          max-width: 100%;
          max-height: 420px;
          object-fit: contain;
          align-self: flex-start;
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
        }
        .notes ul {
          margin: var(--ha-space-1) 0 0;
          padding-inline-start: var(--ha-space-5);
          font-size: var(--ha-font-size-s);
        }
        .history ul {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .history li {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .history-text {
          flex: 1 1 200px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .categories,
        .format-list {
          list-style: none;
          margin: 0;
          padding: 0;
        }
        .categories {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .category-head {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          width: 100%;
          min-height: 56px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-xl);
          background: none;
          text-align: start;
        }
        .category-head[disabled] {
          cursor: default;
          opacity: 0.7;
        }
        .category-icon {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          border-radius: var(--ha-border-radius-lg);
          background: var(--card-background-color);
          flex: none;
        }
        .category-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .category-text strong {
          font-size: var(--ha-font-size-m);
          color: var(--primary-text-color);
        }
        ha-input-search {
          /* A touch target: 44 px high. */
          --ha-input-search-height: 44px;
        }
        :host([narrow]) .category-head {
          flex-wrap: wrap;
        }
        /* On a narrow screen the long status sentence gets its own line under
           the title instead of a tall, narrow column beside the badge. */
        :host([narrow]) .category-text {
          display: contents;
        }
        :host([narrow]) .category-text strong {
          flex: 1;
          min-width: 0;
        }
        :host([narrow]) .category-text span {
          order: 5;
          flex: 1 1 100%;
        }
        .pill {
          flex: none;
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          font-size: var(--ha-font-size-s);
        }
        .pill.ready {
          background: color-mix(
            in srgb,
            var(--success-color, var(--primary-color)) 22%,
            var(--card-background-color)
          );
        }
        .pill.limited {
          background: color-mix(
            in srgb,
            var(--warning-color, var(--primary-color)) 26%,
            var(--card-background-color)
          );
        }
        .pill.unavailable {
          background: color-mix(
            in srgb,
            var(--error-color) 18%,
            var(--card-background-color)
          );
        }
        .source-names {
          overflow-wrap: anywhere;
        }
        .source-note {
          flex: 1 1 100%;
        }
        .files {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .files li {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .file-text {
          flex: 1 1 200px;
          display: flex;
          flex-direction: column;
          min-width: 0;
          font-size: var(--ha-font-size-s);
          overflow-wrap: anywhere;
        }
        .not-offered {
          margin-block: var(--ha-space-2);
          margin-inline: var(--ha-space-8) 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .not-offered ul {
          margin: var(--ha-space-1) 0 0;
          padding-inline-start: var(--ha-space-5);
        }
        .format-list {
          display: flex;
          flex-direction: column;
          padding-inline-start: var(--ha-space-8);
        }
        .format {
          display: flex;
          flex-direction: column;
          width: 100%;
          min-height: 44px;
          padding: var(--ha-space-2) var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-lg);
          background: none;
          text-align: start;
        }
        .format.on {
          background: color-mix(
            in srgb,
            var(--primary-color) 22%,
            var(--primary-background-color)
          );
        }
        .format[disabled] {
          cursor: default;
          opacity: 0.55;
        }
        .format-desc {
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-converter": ToolsConverter;
  }
}
