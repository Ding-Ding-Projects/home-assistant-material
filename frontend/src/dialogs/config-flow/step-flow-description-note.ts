import { mdiLightbulbOnOutline } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../components/ha-button";
import "../../components/ha-svg-icon";
import { helpPathForIntegration } from "../../components/help/help-bundle-logic";
import { loadHelpIntegrationDomains } from "../../components/help/help-integrations";
import { openHelpArticle } from "../../components/help/open-help-article";
import type { HomeAssistant } from "../../types";

/**
 * The description the integration gives for a setup step, shown as a tinted
 * note above the first field. When the offline help has an article for the
 * integration, a button opens it in the reader.
 */
@customElement("step-flow-description-note")
export class StepFlowDescriptionNote extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  /** The integration domain the flow belongs to. */
  @property() public domain?: string;

  @state() private _helpPath?: string;

  protected willUpdate(changed: Map<PropertyKey, unknown>): void {
    if (changed.has("domain")) {
      this._helpPath = undefined;
      this._findHelp();
    }
  }

  private async _findHelp(): Promise<void> {
    const domain = this.domain;
    if (!domain) {
      return;
    }
    const available = await loadHelpIntegrationDomains();
    if (domain === this.domain) {
      this._helpPath = helpPathForIntegration(domain, available);
    }
  }

  private _openHelp(): void {
    if (this._helpPath) {
      openHelpArticle(this, this._helpPath);
    }
  }

  protected render() {
    return html`<div class="note">
      <ha-svg-icon .path=${mdiLightbulbOnOutline}></ha-svg-icon>
      <div class="body">
        <slot></slot>
        ${
          this._helpPath
            ? html`<ha-button
                size="s"
                appearance="plain"
                @click=${this._openHelp}
                >${this.hass.localize(
                  "ui.panel.config.integrations.config_flow.read_help_article"
                )}</ha-button
              >`
            : nothing
        }
      </div>
    </div>`;
  }

  static styles = css`
    :host {
      display: block;
      margin-bottom: var(--ha-space-3);
    }
    .note {
      display: flex;
      gap: var(--ha-space-3);
      align-items: flex-start;
      padding: var(--ha-space-3) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl, 16px);
      background: var(
        --ha-color-tertiary-container,
        var(--secondary-background-color)
      );
      color: var(--ha-color-on-tertiary-container, var(--primary-text-color));
    }
    ha-svg-icon {
      flex: none;
      margin-top: var(--ha-space-1);
    }
    .body {
      min-width: 0;
      overflow-wrap: anywhere;
    }
    ::slotted(*) {
      margin: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "step-flow-description-note": StepFlowDescriptionNote;
  }
}
