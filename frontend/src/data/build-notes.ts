import type { PublicFetchResult } from "./public-json";
import { PUBLIC_UPDATES_ORIGIN, fetchPublicJson } from "./public-json";

/**
 * The notes of a build, read from the search file of the project's public
 * updates log (`data/search.json`). Only these fields of each version are
 * used: `b` (build), `core`, `h` (headline), `s` and `sy` (summary in English
 * and Cantonese) and `hl` (highlights, each with `t` title, `w` and `wy` what
 * it does in English and Cantonese). Everything else in the file is ignored.
 */

export interface NotesHighlight {
  title: string;
  what: string;
  whatYue?: string;
}

export interface BuildNotes {
  build: number;
  core: string;
  headline: string;
  summary: string;
  summaryYue?: string;
  highlights: NotesHighlight[];
}

/** How many highlights the card shows. */
export const NOTES_HIGHLIGHT_LIMIT = 4;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const optional = (value: unknown): string | undefined =>
  str(value) || undefined;

const parseHighlight = (value: unknown): NotesHighlight | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const title = str(value.t);
  if (!title) {
    return undefined;
  }
  return { title, what: str(value.w), whatYue: optional(value.wy) };
};

const parseVersion = (value: unknown): BuildNotes | undefined => {
  if (
    !isRecord(value) ||
    typeof value.b !== "number" ||
    !Number.isFinite(value.b)
  ) {
    return undefined;
  }
  const headline = str(value.h);
  if (!headline) {
    return undefined;
  }
  return {
    build: value.b,
    core: str(value.core),
    headline,
    summary: str(value.s),
    summaryYue: optional(value.sy),
    highlights: Array.isArray(value.hl)
      ? value.hl
          .map(parseHighlight)
          .filter((item): item is NotesHighlight => item !== undefined)
      : [],
  };
};

/**
 * Reads every version in the file, newest first. Entries that are malformed
 * are ignored; a file that is not in the expected form gives undefined.
 */
export const parseNotes = (json: unknown): BuildNotes[] | undefined => {
  if (!isRecord(json) || !Array.isArray(json.versions)) {
    return undefined;
  }
  return json.versions
    .map(parseVersion)
    .filter((item): item is BuildNotes => item !== undefined)
    .sort((a, b) => b.build - a.build);
};

export const findNotes = (
  notes: BuildNotes[],
  build: number | undefined
): BuildNotes | undefined =>
  build === undefined ? undefined : notes.find((item) => item.build === build);

/** The summary for a language mode, falling back to what exists. */
export const summaryForMode = (
  notes: BuildNotes,
  mode: "english" | "cantonese" | "bilingual"
): string[] => {
  const english = notes.summary;
  const cantonese = notes.summaryYue ?? english;
  if (mode === "cantonese") {
    return cantonese ? [cantonese] : [];
  }
  if (mode === "bilingual") {
    return [
      ...new Set([english, notes.summaryYue].filter((v): v is string => !!v)),
    ];
  }
  return english ? [english] : [];
};

/** The description of a highlight for a language mode. */
export const whatForMode = (
  highlight: NotesHighlight,
  mode: "english" | "cantonese" | "bilingual"
): string[] => {
  const english = highlight.what;
  const cantonese = highlight.whatYue ?? english;
  if (mode === "cantonese") {
    return cantonese ? [cantonese] : [];
  }
  if (mode === "bilingual") {
    return [
      ...new Set([english, highlight.whatYue].filter((v): v is string => !!v)),
    ];
  }
  return english ? [english] : [];
};

export const notesDataUrl = (): string =>
  `${PUBLIC_UPDATES_ORIGIN}/data/search.json`;

/** The public page with the full notes of one build. */
export const notesPageUrl = (build: number): string =>
  `${PUBLIC_UPDATES_ORIGIN}/releases/${Math.trunc(build)}/`;

/**
 * The public notes page for a system version such as `2026.11.1.509` or
 * `18.5.481`. The build number is the last part of the version. Returns
 * `undefined` when the version does not end in a build number.
 */
export const notesPageUrlForVersion = (
  version: string | null | undefined
): string | undefined => {
  const last = version?.trim().split(".").pop();
  if (!last || !/^\d+$/.test(last)) {
    return undefined;
  }
  const build = Number(last);
  return build > 0 ? notesPageUrl(build) : undefined;
};

/** How long the loaded file is reused before it is read again. */
export const NOTES_CACHE_MS = 300_000;

let cache: { at: number; notes: BuildNotes[] } | undefined;

/** Forgets the loaded file. Used by tests and by Retry. */
export const clearNotesCache = () => {
  cache = undefined;
};

export const fetchNotes = async (
  force: boolean,
  signal?: AbortSignal,
  now: number = Date.now()
): Promise<PublicFetchResult<BuildNotes[]>> => {
  if (!force && cache && now - cache.at < NOTES_CACHE_MS) {
    return { ok: true, data: cache.notes };
  }
  const result = await fetchPublicJson(notesDataUrl(), signal);
  if (!result.ok) {
    return result;
  }
  const notes = parseNotes(result.data);
  if (!notes) {
    return { ok: false, reason: "invalid" };
  }
  cache = { at: now, notes };
  return { ok: true, data: notes };
};
