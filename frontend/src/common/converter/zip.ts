/* eslint-disable no-bitwise, no-await-in-loop -- binary container format, and entries are handled in order */
import type { ArchiveEntry, ArchiveReadResult } from "./archive-types";
import {
  MAX_ENTRIES,
  MAX_RATIO,
  MAX_UNPACKED,
  RATIO_FLOOR,
  utf8Name,
} from "./archive-types";
import { crc32 } from "./crc32";
import { compress, compressionAvailable, decompress } from "./streams";
import type { ConvertNote } from "./types";
import { failure } from "./types";

/**
 * A ZIP reader and writer. Store and deflate only, UTF-8 names, no
 * encryption and no ZIP64: those are refused with a clear message rather
 * than guessed at. Sizes are checked from the central directory before
 * anything is unpacked, and unpacking never goes past the size the archive
 * itself declares.
 */

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

const dosToMs = (date: number, time: number): number => {
  const year = (date >> 9) + 1980;
  const month = ((date >> 5) & 15) - 1;
  const day = date & 31;
  const hours = time >> 11;
  const minutes = (time >> 5) & 63;
  const seconds = (time & 31) * 2;
  const ms = Date.UTC(
    year,
    Math.max(0, month),
    Math.max(1, day),
    hours,
    minutes,
    seconds
  );
  return Number.isFinite(ms) ? ms : 0;
};

