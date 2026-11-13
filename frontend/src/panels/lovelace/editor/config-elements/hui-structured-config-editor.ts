import { html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { fireEvent } from "../../../../common/dom/fire_event";
import {
  inferKind,
  type ResolvedKnownOption,
} from "../../../../common/object-editor/known-options";
import "../../../../components/object-editor/ha-object-editor";
import type { HomeAssistant } from "../../../../types";
import type { LovelaceGenericElementEditor } from "../../types";

export const isConfigRecord = (
  value: unknown
): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

// Non-data properties (including preview callbacks) remain owned by the host.
const editable = (value: unknown, seen = new Set<object>()): boolean => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return true;
  }
  if (typeof value === "number") return Number.isFinite(value);
  if (
    !Array.isArray(value) &&
    (!isConfigRecord(value) || Object.getPrototypeOf(value) === null)
  ) {
    return false;
  }
  if (seen.has(value) || Object.getOwnPropertySymbols(value).length) {
    return false;
  }
  seen.add(value);
  const valid = Object.values(value).every((item) => editable(item, seen));
  seen.delete(value);
  return valid;
};

export const editableConfig = (config: Record<string, unknown>) =>
  Object.fromEntries(
    Object.entries(config).filter(([, value]) => editable(value))
  );

export const restoreOpaqueConfig = (
  original: Record<string, unknown>,
  edited: Record<string, unknown>
) => {
  const result = { ...original };
  for (const key of Object.keys(editableConfig(original))) delete result[key];
  return { ...result, ...edited };
};

@customElement("hui-structured-config-editor")
export class HuiStructuredConfigEditor
  extends LitElement
  implements LovelaceGenericElementEditor
{
  @property({ attribute: false }) public hass!: HomeAssistant;
  @state() private _config?: Record<string, unknown>;
  private _data?: Record<string, unknown>;
  private _options: ResolvedKnownOption[] = [];

  public setConfig(config: unknown): void {
    if (!isConfigRecord(config)) {
      throw new Error(
        this.hass.localize("ui.errors.config.configuration_error")
      );
    }
    this._config = config;
    this._data = editableConfig(config);
    this._options = Object.entries(this._data).flatMap(([key, value]) => {
      const kind =
        key === "entity" && typeof value === "string"
          ? { type: "entity" as const }
          : inferKind(value);
      return kind
        ? [
            {
              key,
              label:
                this.hass.localize(
                  `ui.panel.lovelace.editor.card.generic.${key}`
                ) || key.replaceAll("_", " "),
              kind,
              source: "common" as const,
            },
          ]
        : [];
    });
  }

  protected render() {
    if (!this._config) return nothing;
    return html`<ha-object-editor
      .hass=${this.hass}
      .value=${this._data}
      .knownOptions=${this._options}
      .reservedKeys=${Object.keys(this._config).filter(
        (key) => !Object.prototype.hasOwnProperty.call(this._data, key)
      )}
      .dictionaryOnly=${true}
      .required=${true}
      @object-editor-validity-changed=${this._validityChanged}
      @value-changed=${this._valueChanged}
    ></ha-object-editor>`;
  }

  private _validityChanged(ev: CustomEvent) {
    ev.stopPropagation();
    fireEvent(this, "config-changed", {
      config: this._config!,
      error: ev.detail.valid
        ? undefined
        : this.hass.localize("ui.errors.config.configuration_error"),
    });
  }

  private _valueChanged(ev: CustomEvent) {
    ev.stopPropagation();
    if (!isConfigRecord(ev.detail.value)) return;
    const config = restoreOpaqueConfig(this._config!, ev.detail.value);
    fireEvent(this, "config-changed", { config });
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-structured-config-editor": HuiStructuredConfigEditor;
  }
}
