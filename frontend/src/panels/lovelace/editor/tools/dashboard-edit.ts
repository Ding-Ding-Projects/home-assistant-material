import type { LovelaceCardConfig } from "../../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import { isStrategyView } from "../../../../data/lovelace/config/view";
import type { LovelaceGridOptions } from "../../types";
import type { CardPath } from "../dashboard-tools";

/**
 * Pure helpers for the dashboard editing tools: finding a card by its path,
 * replacing it, and the few style properties a card type really supports.
 * Every function returns a new configuration and never changes its input.
 */

export interface EditableCard {
  key: string;
  path: CardPath;
  label: string;
  card: LovelaceCardConfig;
  viewTitle: string;
}

export const pathKey = (p: CardPath): string =>
  `${p.view}/${p.section}/${p.card}`;

export const pathFromKey = (key: string): CardPath => {
  const [view, section, card] = key.split("/").map(Number);
  return { view, section, card };
};

type CardList = LovelaceCardConfig[] | undefined;

const listOf = (view: LovelaceViewConfig, section: number): CardList => {
  if (section >= 0) {
    return (
      view.sections?.[section] as { cards?: LovelaceCardConfig[] } | undefined
    )?.cards;
  }
  return view.cards;
};

/** The top-level card at a path, or undefined when the path no longer exists. */
export const getCard = (
  config: LovelaceConfig,
  path: CardPath
): LovelaceCardConfig | undefined => {
  const view = config.views[path.view];
  if (!view || isStrategyView(view)) {
    return undefined;
  }
  return listOf(view, path.section)?.[path.card];
};

/** Every top-level card of every editable view, in reading order. */
export const listEditableCards = (config: LovelaceConfig): EditableCard[] => {
  const result: EditableCard[] = [];
  config.views.forEach((view, viewIndex) => {
    if (isStrategyView(view)) {
      return;
    }
    const viewTitle = view.title ?? view.path ?? String(viewIndex + 1);
    const sections = view.sections ? view.sections.map((_s, i) => i) : [-1];
    sections.forEach((section) => {
      (listOf(view, section) ?? []).forEach((card, cardIndex) => {
        const path = { view: viewIndex, section, card: cardIndex };
        const name = (card.title ?? card.name ?? card.heading) as unknown;
        const entity = (card.entity as string | undefined) ?? "";
        result.push({
          key: pathKey(path),
          path,
          card,
          viewTitle,
          label:
            (typeof name === "string" && name.trim()) ||
            entity ||
            card.type ||
            "",
        });
      });
    });
  });
  return result;
};

/** The configuration with one card replaced; the input is left untouched. */
export const replaceCard = (
  config: LovelaceConfig,
  path: CardPath,
  card: LovelaceCardConfig
): LovelaceConfig => {
  const next = structuredClone(config);
  const view = next.views[path.view];
  if (view && !isStrategyView(view)) {
    const list = listOf(view, path.section);
    if (list && list[path.card]) {
      list[path.card] = structuredClone(card);
    }
  }
  return next;
};

/** The configuration with one view's theme set, or removed when empty. */
export const setViewTheme = (
  config: LovelaceConfig,
  viewIndex: number,
  theme: string | undefined
): LovelaceConfig => {
  const next = structuredClone(config);
  const view = next.views[viewIndex];
  if (view) {
    if (theme) {
      view.theme = theme;
    } else {
      delete view.theme;
    }
  }
  return next;
};

/** The interaction properties a card config can hold. */
export const INTERACTION_KEYS = [
  "tap_action",
  "hold_action",
  "double_tap_action",
] as const;

export type InteractionKey = (typeof INTERACTION_KEYS)[number];

/** Card types that read `tap_action`, `hold_action` and `double_tap_action`. */
const INTERACTIVE_TYPES = new Set([
  "button",
  "tile",
  "picture",
  "picture-entity",
  "picture-glance",
  "light",
  "area",
  "sensor",
]);

/** Card types known to read the three interaction properties. */
export const supportsInteractions = (card: LovelaceCardConfig): boolean =>
  INTERACTIVE_TYPES.has(card.type);

/** The style properties each card type really reads, besides the grid size every card has. */
const STYLE_KEYS_BY_TYPE: Record<string, readonly string[]> = {
  tile: ["color", "vertical", "hide_state", "show_entity_picture"],
  button: ["show_name", "show_icon", "show_state", "icon_height"],
  heading: ["heading_style"],
};

export const STYLE_COMMON_KEYS = ["grid_options"] as const;

/** The style properties that apply to this card type. */
export const styleKeys = (type: string): string[] => [
  ...STYLE_COMMON_KEYS,
  ...(STYLE_KEYS_BY_TYPE[type] ?? []),
];

export interface CopiedStyle {
  type: string;
  values: Record<string, unknown>;
}

/** The style values a card has, ready to paste on another card. */
export const copyStyle = (card: LovelaceCardConfig): CopiedStyle => {
  const values: Record<string, unknown> = {};
  styleKeys(card.type).forEach((key) => {
    if (card[key] !== undefined) {
      values[key] = structuredClone(card[key]);
    }
  });
  return { type: card.type, values };
};

/**
 * A card with the copied style pasted on. Only properties the target type
 * supports are applied; the rest are reported as skipped.
 */
export const pasteStyle = (
  card: LovelaceCardConfig,
  copied: CopiedStyle
): { card: LovelaceCardConfig; applied: string[]; skipped: string[] } => {
  const allowed = new Set(styleKeys(card.type));
  const next: LovelaceCardConfig = { ...card };
  const applied: string[] = [];
  const skipped: string[] = [];
  Object.entries(copied.values).forEach(([key, value]) => {
    if (allowed.has(key)) {
      next[key] = structuredClone(value);
      applied.push(key);
    } else {
      skipped.push(key);
    }
  });
  return { card: next, applied, skipped };
};

/** A view that has sections lets each card choose its columns and rows. */
export const hasSectionsLayout = (
  config: LovelaceConfig,
  viewIndex: number
): boolean => {
  const view = config.views[viewIndex];
  return !!view && !isStrategyView(view) && !!view.sections;
};

export const MAX_GRID_COLUMNS = 12;

/** The grid size options after changing one value; empty options are removed. */
export const withGridOptions = (
  card: LovelaceCardConfig,
  change: Partial<Pick<LovelaceGridOptions, "columns" | "rows">>
): LovelaceCardConfig => {
  const merged: LovelaceGridOptions = { ...card.grid_options, ...change };
  if (merged.columns === undefined) {
    delete merged.columns;
  }
  if (merged.rows === undefined) {
    delete merged.rows;
  }
  const next: LovelaceCardConfig = { ...card };
  if (Object.keys(merged).length) {
    next.grid_options = merged;
  } else {
    delete next.grid_options;
  }
  return next;
};

/** Clamps a requested column count to what a section can hold. */
export const clampColumns = (value: number): number =>
  Math.min(MAX_GRID_COLUMNS, Math.max(1, Math.round(value)));

/** Clamps a requested row count to a positive whole number. */
export const clampRows = (value: number): number =>
  Math.min(100, Math.max(1, Math.round(value)));

/**
 * Applies a grid size to many cards at once, the way "same width" or
 * "same height" works in a design tool.
 */
export const setGridForCards = (
  config: LovelaceConfig,
  paths: CardPath[],
  change: Partial<Pick<LovelaceGridOptions, "columns" | "rows">>
): LovelaceConfig => {
  let next = config;
  paths.forEach((path) => {
    const card = getCard(next, path);
    if (card) {
      next = replaceCard(next, path, withGridOptions(card, change));
    }
  });
  return next;
};
