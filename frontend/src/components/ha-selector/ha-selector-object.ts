import {
  mdiClose,
  mdiDelete,
  mdiDragHorizontalVariant,
  mdiPencil,
} from "@mdi/js";
import deepClone from "deep-clone-simple";
import type { HassEntities } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing, type PropertyValues } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import type { ObjectNode } from "../../common/object-editor/object-model";
import {
  getObjectDraft,
  setObjectDraft,
} from "../../common/object-editor/object-model";
import { ensureArray } from "../../common/array/ensure-array";
import { consume } from "../../common/decorators/consume";
import { transform } from "../../common/decorators/transform";
import { fireEvent } from "../../common/dom/fire_event";
import { LanguageModeController } from "../../common/language-mode/language-mode-controller";
import {
  formattersContext,
  internationalizationContext,
  registriesContext,
  statesContext,
} from "../../data/context";
import type { ObjectSelector } from "../../data/selector";
import {
  formatSelectorValue,
  type FormatSelectorValueOptions,
} from "../../data/selector/format_selector_value";
import { showFormDialog } from "../../dialogs/form/show-form-dialog";
import type {
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
  HomeAssistantRegistries,
  HomeAssistant,
  ToggleButton,
} from "../../types";
import { computeInitialHaFormData } from "../ha-form/compute-initial-ha-form-data";
import type { HaFormSchema } from "../ha-form/types";
import "../ha-input-helper-text";
import "../ha-sortable";
import "../ha-yaml-editor";
import "../item/ha-list-item-base";
import "../list/ha-list-base";
import type { HaYamlEditor } from "../ha-yaml-editor";
import {
  loadDeclaredOptions,
  type KnownOptionsContext,
} from "../../data/known-options";
import { catalogueOptions } from "../../common/object-editor/known-options-catalogue";
import {
  mergeKnownOptions,
  type KnownOption,
  type ResolvedKnownOption,
} from "../../common/object-editor/known-options";
import { sensiboClimateReactOptions } from "../../common/object-editor/sensibo-climate-react-options";
import { deepEqual } from "../../common/util/deep-equal";
import {
  safeGetStored,
  safeSetStored,
} from "../../common/preferences/safe-storage";
import "../ha-button-toggle-group";
import "../ha-alert";
import "../object-editor/ha-object-editor";

/** Where the last choice between the visual and YAML editor is kept. */
export const OBJECT_SELECTOR_MODE_KEY = "objectSelectorMode";

type ObjectEditorMode = "visual" | "yaml";

@customElement("ha-selector-object")
export class HaObjectSelector extends LitElement {
  @property({ attribute: false }) public hass?: HomeAssistant;

  @property({ attribute: false }) public selector!: ObjectSelector;

  @property() public value?: any;

  @property({ attribute: false }) public context?: {
    known_options?: KnownOptionsContext;
    draft_owner?: object;
    draft_key?: string;
  };

  @property({ attribute: false }) public manualOptions: KnownOption[] = [];

  @state() private _knownOptions: ResolvedKnownOption[] = [];
  private _lang = new LanguageModeController(this);
  private _optionsKey?: string;
  private _optionsConnection?: HomeAssistant["connection"];
  private _optionsLocalize?: HomeAssistant["localize"];
  private _optionsRequest = 0;
  private _visualValid = true;
  private _restoredYaml?: HaYamlEditor;
  private _draftOwner?: object;
  @property({ attribute: false }) public dictionaryOnly = false;
  @property({ attribute: false }) public reservedKeys: string[] = [];

