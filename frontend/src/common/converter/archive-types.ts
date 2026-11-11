import type { ConvertError, ConvertNote } from "./types";

/** One file or folder inside an archive. */
export interface ArchiveEntry {
  /** Forward slashes, never absolute, never climbing. A folder ends in `/`. */
  path: string;
  data: Uint8Array;
  dir: boolean;
  /** Milliseconds since 1970, or 0 when the archive does not say. */
  modified: number;
}

export type ArchiveReadResult =
  | { ok: true; entries: ArchiveEntry[]; notes: ConvertNote[] }
  | { ok: false; error: ConvertError };

/** Most entries an archive may hold. */
export const MAX_ENTRIES = 5000;

/** Most bytes all the files of an archive may add up to once opened. */
export const MAX_UNPACKED = 100 * 1024 * 1024;

/** Largest ratio of unpacked to packed size accepted past one megabyte. */
export const MAX_RATIO = 200;

/** Below this size the ratio is not checked: small files compress to nothing. */
export const RATIO_FLOOR = 1024 * 1024;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/**
 * Characters that make a name lie about itself: C1 controls, zero-width and
 * direction marks, the direction overrides and isolates, and the byte order
 * mark. `evil<override>gpj.exe` is shown as `evilexe.jpg`.
 */
export const DECEIVING_CHARACTERS =
  /[\u0080-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/;

/**
 * The path made safe to show and to save under, or undefined when it must be
 * refused: absolute paths, drive letters, paths that climb out with `..`,
 * and names with control characters.
 */
export const safeArchivePath = (raw: string): string | undefined => {
  if (CONTROL.test(raw) || DECEIVING_CHARACTERS.test(raw)) {
    return undefined;
  }
  const slashed = raw.replace(/\\/g, "/");
  if (slashed.startsWith("/") || /^[A-Za-z]:/.test(slashed)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const part of slashed.split("/")) {
    if (part === "..") {
      return undefined;
    }
    if (part !== "" && part !== ".") {
      parts.push(part);
    }
  }
  if (!parts.length) {
    return undefined;
  }
  return parts.join("/") + (slashed.endsWith("/") ? "/" : "");
};

/** The last part of a path, safe to use as a download name. */
export const baseName = (path: string): string => {
  const trimmed = path.replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || "file";
};

export const utf8Name = (bytes: Uint8Array, utf8Flag = true): string => {
  if (utf8Flag) {
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch (_err) {
      // Falls through: an old archive with names in a legacy code page.
    }
  }
  let out = "";
  for (const byte of bytes) {
    out += String.fromCharCode(byte);
  }
  return out;
};
