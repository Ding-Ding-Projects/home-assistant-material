import { mdiHelpCircleOutline, mdiTuneVariant } from "@mdi/js";
import type { HassService, HassServices } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, query, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { keyed } from "lit/directives/keyed";
import {
  clearObjectDraft,
  getObjectDraft,
  transferObjectDrafts,
} from "../common/object-editor/object-model";
import "./ha-selector/ha-selector-object";
import { ensureArray } from "../common/array/ensure-array";
import {
  fireEvent,
  type HASSDomCurrentTargetEvent,
  type HASSDomEvent,
} from "../common/dom/fire_event";
import { computeDomain } from "../common/entity/compute_domain";
import { LanguageModeController } from "../common/language-mode/language-mode-controller";
import { computeObjectId } from "../common/entity/compute_object_id";
import { supportsFeature } from "../common/entity/supports-feature";
import { hasTemplate } from "../common/string/has-template";
import { actionFieldAdapterKind } from "../data/action-field-adapters";
import {
  fetchIntegrationManifest,
  type IntegrationManifest,
} from "../data/integration";
import {
  expandAreaTarget,
  expandDeviceTarget,
  expandFloorTarget,
  expandLabelTarget,
  fillFieldDefaults,
  filterTargetForSelector,
  resolveEntityIDs,
  type MediaSelectorValue,
  type Selector,
  type TargetSelector,
} from "../data/selector";
import { SirenEntityFeature } from "../data/siren";
import type { HassServiceTargetWithExclude } from "../data/target";
import type { HomeAssistant, ValueChangedEvent } from "../types";
import { documentationUrl } from "../util/documentation-url";
import { getSelectorFallbackValue } from "./ha-form/get-selector-fallback-value";
import "./ha-action-field-adapter";
import "./ha-icon-button";
import "./ha-markdown";
import "./ha-selector/ha-selector";
import "./ha-service-picker";
import "./ha-service-section-icon";
import "./ha-svg-icon";
import "./ha-switch";
import type { HaSwitch } from "./ha-switch";
import "./ha-yaml-editor";
import type { HaYamlEditor } from "./ha-yaml-editor";

const attributeFilter = (values: any[], attribute: any) => {
  if (typeof attribute === "object") {
    if (Array.isArray(attribute)) {
      return attribute.some((item) => values.includes(item));
    }
    return false;
  }
  return values.includes(attribute);
};

const showOptionalToggle = (field) =>
  field.selector &&
  !field.required &&
  !("boolean" in field.selector && field.default);

// A switch fits next to its label, even when the editor is narrow.
const isBooleanSelector = (selector?: Selector): boolean =>
  !!selector && "boolean" in selector;

const sirenToneChoices = (
  hass: HomeAssistant,
  targetEntities: string[] | null
): { value: string; label: string }[] => {
  const states = [...new Set(targetEntities ?? [])].map(
    (entityId) => hass.states[entityId]
  );
  if (states.some((entity) => !entity)) return [];

  const available = states
    .filter(
      (entity) => entity && supportsFeature(entity, SirenEntityFeature.TONES)
    )
    .map(({ attributes }) => {
      const tones = attributes.available_tones;
      if (Array.isArray(tones)) {
        return tones
          .filter(
            (tone) => typeof tone === "number" || typeof tone === "string"
          )
          .map((tone) => ({ value: String(tone), label: String(tone) }));
      }
      return tones && typeof tones === "object"
        ? Object.entries(tones)
            .filter(([, name]) => typeof name === "string")
            .map(([value, name]) => ({ value, label: String(name) }))
        : [];
    });
  return (available[0] ?? []).filter(
    ({ value }, index, first) =>
      first.findIndex((tone) => tone.value === value) === index &&
      available.every((tones) => tones.some((tone) => tone.value === value))
  );
};

interface Field extends Omit<HassService["fields"][string], "selector"> {
  key: string;
  selector?: Selector;
}

interface ExtHassService extends Omit<HassService, "fields"> {
  fields: (Omit<HassService["fields"][string], "selector"> & {
    key: string;
    selector?: Selector;
    fields?: Record<string, Omit<HassService["fields"][string], "selector">>;
    collapsed?: boolean;
  })[];
  flatFields: Field[];
  hasSelector: string[];
}

@customElement("ha-service-control")
export class HaServiceControl extends LitElement {
  private _lang = new LanguageModeController(this);
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public value?: {
    action: string;
    target?: HassServiceTargetWithExclude;
    data?: Record<string, any>;
  };

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public narrow = false;

  @property({ attribute: "show-service-id", type: Boolean })
  public showServiceId = false;

  @property({ attribute: "hide-picker", type: Boolean, reflect: true })
  public hidePicker = false;

