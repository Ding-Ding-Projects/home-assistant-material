import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import type { LovelaceSectionRawConfig } from "../../../data/lovelace/config/section";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import { isStrategyView } from "../../../data/lovelace/config/view";

/**
 * Whole-dashboard editing tools: an outline of every card, bulk delete,
 * duplicate and move, find and replace of entity IDs, and a check for
 * problems. Every function returns a new configuration and leaves the one it
 * was given untouched, so each change goes through `saveConfig` and joins
 * the dashboard's undo and redo.
 */

/** Where a top-level card lives: its view, its section (-1 when the view has no sections) and its place. */
export interface CardPath {
  view: number;
  section: number;
  card: number;
}

export interface OutlineCard {
  path: CardPath;
  /** Nesting depth below a top-level card: 0 for the card itself. */
  depth: number;
  type: string;
  label: string;
  entities: string[];
  /** Only top-level cards can be selected for bulk actions. */
  selectable: boolean;
}

export interface OutlineSection {
  view: number;
  section: number;
  title: string;
  cards: OutlineCard[];
}

export interface OutlineView {
  view: number;
  title: string;
  path?: string;
  /** A view made by a strategy has no cards to edit here. */
  strategy: boolean;
  sections: OutlineSection[];
}

const ENTITY_ID = /^[a-z_]+\.[a-z0-9_]+$/;

const clone = <T>(value: T): T => structuredClone(value);

/** Every entity ID a card refers to, nested cards included, in order of first mention. */
export const cardEntities = (config: unknown): string[] => {
  const found = new Set<string>();
  const walk = (value: unknown, key?: string) => {
    if (typeof value === "string") {
      if (
        ENTITY_ID.test(value) &&
        (key === undefined ||
          /^(entity|entities|entity_id|camera_image|image_entity)$/.test(key))
      ) {
        found.add(value);
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item) => walk(item, key === "entities" ? key : undefined));
      return;
    }
    if (value && typeof value === "object") {
      Object.entries(value as Record<string, unknown>).forEach(([k, v]) =>
        walk(v, k)
      );
    }
  };
  walk(config, "");
  return [...found];
};

const cardLabel = (card: LovelaceCardConfig): string => {
  const title = (card.title ?? card.name ?? card.heading) as unknown;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  const entities = cardEntities(card);
  return entities[0] ?? "";
};

const containersOf = (
  view: LovelaceViewConfig
): { section: number; title: string; cards: LovelaceCardConfig[] }[] => {
  if (view.sections) {
    return view.sections.map((section, index) => {
      const s = section as LovelaceSectionRawConfig & {
        cards?: LovelaceCardConfig[];
      };
      const heading = (s.cards ?? []).find((c) => c.type === "heading");
      return {
        section: index,
        title:
          typeof heading?.heading === "string"
            ? heading.heading
            : String(index + 1),
        cards: s.cards ?? [],
      };
    });
  }
  return [{ section: -1, title: "", cards: view.cards ?? [] }];
};

/** The dashboard as a tree of views, sections and cards, nested cards included. */
export const outline = (config: LovelaceConfig): OutlineView[] =>
  config.views.map((rawView, viewIndex) => {
    const title = rawView.title ?? rawView.path ?? String(viewIndex + 1);
    if (isStrategyView(rawView)) {
      return {
        view: viewIndex,
        title,
        path: rawView.path,
        strategy: true,
        sections: [],
      };
    }
    return {
      view: viewIndex,
      title,
      path: rawView.path,
      strategy: false,
      sections: containersOf(rawView).map((container) => {
        const cards: OutlineCard[] = [];
        container.cards.forEach((card, cardIndex) => {
          const path = {
            view: viewIndex,
            section: container.section,
            card: cardIndex,
          };
          const walk = (c: LovelaceCardConfig, depth: number) => {
            cards.push({
              path,
              depth,
              type: String(c.type ?? "unknown"),
              label: cardLabel(c),
              entities: cardEntities(c),
              selectable: depth === 0,
            });
            const nested = [
              ...(Array.isArray(c.cards)
                ? (c.cards as LovelaceCardConfig[])
                : []),
              ...(c.card && typeof c.card === "object"
                ? [c.card as LovelaceCardConfig]
                : []),
            ];
            nested.forEach((n) => walk(n, depth + 1));
          };
          walk(card, 0);
        });
        return {
          view: viewIndex,
          section: container.section,
          title: container.title,
          cards,
        };
      }),
    };
  });

