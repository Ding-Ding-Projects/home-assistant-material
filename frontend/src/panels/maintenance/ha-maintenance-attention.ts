import {
  mdiAlertCircleOutline,
  mdiBatteryAlertVariantOutline,
  mdiLanDisconnect,
  mdiUpdate,
} from "@mdi/js";
import type { CSSResultGroup, TemplateResult } from "lit";
import { css, html, LitElement, nothing } from "lit";
import { customElement, property } from "lit/decorators";
import memoizeOne from "memoize-one";
import { fireEvent } from "../../common/dom/fire_event";
import "../../components/ha-button";
import "../../components/ha-svg-icon";
import type { UpdateEntity } from "../../data/update";
import { filterUpdateEntities, updateAvailable } from "../../data/update";
import type { LocalizeKeys } from "../../common/translations/localize";
import type { HomeAssistant } from "../../types";
import {
  filterLowBatteryEntities,
  filterProblemEntities,
  filterUnavailableBatteryEntities,
  findMaintenanceEntityIds,
} from "./strategies/maintenance-view-strategy";

type AttentionKind = "battery" | "update" | "offline" | "problem";

interface AttentionItem {
  kind: AttentionKind;
  entityId: string;
  title: string;
  description: string;
}

const ICONS: Record<AttentionKind, string> = {
  battery: mdiBatteryAlertVariantOutline,
  update: mdiUpdate,
  offline: mdiLanDisconnect,
  problem: mdiAlertCircleOutline,
};

/**
 * Summary and list of the small jobs that need attention, shown above the
 * full list of battery and problem entities on the maintenance page. Only
 * data the instance already reports is shown.
 */
@customElement("ha-maintenance-attention")
export class HaMaintenanceAttention extends LitElement {
  @property({ attribute: false }) public hass!: HomeAssistant;

  private _compute = memoizeOne(
    (
      states: HomeAssistant["states"],
      entities: HomeAssistant["entities"],
      devices: HomeAssistant["devices"],
      _localize: HomeAssistant["localize"]
    ) => {
      const ids = findMaintenanceEntityIds(this.hass);
      return {
        low: filterLowBatteryEntities(states, entities, ids),
        problems: filterProblemEntities(states, ids),
        offline: filterUnavailableBatteryEntities(states, ids),
        batteryCount: ids.filter(
          (id) =>
            states[id]?.attributes?.device_class === "battery" &&
            states[id]?.state !== "unavailable"
        ).length,
        updates: filterUpdateEntities(
          states,
          this.hass.formatEntityName
        ).filter((entity) => updateAvailable(entity)),
        devices,
      };
    }
  );

  protected render(): TemplateResult {
    const data = this._compute(
      this.hass.states,
      this.hass.entities,
      this.hass.devices,
      this.hass.localize
    );
    const localize = this.hass.localize;
    const prefix = "ui.panel.lovelace.strategy.maintenance";

    const items: AttentionItem[] = [
      ...data.low.map((entityId) =>
        this._item("battery", entityId, `${prefix}.low_battery`)
      ),
      ...data.updates.map((entity: UpdateEntity) => ({
        kind: "update" as const,
        entityId: entity.entity_id,
        title: localize(`${prefix}.update_ready`, {
          name: entity.attributes.title || this._name(entity.entity_id),
          version: entity.attributes.latest_version || "",
        }),
        description: localize(`${prefix}.update_from`, {
          version: entity.attributes.installed_version || "",
        }),
      })),
      ...data.offline.map((entityId) =>
        this._item("offline", entityId, `${prefix}.offline`)
      ),
      ...data.problems.map((entityId) =>
        this._item("problem", entityId, `${prefix}.problem`)
      ),
    ];

    const count = items.length;

    return html`
      <div class="header">
        <h2>${localize("panel.maintenance")}</h2>
        <p class="summary">
          ${
            count
              ? localize(`${prefix}.summary_attention`, { count })
              : localize(`${prefix}.summary_clear`)
          }
        </p>
      </div>
      <div class="cards">
        <div class="card battery ${data.low.length ? "alert" : "fine"}">
          <div class="card-label">
            <ha-svg-icon .path=${mdiBatteryAlertVariantOutline}></ha-svg-icon>
            ${localize(`${prefix}.batteries`)}
          </div>
          <div class="card-value">
            ${
              data.low.length
                ? localize(`${prefix}.batteries_low`, {
                    count: data.low.length,
                  })
                : localize(`${prefix}.all_fine`)
            }
          </div>
          <div class="card-note">
            ${localize(`${prefix}.batteries_fine`, {
              count: Math.max(data.batteryCount - data.low.length, 0),
            })}
          </div>
        </div>
        <div class="card updates ${data.updates.length ? "alert" : "fine"}">
          <div class="card-label">
            <ha-svg-icon .path=${mdiUpdate}></ha-svg-icon>
            ${localize(`${prefix}.updates`)}
          </div>
          <div class="card-value">
            ${
              data.updates.length
                ? localize(`${prefix}.updates_ready`, {
                    count: data.updates.length,
                  })
                : localize(`${prefix}.all_fine`)
            }
          </div>
        </div>
        <div class="card offline ${data.offline.length ? "alert" : "fine"}">
          <div class="card-label">
            <ha-svg-icon .path=${mdiLanDisconnect}></ha-svg-icon>
            ${localize(`${prefix}.offline_label`)}
          </div>
          <div class="card-value">
            ${
              data.offline.length
                ? localize(`${prefix}.offline_devices`, {
                    count: data.offline.length,
                  })
                : localize(`${prefix}.all_fine`)
            }
          </div>
        </div>
      </div>
      ${
        count
          ? html`
              <ul class="list">
                ${items.map((item) => this._renderItem(item))}
              </ul>
            `
          : nothing
      }
      ${
        count
          ? html`<h3 class="all">${localize(`${prefix}.all_devices`)}</h3>`
          : nothing
      }
    `;
  }

