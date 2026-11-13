import type { ContextType } from "@lit/context";
import { mdiAccountArrowRight, mdiCheck } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import { UNAVAILABLE } from "../../../data/entity/entity";
import type { WaterHeaterEntity } from "../../../data/water_heater";
import {
  WaterHeaterEntityFeature,
  compareWaterHeaterOperationMode,
} from "../../../data/water_heater";
import { apiContext, formattersContext } from "../../../data/context";
import "../../../state-control/water_heater/ha-state-control-water_heater-temperature";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-water_heater")
class MoreInfoWaterHeater extends LitElement {
  @property({ attribute: false }) public stateObj?: WaterHeaterEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: ContextType<typeof formattersContext>;

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const stateObj = this.stateObj;

    const supportOperationMode = supportsFeature(
      stateObj,
      WaterHeaterEntityFeature.OPERATION_MODE
    );

    const supportAwayMode = supportsFeature(
      stateObj,
      WaterHeaterEntityFeature.AWAY_MODE
    );

    const currentTemperature = this.stateObj.attributes.current_temperature;

    const unavailable = stateObj.state === UNAVAILABLE;
    const hasTarget = stateObj.attributes.temperature != null;
    const summary = [
      currentTemperature != null
        ? this._localize("ui.dialogs.more_info_control.water_heater.now", {
            value: this._formatters.formatEntityAttributeValue(
              stateObj,
              "current_temperature"
            ),
          })
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <div class="hero">
        ${
          hasTarget
            ? html`<div class="target">
                ${this._formatters.formatEntityAttributeValue(
                  stateObj,
                  "temperature"
                )}
              </div>`
            : nothing
        }
        ${summary ? html`<div class="summary">${summary}</div>` : nothing}
      </div>
      <div class="controls">
        <ha-state-control-water_heater-temperature
          board
          .stateObj=${stateObj}
        ></ha-state-control-water_heater-temperature>
      </div>
      ${
        supportOperationMode && stateObj.attributes.operation_list
          ? html`
              <div class="chips" role="group">
                ${stateObj.attributes.operation_list
                  .concat()
                  .sort(compareWaterHeaterOperationMode)
                  .map(
                    (mode) => html`
                      <button
                        type="button"
                        class=${classMap({
                          chip: true,
                          selected: mode === stateObj.state,
                        })}
                        aria-pressed=${mode === stateObj.state}
                        .disabled=${unavailable}
                        .mode=${mode}
                        @click=${this._handleOperationModeClick}
                      >
                        ${
                          mode === stateObj.state
                            ? html`<ha-svg-icon
                                class="check"
                                .path=${mdiCheck}
                              ></ha-svg-icon>`
                            : nothing
                        }
                        ${this._formatters.formatEntityState(stateObj, mode)}
                      </button>
                    `
                  )}
              </div>
            `
          : nothing
      }
      ${
        supportAwayMode
          ? html`
              <div class="row-item">
                <div class="row-icon">
                  <ha-svg-icon .path=${mdiAccountArrowRight}></ha-svg-icon>
                </div>
                <div class="row-text">
                  ${this._formatters.formatEntityAttributeName(
                    stateObj,
                    "away_mode"
                  )}
                </div>
                <ha-switch
                  .accessibleLabel=${this._formatters.formatEntityAttributeName(
                    stateObj,
                    "away_mode"
                  )}
                  .checked=${stateObj.attributes.away_mode === "on"}
                  .disabled=${unavailable}
                  @change=${this._handleAwayModeChanged}
                ></ha-switch>
              </div>
            `
          : nothing
      }
    `;
  }

  private _handleOperationModeClick(ev: Event) {
    const newVal = (ev.currentTarget as HTMLElement & { mode: string }).mode;
    this._callServiceHelper(
      this.stateObj!.state,
      newVal,
      "set_operation_mode",
      {
        operation_mode: newVal,
      }
    );
  }

  private _handleAwayModeChanged(ev: Event) {
    const newVal = (ev.target as HTMLInputElement).checked;
    const oldVal = this.stateObj!.attributes.away_mode === "on";

    this._callServiceHelper(oldVal, newVal, "set_away_mode", {
      away_mode: newVal,
    });
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

    await this._api.callService("water_heater", service, data);

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
      css`
        :host {
          color: var(--primary-text-color);
        }

        .hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          text-align: center;
          gap: var(--ha-space-1);
          margin-bottom: var(--ha-space-4);
        }
        .target {
          font-size: 56px;
          line-height: 64px;
          font-weight: var(--ha-font-weight-medium);
          color: var(--state-climate-heat-color, var(--primary-color));
          direction: ltr;
        }
        .summary {
          color: var(--secondary-text-color);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ha-space-1);
          padding: var(--ha-space-1);
          margin-bottom: var(--ha-space-4);
          border-radius: var(--ha-border-radius-3xl);
          background: var(--secondary-background-color);
        }
        .chip {
          display: inline-flex;
          align-items: center;
          min-height: 40px;
          padding: 0 var(--ha-space-4);
          border: none;
          border-radius: var(--ha-border-radius-3xl);
          background: transparent;
          color: var(--secondary-text-color);
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }
        .check {
          display: none;
        }
        .chip.selected {
          background: var(--card-background-color);
          color: var(--primary-text-color);
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
        }
        .chip:disabled {
          opacity: 0.5;
          cursor: default;
        }
        .row-item {
          display: flex;
          align-items: center;
          gap: var(--ha-space-4);
          padding: var(--ha-space-2) var(--ha-space-3);
        }
        .row-icon {
          display: grid;
          place-items: center;
          width: 40px;
          height: 40px;
          flex: none;
          border-radius: var(--ha-border-radius-lg);
          background: var(--secondary-background-color);
          color: var(--secondary-text-color);
        }
        .row-text {
          flex: 1;
          min-width: 0;
          font-weight: var(--ha-font-weight-medium);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-water_heater": MoreInfoWaterHeater;
  }
}
