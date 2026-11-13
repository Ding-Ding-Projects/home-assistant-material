/* eslint-disable no-bitwise -- binary container format */
import { crc32 } from "../../common/converter/crc32";
import {
  compressionAvailable,
  decompress,
} from "../../common/converter/streams";
import {
  DECEIVING_CHARACTERS,
  utf8Name,
} from "../../common/converter/archive-types";

/**
 * Reads the list of a ZIP archive, and a few small files of it, without
 * unpacking the rest. The archive is read in pieces from the file chosen on
 * this device and is not sent anywhere. The same limits and refusals are
 * applied by the server before anything is installed.
 */

export const ARCHIVE_LIMITS = {
  archiveBytes: 50 * 1024 * 1024,
  entries: 20_000,
  unpackedBytes: 100 * 1024 * 1024,
  pathLength: 512,
  pathDepth: 32,
  markerBytes: 256 * 1024,
  markerFiles: 400,
  // Past this size the ratio of unpacked to packed is checked
  ratioFloor: 1024 * 1024,
  ratio: 200,
} as const;

export type ArchiveErrorCode =
  | "not_zip"
  | "too_big"
  | "too_many_entries"
  | "too_large_unpacked"
  | "unsafe_path"
  | "too_deep"
  | "link_entry"
  | "encrypted"
  | "unsupported"
  | "ratio"
  | "corrupt"
  | "cannot_unpack";

export class ArchiveReadError extends Error {
  public readonly code: ArchiveErrorCode;

  public readonly entry?: string;

  constructor(code: ArchiveErrorCode, entry?: string) {
    super(code);
    this.code = code;
    this.entry = entry;
  }
}

export interface ByteSource {
  size: number;
  read(start: number, end: number): Promise<Uint8Array>;
}

export const bytesSource = (bytes: Uint8Array): ByteSource => ({
  size: bytes.length,
  read: async (start, end) => bytes.subarray(start, end),
});

export const blobSource = (blob: Blob): ByteSource => ({
  size: blob.size,
  read: async (start, end) =>
    new Uint8Array(await blob.slice(start, end).arrayBuffer()),
});

export interface ZipEntry {
  name: string;
  isDirectory: boolean;
  method: 0 | 8;
  crc: number;
  compressedSize: number;
  size: number;
  headerOffset: number;
}

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f]/;

/** Throws for a name that could leave the folder it is unpacked into. */
export const checkEntryName = (name: string): void => {
  if (
    !name ||
    name.length > ARCHIVE_LIMITS.pathLength ||
    name.startsWith("/") ||
    name.includes("\\") ||
    /^[A-Za-z]:/.test(name) ||
    CONTROL.test(name) ||
    DECEIVING_CHARACTERS.test(name)
  ) {
    throw new ArchiveReadError("unsafe_path", name);
  }
  const parts = name.replace(/\/$/, "").split("/");
  if (parts.some((part) => part === "" || part === "." || part === "..")) {
    throw new ArchiveReadError("unsafe_path", name);
  }
  if (parts.length > ARCHIVE_LIMITS.pathDepth) {
    throw new ArchiveReadError("too_deep", name);
  }
};

const findEndRecord = async (
  source: ByteSource
): Promise<{ view: DataView; at: number; tailStart: number }> => {
  const tailStart = Math.max(0, source.size - 22 - 0xffff);
  const tail = await source.read(tailStart, source.size);
  const view = new DataView(tail.buffer, tail.byteOffset, tail.byteLength);
  for (let at = tail.length - 22; at >= 0; at--) {
    if (
      view.getUint32(at, true) === SIG_EOCD &&
      at + 22 + view.getUint16(at + 20, true) === tail.length
    ) {
      return { view, at, tailStart };
    }
  }
  throw new ArchiveReadError("corrupt");
};

