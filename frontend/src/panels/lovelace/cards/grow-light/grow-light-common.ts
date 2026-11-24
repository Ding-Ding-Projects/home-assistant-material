import {
  mdiLightbulbOn,
  mdiLightbulbOff,
  mdiLightbulbOutline,
  mdiWaterOutline,
} from "@mdi/js";
import type { HassEntity } from "home-assistant-js-websocket";
import type { TemplateResult } from "lit";
import { css, html, nothing } from "lit";
import { classMap } from "lit/directives/class-map";
import { styleMap } from "lit/directives/style-map";
import "../../../../components/ha-button";
import "../../../../components/ha-relative-time";
import "../../../../components/ha-svg-icon";
import type { HomeAssistant } from "../../../../types";

export const GROW_LIGHT_DOMAIN = "grow_light";

export interface GrowLightEntities {
  status: string;
  nextChange?: string;
  stage?: string;
  nextWatering?: string;
  lastWatered?: string;
  watered?: string;
  energy?: string;
  cost?: string;
  nextSowing?: string;
  sown?: string;
}

export interface GrowLightStage {
  stage: string;
  days: number;
  light_hours: number;
  water_every_days: number;
}

const KEY_TO_FIELD: Record<string, keyof GrowLightEntities> = {
  status: "status",
  next_change: "nextChange",
  stage: "stage",
  next_watering: "nextWatering",
  last_watered: "lastWatered",
  watered: "watered",
  energy: "energy",
  cost: "cost",
  next_sowing: "nextSowing",
  sown: "sown",
};

/** The status sensor entity ids of every grow light, ordered by name. */
export const listGrowLights = (hass: HomeAssistant): string[] =>
  Object.values(hass.entities)
    .filter(
      (entry) =>
        entry.platform === GROW_LIGHT_DOMAIN &&
        entry.translation_key === "status" &&
        entry.entity_id in hass.states
    )
    .map((entry) => entry.entity_id)
    .sort((a, b) =>
      (hass.states[a].attributes.friendly_name ?? a).localeCompare(
        hass.states[b].attributes.friendly_name ?? b
      )
    );

/** Find the sibling entities of one grow light through the shared device. */
export const findGrowLightEntities = (
  hass: HomeAssistant,
  statusEntityId: string
): GrowLightEntities => {
  const entities: GrowLightEntities = { status: statusEntityId };
  const deviceId = hass.entities[statusEntityId]?.device_id;
  if (!deviceId) {
    return entities;
  }
  for (const entry of Object.values(hass.entities)) {
    if (
      entry.device_id !== deviceId ||
      entry.platform !== GROW_LIGHT_DOMAIN ||
      !entry.translation_key
    ) {
      continue;
    }
    const field = KEY_TO_FIELD[entry.translation_key];
    if (field && field !== "status") {
      entities[field] = entry.entity_id;
    }
  }
  return entities;
};

const isKnown = (stateObj?: HassEntity): stateObj is HassEntity =>
  !!stateObj &&
  stateObj.state !== "unknown" &&
  stateObj.state !== "unavailable";

const STATUS_ICON: Record<string, string> = {
  on: mdiLightbulbOn,
  paused: mdiLightbulbOutline,
  off_hours: mdiLightbulbOff,
  schedule_off: mdiLightbulbOff,
};

const capitalize = (text: string): string =>
  text.charAt(0).toUpperCase() + text.slice(1).replaceAll("_", " ");

const stageLabel = (hass: HomeAssistant, key: string): string =>
  hass.localize(
    `component.${GROW_LIGHT_DOMAIN}.entity.sensor.stage.state.${key}`
  ) || capitalize(key);

const pressHandler = (hass: HomeAssistant, entityId: string) => () => {
  hass.callService("button", "press", { entity_id: entityId });
};

const renderStageBar = (
  hass: HomeAssistant,
  stages: GrowLightStage[],
  current: string | undefined,
  dayInStage: number
): TemplateResult => {
  const total = stages.reduce((sum, item) => sum + item.days, 0) || 1;
  const currentIndex = stages.findIndex((item) => item.stage === current);
  return html`
    <div
      class="stage-bar"
      role="img"
      aria-label=${current ? stageLabel(hass, current) : ""}
    >
      ${stages.map((item, index) => {
        const fill =
          index < currentIndex
            ? 1
            : index === currentIndex
              ? Math.min(1, Math.max(0, dayInStage / (item.days || 1)))
              : 0;
        return html`
          <div
            class=${classMap({ segment: true, current: index === currentIndex })}
            style=${styleMap({ flexGrow: String(item.days / total) })}
            title=${`${stageLabel(hass, item.stage)}, ${item.days}`}
          >
            <div
              class="fill"
              style=${styleMap({ width: `${fill * 100}%` })}
            ></div>
          </div>
        `;
      })}
    </div>
    <div class="stage-names">
      ${stages.map(
        (item) =>
          html`<span
            class=${classMap({ current: item.stage === current })}
            style=${styleMap({ flexGrow: String(item.days / total) })}
            >${stageLabel(hass, item.stage)}</span
          >`
      )}
    </div>
  `;
};

