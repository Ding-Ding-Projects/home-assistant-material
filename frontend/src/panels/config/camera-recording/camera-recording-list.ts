import { regexQuery, searchMatcher } from "../../../common/regex/filter";

/** The key that tells one camera of one recording place apart. */
export const cameraKey = (entryId: string, entityId: string): string =>
  `${entryId}|${entityId}`;

/** The texts a search is tested against for one camera. */
export interface CameraSearchFields {
  name: string;
  entityId: string;
  /** The state as the page words it, in the current language */
  state: string;
  /** The amount (all day, light, off) as the page words it */
  amount: string;
  /** The recording place's label */
  place: string;
}

export const cameraSearchValues = (fields: CameraSearchFields): string[] => [
  fields.name,
  fields.entityId,
  fields.state,
  fields.amount,
  fields.place,
];

/**
 * Keeps the cameras that match the search text. Plain text matches any of a
 * camera's texts ignoring case; `/pattern/flags` is tested as written; an
 * unusable pattern keeps every camera, so the page can say what is wrong
 * with it instead of showing an empty list. Empty text keeps every camera.
 */
export const filterCameras = <T>(
  cameras: readonly T[],
  query: string,
  fieldsOf: (camera: T) => CameraSearchFields
): T[] => {
  if (!query.trim() || regexQuery(query)?.error) {
    return [...cameras];
  }
  const matches = searchMatcher(query);
  return cameras.filter((camera) =>
    matches(...cameraSearchValues(fieldsOf(camera)))
  );
};

/** Opens a closed row or folds an open one; the list stays free of repeats. */
export const toggleExpanded = (
  expanded: readonly string[],
  key: string
): string[] =>
  expanded.includes(key)
    ? expanded.filter((item) => item !== key)
    : [...expanded, key];

/** Opens or folds every row in `keys`, leaving rows of hidden cameras as they were. */
export const setExpanded = (
  expanded: readonly string[],
  keys: readonly string[],
  open: boolean
): string[] => {
  const rest = expanded.filter((item) => !keys.includes(item));
  return open ? [...rest, ...keys] : rest;
};

/**
 * What was remembered, made safe to use: storage can hold anything (an old
 * format, a hand edit), so only a list of strings is taken.
 */
export const readExpanded = (stored: unknown): string[] =>
  Array.isArray(stored)
    ? [...new Set(stored.filter((item) => typeof item === "string"))]
    : [];
