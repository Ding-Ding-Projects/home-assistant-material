import type { ContextType } from "@lit/context";
import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import "../components/entity/state-badge";
import "../components/ha-control-select-menu";
import { SELECT_TILES_MAX_OPTIONS } from "../state-control/select/ha-state-control-select-tiles";
import "../components/ha-generic-picker";
import { createOptionPicker, SELECT_PICKER_MIN_OPTIONS } from "./option-picker";
import type { HaDropdownSelectEvent } from "../components/ha-dropdown";
import { apiContext, formattersContext } from "../data/context";
import { UNAVAILABLE } from "../data/entity/entity";
import type { SelectEntity } from "../data/select";
import { setSelectOption } from "../data/select";

@customElement("state-card-select")
class StateCardSelect extends LitElement {
  @property({ attribute: false }) public stateObj!: SelectEntity;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters?: ContextType<typeof formattersContext>;

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  private _optionPicker = createOptionPicker();

  protected render(): TemplateResult {
    const options = this.stateObj.attributes.options.map((option) => ({
      value: option,
      label:
        this._formatters?.formatEntityState(this.stateObj, option) ?? option,
    }));

    if (options.length <= SELECT_TILES_MAX_OPTIONS) {
      return html`
        <ha-state-control-select-tiles
          .options=${options}
          .value=${this.stateObj.state}
          .disabled=${this.stateObj.state === UNAVAILABLE}
          @tile-selected=${this._tileSelected}
        ></ha-state-control-select-tiles>
      `;
    }

    if (options.length >= SELECT_PICKER_MIN_OPTIONS) {
      // Long lists open the existing picker sheet with a search field on top.
      const picker = this._optionPicker(options);
      return html`
        <state-badge .stateObj=${this.stateObj}></state-badge>
        <ha-generic-picker
          .label=${this._formatters?.formatEntityName(this.stateObj, {
            type: "entity",
          })}
          .value=${this.stateObj.state}
          .getItems=${picker.getItems}
          .valueRenderer=${picker.valueRenderer}
          .disabled=${this.stateObj.state === UNAVAILABLE}
          hide-clear-icon
          @value-changed=${this._pickerChanged}
        ></ha-generic-picker>
      `;
    }

    return html`
      <state-badge .stateObj=${this.stateObj}></state-badge>
      <ha-control-select-menu
        .value=${this.stateObj.state}
        .label=${this._formatters?.formatEntityName(this.stateObj, {
          type: "entity",
        })}
        .options=${options}
        .disabled=${this.stateObj.state === UNAVAILABLE}
        hide-label
        show-arrow
        @wa-select=${this._selectedOptionChanged}
      ></ha-control-select-menu>
    `;
  }

  private _tileSelected(ev: CustomEvent<{ value: string }>) {
    this._select(ev.detail.value);
  }

  private _pickerChanged(ev: CustomEvent<{ value?: string }>) {
    ev.stopPropagation();
    this._select(ev.detail.value);
  }

  private async _selectedOptionChanged(ev: HaDropdownSelectEvent) {
    this._select(ev.detail.item?.value);
  }

  private async _select(option?: string) {
    if (
      !option ||
      option === this.stateObj.state ||
      !this.stateObj.attributes.options.includes(option)
    ) {
      return;
    }
    await setSelectOption(
      this._api.callService,
      this.stateObj.entity_id,
      option
    );
  }

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
    }

    ha-control-select-menu,
    ha-generic-picker {
      width: 100%;
      min-width: 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "state-card-select": StateCardSelect;
  }
}
