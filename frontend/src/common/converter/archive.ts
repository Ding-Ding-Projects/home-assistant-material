/* eslint-disable no-bitwise, no-control-regex -- reads a binary header, and cleans control characters out of names */
import type { ArchiveEntry, ArchiveReadResult } from "./archive-types";
import {
  MAX_RATIO,
  MAX_UNPACKED,
  RATIO_FLOOR,
  safeArchivePath,
  utf8Name,
} from "./archive-types";
import { crc32 } from "./crc32";
import {
  compress,
  compressionAvailable,
  decompress,
  StreamLimitError,
} from "./streams";
import { looksLikeTar, readTar, writeTar } from "./tar";
import { failure } from "./types";
import { readZip, writeZip } from "./zip";

/**
 * Opening and building archives: ZIP, TAR, GZIP of one file, and TAR.GZ.
 * Every path inside an archive is checked before it is shown or saved, and
 * the amount unpacked is capped by size, count and compression ratio.
 */

export type ArchiveKind = "zip" | "tar" | "tar-gz" | "gzip";

export const looksLikeZip = (bytes: Uint8Array): boolean =>
  bytes.length >= 4 &&
  bytes[0] === 0x50 &&
  bytes[1] === 0x4b &&
  (bytes[2] === 0x03 || bytes[2] === 0x05) &&
  (bytes[3] === 0x04 || bytes[3] === 0x06);

export const looksLikeGzip = (bytes: Uint8Array): boolean =>
  bytes.length >= 18 &&
  bytes[0] === 0x1f &&
  bytes[1] === 0x8b &&
  bytes[2] === 0x08;

/** What the bytes are, as far as their first bytes say. */
export const sniffArchive = (
  bytes: Uint8Array
): "zip" | "tar" | "gzip" | undefined => {
  if (looksLikeZip(bytes)) {
    return "zip";
  }
  if (looksLikeGzip(bytes)) {
    return "gzip";
  }
  if (looksLikeTar(bytes)) {
    return "tar";
  }
  return undefined;
};

/** The name stored in a gzip header, if it has one. */
export const gzipStoredName = (bytes: Uint8Array): string | undefined => {
  const flags = bytes[3];
  let at = 10;
  if (flags & 4) {
    at += 2 + (bytes[at] | (bytes[at + 1] << 8));
  }
  if (!(flags & 8)) {
    return undefined;
  }
  let end = at;
  while (end < bytes.length && bytes[end] !== 0) {
    end++;
  }
  const name = utf8Name(bytes.subarray(at, end), true);
  return name || undefined;
};

const gunzip = (bytes: Uint8Array): Promise<Uint8Array> =>
  decompress(
    bytes,
    Math.min(MAX_UNPACKED, Math.max(RATIO_FLOOR, bytes.length * MAX_RATIO)),
    "gzip"
  );

/** A gzip file holding the bytes, with the file's name when it fits. */
export const gzipBytes = async (
  data: Uint8Array,
  name?: string
): Promise<Uint8Array> => {
  const deflated = await compress(data, "deflate-raw");
  const stored =
    name && /^[\u0001-ÿ]+$/.test(name)
      ? Array.from(name, (c) => c.charCodeAt(0))
      : [];
  const header = [
    0x1f,
    0x8b,
    8,
    stored.length ? 8 : 0,
    0,
    0,
    0,
    0,
    0,
    255,
    ...(stored.length ? [...stored, 0] : []),
  ];
  const out = new Uint8Array(header.length + deflated.length + 8);
  out.set(header);
  out.set(deflated, header.length);
  const view = new DataView(out.buffer);
  view.setUint32(header.length + deflated.length, crc32(data), true);
  view.setUint32(header.length + deflated.length + 4, data.length >>> 0, true);
  return out;
};

