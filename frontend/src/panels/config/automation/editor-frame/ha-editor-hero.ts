import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import {
  describeCondition,
  describeTrigger,
} from "../../../../data/automation_i18n";
import { describeAction } from "../../../../data/script_i18n";
import type { HomeAssistant } from "../../../../types";
import type {
  SentenceConfig,
  SentenceDescribers,
  SentenceParts,
} from "./automation-sentence";
import {
  buildSentenceParts,
  heroText,
  isDescribeError,
} from "./automation-sentence";

const PREFIX = "ui.panel.config.automation.editor.frame.";

declare global {
  interface HTMLElementTagNameMap {
    "ha-editor-hero": HaEditorHero;
  }
}

/**
 * The tonal block on top of the editors that says what the automation or
 * script does as one sentence. When nothing can be described it shows the
 * name only, never an error text.
 */
@customElement("ha-editor-hero")
export class HaEditorHero extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public config?: SentenceConfig;

  private _parts = memoizeOne(
    (
      config: SentenceConfig | undefined,
      hass: HomeAssistant
    ): SentenceParts => {
      const guard =
        (key: string, run: (item: any) => string) => (item: any) => {
          const text = run(item);
          const prefix = hass.localize(key as any, { error: "" });
          if (isDescribeError(text, prefix)) {
            throw new Error("not describable");
          }
          return text;
        };
      const describers: SentenceDescribers = {
        trigger: guard(
          "ui.panel.config.automation.editor.triggers.describe_error",
          (item) => describeTrigger(item, hass, [])
        ),
        condition: guard(
          "ui.panel.config.automation.editor.conditions.describe_error",
          (item) => describeCondition(item, hass, [])
        ),
        action: guard(
          "ui.panel.config.automation.editor.actions.describe_error",
          (item) => describeAction(hass, [], item)
        ),
      };
      return buildSentenceParts(config, describers);
    }
  );

  private _compose = (parts: SentenceParts): string => {
    const t = this.hass.localize;
    const and = t(`${PREFIX}join_and`);
    const join = (list: string[]) => list.join(and);
    // A trigger description may already begin with the word the sentence
    // adds ("When the sun sets"); drop the duplicate, in any letter case.
    const marker = "\u0000";
    const lead = t(`${PREFIX}sentence_when`, { when: marker })
      .split(marker)[0]
      .trim()
      .toLowerCase();
    const bare = (text: string): string => {
      const trimmed = text.trim();
      if (!lead) {
        return trimmed;
      }
      const lower = trimmed.toLowerCase();
      if (
        lower.startsWith(`${lead} `) ||
        (!/[a-z]/.test(lead) && lower.startsWith(lead))
      ) {
        return trimmed.slice(lead.length).trim();
      }
      return trimmed;
    };
    const when = parts.when.length
      ? t(`${PREFIX}sentence_when`, { when: join(parts.when.map(bare)) })
      : "";
    const onlyIf = parts.onlyIf.length
      ? t(`${PREFIX}sentence_if`, { conditions: join(parts.onlyIf) })
      : "";
    const then = parts.then.length
      ? t(`${PREFIX}sentence_then`, { actions: join(parts.then) })
      : "";
    return [when, onlyIf, then].filter(Boolean).join(" ");
  };

  protected render() {
    const text = this.config
      ? heroText(
          this._parts(this.config, this.hass),
          this.config.alias,
          this._compose
        )
      : "";
    // With nothing to say the element has no box and no margin at all.
    this.toggleAttribute("hidden", !text);
    if (!text) {
      return nothing;
    }
    return html`
      <p class="label">${this.hass.localize(`${PREFIX}hero_label`)}</p>
      <p class="sentence">${text}</p>
    `;
  }

  static styles = css`
    :host([hidden]) {
      display: none;
    }
    :host {
      display: block;
      padding: var(--ha-space-5, 20px) var(--ha-space-6, 24px);
      margin-bottom: var(--ha-space-4);
      border-radius: var(--ha-border-radius-3xl, 32px);
      background: var(
        --ha-color-primary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-primary-container, var(--primary-text-color));
    }
    p {
      margin: 0;
    }
    .label {
      font-size: var(--ha-font-size-s, 0.875rem);
      font-weight: var(--ha-font-weight-medium);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.8;
    }
    .sentence {
      margin-top: var(--ha-space-2);
      font-size: var(--ha-font-size-xl, 1.375rem);
      font-weight: 700;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }
    /* Phone: a compact hero. */
    @media (max-width: 600px) {
      :host {
        padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px);
        margin-bottom: var(--ha-space-3, 12px);
        border-radius: 24px;
      }
      .label {
        font-size: 12px;
      }
      .sentence {
        margin-top: var(--ha-space-1);
        font-size: 16px;
      }
    }
  `;
}
