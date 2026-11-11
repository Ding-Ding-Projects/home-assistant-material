import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import { SECTIONS_VIEW_LAYOUT } from "./const";

/**
 * What the notice at the top of a view in edit mode offers.
 *
 * - `none`: the view already has its own way to add content.
 * - `convert`: a single-card view. It can never take more cards, so the
 *   notice offers the sections layout, which can.
 * - `take-control`: the view is generated, so nothing can be added until an
 *   editable copy of it exists.
 */
export type ViewAddContentMode = "none" | "convert" | "take-control";

export const getViewAddContentMode = (options: {
  editMode: boolean;
  isStrategy: boolean;
  isPanel: boolean;
  cardCount: number;
}): ViewAddContentMode => {
  if (!options.editMode) {
    return "none";
  }
  if (options.isStrategy) {
    return "take-control";
  }
  // A panel view without a card has its own add button
  if (options.isPanel && options.cardCount > 0) {
    return "convert";
  }
  return "none";
};

/** The card a generated page shows while it has nothing to show yet. */
export const isPlaceholderCard = (card: LovelaceCardConfig): boolean =>
  card.type === "empty-state" && card.content_only === true;

/**
 * Turns a single-card (panel) view into a sections view. The cards move into
 * the first section; a generated placeholder card is dropped because the
 * section's own add control replaces it.
 */
export const convertPanelViewToSections = (
  config: LovelaceConfig,
  viewIndex: number
): LovelaceConfig => {
  const view = config.views[viewIndex];
  if (!view || "strategy" in view) {
    return config;
  }
  const { panel: _panel, cards, ...rest } = view as LovelaceViewConfig;
  const kept = (cards || []).filter((card) => !isPlaceholderCard(card));
  const converted: LovelaceViewConfig = {
    ...rest,
    type: SECTIONS_VIEW_LAYOUT,
    sections: [{ type: "grid", cards: kept }],
  };
  return {
    ...config,
    views: config.views.map((original, index) =>
      index === viewIndex ? converted : original
    ),
  };
};
