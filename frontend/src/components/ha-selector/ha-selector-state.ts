import type { HassServiceTarget } from "home-assistant-js-websocket";
import type { PropertyValues } from "lit";
import { html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import {
  resolveEntityIDs,
  type StateSelector,
  type TargetSelector,
} from "../../data/selector";
import { SubscribeMixin } from "../../mixins/subscribe-mixin";
import type { HomeAssistant } from "../../types";
import "../entity/ha-entity-state-picker";
import "../entity/ha-entity-states-picker";
import type { PickerComboBoxItem } from "../ha-picker-combo-box";

@customElement("ha-selector-state")
export class HaSelectorState extends SubscribeMixin(LitElement) {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public selector!: StateSelector;

  @property() public value?: any;

  @property() public label?: string;

  @property() public helper?: string;

  @property({ type: Boolean }) public disabled = false;

  @property({ type: Boolean }) public required = true;

  @property({ attribute: false }) public context?: {
    common_options_only?: boolean;
    filter_attribute?: string;
    filter_entity?: string | string[];
    filter_target?: HassServiceTarget;
    target_selector?: TargetSelector;
  };

  @state() private _entityIds?: string | string[];

  private _resolutionGeneration = 0;

  private _convertExtraOptions = memoizeOne(
    (
      extraOptions?: { label: string; value: any }[]
    ): PickerComboBoxItem[] | undefined => {
      if (!extraOptions) {
        return undefined;
      }
      return extraOptions.map((option) => ({
        id: option.value,
        primary: option.label,
        sorting_label: option.label,
      }));
    }
  );

  willUpdate(changedProps: PropertyValues<this>) {
    const previousHass = changedProps.get("hass");
    if (
      changedProps.has("selector") ||
      changedProps.has("context") ||
      (changedProps.has("hass") &&
        (!previousHass ||
          previousHass.connection !== this.hass.connection ||
          previousHass.entities !== this.hass.entities ||
          previousHass.devices !== this.hass.devices ||
          previousHass.areas !== this.hass.areas ||
          previousHass.floors !== this.hass.floors))
    ) {
      const generation = ++this._resolutionGeneration;
      const connection = this.hass.connection;
      const context = this.context;
      const selector = this.selector;
      // Never show the previous target's suggestions while resolving a new one.
      this._entityIds = undefined;
      this._resolveEntityIds(
        selector.state?.entity_id,
        context?.filter_entity,
        context?.filter_target,
        context?.target_selector
      ).then(
        (entityIds) => {
          if (
            generation !== this._resolutionGeneration ||
            connection !== this.hass.connection ||
            context !== this.context ||
            selector !== this.selector
          ) {
            return;
          }
          this._entityIds = Array.isArray(entityIds)
            ? [...new Set(entityIds)]
            : entityIds;
        },
        () => {
          // Resolution failure leaves custom values intact, without suggesting
          // options from a stale target or connection.
        }
      );
    }
  }

  protected render() {
    const extraOptions = this._convertExtraOptions(
      this.selector.state?.extra_options
    );
    if (this.selector.state?.multiple) {
      return html`
        <ha-entity-states-picker
          .entityId=${this._entityIds}
          .commonOptionsOnly=${this.context?.common_options_only ?? false}
          .attribute=${
            this.selector.state?.attribute || this.context?.filter_attribute
          }
          .extraOptions=${extraOptions}
          .value=${this.value}
          .label=${this.label}
          .helper=${this.helper}
          .disabled=${this.disabled}
          .required=${this.required}
          allow-custom-value
          .hideStates=${this.selector.state?.hide_states}
        ></ha-entity-states-picker>
      `;
    }
    return html`
      <ha-entity-state-picker
        .entityId=${this._entityIds}
        .commonOptionsOnly=${this.context?.common_options_only ?? false}
        .attribute=${
          this.selector.state?.attribute || this.context?.filter_attribute
        }
        .extraOptions=${extraOptions}
        .value=${this.value}
        .label=${this.label}
        .helper=${this.helper}
        .disabled=${this.disabled}
        .required=${this.required}
        allow-custom-value
        .hideStates=${this.selector.state?.hide_states}
      ></ha-entity-state-picker>
    `;
  }

  private async _resolveEntityIds(
    selectorEntityId: string | string[] | undefined,
    contextFilterEntity: string | string[] | undefined,
    contextFilterTarget: HassServiceTarget | undefined,
    contextTargetSelector: TargetSelector | undefined
  ): Promise<string | string[] | undefined> {
    if (selectorEntityId !== undefined) {
      return selectorEntityId;
    }
    if (contextFilterEntity !== undefined) {
      return contextFilterEntity;
    }
    if (contextFilterTarget !== undefined) {
      return resolveEntityIDs(
        this.hass,
        contextFilterTarget,
        this.hass.entities,
        this.hass.devices,
        this.hass.areas,
        contextTargetSelector
      );
    }
    return undefined;
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-selector-state": HaSelectorState;
  }
}
