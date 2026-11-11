import type { ContextType } from "@lit/context";
import {
  mdiArrowOscillating,
  mdiFan,
  mdiCheck,
  mdiThermometer,
  mdiWaterPercent,
} from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-attribute-icon";
import "../../../components/ha-control-select-menu";
import "../../../components/ha-icon-button-group";
import "../../../components/ha-icon-button-toggle";
import "../../../components/ha-select";
import "../../../components/ha-switch";
import type { ClimateEntity } from "../../../data/climate";
import {
  ClimateEntityFeature,
  compareClimateHvacModes,
} from "../../../data/climate";
import { apiContext, formattersContext } from "../../../data/context";
import { UNAVAILABLE } from "../../../data/entity/entity";
import "../../../state-control/climate/ha-state-control-climate-humidity";
import "../../../state-control/climate/ha-state-control-climate-temperature";
import "../components/ha-more-info-control-select-container";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";
import type { HaDropdownSelectEvent } from "../../../components/ha-dropdown";

type MainControl = "temperature" | "humidity";

@customElement("more-info-climate")
class MoreInfoClimate extends LitElement {
  @property({ attribute: false }) public stateObj?: ClimateEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: ContextType<typeof formattersContext>;

  @state() private _mainControl: MainControl = "temperature";

  private _renderFanModeIcon = (value: string) =>
    html`<ha-attribute-icon
      .stateObj=${this.stateObj}
      attribute="fan_mode"
      .attributeValue=${value}
    ></ha-attribute-icon>`;

  private _renderSwingModeIcon = (value: string) =>
    html`<ha-attribute-icon
      .stateObj=${this.stateObj}
      attribute="swing_mode"
      .attributeValue=${value}
    ></ha-attribute-icon>`;

  private _renderSwingHorizontalModeIcon = (value: string) =>
    html`<ha-attribute-icon
      .stateObj=${this.stateObj}
      attribute="swing_horizontal_mode"
      .attributeValue=${value}
    ></ha-attribute-icon>`;

