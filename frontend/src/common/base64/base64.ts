/**
 * Base64, written out so that every choice is explicit: the alphabet,
 * padding, line length, and what happens to a character that does not
 * belong. Works on bytes, so files and text are treated the same.
 */

export type Base64Variant = "standard" | "url" | "mime";

export interface EncodeOptions {
  variant: Base64Variant;
  /** Ends the text with `=` so its length is a multiple of four. */
  padding: boolean;
  /** Characters on a line; 0 for one line. MIME always uses 76. */
  lineLength: 0 | 64 | 76;
}

const STANDARD =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const URL_SAFE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

const alphabetOf = (variant: Base64Variant): string =>
  variant === "url" ? URL_SAFE : STANDARD;

/**
 * Number of bytes per piece when a large input is encoded in pieces. It is
 * a multiple of 3, so no piece but the last is padded, and its text is a
 * whole number of lines at 64 and at 76 characters, so each piece can be
 * broken into lines by itself.
 */
export const CHUNK_BYTES = 912 * 864;

/** Encodes bytes without line breaks or padding decisions: the raw text. */
const encodeRaw = (bytes: Uint8Array, alphabet: string): string => {
  let out = "";
  let index = 0;
  for (; index + 2 < bytes.length; index += 3) {
    const value =
      bytes[index] * 65536 + bytes[index + 1] * 256 + bytes[index + 2];
    out +=
      alphabet[Math.floor(value / 262144) % 64] +
      alphabet[Math.floor(value / 4096) % 64] +
      alphabet[Math.floor(value / 64) % 64] +
      alphabet[value % 64];
  }
  const rest = bytes.length - index;
  if (rest === 1) {
    const value = bytes[index] * 16;
    out += alphabet[Math.floor(value / 64) % 64] + alphabet[value % 64];
  } else if (rest === 2) {
    const value = (bytes[index] * 256 + bytes[index + 1]) * 4;
    out +=
      alphabet[Math.floor(value / 4096) % 64] +
      alphabet[Math.floor(value / 64) % 64] +
      alphabet[value % 64];
  }
  return out;
};

/** Breaks text into lines of a length, joined the way the variant asks. */
export const wrapLines = (
  text: string,
  lineLength: number,
  variant: Base64Variant
): string => {
  const length = variant === "mime" ? 76 : lineLength;
  if (!length) {
    return text;
  }
  const lines: string[] = [];
  for (let index = 0; index < text.length; index += length) {
    lines.push(text.slice(index, index + length));
  }
  return lines.join(variant === "mime" ? "\r\n" : "\n");
};

export const encodeBase64 = (
  bytes: Uint8Array,
  options: EncodeOptions
): string => {
  let text = encodeRaw(bytes, alphabetOf(options.variant));
  // MIME is always padded; the others as chosen.
  if (options.padding || options.variant === "mime") {
    text += "=".repeat((4 - (text.length % 4)) % 4);
  }
  return wrapLines(text, options.lineLength, options.variant);
};

export type DecodeResult =
  | { ok: true; bytes: Uint8Array; skipped: number }
  | {
      ok: false;
      /** 1-based position of the character that stopped decoding. */
      position: number;
      character: string;
      reason: "alphabet" | "padding" | "length";
    };

/**
 * Decodes Base64 text. Line breaks and spaces are always allowed. Strict
 * decoding stops at the first character that is not in the alphabet, at
 * padding in the wrong place, and at a length that cannot be right.
 * Lenient decoding skips what does not belong and accepts either alphabet.
 */
export const decodeBase64 = (
  text: string,
  variant: Base64Variant,
  strict: boolean
): DecodeResult => {
  const alphabet = alphabetOf(variant);
  const values: number[] = [];
  let skipped = 0;
  let padding = 0;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (/\s/.test(character)) {
      continue;
    }
    if (character === "=") {
      padding++;
      continue;
    }
    let value = alphabet.indexOf(character);
    if (value === -1 && !strict) {
      // The other alphabet is read too: + and - mean 62, / and _ mean 63.
      value = (variant === "url" ? STANDARD : URL_SAFE).indexOf(character);
    }
    if (value === -1) {
      if (strict) {
        return {
          ok: false,
          position: index + 1,
          character,
          reason: "alphabet",
        };
      }
      skipped++;
      continue;
    }
    if (padding) {
      if (strict) {
        return { ok: false, position: index + 1, character, reason: "padding" };
      }
      padding = 0;
    }
    values.push(value);
  }
  const rest = values.length % 4;
  if (rest === 1) {
    if (strict) {
      return {
        ok: false,
        position: text.length,
        character: "",
        reason: "length",
      };
    }
    values.pop();
  }
  if (strict && padding && (padding > 2 || (values.length + padding) % 4)) {
    return {
      ok: false,
      position: text.length,
      character: "=",
      reason: "padding",
    };
  }
  const bytes = new Uint8Array(Math.floor((values.length * 3) / 4));
  let out = 0;
  for (let index = 0; index + 1 < values.length; index += 4) {
    const a = values[index];
    const b = values[index + 1];
    const c = values[index + 2];
    const d = values[index + 3];
    bytes[out++] = a * 4 + Math.floor(b / 16);
    if (c !== undefined) {
      bytes[out++] = (b % 16) * 16 + Math.floor(c / 4);
    }
    if (d !== undefined) {
      bytes[out++] = ((c ?? 0) % 4) * 64 + d;
    }
  }
  return { ok: true, bytes: bytes.subarray(0, out), skipped };
};

export const toDataUrl = (bytes: Uint8Array, mime: string): string =>
  `data:${mime || "application/octet-stream"};base64,${encodeBase64(bytes, {
    variant: "standard",
    padding: true,
    lineLength: 0,
  })}`;

/** Reads a data URL: its type and its bytes. Only the base64 form. */
export const fromDataUrl = (
  url: string
): { mime: string; result: DecodeResult } | undefined => {
  const match = /^data:([^;,]*)(?:;[^;,]+)*;base64,(.*)$/s.exec(url.trim());
  if (!match) {
    return undefined;
  }
  return {
    mime: match[1] || "text/plain",
    result: decodeBase64(match[2], "standard", true),
  };
};

export type TextEncoding = "utf-8" | "latin1";

export const textToBytes = (
  text: string,
  encoding: TextEncoding
): Uint8Array | undefined => {
  if (encoding === "utf-8") {
    return new TextEncoder().encode(text);
  }
  const bytes = new Uint8Array(text.length);
  for (let index = 0; index < text.length; index++) {
    const code = text.charCodeAt(index);
    if (code > 255) {
      // Not a character Latin-1 has.
      return undefined;
    }
    bytes[index] = code;
  }
  return bytes;
};

/** Bytes as text, or undefined when they are not text in that encoding. */
export const bytesToText = (
  bytes: Uint8Array,
  encoding: TextEncoding
): string | undefined => {
  if (encoding === "latin1") {
    let text = "";
    for (let index = 0; index < bytes.length; index += 8192) {
      text += String.fromCharCode(...bytes.subarray(index, index + 8192));
    }
    return text;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (_err) {
    return undefined;
  }
};

export const sameBytes = (a: Uint8Array, b: Uint8Array): boolean =>
  a.length === b.length && a.every((value, index) => value === b[index]);
