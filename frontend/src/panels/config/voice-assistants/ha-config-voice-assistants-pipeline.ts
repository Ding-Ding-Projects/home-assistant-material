import { mdiBug, mdiSend, mdiStar } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { navigate } from "../../../common/navigate";
import "../../../components/ha-alert";
import "../../../components/ha-button";
import "../../../components/ha-icon-button";
import "../../../components/ha-svg-icon";
import "../../../components/input/ha-input";
import type {
  AssistPipeline,
  AssistPipelineMutableParams,
} from "../../../data/assist_pipeline";
import {
  deleteAssistPipeline,
  fetchAssistPipelineLanguages,
  listAssistPipelines,
  setAssistPipelinePreferred,
  updateAssistPipeline,
} from "../../../data/assist_pipeline";
import type { ConversationResult } from "../../../data/conversation";
import {
  showAlertDialog,
  showConfirmationDialog,
} from "../../../dialogs/generic/show-dialog-box";
import "../../../layouts/hass-loading-screen";
import "../../../layouts/hass-subpage";
import { DirtyStateProviderMixin } from "../../../mixins/dirty-state-provider-mixin";
import { haStyle } from "../../../resources/styles";
import type { HomeAssistant, Route } from "../../../types";
import { showErrorToast } from "../../../util/show-error-toast";
import "./assist-pipeline-detail/assist-pipeline-detail-config";
import "./assist-pipeline-detail/assist-pipeline-detail-conversation";
import "./assist-pipeline-detail/assist-pipeline-detail-stt";
import "./assist-pipeline-detail/assist-pipeline-detail-tts";
import "./assist-pipeline-detail/assist-pipeline-detail-wakeword";

interface TryResult {
  answer: string;
  seconds: number;
  failed: boolean;
}

/**
 * One assistant on its own page: its name and language, the four steps that
 * turn a voice into an answer, and a place to try a sentence on it.
 */
@customElement("ha-config-voice-assistants-pipeline")
export class HaConfigVoiceAssistantsPipeline extends DirtyStateProviderMixin<
  Partial<AssistPipeline>