  @property({ attribute: "hide-description", type: Boolean })
  public hideDescription = false;

  /**
   * Offer the "Build text" button on text fields. Only actions that the
   * server renders as templates when they run (automations and scripts) can
   * use it, so callers that send the data as it is turn it off.
   */
  @property({ attribute: "string-builder", type: Boolean })
  public stringBuilder = true;

  @state() private _value!: this["value"];

  @state() private _checkedKeys = new Set();

  @state() private _legacyMediaValue?: MediaSelectorValue;

  @state() private _manifest?: IntegrationManifest;

  @query("ha-yaml-editor") private _yamlEditor?: HaYamlEditor;

  private _stickySelector: Record<string, Selector> = {};

  public constructor() {
    super();
    this.addEventListener("value-changed", (ev) => {
      const next = (ev as CustomEvent<{ value?: { action?: string } }>).detail
        .value;
      if (
        next &&
        typeof next === "object" &&
        this.value &&
        next.action === this.value.action
      ) {
        transferObjectDrafts(this.value, next);
      }
    });
  }

  protected willUpdate(changedProperties: PropertyValues<this>) {
    if (!this.hasUpdated) {
      this.hass.loadBackendTranslation("services");
      this.hass.loadBackendTranslation("selector");
    }
    if (!changedProperties.has("value")) {
      return;
    }
    const oldValue = changedProperties.get("value") as
      undefined | this["value"];

    if (oldValue?.action !== this.value?.action) {
      this._checkedKeys = new Set();
      this._stickySelector = {};
      this._legacyMediaValue = undefined;
    }

    const serviceData = this._getServiceInfo(
      this.value?.action,
      this.hass.services
    );

    // Fetch the manifest if we have a service selected and the service domain changed.
    // If no service is selected, clear the manifest.
    if (this.value?.action) {
      if (
        !oldValue?.action ||
        computeDomain(this.value.action) !== computeDomain(oldValue.action)
      ) {
        this._fetchManifest(computeDomain(this.value?.action));
      }
    } else {
      this._manifest = undefined;
    }

    if (
      serviceData &&
      "target" in serviceData &&
      (this.value?.data?.entity_id ||
        this.value?.data?.area_id ||
        this.value?.data?.device_id)
    ) {
      const target = {
        ...this.value.target,
      };

      if (this.value.data.entity_id && !this.value.target?.entity_id) {
        target.entity_id = this.value.data.entity_id;
      }
      if (this.value.data.area_id && !this.value.target?.area_id) {
        target.area_id = this.value.data.area_id;
      }
      if (this.value.data.device_id && !this.value.target?.device_id) {
        target.device_id = this.value.data.device_id;
      }

      this._value = {
        ...this.value,
        target,
        data: { ...this.value.data },
      };

      delete this._value.data!.entity_id;
      delete this._value.data!.device_id;
      delete this._value.data!.area_id;
    } else {
      this._value = this.value;
    }

    if (oldValue?.action !== this.value?.action) {
      let updatedDefaultValue = false;
      if (this._value && serviceData) {
        const loadDefaults = this.value && !("data" in this.value);
        if (!this._value.data) {
          this._value.data = {};
        }
        const filled = fillFieldDefaults(
          this._value.data,
          serviceData.flatFields.map((field) => [field.key, field]),
          !!loadDefaults
        );
        if (filled.changed) {
          updatedDefaultValue = true;
          this._value.data = filled.values;
        }
      }
      if (updatedDefaultValue) {
        fireEvent(this, "value-changed", {
          value: {
            ...this._value,
          },
        });
      }
    }

    if (this._value?.data) {
      const yamlEditor = this._yamlEditor;
      if (yamlEditor && yamlEditor.value !== this._value.data) {
        yamlEditor.setValue(this._value.data);
      }
    }
  }

  private _getServiceInfo = memoizeOne(
    (
      service?: string,
      serviceDomains?: HassServices
    ): ExtHassService | undefined => {
      if (!service || !serviceDomains) {
        return undefined;
      }
      const domain = computeDomain(service);
      const serviceName = computeObjectId(service);
      if (!(domain in serviceDomains)) {
        return undefined;
      }
      if (!(serviceName in serviceDomains[domain])) {
        return undefined;
      }

      const fields = Object.entries(
        serviceDomains[domain][serviceName].fields
      ).map(([key, value]) => ({
        key,
        ...value,
        selector: value.selector as Selector | undefined,
      }));

      const flatFields: Field[] = [];
      const hasSelector: string[] = [];
      fields.forEach((field) => {
        if ((field as any).fields) {
          Object.entries((field as any).fields).forEach(([key, subField]) => {
            flatFields.push({ ...(subField as Field), key });
            if ((subField as any).selector) {
              hasSelector.push(key);
            }
          });
        } else {
          flatFields.push(field);
          if (field.selector) {
            hasSelector.push(field.key);
          }
        }
      });

      return {
        ...serviceDomains[domain][serviceName],
        fields,
        flatFields,
        hasSelector,
      };
    }
  );

