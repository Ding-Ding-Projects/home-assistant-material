/* eslint-disable no-bitwise -- reads binary image headers */
/**
 * Image sizes read from the first bytes of a file, so a picture that is far
 * too large is refused before the browser tries to decode it.
 */

export const MAX_PIXELS = 100_000_000;
export const MAX_SIDE = 16384;

export interface Size {
  width: number;
  height: number;
}

const u16be = (b: Uint8Array, at: number) => (b[at] << 8) | b[at + 1];
const u16le = (b: Uint8Array, at: number) => b[at] | (b[at + 1] << 8);
const u32be = (b: Uint8Array, at: number) =>
  b[at] * 16777216 + (b[at + 1] << 16) + (b[at + 2] << 8) + b[at + 3];
const u32le = (b: Uint8Array, at: number) =>
  (b[at] | (b[at + 1] << 8) | (b[at + 2] << 16)) + b[at + 3] * 16777216;
const ascii = (b: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...b.subarray(from, to));

const jpegSize = (bytes: Uint8Array): Size | undefined => {
  let at = 2;
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 1) {
      at += 2;
      continue;
    }
    const frame =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (frame) {
      return { height: u16be(bytes, at + 5), width: u16be(bytes, at + 7) };
    }
    at += 2 + u16be(bytes, at + 2);
  }
  return undefined;
};

const webpSize = (bytes: Uint8Array): Size | undefined => {
  const chunk = ascii(bytes, 12, 16);
  if (chunk === "VP8 " && bytes.length >= 30) {
    return {
      width: u16le(bytes, 26) & 0x3fff,
      height: u16le(bytes, 28) & 0x3fff,
    };
  }
  if (chunk === "VP8L" && bytes.length >= 25) {
    const bits = u32le(bytes, 21);
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X" && bytes.length >= 30) {
    return {
      width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
      height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1,
    };
  }
  return undefined;
};

export const readImageSize = (
  bytes: Uint8Array,
  kind: string
): Size | undefined => {
  switch (kind) {
    case "png":
      return bytes.length >= 24
        ? { width: u32be(bytes, 16), height: u32be(bytes, 20) }
        : undefined;
    case "gif":
      return bytes.length >= 10
        ? { width: u16le(bytes, 6), height: u16le(bytes, 8) }
        : undefined;
    case "bmp":
      return bytes.length >= 26
        ? {
            width: Math.abs(u32le(bytes, 18) | 0),
            height: Math.abs(u32le(bytes, 22) | 0),
          }
        : undefined;
    case "jpeg":
      return jpegSize(bytes);
    case "webp":
      return webpSize(bytes);
    default:
      return undefined;
  }
};

export type ResizeSpec =
  | { mode: "keep" }
  | { mode: "scale"; factor: number }
  | { mode: "fit"; longest: number };

/** Size after the change. A picture is made smaller, never larger. */
export const fitSize = (
  width: number,
  height: number,
  spec: ResizeSpec
): Size => {
  let factor = 1;
  if (spec.mode === "scale") {
    factor = Math.min(1, spec.factor);
  } else if (spec.mode === "fit") {
    factor = Math.min(1, spec.longest / Math.max(width, height));
  }
  if (factor === 1) {
    return { width, height };
  }
  return {
    width: Math.max(1, Math.round(width * factor)),
    height: Math.max(1, Math.round(height * factor)),
  };
};