  private _renderItem(item: AttentionItem): TemplateResult {
    return html`
      <li class="row">
        <div class="icon ${item.kind}">
          <ha-svg-icon .path=${ICONS[item.kind]}></ha-svg-icon>
        </div>
        <div class="text">
          <div class="title">${item.title}</div>
          <div class="sub">${item.description}</div>
        </div>
        <ha-button
          appearance=${item.kind === "update" ? "filled" : "plain"}
          .entityId=${item.entityId}
          @click=${this._openDetails}
        >
          ${
            item.kind === "update"
              ? this.hass.localize(
                  "ui.panel.lovelace.strategy.maintenance.review"
                )
              : this.hass.localize(
                  "ui.panel.lovelace.strategy.maintenance.details"
                )
          }
        </ha-button>
      </li>
    `;
  }

  private _name(entityId: string): string {
    const stateObj = this.hass.states[entityId];
    return stateObj
      ? this.hass.formatEntityName(stateObj, [
          { type: "device" },
          { type: "entity" },
        ])
      : entityId;
  }

  private _item(
    kind: AttentionKind,
    entityId: string,
    titleKey: LocalizeKeys
  ): AttentionItem {
    const stateObj = this.hass.states[entityId];
    return {
      kind,
      entityId,
      title: this.hass.localize(titleKey, { name: this._name(entityId) }),
      description: stateObj ? this.hass.formatEntityState(stateObj) : "",
    };
  }

  private _openDetails(ev: Event) {
    const entityId = (ev.currentTarget as HTMLElement & { entityId: string })
      .entityId;
    fireEvent(this, "hass-more-info", { entityId });
  }

  static styles: CSSResultGroup = css`
    :host {
      display: block;
      box-sizing: border-box;
      max-width: 1100px;
      margin: 0 auto;
      padding: var(--ha-space-4) var(--ha-space-8) 0;
    }
    @media (max-width: 600px) {
      :host {
        padding: var(--ha-space-2) var(--ha-space-3) 0;
      }
    }
    h2 {
      margin: 0;
      font-size: var(--ha-font-size-3xl);
      font-weight: var(--ha-font-weight-medium);
      line-height: var(--ha-line-height-condensed);
    }
    .summary {
      margin: var(--ha-space-1) 0 var(--ha-space-4);
      color: var(--secondary-text-color);
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: var(--ha-space-4);
      margin-bottom: var(--ha-space-4);
    }
    .card {
      box-sizing: border-box;
      padding: var(--ha-space-5);
      border-radius: var(--ha-border-radius-3xl);
      background: var(--ha-color-fill-success-quiet-resting);
      color: var(--ha-color-on-success-quiet);
    }
    .card.alert.battery,
    .card.alert.updates {
      background: var(--ha-color-fill-warning-quiet-resting);
      color: var(--ha-color-on-warning-quiet);
    }
    .card.alert.offline {
      background: var(--ha-color-fill-danger-quiet-resting);
      color: var(--ha-color-on-danger-quiet);
    }
    .card-label {
      display: flex;
      align-items: center;
      gap: var(--ha-space-2);
      font-weight: var(--ha-font-weight-medium);
    }
    .card-value {
      margin-top: var(--ha-space-2);
      font-size: var(--ha-font-size-2xl);
    }
    .card-note {
      margin-top: var(--ha-space-1);
      font-size: var(--ha-font-size-s);
    }
    .list {
      list-style: none;
      margin: 0 0 var(--ha-space-4);
      padding: 0;
      display: flex;
      flex-direction: column;
      gap: var(--ha-space-2);
    }
    .row {
      display: flex;
      align-items: center;
      gap: var(--ha-space-4);
      min-height: 56px;
      padding: var(--ha-space-2) var(--ha-space-4);
      border-radius: var(--ha-border-radius-xl);
      background: var(--card-background-color);
    }
    .icon {
      display: flex;
      flex: none;
      align-items: center;
      justify-content: center;
      width: 40px;
      height: 40px;
      border-radius: var(--ha-border-radius-xl);
      background: var(--secondary-background-color);
      color: var(--secondary-text-color);
    }
    .icon.battery {
      background: var(--ha-color-fill-warning-quiet-resting);
      color: var(--ha-color-on-warning-quiet);
    }
    .icon.update {
      background: var(--ha-color-fill-primary-quiet-resting);
      color: var(--ha-color-on-primary-quiet);
    }
    .icon.offline {
      background: var(--ha-color-fill-danger-quiet-resting);
      color: var(--ha-color-on-danger-quiet);
    }
    .text {
      display: flex;
      flex: 1;
      flex-direction: column;
      min-width: 0;
    }
    .title {
      font-weight: var(--ha-font-weight-medium);
    }
    .sub {
      font-size: var(--ha-font-size-s);
      color: var(--secondary-text-color);
    }
    ha-button {
      flex: none;
      min-height: 44px;
    }
    .all {
      margin: var(--ha-space-4) 0 0;
      font-size: var(--ha-font-size-l);
      font-weight: var(--ha-font-weight-medium);
    }
    @media (max-width: 420px) {
      .row {
        flex-wrap: wrap;
      }
    }
  `;
}

declare global {
  interface HTMLElementTagNameMap {
    "ha-maintenance-attention": HaMaintenanceAttention;
  }
}