/** The entries of the archive. Throws when it is not safe to go on. */
export const readZipDirectory = async (
  source: ByteSource
): Promise<ZipEntry[]> => {
  if (source.size > ARCHIVE_LIMITS.archiveBytes) {
    throw new ArchiveReadError("too_big");
  }
  if (source.size < 22) {
    throw new ArchiveReadError("not_zip");
  }
  const head = await source.read(0, 4);
  if (head[0] !== 0x50 || head[1] !== 0x4b) {
    throw new ArchiveReadError("not_zip");
  }

  const { view: endView, at, tailStart } = await findEndRecord(source);
  const endPosition = tailStart + at;
  if (at >= 20 && endView.getUint32(at - 20, true) === SIG_ZIP64_LOCATOR) {
    throw new ArchiveReadError("unsupported", "zip64");
  }
  const disk = endView.getUint16(at + 4, true);
  const diskWithDirectory = endView.getUint16(at + 6, true);
  const count = endView.getUint16(at + 10, true);
  const directorySize = endView.getUint32(at + 12, true);
  const directoryOffset = endView.getUint32(at + 16, true);
  if (disk !== 0 || diskWithDirectory !== 0) {
    throw new ArchiveReadError("unsupported", "multi-disk");
  }
  if (
    count === 0xffff ||
    directorySize === 0xffffffff ||
    directoryOffset === 0xffffffff
  ) {
    throw new ArchiveReadError("unsupported", "zip64");
  }
  if (count > ARCHIVE_LIMITS.entries) {
    throw new ArchiveReadError("too_many_entries");
  }
  if (directoryOffset + directorySize > endPosition) {
    throw new ArchiveReadError("corrupt");
  }

  const directory = await source.read(
    directoryOffset,
    directoryOffset + directorySize
  );
  const view = new DataView(
    directory.buffer,
    directory.byteOffset,
    directory.byteLength
  );
  const entries: ZipEntry[] = [];
  let unpacked = 0;
  let position = 0;
  for (let index = 0; index < count; index++) {
    if (
      position + 46 > directory.length ||
      view.getUint32(position, true) !== SIG_CENTRAL
    ) {
      throw new ArchiveReadError("corrupt");
    }
    const madeBy = view.getUint16(position + 4, true);
    const flags = view.getUint16(position + 8, true);
    const method = view.getUint16(position + 10, true);
    const crc = view.getUint32(position + 16, true);
    const compressedSize = view.getUint32(position + 20, true);
    const size = view.getUint32(position + 24, true);
    const nameLength = view.getUint16(position + 28, true);
    const extraLength = view.getUint16(position + 30, true);
    const commentLength = view.getUint16(position + 32, true);
    const attributes = view.getUint32(position + 38, true);
    const headerOffset = view.getUint32(position + 42, true);
    const nameStart = position + 46;
    if (
      nameStart + nameLength + extraLength + commentLength >
      directory.length
    ) {
      throw new ArchiveReadError("corrupt");
    }
    const name = utf8Name(
      directory.subarray(nameStart, nameStart + nameLength),
      true
    );
    checkEntryName(name);

    if (flags & 1 || flags & 0x40) {
      throw new ArchiveReadError("encrypted", name);
    }
    if (
      compressedSize === 0xffffffff ||
      size === 0xffffffff ||
      headerOffset === 0xffffffff
    ) {
      throw new ArchiveReadError("unsupported", "zip64");
    }
    if (method !== 0 && method !== 8) {
      throw new ArchiveReadError("unsupported", name);
    }
    // Only an archive made on Unix says what an entry is
    if (madeBy >> 8 === 3) {
      const type = (attributes >>> 16) & 0xf000;
      if (type !== 0 && type !== 0x8000 && type !== 0x4000) {
        throw new ArchiveReadError("link_entry", name);
      }
    }
    if (
      size > ARCHIVE_LIMITS.ratioFloor &&
      size > Math.max(compressedSize, 1) * ARCHIVE_LIMITS.ratio
    ) {
      throw new ArchiveReadError("ratio", name);
    }
    unpacked += size;
    if (unpacked > ARCHIVE_LIMITS.unpackedBytes) {
      throw new ArchiveReadError("too_large_unpacked");
    }
    entries.push({
      name,
      isDirectory: name.endsWith("/"),
      method,
      crc,
      compressedSize,
      size,
      headerOffset,
    });
    position = nameStart + nameLength + extraLength + commentLength;
  }
  return entries;
};

/**
 * The text of a small file of the archive, or undefined when the file is too
 * big to be one that only tells what the content is, or is not text.
 */
export const readZipText = async (
  source: ByteSource,
  entry: ZipEntry
): Promise<string | undefined> => {
  if (entry.isDirectory || entry.size > ARCHIVE_LIMITS.markerBytes) {
    return undefined;
  }
  const local = await source.read(entry.headerOffset, entry.headerOffset + 30);
  const localView = new DataView(
    local.buffer,
    local.byteOffset,
    local.byteLength
  );
  if (local.length < 30 || localView.getUint32(0, true) !== SIG_LOCAL) {
    throw new ArchiveReadError("corrupt", entry.name);
  }
  const dataStart =
    entry.headerOffset +
    30 +
    localView.getUint16(26, true) +
    localView.getUint16(28, true);
  if (dataStart + entry.compressedSize > source.size) {
    throw new ArchiveReadError("corrupt", entry.name);
  }
  const raw = await source.read(dataStart, dataStart + entry.compressedSize);

  let data: Uint8Array;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.size) {
      throw new ArchiveReadError("corrupt", entry.name);
    }
    data = raw;
  } else if (entry.size === 0) {
    data = new Uint8Array(0);
  } else {
    if (!compressionAvailable("deflate-raw")) {
      throw new ArchiveReadError("cannot_unpack");
    }
    try {
      data = await decompress(raw, entry.size, "deflate-raw");
    } catch (_err) {
      // Damaged data, or more output than the archive declared
      throw new ArchiveReadError("corrupt", entry.name);
    }
  }
  if (data.length !== entry.size || crc32(data) !== entry.crc) {
    throw new ArchiveReadError("corrupt", entry.name);
  }
  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(data);
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  } catch (_err) {
    return undefined;
  }
};
