import type { LovelaceCardConfig } from "../../../data/lovelace/config/card";
import { styleKeys } from "./tools/dashboard-edit";

/**
 * A history of copied cards that is kept in this browser's local storage, so
 * it survives a reload and is seen by every tab. It holds the last few
 * copies; each entry is one copy action and may hold several cards.
 */

export const CARD_CLIPBOARD_HISTORY_KEY = "dashboardCardClipboardHistory";

export const CARD_CLIPBOARD_HISTORY_LIMIT = 10;

export interface CardClipboardEntry {
  id: string;
  /** Milliseconds since the epoch. */
  time: number;
  /** The title of the dashboard the cards came from, when known. */
  source?: string;
  cards: LovelaceCardConfig[];
}

const isCard = (value: unknown): value is LovelaceCardConfig =>
  Boolean(value) &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  typeof (value as { type?: unknown }).type === "string";

/** Reads stored text back into entries, dropping anything that is not valid. */
export const parseClipboardHistory = (raw: unknown): CardClipboardEntry[] => {
  let value = raw;
  if (typeof raw === "string") {
    try {
      value = JSON.parse(raw);
    } catch (_err: unknown) {
      return [];
    }
  }
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: CardClipboardEntry[] = [];
  value.forEach((item) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const { id, time, source, cards } = item as Partial<CardClipboardEntry>;
    if (
      typeof id !== "string" ||
      typeof time !== "number" ||
      !Number.isFinite(time) ||
      !Array.isArray(cards)
    ) {
      return;
    }
    const valid = cards.filter(isCard);
    if (!valid.length) {
      return;
    }
    entries.push({
      id,
      time,
      cards: valid,
      ...(typeof source === "string" && source ? { source } : {}),
    });
  });
  return entries.slice(0, CARD_CLIPBOARD_HISTORY_LIMIT);
};

/**
 * A new list with the copy at the front. Copying the same cards again moves
 * the earlier entry to the front instead of listing them twice, and the list
 * never grows past the limit.
 */
export const addClipboardEntry = (
  history: readonly CardClipboardEntry[],
  entry: CardClipboardEntry
): CardClipboardEntry[] => {
  const same = JSON.stringify(entry.cards);
  return [
    entry,
    ...history.filter((item) => JSON.stringify(item.cards) !== same),
  ].slice(0, CARD_CLIPBOARD_HISTORY_LIMIT);
};

/** The cards without their own look, for pasting them in the style of the target. */
export const withoutCardStyle = (
  card: LovelaceCardConfig
): LovelaceCardConfig => {
  const next: LovelaceCardConfig = { ...card };
  styleKeys(card.type).forEach((key) => {
    delete next[key];
  });
  return next;
};

/** A short summary of an entry: the card type, or the number of cards. */
export const summarizeClipboardEntry = (
  entry: CardClipboardEntry
): { count: number; type: string } => ({
  count: entry.cards.length,
  type: entry.cards[0]?.type ?? "",
});

const store = (): Storage | undefined => {
  try {
    return window.localStorage;
  } catch (_err: unknown) {
    return undefined;
  }
};

export const readClipboardHistory = (): CardClipboardEntry[] =>
  parseClipboardHistory(store()?.getItem(CARD_CLIPBOARD_HISTORY_KEY) ?? "");

const CHANGE_EVENT = "card-clipboard-history-changed";

const writeClipboardHistory = (history: CardClipboardEntry[]): void => {
  try {
    store()?.setItem(CARD_CLIPBOARD_HISTORY_KEY, JSON.stringify(history));
  } catch (_err: unknown) {
    // Storage can be full or blocked; the copy still works in this tab.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

/** Adds one copy action to the history. */
export const pushClipboardHistory = (
  cards: LovelaceCardConfig[],
  source?: string
): void => {
  const valid = cards.filter(isCard);
  if (!valid.length) {
    return;
  }
  const now = Date.now();
  writeClipboardHistory(
    addClipboardEntry(readClipboardHistory(), {
      id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      time: now,
      cards: structuredClone(valid),
      ...(source ? { source } : {}),
    })
  );
};

export const clearClipboardHistory = (): void => writeClipboardHistory([]);

/**
 * Calls back whenever the history changes in this tab or in another one.
 * Returns the function that stops listening.
 */
export const subscribeClipboardHistory = (
  callback: (history: CardClipboardEntry[]) => void
): (() => void) => {
  const onStorage = (ev: StorageEvent) => {
    if (ev.key === null || ev.key === CARD_CLIPBOARD_HISTORY_KEY) {
      callback(readClipboardHistory());
    }
  };
  const onLocal = () => callback(readClipboardHistory());
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onLocal);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onLocal);
  };
};
