import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import { isStrategyView } from "../../../data/lovelace/config/view";
import { addCard } from "./config-util";
import type { LovelacePath } from "./lovelace-path";
import {
  deleteAtPath,
  getAtPath,
  insertAtPath,
  isAncestorPath,
  pathEquals,
  setAtPath,
} from "./lovelace-path";

/**
 * Whole-selection actions on cards at several paths. Every function returns a
 * new configuration, so one save is one undo step.
 */

const comparePaths = (a: LovelacePath, b: LovelacePath): number => {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    if (a[i] === b[i]) {
      continue;
    }
    if (typeof a[i] === "number" && typeof b[i] === "number") {
      return (a[i] as number) - (b[i] as number);
    }
    return String(a[i]).localeCompare(String(b[i]));
  }
  return a.length - b.length;
};

/**
 * The selected card paths in document order, without duplicates and without
 * a card whose parent card is selected too (it goes along with its parent).
 */
export const normalizeSelection = (paths: LovelacePath[]): LovelacePath[] => {
  const sorted = [...paths].sort(comparePaths);
  const result: LovelacePath[] = [];
  sorted.forEach((path) => {
    if (
      result.some(
        (other) => pathEquals(other, path) || isAncestorPath(other, path)
      )
    ) {
      return;
    }
    result.push(path);
  });
  return result;
};

/** The configurations of the selected cards, in document order. */
export const selectedCards = (
  config: LovelaceConfig,
  paths: LovelacePath[]
): LovelaceCardConfig[] =>
  normalizeSelection(paths)
    .map((path) => getAtPath<LovelaceCardConfig>(config, path))
    .filter(
      (card): card is LovelaceCardConfig =>
        Boolean(card) && typeof card === "object"
    )
    .map((card) => structuredClone(card));

/** Removes the selected cards. */
export const deleteSelectedCards = (
  config: LovelaceConfig,
  paths: LovelacePath[]
): LovelaceConfig =>
  [...normalizeSelection(paths)]
    .reverse()
    .reduce((next, path) => deleteAtPath(next, path), config);

/** Puts a copy of each selected card right after it. */
export const duplicateSelectedCards = (
  config: LovelaceConfig,
  paths: LovelacePath[]
): LovelaceConfig =>
  [...normalizeSelection(paths)].reverse().reduce((next, path) => {
    const card = getAtPath<LovelaceCardConfig>(next, path);
    if (!card) {
      return next;
    }
    const index = path[path.length - 1];
    if (typeof index !== "number") {
      return next;
    }
    return insertAtPath(
      next,
      [...path.slice(0, -1), index + 1],
      structuredClone(card)
    );
  }, config);

/** Where cards can be put: a view without sections, or one section of a sections view. */
export interface CardTarget {
  /** The path of the view or section that holds the cards. */
  path: LovelacePath;
  view: number;
  /** The section's number, or undefined for a view that has no sections. */
  section?: number;
  viewTitle: string;
  sectionTitle?: string;
}

/** Every place that cards can be moved or pasted to; strategy views have none. */
export const listCardTargets = (
  config: LovelaceConfig,
  unnamedView = ""
): CardTarget[] => {
  const targets: CardTarget[] = [];
  config.views.forEach((view, viewIndex) => {
    if (isStrategyView(view)) {
      return;
    }
    const viewConfig = view as LovelaceViewConfig;
    const viewTitle = viewConfig.title || viewConfig.path || unnamedView;
    if (viewConfig.type === "sections" || viewConfig.sections) {
      (viewConfig.sections ?? []).forEach((_section, sectionIndex) => {
        targets.push({
          path: ["views", viewIndex, "sections", sectionIndex],
          view: viewIndex,
          section: sectionIndex,
          viewTitle,
        });
      });
      return;
    }
    targets.push({ path: ["views", viewIndex], view: viewIndex, viewTitle });
  });
  return targets;
};

/** The views a card can go to; a sections view counts once, whatever its sections. */
export const listTargetViews = (
  targets: CardTarget[]
): { view: number; title: string; hasSections: boolean }[] => {
  const views = new Map<
    number,
    { view: number; title: string; hasSections: boolean }
  >();
  targets.forEach((target) => {
    if (!views.has(target.view)) {
      views.set(target.view, {
        view: target.view,
        title: target.viewTitle,
        hasSections: target.section !== undefined,
      });
    }
  });
  return [...views.values()];
};

/** Adds the cards to the end of a view or section. */
export const appendCardsTo = (
  config: LovelaceConfig,
  containerPath: LovelacePath,
  cards: LovelaceCardConfig[]
): LovelaceConfig =>
  cards.reduce(
    (next, card) => addCard(next, containerPath, structuredClone(card)),
    config
  );

/** Adds a new empty section to a sections view and returns where it is. */
export const addEmptySection = (
  config: LovelaceConfig,
  view: number
): { config: LovelaceConfig; path: LovelacePath } => {
  const viewConfig = config.views[view] as LovelaceViewConfig;
  const sections = viewConfig.sections ?? [];
  const path: LovelacePath = ["views", view, "sections", sections.length];
  return {
    config: setAtPath(
      config,
      ["views", view, "sections"],
      [...sections, { type: "grid", cards: [] }]
    ),
    path,
  };
};

/** Moves the selected cards to the end of another view or section. */
export const moveSelectedCards = (
  config: LovelaceConfig,
  paths: LovelacePath[],
  containerPath: LovelacePath
): LovelaceConfig => {
  const cards = selectedCards(config, paths);
  if (!cards.length) {
    return config;
  }
  // The cards are added first and the originals are removed afterwards by
  // their paths, which still point at the same cards because the new ones go
  // to the end of the target list.
  return deleteSelectedCards(
    appendCardsTo(config, containerPath, cards),
    paths
  );
};

/** Applies a style block to every selected card, keeping each card's other style values. */
export const styleSelectedCards = (
  config: LovelaceConfig,
  paths: LovelacePath[],
  style: Record<string, unknown>,
  feedback?: Record<string, unknown>
): LovelaceConfig =>
  normalizeSelection(paths).reduce((next, path) => {
    const card = getAtPath<LovelaceCardConfig>(next, path);
    if (!card || typeof card !== "object") {
      return next;
    }
    const merged = {
      ...((card.style as Record<string, unknown> | undefined) ?? {}),
      ...style,
    };
    const updated: LovelaceCardConfig = { ...card };
    if (Object.keys(merged).length) {
      updated.style = merged;
    }
    if (feedback && Object.keys(feedback).length) {
      updated.gesture_feedback = {
        ...((card.gesture_feedback as Record<string, unknown> | undefined) ??
          {}),
        ...feedback,
      };
    }
    return setAtPath(next, path, updated);
  }, config);
