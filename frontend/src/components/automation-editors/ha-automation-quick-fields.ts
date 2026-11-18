import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import { ensureArray } from "../../common/array/ensure-array";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import { computeDomain } from "../../common/entity/compute_domain";
import { computeObjectId } from "../../common/entity/compute_object_id";
import { getTargetEntityCount } from "../../data/target";
import type { HomeAssistant } from "../../types";
import { applyControlValue } from "../action-editors/descriptors";
import "../action-editors/ha-action-quick-controls";
import "../ha-expansion-panel";
import type { AutomationControlSet } from "./index";
import { buildAutomationControls } from "./index";
import type {
  AutomationEditorContext,
  AutomationKind,
  QuickEntity,
  QuickFieldInfo,
} from "./types";

export interface QuickFieldsInput {
  hass: HomeAssistant;
  kind: AutomationKind;
  id: string;
  fields?: Record<string, QuickFieldInfo>;
  data?: Record<string, unknown>;
  target?: Record<string, unknown>;
  targetSelector?: Record<string, unknown>;
}

const targetEntities = (
  hass: HomeAssistant,
  target?: Record<string, unknown>
): QuickEntity[] =>
  ensureArray((target?.entity_id as string | string[] | undefined) ?? [])
    .map((entityId) => hass.states[entityId])
    .filter((entity): entity is NonNullable<typeof entity> => !!entity);

/** The tailored controls for one platform trigger or condition, if any. */
export const platformQuickControls = (
  input: QuickFieldsInput
): AutomationControlSet | undefined => {
  const ctx: AutomationEditorContext = {
    kind: input.kind,
    id: input.id,
    data: input.data ?? {},
    fields: input.fields ?? {},
    target: input.target,
    targetSelector: input.targetSelector,
    entities: targetEntities(input.hass, input.target),
    targetEntityCount: input.target
      ? getTargetEntityCount(input.target as any)
      : undefined,
  };
  return buildAutomationControls(ctx);
};

/** Keys of the options a tailored editor draws, so the generic rows skip them. */
export const platformQuickKeys = (input: QuickFieldsInput): Set<string> => {
  const set = platformQuickControls(input);
  return new Set(
    set
      ? [...set.main, ...set.advanced]
          .map((control) => control.key)
          .filter((key) => !key.startsWith("$"))
      : []
  );
};

/**
 * Tailored controls for the options of an integration trigger or condition.
 * Optional fields the editor lists as advanced fold into one panel with a
 * count. It reports the whole new options object.
 */
@customElement("ha-automation-quick-fields")
export class HaAutomationQuickFields extends LitElement {
  private _lang = new LanguageModeController(this);

  @property({ attribute: false }) public hass!: HomeAssistant;

  @property() public kind: AutomationKind = "trigger";

  @property({ attribute: "automation-id" }) public automationId = "";

  @property({ attribute: false }) public fields?: Record<
    string,
    QuickFieldInfo
  >;

  @property({ attribute: false }) public data?: Record<string, unknown>;

  @property({ attribute: false }) public target?: Record<string, unknown>;

  @property({ attribute: false }) public targetSelector?: Record<
    string,
    unknown
  >;

  @property({ type: Boolean }) public disabled = false;

  private _labels(part: "name" | "description"): Record<string, string> {
    const domain = computeDomain(this.automationId);
    const name = computeObjectId(this.automationId);
    const group = this.kind === "trigger" ? "triggers" : "conditions";
    const labels: Record<string, string> = {};
    Object.keys(this.fields ?? {}).forEach((key) => {
      const text = this.hass.localize(
        `component.${domain}.${group}.${name}.fields.${key}.${part}` as any
      );
      if (text) labels[key] = text;
    });
    return labels;
  }

  protected render() {
    const set = platformQuickControls({
      hass: this.hass,
      kind: this.kind,
      id: this.automationId,
      fields: this.fields,
      data: this.data,
      target: this.target,
      targetSelector: this.targetSelector,
    });
    if (!set) return nothing;
    const labels = this._labels("name");
    const descriptions = this._labels("description");
    const stored = set.advanced.some(
      (control) => this.data?.[control.key] !== undefined
    );
    return html`
      ${
        set.main.length
          ? html`<ha-action-quick-controls
              .hass=${this.hass}
              .controls=${set.main}
              .fieldLabels=${labels}
              .fieldDescriptions=${descriptions}
              .disabled=${this.disabled}
              @quick-control-changed=${this._changed}
            ></ha-action-quick-controls>`
          : nothing
      }
      ${
        set.advanced.length
          ? html`<ha-expansion-panel
              left-chevron
              .expanded=${stored}
              .header=${this._lang.text(
                this.hass.localize,
                "ui.components.action-editors.advanced_count",
                { count: set.advanced.length }
              )}
            >
              <ha-action-quick-controls
                .hass=${this.hass}
                .controls=${set.advanced}
                .fieldLabels=${labels}
                .fieldDescriptions=${descriptions}
                .disabled=${this.disabled}
                @quick-control-changed=${this._changed}
              ></ha-action-quick-controls>
            </ha-expansion-panel>`
          : nothing
      }
    `;
  }

  private _changed(ev: CustomEvent<{ key: string; value: unknown }>) {
    ev.stopPropagation();
    if (this.disabled) return;
    const next = applyControlValue(this.data, ev.detail.key, ev.detail.value);
    if (next === this.data) return;
    fireEvent(this, "value-changed", { value: next ?? {} });
  }

  static styles = css`
    :host {
      display: block;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-automation-quick-fields": HaAutomationQuickFields;
  }
}