  protected willUpdate(changedProps: PropertyValues<this>): void {
    if (
      changedProps.has("stateObj") &&
      this.stateObj &&
      this._mainControl === "humidity" &&
      !supportsFeature(this.stateObj, ClimateEntityFeature.TARGET_HUMIDITY)
    ) {
      this._mainControl = "temperature";
    }
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const stateObj = this.stateObj;

    const supportTargetHumidity = supportsFeature(
      stateObj,
      ClimateEntityFeature.TARGET_HUMIDITY
    );
    const supportFanMode = supportsFeature(
      stateObj,
      ClimateEntityFeature.FAN_MODE
    );
    const supportPresetMode = supportsFeature(
      stateObj,
      ClimateEntityFeature.PRESET_MODE
    );
    const supportSwingMode = supportsFeature(
      stateObj,
      ClimateEntityFeature.SWING_MODE
    );
    const supportSwingHorizontalMode = supportsFeature(
      stateObj,
      ClimateEntityFeature.SWING_HORIZONTAL_MODE
    );

    const currentTemperature = this.stateObj.attributes.current_temperature;
    const currentHumidity = this.stateObj.attributes.current_humidity;

    const targetTemperature = stateObj.attributes.temperature;
    const hvacAction = stateObj.attributes.hvac_action;
    const headlineClass =
      hvacAction === "heating"
        ? "headline warn"
        : hvacAction === "cooling"
          ? "headline accent"
          : "headline";

    return html`
      <p class=${headlineClass}>
        ${
          targetTemperature != null
            ? this._formatters.formatEntityAttributeValue(
                stateObj,
                "temperature"
              )
            : this._formatters.formatEntityState(stateObj)
        }
      </p>
      <p class="subline">
        ${
          hvacAction
            ? html`${this._formatters.formatEntityAttributeValue(
                stateObj,
                "hvac_action"
              )}${currentTemperature != null ? ". " : nothing}`
            : nothing
        }
        ${
          currentTemperature != null
            ? html`${this._localize("ui.card.climate.currently")}
              ${this._formatters.formatEntityAttributeValue(
                stateObj,
                "current_temperature"
              )}`
            : nothing
        }
      </p>
      <div class="controls">
        ${
          this._mainControl === "temperature"
            ? html`
                <ha-state-control-climate-temperature
                  board
                  .stateObj=${this.stateObj}
                ></ha-state-control-climate-temperature>
              `
            : nothing
        }
        ${
          this._mainControl === "humidity"
            ? html`
                <ha-state-control-climate-humidity
                  .stateObj=${this.stateObj}
                ></ha-state-control-climate-humidity>
              `
            : nothing
        }
        ${
          supportTargetHumidity
            ? html`
                <ha-icon-button-group>
                  <ha-icon-button-toggle
                    .selected=${this._mainControl === "temperature"}
                    .disabled=${this.stateObj!.state === UNAVAILABLE}
                    .label=${this._localize(
                      "ui.dialogs.more_info_control.climate.temperature"
                    )}
                    .control=${"temperature"}
                    @click=${this._setMainControl}
                  >
                    <ha-svg-icon .path=${mdiThermometer}></ha-svg-icon>
                  </ha-icon-button-toggle>
                  <ha-icon-button-toggle
                    .selected=${this._mainControl === "humidity"}
                    .disabled=${this.stateObj!.state === UNAVAILABLE}
                    .label=${this._localize(
                      "ui.dialogs.more_info_control.climate.humidity"
                    )}
                    .control=${"humidity"}
                    @click=${this._setMainControl}
                  >
                    <ha-svg-icon .path=${mdiWaterPercent}></ha-svg-icon>
                  </ha-icon-button-toggle>
                </ha-icon-button-group>
              `
            : nothing
        }
      </div>
      <div
        class="segmented"
        role="group"
        aria-label=${this._localize("ui.card.climate.mode")}
      >
        ${stateObj.attributes.hvac_modes
          .concat()
          .sort(compareClimateHvacModes)
          .map(
            (mode) => html`
              <button
                type="button"
                aria-pressed=${stateObj.state === mode ? "true" : "false"}
                .disabled=${stateObj.state === UNAVAILABLE}
                .mode=${mode}
                @click=${this._handleOperationModeClick}
              >
                ${this._formatters.formatEntityState(stateObj, mode)}
              </button>
            `
          )}
      </div>
      ${
        supportPresetMode && stateObj.attributes.preset_modes
          ? html`
              <div
                class="chips"
                role="group"
                aria-label=${this._formatters.formatEntityAttributeName(
                  stateObj,
                  "preset_mode"
                )}
              >
                ${stateObj.attributes.preset_modes.map(
                  (mode) => html`
                    <button
                      type="button"
                      class="chip"
                      aria-pressed=${
                        stateObj.attributes.preset_mode === mode
                          ? "true"
                          : "false"
                      }
                      .disabled=${stateObj.state === UNAVAILABLE}
                      .mode=${mode}
                      @click=${this._handlePresetClick}
                    >
                      ${
                        stateObj.attributes.preset_mode === mode
                          ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                          : nothing
                      }
                      ${this._formatters.formatEntityAttributeValue(
                        stateObj,
                        "preset_mode",
                        mode
                      )}
                    </button>
                  `
                )}
              </div>
            `
          : nothing
      }
      ${
        currentHumidity != null
          ? html`
              <div class="tiles">
                <div class="tile">
                  <span class="label">
                    ${this._formatters.formatEntityAttributeName(
                      stateObj,
                      "current_humidity"
                    )}
                  </span>
                  <span class="value">
                    ${this._formatters.formatEntityAttributeValue(
                      stateObj,
                      "current_humidity"
                    )}
                  </span>
                </div>
              </div>
            `
          : nothing
      }
      <ha-more-info-control-select-container>
        ${
          supportFanMode && stateObj.attributes.fan_modes
            ? html`
                <ha-control-select-menu
                  .label=${this._formatters.formatEntityAttributeName(
                    stateObj,
                    "fan_mode"
                  )}
                  .value=${stateObj.attributes.fan_mode}
                  .disabled=${this.stateObj.state === UNAVAILABLE}
                  @wa-select=${this._handleFanModeChanged}
                  .options=${stateObj.attributes.fan_modes.map((mode) => ({
                    value: mode,
                    label: this._formatters.formatEntityAttributeValue(
                      stateObj,
                      "fan_mode",
                      mode
                    ),
                  }))}
                  .renderIcon=${this._renderFanModeIcon}
                >
                  <ha-svg-icon slot="icon" .path=${mdiFan}></ha-svg-icon>
                </ha-control-select-menu>
              `
            : nothing
        }
        ${
          supportSwingMode && stateObj.attributes.swing_modes
            ? html`
                <ha-control-select-menu
                  .label=${this._formatters.formatEntityAttributeName(
                    stateObj,
                    "swing_mode"
                  )}
                  .value=${stateObj.attributes.swing_mode}
                  .disabled=${this.stateObj.state === UNAVAILABLE}
                  @wa-select=${this._handleSwingmodeChanged}
                  .options=${stateObj.attributes.swing_modes.map((mode) => ({
                    value: mode,
                    label: this._formatters.formatEntityAttributeValue(
                      stateObj,
                      "swing_mode",
                      mode
                    ),
                  }))}
                  .renderIcon=${this._renderSwingModeIcon}
                >
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiArrowOscillating}
                  ></ha-svg-icon>
                </ha-control-select-menu>
              `
            : nothing
        }
        ${
          supportSwingHorizontalMode &&
          stateObj.attributes.swing_horizontal_modes
            ? html`
                <ha-control-select-menu
                  .label=${this._formatters.formatEntityAttributeName(
                    stateObj,
                    "swing_horizontal_mode"
                  )}
                  .value=${stateObj.attributes.swing_horizontal_mode}
                  .disabled=${this.stateObj.state === UNAVAILABLE}
                  @wa-select=${this._handleSwingHorizontalmodeChanged}
                  .options=${stateObj.attributes.swing_horizontal_modes.map(
                    (mode) => ({
                      value: mode,
                      label: this._formatters.formatEntityAttributeValue(
                        stateObj,
                        "swing_horizontal_mode",
                        mode
                      ),
                    })
                  )}
                  .renderIcon=${this._renderSwingHorizontalModeIcon}
                >
                  <ha-svg-icon
                    slot="icon"
                    .path=${mdiArrowOscillating}
                  ></ha-svg-icon>
                </ha-control-select-menu>
              `
            : nothing
        }
      </ha-more-info-control-select-container>
    `;
  }

  private _setMainControl(ev: any) {
    ev.stopPropagation();
    this._mainControl = ev.currentTarget.control;
  }

  private _handleFanModeChanged(ev: HaDropdownSelectEvent) {
    const newVal = ev.detail.item.value;
    this._callServiceHelper(
      this.stateObj!.attributes.fan_mode,
      newVal,
      "set_fan_mode",
      { fan_mode: newVal }
    );
  }

  private _handleOperationModeClick(ev: Event) {
    const newVal = (ev.currentTarget as HTMLButtonElement & { mode: string })
      .mode;
    this._callServiceHelper(this.stateObj!.state, newVal, "set_hvac_mode", {
      hvac_mode: newVal,
    });
  }

  private _handleSwingmodeChanged(ev: HaDropdownSelectEvent) {
    const newVal = ev.detail.item.value;
    this._callServiceHelper(
      this.stateObj!.attributes.swing_mode,
      newVal,
      "set_swing_mode",
      { swing_mode: newVal }
    );
  }

  private _handleSwingHorizontalmodeChanged(ev: HaDropdownSelectEvent) {
    const newVal = ev.detail.item.value;
    this._callServiceHelper(
      this.stateObj!.attributes.swing_horizontal_mode,
      newVal,
      "set_swing_horizontal_mode",
      { swing_horizontal_mode: newVal }
    );
  }

  private _handlePresetClick(ev: Event) {
    const newVal = (ev.currentTarget as HTMLButtonElement & { mode: string })
      .mode;
    this._callServiceHelper(
      this.stateObj!.attributes.preset_mode,
      newVal,
      "set_preset_mode",
      { preset_mode: newVal }
    );
  }

  private async _callServiceHelper(
    oldVal: unknown,
    newVal: unknown,
    service: string,
    data: {
      entity_id?: string;
      [key: string]: unknown;
    }
  ) {
    if (oldVal === newVal) {
      return;
    }

    data.entity_id = this.stateObj!.entity_id;
    const curState = this.stateObj;

    await this._api.callService("climate", service, data);

    // We reset stateObj to re-sync the inputs with the state. It will be out
    // of sync if our service call did not result in the entity to be turned
    // on. Since the state is not changing, the resync is not called automatic.
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });

    // No need to resync if we received a new state.
    if (this.stateObj !== curState) {
      return;
    }

    this.stateObj = undefined;
    await this.updateComplete;
    // Only restore if not set yet by a state change
    if (this.stateObj === undefined) {
      this.stateObj = curState;
    }
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      moreInfoBoardStyle,
      css`
        :host {
          color: var(--primary-text-color);
          gap: var(--ha-space-4);
        }
        .controls:not(:last-child) {
          margin-bottom: 0;
        }

        ha-select {
          width: 100%;
          margin-top: var(--ha-space-2);
        }

        .container-humidity .single-row {
          display: flex;
          height: 50px;
        }

        .target-humidity {
          width: 90px;
          font-size: var(--ha-font-size-3xl);
          margin: auto;
          direction: ltr;
        }

        .single-row {
          padding: var(--ha-space-2) 0;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-climate": MoreInfoClimate;
  }
}
