import type { LovelaceConfig } from "../../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../../data/lovelace/config/view";
import { isStrategyView } from "../../../../data/lovelace/config/view";
import { cardEntities } from "../dashboard-tools";

/**
 * A structural comparison of two dashboard configurations. Views are matched
 * by path (or title), cards inside a view by a longest common subsequence of
 * their exact configuration, so a card that moved or was edited is reported
 * once rather than as a pile of unrelated changes.
 */

export type DiffKind = "same" | "added" | "removed" | "changed";

export interface CardDiff {
  kind: DiffKind;
  type: string;
  label: string;
  /** Title of the section the card sits in; empty for a view without sections. */
  section: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export interface ViewDiff {
  kind: DiffKind;
  title: string;
  /** True when something other than the cards changed (title, icon, theme, layout). */
  settingsChanged: boolean;
  cards: CardDiff[];
}

export interface DiffSummary {
  added: number;
  removed: number;
  changed: number;
  same: number;
}

export const stableStringify = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`
      )
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
};

interface FlatCard {
  config: Record<string, unknown>;
  json: string;
  section: string;
}

const flatten = (view: LovelaceViewConfig): FlatCard[] => {
  const out: FlatCard[] = [];
  const add = (cards: unknown, section: string) =>
    (Array.isArray(cards) ? cards : []).forEach((c) => {
      const config = c as Record<string, unknown>;
      out.push({ config, json: stableStringify(config), section });
    });
  if (view.sections) {
    view.sections.forEach((s, i) => {
      const cards = (s as { cards?: unknown[] }).cards;
      const heading = (Array.isArray(cards) ? cards : []).find(
        (c) => (c as { type?: string }).type === "heading"
      ) as { heading?: string } | undefined;
      add(cards, heading?.heading ?? String(i + 1));
    });
  } else {
    add(view.cards, "");
  }
  return out;
};

const label = (config: Record<string, unknown>): string => {
  const title = config.title ?? config.name ?? config.heading;
  if (typeof title === "string" && title.trim()) {
    return title.trim();
  }
  return cardEntities(config)[0] ?? "";
};

const diffCards = (a: FlatCard[], b: FlatCard[]): CardDiff[] => {
  // Longest common subsequence on exact configuration.
  const n = a.length;
  const m = b.length;
  const table: number[][] = Array.from({ length: n + 1 }, () =>
    new Array<number>(m + 1).fill(0)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i].json === b[j].json
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const result: CardDiff[] = [];
  const flushGap = (removed: FlatCard[], added: FlatCard[]) => {
    const paired = Math.min(removed.length, added.length);
    let used = 0;
    // Pair a removed and an added card of the same type as one edited card.
    const takenAdded = new Set<number>();
    removed.forEach((r) => {
      const idx = added.findIndex(
        (x, k) => !takenAdded.has(k) && x.config.type === r.config.type
      );
      if (idx >= 0 && used < paired) {
        takenAdded.add(idx);
        used++;
        result.push({
          kind: "changed",
          type: String(r.config.type ?? "unknown"),
          label: label(added[idx].config) || label(r.config),
          section: added[idx].section,
          before: r.config,
          after: added[idx].config,
        });
      } else {
        result.push({
          kind: "removed",
          type: String(r.config.type ?? "unknown"),
          label: label(r.config),
          section: r.section,
          before: r.config,
        });
      }
    });
    added.forEach((x, k) => {
      if (!takenAdded.has(k)) {
        result.push({
          kind: "added",
          type: String(x.config.type ?? "unknown"),
          label: label(x.config),
          section: x.section,
          after: x.config,
        });
      }
    });
  };
  let i = 0;
  let j = 0;
  let removed: FlatCard[] = [];
  let added: FlatCard[] = [];
  while (i < n || j < m) {
    if (i < n && j < m && a[i].json === b[j].json) {
      flushGap(removed, added);
      removed = [];
      added = [];
      result.push({
        kind: "same",
        type: String(b[j].config.type ?? "unknown"),
        label: label(b[j].config),
        section: b[j].section,
        before: a[i].config,
        after: b[j].config,
      });
      i++;
      j++;
    } else if (j >= m || (i < n && table[i + 1][j] >= table[i][j + 1])) {
      removed.push(a[i++]);
    } else {
      added.push(b[j++]);
    }
  }
  flushGap(removed, added);
  return result;
};

const viewKey = (view: LovelaceViewConfig, index: number): string =>
  view.path
    ? `path:${view.path}`
    : view.title
      ? `title:${view.title}`
      : `index:${index}`;

const viewTitle = (view: LovelaceViewConfig, index: number): string =>
  view.title ?? view.path ?? String(index + 1);

const viewSettings = (view: LovelaceViewConfig): string => {
  const {
    cards: _cards,
    sections: _sections,
    badges: _badges,
    ...rest
  } = view as LovelaceViewConfig & Record<string, unknown>;
  return stableStringify(rest);
};

export const diffDashboards = (
  before: LovelaceConfig,
  after: LovelaceConfig
): ViewDiff[] => {
  const result: ViewDiff[] = [];
  const afterByKey = new Map<string, [LovelaceViewConfig, number]>();
  after.views.forEach((v, i) => afterByKey.set(viewKey(v, i), [v, i]));
  const matched = new Set<string>();
  before.views.forEach((a, i) => {
    const key = viewKey(a, i);
    const hit = afterByKey.get(key);
    if (!hit) {
      result.push({
        kind: "removed",
        title: viewTitle(a, i),
        settingsChanged: false,
        cards: isStrategyView(a)
          ? []
          : flatten(a).map((c) => ({
              kind: "removed" as const,
              type: String(c.config.type ?? "unknown"),
              label: label(c.config),
              section: c.section,
              before: c.config,
            })),
      });
      return;
    }
    matched.add(key);
    const [b, j] = hit;
    const cards =
      isStrategyView(a) || isStrategyView(b)
        ? []
        : diffCards(flatten(a), flatten(b));
    const settingsChanged = viewSettings(a) !== viewSettings(b);
    const changed = settingsChanged || cards.some((c) => c.kind !== "same");
    result.push({
      kind: changed ? "changed" : "same",
      title: viewTitle(b, j),
      settingsChanged,
      cards,
    });
  });
  after.views.forEach((b, j) => {
    if (matched.has(viewKey(b, j))) {
      return;
    }
    result.push({
      kind: "added",
      title: viewTitle(b, j),
      settingsChanged: false,
      cards: isStrategyView(b)
        ? []
        : flatten(b).map((c) => ({
            kind: "added" as const,
            type: String(c.config.type ?? "unknown"),
            label: label(c.config),
            section: c.section,
            after: c.config,
          })),
    });
  });
  return result;
};

export const summarizeDiff = (diff: ViewDiff[]): DiffSummary => {
  const summary: DiffSummary = { added: 0, removed: 0, changed: 0, same: 0 };
  diff.forEach((view) => {
    view.cards.forEach((card) => {
      summary[card.kind]++;
    });
    if (view.settingsChanged) {
      summary.changed++;
    }
  });
  return summary;
};
