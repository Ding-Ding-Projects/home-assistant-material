import type { CSSResultGroup } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property } from "lit/decorators";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import "../../../../components/ha-alert";
import "../../../../components/ha-svg-icon";
import "../../../../components/ha-switch";
import type { ManualAutomationConfig } from "../../../../data/automation";
import { haStyle } from "../../../../resources/styles";
import type { AutomationToolContext } from "./registry";
import { stepKindIcon } from "./step-icons";
import { isDisabled, listSteps, stepDetail, stepTitle } from "./step-model";
import { setStepEnabled } from "./step-toggle";

@customElement("ha-automation-tool-steps")
export class HaAutomationToolSteps extends LitElement {
  @property({ attribute: false }) public context!: AutomationToolContext;

  private _t(key: string, vars?: Record<string, string | number>) {
    return this.context.hass.localize(
      `ui.panel.config.automation.editor.tools.steps.${key}` as any,
      vars as any
    );
  }

  protected render() {
    const steps = listSteps(this.context.config);
    const off = steps.filter((s) => isDisabled(s.raw)).length;
    return html`
      <ha-alert alert-type="info">${this._t("honest")}</ha-alert>
      <p class="summary">
        ${
          steps.length
            ? this._t("summary", { off, total: steps.length })
            : this._t("empty")
        }
      </p>
      <ul class="steps">
        ${steps.map((step) => {
          const disabled = isDisabled(step.raw);
          const detail = stepDetail(step);
          return html`<li
            class=${classMap({ step: true, disabled })}
            style=${styleMap({ "--depth": String(step.depth) })}
          >
            <ha-svg-icon .path=${stepKindIcon(step.kind)}></ha-svg-icon>
            <span class="text">
              <span class="label">
                <span class="role">${this._t(`section.${step.section}`)}</span>
                ${stepTitle(step)}
              </span>
              ${detail ? html`<span class="hint">${detail}</span>` : ""}
            </span>
            <ha-switch
              .checked=${!disabled}
              .disabled=${!this.context.applyConfig}
              aria-label=${this._t("switch_label", { step: stepTitle(step) })}
              .stepPath=${step.path}
              @change=${this._toggle}
            ></ha-switch>
          </li>`;
        })}
      </ul>
    `;
  }

  private _toggle(ev: Event) {
    const target = ev.currentTarget as HTMLInputElement & { stepPath: string };
    const next = setStepEnabled(
      this.context.config,
      target.stepPath,
      target.checked
    );
    if (next) {
      this.context.applyConfig?.(next as ManualAutomationConfig);
    }
  }

  static get styles(): CSSResultGroup {
    return [
      haStyle,
      css`
        .summary {
          font-weight: var(--ha-font-weight-semibold);
          margin: var(--ha-space-3) 0;
        }
        .steps {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: var(--ha-space-2);
        }
        .step {
          display: flex;
          align-items: center;
          gap: var(--ha-space-3);
          padding: var(--ha-space-2) var(--ha-space-3);
          margin-inline-start: calc(var(--depth, 0) * var(--ha-space-5));
          border-radius: var(--ha-border-radius-xl);
          border: 1px solid var(--ha-color-outline, var(--divider-color));
          background: var(
            --ha-color-surface-tone-1,
            var(--secondary-background-color)
          );
        }
        .step.disabled {
          opacity: 0.55;
        }
        .text {
          flex: 1;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .role {
          font-size: var(--ha-font-size-xs);
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--secondary-text-color);
          margin-inline-end: var(--ha-space-2);
        }
        .hint {
          color: var(--secondary-text-color);
          font-size: var(--ha-font-size-s);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-tool-steps": HaAutomationToolSteps;
  }
}
