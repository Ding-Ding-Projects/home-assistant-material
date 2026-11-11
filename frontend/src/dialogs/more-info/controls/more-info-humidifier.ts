import type { ContextType } from "@lit/context";
import { mdiPower } from "@mdi/js";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { supportsFeature } from "../../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-control-button";
import "../../../components/ha-svg-icon";
import { UNAVAILABLE } from "../../../data/entity/entity";
import { apiContext, formattersContext } from "../../../data/context";
import type { HumidifierEntity } from "../../../data/humidifier";
import { HumidifierEntityFeature } from "../../../data/humidifier";
import "../../../state-control/humidifier/ha-state-control-humidifier-humidity";
import { moreInfoControlStyle } from "../components/more-info-control-style";

@customElement("more-info-humidifier")
class MoreInfoHumidifier extends LitElement {
  @property({ attribute: false }) public stateObj?: HumidifierEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: ContextType<typeof apiContext>;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: ContextType<typeof formattersContext>;

  @state() public _mode?: string;

  protected willUpdate(changedProps: PropertyValues<this>): void {
    super.willUpdate(changedProps);
    if (changedProps.has("stateObj")) {
      this._mode = this.stateObj?.attributes.mode;
    }
  }

  protected render() {
    if (!this.stateObj) {
      return nothing;
    }

    const stateObj = this.stateObj;

    const supportModes = supportsFeature(
      stateObj,
      HumidifierEntityFeature.MODES
    );

    const unavailable = stateObj.state === UNAVAILABLE;
    const isOn = stateObj.state === "on";
    const hasTarget = stateObj.attributes.humidity != null;
    const summary = [
      stateObj.attributes.action
        ? `${this._formatters.formatEntityAttributeValue(stateObj, "action")}.`
        : undefined,
      stateObj.attributes.current_humidity != null
        ? this._localize("ui.dialogs.more_info_control.humidifier.now", {
            value: this._formatters.formatEntityAttributeValue(
              stateObj,
              "current_humidity"
            ),
          })
        : undefined,
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      <div class="hero">
        <div class="target">
          ${
            hasTarget
              ? this._formatters.formatEntityAttributeValue(
                  stateObj,
                  "humidity"
                )
              : this._formatters.formatEntityState(stateObj)
          }
        </div>
        ${summary ? html`<div class="summary">${summary}</div>` : nothing}
      </div>

      <div class="controls">
        <ha-state-control-humidifier-humidity
          .stateObj=${stateObj}
        ></ha-state-control-humidifier-humidity>
        <div class="round-actions">
          <ha-control-button
            class=${classMap({ round: true, primary: isOn })}
            .label=${this._formatters.formatEntityState(
              stateObj,
              isOn ? "off" : "on"
            )}
            .disabled=${unavailable}
            .value=${isOn ? "off" : "on"}
            @click=${this._handleTogglePower}
          >
            <ha-svg-icon .path=${mdiPower}></ha-svg-icon>
          </ha-control-button>
        </div>
      </div>

      ${
        supportModes
          ? html`
              <div class="chips" role="group">
                ${(stateObj.attributes.available_modes ?? []).map(
                  (mode) => html`
                    <button
                      type="button"
                      class=${classMap({
                        chip: true,
                        selected: mode === this._mode,
                      })}
                      aria-pressed=${mode === this._mode}
                      .disabled=${unavailable}
                      .mode=${mode}
                      @click=${this._handleModeClick}
                    >
                      ${this._formatters.formatEntityAttributeValue(
                        stateObj,
                        "mode",
                        mode
                      )}
                    </button>
                  `
                )}
              </div>
            `
          : nothing
      }
    `;
  }

  private _handleTogglePower(ev: Event) {
    const newVal = (ev.currentTarget as HTMLElement & { value: string }).value;
    this._callServiceHelper(
      this.stateObj!.state,
      newVal,
      newVal === "on" ? "turn_on" : "turn_off",
      {}
    );
  }

  private _handleModeClick(ev: Event) {
    const mode = (ev.currentTarget as HTMLElement & { mode: string }).mode;
    this._mode = mode;
    this._callServiceHelper(this.stateObj!.attributes.mode, mode, "set_mode", {
      mode,
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

    await this._api.callService("humidifier", service, data);

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
          color: var(--primary-color);
          direction: ltr;
        }
        .summary {
          color: var(--secondary-text-color);
        }
        .round-actions {
          display: flex;
          justify-content: center;
          gap: var(--ha-space-3);
        }
        .round {
          --control-button-border-radius: 50%;
          width: 56px;
          height: 56px;
          flex: none;
        }
        .round.primary {
          --control-button-background-color: var(--primary-color);
          --control-button-background-opacity: 1;
          --control-button-icon-color: var(--text-primary-color);
        }
        .chips {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: var(--ha-space-2);
        }
        .chip {
          min-height: 36px;
          padding: 0 var(--ha-space-4);
          border-radius: var(--ha-border-radius-lg);
          border: 1px solid var(--divider-color);
          background: none;
          color: var(--primary-text-color);
          font: inherit;
          font-weight: var(--ha-font-weight-medium);
          cursor: pointer;
        }
        .chip.selected {
          background: var(--secondary-background-color);
          border-color: var(--primary-color);
          color: var(--primary-color);
        }
        .chip:disabled {
          opacity: 0.5;
          cursor: default;
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-humidifier": MoreInfoHumidifier;
  }
}
