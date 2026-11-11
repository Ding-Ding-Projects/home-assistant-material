/**
 * Local drafts for editors, kept in browser storage on this device only.
 *
 * One entry per editor kind and item id holds the working text, the time it
 * was saved and the version of the saved item it was based on. Every storage
 * access is guarded: storage can be missing, blocked or full, and none of that
 * may ever break an editor. A draft is never written automatically back into
 * an editor; the caller offers it and the person decides.
 */

import { maskYamlSecrets } from "../secret-fields";

/** Prefix of every storage key written by this module. */
export const DRAFT_KEY_PREFIX = "ha-draft:";

/** A draft whose text is larger than this many bytes (UTF-8) is not stored. */
export const DRAFT_MAX_BYTES = 200 * 1024;

/** A draft older than 30 days is deleted when it is looked up or listed. */
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export interface DraftKindOptions {
  /**
   * True when the editor of this kind has a field that can hold a private
   * value (a password, a token, a key). Nothing is ever stored for such a kind.
   */
  secretField: boolean;
}

// Kinds must be registered before a draft is stored for them, so a typo in a
// kind name can never silently store text for an editor nobody reviewed.
const KINDS = new Map<string, DraftKindOptions>([
  // The template tool edits one free-form template and has no secret field.
  ["template", { secretField: false }],
]);

/** Declares an editor kind. Re-declaring a kind replaces its options. */
export const registerDraftKind = (
  kind: string,
  options: DraftKindOptions
): void => {
  KINDS.set(kind, options);
};

export interface DraftRecord {
  content: string;
  /** Milliseconds since the epoch when the draft was written. */
  savedAt: number;
  /** Version of the saved item the draft was started from, if the editor has one. */
  baseVersion: string | null;
}

export interface DraftLookup extends DraftRecord {
  /** True when the saved item has changed since the draft was started. */
  baseMismatch: boolean;
}

export interface DraftSummary extends DraftRecord {
  kind: string;
  itemId: string;
  /** Size of the stored text in bytes (UTF-8). */
  size: number;
}

export type DraftSaveResult =
  "saved" | "unknown_kind" | "secret" | "too_large" | "unavailable";

const getStorage = (): Storage | undefined => {
  try {
    return window.localStorage ?? undefined;
  } catch (_err) {
    return undefined;
  }
};

const keyFor = (kind: string, itemId: string): string =>
  `${DRAFT_KEY_PREFIX}${encodeURIComponent(kind)}:${encodeURIComponent(itemId)}`;

const parseKey = (
  key: string
): { kind: string; itemId: string } | undefined => {
  if (!key.startsWith(DRAFT_KEY_PREFIX)) {
    return undefined;
  }
  const rest = key.slice(DRAFT_KEY_PREFIX.length);
  const split = rest.indexOf(":");
  if (split < 0) {
    return undefined;
  }
  try {
    return {
      kind: decodeURIComponent(rest.slice(0, split)),
      itemId: decodeURIComponent(rest.slice(split + 1)),
    };
  } catch (_err) {
    return undefined;
  }
};

/** Size of a text in bytes when written as UTF-8. */
export const utf8Size = (text: string): number => {
  let bytes = 0;
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      // A surrogate pair is one four-byte character.
      bytes += 4;
      index++;
    } else {
      bytes += 3;
    }
  }
  return bytes;
};

/** Short stable fingerprint of a text, used as a base version. */
export const hashDraftText = (text: string): string => {
  let hash = 5381;
  for (let index = 0; index < text.length; index++) {
    // Stays below 2^53: the modulus keeps the hash under 2^32 and 33 * 2^32 fits.
    hash = (hash * 33 + text.charCodeAt(index)) % 4294967296;
  }
  return `${hash.toString(16)}-${text.length}`;
};

const isRecord = (value: unknown): value is DraftRecord => {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.content === "string" &&
    typeof record.savedAt === "number" &&
    Number.isFinite(record.savedAt) &&
    (record.baseVersion === null || typeof record.baseVersion === "string")
  );
};