  protected willUpdate() {
    if (this._draftOwner !== this.context?.draft_owner) {
      const previousDraft = getObjectDraft(
        this._draftOwner,
        this.context?.draft_key
      );
      this._draftOwner = this.context?.draft_owner;
      const draft = getObjectDraft(this._draftOwner, this.context?.draft_key);
      // Immutable action updates keep the same draft. Replaying it on every
      // owner replacement reparses YAML and can cause an update loop.
      if (previousDraft !== draft) this._restoredYaml = undefined;
      if (draft) {
        this._mode = draft.mode;
        this._visualValid = draft.valid;
      } else {
        this._visualValid = true;
        this._modeError = false;
      }
    }
    const context = this.context?.known_options;
    const localize = this._i18n?.localize ?? this.hass?.localize;
    const localOptions = sensiboClimateReactOptions(
      context?.action,
      context?.field,
      context?.entityIds,
      this._states ?? this.hass?.states ?? {},
      this._registries?.entities ?? this.hass?.entities ?? {}
    );
    const key = JSON.stringify([
      context,
      this.hass?.language,
      this._lang.mode,
      this.hass?.connected,
      this.hass?.user?.id,
      this.hass?.user?.is_admin,
      localOptions,
    ]);
    if (
      key !== this._optionsKey ||
      this.hass?.connection !== this._optionsConnection ||
      localize !== this._optionsLocalize
    ) {
      this._optionsKey = key;
      this._optionsConnection = this.hass?.connection;
      this._optionsLocalize = localize;
      const request = ++this._optionsRequest;
      const common =
        context?.action && context.field
          ? catalogueOptions(context.action, context.field, (translation) =>
              localize ? this._lang.text(localize, translation) : ""
            )
          : [];
      this._knownOptions = mergeKnownOptions(localOptions, common);
      if (this.hass && context) {
        void loadDeclaredOptions(this.hass, context)
          .then((result) => {
            if (result && request === this._optionsRequest) {
              this._knownOptions = mergeKnownOptions(
                result.options,
                localOptions,
                common
              );
            }
          })
          .catch(() => {
            /* Keep the common options and existing value. */
          });
      }
    }
  }

  private _visualValidity(
    ev: CustomEvent<{ valid: boolean; draft?: ObjectNode }>
  ) {
    ev.stopPropagation();
    this._visualValid = ev.detail.valid;
    setObjectDraft(this.context?.draft_owner, this.context?.draft_key, {
      mode: "visual",
      valid: ev.detail.valid,
      visual: ev.detail.draft,
    });
    this._reportValidity(ev.detail.valid);
  }

  private _reportValidity(valid: boolean) {
    fireEvent(this, "object-editor-validity-changed", { valid, editor: this });
  }

  @property() public label?: string;

  @property() public helper?: string;

  @property() public placeholder?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = true;

