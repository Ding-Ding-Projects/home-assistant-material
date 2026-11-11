/* eslint-disable no-bitwise -- binary container format */
import type { ArchiveEntry, ArchiveReadResult } from "./archive-types";
import { MAX_ENTRIES, MAX_UNPACKED, utf8Name } from "./archive-types";
import type { ConvertNote } from "./types";
import { failure } from "./types";

/**
 * A TAR reader and writer for the ustar format, with the two common ways of
 * carrying long or non-ASCII names (pax headers and GNU long names) on the
 * reading side. Links and device files are not carried over: they are
 * skipped and counted, never followed.
 */

const BLOCK = 512;

const cstring = (
  bytes: Uint8Array,
  from: number,
  length: number
): Uint8Array => {
  let end = from;
  const limit = from + length;
  while (end < limit && bytes[end] !== 0) {
    end++;
  }
  return bytes.subarray(from, end);
};

const octal = (bytes: Uint8Array, from: number, length: number): number => {
  if (bytes[from] & 0x80) {
    // Base-256 for numbers that do not fit in octal digits.
    let value = 0;
    for (let i = 1; i < length; i++) {
      value = value * 256 + bytes[from + i];
    }
    return value;
  }
  const text = utf8Name(cstring(bytes, from, length), false).trim();
  if (!/^[0-7]*$/.test(text)) {
    return Number.NaN;
  }
  return text === "" ? 0 : parseInt(text, 8);
};

const isZeroBlock = (bytes: Uint8Array, at: number): boolean => {
  for (let i = at; i < at + BLOCK; i++) {
    if (bytes[i] !== 0) {
      return false;
    }
  }
  return true;
};

/** Whether the bytes begin with a ustar header. */
export const looksLikeTar = (bytes: Uint8Array): boolean =>
  bytes.length >= BLOCK &&
  bytes[257] === 0x75 &&
  bytes[258] === 0x73 &&
  bytes[259] === 0x74 &&
  bytes[260] === 0x61 &&
  bytes[261] === 0x72;

const parsePax = (data: Uint8Array): Record<string, string> => {
  const out: Record<string, string> = {};
  let at = 0;
  while (at < data.length) {
    let space = at;
    while (space < data.length && data[space] !== 0x20) {
      space++;
    }
    const length = parseInt(utf8Name(data.subarray(at, space), false), 10);
    if (!Number.isFinite(length) || length <= space - at + 1) {
      break;
    }
    const record = utf8Name(data.subarray(space + 1, at + length - 1), true);
    const eq = record.indexOf("=");
    if (eq > 0) {
      out[record.slice(0, eq)] = record.slice(eq + 1);
    }
    at += length;
  }
  return out;
};

export const readTar = (bytes: Uint8Array): ArchiveReadResult => {
  const entries: ArchiveEntry[] = [];
  let skipped = 0;
  let total = 0;
  let at = 0;
  let longName: string | undefined;
  let pax: Record<string, string> = {};
  while (at + BLOCK <= bytes.length) {
    if (isZeroBlock(bytes, at)) {
      break;
    }
    const headerAt = at;
    const size = octal(bytes, at + 124, 12);
    const stored = octal(bytes, at + 148, 8);
    if (!Number.isFinite(size) || !Number.isFinite(stored)) {
      return failure("archive_corrupt");
    }
    let sum = 0;
    for (let i = 0; i < BLOCK; i++) {
      sum += i >= 148 && i < 156 ? 0x20 : bytes[at + i];
    }
    if (sum !== stored) {
      return failure("archive_corrupt");
    }
    const type = String.fromCharCode(bytes[at + 156] || 0x30);
    const dataStart = at + BLOCK;
    const declared = pax.size !== undefined ? Number(pax.size) : size;
    if (declared > MAX_UNPACKED || !Number.isFinite(declared)) {
      return failure("archive_too_big");
    }
    if (dataStart + declared > bytes.length) {
      return failure("archive_corrupt");
    }
    const data = bytes.subarray(dataStart, dataStart + declared);
    at = dataStart + Math.ceil(declared / BLOCK) * BLOCK;

    if (type === "x") {
      pax = { ...pax, ...parsePax(data) };
      continue;
    }
    if (type === "g") {
      continue;
    }
    if (type === "L") {
      longName = utf8Name(cstring(data, 0, data.length), true);
      continue;
    }
    if (type === "K") {
      continue;
    }
    let name = utf8Name(cstring(bytes, headerAt, 100), true);
    const prefix = utf8Name(cstring(bytes, headerAt + 345, 155), true);
    if (prefix && bytes[headerAt + 257] === 0x75) {
      name = `${prefix}/${name}`;
    }
    name = pax.path ?? longName ?? name;
    const modified =
      (Number(pax.mtime) || octal(bytes, headerAt + 136, 12) || 0) * 1000;
    pax = {};
    longName = undefined;

    if (type === "0" || type === "7" || type === "5") {
      const dir = type === "5" || name.endsWith("/");
      if (entries.length >= MAX_ENTRIES) {
        return failure("archive_too_many", { position: entries.length });
      }
      total += dir ? 0 : data.length;
      if (total > MAX_UNPACKED) {
        return failure("archive_too_big");
      }
      entries.push({
        path: dir && !name.endsWith("/") ? `${name}/` : name,
        data: dir ? new Uint8Array(0) : data,
        dir,
        modified,
      });
    } else {
      // Links, devices and pipes.
      skipped++;
    }
  }
  const notes: ConvertNote[] = skipped
    ? [{ code: "links_skipped", count: skipped }]
    : [];
  return { ok: true, entries, notes };
};

