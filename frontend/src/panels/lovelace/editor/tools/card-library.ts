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