const cardsAt = (
  config: LovelaceConfig,
  view: number,
  section: number
): LovelaceCardConfig[] => {
  const v = config.views[view] as LovelaceViewConfig;
  if (!v || isStrategyView(v)) {
    throw new Error(`View ${view + 1} has no cards to change.`);
  }
  if (section >= 0) {
    const s = v.sections?.[section] as
      (LovelaceSectionRawConfig & { cards?: LovelaceCardConfig[] }) | undefined;
    if (!s) {
      throw new Error(`Section ${section + 1} is not there.`);
    }
    s.cards = s.cards ?? [];
    return s.cards;
  }
  v.cards = v.cards ?? [];
  return v.cards;
};

const key = (p: CardPath) => `${p.view}/${p.section}/${p.card}`;

/** Removes the cards at the given paths; returns the new configuration. */
export const deleteCards = (
  config: LovelaceConfig,
  paths: CardPath[]
): LovelaceConfig => {
  const next = clone(config);
  [...new Map(paths.map((p) => [key(p), p])).values()]
    .sort((a, b) => b.card - a.card)
    .forEach((p) => {
      const list = cardsAt(next, p.view, p.section);
      if (p.card < list.length) {
        list.splice(p.card, 1);
      }
    });
  return next;
};

/** Puts a copy of each card right after it. */
export const duplicateCards = (
  config: LovelaceConfig,
  paths: CardPath[]
): LovelaceConfig => {
  const next = clone(config);
  [...new Map(paths.map((p) => [key(p), p])).values()]
    .sort((a, b) => b.card - a.card)
    .forEach((p) => {
      const list = cardsAt(next, p.view, p.section);
      if (p.card < list.length) {
        list.splice(p.card + 1, 0, clone(list[p.card]));
      }
    });
  return next;
};

/**
 * Moves the cards to the end of another view or section, keeping their
 * order. A sections view without the named section gets a new one.
 */
export const moveCards = (
  config: LovelaceConfig,
  paths: CardPath[],
  toView: number,
  toSection: number
): LovelaceConfig => {
  const unique = [...new Map(paths.map((p) => [key(p), p])).values()];
  const ordered = [...unique].sort(
    (a, b) => a.view - b.view || a.section - b.section || a.card - b.card
  );
  const source = clone(config);
  const moving = ordered
    .map((p) => cardsAt(source, p.view, p.section)[p.card])
    .filter((card): card is LovelaceCardConfig => Boolean(card));
  const next = deleteCards(config, unique);
  const target = next.views[toView] as LovelaceViewConfig;
  if (!target || isStrategyView(target)) {
    throw new Error("Choose a view that is not made by a strategy.");
  }
  if (target.sections && toSection < 0) {
    target.sections.push({
      type: "grid",
      cards: [],
    } as LovelaceSectionRawConfig);
    toSection = target.sections.length - 1;
  }
  cardsAt(next, toView, target.sections ? toSection : -1).push(...moving);
  return next;
};

/**
 * Replaces one entity ID with another wherever a value is exactly that ID,
 * in every view, section, badge and card. Text that only contains the ID is
 * left alone, so templates and names are never rewritten by accident.
 */
