import { mdiArrowDown, mdiArrowUp, mdiClose } from "@mdi/js";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, queryAll, state } from "lit/decorators";
import { repeat } from "lit/directives/repeat";
import { isValidEntityId } from "../../../../common/entity/valid_entity_id";
import { isTemplateString } from "../../../../common/object-editor/object-model";
import type { Selector } from "../../../../data/selector";
import "../../../../components/ha-selector/ha-selector";
import "../../../../components/ha-icon-button";
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

/** Match only existing values that the native selector can represent without coercion. */
export const dashboardFieldSelector = (
  key: string,
  value: unknown
): Selector | undefined => {
  if (typeof value === "string" && !isTemplateString(value)) {
    if (key === "icon") return { icon: {} };
    if (key === "navigation_path") return { navigation: null };
  }
  if (
    key === "entities" &&
    Array.isArray(value) &&
    [...value].every(
      (item) => typeof item === "string" && isValidEntityId(item)
    ) &&
    Object.keys(value).length === value.length &&
    new Set(value).size === value.length
  ) {
    return { entity: { multiple: true, reorder: true } };
  }
  return undefined;
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
  private _structuredData?: Record<string, unknown>;
  private _nativeFields: { key: string; selector: Selector }[] = [];
  @state() private _visualValid = true;
  @queryAll(".entity-order") private _orderRows!: NodeListOf<HTMLElement>;
  private _pendingOrderFocus?: { entity: string; direction: number };

  public setConfig(config: unknown): void {
    if (!isConfigRecord(config)) {
      throw new Error(
        this.hass.localize("ui.errors.config.configuration_error")
      );
    }
    this._config = config;
    this._data = editableConfig(config);
    this._nativeFields = Object.entries(this._data).flatMap(([key, value]) => {
      const selector = dashboardFieldSelector(key, value);
      return selector ? [{ key, selector }] : [];
    });
    const nativeKeys = new Set(this._nativeFields.map(({ key }) => key));
    this._structuredData = Object.fromEntries(
      Object.entries(this._data).filter(([key]) => !nativeKeys.has(key))
    );
    this._options = Object.entries(this._structuredData).flatMap(
      ([key, value]) => {
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
      }
    );
  }

  private _fieldLabel(key: string): string {
    return (
      this.hass.localize(`ui.panel.lovelace.editor.card.generic.${key}`) ||
      key.replaceAll("_", " ")
    );
  }

  protected render() {
    if (!this._config) return nothing;
    return html` ${this._nativeFields.map(
        ({ key, selector }) => html`
          <div class="native-field" ?inert=${!this._visualValid}>
            <div class="native-control">
              <ha-selector
                .hass=${this.hass}
                .name=${key}
                .label=${this.hass.localize(`ui.panel.lovelace.editor.card.generic.${key}`) || key.replaceAll("_", " ")}
                .selector=${selector}
                .value=${this._config![key]}
                .disabled=${!this._visualValid}
                @value-changed=${this._nativeChanged}
              ></ha-selector>
              ${key === "entities" ? this._renderEntityOrder() : nothing}
            </div>
            <ha-icon-button
              .name=${key}
              .label=${`${this.hass.localize("ui.common.remove")}: ${this._fieldLabel(key)}`}
              .path=${mdiClose}
              .disabled=${!this._visualValid}
              @click=${this._removeNative}
            ></ha-icon-button>
          </div>
        `
      )}
      <ha-object-editor
        .hass=${this.hass}
        .value=${this._structuredData}
        .knownOptions=${this._options}
        .reservedKeys=${Object.keys(this._config).filter(
          (key) =>
            !Object.prototype.hasOwnProperty.call(this._structuredData, key)
        )}
        .dictionaryOnly=${true}
        .required=${true}
        @object-editor-validity-changed=${this._validityChanged}
        @value-changed=${this._valueChanged}
      ></ha-object-editor>`;
  }

  private _renderEntityOrder() {
    const entities = this._config!.entities as string[];
    if (entities.length < 2) return nothing;
    return html`<div class="entity-order-list">
      ${repeat(
        entities,
        (entity) => entity,
        (entity, index) => html`
          <div class="entity-order" data-entity=${entity} tabindex="-1">
            <span>${entity}</span>
            <ha-icon-button
              .entity=${entity}
              .direction=${-1}
              data-direction="-1"
              .label=${`${this.hass.localize("ui.components.object-editor.move_up")}: ${entity}`}
              .path=${mdiArrowUp}
              .disabled=${!this._visualValid || index === 0}
              @click=${this._moveEntity}
            ></ha-icon-button>
            <ha-icon-button
              .entity=${entity}
              .direction=${1}
              data-direction="1"
              .label=${`${this.hass.localize("ui.components.object-editor.move_down")}: ${entity}`}
              .path=${mdiArrowDown}
              .disabled=${!this._visualValid || index === entities.length - 1}
              @click=${this._moveEntity}
            ></ha-icon-button>
          </div>
        `
      )}
    </div>`;
  }

  private _moveEntity(ev: Event) {
    ev.stopPropagation();
    if (
      !this._visualValid ||
      !this._config ||
      !dashboardFieldSelector("entities", this._config.entities)
    ) {
      return;
    }
    const { entity, direction } = ev.currentTarget as HTMLElement & {
      entity: string;
      direction: number;
    };
    if (direction !== -1 && direction !== 1) return;
    const entities = [...(this._config.entities as string[])];
    const index = entities.indexOf(entity);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= entities.length) return;
    [entities[index], entities[next]] = [entities[next], entities[index]];
    this._pendingOrderFocus = { entity, direction };
    fireEvent(this, "config-changed", {
      config: { ...this._config, entities },
    });
  }

  protected updated() {
    if (!this._pendingOrderFocus) return;
    const { entity, direction } = this._pendingOrderFocus;
    this._pendingOrderFocus = undefined;
    const row = Array.from(this._orderRows).find(
      (item) => item.dataset.entity === entity
    );
    const button = row?.querySelector<HTMLElement & { disabled: boolean }>(
      `[data-direction="${direction}"]`
    );
    if (button && !button.disabled) button.focus();
    else row?.focus();
  }

  private _validityChanged(ev: CustomEvent) {
    ev.stopPropagation();
    this._visualValid = ev.detail.valid;
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
    const nativeData = Object.fromEntries(
      this._nativeFields.map(({ key }) => [key, this._config![key]])
    );
    const config = restoreOpaqueConfig(this._config!, {
      ...ev.detail.value,
      ...nativeData,
    });
    fireEvent(this, "config-changed", { config });
  }
  private _nativeChanged(ev: CustomEvent<{ value: unknown }>) {
    ev.stopPropagation();
    if (!this._visualValid || !this._config) return;
    const key = (ev.currentTarget as HTMLElement & { name: string }).name;
    if (!this._nativeFields.some((field) => field.key === key)) return;
    const value = ev.detail.value;
    if (
      value !== undefined &&
      (key === "entities"
        ? !dashboardFieldSelector(key, value)
        : typeof value !== "string")
    ) {
      return;
    }
    const config = { ...this._config };
    if (value === undefined) delete config[key];
    else config[key] = value;
    fireEvent(this, "config-changed", { config });
  }

  private _removeNative(ev: Event) {
    ev.stopPropagation();
    if (!this._visualValid || !this._config) return;
    const key = (ev.currentTarget as HTMLElement & { name: string }).name;
    if (!this._nativeFields.some((field) => field.key === key)) return;
    const config = { ...this._config };
    delete config[key];
    fireEvent(this, "config-changed", { config });
  }

  static styles = css`
    .native-field {
      display: flex;
      align-items: start;
      gap: 8px;
      margin-bottom: 16px;
    }
    .native-control {
      flex: 1;
      min-width: 0;
    }
    ha-selector {
      display: block;
    }
    .entity-order {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .entity-order span {
      flex: 1;
      min-width: 0;
      overflow-wrap: anywhere;
    }
    .entity-order ha-icon-button {
      flex-shrink: 0;
    }
    .entity-order:focus-visible {
      outline: 2px solid var(--primary-color);
      outline-offset: 2px;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "hui-structured-config-editor": HuiStructuredConfigEditor;
  }
}
