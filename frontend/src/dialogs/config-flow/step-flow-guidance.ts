import { mdiOpenInNew } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import "../../components/ha-button";
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

/** The integration whose note was opened last; it stays open for that setup. */
let openedFor: string | undefined;

/**
 * A short, collapsed note about the current step of a setup flow: what the
 * step is for, what to have ready, and where the documentation is. It is one
 * row until opened. Opened, it is a sheet over the form, so the form never
 * moves. Steps with no guidance show no row at all.
 */
@customElement("step-flow-guidance")
export class StepFlowGuidance extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public manifest?: IntegrationManifest;

  @property({ attribute: false }) public stepType?: string;

  @state() private _open = false;

  public connectedCallback() {
    super.connectedCallback();
    this._open = openedFor !== undefined && openedFor === this.manifest?.domain;
  }

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

  private _toggle() {
    this._open = !this._open;
    openedFor = this._open ? this.manifest?.domain : undefined;
  }

  private _close() {
    this._open = false;
    openedFor = undefined;
  }

  private _keydown(ev: KeyboardEvent) {
    if (ev.key === "Escape" && this._open) {
      ev.stopPropagation();
      this._close();
    }
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
    return html`
      <button
        type="button"
        class="summary"
        aria-expanded=${this._open ? "true" : "false"}
        aria-controls="note"
        @click=${this._toggle}
      >
        ${this._l("title")}
      </button>
      ${
        this._open
          ? html`<div class="scrim" @click=${this._close}></div>
              <div
                id="note"
                class="note"
                role="dialog"
                aria-label=${this._l("title")}
                @keydown=${this._keydown}
              >
                <h3>${this._l("title")}</h3>
                <p>
                  <strong>${this._l("what_for")}</strong>
                  ${this._l(stepKey, { name: manifest.name })}
                </p>
                ${
                  prerequisite
                    ? html`<p>
                        <strong>${this._l("needed_first")}</strong>
                        ${prerequisite}
                      </p>`
                    : nothing
                }
                ${
                  docLink
                    ? html`<a
                        href=${docLink}
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        ${this._l("documentation")}
                        <span class="sr-only">${this._l("opens_new_tab")}</span>
                        <ha-svg-icon .path=${mdiOpenInNew}></ha-svg-icon>
                      </a>`
                    : nothing
                }
                <div class="close">
                  <ha-button appearance="plain" @click=${this._close}
                    >${this._l("close")}</ha-button
                  >
                </div>
              </div>`
          : nothing
      }
    `;
  }

  static styles = css`
    :host {
      display: block;
      margin: 0 var(--ha-space-6) var(--ha-space-2);
      color: var(--secondary-text-color);
      font-size: var(--ha-font-size-s);
    }
    .summary {
      display: flex;
      align-items: center;
      width: 100%;
      min-height: 44px;
      border: 0;
      background: none;
      font: inherit;
      color: inherit;
      text-align: start;
      cursor: pointer;
    }
    .summary:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
    .scrim {
      position: fixed;
      inset: 0;
      background: var(--mdc-dialog-scrim-color, rgba(0, 0, 0, 0.32));
      z-index: 10;
    }
    .note {
      position: fixed;
      inset-inline: 0;
      bottom: 0;
      z-index: 11;
      max-height: 70vh;
      overflow: auto;
      box-sizing: border-box;
      padding: var(--ha-space-4) var(--ha-space-6) var(--ha-space-6);
      background: var(--card-background-color);
      color: var(--primary-text-color);
      border-radius: var(--ha-border-radius-xl, 24px)
        var(--ha-border-radius-xl, 24px) 0 0;
      box-shadow: var(--ha-box-shadow-l, 0 4px 16px rgba(0, 0, 0, 0.3));
    }
    @media (min-width: 900px) {
      .note {
        inset-inline-start: auto;
        inset-inline-end: var(--ha-space-4);
        bottom: var(--ha-space-4);
        width: 280px;
        border-radius: var(--ha-border-radius-xl, 24px);
      }
    }
    h3 {
      margin: 0 0 var(--ha-space-2);
      font-size: var(--ha-font-size-l);
    }
    p {
      margin: var(--ha-space-1) 0;
    }
    a {
      color: var(--primary-color);
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-1);
      min-height: 44px;
    }
    .close {
      display: flex;
      justify-content: flex-end;
    }
    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
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
