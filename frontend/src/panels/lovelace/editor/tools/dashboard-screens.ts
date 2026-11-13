import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { CardPath } from "../dashboard-tools";
import {
  getCard,
  hasSectionsLayout,
  listEditableCards,
  MAX_GRID_COLUMNS,
  replaceCard,
  withGridOptions,
} from "./dashboard-edit";

export interface ScreenSize {
  id: "phone" | "tablet" | "wall" | "desktop";
  width: number;
  height: number;
  /** How much the frame is shrunk to fit beside the others. */
  scale: number;
}

/** The screens previewed side by side, in CSS pixels. */
export const SCREENS: ScreenSize[] = [
  { id: "phone", width: 390, height: 760, scale: 0.5 },
  { id: "tablet", width: 820, height: 600, scale: 0.4 },
  { id: "wall", width: 1280, height: 800, scale: 0.3 },
  { id: "desktop", width: 1440, height: 800, scale: 0.28 },
];

/**
 * Columns across the screen of a phone in a sections view: a phone shows one
 * section at a time and a section is this many columns wide.
 */
export const PHONE_GRID_COLUMNS = MAX_GRID_COLUMNS;

export interface WideCard {
  path: CardPath;
  label: string;
  /** The width set in the card's grid options, in columns. */
  columns: number;
}

/**
 * The cards of a sections view whose `grid_options` ask for more columns than
 * a phone has. Read from the saved configuration; cards without a numeric
 * width (automatic or full width) never count.
 */
export const findWideCards = (
  config: LovelaceConfig,
  viewIndex: number,
  phoneColumns = PHONE_GRID_COLUMNS
): WideCard[] =>
  hasSectionsLayout(config, viewIndex)
    ? listEditableCards(config)
        .filter(
          (c) =>
            c.path.view === viewIndex &&
            typeof c.card.grid_options?.columns === "number" &&
            c.card.grid_options.columns > phoneColumns
        )
        .map((c) => ({
          path: c.path,
          label: `${c.card.type}: ${c.label}`,
          columns: c.card.grid_options!.columns as number,
        }))
    : [];

/**
 * The configuration with these cards limited to the phone width. Every other
 * card and every other grid option is kept as it is.
 */
export const capCardWidths = (
  config: LovelaceConfig,
  wide: WideCard[],
  phoneColumns = PHONE_GRID_COLUMNS
): LovelaceConfig => {
  let next = config;
  wide.forEach(({ path }) => {
    const card = getCard(next, path);
    if (card) {
      next = replaceCard(
        next,
        path,
        withGridOptions(card, { columns: phoneColumns })
      );
    }
  });
  return next;
};

/**
 * The address of one view of the dashboard that is open now, on the same
 * origin. The dashboard's own path is the first segment of the current
 * address, so this works for the default dashboard and for any other.
 */
export const viewAddress = (
  pathname: string,
  viewPath: string | undefined,
  viewIndex: number
): string => {
  const base = pathname.split("/").filter(Boolean)[0] ?? "lovelace";
  return `/${base}/${encodeURIComponent(viewPath || String(viewIndex))}`;
};