  @property({ attribute: false }) public localizeValue?: (
    key: string,
    values?: Record<string, string>
  ) => string;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: registriesContext, subscribe: true })
  private _registries!: HomeAssistantRegistries;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: HassEntities;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  @transform<
    HomeAssistantFormatters,
    HomeAssistantFormatters["formatEntityName"]
  >({
    transformer: (formatters) => formatters?.formatEntityName,
  })
  private _formatEntityName!: HomeAssistantFormatters["formatEntityName"];

  @state() private _mode: ObjectEditorMode =
    safeGetStored<ObjectEditorMode>(OBJECT_SELECTOR_MODE_KEY) === "yaml"
      ? "yaml"
      : "visual";

  @state() private _modeError = false;

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  private _valueChangedFromChild = false;

  private _computeLabel = (schema: HaFormSchema): string => {
    const translationKey = this.selector.object?.translation_key;

    if (this.localizeValue && translationKey) {
      const label =
        this.localizeValue(`${translationKey}.fields.${schema.name}.name`) ||
        // Fallback for backward compatibility
        this.localizeValue(`${translationKey}.fields.${schema.name}`);
      if (label) {
        return label;
      }
    }
    return this.selector.object?.fields?.[schema.name]?.label || schema.name;
  };

  private _computeHelper = (schema: HaFormSchema): string => {
    const translationKey = this.selector.object?.translation_key;

    if (this.localizeValue && translationKey) {
      const helper = this.localizeValue(
        `${translationKey}.fields.${schema.name}.description`
      );
      if (helper) {
        return helper;
      }
    }
    return this.selector.object?.fields?.[schema.name]?.description || "";
  };

  private _formatField(item: any, field: string): string {
    const fields = this.selector.object!.fields!;
    const value = formatSelectorValue(
      this._formatOptions(
        this._i18n,
        this._registries,
        this._states,
        this._formatEntityName
      ),
      item[field],
      fields[field]?.selector
    );
    const translationKey = this.selector.object!.translation_key;
    if (!value || !this.localizeValue || !translationKey) {
      return value;
    }
    return (
      this.localizeValue(`${translationKey}.fields.${field}.overview_label`, {
        value,
      }) || value
    );
  }

  private _renderItem(item: any, index: number) {
    const fields = this.selector.object!.fields!;
    const preferredLabel = this.selector.object!.label_field;
    const hasValidLabelField = preferredLabel && preferredLabel in fields;

    const label = hasValidLabelField
      ? this._formatField(item, preferredLabel!)
      : Object.keys(fields)
          .map((key) => this._formatField(item, key))
          .filter(Boolean)
          .join(" · ");

    let description = "";

    const descriptionField = this.selector.object!.description_field;
    if (
      descriptionField &&
      descriptionField in fields &&
      fields[descriptionField]?.selector
    ) {
      description = this._formatField(item, descriptionField);
    }

    const reorderable = this.selector.object!.multiple || false;
    const multiple = this.selector.object!.multiple || false;
    return html`
      <ha-list-item-base class="item">
        ${
          reorderable
            ? html`
                <ha-svg-icon
                  class="handle"
                  .path=${mdiDragHorizontalVariant}
                  slot="start"
                ></ha-svg-icon>
              `
            : nothing
        }
        <div slot="headline" class="label">${label}</div>
        ${
          description
            ? html`<div slot="supporting-text" class="description">
                ${description}
              </div>`
            : nothing
        }
        <ha-icon-button
          slot="end"
          .item=${item}
          .index=${index}
          .label=${this._i18n.localize("ui.common.edit")}
          .path=${mdiPencil}
          .disabled=${this.disabled}
          @click=${this._editItem}
        ></ha-icon-button>
        <ha-icon-button
          slot="end"
          .index=${index}
          .label=${this._i18n.localize("ui.common.delete")}
          .path=${multiple ? mdiDelete : mdiClose}
          .disabled=${this.disabled}
          @click=${this._deleteItem}
        ></ha-icon-button>
      </ha-list-item-base>
    `;
  }

  protected render() {
    if (this.selector.object?.fields) {
      if (this.selector.object.multiple) {
        const items = ensureArray(this.value ?? []);
        return html`
          ${this.label ? html`<label>${this.label}</label>` : nothing}
          <div class="items-container">
            <ha-sortable
              handle-selector=".handle"
              draggable-selector=".item"
              @item-moved=${this._itemMoved}
            >
              <ha-list-base>
                ${items.map((item, index) => this._renderItem(item, index))}
              </ha-list-base>
            </ha-sortable>
            <ha-button
              appearance="filled"
              .disabled=${this.disabled}
              @click=${this._addItem}
            >
              ${this._i18n.localize("ui.common.add")}
            </ha-button>
          </div>
        `;
      }

      return html`
        ${this.label ? html`<label>${this.label}</label>` : nothing}
        <div class="items-container">
          ${
            this.value
              ? html`<ha-list-base>
                  ${this._renderItem(this.value, 0)}
                </ha-list-base>`
              : html`
                  <ha-button
                    appearance="filled"
                    .disabled=${this.disabled}
                    @click=${this._addItem}
                  >
                    ${this._i18n.localize("ui.common.add")}
                  </ha-button>
                `
          }
        </div>
      `;
    }

    return html`${this._renderModeSwitch()}
    ${
      this._mode === "visual"
        ? html`<ha-object-editor
            .hass=${this.hass}
            .value=${this.value}
            .disabled=${this.disabled}
            .required=${this.required || !!this.context?.known_options}
            .draft=${getObjectDraft(this.context?.draft_owner, this.context?.draft_key)?.visual}
            .knownOptions=${mergeKnownOptions(this._knownOptions, this.manualOptions)}
            .dictionaryOnly=${this.dictionaryOnly}
            .reservedKeys=${this.reservedKeys}
            @object-editor-validity-changed=${this._visualValidity}
            @value-changed=${this._handleVisualChange}
          ></ha-object-editor>`
        : html`<ha-yaml-editor
            .readOnly=${this.disabled}
            .label=${this.label}
            .required=${this.required}
            .placeholder=${this.placeholder}
            .defaultValue=${this.value}
            @value-changed=${this._handleChange}
          ></ha-yaml-editor>`
    }
    ${
      this.helper
        ? html`<ha-input-helper-text>${this.helper}</ha-input-helper-text>`
        : nothing
    } `;
  }

  private _renderModeSwitch() {
    const buttons: ToggleButton[] = [
      {
        label: this._lang.text(
          this._i18n.localize,
          "ui.components.object-editor.visual"
        ),
        value: "visual",
      },
      {
        label: this._lang.text(
          this._i18n.localize,
          "ui.components.object-editor.yaml"
        ),
        value: "yaml",
      },
    ];
    return html`<div class="mode-row">
        ${
          this._mode === "visual" && this.label
            ? html`<label>${this.label}</label>`
            : nothing
        }
        <ha-button-toggle-group
          size="s"
          .buttons=${buttons}
          .active=${this._mode}
          @value-changed=${this._modeChanged}
        ></ha-button-toggle-group>
      </div>
      ${
        this._modeError
          ? html`<ha-alert alert-type="warning">
              ${this._lang.text(this._i18n.localize, "ui.components.object-editor.yaml_invalid")}
            </ha-alert>`
          : nothing
      }`;
  }

  private _modeChanged(ev: CustomEvent<{ value: ObjectEditorMode }>) {
    ev.stopPropagation();
    const next = ev.detail.value;
    if (next === this._mode) {
      return;
    }
    if (next === "yaml" && !this._visualValid) {
      this._modeError = true;
      return;
    }
    // Leaving broken YAML for the visual editor would lose what was typed.
    if (
      next === "visual" &&
      this._yamlEditor &&
      (!this._yamlEditor.isValid || this._modeError)
    ) {
      this._modeError = true;
      (ev.currentTarget as HTMLElement & { active?: string }).active =
        this._mode;
      return;
    }
    this._modeError = false;
    this._visualValid = true;
    this._mode = next;
    this._restoredYaml = undefined;
    setObjectDraft(this.context?.draft_owner, this.context?.draft_key, {
      mode: next,
      valid: true,
    });
    safeSetStored(OBJECT_SELECTOR_MODE_KEY, next);
  }

  private _handleVisualChange(ev: CustomEvent<{ value: unknown }>) {
    ev.stopPropagation();
    fireEvent(this, "value-changed", { value: ev.detail.value });
  }

  private _formatOptions = memoizeOne(
    (
      i18n: HomeAssistantInternationalization,
      registries: HomeAssistantRegistries,
      states: HassEntities,
      formatEntityName: HomeAssistantFormatters["formatEntityName"]
    ): FormatSelectorValueOptions => ({
      locale: i18n.locale,
      localize: i18n.localize,
      states,
      devices: registries.devices,
      areas: registries.areas,
      floors: registries.floors,
      formatEntityName,
    })
  );

  private _schema = memoizeOne((selector: ObjectSelector) => {
    if (!selector.object || !selector.object.fields) {
      return [];
    }
    return Object.entries(selector.object.fields).map(([key, field]) => ({
      name: key,
      selector: field.selector,
      required: field.required ?? false,
      ...("default" in field
        ? { default: field.default as HaFormSchema["default"] }
        : {}),
    }));
  });

  private _itemMoved(ev) {
    ev.stopPropagation();
    const newIndex = ev.detail.newIndex;
    const oldIndex = ev.detail.oldIndex;
    if (!this.selector.object!.multiple) {
      return;
    }
    const newValue = ensureArray(this.value ?? []).concat();
    const item = newValue.splice(oldIndex, 1)[0];
    newValue.splice(newIndex, 0, item);
    fireEvent(this, "value-changed", { value: newValue });
  }

  private async _addItem(ev) {
    ev.stopPropagation();

    const schema = this._schema(this.selector);
    const data = {
      ...computeInitialHaFormData(schema, {
        skipUnsupportedSelectors: true,
      }),
      ...Object.fromEntries(
        schema
          .filter((field) => "default" in field)
          .map((field) => [field.name, deepClone(field.default)])
      ),
    };

    const newItem = await showFormDialog(this, {
      title: this._i18n.localize("ui.common.add"),
      schema,
      data,
      computeLabel: this._computeLabel,
      computeHelper: this._computeHelper,
      submitText: this._i18n.localize("ui.common.add"),
    });

    if (newItem === null) {
      return;
    }

    if (!this.selector.object!.multiple) {
      fireEvent(this, "value-changed", { value: newItem });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue.push(newItem);
    fireEvent(this, "value-changed", { value: newValue });
  }

  private async _editItem(ev) {
    ev.stopPropagation();
    const item = ev.currentTarget.item;
    const index = ev.currentTarget.index;

    const updatedItem = await showFormDialog(this, {
      title: this._i18n.localize("ui.common.edit"),
      schema: this._schema(this.selector),
      data: item,
      computeLabel: this._computeLabel,
      computeHelper: this._computeHelper,
      submitText: this._i18n.localize("ui.common.save"),
    });

    if (updatedItem === null) {
      return;
    }

    if (!this.selector.object!.multiple) {
      fireEvent(this, "value-changed", { value: updatedItem });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue[index] = updatedItem;
    fireEvent(this, "value-changed", { value: newValue });
  }

  private _deleteItem(ev) {
    ev.stopPropagation();
    const index = ev.currentTarget.index;

    if (!this.selector.object!.multiple) {
      fireEvent(this, "value-changed", { value: "" });
      return;
    }

    const newValue = ensureArray(this.value ?? []).concat();
    newValue.splice(index, 1);
    fireEvent(this, "value-changed", { value: newValue });
  }

  protected updated(changedProps: PropertyValues<this>) {
    super.updated(changedProps);
    const draft = getObjectDraft(
      this.context?.draft_owner,
      this.context?.draft_key
    );
    if (this._yamlEditor && this._yamlEditor !== this._restoredYaml) {
      this._restoredYaml = this._yamlEditor;
      if (draft?.mode === "yaml" && draft.yaml !== undefined) {
        const editor = this._yamlEditor;
        const text = draft.yaml;
        void editor.updateComplete.then(() => {
          if (this._yamlEditor === editor) editor.setYaml(text);
        });
        return;
      }
    }
    if (
      changedProps.has("value") &&
      !this._valueChangedFromChild &&
      this._yamlEditor &&
      !deepEqual(this.value, changedProps.get("value"))
    ) {
      this._yamlEditor.setValue(this.value);
    }
    this._valueChangedFromChild = false;
  }

  private _handleChange(ev) {
    ev.stopPropagation();
    this._valueChangedFromChild = true;
    const value = ev.target.value;
    const valid =
      ev.target.isValid &&
      (!this.dictionaryOnly ||
        (value !== null &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          !Object.keys(value).some((key) => this.reservedKeys.includes(key))));
    this._modeError = !valid;
    setObjectDraft(this.context?.draft_owner, this.context?.draft_key, {
      mode: "yaml",
      valid,
      yaml: ev.target.yaml,
    });
    this._reportValidity(valid);
    if (!valid) {
      return;
    }
    if (deepEqual(this.value, value)) {
      return;
    }
    fireEvent(this, "value-changed", { value });
  }

  static get styles() {
    return [
      css`
        ha-list-base {
          --ha-list-gap: var(--ha-space-2);
          --ha-list-padding: var(--ha-space-2) 0;
        }
        ha-list-item-base {
          border: 1px solid var(--divider-color);
          border-radius: var(--ha-border-radius-md);
          --ha-row-item-gap: 0;
          --ha-row-item-padding-block: 0;
          --ha-row-item-padding-inline: var(--ha-space-3) var(--ha-space-1);
        }
        ha-list-item-base::part(start),
        ha-list-item-base::part(end) {
          color: var(--ha-color-text-secondary);
        }
        .handle {
          cursor: move;
          padding: 8px;
          margin-inline-start: -8px;
        }
        label {
          margin-bottom: 8px;
          display: block;
        }
        .mode-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: var(--ha-space-2);
          margin-bottom: var(--ha-space-2);
        }
        .mode-row label {
          margin-bottom: 0;
          flex: 1;
          min-width: 0;
        }
        .mode-row ha-button-toggle-group {
          margin-inline-start: auto;
        }
        ha-alert {
          display: block;
          margin-bottom: var(--ha-space-2);
        }
        ha-list-item-base .label,
        ha-list-item-base .description {
          text-overflow: ellipsis;
          overflow: hidden;
          white-space: nowrap;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-selector-object": HaObjectSelector;
  }
}
