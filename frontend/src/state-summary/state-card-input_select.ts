import type { ContextType } from "@lit/context";
import type { TemplateResult } from "lit";
import { css, html, LitElement } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../common/decorators/consume";
import { transform } from "../common/decorators/transform";
import "../components/entity/state-badge";
import "../components/ha-control-select-menu";
import { SELECT_TILES_MAX_OPTIONS } from "../state-control/select/ha-state-control-select-tiles";
import type { HaDropdownSelectEvent } from "../components/ha-dropdown";
import { apiContext, formattersContext } from "../data/context";
import { UNAVAILABLE } from "../data/entity/entity";
import type { InputSelectEntity } from "../data/input_select";
import { setInputSelectOption } from "../data/input_select";
import type { HomeAssistantFormatters } from "../types";

@customElement("state-card-input_select")
class StateCardInputSelect extends LitElement {
  @property({ attribute: false }) public stateObj!: InputSelectEntity;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  @transform<
    HomeAssistantFormatters,
    HomeAssistantFormatters["formatEntityName"] | undefined
  >({
    transformer: (formatters) => formatters?.formatEntityName,
  })
  private _formatEntityName?: HomeAssistantFormatters["formatEntityName"];

  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  protected render(): TemplateResult {
    const options = this.stateObj.attributes.options.map((option) => ({
      value: option,
      label: option,
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

    return html`
      <state-badge .stateObj=${this.stateObj}></state-badge>
      <ha-control-select-menu
        .label=${this._formatEntityName?.(this.stateObj, { type: "entity" })}
        .value=${this.stateObj.state}
        .options=${options}
        .disabled=${
          this.stateObj.state === UNAVAILABLE /* UNKNOWN state is allowed */
        }
        hide-label
        show-arrow
        @wa-select=${this._selectedOptionChanged}
      ></ha-control-select-menu>
    `;
  }

  private _tileSelected(ev: CustomEvent<{ value: string }>) {
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
    await setInputSelectOption(
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

    ha-control-select-menu {
      width: 100%;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "state-card-input_select": StateCardInputSelect;
  }
}
