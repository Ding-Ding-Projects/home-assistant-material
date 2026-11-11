import { mdiCheck } from "@mdi/js";
import type { PropertyValues } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { styleMap } from "lit/directives/style-map";
import memoizeOne from "memoize-one";
import { consume } from "../../common/decorators/consume";
import { consumeLocalize } from "../../common/decorators/consume-context-entry";
import type { HASSDomEvent } from "../../common/dom/fire_event";
import { stateColorCss } from "../../common/entity/state_color";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../common/translations/localize";
import "../../components/ha-control-select";
import type { ControlSelectOption } from "../../components/ha-control-select";
import "../../components/ha-control-slider";
import "../../components/ha-svg-icon";
import type {
  AlarmControlPanelEntity,
  AlarmMode,
} from "../../data/alarm_control_panel";
import {
  ALARM_MODES,
  setProtectedAlarmControlPanelMode,
} from "../../data/alarm_control_panel";
import { apiContext } from "../../data/context";
import { UNAVAILABLE } from "../../data/entity/entity";
import type { HomeAssistantApi } from "../../types";

@customElement("ha-state-control-alarm_control_panel-modes")
export class HaStateControlAlarmControlPanelModes extends LitElement {
  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @property({ attribute: false }) public stateObj!: AlarmControlPanelEntity;

  /** Opt-in presentation used by the entity dialog: outlined mode chips. */
  @property({ type: Boolean, reflect: true }) public board = false;

  @state() _currentMode?: AlarmMode;

  private _modes = memoizeOne((stateObj: AlarmControlPanelEntity) => {
    const modes = Object.keys(ALARM_MODES) as AlarmMode[];
    return modes.filter((mode) => {
      const feature = ALARM_MODES[mode as AlarmMode].feature;
      return !feature || supportsFeature(stateObj, feature);
    });
  });

  protected willUpdate(changedProp: PropertyValues<this>): void {
    super.willUpdate(changedProp);
    if (changedProp.has("stateObj")) {
      this._currentMode = this._getCurrentMode(this.stateObj);
    }
  }

  private _getCurrentMode(stateObj: AlarmControlPanelEntity) {
    return this._modes(stateObj).find((mode) => mode === stateObj.state);
  }

  private async _setMode(mode: AlarmMode) {
    await setProtectedAlarmControlPanelMode(
      this,
      {
        callService: this._api.callService,
        callWS: this._api.callWS,
        localize: this._localize,
      },
      this.stateObj,
      mode
    );
  }

  private async _valueChanged(
    ev: HASSDomEvent<HASSDomEvents["value-changed"]>
  ) {
    await this._changeMode(ev.detail.value as AlarmMode);
  }

  private async _chipClicked(ev: Event) {
    await this._changeMode(
      (ev.currentTarget as HTMLElement).dataset.mode as AlarmMode
    );
  }

  private async _changeMode(mode: AlarmMode) {
    if (mode === this.stateObj!.state) return;

    const oldMode = this._getCurrentMode(this.stateObj!);
    this._currentMode = mode;

    try {
      await this._setMode(mode);
    } catch (_err) {
      this._currentMode = oldMode;
    }
  }

  protected render() {
    const color = stateColorCss(this.stateObj);

    const modes = this._modes(this.stateObj);

    const options = modes.map<ControlSelectOption>((mode) => ({
      value: mode,
      label: this._localize(`ui.card.alarm_control_panel.modes.${mode}`),
      path: ALARM_MODES[mode].path,
    }));

    if (this.board) {
      const unavailable = this.stateObj!.state === UNAVAILABLE;
      return html`
        <div
          class="chips"
          role="group"
          aria-label=${this._localize("ui.card.alarm_control_panel.modes_label")}
        >
          ${options.map(
            (option) => html`
              <button
                type="button"
                class="chip"
                data-mode=${option.value}
                aria-pressed=${
                  this._currentMode === option.value ? "true" : "false"
                }
                .disabled=${unavailable}
                @click=${this._chipClicked}
              >
                ${
                  this._currentMode === option.value
                    ? html`<ha-svg-icon .path=${mdiCheck}></ha-svg-icon>`
                    : nothing
                }
                ${option.label}
              </button>
            `
          )}
        </div>
      `;
    }

    return html`
      <ha-control-select
        vertical
        .options=${options}
        .value=${this._currentMode}
        @value-changed=${this._valueChanged}
        .label=${this._localize("ui.card.alarm_control_panel.modes_label")}
        style=${styleMap({
          "--control-select-color": color,
          "--modes-count": modes.length.toString(),
        })}
        .disabled=${this.stateObj!.state === UNAVAILABLE}
      >
      </ha-control-select>
    `;
  }

  static styles = css`
    .chips {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: var(--ha-space-2);
    }
    .chip {
      appearance: none;
      display: inline-flex;
      align-items: center;
      gap: var(--ha-space-2);
      min-height: 44px;
      min-width: 44px;
      padding: 0 var(--ha-space-4);
      border-radius: var(--ha-border-radius-lg);
      border: 1px solid var(--outline-color, var(--divider-color));
      background: transparent;
      color: var(--primary-text-color);
      font: inherit;
      font-weight: var(--ha-font-weight-medium);
      cursor: pointer;
    }
    .chip[aria-pressed="true"] {
      background: var(
        --ha-color-fill-primary-quiet-resting,
        rgba(3, 169, 244, 0.2)
      );
      border-color: transparent;
    }
    .chip:focus-visible {
      outline: 2px solid var(--primary-text-color);
      outline-offset: 2px;
    }
    .chip:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .chip ha-svg-icon {
      --mdc-icon-size: 18px;
      width: 18px;
      height: 18px;
    }
    ha-control-select {
      height: 45vh;
      max-height: max(320px, var(--modes-count, 1) * 80px);
      min-height: max(200px, var(--modes-count, 1) * 80px);
      --control-select-thickness: 130px;
      --control-select-border-radius: var(--ha-border-radius-6xl);
      --control-select-color: var(--primary-color);
      --control-select-background: var(--disabled-color);
      --control-select-background-opacity: 0.2;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-state-control-alarm_control_panel-modes": HaStateControlAlarmControlPanelModes;
  }
}