const removeKey = (storage: Storage, key: string): void => {
  try {
    storage.removeItem(key);
  } catch (_err) {
    // Nothing more can be done; the entry stays until the next lookup.
  }
};

const readRecord = (
  storage: Storage,
  key: string,
  now: number
): DraftRecord | undefined => {
  let raw: string | null;
  try {
    raw = storage.getItem(key);
  } catch (_err) {
    return undefined;
  }
  if (raw === null) {
    return undefined;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (_err) {
    removeKey(storage, key);
    return undefined;
  }
  if (!isRecord(parsed)) {
    removeKey(storage, key);
    return undefined;
  }
  if (now - parsed.savedAt > DRAFT_MAX_AGE_MS) {
    removeKey(storage, key);
    return undefined;
  }
  return parsed;
};

/**
 * Stores a draft. Returns why nothing was stored when it was refused. A
 * refusal never throws and never leaves a half-written entry behind.
 */
export const saveDraft = (
  kind: string,
  itemId: string,
  content: string,
  baseVersion: string | null,
  now: number = Date.now()
): DraftSaveResult => {
  const options = KINDS.get(kind);
  if (!options) {
    return "unknown_kind";
  }
  if (options.secretField) {
    return "secret";
  }
  // The size check is one cheap pass, so it runs before the secret scan: a
  // very large paste must not cost two full scans on every save.
  if (content.length > DRAFT_MAX_BYTES || utf8Size(content) > DRAFT_MAX_BYTES) {
    return "too_large";
  }
  // A text that changes when its secret keys are masked holds a private value.
  if (maskYamlSecrets(content, "") !== maskYamlSecrets(content, "x")) {
    return "secret";
  }
  const storage = getStorage();
  if (!storage) {
    return "unavailable";
  }
  const record: DraftRecord = { content, savedAt: now, baseVersion };
  try {
    storage.setItem(keyFor(kind, itemId), JSON.stringify(record));
  } catch (_err) {
    return "unavailable";
  }
  return "saved";
};

/**
 * Looks up the draft of one item. An expired or unreadable entry is deleted
 * and reported as missing. `currentBaseVersion` is the version of the saved
 * item now open; when it differs from the draft's, `baseMismatch` is true.
 */
export const getDraft = (
  kind: string,
  itemId: string,
  currentBaseVersion: string | null = null,
  now: number = Date.now()
): DraftLookup | undefined => {
  const storage = getStorage();
  if (!storage) {
    return undefined;
  }
  const record = readRecord(storage, keyFor(kind, itemId), now);
  if (!record) {
    return undefined;
  }
  return {
    ...record,
    baseMismatch: record.baseVersion !== currentBaseVersion,
  };
};

/** Deletes the draft of one item. Safe to call when there is none. */
export const discardDraft = (kind: string, itemId: string): void => {
  const storage = getStorage();
  if (storage) {
    removeKey(storage, keyFor(kind, itemId));
  }
};

/** Every readable draft, newest first. Expired and unreadable ones are deleted. */
export const listDrafts = (now: number = Date.now()): DraftSummary[] => {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  const keys: string[] = [];
  try {
    for (let index = 0; index < storage.length; index++) {
      const key = storage.key(index);
      if (key?.startsWith(DRAFT_KEY_PREFIX)) {
        keys.push(key);
      }
    }
  } catch (_err) {
    return [];
  }
  const summaries: DraftSummary[] = [];
  for (const key of keys) {
    const parsed = parseKey(key);
    if (!parsed) {
      removeKey(storage, key);
      continue;
    }
    const record = readRecord(storage, key, now);
    if (record) {
      summaries.push({
        ...parsed,
        ...record,
        size: utf8Size(record.content),
      });
    }
  }
  return summaries.sort((a, b) => b.savedAt - a.savedAt);
};
