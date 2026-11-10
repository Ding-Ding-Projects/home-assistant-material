import { mdiFileCheckOutline, mdiFolderOpen, mdiTrayArrowDown } from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import type { VocabularyError } from "../../common/vocabulary/personal-vocabulary";
import {
  activeVocabularyCount,
  clearPersonalVocabulary,
  VOCABULARY_CHANGED_EVENT,
} from "../../common/vocabulary/personal-vocabulary";
import {
  importWordingFile,
  reportWordingImport,
} from "../../common/vocabulary/wording-import";
import "../../components/ha-alert";
import "../../components/ha-button";
import "../../components/ha-card";
import "../../components/ha-svg-icon";
import type { HomeAssistant } from "../../types";

/**
 * Personal wording: load, replace or clear a person's own wording file.
 *
 * The file can be chosen here or dropped anywhere in the window. It is
 * checked in full before anything changes; a file that fails leaves the
 * current wording as it is, and the message names the kind of problem
 * without repeating anything from the file.
 */
@customElement("ha-personal-wording-card")
export class HaPersonalWordingCard extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _count = activeVocabularyCount();

  @state() private _error?: VocabularyError | "unreadable" | "not_json";

  @state() private _dragging = false;

  @query("input") private _input!: HTMLInputElement;

  public connectedCallback() {
    super.connectedCallback();
    window.addEventListener(VOCABULARY_CHANGED_EVENT, this._changed);
    this._count = activeVocabularyCount();
  }

  public disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener(VOCABULARY_CHANGED_EVENT, this._changed);
  }

  private _changed = () => {
    this._count = activeVocabularyCount();
    this._error = undefined;
  };

  protected render(): TemplateResult {
    const localize = this.hass.localize;
    return html`
      <ha-card .header=${localize("ui.personal_wording.title")}>
        <div class="card-content">
          <p class="description">
            ${localize("ui.personal_wording.description")}
          </p>
          <div
            class="drop ${this._dragging ? "dragging" : ""}"
            @dragover=${this._dragOver}
            @dragleave=${this._dragLeave}
            @drop=${this._drop}
          >
            <ha-svg-icon .path=${mdiTrayArrowDown}></ha-svg-icon>
            <span class="drop-title"
              >${localize("ui.personal_wording.drop_title")}</span
            >
            <span class="drop-format"
              >${localize("ui.personal_wording.drop_format")}</span
            >
            <ha-button @click=${this._choose}>
              <ha-svg-icon slot="start" .path=${mdiFolderOpen}></ha-svg-icon>
              ${localize(
                this._count
                  ? "ui.personal_wording.replace"
                  : "ui.personal_wording.choose"
              )}
            </ha-button>
            <input
              type="file"
              accept=".json,application/json"
              hidden
              @change=${this._fileChosen}
            />
          </div>
          <div class="status" role="status">
            ${
              this._count
                ? html`
                    <ha-svg-icon .path=${mdiFileCheckOutline}></ha-svg-icon>
                    <span class="status-text">
                      <span class="status-label"
                        >${localize("ui.personal_wording.loaded_label")}</span
                      >
                      <span
                        >${localize("ui.personal_wording.loaded", {
                          count: this._count,
                        })}</span
                      >
                    </span>
                    <ha-button
                      appearance="plain"
                      variant="danger"
                      @click=${this._clear}
                    >
                      ${localize("ui.personal_wording.clear")}
                    </ha-button>
                  `
                : html`<span class="status-text"
                    >${localize("ui.personal_wording.none")}</span
                  >`
            }
          </div>
          ${
            this._error
              ? html`<ha-alert
                  alert-type="error"
                  .title=${localize("ui.personal_wording.not_applied")}
                >
                  ${localize(`ui.personal_wording.error.${this._error}`)}
                </ha-alert>`
              : nothing
          }
          <p class="note">${localize("ui.personal_wording.clear_note")}</p>
        </div>
      </ha-card>
    `;
  }

  private _choose() {
    this._input.value = "";
    this._input.click();
  }

  private _fileChosen() {
    const file = this._input.files?.[0];
    if (file) {
      this._import(file);
    }
  }

  private _dragOver(ev: DragEvent) {
    if (ev.dataTransfer?.types.includes("Files")) {
      ev.preventDefault();
      this._dragging = true;
    }
  }

  private _dragLeave() {
    this._dragging = false;
  }

  private _drop(ev: DragEvent) {
    this._dragging = false;
    const file = ev.dataTransfer?.files?.[0];
    if (!file) {
      return;
    }
    ev.preventDefault();
    this._import(file);
  }

  private async _import(file: File) {
    const result = await importWordingFile(file);
    reportWordingImport(result, this.hass.localize);
    this._error = result.ok ? undefined : result.error;
  }

  private _clear() {
    clearPersonalVocabulary();
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      max-width: 600px;
      margin: 0 auto var(--ha-space-4);
    }
    .description,
    .note {
      margin: 0;
      color: var(--secondary-text-color);
    }
    .card-content {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-4);
    }
    .drop {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      padding: var(--ha-space-8) var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--ha-color-fill-primary-quiet-resting);
      color: var(--ha-color-on-primary-quiet);
      text-align: center;
      outline: 2px dashed transparent;
      outline-offset: -6px;
    }
    .drop.dragging {
      outline-color: var(--primary-color);
    }
    .drop > ha-svg-icon {
      --mdc-icon-size: 32px;
    }
    .drop-title {
      font-size: var(--ha-font-size-xl);
      font-weight: var(--ha-font-weight-medium);
    }
    .drop-format {
      font-size: var(--ha-font-size-s);
      margin-bottom: var(--ha-space-2);
    }
    .status {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: var(--ha-space-12);
    }
    .status-text {
      display: flex;
      flex-direction: column;
      flex: 1;
    }
    .status-label {
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-medium);
      color: var(--secondary-text-color);
    }
    .note {
      font-size: var(--ha-font-size-s);
    }
    .status {
      flex-wrap: wrap;
    }
    .status-text {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    @media all and (max-width: 450px) {
      .drop {
        padding: var(--ha-space-6) var(--ha-space-3);
      }
      .drop-title {
        font-size: var(--ha-font-size-l);
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-personal-wording-card": HaPersonalWordingCard;
  }
}
