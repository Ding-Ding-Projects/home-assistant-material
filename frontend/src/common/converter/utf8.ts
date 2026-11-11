/**
 * Strict UTF-8 reading. The platform decoder says only that a text is not
 * valid; this says where, so the page can point at the byte.
 */

export type Utf8Result =
  | { ok: true; text: string; bom: boolean }
  | {
      ok: false;
      /** 1-based position of the first byte that is not valid UTF-8. */
      offset: number;
    };

const inRange = (value: number | undefined, low: number, high: number) =>
  value !== undefined && value >= low && value <= high;

/** Offset (0-based) of the first byte that cannot be UTF-8, or -1. */
export const firstInvalidUtf8 = (bytes: Uint8Array): number => {
  let index = 0;
  while (index < bytes.length) {
    const byte = bytes[index];
    if (byte < 0x80) {
      index++;
      continue;
    }
    let tail: number;
    let low = 0x80;
    let high = 0xbf;
    if (byte >= 0xc2 && byte <= 0xdf) {
      tail = 1;
    } else if (byte >= 0xe0 && byte <= 0xef) {
      tail = 2;
      if (byte === 0xe0) {
        low = 0xa0;
      } else if (byte === 0xed) {
        // Surrogates are not characters.
        high = 0x9f;
      }
    } else if (byte >= 0xf0 && byte <= 0xf4) {
      tail = 3;
      if (byte === 0xf0) {
        low = 0x90;
      } else if (byte === 0xf4) {
        high = 0x8f;
      }
    } else {
      return index;
    }
    if (!inRange(bytes[index + 1], low, high)) {
      return index;
    }
    for (let extra = 2; extra <= tail; extra++) {
      if (!inRange(bytes[index + extra], 0x80, 0xbf)) {
        return index;
      }
    }
    index += tail + 1;
  }
  return -1;
};

export const decodeUtf8Strict = (bytes: Uint8Array): Utf8Result => {
  const bad = firstInvalidUtf8(bytes);
  if (bad !== -1) {
    return { ok: false, offset: bad + 1 };
  }
  const bom = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
  const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(
    bom ? bytes.subarray(3) : bytes
  );
  return { ok: true, text, bom };
};

export const encodeUtf8 = (text: string): Uint8Array =>
  new TextEncoder().encode(text);
