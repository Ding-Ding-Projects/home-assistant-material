import type { HassEntity } from "home-assistant-js-websocket";
import type { CSSResultGroup, PropertyValues } from "lit";
import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import { dynamicElement } from "../../../common/dom/dynamic-element-directive";
import { computeDomain } from "../../../common/entity/compute_domain";
import { showConfirmationDialog } from "../../generic/show-dialog-box";
import { showToast } from "../../../util/toast";
import type { GroupEntity } from "../../../data/group";
import { computeGroupDomain } from "../../../data/group";
import "../../../state-summary/state-card-content";
import type { HomeAssistant } from "../../../types";
import { stateActive } from "../../../common/entity/state_active";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import { moreInfoControlStyle } from "../components/more-info-control-style";
import {
  domainMoreInfoType,
  importMoreInfoControl,
} from "../state_more_info_control";

// Members in these domains can open doors, valves or alarms, so a bulk
// action on a group containing them needs an explicit confirmation.
const SENSITIVE_DOMAINS = new Set([
  "cover",
  "lock",
  "valve",
  "garage_door",
  "alarm_control_panel",
]);

@customElement("more-info-group")
class MoreInfoGroup extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public stateObj?: GroupEntity;

  @state() private _groupDomainStateObj?: HassEntity;

  @state() private _moreInfoType?: string;

  protected updated(changedProperties: PropertyValues<this>) {
    if (
      !this.hass ||
      !this.stateObj ||
      (!changedProperties.has("hass") && !changedProperties.has("stateObj"))
    ) {
      return;
    }

    const states = this.stateObj.attributes.entity_id
      .map((entity_id) => this.hass.states[entity_id])
      .filter((entityState) => entityState);

    if (!states.length) {
      this._groupDomainStateObj = undefined;
      this._moreInfoType = undefined;
      return;
    }

    const baseStateObj =
      states.find((s) => s.state === this.stateObj!.state) || states[0];

    const groupDomain = computeGroupDomain(this.stateObj);

    // Groups need to be filtered out or we'll show content of
    // first child above the children of the current group
    if (groupDomain && groupDomain !== "group") {
      this._groupDomainStateObj = {
        ...baseStateObj,
        entity_id: this.stateObj.entity_id,
        last_updated: this.stateObj.last_updated,
        last_changed: this.stateObj.last_changed,
        attributes: {
          ...baseStateObj.attributes,
          friendly_name: this.stateObj.attributes.friendly_name,
          entity_id: this.stateObj.attributes.entity_id,
        },
      };
      const type = domainMoreInfoType(groupDomain);
      importMoreInfoControl(type);
      this._moreInfoType = type === "hidden" ? undefined : `more-info-${type}`;
    } else {
      this._groupDomainStateObj = undefined;
      this._moreInfoType = undefined;
    }
  }

  protected render() {
    if (!this.hass || !this.stateObj) {
      return nothing;
    }
    const members = this.stateObj.attributes.entity_id
      .map((entityId) => this.hass.states[entityId])
      .filter(Boolean);
    const onCount = members.filter((member) => stateActive(member)).length;

    return html`${
      this._moreInfoType
        ? ""
        : html`
            <p class="headline">
              ${this.hass.localize(
                "ui.dialogs.more_info_control.group.count_on",
                { on: onCount, total: members.length }
              )}
            </p>
            <div class="chips">
              <button type="button" class="chip" @click=${this._allOn}>
                ${this.hass.localize(
                  "ui.dialogs.more_info_control.group.all_on"
                )}
              </button>
              <button type="button" class="chip" @click=${this._allOff}>
                ${this.hass.localize(
                  "ui.dialogs.more_info_control.group.all_off"
                )}
              </button>
            </div>
          `
    }${
      this._moreInfoType
        ? dynamicElement(this._moreInfoType, {
            hass: this.hass,
            stateObj: this._groupDomainStateObj,
          })
        : ""
    }
    ${this.stateObj.attributes.entity_id.map((entity_id) => {
      const entityState = this.hass!.states[entity_id];
      if (!entityState) {
        return "";
      }
      return html`
        <state-card-content
          .stateObj=${entityState}
          .hass=${this.hass}
        ></state-card-content>
      `;
    })}`;
  }

  private _allOn() {
    this._setAll(true);
  }

  private _allOff() {
    this._setAll(false);
  }

  private async _setAll(turnOn: boolean) {
    const localize = this.hass.localize;
    const sensitive = this.stateObj!.attributes.entity_id.some((entityId) =>
      SENSITIVE_DOMAINS.has(computeDomain(entityId))
    );
    if (sensitive) {
      const confirmed = await showConfirmationDialog(this, {
        title: localize("ui.dialogs.more_info_control.group.confirm_title"),
        text: localize(
          turnOn
            ? "ui.dialogs.more_info_control.group.confirm_all_on"
            : "ui.dialogs.more_info_control.group.confirm_all_off"
        ),
        confirmText: localize(
          turnOn
            ? "ui.dialogs.more_info_control.group.all_on"
            : "ui.dialogs.more_info_control.group.all_off"
        ),
        warning: true,
      });
      if (!confirmed) {
        return;
      }
    }
    try {
      await this.hass.callService(
        "homeassistant",
        turnOn ? "turn_on" : "turn_off",
        { entity_id: this.stateObj!.entity_id }
      );
      showToast(this, {
        message: localize(
          turnOn
            ? "ui.dialogs.more_info_control.group.result_on"
            : "ui.dialogs.more_info_control.group.result_off"
        ),
      });
    } catch (_err) {
      showToast(this, {
        message: localize("ui.dialogs.more_info_control.group.result_failed"),
      });
    }
  }

  static get styles(): CSSResultGroup {
    return [
      moreInfoControlStyle,
      moreInfoBoardStyle,
      css`
        .headline {
          font-size: 40px;
          margin-bottom: var(--ha-space-3);
        }
        .chips {
          margin-bottom: var(--ha-space-4);
        }
        state-card-content {
          display: block;
          margin-top: var(--ha-space-2);
          padding: var(--ha-space-2) var(--ha-space-4);
          border-radius: var(--ha-border-radius-xl);
          background: var(--secondary-background-color);
        }
      `,
    ];
  }
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-group": MoreInfoGroup;
  }
}
