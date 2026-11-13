import { getFirstDrawMs } from "../../common/card-first-draw";
import { cardEntities } from "../dashboard-tools";
import type { CardLike } from "./deep-dom";
import { findRenderedCards, renderedCardLabel } from "./deep-dom";

/**
 * Performance meter. For each card on the page it measures, in this browser,
 * how long the card's own element takes to render again when asked to
 * (median of a few runs). It does not include the cards or elements inside
 * it, network time or the server. It also counts the entities in the card's
 * configuration: each one is a reason for the card to render again when that
 * entity changes. It does not count subscriptions the card opens by itself.
 */

export interface CardTiming {
  label: string;
  type: string;
  /** Milliseconds for one render of the card's own element; undefined when the card cannot be measured this way. */
  ms?: number;
  /** Milliseconds from creating the card to its first finished render; undefined when not recorded. */
  firstDrawMs?: number;
  /** Entities named in the card's configuration. */
  entities: number;
  element: HTMLElement;
}

export interface PerfReport {
  cards: CardTiming[];
  /** Sum of the measured render times. */
  totalMs: number;
  /** Cards at or over the slow threshold. */
  slow: number;
}

/** One frame at 60 Hz. A card that renders slower than this can make scrolling and updates feel stuck. */
export const SLOW_MS = 16;

const RUNS = 3;

interface Updatable {
  requestUpdate?: () => void;
  updateComplete?: Promise<unknown>;
}

const frame = () =>
  new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
  });

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

export const measureCards = async (
  onProgress?: (done: number, total: number) => void
): Promise<PerfReport> => {
  const elements = findRenderedCards();
  const cards: CardTiming[] = [];
  for (let i = 0; i < elements.length; i++) {
    const element = elements[i];
    const card = element as CardLike & { _element?: Updatable };
    const target = (card._element ?? card) as Updatable;
    let ms: number | undefined;
    if (
      typeof target.requestUpdate === "function" &&
      target.updateComplete instanceof Promise
    ) {
      const samples: number[] = [];
      for (let run = 0; run < RUNS; run++) {
        const start = performance.now();
        target.requestUpdate();
        // eslint-disable-next-line no-await-in-loop
        await target.updateComplete;
        samples.push(performance.now() - start);
      }
      ms = Math.round(median(samples) * 10) / 10;
    }
    cards.push({
      label: renderedCardLabel(card),
      type: String(card.config?.type ?? "card"),
      ms,
      firstDrawMs: getFirstDrawMs(element),
      entities: cardEntities(card.config ?? {}).length,
      element,
    });
    onProgress?.(i + 1, elements.length);
    // Let the page breathe between cards.
    // eslint-disable-next-line no-await-in-loop
    await frame();
  }
  cards.sort((a, b) => (b.ms ?? -1) - (a.ms ?? -1) || b.entities - a.entities);
  return {
    cards,
    totalMs: Math.round(cards.reduce((n, c) => n + (c.ms ?? 0), 0) * 10) / 10,
    slow: cards.filter((c) => (c.ms ?? 0) >= SLOW_MS).length,
  };
};
