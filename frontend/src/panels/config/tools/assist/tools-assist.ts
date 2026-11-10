import {
  mdiCodeBraces,
  mdiDownload,
  mdiInformationOutline,
  mdiSend,
  mdiTrashCan,
} from "@mdi/js";
import { dump } from "js-yaml";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import { storage } from "../../../../common/decorators/storage";
import { formatLanguageCode } from "../../../../common/language/format_language";
import { capitalizeFirstLetter } from "../../../../common/string/capitalize-first-letter";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-card";
import "../../../../components/ha-code-editor";
import "../../../../components/ha-language-picker";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-textarea";
import type { HaTextArea } from "../../../../components/ha-textarea";
import type { AssistDebugResult } from "../../../../data/conversation";
import { debugAgent, listAgents } from "../../../../data/conversation";
import { SubscribeMixin } from "../../../../mixins/subscribe-mixin";
import { haStyle } from "../../../../resources/styles";
import type { HomeAssistant } from "../../../../types";
import { fileDownload } from "../../../../util/file_download";

interface SentenceParsingResult {
  sentence: string;
  language: string;
  result: AssistDebugResult | null;
}

@customElement("tools-assist")
class HaPanelDevAssist extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean }) public narrow = false;

  @state() supportedLanguages?: string[];

  @state()
  @storage({
    key: "assist_debug_language",
    state: true,
    subscribe: false,
    storage: "localStorage",
  })
  _language?: string;

  @state() _results: SentenceParsingResult[] = [];

  @query("#sentences-input") _sentencesInput!: HaTextArea;

  @state() _validInput = false;

  @state() private _yamlOpen = new Set<number>();

  private _languageChanged(ev) {
    this._language = ev.detail.value;
  }

  private _handleKeyDown(e: KeyboardEvent) {
    if (e.code !== "Enter" || e.shiftKey) {
      return;
    }
    e.preventDefault();
    this._parse();
  }

  private _textAreaInput(ev) {
    const value = ev.target.value;
    const valid = Boolean(value);
    if (valid !== this._validInput) {
      this._validInput = valid;
    }
  }

  private async _parse() {
    const sentences = (this._sentencesInput.value || "")
      .split("\n")
      .filter((a) => a !== "");
    const { results } = await debugAgent(this.hass, sentences, this._language!);

    this._sentencesInput.value = "";

    const newResults: SentenceParsingResult[] = [];
    sentences.forEach((sentence, index) => {
      const result = results[index];

      newResults.push({
        sentence,
        language: this._language!,
        result,
      });
    });
    this._yamlOpen = new Set();
    this._results = [...newResults, ...this._results];
  }

  private async _fetchLanguages() {
    const { agents } = await listAgents(this.hass.callWS);
    const assistAgent = agents.find(
      (agent) => agent.id === "conversation.home_assistant"
    );
    this.supportedLanguages =
      assistAgent?.supported_languages === "*"
        ? undefined
        : assistAgent?.supported_languages;

    if (
      !this._language &&
      this.supportedLanguages?.includes(this.hass.locale.language)
    ) {
      this._language = this.hass.locale.language;
    } else if (!this._language) {
      this._language = "en";
    }
  }

  protected firstUpdated(): void {
    this._fetchLanguages();
  }

  private _t(key: string): string {
    return this.hass.localize(
      `ui.panel.config.tools.tabs.assist.${key}` as any
    );
  }

  protected render() {
    return html`
      <div class="content">
        <ha-card .header=${this._t("test_title")} class="form">
          <div class="card-content">
            ${
              this.supportedLanguages
                ? html`
                    <ha-language-picker
                      .languages=${this.supportedLanguages}
                      .value=${this._language}
                      @value-changed=${this._languageChanged}
                    ></ha-language-picker>
                  `
                : nothing
            }
            <ha-textarea
              resize="auto"
              .label=${this._t("sentences")}
              id="sentences-input"
              @input=${this._textAreaInput}
              @keydown=${this._handleKeyDown}
            ></ha-textarea>
            <p class="hint">${this._t("description")}</p>
          </div>
          <div class="card-actions">
            <ha-button
              appearance="filled"
              @click=${this._parse}
              .disabled=${!this._language || !this._validInput}
            >
              <ha-svg-icon slot="start" .path=${mdiSend}></ha-svg-icon>
              ${this._t("parse_sentences")}
            </ha-button>
          </div>
        </ha-card>

        <div class="results">
          ${
            this._results.length
              ? html`
                  <div class="result-toolbar">
                    <ha-button appearance="plain" @click=${this._download}>
                      <ha-svg-icon
                        slot="start"
                        .path=${mdiDownload}
                      ></ha-svg-icon>
                      ${this._t("download_results")}
                    </ha-button>
                    <ha-button
                      appearance="plain"
                      variant="danger"
                      @click=${this._clear}
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${mdiTrashCan}
                      ></ha-svg-icon>
                      ${this.hass.localize("ui.common.clear")}
                    </ha-button>
                  </div>
                `
              : html`
                  <ha-card .header=${this._t("understood")}>
                    <div class="card-content hint">${this._t("empty")}</div>
                  </ha-card>
                `
          }
          ${this._results.map((r, index) => this._renderResult(r, index))}
        </div>

        <div class="note">
          <ha-svg-icon .path=${mdiInformationOutline}></ha-svg-icon>
          <span>${this._t("custom_sentences_note")}</span>
        </div>
      </div>
    `;
  }

  private _rows(r: SentenceParsingResult): [string, string][] {
    const { result, language } = r;
    const rows: [string, string][] = [];
    if (!result) {
      return rows;
    }
    if (result.intent?.name) {
      rows.push([this._t("intent"), result.intent.name]);
    }
    Object.entries(result.details ?? {}).forEach(([key, detail]) => {
      rows.push([
        capitalizeFirstLetter(key.replace(/_/g, " ")),
        detail.text ?? String(detail.value),
      ]);
    });
    const targets = Object.entries(result.targets ?? {})
      .filter(([, target]) => target.matched)
      .map(
        ([entityId]) =>
          this.hass.states[entityId]?.attributes.friendly_name ?? entityId
      );
    if (targets.length) {
      rows.push([this._t("would_act_on"), targets.join(", ")]);
    }
    rows.push([this._t("matched_sentence"), result.sentence_template]);
    rows.push([
      this._t("source"),
      [
        result.source ? this._t(`source_${result.source}`) : undefined,
        formatLanguageCode(language, this.hass.locale),
      ]
        .filter(Boolean)
        .join(", "),
    ]);
    return rows;
  }

  private _renderResult(r: SentenceParsingResult, index: number) {
    const { sentence, result } = r;
    const showYaml = this._yamlOpen.has(index);
    return html`
      <ha-card
        class="result"
        .header=${result ? this._t("understood") : this._t("not_understood")}
      >
        <span class="chip ${result ? "matched" : "unmatched"}">
          ${result ? this._t("matched") : this._t("no_match")}
        </span>
        <div class="card-content">
          <div class="sentence">${sentence}</div>
          ${
            result
              ? html`
                  <dl class="rows">
                    ${this._rows(r).map(
                      ([label, value]) =>
                        html`<dt>${label}</dt>
                          <dd>${value}</dd>`
                    )}
                  </dl>
                  <div class="yaml-toggle">
                    <ha-button
                      appearance="plain"
                      variant="brand"
                      .index=${index}
                      @click=${this._toggleYaml}
                    >
                      <ha-svg-icon
                        slot="start"
                        .path=${mdiCodeBraces}
                      ></ha-svg-icon>
                      ${this._t(showYaml ? "hide_yaml" : "show_yaml")}
                    </ha-button>
                  </div>
                  ${
                    showYaml
                      ? html`<ha-code-editor
                          mode="yaml"
                          .value=${dump(result).trimRight()}
                          read-only
                          dir="ltr"
                        ></ha-code-editor>`
                      : nothing
                  }
                `
              : html`<ha-alert alert-type="error">
                  ${this._t("no_match")}
                </ha-alert>`
          }
        </div>
      </ha-card>
    `;
  }

  private _toggleYaml(ev: Event) {
    const index = (ev.currentTarget as HTMLElement & { index: number }).index;
    const open = new Set(this._yamlOpen);
    if (open.has(index)) {
      open.delete(index);
    } else {
      open.add(index);
    }
    this._yamlOpen = open;
  }

  private _download() {
    fileDownload(
      `data:text/plain;charset=utf-8,${encodeURIComponent(
        JSON.stringify({ results: this._results }, null, 2)
      )}`,
      `intent_results.json`
    );
  }

  private _clear() {
    this._results = [];
    this._yamlOpen = new Set();
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .content {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          align-items: start;
          gap: var(--ha-space-4);
          padding: var(--ha-space-4) var(--ha-space-5) var(--ha-space-6);
          max-width: 1100px;
          margin: 0 auto;
          box-sizing: border-box;
        }
        @media (max-width: 800px) {
          .content {
            grid-template-columns: minmax(0, 1fr);
            padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
          }
        }
        ha-card {
          position: relative;
          border-radius: var(--ha-border-radius-3xl);
        }
        .card-content {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        .hint {
          margin: 0;
          font-size: var(--ha-font-size-s);
          color: var(--secondary-text-color);
        }
        ha-textarea {
          width: 100%;
        }
        .card-actions {
          display: flex;
          justify-content: flex-end;
        }
        .results {
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
          min-width: 0;
        }
        .result-toolbar {
          display: flex;
          justify-content: flex-end;
          flex-wrap: wrap;
          gap: var(--ha-space-2);
        }
        .chip {
          position: absolute;
          inset-block-start: var(--ha-space-4);
          inset-inline-end: var(--ha-space-4);
          padding: var(--ha-space-1) var(--ha-space-3);
          border-radius: var(--ha-border-radius-pill);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
        }
        .chip.matched {
          background: var(--success-color);
          color: var(--text-primary-color);
        }
        .chip.unmatched {
          background: var(--error-color);
          color: var(--text-primary-color);
        }
        .sentence {
          font-weight: var(--ha-font-weight-medium);
        }
        .rows {
          display: grid;
          grid-template-columns: minmax(0, auto) minmax(0, 1fr);
          gap: var(--ha-space-2) var(--ha-space-4);
          margin: 0;
        }
        .rows dt {
          color: var(--secondary-text-color);
        }
        .rows dd {
          margin: 0;
          text-align: end;
          font-weight: var(--ha-font-weight-medium);
          overflow-wrap: anywhere;
        }
        .note {
          grid-column: 1 / -1;
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-3) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .note ha-svg-icon {
          flex-shrink: 0;
        }
        ha-code-editor,
        ha-alert {
          display: block;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "tools-assist": HaPanelDevAssist;
  }
}
