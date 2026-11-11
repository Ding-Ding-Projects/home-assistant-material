/**
 * Shared shapes for the file converter. Every failure and every remark is a
 * short code with numbers, never a sentence, so the page can write it in the
 * viewer's language.
 */

/** Largest file or text that is converted: 20 MB. */
export const MAX_BYTES = 20 * 1024 * 1024;

/** Largest text a conversion may write, in characters. */
export const MAX_OUTPUT_CHARACTERS = 80_000_000;

/** Deepest nesting that is read. Deeper data is refused, not truncated. */
export const MAX_DEPTH = 256;

/** Most values a document may hold once aliases are written out in full. */
export const MAX_NODES = 2_000_000;

export interface ConvertError {
  code: string;
  /** 1-based line, when the problem has a place in the text. */
  line?: number;
  /** 1-based column, when the problem has a place in the text. */
  column?: number;
  /** 1-based character or byte position. */
  position?: number;
  /** The character that stopped the conversion. */
  character?: string;
  /** Row number of a table. */
  row?: number;
  /** What the underlying reader said, in its own words. */
  detail?: string;
}

/** Something the conversion could not keep, or did differently. */
export interface ConvertNote {
  code: string;
  count?: number;
}

export type ConvertResult =
  | {
      ok: true;
      kind: "text";
      text: string;
      notes: ConvertNote[];
    }
  | {
      ok: true;
      kind: "bytes";
      bytes: Uint8Array;
      mime: string;
      notes: ConvertNote[];
    }
  | { ok: false; error: ConvertError };

export const failure = (
  code: string,
  extra: Omit<ConvertError, "code"> = {}
): { ok: false; error: ConvertError } => ({
  ok: false,
  error: { code, ...extra },
});

/** Notes with the same code are merged, and the counts added. */
export const mergeNotes = (notes: ConvertNote[]): ConvertNote[] => {
  const merged = new Map<string, ConvertNote>();
  for (const note of notes) {
    const found = merged.get(note.code);
    if (found) {
      if (note.count !== undefined) {
        found.count = (found.count ?? 0) + note.count;
      }
    } else {
      merged.set(note.code, { ...note });
    }
  }
  return [...merged.values()];
};

/** Line and column, both counted from 1, of a position in a text. */
export const locate = (
  text: string,
  index: number
): { line: number; column: number } => {
  let line = 1;
  let lineStart = 0;
  const end = Math.min(index, text.length);
  for (let at = 0; at < end; at++) {
    if (text.charCodeAt(at) === 10) {
      line++;
      lineStart = at + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
};

/** Most files that may be chosen together to be packed or turned into a PDF. */
export const MAX_SET_FILES = 200;

/** Most bytes the files of such a set may add up to. */
export const MAX_SET_BYTES = 100 * 1024 * 1024;
