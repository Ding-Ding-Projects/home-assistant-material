import { mdiContentCopy } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import { parseTemplate } from "../../common/string-builder/parse";
import { serializePieces } from "../../common/string-builder/serialize";
import type { Piece } from "../../common/string-builder/types";
import { isTemplate } from "../../common/string/has-template";
import { copyToClipboard } from "../../common/util/copy-clipboard";
import { debounce } from "../../common/util/debounce";
import type {
  RenderTemplateError,
  RenderTemplateResult,
} from "../../data/ws-templates";
import { subscribeRenderTemplate } from "../../data/ws-templates";
import { haStyle } from "../../resources/styles";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";
import "../ha-adaptive-dialog";
import "../ha-alert";
import "../ha-button";
import "../ha-dialog-footer";
import "../ha-icon-button";
import "./ha-string-builder-editor";

declare global {
  interface HASSDomEvents {
    "string-builder-use": { value: string };
    "string-builder-closed": undefined;
  }
}

const KEY = "ui.components.string_builder";

/** Values the preview cannot know because they only exist during a run. */
const RUN_ONLY = /\b(trigger|wait|repeat|this|variables)\b/;

/**
 * The string builder surface: a dialog on wide windows and a bottom sheet on
 * a phone. It composes text from pieces, previews it with the server's own
 * template renderer and hands the resulting template back.
 */
