import type { HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import "../../../components/ha-relative-time";
import "../../../components/map/ha-map";
import { getEntityLocation } from "../../../common/entity/get_entity_location";
import type { HomeAssistant } from "../../../types";
import { modeText } from "../../../common/language-mode/language-mode";
import { computeDomain } from "../../../common/entity/compute_domain";
import {
  STATE_NOTE_DOMAINS,
  entityFirstControl,
} from "../entity-first-controls";
import { moreInfoBoardStyle } from "../components/more-info-board-style";
import {
  withLanguageMode,
  type Localize,
} from "../../../common/language-mode/language-mode";

@customElement("more-info-default")
class MoreInfoDefault extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  @property({ attribute: false }) public stateObj?: HassEntity;

  private get _modeLocalize(): Localize {
    return withLanguageMode(this.hass.localize);
  }

  protected render() {
    if (!this.hass || !this.stateObj) {
      return nothing;
    }
    const localize = this._modeLocalize;
    const entityId = this.stateObj.entity_id;
    const registry = this.hass.entities?.[entityId];
    const device = registry?.device_id
      ? this.hass.devices?.[registry.device_id]
      : undefined;
    const areaId = registry?.area_id ?? device?.area_id;
    const area = areaId ? this.hass.areas?.[areaId] : undefined;
    const options = Array.isArray(this.stateObj.attributes.options)
      ? (this.stateObj.attributes.options as unknown[])
          .map((option) => String(option))
          .join(", ")
      : undefined;

    const rows: { label: string; value: string; mono?: boolean }[] = [
      {
        label: localize("ui.dialogs.more_info_control.default.entity_id"),
        value: entityId,
        mono: true,
      },
    ];
    if (options) {
      rows.push({
        label: localize("ui.dialogs.more_info_control.default.options"),
        value: options,
      });
    }
    const deviceName = device?.name_by_user || device?.name;
    if (deviceName) {
      rows.push({
        label: localize("ui.dialogs.more_info_control.default.device"),
        value: deviceName,
      });
    }
    if (area?.name) {
      rows.push({
        label: localize("ui.dialogs.more_info_control.default.area"),
        value: area.name,
      });
    }

    const domain = computeDomain(entityId);
    const showMap =
      entityFirstControl(computeDomain(entityId)) === "map" &&
      getEntityLocation(this.stateObj, this.hass.states) != null;
    const purpose = STATE_NOTE_DOMAINS.includes(domain)
      ? modeText(localize as any, `ui.entity_sheet.purpose.${domain}`)
      : undefined;

    return html`
      <div class="stack">
        <h2 class="headline">${this.hass.formatEntityState(this.stateObj)}</h2>
        <p class="subline">
          ${localize("ui.dialogs.more_info_control.sensor.changed")}
          <ha-relative-time
            .hass=${this.hass}
            .datetime=${this.stateObj.last_changed}
          ></ha-relative-time>
        </p>
        ${
          showMap
            ? html`<ha-map .entities=${[entityId]} auto-fit></ha-map>`
            : nothing
        }
        ${purpose ? html`<p class="subline purpose">${purpose}</p>` : nothing}
        <div class="facts">
          ${rows.map(
            (row) => html`
              <div class="fact">
                <span class="label">${row.label}</span>
                <span class=${row.mono ? "value mono" : "value"}
                  >${row.value}</span
                >
              </div>
            `
          )}
        </div>
      </div>
    `;
  }

  static styles = [
    moreInfoBoardStyle,
    css`
      :host {
        display: block;
      }
      ha-map {
        display: block;
        border-radius: var(--ha-border-radius-xl);
        overflow: hidden;
      }
      .stack {
        align-items: stretch;
      }
      .headline {
        align-self: center;
        overflow-wrap: anywhere;
      }
      .subline {
        align-self: center;
      }
      .facts {
        display: flex;
        flex-direction: column;
        gap: var(--ha-space-2);
      }
      .fact {
        display: flex;
        justify-content: space-between;
        gap: var(--ha-space-4);
      }
      .label {
        color: var(--secondary-text-color);
        flex: none;
      }
      .value {
        font-weight: var(--ha-font-weight-medium);
        text-align: end;
        overflow-wrap: anywhere;
        min-width: 0;
      }
      .value.mono {
        font-family: var(--ha-font-family-code, monospace);
      }
    `,
  ];
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-default": MoreInfoDefault;
  }
}
