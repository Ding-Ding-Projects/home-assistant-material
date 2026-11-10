import { mdiOpenInNew } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../components/ha-svg-icon";
import type { IntegrationManifest } from "../../data/integration";
import { documentationUrl } from "../../util/documentation-url";
import type { HomeAssistant } from "../../types";

const STEP_KEYS: Record<string, string> = {
  form: "step_form",
  menu: "step_menu",
  external: "step_external",
  progress: "step_progress",
  data_entry_flow_progressed: "step_progress",
};

/**
 * A short, collapsed note about the current step of a setup flow: what the
 * step is for, what to have ready, and where the documentation is.
 */
@customElement("step-flow-guidance")
export class StepFlowGuidance extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public manifest?: IntegrationManifest;

  @property({ attribute: false }) public stepType?: string;

  private _l(key: string, values?: Record<string, string>): string {
    return this.hass.localize(
      `ui.panel.config.integrations.config_flow.guidance.${key}` as any,
      values
    );
  }

  private _prerequisite(manifest: IntegrationManifest): string | undefined {
    const iotClass = manifest.iot_class;
    if (iotClass?.startsWith("cloud")) {
      return this._l("needs_cloud", { name: manifest.name });
    }
    if (iotClass?.startsWith("local")) {
      return this._l("needs_local", { name: manifest.name });
    }
    return undefined;
  }

  protected render() {
    const manifest = this.manifest;
    const stepKey = this.stepType ? STEP_KEYS[this.stepType] : undefined;
    if (!manifest || !stepKey) {
      return nothing;
    }
    const docLink = manifest.is_built_in
      ? documentationUrl(this.hass, `/integrations/${manifest.domain}`)
      : manifest.documentation;
    const prerequisite = this._prerequisite(manifest);
    return html`<details>
      <summary>${this._l("title")}</summary>
      <p>${this._l(stepKey, { name: manifest.name })}</p>
      ${prerequisite ? html`<p>${prerequisite}</p>` : nothing}
      ${
        docLink
          ? html`<a href=${docLink} target="_blank" rel="noreferrer noopener">
              ${this._l("documentation")}
              <ha-svg-icon .path=${mdiOpenInNew}></ha-svg-icon>
            </a>`
          : nothing
      }
    </details>`;
  }

  static styles = css`
    details {
      margin: 0 var(--ha-space-6) var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    summary {
      cursor: pointer;
      padding: var(--ha-space-1) 0;
    }
    summary:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    p {
      margin: var(--ha-space-1) 0;
    }
    a {
      color: var(--primary-color);
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
    }
    ha-svg-icon {
      --mdc-icon-size: 16px;
      width: 16px;
      height: 16px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "step-flow-guidance": StepFlowGuidance;
  }
}