@customElement("ha-string-builder-dialog")
export class HaStringBuilderDialog extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The text the field holds when the builder is opened. */
  @property() public value = "";

  @property({ type: Boolean }) public open = false;

  @state() private _pieces: Piece[] = [];

  @state() private _structured = true;

  @state() private _previewText?: string;

  @state() private _previewError?: string;

  private _unsub?: Promise<UnsubscribeFunc>;

  private _previewRun = 0;

  private _debouncedPreview = debounce(() => this._runPreview(), 400);

  protected willUpdate(changed: PropertyValues<this>) {
    if (!this.hasUpdated) {
      const parsed = parseTemplate(this.value ?? "");
      this._pieces = parsed.pieces;
      this._structured = parsed.structured;
      this._runPreview();
    }
    super.willUpdate(changed);
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    this._debouncedPreview.cancel();
    this._previewRun++;
    this._unsubscribe();
  }

  private get _template(): string {
    return serializePieces(this._pieces);
  }

  protected render() {
    const template = this._template;
    return html`
      <ha-adaptive-dialog
        .open=${this.open}
        width="large"
        flexcontent
        @closed=${this._closed}
        .headerTitle=${this._t("title")}
        .headerSubtitle=${this._t("subtitle")}
      >
        ${
          this._structured
            ? nothing
            : html`<ha-alert alert-type="info"
                >${this._t("kept_as_template")}</ha-alert
              >`
        }
        <div class="content">
          <ha-string-builder-editor
            .hass=${this.hass}
            .pieces=${this._pieces}
            @pieces-changed=${this._piecesChanged}
          ></ha-string-builder-editor>
          ${this._renderPreview(template)}
          <section class="output">
            <div class="section-head">
              <h3 id="sb-template">${this._t("template_heading")}</h3>
              <ha-icon-button
                .label=${this._t("copy")}
                .path=${mdiContentCopy}
                .disabled=${!template}
                @click=${this._copy}
              ></ha-icon-button>
            </div>
            <pre class="template" dir="ltr" aria-labelledby="sb-template">
${template || this._t("template_empty")}</pre>
          </section>
        </div>
        <ha-dialog-footer slot="footer">
          <ha-button
            slot="secondaryAction"
            appearance="plain"
            @click=${this._cancel}
          >
            ${this.hass.localize("ui.common.cancel")}
          </ha-button>
          <ha-button slot="primaryAction" @click=${this._use}>
            ${this._t("use")}
          </ha-button>
        </ha-dialog-footer>
      </ha-adaptive-dialog>
    `;
  }

  private _renderPreview(template: string) {
    const runOnly =
      this._pieces.some(
        (piece) => piece.kind === "raw" && RUN_ONLY.test(piece.template)
      ) ||
      (this._previewError !== undefined &&
        this._previewError.includes("is undefined"));
    return html`
      <section class="preview">
        <h3 id="sb-preview">${this._t("preview_heading")}</h3>
        ${
          this._previewError
            ? html`<ha-alert alert-type="error"
                >${this._t("preview_error", {
                  error: this._previewError,
                })}</ha-alert
              >`
            : html`<div
                class="rendered"
                role="status"
                aria-live="polite"
                aria-labelledby="sb-preview"
              >
                ${
                  !template
                    ? html`<span class="muted"
                        >${this._t("preview_empty")}</span
                      >`
                    : this._previewText === undefined
                      ? html`<span class="muted"
                          >${this._t("preview_waiting")}</span
                        >`
                      : this._previewText
                }
              </div>`
        }
        ${
          runOnly
            ? html`<ha-alert alert-type="info"
                >${this._t("preview_run_only")}</ha-alert
              >`
            : nothing
        }
      </section>
    `;
  }

  private _t(key: string, values?: Record<string, string | number>): string {
    return this.hass.localize(`${KEY}.${key}` as any, values as any);
  }

  private _piecesChanged(ev: CustomEvent<{ pieces: Piece[] }>) {
    ev.stopPropagation();
    this._pieces = ev.detail.pieces;
    this._debouncedPreview();
  }

  private async _copy() {
    await copyToClipboard(this._template, this);
    showToast(this, {
      message: this.hass.localize("ui.common.copied_clipboard"),
    });
  }

  private _closed(ev: Event) {
    if (ev.target !== ev.currentTarget) {
      return;
    }
    ev.stopPropagation();
    fireEvent(this, "string-builder-closed");
  }

  private _cancel() {
    this.open = false;
  }

  private _use() {
    fireEvent(this, "string-builder-use", { value: this._template });
  }

  private async _unsubscribe() {
    const pending = this._unsub;
    this._unsub = undefined;
    if (!pending) {
      return;
    }
    try {
      (await pending)();
    } catch {
      // The connection may already be closed.
    }
  }

  private async _runPreview() {
    const run = ++this._previewRun;
    await this._unsubscribe();
    const template = this._template;
    if (!template || !isTemplate(template)) {
      this._previewText = template;
      this._previewError = undefined;
      return;
    }
    this._previewText = undefined;
    let latestError: string | undefined;
    try {
      this._unsub = subscribeRenderTemplate(
        this.hass.connection,
        (result: RenderTemplateResult | RenderTemplateError) => {
          if (run !== this._previewRun) {
            return;
          }
          if ("error" in result) {
            if (result.level === "ERROR" || !latestError) {
              latestError = result.error;
              this._previewError = result.error;
            }
          } else {
            latestError = undefined;
            this._previewError = undefined;
            this._previewText =
              typeof result.result === "object"
                ? JSON.stringify(result.result, null, 2)
                : String(result.result);
          }
        },
        { template, timeout: 3, report_errors: true }
      );
      await this._unsub;
    } catch (err: any) {
      if (run === this._previewRun) {
        this._previewError = err?.message || this._t("preview_failed");
      }
    }
  }

  static styles = [
    haStyle,
    css`
      ha-adaptive-dialog {
        /* Let the subtitle wrap instead of being cut at a narrow width. */
        --ha-dialog-header-white-space: normal;
      }
      .content {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-4);
        padding-block: var(--ha-space-2);
      }
      h3 {
        margin: 0;
        font-size: var(--ha-font-size-m);
        font-weight: var(--ha-font-weight-semibold);
      }
      section {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .section-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .rendered,
      .template {
        margin: 0;
        padding: var(--ha-space-3);
        border-radius: var(--ha-border-radius-lg);
        background: var(
          --ha-color-surface-tone-1,
          var(--secondary-background-color)
        );
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        min-height: 1.5em;
      }
      .template {
        font-family: var(--ha-font-family-code);
        font-size: var(--ha-font-size-s);
        user-select: all;
      }
      .muted {
        color: var(--secondary-text-color);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-string-builder-dialog": HaStringBuilderDialog;
  }
}
