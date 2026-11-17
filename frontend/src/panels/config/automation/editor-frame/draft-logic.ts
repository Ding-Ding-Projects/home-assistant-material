/* eslint-disable no-bitwise -- a small hash needs integer arithmetic */
import { deepEqual } from "../../../../common/util/deep-equal";

/** How long after the last change a draft is saved. */
export const DRAFT_DELAY_MS = 2000;

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(",")}}`;
};

/** A short hash of a config that does not depend on the order of its keys. */
export const configHash = (config: unknown): string => {
  const text = stableStringify(config);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}-${text.length}`;
};

/** A time as 24-hour hours and minutes, in the local time zone. */
export const formatDraftTime = (iso: string | null | undefined): string => {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

export interface DraftOffer {
  /** Whether to offer the draft back at all. */
  offer: boolean;
  /** Whether the live item changed since the draft was started. */
  liveChanged: boolean;
}

/**
 * Decide whether a stored draft is worth offering back. A draft that equals
 * the live item holds nothing to recover, so it is not offered.
 */
export const decideDraftOffer = (
  draftConfig: unknown,
  draftBaseHash: string | null,
  liveConfig: unknown | undefined
): DraftOffer => {
  if (liveConfig !== undefined && deepEqual(draftConfig, liveConfig)) {
    return { offer: false, liveChanged: false };
  }
  const liveChanged =
    liveConfig !== undefined &&
    draftBaseHash !== null &&
    draftBaseHash !== configHash(liveConfig);
  return { offer: true, liveChanged };
};

/** An id for a new item that has no id of its own yet. */
export const newDraftId = (): string =>
  `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const isNewDraftId = (id: string): boolean => id.startsWith("new-");

const toLines = (value: unknown): string[] =>
  JSON.stringify(value, null, 2).split("\n");

/**
 * A small line diff between two configs in the format the diff view shows:
 * lines only in the draft start with "+", lines only in the live item with
 * "-", and a few unchanged lines around each change are kept for context.
 */
export const draftDiffText = (live: unknown, draft: unknown): string => {
  const a = toLines(live);
  const b = toLines(draft);
  const n = a.length;
  const m = b.length;
  const table: Uint32Array[] = Array.from(
    { length: n + 1 },
    () => new Uint32Array(m + 1)
  );
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] =
        a[i] === b[j]
          ? table[i + 1][j + 1] + 1
          : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const rows: { mark: " " | "+" | "-"; text: string }[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ mark: " ", text: a[i] });
      i++;
      j++;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      rows.push({ mark: "-", text: a[i++] });
    } else {
      rows.push({ mark: "+", text: b[j++] });
    }
  }
  while (i < n) {
    rows.push({ mark: "-", text: a[i++] });
  }
  while (j < m) {
    rows.push({ mark: "+", text: b[j++] });
  }
  const CONTEXT = 2;
  const keep = new Set<number>();
  rows.forEach((row, index) => {
    if (row.mark !== " ") {
      for (
        let k = Math.max(0, index - CONTEXT);
        k <= Math.min(rows.length - 1, index + CONTEXT);
        k++
      ) {
        keep.add(k);
      }
    }
  });
  const out: string[] = [];
  let previous = -1;
  rows.forEach((row, index) => {
    if (!keep.has(index)) {
      return;
    }
    if (previous !== -1 && index !== previous + 1) {
      out.push(" …");
    }
    out.push(`${row.mark}${row.text}`);
    previous = index;
  });
  return out.join("\n");
};
