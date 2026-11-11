import {
  mdiAlertCircle,
  mdiContentCopy,
  mdiContentSave,
  mdiFolderOpen,
  mdiShieldCheck,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { visuallyHiddenFileInputStyles } from "../../../../resources/visually-hidden-file-input";
import type {
  Base64Variant,
  TextEncoding,
} from "../../../../common/base64/base64";
import {
  bytesToText,
  CHUNK_BYTES,
  decodeBase64,
  encodeBase64,
  fromDataUrl,
  sameBytes,
  textToBytes,
  toDataUrl,
} from "../../../../common/base64/base64";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import { sha256, toHex } from "../../../../common/util/sha256";
import "../../../../components/ha-button";
import "../../../../components/ha-svg-icon";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";

type Mode = "encode" | "decode" | "dataurl";

/** Largest input that is worked on in one go and shown in full. */
const INLINE_BYTES = 1024 * 1024;

/** Longest output shown; the rest is in the saved file. */
const SHOWN_CHARACTERS = 20000;

interface Progress {
  name: string;
  size: number;
  done: number;
  paused: boolean;
}

/**
 * Base64 toolkit: encodes text and files, decodes them back, and writes
 * data URLs. Everything happens in this browser; nothing is sent anywhere.
 */
@customElement("tools-base64")
class ToolsBase64 extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @state() private _mode: Mode = "encode";

  @state() private _variant: Base64Variant = "standard";

  @state() private _padding = true;

  @state() private _lineLength: 0 | 64 | 76 = 0;

  @state() private _encoding: TextEncoding = "utf-8";

  @state() private _input = "";

  @state() private _file?: File;

  @state() private _output = "";

  /** The whole result when it is longer than what is shown, or is not text. */
  private _outputBlob?: Blob;

  @state() private _outputName = "base64.txt";

  @state() private _check = "";

  @state() private _note = "";

  @state() private _error?: { text: string; lenient: boolean };

  @state() private _progress?: Progress;

  @state() private _status = "";

  @state() private _dragging = false;

  @query("#file") private _fileInput?: HTMLInputElement;

  private _run = 0;

  private _resume?: () => void;

  protected render(): TemplateResult {
    const l = (key: string, values?: Record<string, string | number>) =>
      this.hass.localize(
        `ui.panel.config.tools.tabs.base64.${key}` as any,
        values
      );
    const segment = <T extends string>(
      label: string,
      current: T,
      options: T[],
      handler: (ev: Event) => void,
      names: (value: T) => string
    ) => html`
      <div class="segment" role="group" aria-label=${label}>
        ${options.map(
          (option) => html`
            <button
              type="button"
              class=${classMap({ on: option === current })}
              aria-pressed=${option === current ? "true" : "false"}
              data-value=${option}
              @click=${handler}
            >
              ${names(option)}
            </button>
          `
        )}
      </div>
    `;
    const inputBytes = this._file
      ? this._file.size
      : (textToBytes(this._input, "utf-8")?.length ?? 0);
    return html`
      <div class="content">
        <div class="options">
          ${segment(
            l("mode"),
            this._mode,
            ["encode", "decode", "dataurl"],
            this._setMode,
            (value) => l(`mode_${value}`)
          )}
          ${segment(
            l("alphabet"),
            this._variant,
            ["standard", "url", "mime"],
            this._setVariant,
            (value) => l(`variant_${value}`)
          )}
          <button
            type="button"
            class=${classMap({ chip: true, on: this._padding })}
            aria-pressed=${this._padding ? "true" : "false"}
            ?disabled=${this._variant === "mime" || this._mode !== "encode"}
            @click=${this._togglePadding}
          >
            ${l("padding")}
          </button>
          <label class="select">
            <span>${l("line_length")}</span>
            <select
              .value=${String(this._lineLength)}
              ?disabled=${this._variant === "mime" || this._mode !== "encode"}
              @change=${this._setLineLength}
            >
              <option value="0">${l("line_none")}</option>
              <option value="64">64</option>
              <option value="76">76</option>
            </select>
          </label>
          <label class="select">
            <span>${l("text_as")}</span>
            <select .value=${this._encoding} @change=${this._setEncoding}>
              <option value="utf-8">UTF-8</option>
              <option value="latin1">Latin-1</option>
            </select>
          </label>
        </div>

        <div class="panes">
          <section
            class=${classMap({ pane: true, dragging: this._dragging })}
            @dragover=${this._dragOver}
            @dragleave=${this._dragLeave}
            @drop=${this._drop}
          >
            <header>
              <h2>
                ${l(this._mode === "decode" ? "input_base64" : "input_text")}
              </h2>
              <ha-button size="s" appearance="plain" @click=${this._chooseFile}>
                <ha-svg-icon slot="start" .path=${mdiFolderOpen}></ha-svg-icon>
                ${l("choose_file")}
              </ha-button>
              <input
                class="file-input-hidden"
                tabindex="-1"
                aria-hidden="true"
                id="file"
                type="file"
                @change=${this._fileChosen}
              />
            </header>
            ${
              this._file
                ? html`<p class="file">
                    <strong>${this._file.name}</strong>
                    <ha-button
                      size="s"
                      appearance="plain"
                      @click=${this._clearFile}
                      >${l("remove_file")}</ha-button
                    >
                  </p>`
                : html`<textarea
                    spellcheck="false"
                    aria-label=${l(
                      this._mode === "decode" ? "input_base64" : "input_text"
                    )}
                    .value=${this._input}
                    @input=${this._inputChanged}
                  ></textarea>`
            }
            <p class="note">${l("input_note", { bytes: inputBytes })}</p>
          </section>

          <section class="pane result">
            <header>
              <h2>
                ${l(this._mode === "decode" ? "output_text" : "output_base64")}
              </h2>
              <ha-button
                size="s"
                appearance="plain"
                ?disabled=${!this._output}
                @click=${this._copy}
              >
                <ha-svg-icon slot="start" .path=${mdiContentCopy}></ha-svg-icon>
                ${l("copy")}
              </ha-button>
              <ha-button
                size="s"
                appearance="plain"
                ?disabled=${!this._output && !this._outputBlob}
                @click=${this._save}
              >
                <ha-svg-icon slot="start" .path=${mdiContentSave}></ha-svg-icon>
                ${l("save")}
              </ha-button>
            </header>
            <pre
              tabindex="0"
              aria-label=${l(
                this._mode === "decode" ? "output_text" : "output_base64"
              )}
              .textContent=${this._output}
            ></pre>
            ${this._note ? html`<p class="note">${this._note}</p>` : nothing}
            ${
              this._check
                ? html`<p class="check">
                    <ha-svg-icon .path=${mdiShieldCheck}></ha-svg-icon>
                    ${this._check}
                  </p>`
                : nothing
            }
          </section>
        </div>

        ${
          this._progress
            ? html`<section class="progress">
                <div class="progress-text">
                  <strong>${this._progress.name}</strong>
                  <span
                    >${l("progress", {
                      done: Math.round(this._progress.done / 1048576),
                      total: Math.round(this._progress.size / 1048576),
                    })}</span
                  >
                </div>
                <ha-button size="s" appearance="filled" @click=${this._pause}>
                  ${l(this._progress.paused ? "resume" : "pause")}
                </ha-button>
                <ha-button size="s" appearance="plain" @click=${this._cancel}>
                  ${l("cancel")}
                </ha-button>
                <div
                  class="bar"
                  role="progressbar"
                  aria-label=${this._progress.name}
                  aria-valuemin="0"
                  aria-valuemax="100"
                  aria-valuenow=${Math.round(
                    (this._progress.done / this._progress.size) * 100
                  )}
                >
                  <div
                    style=${styleMap({
                      width: `${(this._progress.done / this._progress.size) * 100}%`,
                    })}
                  ></div>
                </div>
              </section>`
            : nothing
        }
        ${
          this._error
            ? html`<section class="error" role="alert">
                <ha-svg-icon .path=${mdiAlertCircle}></ha-svg-icon>
                <span>${this._error.text}</span>
                ${
                  this._error.lenient
                    ? html`<ha-button
                        size="s"
                        appearance="plain"
                        variant="danger"
                        @click=${this._decodeLeniently}
                        >${l("decode_leniently")}</ha-button
                      >`
                    : nothing
                }
              </section>`
            : nothing
        }
        ${
          this._status
            ? html`<p class="note" role="status">${this._status}</p>`
            : nothing
        }
        <p class="note">${l("privacy")}</p>
      </div>
    `;
  }

  private _l(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(
      `ui.panel.config.tools.tabs.base64.${key}` as any,
      values
    );
  }

  private _value<T extends string>(ev: Event): T {
    return (ev.currentTarget as HTMLElement).dataset.value as T;
  }

  private _setMode(ev: Event): void {
    this._mode = this._value<Mode>(ev);
    this._work();
  }

  private _setVariant(ev: Event): void {
    this._variant = this._value<Base64Variant>(ev);
    this._work();
  }

  private _togglePadding(): void {
    this._padding = !this._padding;
    this._work();
  }

  private _setLineLength(ev: Event): void {
    this._lineLength = Number((ev.currentTarget as HTMLSelectElement).value) as
      0 | 64 | 76;
    this._work();
  }

  private _setEncoding(ev: Event): void {
    this._encoding = (ev.currentTarget as HTMLSelectElement)
      .value as TextEncoding;
    this._work();
  }

  private _inputChanged(ev: Event): void {
    this._input = (ev.currentTarget as HTMLTextAreaElement).value;
    this._work();
  }

  private _chooseFile(): void {
    this._fileInput?.click();
  }

  private _fileChosen(ev: Event): void {
    const input = ev.currentTarget as HTMLInputElement;
    this._file = input.files?.[0];
    input.value = "";
    this._work();
  }

  private _clearFile(): void {
    this._file = undefined;
    this._work();
  }

  private _dragOver(ev: DragEvent): void {
    if (ev.dataTransfer?.types.includes("Files")) {
      ev.preventDefault();
      this._dragging = true;
    }
  }

  private _dragLeave(): void {
    this._dragging = false;
  }

  private _drop(ev: DragEvent): void {
    const file = ev.dataTransfer?.files[0];
    this._dragging = false;
    if (!file) {
      return;
    }
    ev.preventDefault();
    ev.stopPropagation();
    this._file = file;
    this._work();
  }

  private _reset(): void {
    this._run++;
    this._resume?.();
    this._resume = undefined;
    this._output = "";
    this._outputBlob = undefined;
    this._check = "";
    this._note = "";
    this._error = undefined;
    this._progress = undefined;
    this._status = "";
  }

  /** Does the chosen work on the input as it is now. */
  private async _work(strict = true): Promise<void> {
    this._reset();
    const run = this._run;
    const file = this._file;
    if (!file && !this._input) {
      return;
    }
    if (this._mode === "decode") {
      const text = file ? await file.text() : this._input;
      if (run === this._run) {
        this._decode(text, strict);
      }
      return;
    }
    if (file && file.size > INLINE_BYTES) {
      if (this._mode === "dataurl") {
        this._error = { text: this._l("too_large_data_url"), lenient: false };
        return;
      }
      await this._encodeInPieces(file, run);
      return;
    }
    const bytes = file
      ? new Uint8Array(await file.arrayBuffer())
      : textToBytes(this._input, this._encoding);
    if (run !== this._run) {
      return;
    }
    if (!bytes) {
      this._error = { text: this._l("not_latin1"), lenient: false };
      return;
    }
    if (this._mode === "dataurl") {
      this._show(
        toDataUrl(bytes, file?.type || "text/plain"),
        `${file?.name ?? "text"}.dataurl.txt`
      );
      return;
    }
    const text = encodeBase64(bytes, {
      variant: this._variant,
      padding: this._padding,
      lineLength: this._lineLength,
    });
    this._show(text, `${file?.name ?? "text"}.base64.txt`);
    const back = decodeBase64(text, this._variant, true);
    if (
      back.ok &&
      sameBytes(back.bytes, bytes) &&
      toHex(sha256(back.bytes)) === toHex(sha256(bytes))
    ) {
      this._check = this._l("checked", { bytes: bytes.length });
    }
  }

  private _show(text: string, name: string): void {
    this._outputName = name;
    if (text.length > SHOWN_CHARACTERS) {
      this._output = text.slice(0, SHOWN_CHARACTERS);
      this._outputBlob = new Blob([text], { type: "text/plain" });
      this._note = this._l("shown_part", {
        shown: SHOWN_CHARACTERS,
        total: text.length,
      });
    } else {
      this._output = text;
    }
  }

  private _decode(text: string, strict: boolean): void {
    const dataUrl = fromDataUrl(text);
    const result = dataUrl
      ? dataUrl.result
      : decodeBase64(text, this._variant, strict);
    if (!result.ok) {
      this._error = {
        text:
          result.reason === "alphabet"
            ? this._l("stopped_alphabet", {
                position: result.position,
                character: result.character,
                alphabet: this._l(`variant_${this._variant}`),
              })
            : this._l(`stopped_${result.reason}`, {
                position: result.position,
              }),
        lenient: !dataUrl,
      };
      return;
    }
    const decoded = bytesToText(result.bytes, this._encoding);
    const base = this._file?.name.replace(/\.base64\.txt$|\.b64$|\.txt$/i, "");
    if (decoded === undefined) {
      this._outputName = base || "decoded.bin";
      this._outputBlob = new Blob([result.bytes as BlobPart], {
        type: dataUrl?.mime || "application/octet-stream",
      });
      this._note = this._l("not_text", { bytes: result.bytes.length });
    } else {
      this._show(decoded, base || "decoded.txt");
    }
    if (result.skipped) {
      this._status = this._l("skipped", { count: result.skipped });
    }
  }

  private _decodeLeniently(): void {
    this._work(false);
  }

  /** Encodes a large file a piece at a time, so it can be paused or stopped. */
  private async _encodeInPieces(file: File, run: number): Promise<void> {
    const parts: string[] = [];
    const separator =
      this._variant === "mime" ? "\r\n" : this._lineLength ? "\n" : "";
    this._progress = {
      name: file.name,
      size: file.size,
      done: 0,
      paused: false,
    };
    let pieces = 0;
    for (let offset = 0; offset < file.size; offset += CHUNK_BYTES) {
      if (this._progress?.paused) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve) => {
          this._resume = resolve;
        });
      }
      if (run !== this._run) {
        return;
      }
      const bytes = new Uint8Array(
        // eslint-disable-next-line no-await-in-loop
        await file.slice(offset, offset + CHUNK_BYTES).arrayBuffer()
      );
      if (run !== this._run) {
        return;
      }
      const last = offset + CHUNK_BYTES >= file.size;
      const text = encodeBase64(bytes, {
        variant: this._variant,
        padding: last ? this._padding : false,
        lineLength: this._lineLength,
      });
      const back = decodeBase64(text, this._variant, true);
      if (!back.ok || !sameBytes(back.bytes, bytes)) {
        this._progress = undefined;
        this._error = { text: this._l("check_failed"), lenient: false };
        return;
      }
      parts.push(text);
      pieces++;
      this._progress = {
        ...this._progress!,
        done: Math.min(file.size, offset + CHUNK_BYTES),
      };
    }
    this._progress = undefined;
    this._outputName = `${file.name}.base64.txt`;
    this._outputBlob = new Blob(
      parts.flatMap((part, index) => (index ? [separator, part] : [part])),
      { type: "text/plain" }
    );
    this._output = parts[0]?.slice(0, SHOWN_CHARACTERS) ?? "";
    this._note = this._l("large_done", { name: this._outputName });
    this._check = this._l("checked_pieces", { pieces });
  }

  private _pause(): void {
    if (!this._progress) {
      return;
    }
    const paused = !this._progress.paused;
    this._progress = { ...this._progress, paused };
    if (!paused) {
      this._resume?.();
      this._resume = undefined;
    }
  }

  private _cancel(): void {
    this._reset();
    this._file = undefined;
  }

  private async _copy(): Promise<void> {
    await copyToClipboard(
      this._outputBlob && this._outputBlob.type === "text/plain"
        ? await this._outputBlob.text()
        : this._output
    );
    this._status = this._l("copied");
  }

  private _save(): void {
    const blob =
      this._outputBlob ?? new Blob([this._output], { type: "text/plain" });
    fileDownload(URL.createObjectURL(blob), this._outputName);
    this._status = this._l("saved", { name: this._outputName });
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
          max-width: 1200px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-8);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
        }
        .options {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
        }
        button {
          font: inherit;
          color: inherit;
          cursor: pointer;
        }
        .segment {
          display: inline-flex;
          padding: var(--ha-space-1);
          border-radius: var(--ha-border-radius-pill);
          background: var(--card-background-color);
        }
        .segment button {
          min-height: var(--ha-space-10);
          padding: 0 var(--ha-space-4);
          border: none;
          border-radius: var(--ha-border-radius-pill);
          background: none;
          font-weight: var(--ha-font-weight-medium);
        }
        .segment button.on {
          background: var(--primary-background-color);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .chip {
          min-height: var(--ha-space-10);
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
        .chip[disabled] {
          opacity: 0.5;
          cursor: default;
        }
        .select {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-2);
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        select {
          min-height: var(--ha-space-10);
          padding: 0 var(--ha-space-3);
          border: 1px solid var(--outline-color);
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font: inherit;
        }
        button:focus-visible,
        select:focus-visible,
        textarea:focus-visible,
        pre:focus-visible {
          outline: 3px solid var(--primary-color);
          outline-offset: 2px;
        }
        .panes {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: var(--ha-space-3);
        }
        .pane {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
          min-width: 0;
          padding: var(--ha-space-5);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .pane.result {
          background: color-mix(
            in srgb,
            var(--primary-color) 16%,
            var(--primary-background-color)
          );
        }
        .pane.dragging {
          outline: 3px dashed var(--primary-color);
        }
        .pane header {
          display: flex;
          align-items: center;
          gap: var(--ha-space-1);
        }
        h2 {
          flex: 1;
          margin: 0;
          font-size: var(--ha-font-size-m);
          font-weight: var(--ha-font-weight-medium);
        }
        textarea,
        pre {
          box-sizing: border-box;
          width: 100%;
          min-height: 180px;
          max-height: 420px;
          margin: 0;
          padding: var(--ha-space-3);
          border: none;
          border-radius: var(--ha-border-radius-lg);
          background: var(--primary-background-color);
          color: var(--primary-text-color);
          font-family: var(--ha-font-family-code);
          font-size: var(--ha-font-size-m);
          line-height: var(--ha-line-height-normal);
          resize: vertical;
          overflow: auto;
          white-space: pre-wrap;
          overflow-wrap: anywhere;
        }
        .file {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          min-height: 180px;
          margin: 0;
        }
        .note {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        .check {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
          margin: 0;
          font-size: var(--ha-font-size-s);
          --mdc-icon-size: 18px;
        }
        .progress,
        .error {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-4) var(--ha-space-5);
          border-radius: var(--ha-border-radius-xl);
          background: var(--card-background-color);
        }
        .progress-text {
          flex: 1;
          display: flex;
          flex-direction: column;
          font-size: var(--ha-font-size-s);
        }
        .bar {
          flex: 1 1 100%;
          height: 6px;
          border-radius: var(--ha-border-radius-pill);
          background: var(--primary-background-color);
          overflow: hidden;
        }
        .bar div {
          height: 100%;
          background: var(--primary-color);
        }
        .error {
          background: color-mix(
            in srgb,
            var(--error-color) 18%,
            var(--primary-background-color)
          );
        }
        .error span {
          flex: 1;
        }
        .error ha-svg-icon {
          color: var(--error-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-base64": ToolsBase64;
  }
}
