import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import { formatLanguageCode } from "../../common/language/format_language";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-select-box";
import type { SelectBoxOption } from "../../components/ha-select-box";
import type { AssistSatelliteConfiguration } from "../../data/assist_satellite";
import type { LanguageScore, LanguageScores } from "../../data/conversation";
import { getLanguageScores } from "../../data/conversation";
import type { HomeAssistant, ValueChangedEvent } from "../../types";
import { documentationUrl } from "../../util/documentation-url";
import { AssistantSetupStyles } from "./styles";
import { STEP } from "./voice-assistant-setup-dialog";

const OPTIONS = ["focused_local", "full_local"] as const;

const EMPTY_SCORE: LanguageScore = {
  cloud: 0,
  focused_local: 0,
  full_local: 0,
};

@customElement("ha-voice-assistant-setup-step-pipeline")
export class HaVoiceAssistantSetupStepPipeline extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false })
  public assistConfiguration?: AssistSatelliteConfiguration;

  @property({ attribute: false }) public deviceId!: string;

  @property({ attribute: false }) public assistEntityId?: string;

  @property({ attribute: false }) public language?: string;

  @property({ attribute: false }) public languages: string[] = [];

  @state() private _value?: (typeof OPTIONS)[number];

  @state() private _languageScores?: LanguageScores;

  protected override willUpdate(changedProperties: PropertyValues): void {
    super.willUpdate(changedProperties);

    if (!this.hasUpdated) {
      this._fetchData();
    }

    if (
      (changedProperties.has("language") ||
        changedProperties.has("_languageScores")) &&
      this.language &&
      this._languageScores
    ) {
      const lang = this.language;
      if (this._value && this._languageScores[lang]?.[this._value] === 0) {
        this._value = undefined;
      }
      if (!this._value) {
        this._value = this._getOptions(
          this._languageScores[lang] || EMPTY_SCORE,
          this.hass.localize
        ).supportedOptions[0]?.value as
          "focused_local" | "full_local" | undefined;
      }
    }
  }

  private _getOptions = memoizeOne((score, localize: LocalizeFunc) => {
    const supportedOptions: SelectBoxOption[] = [];
    const unsupportedOptions: SelectBoxOption[] = [];

    OPTIONS.forEach((option) => {
      if (score[option] > 0) {
        supportedOptions.push({
          label: localize(
            `ui.panel.config.voice_assistants.satellite_wizard.pipeline.options.${option}.label`
          ),
          description: localize(
            `ui.panel.config.voice_assistants.satellite_wizard.pipeline.options.${option}.description`
          ),
          value: option,
        });
      } else {
        unsupportedOptions.push({
          label: localize(
            `ui.panel.config.voice_assistants.satellite_wizard.pipeline.options.${option}.label`
          ),
          value: option,
        });
      }
    });

    return { supportedOptions, unsupportedOptions };
  });

  protected override render() {
    if (!this._languageScores) {
      return nothing;
    }

    if (!this.language) {
      const language = formatLanguageCode(
        this.hass.config.language,
        this.hass.locale
      );
      return html`<div class="content">
        <h1>
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.satellite_wizard.pipeline.unsupported_language.header"
          )}
        </h1>
        ${this.hass.localize(
          "ui.panel.config.voice_assistants.satellite_wizard.pipeline.unsupported_language.secondary",
          { language }
        )}
        <ha-language-picker
          .label=${this.hass.localize(
            "ui.panel.config.voice_assistants.satellite_wizard.pipeline.unsupported_language.language_picker"
          )}
          .languages=${this.languages}
          @value-changed=${this._languageChanged}
        ></ha-language-picker>

        <a
          href=${documentationUrl(
            this.hass,
            "/voice_control/contribute-voice/"
          )}
          >${this.hass.localize(
            "ui.panel.config.voice_assistants.satellite_wizard.pipeline.unsupported_language.contribute",
            { language }
          )}</a
        >
      </div>`;
    }

    const score = this._languageScores[this.language] || EMPTY_SCORE;

    const options = this._getOptions(score, this.hass.localize);

    const performance = !this._value
      ? ""
      : this._value === "full_local"
        ? "low"
        : "high";

    const commands = !this._value
      ? ""
      : score[this._value] > 2
        ? "high"
        : score[this._value] > 1
          ? "ready"
          : score[this._value] > 0
            ? "low"
            : "";

    return html`<div class="content">
        <h1>
          ${this.hass.localize(
            "ui.panel.config.voice_assistants.satellite_wizard.pipeline.title"
          )}
        </h1>
        <div class="bar-header">
          <span
            >${this.hass.localize(
              "ui.panel.config.voice_assistants.satellite_wizard.pipeline.performance.header"
            )}</span
          ><span
            >${
              !performance
                ? ""
                : this.hass.localize(
                    `ui.panel.config.voice_assistants.satellite_wizard.pipeline.performance.${performance}`
                  )
            }</span
          >
        </div>
        <div class="perf-bar ${performance}">
          <div class="segment"></div>
          <div class="segment"></div>
          <div class="segment"></div>
        </div>
        <div class="bar-header">
          <span
            >${this.hass.localize(
              "ui.panel.config.voice_assistants.satellite_wizard.pipeline.commands.header"
            )}</span
          ><span
            >${
              !commands
                ? ""
                : this.hass.localize(
                    `ui.panel.config.voice_assistants.satellite_wizard.pipeline.commands.${commands}`
                  )
            }</span
          >
        </div>
        <div class="perf-bar ${commands}">
          <div class="segment"></div>
          <div class="segment"></div>
          <div class="segment"></div>
        </div>
        ${
          options.supportedOptions.length
            ? html`<ha-select-box
                max_columns="1"
                .options=${options.supportedOptions}
                .value=${this._value}
                @value-changed=${this._valueChanged}
              ></ha-select-box>`
            : html`<p class="no-local-engine">
                ${this.hass.localize(
                  "ui.panel.config.voice_assistants.satellite_wizard.pipeline.no_local_engine"
                )}
              </p>`
        }
        ${
          options.unsupportedOptions.length
            ? html`<h3>
                  ${this.hass.localize(
                    "ui.panel.config.voice_assistants.satellite_wizard.pipeline.unsupported"
                  )}
                </h3>
                <ha-select-box
                  max_columns="1"
                  .options=${options.unsupportedOptions}
                  disabled
                ></ha-select-box>`
            : nothing
        }
      </div>
      <div class="footer">
        <ha-button @click=${this._createPipeline} .disabled=${!this._value}
          >${this.hass.localize("ui.common.next")}</ha-button
        >
      </div>`;
  }

  private async _fetchData() {
    this._languageScores = (await getLanguageScores(this.hass)).languages;
  }

  private _valueChanged(
    ev: ValueChangedEvent<(typeof OPTIONS)[number] | undefined>
  ) {
    this._value = ev.detail.value;
  }

  private _createPipeline() {
    if (this._value === "focused_local") {
      this._setupLocalFocused();
    } else {
      this._setupLocalFull();
    }
  }

  private _setupLocalFocused() {
    fireEvent(this, "next-step", { step: STEP.LOCAL, option: this._value });
  }

  private _setupLocalFull() {
    fireEvent(this, "next-step", { step: STEP.LOCAL, option: this._value });
  }

  private _languageChanged(ev: ValueChangedEvent<string | undefined>) {
    if (!ev.detail.value) {
      return;
    }
    fireEvent(this, "language-changed", { value: ev.detail.value });
  }

  static styles = [
    AssistantSetupStyles,
    css`
      :host {
        text-align: left;
      }
      .perf-bar {
        width: 100%;
        height: 10px;
        display: flex;
        gap: var(--ha-space-1);
        margin: 8px 0;
      }
      .segment {
        flex-grow: 1;
        background-color: var(--disabled-color);
        transition: background-color 0.3s;
      }
      .segment:first-child {
        border-radius: var(--ha-border-radius-sm) var(--ha-border-radius-square)
          var(--ha-border-radius-square) var(--ha-border-radius-sm);
      }
      .segment:last-child {
        border-radius: var(--ha-border-radius-square) var(--ha-border-radius-sm)
          var(--ha-border-radius-sm) var(--ha-border-radius-square);
      }
      .perf-bar.high .segment {
        background-color: var(--success-color);
      }
      .perf-bar.ready .segment:nth-child(-n + 2) {
        background-color: var(--warning-color);
      }
      .perf-bar.low .segment:nth-child(1) {
        background-color: var(--error-color);
      }
      .bar-header {
        display: flex;
        justify-content: space-between;
        margin: 8px 0;
        margin-top: 16px;
      }
      ha-select-box {
        display: block;
      }
      ha-select-box:first-of-type {
        margin-top: 32px;
      }
      .no-local-engine {
        margin-top: 32px;
      }
      .footer {
        margin-top: 16px;
      }
      ha-language-picker {
        display: block;
        margin-top: 16px;
        margin-bottom: 16px;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-voice-assistant-setup-step-pipeline": HaVoiceAssistantSetupStepPipeline;
  }
}
