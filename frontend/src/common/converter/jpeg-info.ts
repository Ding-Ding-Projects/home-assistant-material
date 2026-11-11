/* eslint-disable no-bitwise -- reads a binary header */
/**
 * What a PDF needs to know about a JPEG that goes in as it is: its size and
 * number of colour channels, and whether a photo is stored turned, which a
 * PDF reader would not undo.
 */

export interface JpegInfo {
  width: number;
  height: number;
  components: number;
  /** EXIF orientation, 1 when the file has none. */
  orientation: number;
  /** Whether the file carries an Exif segment (location, camera, thumbnail). */
  exif: boolean;
}

const exifOrientation = (
  bytes: Uint8Array,
  start: number,
  end: number
): number => {
  // "Exif\0\0" and then a TIFF header.
  if (
    bytes[start] !== 0x45 ||
    bytes[start + 1] !== 0x78 ||
    bytes[start + 2] !== 0x69 ||
    bytes[start + 3] !== 0x66
  ) {
    return 1;
  }
  const tiff = start + 6;
  if (tiff + 8 > end) {
    return 1;
  }
  const little = bytes[tiff] === 0x49;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u16 = (at: number) => view.getUint16(at, little);
  const u32 = (at: number) => view.getUint32(at, little);
  const ifd = tiff + u32(tiff + 4);
  if (ifd + 2 > end) {
    return 1;
  }
  const count = u16(ifd);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) {
      break;
    }
    if (u16(entry) === 0x0112) {
      return u16(entry + 8) || 1;
    }
  }
  return 1;
};

/** Reads the header of a JPEG, or returns undefined when it is not one. */
export const readJpeg = (bytes: Uint8Array): JpegInfo | undefined => {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return undefined;
  }
  let at = 2;
  let orientation = 1;
  let sawExif = false;
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) {
      at++;
      continue;
    }
    const marker = bytes[at + 1];
    if (marker === 0xff) {
      at++;
      continue;
    }
    if (
      marker === 0xd8 ||
      (marker >= 0xd0 && marker <= 0xd7) ||
      marker === 0x01
    ) {
      at += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) {
      return undefined;
    }
    const length = (bytes[at + 2] << 8) | bytes[at + 3];
    if (length < 2) {
      return undefined;
    }
    // Only the first Exif segment counts; an XMP or other APP1 segment after
    // it must not reset the orientation.
    if (
      marker === 0xe1 &&
      !sawExif &&
      bytes[at + 4] === 0x45 &&
      bytes[at + 5] === 0x78 &&
      bytes[at + 6] === 0x69 &&
      bytes[at + 7] === 0x66 &&
      bytes[at + 8] === 0 &&
      bytes[at + 9] === 0
    ) {
      sawExif = true;
      orientation = exifOrientation(
        bytes,
        at + 4,
        Math.min(bytes.length, at + 2 + length)
      );
    }
    // Baseline, extended and progressive frames carry the size.
    if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
      if (at + 10 > bytes.length) {
        return undefined;
      }
      const precision = bytes[at + 4];
      const height = (bytes[at + 5] << 8) | bytes[at + 6];
      const width = (bytes[at + 7] << 8) | bytes[at + 8];
      // Eight bits per sample is what every reader and the PDF filter handle.
      if (precision !== 8 || height === 0 || width === 0) {
        return undefined;
      }
      return {
        height,
        width,
        components: bytes[at + 9],
        orientation,
        exif: sawExif,
      };
    }
    at += 2 + length;
  }
  return undefined;
};
