/* eslint-disable no-bitwise -- checksum arithmetic */
/** CRC-32 as used by ZIP and GZIP (polynomial 0xEDB88320). */

let table: Uint32Array | undefined;

const getTable = (): Uint32Array => {
  if (!table) {
    table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c >>> 0;
    }
  }
  return table;
};

/** The CRC-32 of the bytes, as an unsigned number. */
export const crc32 = (bytes: Uint8Array): number => {
  const t = getTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = t[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
};
