import { mdiHomeImportOutline, mdiPause, mdiPlay, mdiStop } from "@mdi/js";
import type { CSSResultGroup } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { computeStateDomain } from "../../../common/entity/compute_state_domain";
import { supportsFeature } from "../../../common/entity/supports-feature";
import { blankBeforePercent } from "../../../common/translations/blank_before_percent";
import "../../../components/entity/ha-battery-icon";
import "../../../components/ha-svg-icon";
import {
  apiContext,
  entitiesContext,
  internationalizationContext,
  statesContext,
} from "../../../data/context";
import { UNAVAILABLE } from "../../../data/entity/entity";
import type { EntityRegistryDisplayEntry } from "../../../data/entity/entity_registry";
import {
  findBatteryChargingEntity,
  findBatteryEntity,
} from "../../../data/entity/entity_registry";
import { forwardHaptic } from "../../../data/haptics";
import type { LawnMowerEntity } from "../../../data/lawn_mower";
import {
  LawnMowerEntityFeature,
  canDock,
  canStartMowing,
  canStop,
  isMowing,
} from "../../../data/lawn_mower";
import "../../../state-control/lawn_mower/ha-state-control-lawn_mower-status";
import type {
  HomeAssistant,
  HomeAssistantApi,
  HomeAssistantInternationalization,
} from "../../../types";
import "../components/ha-more-info-state-header";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-lawn_mower")
class MoreInfoLawnMower extends LitElement {
  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: HomeAssistant["states"];

  @state()
  @consume({ context: entitiesContext, subscribe: true })
  private _entities!: HomeAssistant["entities"];

  @property({ attribute: false }) public stateObj?: LawnMowerEntity;

  private _deviceEntities = memoizeOne(
    (
      deviceId: string,
      entities: HomeAssistant["entities"]
    ): EntityRegistryDisplayEntry[] => {
      const entries = Object.values(entities);
      return entries.filter((entity) => entity.device_id === deviceId);
    }
  );

  private get _supportsStartPause(): boolean {
    if (!this.stateObj) return false;
    return (
      supportsFeature(this.stateObj, LawnMowerEntityFeature.START_MOWING) ||
      supportsFeature(this.stateObj, LawnMowerEntityFeature.PAUSE)
    );
  }

  private get _showPause(): boolean {
    if (!this.stateObj) return false;
    return (
      isMowing(this.stateObj) &&
      supportsFeature(this.stateObj, LawnMowerEntityFeature.PAUSE)
    );
  }

  private get _startPauseIcon(): string {
    return this._showPause ? mdiPause : mdiPlay;
  }

  private get _startPauseLabel(): string {
    if (!this.stateObj) return "";
    return this._showPause
      ? this._i18n.localize("ui.dialogs.more_info_control.lawn_mower.pause")
      : this._i18n.localize(
          "ui.dialogs.more_info_control.lawn_mower.start_mowing"
        );
  }

  private get _startPauseDisabled(): boolean {
    if (!this.stateObj) return true;
    if (this.stateObj.state === UNAVAILABLE) return true;
    if (this._showPause) return false;
    return (
      !supportsFeature(this.stateObj, LawnMowerEntityFeature.START_MOWING) ||
      !canStartMowing(this.stateObj)
    );
  }

  private _renderBattery() {
    if (!this.stateObj) {
      return nothing;
    }

    const deviceId = this._entities[this.stateObj.entity_id]?.device_id;
    const entities = deviceId
      ? this._deviceEntities(deviceId, this._entities)
      : [];

    const batteryEntity = findBatteryEntity(this._states, entities);
    const battery = batteryEntity
      ? this._states[batteryEntity.entity_id]
      : undefined;
    const batteryDomain = battery ? computeStateDomain(battery) : undefined;

    if (
      battery &&
      (batteryDomain === "binary_sensor" || !isNaN(battery.state as any))
    ) {
      const batteryChargingEntity = findBatteryChargingEntity(
        this._states,
        entities
      );
      const batteryCharging = batteryChargingEntity
        ? this._states[batteryChargingEntity?.entity_id]
        : undefined;

      return html`
        <span class="battery" slot="after-time">
          ${
            batteryDomain === "binary_sensor"
              ? nothing
              : html`<span
                  >${Number(battery.state).toFixed()}${blankBeforePercent(
                    this._i18n.locale
                  )}%</span
                >`
          }
          <ha-battery-icon
            .batteryStateObj=${battery}
            .batteryChargingStateObj=${batteryCharging}
          ></ha-battery-icon>
        </span>
      `;
    }

    return nothing;
  }