  private _getTargetedEntities = (target, value) => {
    const targetSelector = target ? { target } : { target: {} };
    if (
      hasTemplate(value?.target) ||
      hasTemplate(value?.data?.entity_id) ||
      hasTemplate(value?.data?.device_id) ||
      hasTemplate(value?.data?.area_id) ||
      hasTemplate(value?.data?.floor_id) ||
      hasTemplate(value?.data?.label_id)
    ) {
      return null;
    }
    const isPrimaryEntity = (entityId: string) => {
      const entity = this.hass.entities[entityId];
      return !entity?.entity_category && !entity?.hidden;
    };
    const targetEntities =
      ensureArray(
        value?.target?.entity_id || value?.data?.entity_id
      )?.slice() || [];
    const targetDevices =
      ensureArray(
        value?.target?.device_id || value?.data?.device_id
      )?.slice() || [];
    const targetAreas =
      ensureArray(value?.target?.area_id || value?.data?.area_id)?.slice() ||
      [];
    const targetFloors = ensureArray(
      value?.target?.floor_id || value?.data?.floor_id
    )?.slice();
    const targetLabels = ensureArray(
      value?.target?.label_id || value?.data?.label_id
    )?.slice();
    if (targetLabels) {
      targetLabels.forEach((labelId) => {
        const expanded = expandLabelTarget(
          this.hass,
          labelId,
          this.hass.areas,
          this.hass.devices,
          this.hass.entities,
          targetSelector
        );
        targetDevices.push(...expanded.devices);
        const primaryEntities = expanded.entities.filter(isPrimaryEntity);
        targetEntities.push(...primaryEntities);
        targetAreas.push(...expanded.areas);
      });
    }
    if (targetFloors) {
      targetFloors.forEach((floorId) => {
        const expanded = expandFloorTarget(
          this.hass,
          floorId,
          this.hass.areas,
          targetSelector
        );
        targetAreas.push(...expanded.areas);
      });
    }
    if (targetAreas.length) {
      targetAreas.forEach((areaId) => {
        const expanded = expandAreaTarget(
          this.hass,
          areaId,
          this.hass.devices,
          this.hass.entities,
          targetSelector
        );
        const primaryEntities = expanded.entities.filter(isPrimaryEntity);
        targetEntities.push(...primaryEntities);
        targetDevices.push(...expanded.devices);
      });
    }
    if (targetDevices.length) {
      targetDevices.forEach((deviceId) => {
        const expanded = expandDeviceTarget(
          this.hass,
          deviceId,
          this.hass.entities,
          targetSelector
        );
        const primaryEntities = expanded.entities.filter(isPrimaryEntity);
        targetEntities.push(...primaryEntities);
      });
    }
    const exclude = value?.target?.exclude;
    if (exclude) {
      const excluded = new Set(
        resolveEntityIDs(
          this.hass,
          exclude,
          this.hass.entities,
          this.hass.devices,
          this.hass.areas
        )
      );
      return targetEntities.filter((entityId) => !excluded.has(entityId));
    }
    return targetEntities;
  };

  private _filterField(
    filter: NonNullable<Field["filter"]>,
    targetEntities: string[] | null
  ) {
    return (
      targetEntities === null ||
      targetEntities.some((entityId) =>
        this._matchesFieldTarget(filter, entityId)
      )
    );
  }

  private _matchesFieldTarget(
    filter: NonNullable<Field["filter"]>,
    entityId: string
  ): boolean {
    const entity = this.hass.states[entityId];
    if (!entity) return false;
    if (
      filter.supported_features?.some((feature) =>
        supportsFeature(entity, feature)
      )
    ) {
      return true;
    }
    return Object.entries(filter.attribute ?? {}).some(
      ([attribute, values]) =>
        attribute in entity.attributes &&
        attributeFilter(values, entity.attributes[attribute])
    );
  }

  private _targetSelector = memoizeOne(
    (targetSelector: TargetSelector | null | undefined, value) => {
      if (!value || (typeof value === "object" && !Object.keys(value).length)) {
        delete this._stickySelector.target;
      } else if (hasTemplate(value)) {
        if (typeof value === "string") {
          this._stickySelector.target = { template: null };
        } else {
          this._stickySelector.target = { object: null };
        }
      }
      return (
        this._stickySelector.target ??
        (targetSelector ? { target: { ...targetSelector } } : { target: {} })
      );
    }
  );

