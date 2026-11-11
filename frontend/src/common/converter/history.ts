/** What the page remembers of this session's conversions: memory only. */

export interface HistoryEntry {
  id: number;
  /** Name of the converted file. */
  name: string;
  /** Name of the input. */
  source: string;
  target: string;
  inputBytes: number;
  outputBytes: number;
  at: number;
  blob: Blob;
}

export const MAX_HISTORY_ENTRIES = 20;
export const MAX_HISTORY_BYTES = 100 * 1024 * 1024;

/** Newest first. The oldest go when there are too many, or too many bytes. */
export const addHistory = (
  list: readonly HistoryEntry[],
  entry: HistoryEntry,
  maxEntries = MAX_HISTORY_ENTRIES,
  maxBytes = MAX_HISTORY_BYTES
): HistoryEntry[] => {
  const next = [entry, ...list];
  let bytes = 0;
  const kept: HistoryEntry[] = [];
  for (const item of next) {
    bytes += item.outputBytes;
    // The newest entry is always kept, so a single large result is not lost.
    if (kept.length && (kept.length >= maxEntries || bytes > maxBytes)) {
      break;
    }
    kept.push(item);
  }
  return kept;
};
