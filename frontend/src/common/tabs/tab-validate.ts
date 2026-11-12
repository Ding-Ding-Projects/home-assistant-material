/**
 * Shared checks for everything the tab model reads from storage.
 *
 * Stored tab data can come from the instance through the settings sync, so it
 * is treated as untrusted: lengths are bounded, shapes are checked, unknown
 * fields are dropped and keys that could change an object's prototype are
 * refused.
 */

/** Longest tab, group or surface identifier kept, in characters. */
export const ID_LIMIT = 200;

/** Longest group name kept, in characters. */
export const NAME_LIMIT = 60;

/** Most identifiers kept in one stored list. */
export const LIST_LIMIT = 1000;

/** Most surfaces (separate tab strips) kept in one stored map. */
export const SURFACE_LIMIT = 50;

/** The strip every existing tab belongs to. */
export const DEFAULT_SURFACE = "main";

const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const isPlainObject = (value: unknown): value is Record<string, any> =>
  !!value &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/** True for a key that is safe to use on a plain object. */
export const isSafeKey = (key: unknown): key is string =>
  typeof key === "string" &&
  key.length > 0 &&
  key.length <= ID_LIMIT &&
  !UNSAFE_KEYS.has(key);

/** Own entries of an untrusted object, without unsafe keys. */
export const safeEntries = (value: unknown): [string, unknown][] =>
  isPlainObject(value)
    ? Object.keys(value)
        .filter(isSafeKey)
        .map((key) => [key, (value as Record<string, unknown>)[key]])
    : [];

/** A list of identifiers: strings only, bounded, without repeats. */
export const cleanIds = (raw: unknown, limit = LIST_LIMIT): string[] => {
  if (!Array.isArray(raw)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (isSafeKey(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
      if (result.length >= limit) {
        break;
      }
    }
  }
  return result;
};

/** A surface name; anything unusable becomes the default surface. */
export const cleanSurface = (surface: unknown): string =>
  isSafeKey(surface) && surface.length <= 80 ? surface : DEFAULT_SURFACE;

/** Tidies a name: whitespace collapsed, bounded; undefined when empty. */
export const cleanName = (raw: unknown): string | undefined => {
  if (typeof raw !== "string") {
    return undefined;
  }
  const text = Array.from(raw, (char) => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127 ? " " : char;
  })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, NAME_LIMIT);
  return text || undefined;
};

/** The own, safe entries of a map of surface name to value, bounded. */
export const surfaceEntries = (raw: unknown): [string, unknown][] =>
  safeEntries(raw)
    .filter(([key]) => key.length <= 80)
    .slice(0, SURFACE_LIMIT);

/** Moves an id to a position in a list; unchanged when the id is absent. */
export const moveId = (
  ids: readonly string[],
  id: string,
  index: number
): string[] => {
  if (!ids.includes(id)) {
    return [...ids];
  }
  const rest = ids.filter((item) => item !== id);
  rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
  return rest;
};