const renderTimestamp = (
  hass: HomeAssistant,
  label: string,
  stateObj?: HassEntity
) =>
  html`<div class="fact">
    <span class="label">${label}</span>
    <span class="value">
      ${
        isKnown(stateObj)
          ? html`<ha-relative-time
              .hass=${hass}
              .datetime=${stateObj.state}
              capitalize
            ></ha-relative-time>`
          : "-"
      }
    </span>
  </div>`;

/** Render one grow light. `compact` is the overview tile. */
export const renderGrowLight = (
  hass: HomeAssistant,
  entities: GrowLightEntities,
  options: { compact?: boolean; name?: string }
): TemplateResult => {
  const status = hass.states[entities.status];
  const stage = entities.stage ? hass.states[entities.stage] : undefined;
  const nextChange = entities.nextChange
    ? hass.states[entities.nextChange]
    : undefined;
  const nextWatering = entities.nextWatering
    ? hass.states[entities.nextWatering]
    : undefined;
  const lastWatered = entities.lastWatered
    ? hass.states[entities.lastWatered]
    : undefined;
  const energy = entities.energy ? hass.states[entities.energy] : undefined;
  const cost = entities.cost ? hass.states[entities.cost] : undefined;
  const nextSowing = entities.nextSowing
    ? hass.states[entities.nextSowing]
    : undefined;

  const stageKnown = isKnown(stage);
  const attrs = stage?.attributes ?? {};
  const stages = (attrs.stages ?? []) as GrowLightStage[];
  const plant = (attrs.plant as string | undefined) ?? undefined;
  const name = options.name || plant || status?.attributes.friendly_name || "";
  const picture = stage?.attributes.entity_picture as string | undefined;
  const statusKey = status?.state ?? "unavailable";
  const openDoors = (status?.attributes.open_doors ?? []) as string[];
  const soilMoisture = nextWatering?.attributes.soil_moisture as
    number | null | undefined;
  const dryBelow = nextWatering?.attributes.dry_below as
    number | null | undefined;

  const statusText = status
    ? hass.formatEntityState(status)
    : hass.localize("state.default.unavailable");

  return html`
    <div class=${classMap({ "grow-light": true, compact: !!options.compact })}>
      ${
        picture && stageKnown
          ? html`<img
              class="photo"
              src=${picture}
              alt=${plant ?? ""}
              loading="lazy"
            />`
          : nothing
      }
      <div class="body">
        <div class="title-row">
          <div class="title">
            <span class="name">${name}</span>
            ${
              stageKnown
                ? html`<span class="stage-name"
                    >${hass.formatEntityState(stage)}${
                      attrs.day_in_stage != null
                        ? html` · ${attrs.day_in_stage + 1}/${attrs.stage_days}`
                        : nothing
                    }</span
                  >`
                : nothing
            }
          </div>
          <span class=${classMap({ chip: true, [statusKey]: true })}>
            <ha-svg-icon
              .path=${STATUS_ICON[statusKey] ?? mdiLightbulbOff}
            ></ha-svg-icon>
            ${statusText}
          </span>
        </div>
        ${
          openDoors.length
            ? html`<div class="doors">
                ${openDoors
                  .map((id) => hass.states[id]?.attributes.friendly_name ?? id)
                  .join(", ")}
              </div>`
            : nothing
        }
        ${
          stageKnown && stages.length
            ? renderStageBar(hass, stages, stage.state, attrs.day_in_stage ?? 0)
            : nothing
        }
        ${
          stageKnown && attrs.light_hours != null
            ? html`<div class="today">
                ${attrs.light_hours} h
                ${
                  attrs.total_days
                    ? html`<span class="muted">
                        ·
                        ${attrs.days_since_planting + 1}/${attrs.total_days}</span
                      >`
                    : nothing
                }
              </div>`
            : nothing
        }
        <div class="facts">
          ${renderTimestamp(
            hass,
            entities.nextChange
              ? (nextChange?.attributes.friendly_name ?? "")
              : "",
            nextChange
          )}
          ${
            entities.nextWatering
              ? renderTimestamp(
                  hass,
                  nextWatering?.attributes.friendly_name ?? "",
                  nextWatering
                )
              : nothing
          }
          ${
            options.compact
              ? nothing
              : html`
                  ${
                    entities.lastWatered
                      ? renderTimestamp(
                          hass,
                          lastWatered?.attributes.friendly_name ?? "",
                          lastWatered
                        )
                      : nothing
                  }
                  ${
                    isKnown(energy)
                      ? html`<div class="fact">
                          <span class="label"
                            >${energy.attributes.friendly_name}</span
                          >
                          <span class="value"
                            >${hass.formatEntityState(energy)}</span
                          >
                        </div>`
                      : nothing
                  }
                  ${
                    isKnown(cost)
                      ? html`<div class="fact">
                          <span class="label"
                            >${cost.attributes.friendly_name}</span
                          >
                          <span class="value"
                            >${hass.formatEntityState(cost)}</span
                          >
                        </div>`
                      : nothing
                  }
                  ${
                    entities.nextSowing
                      ? renderTimestamp(
                          hass,
                          nextSowing?.attributes.friendly_name ?? "",
                          nextSowing
                        )
                      : nothing
                  }
                `
          }
        </div>
        ${
          typeof soilMoisture === "number"
            ? html`<div class="soil">
                <ha-svg-icon .path=${mdiWaterOutline}></ha-svg-icon>
                <span>${soilMoisture}%</span>
                ${
                  typeof dryBelow === "number"
                    ? html`<span class="muted">&lt; ${dryBelow}%</span>`
                    : nothing
                }
              </div>`
            : nothing
        }
        ${
          !options.compact && attrs.water_note
            ? html`<p class="note">${attrs.water_note}</p>`
            : nothing
        }
        ${
          options.compact
            ? nothing
            : html`<div class="actions">
                ${
                  entities.watered && hass.states[entities.watered]
                    ? html`<ha-button
                        appearance="filled"
                        size="small"
                        @click=${pressHandler(hass, entities.watered)}
                      >
                        ${hass.states[entities.watered].attributes.friendly_name}
                      </ha-button>`
                    : nothing
                }
                ${
                  entities.sown && hass.states[entities.sown]
                    ? html`<ha-button
                        appearance="plain"
                        size="small"
                        @click=${pressHandler(hass, entities.sown)}
                      >
                        ${hass.states[entities.sown].attributes.friendly_name}
                      </ha-button>`
                    : nothing
                }
              </div>`
        }
      </div>
    </div>
  `;
};