  protected render() {
    const serviceData = this._getServiceInfo(
      this._value?.action,
      this.hass.services
    );

    const wholeData = !serviceData?.hasSelector.length;
    const data = this._value?.data;
    const actionDataRequired =
      !serviceData ||
      serviceData.flatFields.some((field) => field.key !== "entity_id") ||
      (data !== undefined &&
        (typeof data !== "object" ||
          data === null ||
          Array.isArray(data) ||
          Object.keys(data).some((key) => key !== "entity_id"))) ||
      getObjectDraft(this.value, "$data")?.valid === false;
    const additionalData = Object.fromEntries(
      Object.entries(this._value?.data || {}).filter(
        ([key]) => !this._dataEditorKeys(serviceData).includes(key)
      )
    );

    const entityId =
      wholeData &&
      serviceData?.fields.find((field) => field.key === "entity_id");

    const hasOptional = Boolean(
      !wholeData &&
      serviceData?.flatFields.some((field) => showOptionalToggle(field))
    );

    const targetEntities = this._getTargetedEntities(
      serviceData?.target,
      this._value
    );

    const domain = this._value?.action
      ? computeDomain(this._value.action)
      : undefined;
    const serviceName = this._value?.action
      ? computeObjectId(this._value.action)
      : undefined;

    const descriptionPlaceholders =
      domain && serviceName
        ? this.hass.services[domain]?.[serviceName]?.description_placeholders
        : undefined;

    const description =
      (serviceName &&
        this.hass.localize(
          `component.${domain}.services.${serviceName}.description`,
          descriptionPlaceholders
        )) ||
      serviceData?.description;

    const documentationLink =
      this._manifest?.is_built_in && this._value?.action
        ? documentationUrl(this.hass, `/actions/${this._value.action}`)
        : this._manifest?.documentation;

    const targetSelector =
      serviceData && "target" in serviceData
        ? this._targetSelector(
            serviceData.target as TargetSelector,
            this._value?.target
          )
        : undefined;

    return html`${
      this.hidePicker
        ? nothing
        : html`<ha-service-picker
            .value=${this._value?.action}
            .disabled=${this.disabled}
            @value-changed=${this._serviceChanged}
            .showServiceId=${this.showServiceId}
          ></ha-service-picker>`
    }
    ${
      this.hideDescription
        ? nothing
        : html`
            <div class="description">
              ${description ? html`<p>${description}</p>` : ""}
              ${
                documentationLink
                  ? html` <a
                      href=${documentationLink}
                      title=${this.hass.localize(
                        "ui.components.service-control.integration_doc"
                      )}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ha-icon-button
                        .path=${mdiHelpCircleOutline}
                        class="help-icon"
                      ></ha-icon-button>
                    </a>`
                  : nothing
              }
            </div>
          `
    }
    ${
      serviceData && "target" in serviceData
        ? html`<div class="target-heading">
              ${this.hass.localize("ui.components.service-control.target")}
            </div>
            <ha-selector
              class="target-selector"
              .hass=${this.hass}
              .selector=${targetSelector}
              .disabled=${this.disabled}
              @value-changed=${this._targetChanged}
              .value=${this._value?.target}
            ></ha-selector>`
        : entityId
          ? html`<ha-entity-picker
              .disabled=${this.disabled}
              .value=${this._value?.data?.entity_id}
              .label=${
                this.hass.localize(
                  `component.${domain}.services.${serviceName}.fields.entity_id.description`,
                  descriptionPlaceholders
                ) || entityId.description
              }
              @value-changed=${this._entityPicked}
              allow-custom-entity
            ></ha-entity-picker>`
          : ""
    }
    ${
      wholeData
        ? actionDataRequired && this._value?.action
          ? this._renderDataDictionary(data, false)
          : nothing
        : serviceData?.fields.map((dataField) => {
            if (!dataField.fields) {
              return this._renderField(
                dataField,
                hasOptional,
                domain,
                serviceName,
                targetEntities
              );
            }

            const fields = Object.entries(dataField.fields).map(
              ([key, field]) => ({ key, ...field })
            );

            return fields.length &&
              this._hasFilteredFields(fields, targetEntities)
              ? html`<ha-expansion-panel
                  left-chevron
                  .expanded=${!dataField.collapsed}
                  .header=${
                    this.hass.localize(
                      `component.${domain}.services.${serviceName}.sections.${dataField.key}.name`,
                      descriptionPlaceholders
                    ) ||
                    dataField.name ||
                    dataField.key
                  }
                  .secondary=${this._getSectionDescription(
                    dataField,
                    domain,
                    serviceName
                  )}
                >
                  <ha-service-section-icon
                    slot="icons"
                    .service=${this._value!.action}
                    .section=${dataField.key}
                  ></ha-service-section-icon>
                  ${Object.entries(dataField.fields).map(([key, field]) =>
                    this._renderField(
                      { key, ...field },
                      hasOptional,
                      domain,
                      serviceName,
                      targetEntities
                    )
                  )}
                </ha-expansion-panel>`
              : nothing;
          })
    }
    ${!wholeData ? this._renderDataDictionary(additionalData, true) : nothing} `;
  }

