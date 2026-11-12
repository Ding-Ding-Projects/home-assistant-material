import type { TemplateResult } from "lit";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  PROBLEM_SETTINGS_CHANGED_EVENT,
  readProblemSettings,
  writeProblemSettings,
} from "../../common/problems/problem-settings";
import { unignoreAll } from "../../common/problems/problem-store";
import "../../components/ha-button";
import "../../components/ha-switch";
import "../../components/item/ha-row-item";
import type { HomeAssistant } from "../../types";

/**
 * @element ha-problem-detector-row
 *
 * @summary
 * Settings for the problem detector: whether problems are outlined where
 * they are, whether the outline pulses, and bringing ignored problems back.
 */
@customElement("ha-problem-detector-row")
export class HaProblemDetectorRow extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @state() private _settings = readProblemSettings();

  private _lang = new LanguageModeController(this);

  public connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener(PROBLEM_SETTINGS_CHANGED_EVENT, this._refresh);
  }

  public disconnectedCallback(): void {
    super.disconnectedCallback();
    window.removeEventListener(PROBLEM_SETTINGS_CHANGED_EVENT, this._refresh);
  }

  private _refresh = () => {
    this._settings = readProblemSettings();
  };

  private _t(key: string): string {
    return this._lang.text(this.hass.localize, key);
  }

  protected render(): TemplateResult {
    const base = "ui.problems.settings.";
    return html`
      <ha-row-item>
        <span slot="headline">${this._t(`${base}enabled`)}</span>
        <span slot="supporting-text"
          >${this._t(`${base}enabled_description`)}</span
        >
        <ha-switch
          slot="end"
          .checked=${this._settings.enabled}
          aria-label=${this._t(`${base}enabled`)}
          @change=${this._enabledChanged}
        ></ha-switch>
      </ha-row-item>
      <ha-row-item>
        <span slot="headline">${this._t(`${base}pulse`)}</span>
        <span slot="supporting-text"
          >${this._t(`${base}pulse_description`)}</span
        >
        <ha-switch
          slot="end"
          .checked=${this._settings.pulse}
          .disabled=${!this._settings.enabled}
          aria-label=${this._t(`${base}pulse`)}
          @change=${this._pulseChanged}
        ></ha-switch>
      </ha-row-item>
      <ha-row-item>
        <span slot="headline">${this._t(`${base}ignored`)}</span>
        <span slot="supporting-text"
          >${this._t(`${base}ignored_description`)}</span
        >
        <ha-button slot="end" appearance="plain" @click=${unignoreAll}
          >${this._t(`${base}show_ignored`)}</ha-button
        >
      </ha-row-item>
    `;
  }

  private _enabledChanged(ev: Event) {
    writeProblemSettings({
      enabled: (ev.target as HTMLInputElement).checked,
    });
  }

  private _pulseChanged(ev: Event) {
    writeProblemSettings({ pulse: (ev.target as HTMLInputElement).checked });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-problem-detector-row": HaProblemDetectorRow;
  }
}
