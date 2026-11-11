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
  isDataTarget,
  isImageTarget,
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
import { outputFileName } from "../../../../common/converter/output-name";
import type { StructuredOptions } from "../../../../common/converter/structured";
import { convertStructured } from "../../../../common/converter/structured";
import type {
  ConvertError,
  ConvertNote,
} from "../../../../common/converter/types";
import { MAX_BYTES } from "../../../../common/converter/types";
import {
  decodeUtf8Strict,
  encodeUtf8,
} from "../../../../common/converter/utf8";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-button";
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
}

const formatKey = (target: TargetId) => target.replace(/-/g, "_");

/**
 * File converter: pictures between PNG, JPEG and WebP, structured text
 * between JSON, YAML, CSV, TSV and Markdown tables, and text encodings.
 * Everything runs in this browser; nothing is uploaded or fetched.
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

  @state() private _status = "";

  @state() private _history: HistoryEntry[] = [];

  @state() private _search = "";

  @state() private _open?: CategoryId;

  @state() private _dragging = false;

  @query("#file") private _fileInput?: HTMLInputElement;

  private _run = 0;

  private _timer?: number;

  private _nextId = 1;

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.clearTimeout(this._timer);
    this._run++;
    this._release();
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
    if (this._fileBytes) {
      if (IMAGE_KINDS.includes(this._sniffed)) {
        return "image";
      }
      return this._sniffed === "text" ? "text" : "binary";
    }
    return this._text ? "text" : undefined;
  }

  private get _inputBytes(): Uint8Array | undefined {
    if (this._fileBytes) {
      return this._fileBytes;
    }
    return this._text ? encodeUtf8(this._text) : undefined;
  }

  private get _inputName(): string {
    return this._fileName;
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
            <ha-svg-icon
              .path=${IMAGE_KINDS.includes(kind) ? mdiFileImage : mdiFileDocument}
            ></ha-svg-icon>
          </div>
          <div class="source-text">
            <strong class="source-name">${this._fileName}</strong>
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
          <input id="file" type="file" hidden @change=${this._fileChosen} />
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
          <input id="file" type="file" hidden @change=${this._fileChosen} />
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
    const targets = targetsFor(kind);
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
          <label class="field slider">
            <span class="slider-head">
              <span>${this._l("quality")}</span>
              <output>${png ? "100" : this._quality}</output>
            </span>
            <input
              type="range"
              min="1"
              max="100"
              .value=${String(this._quality)}
              ?disabled=${png}
              @input=${this._qualityChanged}
            />
            ${png ? html`<small>${this._l("quality_png")}</small>` : nothing}
          </label>
          <label class="field">
            <span>${this._l("size")}</span>
            <select .value=${this._resize} @change=${this._resizeChanged}>
              <option value="keep">${keep}</option>
              <option value="scale:0.75">
                ${this._l("size_percent", { percent: 75 })}
              </option>
              <option value="scale:0.5">
                ${this._l("size_percent", { percent: 50 })}
              </option>
              <option value="scale:0.25">
                ${this._l("size_percent", { percent: 25 })}
              </option>
              <option value="fit:1920">
                ${this._l("size_longest", { pixels: 1920 })}
              </option>
              <option value="fit:1280">
                ${this._l("size_longest", { pixels: 1280 })}
              </option>
              <option value="fit:640">
                ${this._l("size_longest", { pixels: 640 })}
              </option>
            </select>
          </label>
          <p class="note full">${this._l("metadata_removed")}</p>
        </section>
      `;
    }
    if (isDataTarget(target)) {
      return html`
        <section class="block options">
          <label class="field">
            <span>${this._l("read_as")}</span>
            <select .value=${this._readAs} @change=${this._readAsChanged}>
              <option value="auto">${this._l("read_auto")}</option>
              ${DATA_FORMATS.map(
                (format) =>
                  html`<option value=${format}>
                    ${this._formatName(format)}
                  </option>`
              )}
            </select>
          </label>
          ${
            target === "json"
              ? html`<label class="field">
                  <span>${this._l("indent")}</span>
                  <select .value=${this._indent} @change=${this._indentChanged}>
                    <option value="2">
                      ${this._l("indent_spaces", { count: 2 })}
                    </option>
                    <option value="4">
                      ${this._l("indent_spaces", { count: 4 })}
                    </option>
                    <option value="tab">${this._l("indent_tab")}</option>
                    <option value="0">${this._l("indent_none")}</option>
                  </select>
                </label>`
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

  private _renderAction(): TemplateResult | typeof nothing {
    if (!this._target || !this._inputKind) {
      return nothing;
    }
    return html`
      <section class="action">
        <p class="note">${this._l("privacy")}</p>
        <ha-button
          appearance="filled"
          ?disabled=${this._busy}
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
    return this._l(`error_${error.code}`, {
      limit: this._size(MAX_BYTES),
      ...values,
    });
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
              ? html`<code class="detail">${error.detail}</code>`
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
            out.isText
              ? html`<ha-button appearance="plain" @click=${this._copy}>
                  <ha-svg-icon
                    slot="start"
                    .path=${mdiContentCopy}
                  ></ha-svg-icon>
                  ${this._l("copy")}
                </ha-button>`
              : nothing
          }
          <ha-button appearance="plain" @click=${this._download}>
            <ha-svg-icon slot="start" .path=${mdiDownload}></ha-svg-icon>
            ${this._l("download")}
          </ha-button>
        </header>
        <p class="sizes" role="status">
          ${this._l("sizes", {
            before: this._size(out.inputBytes),
            after: this._size(out.blob.size),
          })}
          ${
            out.width
              ? html` ${this._l("dimensions", { width: out.width, height: out.height ?? 0 })}`
              : nothing
          }
        </p>
        ${
          out.imageUrl
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
        <p class="note">${this._l("file_name", { name: out.name })}</p>
      </section>
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
                  <strong>${entry.name}</strong>
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
    const offered = kind ? targetsFor(kind) : undefined;
    const searching = this._search.trim() !== "";
    const total = CATEGORIES.reduce((sum, c) => sum + c.targets.length, 0);
    const formatRow = (target: TargetId) => {
      const usable = !offered || offered.includes(target);
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
                  : this._l("not_for_this_file")
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
        .label=${this._l("search_formats", { count: total })}
        .value=${this._search}
        @input=${this._searchChanged}
      ></ha-input-search>
      ${
        visible.length
          ? html`<ul class="categories">
              ${visible.map(({ category, categoryName, targets }) => {
                const available = category.targets.length > 0;
                const open = searching || this._open === category.id;
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
                            available
                              ? this._l("category_ready", {
                                  count: category.targets.length,
                                })
                              : this._l(`unavailable_${category.id}`)
                          }
                        </span>
                      </span>
                      ${
                        available
                          ? html`<ha-svg-icon
                              .path=${open ? mdiChevronDown : mdiChevronRight}
                            ></ha-svg-icon>`
                          : html`<span class="pill"
                              >${this._l("unavailable")}</span
                            >`
                      }
                    </button>
                    ${
                      available && open
                        ? html`<ul class="format-list">
                            ${targets.map(formatRow)}
                          </ul>`
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
    const file = input.files?.[0];
    input.value = "";
    if (file) {
      this._loadFile(file);
    }
  }

  private _clearFile(): void {
    this._fileBytes = undefined;
    this._fileName = "";
    this._error = undefined;
    this._afterInputChanged();
  }

  private _textChanged(ev: Event): void {
    const text = (ev.currentTarget as HTMLTextAreaElement).value;
    this._text = text;
    this._error = undefined;
    if (text.length > MAX_BYTES) {
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
    const files = ev.dataTransfer?.files;
    if (!files?.length) {
      return;
    }
    // This tool took the file: the app-wide drop import must not see it.
    ev.preventDefault();
    ev.stopPropagation();
    this._status = files.length > 1 ? this._l("first_file_only") : "";
    this._loadFile(files[0]);
  }

  private async _loadFile(file: File): Promise<void> {
    this._error = undefined;
    if (file.size > MAX_BYTES) {
      this._error = { code: "too_large", detail: file.name };
      return;
    }
    let bytes: Uint8Array;
    try {
      bytes = new Uint8Array(await file.arrayBuffer());
    } catch (_err) {
      this._error = { code: "read_failed", detail: file.name };
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
    const offered = targetsFor(kind);
    if (!this._target || !offered.includes(this._target)) {
      this._target = this._defaultTarget(kind);
    }
    this._schedule();
  }

  private _defaultTarget(kind: InputKind): TargetId {
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
    this._quality = Number((ev.currentTarget as HTMLInputElement).value);
    this._schedule();
  }

  private _resizeChanged(ev: Event): void {
    this._resize = (ev.currentTarget as HTMLSelectElement).value;
    this._schedule();
  }

  private _readAsChanged(ev: Event): void {
    this._readAs = (ev.currentTarget as HTMLSelectElement).value as
      DataFormat | "auto";
    this._schedule();
  }

  private _indentChanged(ev: Event): void {
    this._indent = (ev.currentTarget as HTMLSelectElement).value;
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
    this._convert(true);
  }

  private _release(): void {
    if (this._output?.imageUrl) {
      URL.revokeObjectURL(this._output.imageUrl);
    }
  }

  private _clearOutput(): void {
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
    const bytes = this._inputBytes;
    const target = this._target;
    const kind = this._inputKind;
    if (!bytes || !target || !kind) {
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
        select:focus-visible,
        textarea:focus-visible,
        input:focus-visible,
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
        input[type="range"] {
          width: 100%;
          min-height: 44px;
          margin: 0;
          accent-color: var(--primary-color);
        }
        select {
          min-height: 44px;
          padding: 0 var(--ha-space-3);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font: inherit;
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
        .pill {
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
          font-size: var(--ha-font-size-s);
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