const put = (header: Uint8Array, at: number, text: string, length: number) => {
  const bytes = new TextEncoder().encode(text);
  header.set(bytes.subarray(0, length), at);
};

const putOctal = (
  header: Uint8Array,
  at: number,
  value: number,
  length: number
) => {
  put(header, at, value.toString(8).padStart(length - 1, "0"), length - 1);
};

const makeHeader = (
  name: string,
  size: number,
  type: string,
  modified: number,
  prefix = ""
): Uint8Array => {
  const header = new Uint8Array(BLOCK);
  put(header, 0, name, 100);
  putOctal(header, 100, type === "5" ? 0o755 : 0o644, 8);
  putOctal(header, 108, 0, 8);
  putOctal(header, 116, 0, 8);
  putOctal(header, 124, size, 12);
  putOctal(header, 136, Math.max(0, Math.floor(modified / 1000)), 12);
  header.fill(0x20, 148, 156);
  header[156] = type.charCodeAt(0);
  put(header, 257, "ustar", 6);
  put(header, 263, "00", 2);
  if (prefix) {
    put(header, 345, prefix, 155);
  }
  let sum = 0;
  for (let i = 0; i < BLOCK; i++) {
    sum += header[i];
  }
  put(header, 148, sum.toString(8).padStart(6, "0"), 6);
  header[154] = 0;
  header[155] = 0x20;
  return header;
};

const paxRecord = (key: string, value: string): Uint8Array => {
  const body = `${key}=${value}\n`;
  const encoder = new TextEncoder();
  const bodyLength = encoder.encode(body).length;
  // The length counts its own digits.
  let length = bodyLength + 2;
  while (String(length).length + 1 + bodyLength !== length) {
    length = String(length).length + 1 + bodyLength;
  }
  return encoder.encode(`${length} ${body}`);
};

const padded = (data: Uint8Array): Uint8Array => {
  const out = new Uint8Array(Math.ceil(data.length / BLOCK) * BLOCK);
  out.set(data);
  return out;
};

const splitName = (
  name: string
): { prefix: string; name: string } | undefined => {
  // eslint-disable-next-line no-control-regex
  if (!/^[\u0000-\u007f]*$/.test(name)) {
    return undefined;
  }
  if (name.length <= 100) {
    return { prefix: "", name };
  }
  for (let at = name.indexOf("/"); at !== -1; at = name.indexOf("/", at + 1)) {
    const prefix = name.slice(0, at);
    const rest = name.slice(at + 1);
    if (prefix.length <= 155 && rest.length <= 100 && rest.length > 0) {
      return { prefix, name: rest };
    }
  }
  return undefined;
};

export const writeTar = (entries: readonly ArchiveEntry[]): Uint8Array => {
  const parts: Uint8Array[] = [];
  for (const entry of entries) {
    const path =
      entry.dir && !entry.path.endsWith("/") ? `${entry.path}/` : entry.path;
    const data = entry.dir ? new Uint8Array(0) : entry.data;
    const type = entry.dir ? "5" : "0";
    const split = splitName(path);
    if (split) {
      parts.push(
        makeHeader(split.name, data.length, type, entry.modified, split.prefix)
      );
    } else {
      const record = paxRecord("path", path);
      parts.push(
        makeHeader("PaxHeader", record.length, "x", entry.modified),
        padded(record),
        makeHeader(path.slice(0, 100), data.length, type, entry.modified)
      );
    }
    if (data.length) {
      parts.push(padded(data));
    }
  }
  parts.push(new Uint8Array(BLOCK * 2));
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