export const growLightStyles = css`
  .grow-light {
    display: flex;
    flex-direction: column;
    height: 100%;
    box-sizing: border-box;
  }
  .photo {
    width: 100%;
    aspect-ratio: 16 / 7;
    object-fit: cover;
    display: block;
  }
  .compact .photo {
    aspect-ratio: 16 / 6;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--ha-space-2, 8px);
    padding: var(--ha-space-3, 12px) var(--ha-space-4, 16px)
      var(--ha-space-4, 16px);
  }
  .title-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--ha-space-2, 8px);
  }
  .title {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .name {
    font-size: var(--ha-font-size-l);
    font-weight: var(--ha-font-weight-medium);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage-name,
  .muted,
  .label {
    color: var(--secondary-text-color);
  }
  .stage-name {
    font-size: var(--ha-font-size-s);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex: none;
    padding: 2px 10px 2px 6px;
    border-radius: var(--ha-border-radius-pill, 999px);
    font-size: var(--ha-font-size-s);
    background: var(--secondary-background-color);
    color: var(--secondary-text-color);
  }
  .chip ha-svg-icon {
    --mdc-icon-size: 16px;
    width: 16px;
    height: 16px;
  }
  .chip.on {
    background: var(--primary-color);
    color: var(--text-primary-color, #fff);
  }
  .chip.paused {
    background: var(--warning-color);
    color: var(--text-primary-color, #fff);
  }
  .doors {
    font-size: var(--ha-font-size-s);
    color: var(--warning-color);
  }
  .stage-bar {
    display: flex;
    gap: 2px;
    height: 8px;
  }
  .segment {
    flex-basis: 0;
    min-width: 4px;
    border-radius: 4px;
    background: var(--divider-color);
    overflow: hidden;
  }
  .segment .fill {
    height: 100%;
    background: var(--primary-color);
    transition: width var(--ha-animation-duration-slow, 0.4s) ease;
  }
  .stage-names {
    display: flex;
    gap: 2px;
    font-size: var(--ha-font-size-xs, 11px);
    color: var(--secondary-text-color);
  }
  .stage-names span {
    flex-basis: 0;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .stage-names span.current {
    color: var(--primary-text-color);
    font-weight: var(--ha-font-weight-medium);
  }
  .compact .stage-names {
    display: none;
  }
  .today {
    font-size: var(--ha-font-size-s);
  }
  .facts {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--ha-space-2, 8px) var(--ha-space-4, 16px);
  }
  .compact .facts {
    grid-template-columns: 1fr;
  }
  .fact {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .label {
    font-size: var(--ha-font-size-xs, 11px);
  }
  .value {
    font-size: var(--ha-font-size-m);
  }
  .soil {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--ha-font-size-s);
  }
  .soil ha-svg-icon {
    --mdc-icon-size: 18px;
    width: 18px;
    height: 18px;
    color: var(--primary-color);
  }
  .note {
    margin: 0;
    font-size: var(--ha-font-size-s);
    color: var(--secondary-text-color);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ha-space-2, 8px);
  }
  @media (prefers-reduced-motion: reduce) {
    .segment .fill {
      transition: none;
    }
  }
`;
