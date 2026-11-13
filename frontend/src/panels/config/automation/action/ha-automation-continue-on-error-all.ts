import type { CSSResultGroup } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import "../../../../components/ha-switch";
import type { HaSwitch } from "../../../../components/ha-switch";
import type { HomeAssistant } from "../../../../types";
import {
  continueOnErrorState,
  countContinueOnErrorActions,
  setContinueOnErrorAll,
} from "./continue-on-error-all";

/**
 * One switch that turns "Continue on error" on or off for every action of a
 * list, nested actions included, so it does not have to be done one by one.
 * It fires `value-changed` with the new list of actions, the same event the
 * list itself fires, so the editor handles it like any other edit.
 */
@customElement("ha-automation-continue-on-error-all")
export class HaAutomationContinueOnErrorAll extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public actions: unknown;

  @property({ type: Boolean }) public disabled = false;

  protected render() {
    if (!countContinueOnErrorActions(this.actions)) {
      return nothing;
    }
    const state = continueOnErrorState(this.actions);
    const t = (key: string) =>
      this.hass.localize(
        `ui.panel.config.automation.editor.actions.${key}` as any
      );
    return html`
      <label class="row">
        <span class="text">
          <span class="label">
            ${t("continue_on_error_all")}
            ${
              state === "mixed"
                ? html`<span class="mixed" role="status"
                    >${t("continue_on_error_all_mixed")}</span
                  >`
                : nothing
            }
          </span>
          <span class="help">${t("continue_on_error_all_help")}</span>
        </span>
        <ha-switch
          .checked=${state === "all"}
          .disabled=${this.disabled}
          aria-label=${t("continue_on_error_all")}
          @change=${this._toggled}
        ></ha-switch>
      </label>
    `;
  }

  private _toggled(ev: Event) {
    ev.stopPropagation();
    const on = (ev.target as HaSwitch).checked;
    fireEvent(this, "value-changed", {
      value: setContinueOnErrorAll(this.actions, on),
    });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
    }
    .row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--ha-space-3);
      margin-bottom: var(--ha-space-3);
    }
    .text {
      display: flex;
      flex-direction: column;
      min-width: 0;
      gap: var(--ha-space-1);
    }
    .label {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .help {
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      overflow-wrap: anywhere;
    }
    .mixed {
      margin-inline-start: var(--ha-space-2);
      padding: 0 var(--ha-space-2);
      border-radius: var(--ha-border-radius-pill, 999px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
      font-weight: var(--ha-font-weight-normal);
    }
    ha-switch {
      flex: none;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-continue-on-error-all": HaAutomationContinueOnErrorAll;
  }
}
