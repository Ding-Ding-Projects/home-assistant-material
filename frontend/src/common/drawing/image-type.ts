import { MAX_PIXELS, readImageSize } from "../converter/image-size";

export type DrawingImageType = "image/png" | "image/jpeg" | "image/webp";

/** The largest picture file taken, in bytes. */
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

/** The largest side of a page, in pixels; larger pictures are scaled down. */
export const MAX_PAGE_SIDE = 4096;

/** The largest side a picture may have to be taken at all. */
export const MAX_SOURCE_SIDE = 16000;

/**
 * What a file really is, from its first bytes and not from its name or
 * declared type. Only PNG, JPEG and WebP are accepted; SVG and everything
 * else give undefined.
 */
export const sniffImageType = (
  bytes: Uint8Array
): DrawingImageType | undefined => {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && // R
    bytes[1] === 0x49 && // I
    bytes[2] === 0x46 && // F
    bytes[3] === 0x46 && // F
    bytes[8] === 0x57 && // W
    bytes[9] === 0x45 && // E
    bytes[10] === 0x42 && // B
    bytes[11] === 0x50 // P
  ) {
    return "image/webp";
  }
  return undefined;
};

export type ImageCheck =
  | { ok: true }
  | {
      ok: false;
      reason: "too_big" | "not_image" | "dimensions" | "unreadable";
    };

/** Check a picture's size in bytes and pixels. */
export const checkImageLimits = (
  byteLength: number,
  width: number,
  height: number
): ImageCheck => {
  if (byteLength > MAX_IMAGE_BYTES) {
    return { ok: false, reason: "too_big" };
  }
  if (
    !width ||
    !height ||
    Math.max(width, height) > MAX_SOURCE_SIDE ||
    width * height > MAX_PIXELS
  ) {
    return { ok: false, reason: "dimensions" };
  }
  return { ok: true };
};

const KIND_OF_TYPE: Record<DrawingImageType, string> = {
  "image/png": "png",
  "image/jpeg": "jpeg",
  "image/webp": "webp",
};

/**
 * Judge a picture from its first bytes, before the browser decodes it. A file
 * whose size cannot be read is refused: it could decode to anything.
 */
export const inspectImageHeader = (
  head: Uint8Array,
  byteLength: number
): ImageCheck | { ok: true; width: number; height: number } => {
  const type = sniffImageType(head);
  if (!type) {
    return { ok: false, reason: "not_image" };
  }
  const size = readImageSize(head, KIND_OF_TYPE[type]);
  if (!size) {
    return { ok: false, reason: "unreadable" };
  }
  const check = checkImageLimits(byteLength, size.width, size.height);
  return check.ok ? { ok: true, ...size } : check;
};

/** The size a page takes for a picture, scaled down to fit the limit. */
export const pageSizeForImage = (
  width: number,
  height: number
): { width: number; height: number } => {
  const longest = Math.max(width, height);
  if (longest <= MAX_PAGE_SIDE) {
    return { width, height };
  }
  const scale = MAX_PAGE_SIDE / longest;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};