>()(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ type: Boolean, reflect: true }) public narrow = false;

  @property({ attribute: false }) public route!: Route;

  @state() private _pipeline?: AssistPipeline;

  @state() private _preferred: string | null = null;

  @state() private _data?: Partial<AssistPipeline>;

  @state() private _notFound = false;

  @state() private _error?: string;

  @state() private _saving = false;

  @state() private _supportedLanguages?: string[];

  @state() private _tryText = "";

  @state() private _trying = false;

  @state() private _tryResult?: TryResult;

  private _loadedId?: string;

  private get _pipelineId(): string {
    return this.route.path.substring(1);
  }

  protected firstUpdated(changedProps: PropertyValues<this>) {
    super.firstUpdated(changedProps);
    fetchAssistPipelineLanguages(this.hass).then(
      ({ languages }) => {
        this._supportedLanguages = languages ?? undefined;
      },
      () => {
        this._supportedLanguages = undefined;
      }
    );
  }

  protected willUpdate(changedProps: PropertyValues<this>) {
    super.willUpdate(changedProps);
    if (this.route && this._loadedId !== this._pipelineId) {
      this._loadedId = this._pipelineId;
      this._load();
    }
  }

  private async _load() {
    const id = this._pipelineId;
    this._notFound = false;
    this._pipeline = undefined;
    this._data = undefined;
    this._tryResult = undefined;
    const { pipelines, preferred_pipeline: preferred } =
      await listAssistPipelines(this.hass.callWS);
    if (id !== this._pipelineId) {
      return;
    }
    this._preferred = preferred;
    const pipeline = pipelines.find((item) => item.id === id);
    if (!pipeline) {
      this._notFound = true;
      return;
    }
    this._pipeline = pipeline;
    this._data = { ...pipeline };
    this._initDirtyTracking({ type: "deep" }, this._data);
  }

  private _hasWakeWordEntities = memoizeOne((states: HomeAssistant["states"]) =>
    Object.keys(states).some((entityId) => entityId.startsWith("wake_word."))
  );

  protected render() {
    if (this._notFound) {
      return html`
        <hass-subpage
          .hass=${this.hass}
          .narrow=${this.narrow}
          back-path="/config/voice-assistants/assistants"
          .header=${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.caption"
          )}
        >
          <div class="page">
            <ha-alert alert-type="error">
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.page.not_found"
              )}
            </ha-alert>
          </div>
        </hass-subpage>
      `;
    }
    if (!this._pipeline || !this._data) {
      return html`<hass-loading-screen></hass-loading-screen>`;
    }

    const data = this._data;
    const isPreferred = this._preferred === this._pipeline.id;
    const showWakeWord =
      !!data.wake_word_entity || this._hasWakeWordEntities(this.hass.states);
    let step = 0;

    return html`
      <hass-subpage
        .hass=${this.hass}
        .narrow=${this.narrow}
        back-path="/config/voice-assistants/assistants"
        .header=${this._pipeline.name}
        breadcrumb=${this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.page.breadcrumb"
        )}
      >
        <div class="page">
          ${
            this._error
              ? html`<ha-alert alert-type="error">${this._error}</ha-alert>`
              : nothing
          }
          <assist-pipeline-detail-config
            .hass=${this.hass}
            .data=${data}
            .supportedLanguages=${this._supportedLanguages}
            keys="name,language"
            @value-changed=${this._valueChanged}
          ></assist-pipeline-detail-config>
          <div class="steps">
            ${
              showWakeWord
                ? html`<div class="step" data-step=${++step}>
                    <assist-pipeline-detail-wakeword
                      .hass=${this.hass}
                      .data=${data}
                      keys="wake_word_entity,wake_word_id"
                      @value-changed=${this._valueChanged}
                    ></assist-pipeline-detail-wakeword>
                  </div>`
                : nothing
            }
            <div class="step" data-step=${++step}>
              <assist-pipeline-detail-stt
                .hass=${this.hass}
                .data=${data}
                keys="stt_engine,stt_language"
                @value-changed=${this._valueChanged}
              ></assist-pipeline-detail-stt>
            </div>
            <div class="step" data-step=${++step}>
              <assist-pipeline-detail-conversation
                .hass=${this.hass}
                .data=${data}
                keys="conversation_engine,conversation_language,prefer_local_intents"
                @value-changed=${this._valueChanged}
              ></assist-pipeline-detail-conversation>
            </div>
            <div class="step" data-step=${step + 1}>
              <assist-pipeline-detail-tts
                .hass=${this.hass}
                .data=${data}
                keys="tts_engine,tts_language,tts_voice"
                @value-changed=${this._valueChanged}
              ></assist-pipeline-detail-tts>
            </div>
          </div>
          ${this._renderTryIt()}
          <div class="footer">
            <ha-button
              appearance="plain"
              variant="danger"
              @click=${this._delete}
            >
              ${this.hass.localize("ui.common.delete")}
            </ha-button>
            <span class="spacer"></span>
            <ha-button
              appearance="outlined"
              .disabled=${isPreferred}
              @click=${this._makePreferred}
            >
              <ha-svg-icon slot="start" .path=${mdiStar}></ha-svg-icon>
              ${this.hass.localize(
                "ui.panel.config.voice_assistants.assistants.pipeline.detail.set_as_preferred"
              )}
            </ha-button>
            <ha-button
              @click=${this._save}
              .loading=${this._saving}
              .disabled=${!this.isDirtyState}
            >
              ${this.hass.localize("ui.common.save")}
            </ha-button>
          </div>
        </div>
      </hass-subpage>
    `;
  }

  private _renderTryIt() {
    return html`
      <section class="try">
        <h3>
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.pipeline.page.try_it"
          )}
        </h3>
        <div class="try-row">
          <ha-input
            .value=${this._tryText}
            .label=${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.page.try_placeholder"
            )}
            @input=${this._tryTextChanged}
            @keydown=${this._tryKeydown}
          ></ha-input>
          <ha-icon-button
            .label=${this.hass.localize(
              "ui.panel.config.voice_assistants.assistants.pipeline.page.try_send"
            )}
            .path=${mdiSend}
            .disabled=${this._trying || !this._tryText.trim()}
            @click=${this._tryIt}
          ></ha-icon-button>
        </div>
        ${
          this._tryResult
            ? html`<dl class="try-result">
                <dt>
                  ${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.page.answer"
                  )}
                </dt>
                <dd class=${this._tryResult.failed ? "failed" : ""}>
                  ${this._tryResult.answer}
                </dd>
                <dt>
                  ${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.page.took"
                  )}
                </dt>
                <dd>
                  ${this.hass.localize(
                    "ui.panel.config.voice_assistants.assistants.pipeline.page.seconds",
                    { seconds: this._tryResult.seconds.toFixed(2) }
                  )}
                </dd>
              </dl>`
            : nothing
        }
        <ha-button
          appearance="plain"
          href="/config/voice-assistants/debug/${this._pipeline!.id}"
        >
          <ha-svg-icon slot="start" .path=${mdiBug}></ha-svg-icon>
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.pipeline.page.open_debugger"
          )}
        </ha-button>
      </section>
    `;
  }

  private _tryTextChanged(ev: Event) {
    this._tryText = (ev.target as HTMLInputElement).value;
  }

  private _tryKeydown(ev: KeyboardEvent) {
    if (ev.key === "Enter") {
      this._tryIt();
    }
  }

  private async _tryIt() {
    const text = this._tryText.trim();
    if (!text || this._trying || !this._data) {
      return;
    }
    this._trying = true;
    const started = performance.now();
    try {
      const result = await this.hass.callWS<ConversationResult>({
        type: "conversation/process",
        text,
        language: this._data.conversation_language || this._data.language,
        agent_id: this._data.conversation_engine,
      });
      this._tryResult = {
        answer:
          result.response.speech?.plain?.speech ||
          this.hass.localize(
            "ui.panel.config.voice_assistants.assistants.pipeline.page.no_answer"
          ),
        seconds: (performance.now() - started) / 1000,
        failed: result.response.response_type === "error",
      };
    } catch (err: any) {
      this._tryResult = {
        answer: err?.message || "",
        seconds: (performance.now() - started) / 1000,
        failed: true,
      };
    } finally {
      this._trying = false;
    }
  }

  private _valueChanged(ev: CustomEvent) {
    this._error = undefined;
    const value = {};
    (ev.currentTarget as HTMLElement)
      .getAttribute("keys")!
      .split(",")
      .forEach((key) => {
        value[key] = ev.detail.value[key];
      });
    this._data = { ...this._data, ...value };
    this._updateDirtyState(this._data);
  }

  private async _save() {
    if (!this._pipeline || !this._data) {
      return;
    }
    this._saving = true;
    this._error = undefined;
    try {
      const data = this._data;
      const values: AssistPipelineMutableParams = {
        name: data.name!,
        language: data.language!,
        conversation_engine: data.conversation_engine!,
        conversation_language: data.conversation_language ?? null,
        prefer_local_intents: data.prefer_local_intents ?? true,
        stt_engine: data.stt_engine ?? null,
        stt_language: data.stt_language ?? null,
        tts_engine: data.tts_engine ?? null,
        tts_language: data.tts_language ?? null,
        tts_voice: data.tts_voice ?? null,
        wake_word_entity: data.wake_word_entity ?? null,
        wake_word_id: data.wake_word_id ?? null,
      };
      const updated = await updateAssistPipeline(
        this.hass,
        this._pipeline.id,
        values
      );
      this._pipeline = updated;
      this._data = { ...updated };
      this._initDirtyTracking({ type: "deep" }, this._data);
    } catch (err: any) {
      this._error = err?.message || "Unknown error";
    } finally {
      this._saving = false;
    }
  }

  private async _makePreferred() {
    if (!this._pipeline) {
      return;
    }
    try {
      await setAssistPipelinePreferred(this.hass, this._pipeline.id);
      this._preferred = this._pipeline.id;
    } catch (err: any) {
      showErrorToast(
        this,
        this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.page.preferred_failed"
        ),
        err?.message
      );
    }
  }

  private async _delete() {
    const pipeline = this._pipeline;
    if (!pipeline) {
      return;
    }
    if (this._preferred === pipeline.id) {
      showAlertDialog(this, {
        text: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.error_preferred"
        ),
      });
      return;
    }
    if (
      !(await showConfirmationDialog(this, {
        title: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_title",
          { name: pipeline.name }
        ),
        text: this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.delete.confirm_text",
          { name: pipeline.name }
        ),
        confirmText: this.hass.localize("ui.common.delete"),
        destructive: true,
      }))
    ) {
      return;
    }
    try {
      await deleteAssistPipeline(this.hass, pipeline.id);
      this._markDirtyStateClean();
      navigate("/config/voice-assistants/assistants", { replace: true });
    } catch (err: any) {
      showErrorToast(
        this,
        this.hass.localize(
          "ui.panel.config.voice_assistants.assistants.pipeline.page.delete_failed"
        ),
        err?.message
      );
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .page {
          box-sizing: border-box;
          max-width: 1100px;
          margin: 0 auto;
          padding: var(--ha-space-4) var(--ha-space-8) var(--ha-space-8);
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-4);
        }
        :host([narrow]) .page {
          padding: var(--ha-space-2) var(--ha-space-3) var(--ha-space-6);
        }
        .steps {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: var(--ha-space-4);
          counter-reset: step;
        }
        .step {
          position: relative;
          display: block;
        }
        .step::before {
          content: attr(data-step);
          position: absolute;
          top: calc(var(--ha-space-2) * -1);
          inset-inline-start: var(--ha-space-4);
          z-index: 1;
          min-width: 24px;
          height: 24px;
          box-sizing: border-box;
          padding: 0 var(--ha-space-2);
          border-radius: var(--ha-border-radius-pill, 12px);
          background: var(--primary-color);
          color: var(--text-primary-color, #fff);
          font-size: var(--ha-font-size-s);
          font-weight: var(--ha-font-weight-medium);
          line-height: 24px;
          text-align: center;
        }
        .try {
          padding: var(--ha-space-5) var(--ha-space-6);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--card-background-color);
        }
        .try h3 {
          margin: 0 0 var(--ha-space-3);
          font-size: var(--ha-font-size-xl);
          font-weight: var(--ha-font-weight-medium);
        }
        .try-row {
          display: flex;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .try-row ha-input {
          flex: 1;
        }
        .try-result {
          display: grid;
          grid-template-columns: auto 1fr;
          gap: var(--ha-space-2) var(--ha-space-4);
          margin: var(--ha-space-3) 0;
        }
        .try-result dt {
          color: var(--secondary-text-color);
        }
        .try-result dd {
          margin: 0;
          text-align: end;
          font-weight: var(--ha-font-weight-medium);
        }
        .try-result dd.failed {
          color: var(--error-color);
        }
        .footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: var(--ha-space-2);
        }
        .spacer {
          flex: 1;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-config-voice-assistants-pipeline": HaConfigVoiceAssistantsPipeline;
  }
}
