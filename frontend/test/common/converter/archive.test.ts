/* eslint-disable no-bitwise, no-await-in-loop -- builds and damages binary data, and checks in order */
import JSZip from "jszip";
import { gunzipSync, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import type { ArchiveEntry } from "../../../src/common/converter/archive-types";
import { safeArchivePath } from "../../../src/common/converter/archive-types";
import {
  buildArchive,
  gzipStoredName,
  openArchive,
  sniffArchive,
  uniqueEntries,
} from "../../../src/common/converter/archive";
import { crc32 } from "../../../src/common/converter/crc32";
import { readTar, writeTar } from "../../../src/common/converter/tar";
import { readZip, writeZip } from "../../../src/common/converter/zip";

const enc = (text: string) => new TextEncoder().encode(text);
const dec = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

const file = (path: string, text: string): ArchiveEntry => ({
  path,
  data: enc(text),
  dir: false,
  modified: Date.UTC(2024, 4, 6, 7, 8, 10),
});

describe("crc32", () => {
  it("matches the published check value", () => {
    expect(crc32(enc("123456789"))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe("safeArchivePath", () => {
  it("keeps ordinary paths and tidies dots and doubled slashes", () => {
    expect(safeArchivePath("a/b.txt")).toBe("a/b.txt");
    expect(safeArchivePath("./a//b.txt")).toBe("a/b.txt");
    expect(safeArchivePath("folder/")).toBe("folder/");
    expect(safeArchivePath("a\\b.txt")).toBe("a/b.txt");
  });

  it("refuses climbing, absolute and drive-letter paths", () => {
    for (const bad of [
      "../x",
      "a/../../x",
      "a/..",
      "/etc/passwd",
      "\\\\server\\share",
      "C:\\Windows\\x",
      "c:x",
      "a\u0000b",
      "",
      "./",
    ]) {
      expect(safeArchivePath(bad), bad).toBeUndefined();
    }
  });
});

describe("zip", () => {
  const entries = [
    {
      ...file("hello.txt", "hello ".repeat(500)),
      modified: Date.UTC(2024, 4, 6, 7, 8, 10),
    },
    file("sub/日本語.txt", "unicode name"),
    { path: "sub/", data: new Uint8Array(0), dir: true, modified: 0 },
    file("empty.txt", ""),
  ];

  it("writes and reads back the same files, names and times", async () => {
    const zip = await writeZip(entries);
    const read = await readZip(zip);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.entries.map((e) => e.path)).toEqual([
      "hello.txt",
      "sub/日本語.txt",
      "sub/",
      "empty.txt",
    ]);
    expect(dec(read.entries[0].data)).toBe("hello ".repeat(500));
    expect(read.entries[2].dir).toBe(true);
    expect(read.entries[0].modified).toBe(Date.UTC(2024, 4, 6, 7, 8, 10));
  });

  it("deflates what compresses and is read by another ZIP reader", async () => {
    const zip = await writeZip(entries);
    expect(zip.length).toBeLessThan(3000 + 400);
    const other = await JSZip.loadAsync(zip);
    expect(await other.file("hello.txt")!.async("string")).toBe(
      "hello ".repeat(500)
    );
    expect(await other.file("sub/日本語.txt")!.async("string")).toBe(
      "unicode name"
    );
  });

  it("reads a ZIP made by another writer", async () => {
    const other = new JSZip();
    other.file("a.txt", "x".repeat(10000), { compression: "DEFLATE" });
    other.file("b/c.bin", new Uint8Array([1, 2, 3]), { compression: "STORE" });
    const bytes = await other.generateAsync({ type: "uint8array" });
    const read = await readZip(bytes);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.entries.find((e) => e.path === "a.txt")!.data.length).toBe(
        10000
      );
    }
  });

  it("refuses a damaged file by its checksum", async () => {
    const zip = await writeZip([file("a.txt", "store me not")]);
    const copy = zip.slice();
    // Flip a byte of the stored or deflated data right after the header.
    copy[30 + 5 + 2] ^= 0xff;
    const read = await readZip(copy);
    expect(read.ok).toBe(false);
  });

  it("refuses encrypted entries and ZIP64", async () => {
    const zip = await writeZip([file("a.txt", "hello")]);
    const encrypted = zip.slice();
    const view = new DataView(encrypted.buffer);
    // The central header starts after the local one; set the encrypted bit.
    const central = encrypted.findIndex(
      (_v, i) => view.getUint32(i, true) === 0x02014b50
    );
    view.setUint16(central + 8, view.getUint16(central + 8, true) | 1, true);
    const read = await readZip(encrypted);
    expect(read.ok ? "" : read.error.code).toBe("zip_encrypted");

    const sixtyFour = zip.slice();
    const eocd = sixtyFour.length - 22;
    new DataView(sixtyFour.buffer).setUint16(eocd + 10, 0xffff, true);
    const refused = await readZip(sixtyFour);
    expect(refused.ok ? "" : refused.error.code).toBe("zip64_unsupported");
  });

  it("refuses a zip bomb from the sizes it declares, before unpacking", async () => {
    const bomb = await writeZip([
      {
        path: "zeros.bin",
        data: new Uint8Array(3 * 1024 * 1024),
        dir: false,
        modified: 0,
      },
    ]);
    expect(bomb.length).toBeLessThan(10000);
    const read = await readZip(bomb);
    expect(read.ok ? "" : read.error.code).toBe("archive_ratio");
  });

  it("refuses an archive that lies about a size", async () => {
    const zip = await writeZip([file("a.txt", "hello ".repeat(500))]);
    const lying = zip.slice();
    const view = new DataView(lying.buffer);
    const central = lying.findIndex(
      (_v, i) => view.getUint32(i, true) === 0x02014b50
    );
    // Declare a smaller unpacked size than the data really has.
    view.setUint32(central + 24, 10, true);
    const read = await readZip(lying);
    expect(read.ok).toBe(false);
  });

  it("refuses unsafe paths when the archive is opened", async () => {
    const zip = await writeZip([file("../evil.txt", "x")]);
    const opened = await openArchive(zip, "x.zip");
    expect(opened.ok ? "" : opened.error.code).toBe("archive_unsafe_path");
  });
});

describe("tar", () => {
  const longName = `${"directory/".repeat(14)}file.txt`;

  it("round-trips files, folders, long names and non-ASCII names", () => {
    const tar = writeTar([
      file("a.txt", "alpha"),
      { path: "folder/", data: new Uint8Array(0), dir: true, modified: 0 },
      file(longName, "long"),
      file("名前.txt", "unicode"),
      file(`${"x".repeat(150)}.txt`, "very long"),
    ]);
    expect(tar.length % 512).toBe(0);
    const read = readTar(tar);
    expect(read.ok).toBe(true);
    if (!read.ok) {
      return;
    }
    expect(read.entries.map((e) => e.path)).toEqual([
      "a.txt",
      "folder/",
      longName,
      "名前.txt",
      `${"x".repeat(150)}.txt`,
    ]);
    expect(dec(read.entries[2].data)).toBe("long");
    expect(read.entries[0].modified).toBe(Date.UTC(2024, 4, 6, 7, 8, 10));
  });

  it("refuses a damaged header", () => {
    const tar = writeTar([file("a.txt", "alpha")]);
    tar[3] ^= 0xff;
    expect(readTar(tar).ok).toBe(false);
  });

  it("skips links instead of following them", () => {
    const tar = writeTar([file("a.txt", "alpha")]);
    // Turn the entry into a symbolic link: type 2, and fix the checksum.
    tar[156] = 0x32;
    let sum = 0;
    for (let i = 0; i < 512; i++) {
      sum += i >= 148 && i < 156 ? 0x20 : tar[i];
    }
    tar.set(enc(sum.toString(8).padStart(6, "0")), 148);
    const read = readTar(tar);
    expect(read.ok).toBe(true);
    if (read.ok) {
      expect(read.entries).toEqual([]);
      expect(read.notes).toEqual([{ code: "links_skipped", count: 1 }]);
    }
  });
});

describe("gzip and tar.gz", () => {
  it("compresses one file with its name and opens it again", async () => {
    const built = await buildArchive(
      [file("notes.txt", "gz ".repeat(300))],
      "gzip"
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    // Another implementation reads it, and the name is in the header.
    expect(dec(gunzipSync(built.bytes))).toBe("gz ".repeat(300));
    expect(gzipStoredName(built.bytes)).toBe("notes.txt");
    const opened = await openArchive(built.bytes, "whatever.gz");
    expect(opened.ok).toBe(true);
    if (opened.ok) {
      expect(opened.kind).toBe("gzip");
      expect(opened.entries[0].path).toBe("notes.txt");
      expect(dec(opened.entries[0].data)).toBe("gz ".repeat(300));
    }
  });

  it("names a gzip by its file name when the header has none", async () => {
    const opened = await openArchive(
      new Uint8Array(gzipSync(enc("plain text here"))),
      "report.txt.gz"
    );
    expect(opened.ok && opened.entries[0].path).toBe("report.txt");
  });

  it("builds and opens a tar.gz", async () => {
    const built = await buildArchive(
      [file("one.txt", "1"), file("two/2.txt", "22")],
      "tar-gz"
    );
    expect(built.ok).toBe(true);
    if (!built.ok) {
      return;
    }
    expect(sniffArchive(built.bytes)).toBe("gzip");
    const opened = await openArchive(built.bytes, "x.tar.gz");
    expect(opened.ok && opened.kind).toBe("tar-gz");
    expect(opened.ok && opened.entries.map((e) => e.path)).toEqual([
      "one.txt",
      "two/2.txt",
    ]);
  });

  it("refuses to gzip more than one file", async () => {
    const built = await buildArchive([file("a", "1"), file("b", "2")], "gzip");
    expect(built.ok).toBe(false);
  });

  it("stops a gzip bomb at the ratio limit", async () => {
    const bomb = new Uint8Array(gzipSync(new Uint8Array(40 * 1024 * 1024)));
    const opened = await openArchive(bomb, "zeros.gz");
    expect(opened.ok ? "" : opened.error.code).toBe("archive_ratio");
  });
});

describe("conversions between archives", () => {
  it("turns a zip into a tar and a tar.gz with the same files", async () => {
    const source = [file("a.txt", "alpha"), file("d/b.txt", "bravo")];
    const zip = await writeZip(source);
    const opened = await openArchive(zip, "x.zip");
    expect(opened.ok).toBe(true);
    if (!opened.ok) {
      return;
    }
    for (const kind of ["tar", "tar-gz"] as const) {
      const built = await buildArchive(opened.entries, kind);
      expect(built.ok).toBe(true);
      if (!built.ok) {
        return;
      }
      const again = await openArchive(built.bytes, "x");
      expect(again.ok && again.entries.map((e) => dec(e.data))).toEqual([
        "alpha",
        "bravo",
      ]);
    }
  });
});

describe("uniqueEntries", () => {
  it("makes dropped file names distinct and drops any folder part", () => {
    const entries = uniqueEntries([
      { name: "a.txt", data: enc("1") },
      { name: "A.txt", data: enc("2") },
      { name: "../up/a.txt", data: enc("3") },
      { name: "", data: enc("4") },
    ]);
    expect(entries.map((e) => e.path)).toEqual([
      "a.txt",
      "A (2).txt",
      "a (3).txt",
      "file",
    ]);
  });
});