  /** Legacy play-media actions keep their split data until explicitly edited. */
  private _usesLegacyMedia(service: ExtHassService | undefined): boolean {
    const data = this._value?.data;
    return (
      this._value?.action === "media_player.play_media" &&
      !!data &&
      !("media" in data) &&
      ("media_content_id" in data || "media_content_type" in data) &&
      [data.media_content_id, data.media_content_type].every(
        (value) =>
          value === undefined ||
          (typeof value === "string" && !hasTemplate(value))
      ) &&
      !!service?.flatFields.some(
        (field) =>
          field.key === "media" && field.selector && "media" in field.selector
      )
    );
  }

  private _dataEditorKeys(service: ExtHassService | undefined): string[] {
    return this._usesLegacyMedia(service)
      ? [
          ...(service?.hasSelector || []),
          "media_content_id",
          "media_content_type",
        ]
      : service?.hasSelector || [];
  }

  private _fieldValue(key: string): unknown {
    const data = this._value?.data;
    if (
      key !== "media" ||
      !this._usesLegacyMedia(
        this._getServiceInfo(this._value?.action, this.hass.services)
      )
    ) {
      return data?.[key];
    }
    const cached = this._legacyMediaValue;
    const browseId = cached?.metadata?.browse_entity_id;
    const sameItem =
      cached?.media_content_id === data?.media_content_id &&
      cached?.media_content_type === data?.media_content_type;
    const metadata = sameItem
      ? cached?.metadata
      : browseId
        ? { browse_entity_id: browseId }
        : undefined;
    return {
      media_content_id: data?.media_content_id,
      media_content_type: data?.media_content_type,
      ...(metadata ? { metadata } : {}),
    } satisfies MediaSelectorValue;
  }

  private _renderDataDictionary(value: unknown, additional: boolean) {
    const service = this._getServiceInfo(
      this._value?.action,
      this.hass.services
    );
    const fallbackFields =
      service?.flatFields.filter((field) => !field.selector) ?? [];
    const separateEntity =
      !additional && fallbackFields.some((field) => field.key === "entity_id");
    const targetEntities = this._getTargetedEntities(
      service?.target,
      this._value
    );
    const knownFields = fallbackFields.filter(
      (field) =>
        (field.key !== "entity_id" || !separateEntity) &&
        (!field.filter || this._filterField(field.filter, targetEntities))
    );
    const manualOptions = knownFields.map((field) => ({
      key: field.key,
      label: field.name || field.key,
      description: field.description,
      default: field.default,
      source: "declared" as const,
    }));
    const displayValue = separateEntity
      ? Object.fromEntries(
          Object.entries((value ?? {}) as Record<string, unknown>).filter(
            ([key]) => key !== "entity_id"
          )
        )
      : value;
    return keyed(
      `${this._value?.action}:${additional}`,
      html`<div class="field">
        <ha-selector-object
          .hass=${this.hass}
          .selector=${{ object: {} }}
          .context=${{ draft_owner: this.value, draft_key: additional ? "$additional" : "$data", known_options: { action: this._value?.action, field: "data", target: this._value?.target } }}
          .dictionaryOnly=${true}
          .reservedKeys=${additional ? this._dataEditorKeys(service) : separateEntity ? ["entity_id"] : []}
          .manualOptions=${manualOptions}
          .label=${this._lang.text(this.hass.localize, additional ? "ui.components.object-editor.additional_data" : "ui.components.service-control.action_data")}
          .value=${displayValue}
          .required=${true}
          .disabled=${this.disabled}
          .dataAdditional=${additional}
          @value-changed=${this._dictionaryDataChanged}
        ></ha-selector-object>
      </div>`
    );
  }

