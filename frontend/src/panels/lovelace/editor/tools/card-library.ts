import type {
  CardLibraryEntry,
  CardLibraryVersion,
} from "../../../../data/frontend";
import { stableStringify } from "./dashboard-diff";

/**
 * The user's own card library. A card is saved under a name; saving it again
 * under the same name adds a version, so an older one can be inserted or
 * brought back. Any text of the form [[name]] inside a saved card is an
 * input: it is asked for each time the card is inserted.
 */

export const LIBRARY_VERSION_LIMIT = 10;
export const LIBRARY_LIMIT = 100;

const INPUT = /\[\[\s*([A-Za-z][\w -]{0,39}?)\s*\]\]/g;

export const latestVersion = (entry: CardLibraryEntry): CardLibraryVersion =>
  entry.versions[entry.versions.length - 1];

/** Names of the inputs in a card, in order of first use. */
export const findInputs = (card: unknown): string[] => {
  const found = new Set<string>();
  const walk = (value: unknown) => {
    if (typeof value === "string") {
      for (const match of value.matchAll(INPUT)) {
        found.add(match[1]);
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk);
    } else if (value && typeof value === "object") {
      Object.values(value as Record<string, unknown>).forEach(walk);
    }
  };
  walk(card);
  return [...found];
};

/** A copy of the card with each [[name]] replaced by its value; names without a value stay as they are. */
export const applyInputs = (
  card: Record<string, unknown>,
  values: Record<string, string>
): Record<string, unknown> => {
  const walk = (value: unknown): unknown => {
    if (typeof value === "string") {
      return value.replace(INPUT, (whole, name: string) =>
        Object.prototype.hasOwnProperty.call(values, name)
          ? values[name]
          : whole
      );
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
  return walk(structuredClone(card)) as Record<string, unknown>;
};

/**
 * Saves a card under a name. The same name adds a version unless the card is
 * exactly the latest one. Returns the new library.
 */
export const saveToLibrary = (
  library: CardLibraryEntry[],
  name: string,
  card: Record<string, unknown>,
  at = Date.now()
): CardLibraryEntry[] => {
  const trimmed = name.trim();
  const version: CardLibraryVersion = { at, card: structuredClone(card) };
  const existing = library.find(
    (e) => e.name.toLowerCase() === trimmed.toLowerCase()
  );
  if (!existing) {
    return [
      {
        id: `${at.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
        name: trimmed,
        created: at,
        versions: [version],
      },
      ...library,
    ].slice(0, LIBRARY_LIMIT);
  }
  if (stableStringify(latestVersion(existing).card) === stableStringify(card)) {
    return library;
  }
  return library.map((e) =>
    e === existing
      ? {
          ...e,
          versions: [...e.versions, version].slice(-LIBRARY_VERSION_LIMIT),
        }
      : e
  );
};

/** Makes an older version the newest one, as a new version (nothing is lost). */
export const restoreVersion = (
  library: CardLibraryEntry[],
  id: string,
  versionAt: number,
  at = Date.now()
): CardLibraryEntry[] =>
  library.map((e) => {
    if (e.id !== id) {
      return e;
    }
    const source = e.versions.find((v) => v.at === versionAt);
    if (!source) {
      return e;
    }
    return {
      ...e,
      versions: [
        ...e.versions,
        { at, card: structuredClone(source.card) },
      ].slice(-LIBRARY_VERSION_LIMIT),
    };
  });

export const removeFromLibrary = (
  library: CardLibraryEntry[],
  id: string
): CardLibraryEntry[] => library.filter((e) => e.id !== id);

// ---- Sharing one card as a file ------------------------------------------------

export const CARD_FILE_FORMAT = "dashboard-card";
export const CARD_FILE_VERSION = 1;
/** Largest file accepted on import, in characters. */
export const CARD_FILE_MAX_CHARS = 200_000;
const CARD_FILE_MAX_DEPTH = 24;
const CARD_FILE_MAX_NODES = 5000;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export interface CardFile {
  format: typeof CARD_FILE_FORMAT;
  version: typeof CARD_FILE_VERSION;
  name: string;
  /** The inputs the card asks for when it is inserted, for the reader of the file. */
  inputs: string[];
  card: Record<string, unknown>;
}

/** The file for one saved card: its latest version, with the names of its inputs. */
export const buildCardFile = (
  entry: CardLibraryEntry,
  versionAt?: number
): { filename: string; text: string } => {
  const version =
    entry.versions.find((v) => v.at === versionAt) ?? latestVersion(entry);
  const file: CardFile = {
    format: CARD_FILE_FORMAT,
    version: CARD_FILE_VERSION,
    name: entry.name,
    inputs: findInputs(version.card),
    card: version.card,
  };
  const slug =
    entry.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "card";
  return {
    filename: `card-${slug}.json`,
    text: JSON.stringify(file, null, 2),
  };
};

export type ParsedCardFile =
  | { ok: true; name: string; card: Record<string, unknown>; inputs: string[] }
  | {
      ok: false;
      reason: "too_large" | "not_json" | "wrong_format" | "no_card" | "unsafe";
    };

/** True when the value is plain data that is small enough and holds no dangerous key. */
const isSafeData = (value: unknown): boolean => {
  let nodes = 0;
  const walk = (item: unknown, depth: number): boolean => {
    nodes++;
    if (nodes > CARD_FILE_MAX_NODES || depth > CARD_FILE_MAX_DEPTH) {
      return false;
    }
    if (Array.isArray(item)) {
      return item.every((child) => walk(child, depth + 1));
    }
    if (item && typeof item === "object") {
      return Object.entries(item as Record<string, unknown>).every(
        ([key, child]) => !FORBIDDEN_KEYS.has(key) && walk(child, depth + 1)
      );
    }
    return (
      item === null || ["string", "number", "boolean"].includes(typeof item)
    );
  };
  return walk(value, 0);
};

/**
 * Reads a card file. Nothing is trusted: the text is size limited, must be
 * JSON in the card file format, and the card must be plain data of a bounded
 * size with a card type.
 */
export const parseCardFile = (text: string): ParsedCardFile => {
  if (text.length > CARD_FILE_MAX_CHARS) {
    return { ok: false, reason: "too_large" };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (_err) {
    return { ok: false, reason: "not_json" };
  }
  const file = data as Partial<CardFile> | null;
  if (
    !file ||
    typeof file !== "object" ||
    file.format !== CARD_FILE_FORMAT ||
    file.version !== CARD_FILE_VERSION
  ) {
    return { ok: false, reason: "wrong_format" };
  }
  const { card, name } = file;
  if (
    !card ||
    typeof card !== "object" ||
    Array.isArray(card) ||
    typeof card.type !== "string" ||
    !card.type ||
    card.type.length > 100 ||
    typeof name !== "string" ||
    !name.trim()
  ) {
    return { ok: false, reason: "no_card" };
  }
  if (!isSafeData(card)) {
    return { ok: false, reason: "unsafe" };
  }
  return {
    ok: true,
    name: name.trim().slice(0, 100),
    card,
    inputs: findInputs(card),
  };
};
