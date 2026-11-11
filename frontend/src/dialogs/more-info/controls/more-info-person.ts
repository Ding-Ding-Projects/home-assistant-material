import { mdiMapMarkerPlus } from "@mdi/js";
import type { HassEntities, HassEntity } from "home-assistant-js-websocket";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property, state } from "lit/decorators";
import memoizeOne from "memoize-one";
import { consume } from "../../../common/decorators/consume";
import { consumeLocalize } from "../../../common/decorators/consume-context-entry";
import { transform } from "../../../common/decorators/transform";
import { fireEvent } from "../../../common/dom/fire_event";
import { getEntityLocation } from "../../../common/entity/get_entity_location";
import { formatNumber } from "../../../common/number/format_number";
import type { LocalizeFunc } from "../../../common/translations/localize";
import "../../../components/ha-button";
import "../../../components/ha-relative-time";
import "../../../components/ha-svg-icon";
import "../../../components/map/ha-map";
import {
  configContext,
  formattersContext,
  internationalizationContext,
  statesContext,
} from "../../../data/context";
import { showZoneEditor } from "../../../data/zone";
import type {
  CurrentUser,
  HomeAssistantConfig,
  HomeAssistantFormatters,
  HomeAssistantInternationalization,
} from "../../../types";

@customElement("more-info-person")
class MoreInfoPerson extends LitElement {
  @property({ attribute: false }) public stateObj?: HassEntity;

  @state()
  @consumeLocalize()
  private _localize!: LocalizeFunc;

  @state()
  @consume({ context: statesContext, subscribe: true })
  private _states!: HassEntities;

  @state()
  @consume({ context: formattersContext, subscribe: true })
  private _formatters!: HomeAssistantFormatters;

  @state()
  @consume({ context: internationalizationContext, subscribe: true })
  private _i18n!: HomeAssistantInternationalization;

  @state()
  @consume({ context: configContext, subscribe: true })
  @transform<HomeAssistantConfig, CurrentUser | undefined>({
    transformer: ({ user }) => user,
  })
  private _user?: CurrentUser;

  private _entityArray = memoizeOne((entityId: string) => [entityId]);

  protected render() {
    if (!this._localize || !this._formatters || !this.stateObj) {
      return nothing;
    }

    const stateObj = this.stateObj;
    const location = getEntityLocation(stateObj, this._states);
    const hasOwnCoordinates =
      typeof stateObj.attributes.latitude === "number" &&
      typeof stateObj.attributes.longitude === "number";
    const name = String(stateObj.attributes.friendly_name ?? "");
    const picture = stateObj.attributes.entity_picture as string | undefined;
    const sourceId = stateObj.attributes.source as string | undefined;
    const sourceState = sourceId ? this._states?.[sourceId] : undefined;
    const accuracy = stateObj.attributes.gps_accuracy as number | undefined;
    const battery = sourceState
      ? (sourceState.attributes.battery_level ?? sourceState.attributes.battery)
      : undefined;

    return html`
      <div class="presence">
        <div class="avatar">
          ${
            picture
              ? html`<img src=${picture} alt=${name} />`
              : html`<span>${name.charAt(0).toUpperCase()}</span>`
          }
        </div>
        <div class="where">
          <div class="zone">
            ${this._formatters.formatEntityState(stateObj)}
          </div>
          <div class="since">
            ${this._localize("ui.dialogs.more_info_control.person.since")}
            <ha-relative-time
              .datetime=${stateObj.last_changed}
            ></ha-relative-time>
          </div>
        </div>
      </div>
      ${
        location
          ? html`
              <ha-map
                .entities=${this._entityArray(stateObj.entity_id)}
                auto-fit
              ></ha-map>
            `
          : nothing
      }
      ${
        sourceId || accuracy !== undefined || battery !== undefined
          ? html`
              <div class="stats">
                ${
                  sourceId
                    ? this._renderStat(
                        this._localize(
                          "ui.dialogs.more_info_control.person.followed_by"
                        ),
                        sourceState?.attributes.friendly_name ?? sourceId
                      )
                    : nothing
                }
                ${
                  accuracy !== undefined && accuracy !== null
                    ? this._renderStat(
                        this._localize(
                          "ui.dialogs.more_info_control.person.accuracy"
                        ),
                        `${formatNumber(accuracy, this._i18n.locale)} m`
                      )
                    : nothing
                }
                ${
                  battery !== undefined && battery !== null
                    ? this._renderStat(
                        this._localize(
                          "ui.dialogs.more_info_control.person.battery"
                        ),
                        `${formatNumber(Number(battery), this._i18n.locale)}%`
                      )
                    : nothing
                }
              </div>
            `
          : nothing
      }
      ${
        hasOwnCoordinates
          ? html`
              <div class="actions">
                ${
                  !__DEMO__ && this._user?.is_admin
                    ? html`
                        <ha-button
                          appearance="outlined"
                          variant="neutral"
                          @click=${this._handleAction}
                        >
                          <ha-svg-icon
                            slot="start"
                            .path=${mdiMapMarkerPlus}
                          ></ha-svg-icon>
                          ${this._localize(
                            "ui.dialogs.more_info_control.person.create_zone"
                          )}
                        </ha-button>
                      `
                    : nothing
                }
              </div>
            `
          : nothing
      }
    `;
  }

  private _renderStat(label: string, value: string) {
    return html`
      <div class="stat">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
      </div>
    `;
  }

  private _handleAction() {
    showZoneEditor({
      latitude: this.stateObj!.attributes.latitude,
      longitude: this.stateObj!.attributes.longitude,
    });
    fireEvent(this, "hass-more-info", { entityId: null });
  }

  static styles = css`
    :host {
      display: block;
    }

    .presence {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-4);
    }

    .avatar {
      width: 64px;
      height: 64px;
      flex: none;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: var(--ha-border-radius-2xl, 24px);
      background: var(--primary-color);
      color: var(--text-primary-color);
      font-size: var(--ha-font-size-2xl);
      font-weight: var(--ha-font-weight-medium);
    }

    .avatar img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .where {
      min-width: 0;
    }

    .zone {
      font-size: var(--ha-font-size-3xl);
      line-height: var(--ha-line-height-condensed);
      overflow-wrap: anywhere;
    }

    .since {
      color: var(--secondary-text-color);
    }

    ha-map {
      display: block;
      margin-bottom: var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      overflow: hidden;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(96px, 1fr));
      gap: var(--ha-space-2);
      margin-bottom: var(--ha-space-4);
    }

    .stat {
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-1);
      padding: var(--ha-space-3);
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
      min-width: 0;
    }

    .stat-label {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }

    .stat-value {
      font-weight: var(--ha-font-weight-semi-bold);
      overflow-wrap: anywhere;
    }

    .actions {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: var(--ha-space-2);
      margin: var(--ha-space-2) 0;
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "more-info-person": MoreInfoPerson;
  }
}
