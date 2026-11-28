import type { HomeAssistant } from "../../types";
import type { LovelaceSectionRawConfig } from "../../data/lovelace/config/section";

export type DashboardStarter = "home" | "room" | "tablet" | "energy" | "empty";

/** Generate editable sections from data already visible to this user. */
export const dashboardStarterSections = async (
  starter: DashboardStarter,
  hass: HomeAssistant,
  areaId: string
): Promise<LovelaceSectionRawConfig[]> => {
  if (starter === "empty") return [];
  if (starter === "home") {
    const { HomeOverviewViewStrategy } =
      await import("../../panels/lovelace/strategies/home/home-overview-view-strategy");
    const view = await HomeOverviewViewStrategy.generate(
      { type: "home-overview" },
      hass
    );
    return view.sections ?? [];
  }
  if (starter === "room") {
    if (!hass.areas[areaId]) return [];
    const { HomeAreaViewStrategy } =
      await import("../../panels/lovelace/strategies/home/home-area-view-strategy");
    const view = await HomeAreaViewStrategy.generate(
      { type: "home-area", area: areaId },
      hass
    );
    return (
      view.sections ??
      (view.cards?.length ? [{ type: "grid", cards: view.cards }] : [])
    );
  }
  const cards = Object.values(hass.states)
    .filter(({ entity_id, attributes }) => {
      if (hass.entities[entity_id]?.hidden) return false;
      const domain = entity_id.split(".", 1)[0];
      return starter === "tablet"
        ? ["light", "switch", "climate"].includes(domain)
        : domain === "sensor" &&
            (attributes.device_class === "power" ||
              attributes.device_class === "energy");
    })
    .sort((a, b) => a.entity_id.localeCompare(b.entity_id))
    .map(({ entity_id }) => ({
      type: starter === "tablet" ? "button" : "tile",
      entity: entity_id,
    }));
  return cards.length ? [{ type: "grid", cards }] : [];
};
