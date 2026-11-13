import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import { copyToClipboard } from "../../../../common/util/copy-clipboard";
import "../../../../components/ha-alert";
import "../../../../components/ha-button";
import "../../../../components/ha-textarea";
import type { ManualAutomationConfig } from "../../../../data/automation";
import { haStyle } from "../../../../resources/styles";
import type { DraftResult, LanguageContext, Line } from "./language";
import { describeAutomation, draftFromSentence, toSentence } from "./language";
import type { AutomationToolContext } from "./registry";
import { asList } from "./step-model";

@customElement("ha-automation-tool-language")
export class HaAutomationToolLanguage extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  @state() private _sentence = "";

  @state() private _draft?: DraftResult;

  @state() private _copied = false;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.language.${key}` as any,
      vars as any
    );
  }

  private get _lang(): LanguageContext {
    const { hass } = this.context;
    return {
      t: (key, values) => this._t(key, values),
      name: (id) =>
        (hass.states[id]?.attributes?.friendly_name as string | undefined) ??
        id,
    };
  }

  protected render() {
    const lang = this._lang;
    const lines = describeAutomation(this.context.config, lang);
    return html`
      <div class="grid">
        <section class="card">
          <h3>${this._t("to_sentence")}</h3>
          ${
            lines.length
              ? html`<p class="sentence">${toSentence(lines, lang)}</p>
                  <ul class="lines">
                    ${lines.map(
                      (line) =>
                        html`<li
                          class=${classMap({ line: true, [line.role]: true })}
                          style=${styleMap({ "--depth": String(line.depth) })}
                        >
                          <span class="role"
                            >${this._t(`role.${line.role}`)}</span
                          >
                          ${line.text}
                        </li>`
                    )}
                  </ul>
                  <ha-button appearance="plain" @click=${this._copy}>
                    ${this._copied ? this._t("copied") : this._t("copy")}
                  </ha-button>`
              : html`<p class="hint">${this._t("empty")}</p>`
          }
        </section>
        <section class="card">
          <h3>${this._t("to_draft")}</h3>
          <p class="hint">${this._t("patterns")}</p>
          <ul class="hint patterns">
            <li>${this._t("pattern_state")}</li>
            <li>${this._t("pattern_time")}</li>
          </ul>
          <ha-textarea
            .label=${this._t("sentence_label")}
            .value=${this._sentence}
            resize="auto"
            @input=${this._input}
          ></ha-textarea>
          <ha-button
            @click=${this._makeDraft}
            .disabled=${!this._sentence.trim()}
          >
            ${this._t("draft")}
          </ha-button>
          ${this._renderDraft(lang)}
        </section>
      </div>
    `;
  }

  private _renderDraft(lang: LanguageContext) {
    const draft = this._draft;
    if (!draft) {
      return nothing;
    }
    if (!draft.config) {
      return html`<ha-alert alert-type="warning">
        ${
          draft.problem === "unknown_entity"
            ? this._t("unknown_entity", { text: draft.unknown ?? "" })
            : this._t("no_pattern")
        }
      </ha-alert>`;
    }
    const lines = describeAutomation(draft.config, lang);
    return html`<p class="sentence">${toSentence(lines, lang)}</p>
      <ha-button .disabled=${!this.context.applyConfig} @click=${this._apply}
        >${this._t("use_draft")}</ha-button
      >
      <p class="hint">${this._t("use_draft_hint")}</p>`;
  }

  private _input(ev: Event) {
    this._sentence = (ev.target as HTMLTextAreaElement).value ?? "";
    this._draft = undefined;
  }

  private _makeDraft() {
    const { hass } = this.context;
    const entities = Object.keys(hass.states).map((id) => ({
      id,
      name: (hass.states[id].attributes.friendly_name as string) ?? id,
    }));
    this._draft = draftFromSentence(this._sentence, entities);
  }

  private _apply() {
    const draft = this._draft?.config;
    const { config, applyConfig } = this.context;
    if (!draft || !applyConfig) {
      return;
    }
    const next: ManualAutomationConfig = {
      ...config,
      alias: config.alias || draft.alias,
      triggers: [
        ...asList(config.triggers ?? config.trigger),
        ...draft.triggers,
      ] as ManualAutomationConfig["triggers"],
      actions: [
        ...asList(config.actions ?? config.action),
        ...draft.actions,
      ] as ManualAutomationConfig["actions"],
    };
    delete next.trigger;
    delete next.action;
    applyConfig(next);
    this._draft = undefined;
    this._sentence = "";
  }

  private async _copy() {
    const lang = this._lang;
    const lines: Line[] = describeAutomation(this.context.config, lang);
    await copyToClipboard(toSentence(lines, lang));
    this._copied = true;
    setTimeout(() => {
      this._copied = false;
    }, 2000);
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .grid {
          display: grid;
          grid-template-columns: repeat(
            auto-fit,
            minmax(min(100%, 320px), 1fr)
          );
          gap: var(--ha-space-4);
        }
        .card {
          padding: var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-3);
          align-items: flex-start;
        }
        .card > * {
          max-width: 100%;
        }
        h3 {
          margin: 0;
        }
        .sentence {
          margin: 0;
          font-size: var(--ha-font-size-l);
          line-height: 1.5;
        }
        .hint {
          margin: 0;
          color: var(--secondary-text-color);
        }
        .patterns {
          margin: 0;
          padding-inline-start: var(--ha-space-5);
        }
        ha-textarea {
          width: 100%;
        }
        .lines {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-1);
        }
        .line {
          padding-inline-start: calc(var(--depth, 0) * var(--ha-space-4));
        }
        .role {
          display: inline-block;
          min-width: 72px;
          font-size: var(--ha-font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--secondary-text-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-language": HaAutomationToolLanguage;
  }
}
