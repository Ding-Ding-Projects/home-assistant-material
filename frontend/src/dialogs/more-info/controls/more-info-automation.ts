import { mdiPlay } from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/ha-switch";
import { apiContext } from "../../../data/context";
import { triggerAutomationActions } from "../../../data/automation";
import { UNAVAILABLE } from "../../../data/entity/entity";
import type { HomeAssistantApi } from "../../../types";
import { moreInfoBoardStyle } from "../components/more-info-board-style";

@customElement("more-info-automation")
class MoreInfoAutomation extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: apiContext, subscribe: true })
  private _api!: HomeAssistantApi;

  protected render() {
    if (!this._localize || !this.stateObj) {
      return nothing;
    }

    const isOn = this.stateObj.state === "on";
    const unavailable = this.stateObj.state === UNAVAILABLE;

    return html`
      <p class="headline ${isOn ? "ok" : ""}">
        ${
          isOn
            ? this._localize("ui.dialogs.more_info_control.automation.on")
            : this._localize("ui.dialogs.more_info_control.automation.off")
        }
      </p>
      <p class="subline">
        ${this._localize("ui.card.automation.last_triggered")}:
        <ha-relative-time
          .datetime=${this.stateObj.attributes.last_triggered}
          capitalize
        ></ha-relative-time>
      </p>

      <div class="toggle-row">
        <span class="toggle-label">
          ${
            isOn
              ? this._localize("ui.dialogs.more_info_control.automation.is_on")
              : this._localize("ui.dialogs.more_info_control.automation.is_off")
          }
        </span>
        <ha-switch
          .checked=${isOn}
          .disabled=${unavailable}
          @change=${this._toggled}
        ></ha-switch>
      </div>

      <div class="actions">
        <ha-button
          appearance="filled"
          @click=${this._runActions}
          .disabled=${unavailable}
        >
          <ha-svg-icon slot="start" .path=${mdiPlay}></ha-svg-icon>
          ${this._localize("ui.card.automation.trigger")}
        </ha-button>
      </div>
    `;
  }

  private _toggled(ev: Event) {
    const checked = (ev.target as HTMLInputElement).checked;
    this._api.callService("automation", checked ? "turn_on" : "turn_off", {
      entity_id: this.stateObj!.entity_id,
    });
  }

  private _runActions() {
    triggerAutomationActions(this._api, this.stateObj!.entity_id);
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      .toggle-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: var(--ha-space-3);
        padding: var(--ha-space-2) var(--ha-space-4);
        margin-bottom: var(--ha-space-4);
        font-weight: var(--ha-font-weight-medium);
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: var(--ha-space-2);
        margin: var(--ha-space-2) 0;
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-automation": MoreInfoAutomation;
  }
}
