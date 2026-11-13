import type { Connection } from "home-assistant-js-websocket";
import { fetchFrontendSystemData, saveFrontendSystemData } from "./frontend";

/**
 * Free-form notes on devices and entities: where something is mounted, when a
 * battery was changed, a link to a manual. The registries have no field for
 * this, so the notes live in the instance's shared frontend settings, keyed by
 * device id and entity id. Everyone can read them; changing them needs an
 * administrator, like the registries themselves.
 */

export const MAX_NOTE_LENGTH = 4000;

export type RegistryNoteKind = "devices" | "entities";

export interface RegistryNote {
  text: string;
  /** Milliseconds since the epoch when the note was last saved. */
  updated: number;
}

export interface RegistryNotes {
  devices: Record<string, RegistryNote>;
  entities: Record<string, RegistryNote>;
}

declare global {
  interface FrontendSystemData {
    registry_notes: Partial<RegistryNotes>;
  }
}

const normalizeGroup = (raw: unknown): Record<string, RegistryNote> => {
  const result: Record<string, RegistryNote> = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const note = value as Partial<RegistryNote> | undefined;
    if (
      note &&
      typeof note === "object" &&
      typeof note.text === "string" &&
      note.text.trim() !== ""
    ) {
      result[id] = {
        text: note.text.slice(0, MAX_NOTE_LENGTH),
        updated: typeof note.updated === "number" ? note.updated : 0,
      };
    }
  }
  return result;
};

/** The stored notes without anything malformed; never throws. */
export const normalizeRegistryNotes = (raw: unknown): RegistryNotes => {
  const data = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  return {
    devices: normalizeGroup(data.devices),
    entities: normalizeGroup(data.entities),
  };
};

/** The notes with one note set, or removed when the text is empty. */
export const withNote = (
  notes: RegistryNotes,
  kind: RegistryNoteKind,
  id: string,
  text: string,
  now = Date.now()
): RegistryNotes => {
  const group = { ...notes[kind] };
  const trimmed = text.slice(0, MAX_NOTE_LENGTH);
  if (trimmed.trim() === "") {
    delete group[id];
  } else {
    group[id] = { text: trimmed, updated: now };
  }
  return { ...notes, [kind]: group };
};

/** Whether a note contains the search text, ignoring case. */
export const noteMatches = (
  text: string | undefined,
  query: string
): boolean => {
  const needle = query.trim().toLowerCase();
  return !!text && needle !== "" && text.toLowerCase().includes(needle);
};

export type NoteSegment =
  | { type: "text"; text: string }
  /** An address inside this instance: safe to open from the note. */
  | { type: "inside"; text: string; href: string }
  /** An address elsewhere: shown as text with a Copy button, never opened. */
  | { type: "outside"; text: string };

const ADDRESS = /https?:\/\/[^\s<>"']+|\/[A-Za-z0-9_\-./?=&#%]+/g;
const TRAILING_PUNCTUATION = /[.,;:!?)\]]+$/;

/**
 * Splits a note into plain text and addresses. A full address on the
 * instance's own origin, or a path starting with "/", is "inside"; every other
 * address is "outside". The origin is passed in so this stays pure.
 */
export const splitNoteAddresses = (
  text: string,
  instanceOrigin: string
): NoteSegment[] => {
  const segments: NoteSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(ADDRESS)) {
    const index = match.index ?? 0;
    let address = match[0];
    // A path only counts when it starts a word: "a/b" is plain text.
    if (address.startsWith("/") && index > 0 && !/\s/.test(text[index - 1])) {
      continue;
    }
    const trailing = address.match(TRAILING_PUNCTUATION)?.[0] ?? "";
    if (trailing) {
      address = address.slice(0, address.length - trailing.length);
    }
    if (!address) {
      continue;
    }
    if (index > last) {
      segments.push({ type: "text", text: text.slice(last, index) });
    }
    if (address.startsWith("/")) {
      segments.push({ type: "inside", text: address, href: address });
    } else {
      let origin: string | undefined;
      try {
        origin = new URL(address).origin;
      } catch (_err) {
        origin = undefined;
      }
      segments.push(
        origin !== undefined && origin === instanceOrigin
          ? { type: "inside", text: address, href: address }
          : { type: "outside", text: address }
      );
    }
    last = index + address.length;
  }
  if (last < text.length) {
    segments.push({ type: "text", text: text.slice(last) });
  }
  return segments;
};

export const fetchRegistryNotes = async (
  conn: Connection
): Promise<RegistryNotes> =>
  normalizeRegistryNotes(await fetchFrontendSystemData(conn, "registry_notes"));

/**
 * Saves one note. The stored notes are read again first, so a note someone
 * else saved a moment ago on another device is kept.
 */
export const saveRegistryNote = async (
  conn: Connection,
  kind: RegistryNoteKind,
  id: string,
  text: string
): Promise<RegistryNotes> => {
  const current = await fetchRegistryNotes(conn);
  const next = withNote(current, kind, id, text);
  await saveFrontendSystemData(conn, "registry_notes", next);
  return next;
};
