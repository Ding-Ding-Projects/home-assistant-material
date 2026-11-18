import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { fireEvent } from "../../common/dom/fire_event";
import type { HaFormSchema } from "../ha-form/types";
import type { HomeAssistant } from "../../types";
import "../action-editors/ha-action-quick-controls";
import "../ha-form/ha-form";
import { resolveDeviceEditor } from "./index";
import { deviceControls } from "./devices/shared";
import type { DeviceAutomationKind, QuickControl } from "./types";

interface DeviceConfig {
  domain?: string;
  type?: string;
  entity_id?: string;
  [key: string]: unknown;
}

/**
 * The extra fields of a device trigger, condition or action. Fields an
 * integration's tailored editor describes get their own controls; every
 * other field the backend reports stays in the generic form, so nothing the
 * backend asks for is ever hidden.
 */
@customElement("ha-device-extra-fields")
export class HaDeviceExtraFields extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public kind: DeviceAutomationKind = "trigger";

  @property({ attribute: false }) public config!: DeviceConfig;

  @property({ attribute: false }) public schema: HaFormSchema[] = [];

  @property({ attribute: false }) public data: Record<string, unknown> = {};

  @property({ attribute: false }) public computeLabel?: (schema: any) => string;

  @property({ attribute: false }) public computeHelper?: (
    schema: any
  ) => string | undefined;

  @property({ type: Boolean }) public disabled = false;

  private _controls(): QuickControl[] {
    const entry = resolveDeviceEditor(this.kind, this.config?.domain);
    if (!entry) return [];
    const names = new Set(this.schema.map((item) => item.name));
    const entityId = this.config?.entity_id;
    const state = entityId ? this.hass.states[entityId] : undefined;
    return deviceControls(entry, {
      kind: this.kind,
      domain: this.config.domain!,
      type: this.config.type,
      data: this.data,
      entities: state
        ? [
            {
              entity_id: state.entity_id,
              state: state.state,
              attributes: state.attributes,
            },
          ]
        : [],
    }).filter((control) => names.has(control.key));
  }

  protected render() {
    const controls = this._controls();
    const claimed = new Set(controls.map((control) => control.key));
    const rest = this.schema.filter((item) => !claimed.has(item.name));
    return html`
      ${
        controls.length
          ? html`<ha-action-quick-controls
              .hass=${this.hass}
              .controls=${controls}
              .fieldLabels=${Object.fromEntries(
                controls
                  .map((control) => [
                    control.key,
                    this.computeLabel?.({ name: control.key }),
                  ])
                  .filter(([key, label]) => label && label !== key)
              )}
              .disabled=${this.disabled}
              @quick-control-changed=${this._quickChanged}
            ></ha-action-quick-controls>`
          : nothing
      }
      ${
        rest.length
          ? html`<ha-form
              .hass=${this.hass}
              .data=${this.data}
              .schema=${rest}
              .disabled=${this.disabled}
              .computeLabel=${this.computeLabel}
              .computeHelper=${this.computeHelper}
              @value-changed=${this._formChanged}
            ></ha-form>`
          : nothing
      }
    `;
  }

  private _quickChanged(ev: CustomEvent<{ key: string; value: unknown }>) {
    ev.stopPropagation();
    if (this.disabled) return;
    fireEvent(this, "value-changed", {
      value: { ...this.data, [ev.detail.key]: ev.detail.value },
    });
  }

  private _formChanged(ev: CustomEvent<{ value: Record<string, unknown> }>) {
    ev.stopPropagation();
    fireEvent(this, "value-changed", {
      value: { ...this.data, ...ev.detail.value },
    });
  }

  static styles = css`
    :host {
      display: block;
      margin-top: var(--ha-space-4);
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-device-extra-fields": HaDeviceExtraFields;
  }
}
