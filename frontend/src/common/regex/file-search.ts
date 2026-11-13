/**
 * Searching files with a pattern: the files the person picks on this device
 * are read as text in the chosen encoding, cut into lines with the chosen
 * line break, and every line is tested. Nothing is sent anywhere.
 *
 * The cutting and the limits live here, away from the page, so they can be
 * tested. The matching itself runs in the pattern worker like every other
 * evaluation, under its time limit.
 */

export type FileEncoding =
  "auto" | "utf-8" | "utf-16le" | "utf-16be" | "windows-1252";

export const FILE_ENCODINGS: FileEncoding[] = [
  "auto",
  "utf-8",
  "utf-16le",
  "utf-16be",
  "windows-1252",
];

export type LineBreak = "auto" | "lf" | "crlf" | "cr";

export const LINE_BREAKS: LineBreak[] = ["auto", "lf", "crlf", "cr"];

export const FILE_SEARCH_LIMITS = {
  /** Most files read at once. */
  files: 20,
  /** Largest file read, in bytes. */
  bytes: 2 * 1024 * 1024,
  /** Most lines tested in all. */
  lines: 50000,
  /** Longer lines are cut to this many characters before testing. */
  lineLength: 2000,
} as const;

/** What the first bytes of a file say about its encoding, if anything. */
export const encodingFromBom = (
  bytes: Uint8Array
): Exclude<FileEncoding, "auto" | "windows-1252"> | undefined => {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return "utf-8";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xfe) {
    return "utf-16le";
  }
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    return "utf-16be";
  }
  return undefined;
};

/**
 * Reads bytes as text. `auto` follows a byte order mark when there is one and
 * is UTF-8 otherwise. Bytes that are not valid in the encoding become the
 * replacement character, and `invalid` says so, so a wrong choice shows.
 */
export const decodeBytes = (
  bytes: Uint8Array,
  encoding: FileEncoding
): {
  text: string;
  encoding: Exclude<FileEncoding, "auto">;
  invalid: boolean;
} => {
  const chosen: Exclude<FileEncoding, "auto"> =
    encoding === "auto" ? (encodingFromBom(bytes) ?? "utf-8") : encoding;
  // The decoder drops a byte order mark that matches the encoding.
  const text = new TextDecoder(chosen, { fatal: false }).decode(bytes);
  return { text, encoding: chosen, invalid: text.includes("�") };
};

/** The line break a text uses most, or undefined when it has no line break. */
export const detectLineBreak = (
  text: string
): Exclude<LineBreak, "auto"> | undefined => {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/(?<!\r)\n/g) ?? []).length;
  const cr = (text.match(/\r(?!\n)/g) ?? []).length;
  if (!crlf && !lf && !cr) {
    return undefined;
  }
  if (crlf >= lf && crlf >= cr) {
    return "crlf";
  }
  return lf >= cr ? "lf" : "cr";
};

const SEPARATORS: Record<Exclude<LineBreak, "auto">, string> = {
  lf: "\n",
  crlf: "\r\n",
  cr: "\r",
};

/**
 * Cuts a text into lines. With `auto` every kind of line break ends a line.
 * With a chosen one only that ends a line, so a file that really uses another
 * keeps its stray characters at the end of its lines, as a tool set to that
 * line break would see it. A final line break does not make an empty last line.
 */
export const splitLines = (text: string, lineBreak: LineBreak): string[] => {
  const lines =
    lineBreak === "auto"
      ? text.split(/\r\n|\n|\r/)
      : text.split(SEPARATORS[lineBreak]);
  if (lines.length > 1 && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
};

export interface FileInput {
  name: string;
  bytes: Uint8Array;
}

export interface FileLine {
  file: string;
  /** Counted from 1. */
  line: number;
  text: string;
}

export interface FileSkip {
  name: string;
  reason: "too_big" | "too_many_files" | "binary";
}

export interface CollectedLines {
  lines: FileLine[];
  skipped: FileSkip[];
  /** Files read with bytes that do not fit the encoding. */
  invalid: string[];
  /** True when the line limit stopped the reading, or lines were cut. */
  truncated: boolean;
}

/** Reads the files into lines, inside the limits. */
export const collectLines = (
  files: FileInput[],
  encoding: FileEncoding,
  lineBreak: LineBreak
): CollectedLines => {
  const lines: FileLine[] = [];
  const skipped: FileSkip[] = [];
  const invalid: string[] = [];
  let truncated = false;
  files.forEach((file, index) => {
    if (index >= FILE_SEARCH_LIMITS.files) {
      skipped.push({ name: file.name, reason: "too_many_files" });
      return;
    }
    if (file.bytes.length > FILE_SEARCH_LIMITS.bytes) {
      skipped.push({ name: file.name, reason: "too_big" });
      return;
    }
    // A zero byte is not text in a single-byte or UTF-8 file.
    if (
      encoding !== "utf-16le" &&
      encoding !== "utf-16be" &&
      !encodingFromBom(file.bytes)?.startsWith("utf-16") &&
      file.bytes.includes(0)
    ) {
      skipped.push({ name: file.name, reason: "binary" });
      return;
    }
    const decoded = decodeBytes(file.bytes, encoding);
    if (decoded.invalid) {
      invalid.push(file.name);
    }
    splitLines(decoded.text, lineBreak).forEach((text, position) => {
      if (lines.length >= FILE_SEARCH_LIMITS.lines) {
        truncated = true;
        return;
      }
      if (text.length > FILE_SEARCH_LIMITS.lineLength) {
        truncated = true;
      }
      lines.push({
        file: file.name,
        line: position + 1,
        text: text.slice(0, FILE_SEARCH_LIMITS.lineLength),
      });
    });
  });
  return { lines, skipped, invalid, truncated };
};
