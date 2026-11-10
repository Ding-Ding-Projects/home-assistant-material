import type { LocalizeFunc } from "../../../common/translations/localize";
import type { HomeAssistant } from "../../../types";

/**
 * What each settings section holds right now, in a few words, for its card
 * on the settings home page: "42 devices, 14 integrations". A section this
 * does not know keeps its fixed description.
 */

export interface SectionCounts {
  devices: number;
  /** Undefined until the list of integrations has been read. */
  integrations?: number;
  automations: number;
  scenes: number;
  areas: number;
  floors: number;
  dashboards: number;
  people: number;
  version?: string;
}

const countDomain = (
  states: HomeAssistant["states"],
  domain: string
): number => {
  const prefix = `${domain}.`;
  return Object.keys(states).filter((id) => id.startsWith(prefix)).length;
};

export const sectionCounts = (
  hass: Pick<
    HomeAssistant,
    "devices" | "states" | "areas" | "floors" | "panels" | "config"
  >,
  integrations?: number
): SectionCounts => ({
  devices: Object.keys(hass.devices ?? {}).length,
  integrations,
  automations: countDomain(hass.states, "automation"),
  scenes: countDomain(hass.states, "scene"),
  areas: Object.keys(hass.areas ?? {}).length,
  floors: Object.keys(hass.floors ?? {}).length,
  dashboards: Object.values(hass.panels ?? {}).filter(
    (panel) => panel.component_name === "lovelace"
  ).length,
  people: countDomain(hass.states, "person"),
  version: hass.config?.version,
});

/** The summary of each section, by the path of its card. */
export const sectionSummaries = (
  counts: SectionCounts,
  localize: LocalizeFunc
): Record<string, string> => {
  const text = (key: string, values: Record<string, number | string>) =>
    localize(`ui.panel.config.dashboard.summaries.${key}` as any, values);
  const summaries: Record<string, string> = {
    "/config/integrations":
      counts.integrations === undefined
        ? text("devices", { devices: counts.devices })
        : `${text("devices", { devices: counts.devices })}, ${text(
            "integrations",
            { integrations: counts.integrations }
          )}`,
    "/config/automation": `${text("automations", {
      automations: counts.automations,
    })}, ${text("scenes", { scenes: counts.scenes })}`,
    "/config/areas": counts.floors
      ? text("areas_floors", { areas: counts.areas, floors: counts.floors })
      : text("areas", { areas: counts.areas }),
    "/config/lovelace/dashboards": text("dashboards", {
      dashboards: counts.dashboards,
    }),
    "/config/person": text("people", { people: counts.people }),
  };
  if (counts.version) {
    summaries["/config/info"] = text("version", { version: counts.version });
  }
  return summaries;
};