export const replaceEntity = (
  config: LovelaceConfig,
  from: string,
  to: string
): { config: LovelaceConfig; count: number } => {
  if (!ENTITY_ID.test(from) || !ENTITY_ID.test(to)) {
    throw new Error("Both must be entity IDs, such as light.kitchen.");
  }
  let count = 0;
  const walk = (value: unknown): unknown => {
    if (value === from) {
      count++;
      return to;
    }
    if (Array.isArray(value)) {
      return value.map(walk);
    }
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [
          k,
          walk(v),
        ])
      );
    }
    return value;
  };
  const next = walk(clone(config)) as LovelaceConfig;
  return { config: next, count };
};

export type ProblemKind =
  | "unknown_entity"
  | "empty_section"
  | "empty_view"
  | "duplicate_path"
  | "no_type"
  | "unavailable_entity";

export interface Problem {
  kind: ProblemKind;
  view: number;
  section?: number;
  card?: number;
  detail: string;
}

/** Problems a person would want to know about before leaving edit mode. */
export const checkDashboard = (
  config: LovelaceConfig,
  states: Record<string, { state: string } | undefined>
): Problem[] => {
  const problems: Problem[] = [];
  const paths = new Map<string, number>();
  outline(config).forEach((v) => {
    if (v.path) {
      if (paths.has(v.path)) {
        problems.push({ kind: "duplicate_path", view: v.view, detail: v.path });
      }
      paths.set(v.path, v.view);
    }
    if (v.strategy) {
      return;
    }
    const total = v.sections.reduce((n, s) => n + s.cards.length, 0);
    if (!total) {
      problems.push({ kind: "empty_view", view: v.view, detail: v.title });
    }
    v.sections.forEach((s) => {
      if (s.section >= 0 && !s.cards.length) {
        problems.push({
          kind: "empty_section",
          view: v.view,
          section: s.section,
          detail: s.title,
        });
      }
      s.cards.forEach((c) => {
        // A top-level card already lists the entities of the cards inside it.
        if (!c.selectable) {
          return;
        }
        if (c.type === "unknown") {
          problems.push({
            kind: "no_type",
            view: v.view,
            section: s.section,
            card: c.path.card,
            detail: c.label,
          });
        }
        c.entities.forEach((e) => {
          const st = states[e];
          if (!st) {
            problems.push({
              kind: "unknown_entity",
              view: v.view,
              section: s.section,
              card: c.path.card,
              detail: e,
            });
          } else if (st.state === "unavailable") {
            problems.push({
              kind: "unavailable_entity",
              view: v.view,
              section: s.section,
              card: c.path.card,
              detail: e,
            });
          }
        });
      });
    });
  });
  return problems;
};

export interface DashboardStats {
  views: number;
  sections: number;
  cards: number;
  entities: number;
  types: [string, number][];
}

export const dashboardStats = (config: LovelaceConfig): DashboardStats => {
  const o = outline(config);
  const entities = new Set<string>();
  const types = new Map<string, number>();
  let cards = 0;
  let sections = 0;
  o.forEach((v) =>
    v.sections.forEach((s) => {
      if (s.section >= 0) {
        sections++;
      }
      s.cards.forEach((c) => {
        cards++;
        types.set(c.type, (types.get(c.type) ?? 0) + 1);
        c.entities.forEach((e) => entities.add(e));
      });
    })
  );
  return {
    views: o.length,
    sections,
    cards,
    entities: entities.size,
    types: [...types.entries()].sort((a, b) => b[1] - a[1]),
  };
};

/** Inserts copies of the cards at the end of a view or section. */
export const insertCards = (
  config: LovelaceConfig,
  cards: LovelaceCardConfig[],
  view: number,
  section: number
): LovelaceConfig => {
  const next = clone(config);
  const target = next.views[view] as LovelaceViewConfig;
  if (target?.sections && section < 0) {
    target.sections.push({
      type: "grid",
      cards: [],
    } as LovelaceSectionRawConfig);
    section = target.sections.length - 1;
  }
  cardsAt(next, view, target?.sections ? section : -1).push(
    ...cards.map(clone)
  );
  return next;
};