const msToDos = (ms: number): { date: number; time: number } => {
  const d = new Date(ms > 0 ? ms : Date.UTC(1980, 0, 1));
  const year = d.getUTCFullYear();
  if (year < 1980 || year > 2107) {
    // The earliest date a ZIP can hold: 1980-01-01.
    return { date: (1 << 5) | 1, time: 0 };
  }
  return {
    date: ((year - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
    time:
      (d.getUTCHours() << 11) |
      (d.getUTCMinutes() << 5) |
      (d.getUTCSeconds() >> 1),
  };
};

interface CentralEntry {
  name: string;
  method: number;
  crc: number;
  compressed: number;
  size: number;
  offset: number;
  modified: number;
  symlink: boolean;
}

export const readZip = async (
  bytes: Uint8Array
): Promise<ArchiveReadResult> => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) {
    return failure("archive_corrupt");
  }
  // The end record is the last 22 bytes plus a comment of up to 65535.
  // A record only counts when its comment length reaches exactly the end of
  // the file and the directory it names ends where the record starts: a
  // forged record placed inside the comment fails both, so the search goes
  // on to the real one. A looser second pass keeps archives with a little
  // extra data between the directory and the end record readable.
  let eocd = -1;
  const lowest = Math.max(0, bytes.length - 22 - 0xffff);
  for (let pass = 0; pass < 2 && eocd < 0; pass++) {
    for (let at = bytes.length - 22; at >= lowest; at--) {
      if (
        view.getUint32(at, true) === SIG_EOCD &&
        at + 22 + view.getUint16(at + 20, true) === bytes.length &&
        (pass === 1 ||
          view.getUint32(at + 12, true) + view.getUint32(at + 16, true) === at)
      ) {
        eocd = at;
        break;
      }
    }
  }
  if (eocd < 0) {
    return failure("archive_corrupt");
  }
  if (eocd >= 20 && view.getUint32(eocd - 20, true) === SIG_ZIP64_LOCATOR) {
    return failure("zip64_unsupported");
  }
  const disk = view.getUint16(eocd + 4, true);
  const diskWithDirectory = view.getUint16(eocd + 6, true);
  const count = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  if (disk !== 0 || diskWithDirectory !== 0) {
    return failure("zip_multi_disk");
  }
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    return failure("zip64_unsupported");
  }
  if (count > MAX_ENTRIES) {
    return failure("archive_too_many", { position: count });
  }
  if (directoryOffset + directorySize > eocd) {
    return failure("archive_corrupt");
  }

  const central: CentralEntry[] = [];
  let at = directoryOffset;
  let declared = 0;
  let packed = 0;
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== SIG_CENTRAL) {
      return failure("archive_corrupt");
    }
    const flags = view.getUint16(at + 8, true);
    const method = view.getUint16(at + 10, true);
    const time = view.getUint16(at + 12, true);
    const date = view.getUint16(at + 14, true);
    const crc = view.getUint32(at + 16, true);
    const compressed = view.getUint32(at + 20, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const attributes = view.getUint32(at + 38, true);
    const offset = view.getUint32(at + 42, true);
    const nameStart = at + 46;
    if (nameStart + nameLength + extraLength + commentLength > bytes.length) {
      return failure("archive_corrupt");
    }
    const name = utf8Name(
      bytes.subarray(nameStart, nameStart + nameLength),
      true
    );
    if (flags & 1 || flags & 0x40) {
      return failure("zip_encrypted", { detail: name });
    }
    if (
      compressed === 0xffffffff ||
      size === 0xffffffff ||
      offset === 0xffffffff
    ) {
      return failure("zip64_unsupported", { detail: name });
    }
    if (method !== 0 && method !== 8) {
      return failure("zip_method", { detail: name, position: method });
    }
    const madeByUnix = view.getUint16(at + 4, true) >> 8 === 3;
    const mode = attributes >>> 16;
    central.push({
      name,
      method,
      crc,
      compressed,
      size,
      offset,
      modified: dosToMs(date, time),
      symlink: madeByUnix && (mode & 0xf000) === 0xa000,
    });
    declared += size;
    packed += compressed;
    if (declared > MAX_UNPACKED) {
      return failure("archive_too_big");
    }
    if (size > RATIO_FLOOR && size > Math.max(compressed, 1) * MAX_RATIO) {
      return failure("archive_ratio", { detail: name });
    }
    at = nameStart + nameLength + extraLength + commentLength;
  }
  if (
    declared > RATIO_FLOOR &&
    declared > Math.max(packed, bytes.length) * MAX_RATIO
  ) {
    return failure("archive_ratio");
  }

  const entries: ArchiveEntry[] = [];
  const notes: ConvertNote[] = [];
  let skipped = 0;
  for (const entry of central) {
    if (entry.symlink) {
      skipped++;
      continue;
    }
    if (
      entry.offset + 30 > bytes.length ||
      view.getUint32(entry.offset, true) !== SIG_LOCAL
    ) {
      return failure("archive_corrupt", { detail: entry.name });
    }
    const dataStart =
      entry.offset +
      30 +
      view.getUint16(entry.offset + 26, true) +
      view.getUint16(entry.offset + 28, true);
    if (dataStart + entry.compressed > bytes.length) {
      return failure("archive_corrupt", { detail: entry.name });
    }
    const raw = bytes.subarray(dataStart, dataStart + entry.compressed);
    let data: Uint8Array;
    if (entry.method === 0) {
      if (entry.compressed !== entry.size) {
        return failure("archive_corrupt", { detail: entry.name });
      }
      data = raw;
    } else if (entry.size === 0) {
      data = new Uint8Array(0);
    } else {
      if (!compressionAvailable("deflate-raw")) {
        return failure("compression_unsupported");
      }
      try {
        data = await decompress(raw, entry.size, "deflate-raw");
      } catch (_err) {
        // Either damaged data, or more output than the archive declared.
        return failure("archive_corrupt", { detail: entry.name });
      }
      if (data.length !== entry.size) {
        return failure("archive_corrupt", { detail: entry.name });
      }
    }
    if (crc32(data) !== entry.crc) {
      return failure("archive_crc", { detail: entry.name });
    }
    entries.push({
      path: entry.name,
      data,
      dir: entry.name.endsWith("/"),
      modified: entry.modified,
    });
  }
  if (skipped) {
    notes.push({ code: "links_skipped", count: skipped });
  }
  return { ok: true, entries, notes };
};

const concat = (parts: Uint8Array[]): Uint8Array => {
  let total = 0;
  for (const part of parts) {
    total += part.length;
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

/** A ZIP of the entries. Files are deflated when that makes them smaller. */
export const writeZip = async (
  entries: readonly ArchiveEntry[]
): Promise<Uint8Array> => {
  const canDeflate = compressionAvailable("deflate-raw");
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = entry.dir ? 0 : crc32(entry.data);
    let data = entry.dir ? new Uint8Array(0) : entry.data;
    let method = 0;
    if (canDeflate && data.length > 0) {
      const deflated = await compress(data, "deflate-raw");
      if (deflated.length < data.length) {
        data = deflated;
        method = 8;
      }
    }
    const size = entry.dir ? 0 : entry.data.length;
    const { date, time } = msToDos(entry.modified);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, SIG_LOCAL, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, method, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, SIG_CENTRAL, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, entry.dir ? 0x10 : 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const directory = concat(centrals);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, directory.length, true);
  ev.setUint32(16, offset, true);
  return concat([...locals, directory, end]);
};