  private _handleStartPause() {
    if (!this.stateObj) return;
    forwardHaptic(this, "light");
    if (this._showPause) {
      this._api.callService("lawn_mower", "pause", {
        entity_id: this.stateObj.entity_id,
      });
    } else {
      this._api.callService("lawn_mower", "start_mowing", {
        entity_id: this.stateObj.entity_id,
      });
    }
  }

  private _handleStop() {
    if (!this.stateObj) return;
    forwardHaptic(this, "light");
    this._api.callService("lawn_mower", "stop", {
      entity_id: this.stateObj.entity_id,
    });
  }

  private _handleDock() {
    if (!this.stateObj) return;
    forwardHaptic(this, "light");
    this._api.callService("lawn_mower", "dock", {
      entity_id: this.stateObj.entity_id,
    });
  }

  protected render() {
    if (!this.stateObj || !this._i18n) {
      return nothing;
    }

    const stateObj = this.stateObj;
    const isUnavailable = stateObj.state === UNAVAILABLE;
    const supportsStop = supportsFeature(stateObj, LawnMowerEntityFeature.STOP);
    const supportsDock = supportsFeature(stateObj, LawnMowerEntityFeature.DOCK);

    const hasAnyCommand =
      this._supportsStartPause || supportsStop || supportsDock;

    return html`
      <ha-more-info-state-header .stateObj=${this.stateObj}>
        ${this._renderBattery()}
      </ha-more-info-state-header>

      <div class="controls">
        <ha-state-control-lawn_mower-status
          .stateObj=${this.stateObj}
        ></ha-state-control-lawn_mower-status>

        ${
          hasAnyCommand
            ? html`
                <div class="round-buttons">
                  ${
                    this._supportsStartPause
                      ? html`
                          <button
                            type="button"
                            class="round primary"
                            aria-label=${this._startPauseLabel}
                            title=${this._startPauseLabel}
                            @click=${this._handleStartPause}
                            .disabled=${this._startPauseDisabled}
                          >
                            <ha-svg-icon
                              .path=${this._startPauseIcon}
                            ></ha-svg-icon>
                          </button>
                        `
                      : nothing
                  }
                  ${
                    supportsStop
                      ? html`
                          <button
                            type="button"
                            class="round"
                            aria-label=${this._i18n.localize(
                              "ui.dialogs.more_info_control.lawn_mower.stop"
                            )}
                            title=${this._i18n.localize(
                              "ui.dialogs.more_info_control.lawn_mower.stop"
                            )}
                            @click=${this._handleStop}
                            .disabled=${isUnavailable || !canStop(stateObj)}
                          >
                            <ha-svg-icon .path=${mdiStop}></ha-svg-icon>
                          </button>
                        `
                      : nothing
                  }
                  ${
                    supportsDock
                      ? html`
                          <button
                            type="button"
                            class="round"
                            aria-label=${this._i18n.localize(
                              "ui.dialogs.more_info_control.lawn_mower.dock"
                            )}
                            title=${this._i18n.localize(
                              "ui.dialogs.more_info_control.lawn_mower.dock"
                            )}
                            @click=${this._handleDock}
                            .disabled=${isUnavailable || !canDock(stateObj)}
                          >
                            <ha-svg-icon
                              .path=${mdiHomeImportOutline}
                            ></ha-svg-icon>
                          </button>
                        `
                      : nothing
                  }
                </div>
              `
            : nothing
        }
      </div>
    `;
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      moreInfoBoardStyle,
      css`
        .battery {
          display: inline-flex;
          align-items: center;
          gap: var(--ha-space-1);
          font-size: var(--ha-font-size-m);
          color: var(--secondary-text-color);
          --mdc-icon-size: 18px;
        }

        .battery span {
          height: var(--mdc-icon-size);
          line-height: var(--mdc-icon-size);
        }

        ha-state-control-lawn_mower-status {
          margin-bottom: var(--ha-space-4);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-lawn_mower": MoreInfoLawnMower;
  }
}