  private _dictionaryDataChanged(ev: CustomEvent<{ value: unknown }>) {
    ev.stopPropagation();
    const value = ev.detail.value;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return;
    }
    const additional = (
      ev.currentTarget as HTMLElement & { dataAdditional: boolean }
    ).dataAdditional;
    const keys = this._dataEditorKeys(
      this._getServiceInfo(this._value?.action, this.hass.services)
    );
    const retained = additional
      ? Object.fromEntries(
          Object.entries(this._value?.data || {}).filter(([key]) =>
            keys.includes(key)
          )
        )
      : Object.fromEntries(
          Object.entries(this._value?.data || {}).filter(
            ([key]) =>
              key === "entity_id" &&
              this._getServiceInfo(
                this._value?.action,
                this.hass.services
              )?.flatFields.some((field) => field.key === "entity_id")
          )
        );
    fireEvent(this, "value-changed", {
      value: { ...this._value, data: { ...value, ...retained } },
    });
  }

  private _getSectionDescription(
    dataField: ExtHassService["fields"][number],
    domain: string | undefined,
    serviceName: string | undefined
  ) {
    return this.hass!.localize(
      `component.${domain}.services.${serviceName}.sections.${dataField.key}.description`,
      domain && serviceName
        ? this.hass.services[domain][serviceName].description_placeholders
        : undefined
    );
  }

  private _hasFilteredFields(
    dataFields: ExtHassService["fields"],
    targetEntities: string[] | null
  ) {
    return dataFields.some(
      (dataField) =>
        !dataField.filter || this._filterField(dataField.filter, targetEntities)
    );
  }

  private _renderField = (
    dataField: ExtHassService["fields"][number],
    hasOptional: boolean,
    domain: string | undefined,
    serviceName: string | undefined,
    targetEntities: string[] | null
  ) => {
    const filter = dataField.filter;
    const fieldEntities =
      filter && targetEntities
        ? targetEntities.filter((entityId) =>
            this._matchesFieldTarget(filter, entityId)
          )
        : targetEntities;
    if (filter && fieldEntities?.length === 0) {
      return nothing;
    }

    const fieldValue = this._fieldValue(dataField.key);
    const fieldDataHasTemplate = hasTemplate(fieldValue);
    const adapterKind = actionFieldAdapterKind(
      this._value?.action,
      dataField.key,
      fieldValue
    );

    const toneOptions =
      this._value?.action === "siren.turn_on" && dataField.key === "tone"
        ? sirenToneChoices(this.hass, fieldEntities)
        : [];
    const selector: Selector =
      fieldDataHasTemplate && typeof fieldValue === "string"
        ? { template: null }
        : fieldDataHasTemplate && typeof fieldValue === "object"
          ? { object: null }
          : (this._stickySelector[dataField.key] ??
            (toneOptions.length
              ? { select: { options: toneOptions, custom_value: true } }
              : (dataField?.selector ?? { object: {} })));

    if (fieldDataHasTemplate) {
      // Hold this selector type until the field is cleared
      this._stickySelector[dataField.key] = selector;
    }

    const showOptional = showOptionalToggle(dataField);
    const descriptionPlaceholders =
      domain && serviceName
        ? this.hass.services[domain][serviceName].description_placeholders
        : undefined;

    if (!dataField.selector) {
      return "";
    }

    const inline = isBooleanSelector(selector);
    const disabled =
      this.disabled ||
      (showOptional &&
        !this._checkedKeys.has(dataField.key) &&
        fieldValue === undefined);
    const selectorTemplate = adapterKind
      ? html`<ha-action-field-adapter
          .hass=${this.hass}
          .kind=${adapterKind}
          .key=${dataField.key}
          .value=${fieldValue}
          .disabled=${disabled}
          .required=${dataField.required}
          @value-changed=${this._serviceDataChanged}
        ></ha-action-field-adapter>`
      : html`<ha-selector
          .context=${{
            ...this._selectorContext(fieldEntities, this.stringBuilder),
            allow_local_media:
              this._value?.action === "media_player.play_media" &&
              dataField.key === "media",
            draft_owner: this.value,
            draft_key: dataField.key,
            known_options: {
              action: this._value?.action,
              field: dataField.key,
              target: this._value?.target,
              entityIds: fieldEntities || undefined,
              language: this._value?.data?.language,
            },
          }}
          .disabled=${disabled}
          .hass=${this.hass}
          .selector=${selector}
          .key=${dataField.key}
          @value-changed=${this._serviceDataChanged}
          .value=${toneOptions.length && typeof fieldValue === "number" ? String(fieldValue) : fieldValue}
          .placeholder=${dataField.default}
          .localizeValue=${this._localizeValueCallback}
          .required=${dataField.required}
        ></ha-selector>`;

    // `hasOptional` is kept in the signature for callers; the toggle now sits
    // at the end of the row, so no spacer is needed.
    void hasOptional;

    return html`<div class="field">
      <div class="field-head">
        <span class="field-tile"
          ><ha-svg-icon .path=${mdiTuneVariant}></ha-svg-icon
        ></span>
        <div class="field-text">
          <span
            class="field-heading ${showOptional ? "clickable" : ""}"
            @click=${showOptional ? this._toggleCheckbox : undefined}
            >${
              this.hass.localize(
                `component.${domain}.services.${serviceName}.fields.${dataField.key}.name`,
                descriptionPlaceholders
              ) ||
              dataField.name ||
              dataField.key
            }</span
          >
          <span
            class="field-description ${showOptional ? "clickable" : ""}"
            @click=${showOptional ? this._toggleCheckbox : undefined}
            ><ha-markdown
              breaks
              allow-svg
              .content=${
                this.hass.localize(
                  `component.${domain}.services.${serviceName}.fields.${dataField.key}.description`,
                  descriptionPlaceholders
                ) || dataField?.description
              }
            ></ha-markdown>
          </span>
        </div>
        ${
          inline
            ? html`<div class="field-inline">${selectorTemplate}</div>`
            : nothing
        }
        ${
          showOptional
            ? html`<ha-switch
                .key=${dataField.key}
                .checked=${
                  this._checkedKeys.has(dataField.key) ||
                  fieldValue !== undefined
                }
                .disabled=${this.disabled}
                @change=${this._checkboxChanged}
              ></ha-switch>`
            : nothing
        }
      </div>
      ${inline ? nothing : html`<div class="field-control">${selectorTemplate}</div>`}
    </div>`;
  };

  private _selectorContext = memoizeOne(
    (targetEntities: string[] | null, stringBuilder: boolean) => ({
      filter_entity: targetEntities || undefined,
      string_builder: stringBuilder,
      common_options_only: true,
    })
  );

  private _localizeValueCallback = (
    key: string,
    values?: Record<string, string>
  ) => {
    if (!this._value?.action) {
      return "";
    }
    return this.hass.localize(
      `component.${computeDomain(this._value.action)}.selector.${key}`,
      values
    );
  };

  private _toggleCheckbox(ev: HASSDomCurrentTargetEvent<HTMLElement>) {
    const toggle = (ev.currentTarget as HTMLElement)
      ?.closest(".field")
      ?.querySelector("ha-switch");
    if (!toggle || toggle.disabled) {
      return;
    }
    toggle.checked = !toggle.checked;
    toggle.dispatchEvent(new Event("change"));
  }

  private _checkboxChanged(
    ev: HASSDomCurrentTargetEvent<HaSwitch & { key: string }>
  ) {
    const checked = ev.currentTarget.checked;
    const key = ev.currentTarget.key;
    let data;

    if (checked) {
      this._checkedKeys.add(key);
      const field = this._getServiceInfo(
        this._value?.action,
        this.hass.services
      )?.flatFields.find((_field) => _field.key === key);

      let defaultValue = field?.default;

      if (defaultValue == null && field?.selector) {
        defaultValue =
          "object" in field.selector
            ? {}
            : getSelectorFallbackValue(field.selector);
      }

      if (defaultValue != null) {
        data = {
          ...this._value?.data,
          [key]: defaultValue,
        };
      }
    } else {
      clearObjectDraft(this.value, key);
      this._checkedKeys.delete(key);
      data = { ...this._value?.data };
      if (
        key === "media" &&
        this._usesLegacyMedia(
          this._getServiceInfo(this._value?.action, this.hass.services)
        )
      ) {
        delete data.media_content_id;
        delete data.media_content_type;
        this._legacyMediaValue = undefined;
      }
      delete data[key];
      delete this._stickySelector[key];
    }
    if (data) {
      fireEvent(this, "value-changed", {
        value: {
          ...this._value,
          data,
        },
      });
    }
    this.requestUpdate("_checkedKeys");
  }

  private _serviceChanged(ev: ValueChangedEvent<string>) {
    ev.stopPropagation();
    if (ev.detail.value === this._value?.action) {
      return;
    }

    const newService = ev.detail.value || "";
    let target: HassServiceTargetWithExclude | undefined;

    if (newService) {
      const serviceData = this._getServiceInfo(newService, this.hass.services);
      const currentTarget = this._value?.target;
      if (currentTarget && serviceData?.target) {
        const data = this._value!.data;
        target = filterTargetForSelector(
          {
            entity_id: currentTarget.entity_id || data?.entity_id,
            device_id: currentTarget.device_id || data?.device_id,
            area_id: currentTarget.area_id || data?.area_id,
            floor_id: currentTarget.floor_id || data?.floor_id,
            label_id: currentTarget.label_id || data?.label_id,
            exclude: currentTarget.exclude,
          },
          { target: { ...serviceData.target } },
          this.hass
        );
      }
    }

    const value = {
      action: newService,
      target,
    };

    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _entityPicked(ev: HASSDomEvent<{ value: string | undefined }>) {
    ev.stopPropagation();
    const newValue = ev.detail.value;
    if (this._value?.data?.entity_id === newValue) {
      return;
    }
    let value;
    if (!newValue && this._value?.data) {
      value = { ...this._value };
      delete value.data.entity_id;
    } else {
      value = {
        ...this._value,
        data: { ...this._value?.data, entity_id: ev.detail.value },
      };
    }
    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _targetChanged(
    ev: HASSDomEvent<{
      value: HassServiceTargetWithExclude | undefined;
      isValid?: boolean;
    }>
  ) {
    ev.stopPropagation();
    if (ev.detail.isValid === false) {
      // Don't clear an object selector that returns invalid YAML
      return;
    }
    const newValue = ev.detail.value;
    if (this._value?.target === newValue) {
      return;
    }
    let value;
    if (!newValue) {
      value = { ...this._value };
      delete value.target;
    } else {
      value = { ...this._value, target: ev.detail.value };
    }
    fireEvent(this, "value-changed", {
      value,
    });
  }

  private _serviceDataChanged(
    ev: HASSDomEvent<{ value: unknown; isValid?: boolean }> &
      HASSDomCurrentTargetEvent<HTMLElement & { key: string }>
  ) {
    ev.stopPropagation();
    if (ev.detail.isValid === false) {
      // Don't clear an object selector that returns invalid YAML
      return;
    }
    const key = ev.currentTarget.key;
    const value = ev.detail.value;
    if (
      key === "media" &&
      this._usesLegacyMedia(
        this._getServiceInfo(this._value?.action, this.hass.services)
      )
    ) {
      if (this.disabled) return;
      const picked = value as MediaSelectorValue | undefined;
      this._legacyMediaValue = picked;
      if (
        picked &&
        !picked.media_content_id &&
        !picked.media_content_type &&
        (picked.entity_id || picked.metadata?.browse_entity_id)
      ) {
        return;
      }
      const data = { ...this._value?.data };
      for (const mediaKey of [
        "media_content_id",
        "media_content_type",
      ] as const) {
        const mediaValue = picked?.[mediaKey];
        if (mediaValue === undefined || mediaValue === "") {
          delete data[mediaKey];
        } else data[mediaKey] = mediaValue;
      }
      fireEvent(this, "value-changed", { value: { ...this._value, data } });
      return;
    }
    if (
      this._value?.data?.[key] === value ||
      ((!this._value?.data || !(key in this._value.data)) &&
        (value === "" || value === undefined))
    ) {
      return;
    }

    const data = { ...this._value?.data, [key]: value };

    if (value === "" || value === undefined) {
      delete data[key];
      delete this._stickySelector[key];
    }

    fireEvent(this, "value-changed", {
      value: {
        ...this._value,
        data,
      },
    });
  }

  private async _fetchManifest(integration: string) {
    this._manifest = undefined;
    try {
      this._manifest = await fetchIntegrationManifest(this.hass, integration);
    } catch (_err: any) {
      // Ignore if loading manifest fails. Probably bad JSON in manifest
    }
  }

  static styles = css`
    .field {
      padding: var(--ha-space-2)
        var(--service-control-field-padding-inline, var(--ha-space-4));
      border-top: var(
        --service-control-items-border-top,
        1px solid var(--divider-color)
      );
    }
    .field-head {
      display: flex;
      align-items: center;
      gap: var(--ha-space-3);
      min-height: 48px;
    }
    .field-tile {
      flex: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-lg, 12px);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }
    .field-text {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .field-heading {
      font-weight: var(--ha-font-weight-medium);
      overflow-wrap: anywhere;
    }
    .field-description {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    .field-inline {
      flex: none;
    }
    .field-control {
      padding: var(--ha-space-1) 0 var(--ha-space-2);
    }
    .target-heading {
      margin: var(--service-control-padding, 0 var(--ha-space-4));
      padding-top: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
    }
    ha-service-picker,
    ha-entity-picker,
    ha-yaml-editor {
      display: block;
      margin: var(--service-control-padding, 0 var(--ha-space-4));
    }
    ha-selector.target-selector {
      display: block;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-top: var(
        --service-control-items-border-top,
        1px solid var(--divider-color)
      );
    }
    ha-yaml-editor {
      padding: var(--ha-space-4) 0;
    }
    p {
      margin: var(--service-control-padding, 0 var(--ha-space-4));
      padding: var(--ha-space-4) 0;
    }
    :host([hide-picker]) p {
      padding-top: 0;
    }
    .clickable {
      cursor: pointer;
    }
    .help-icon {
      color: var(--secondary-text-color);
    }
    .description {
      justify-content: space-between;
      display: flex;
      align-items: center;
      padding-right: 2px;
      padding-inline-end: 2px;
      padding-inline-start: initial;
    }
    .description p {
      direction: ltr;
    }
    ha-expansion-panel {
      --ha-card-border-radius: var(--ha-border-radius-square);
      --expansion-panel-summary-padding: 0 var(--ha-space-4);
      --expansion-panel-content-padding: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-service-control": HaServiceControl;
  }
}