/** Refuses the whole archive when any path is unsafe. */
const checkPaths = (result: ArchiveReadResult): ArchiveReadResult => {
  if (!result.ok) {
    return result;
  }
  const entries: ArchiveEntry[] = [];
  for (const entry of result.entries) {
    const path = safeArchivePath(entry.path);
    if (path === undefined) {
      return failure("archive_unsafe_path", {
        detail: entry.path.slice(0, 200),
      });
    }
    entries.push({ ...entry, path, dir: entry.dir || path.endsWith("/") });
  }
  return { ...result, entries };
};

const stripGzipName = (name: string): string =>
  name.replace(/\.(gz|tgz)$/i, "") || "file";

/** Opens a ZIP, TAR, GZIP or TAR.GZ. The kind is decided by the contents. */
export const openArchive = async (
  bytes: Uint8Array,
  fileName: string
): Promise<ArchiveReadResult & { kind?: ArchiveKind }> => {
  const sniffed = sniffArchive(bytes);
  if (sniffed === "zip") {
    return { ...checkPaths(await readZip(bytes)), kind: "zip" };
  }
  if (sniffed === "tar") {
    return { ...checkPaths(readTar(bytes)), kind: "tar" };
  }
  if (sniffed === "gzip") {
    if (!compressionAvailable("gzip")) {
      return failure("compression_unsupported");
    }
    let inner: Uint8Array;
    try {
      inner = await gunzip(bytes);
    } catch (err) {
      // Past the cap, or damaged: either way nothing was kept.
      return failure(
        err instanceof StreamLimitError ? "archive_ratio" : "archive_corrupt"
      );
    }
    if (looksLikeTar(inner)) {
      return { ...checkPaths(readTar(inner)), kind: "tar-gz" };
    }
    const name = safeArchivePath(
      gzipStoredName(bytes) ?? stripGzipName(fileName)
    );
    return {
      ok: true,
      kind: "gzip",
      notes: [],
      entries: [
        {
          path: name ?? "file",
          data: inner,
          dir: false,
          modified: 0,
        },
      ],
    };
  }
  return failure("archive_unknown");
};

/**
 * The entries with unsafe or repeated names made safe and distinct. Used for
 * files the person chose, whose names are theirs to begin with.
 */
export const uniqueEntries = (
  files: readonly { name: string; data: Uint8Array; modified?: number }[]
): ArchiveEntry[] => {
  const used = new Set<string>();
  return files.map((file) => {
    let base = (file.name.split(/[\\/]/).pop() ?? "")
      .replace(/[\u0000-\u001f]/g, "_")
      .trim();
    if (!base || base === "." || base === "..") {
      base = "file";
    }
    let name = base;
    let n = 2;
    while (used.has(name.toLowerCase())) {
      const dot = base.lastIndexOf(".");
      name =
        dot > 0
          ? `${base.slice(0, dot)} (${n})${base.slice(dot)}`
          : `${base} (${n})`;
      n++;
    }
    used.add(name.toLowerCase());
    return {
      path: name,
      data: file.data,
      dir: false,
      modified: file.modified ?? 0,
    };
  });
};

/** Writes the entries as an archive of the chosen kind. */
export const buildArchive = async (
  entries: readonly ArchiveEntry[],
  kind: ArchiveKind
): Promise<
  | { ok: true; bytes: Uint8Array; mime: string }
  | { ok: false; error: { code: string } }
> => {
  if (kind === "zip") {
    return {
      ok: true,
      bytes: await writeZip(entries),
      mime: "application/zip",
    };
  }
  if (kind === "tar") {
    return { ok: true, bytes: writeTar(entries), mime: "application/x-tar" };
  }
  if (!compressionAvailable("deflate-raw")) {
    return { ok: false, error: { code: "compression_unsupported" } };
  }
  if (kind === "tar-gz") {
    return {
      ok: true,
      bytes: await gzipBytes(writeTar(entries)),
      mime: "application/gzip",
    };
  }
  const files = entries.filter((entry) => !entry.dir);
  if (files.length !== 1) {
    return { ok: false, error: { code: "gzip_one_file" } };
  }
  return {
    ok: true,
    bytes: await gzipBytes(files[0].data, files[0].path),
    mime: "application/gzip",
  };
};
