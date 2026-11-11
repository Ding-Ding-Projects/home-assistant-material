import { decodeBase64, encodeBase64, fromDataUrl } from "../base64/base64";
import type { ConvertNote, ConvertResult } from "./types";
import { failure } from "./types";
import { decodeUtf8Strict } from "./utf8";

/**
 * Text encodings and small transforms: Base64, URL encoding, hex, line
 * endings and letter case. Each works on the bytes it is given, so a file and
 * pasted text are treated alike.
 */

export type TextTransform =
  | "base64"
  | "base64-decode"
  | "url-encode"
  | "url-decode"
  | "hex"
  | "hex-decode"
  | "lf"
  | "crlf"
  | "cr"
  | "upper"
  | "lower"
  | "title"
  | "camel"
  | "snake"
  | "kebab";

export interface TransformOptions {
  /** Base64 with - and _ and without padding. */
  urlSafe: boolean;
  /** Hex written as pairs with spaces, or as one run. */
  hexSpaced: boolean;
}

export const DEFAULT_TRANSFORM_OPTIONS: TransformOptions = {
  urlSafe: false,
  hexSpaced: true,
};

const text = (value: string, notes: ConvertNote[] = []): ConvertResult => ({
  ok: true,
  kind: "text",
  text: value,
  notes,
});

/** Decoded bytes are text when they are valid UTF-8, and a file otherwise. */
const bytesResult = (bytes: Uint8Array): ConvertResult => {
  const decoded = decodeUtf8Strict(bytes);
  return decoded.ok
    ? text(decoded.text)
    : {
        ok: true,
        kind: "bytes",
        bytes,
        mime: "application/octet-stream",
        notes: [{ code: "decoded_binary", count: bytes.length }],
      };
};

const readText = (
  bytes: Uint8Array
): { ok: true; text: string } | Extract<ConvertResult, { ok: false }> => {
  const decoded = decodeUtf8Strict(bytes);
  return decoded.ok
    ? { ok: true, text: decoded.text }
    : failure("invalid_utf8", { position: decoded.offset });
};

const base64Encode = (bytes: Uint8Array, options: TransformOptions) =>
  text(
    encodeBase64(bytes, {
      variant: options.urlSafe ? "url" : "standard",
      padding: !options.urlSafe,
      lineLength: 0,
    })
  );

const base64Decode = (bytes: Uint8Array): ConvertResult => {
  const read = readText(bytes);
  if (!read.ok) {
    return read;
  }
  const url = fromDataUrl(read.text);
  if (url) {
    return url.result.ok
      ? bytesResult(url.result.bytes)
      : failure(`base64_${url.result.reason}`, {
          position: url.result.position,
          character: url.result.character,
        });
  }
  const standard = decodeBase64(read.text, "standard", true);
  if (standard.ok) {
    return bytesResult(standard.bytes);
  }
  // A text written in the URL-safe alphabet is read too.
  const safe = decodeBase64(read.text, "url", true);
  if (safe.ok) {
    return bytesResult(safe.bytes);
  }
  return failure(`base64_${standard.reason}`, {
    position: standard.position,
    character: standard.character,
  });
};

const urlEncode = (input: string): ConvertResult => {
  try {
    return text(encodeURIComponent(input));
  } catch (_err) {
    return failure("lone_surrogate");
  }
};

const urlDecode = (input: string): ConvertResult => {
  const bad = /%(?![0-9A-Fa-f]{2})/.exec(input);
  if (bad) {
    return failure("url_bad_percent", { position: bad.index + 1 });
  }
  try {
    const notes: ConvertNote[] = input.includes("+")
      ? [{ code: "plus_kept" }]
      : [];
    return text(decodeURIComponent(input), notes);
  } catch (_err) {
    return failure("url_bad_utf8");
  }
};

const toHex = (bytes: Uint8Array, spaced: boolean): string => {
  const pairs: string[] = [];
  for (const byte of bytes) {
    pairs.push(byte.toString(16).padStart(2, "0"));
  }
  return pairs.join(spaced ? " " : "");
};

const hexDecode = (input: string): ConvertResult => {
  const digits: number[] = [];
  let lastIndex = 0;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (/[\s,]/.test(char)) {
      continue;
    }
    if (
      char === "0" &&
      (input[index + 1] === "x" || input[index + 1] === "X") &&
      digits.length % 2 === 0
    ) {
      index++;
      continue;
    }
    const value = parseInt(char, 16);
    if (Number.isNaN(value)) {
      return failure("hex_character", {
        position: index + 1,
        character: char,
      });
    }
    digits.push(value);
    lastIndex = index;
  }
  if (digits.length % 2 === 1) {
    return failure("hex_length", { position: lastIndex + 1 });
  }
  const bytes = new Uint8Array(digits.length / 2);
  for (let at = 0; at < bytes.length; at++) {
    bytes[at] = digits[at * 2] * 16 + digits[at * 2 + 1];
  }
  return bytesResult(bytes);
};

/** The endings a text uses, and how many lines end each way. */
export const countLineEndings = (
  input: string
): { crlf: number; lf: number; cr: number } => {
  const crlf = (input.match(/\r\n/g) ?? []).length;
  const lf = (input.match(/\n/g) ?? []).length - crlf;
  const cr = (input.match(/\r/g) ?? []).length - crlf;
  return { crlf, lf, cr };
};

const lineEndings = (input: string, ending: string): ConvertResult => {
  const counts = countLineEndings(input);
  const kinds = [counts.crlf, counts.lf, counts.cr].filter(Boolean).length;
  return text(
    input.replace(/\r\n|\r|\n/g, ending),
    kinds > 1 ? [{ code: "mixed_endings" }] : []
  );
};

/** Words in a text: runs of letters and digits, split also at humps. */
const wordsOf = (line: string): string[] =>
  line
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, "$1 $2")
    .replace(/(\p{Lu})(\p{Lu}\p{Ll})/gu, "$1 $2")
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const capital = (word: string): string =>
  word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();

const changeCase = (input: string, kind: TextTransform): string => {
  switch (kind) {
    case "upper":
      return input.toUpperCase();
    case "lower":
      return input.toLowerCase();
    case "title":
      return input.replace(/[\p{L}\p{N}']+/gu, (word) => capital(word));
    default:
      return input
        .split(/(\r\n|\r|\n)/)
        .map((line) => {
          if (/^(\r\n|\r|\n)$/.test(line)) {
            return line;
          }
          const words = wordsOf(line).map((word) => word.toLowerCase());
          if (kind === "snake") {
            return words.join("_");
          }
          if (kind === "kebab") {
            return words.join("-");
          }
          return words
            .map((word, index) => (index ? capital(word) : word))
            .join("");
        })
        .join("");
  }
};

export const transformBytes = (
  kind: TextTransform,
  bytes: Uint8Array,
  options: TransformOptions = DEFAULT_TRANSFORM_OPTIONS
): ConvertResult => {
  if (kind === "base64") {
    return base64Encode(bytes, options);
  }
  if (kind === "hex") {
    return text(toHex(bytes, options.hexSpaced));
  }
  const read = readText(bytes);
  if (!read.ok) {
    return read;
  }
  switch (kind) {
    case "base64-decode":
      return base64Decode(bytes);
    case "url-encode":
      return urlEncode(read.text);
    case "url-decode":
      return urlDecode(read.text);
    case "hex-decode":
      return hexDecode(read.text);
    case "lf":
      return lineEndings(read.text, "\n");
    case "crlf":
      return lineEndings(read.text, "\r\n");
    case "cr":
      return lineEndings(read.text, "\r");
    default:
      return text(changeCase(read.text, kind));
  }
};
