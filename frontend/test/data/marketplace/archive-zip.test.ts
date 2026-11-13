/* eslint-disable no-bitwise -- builds binary data */
import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { crc32 } from "../../../src/common/converter/crc32";
import {
  ARCHIVE_LIMITS,
  ArchiveReadError,
  bytesSource,
  checkEntryName,
  readZipDirectory,
  readZipText,
} from "../../../src/data/marketplace/archive-zip";
import type { ByteSource } from "../../../src/data/marketplace/archive-zip";

interface Craft {
  name: string;
  text?: string;
  data?: Uint8Array;
  deflate?: boolean;
  madeBy?: number;
  attributes?: number;
  flags?: number;
  // What the directory says, when it should not match the data
  size?: number;
  compressedSize?: number;
  crc?: number;
}

const enc = (text: string) => new TextEncoder().encode(text);

const concat = (parts: Uint8Array[]): Uint8Array => {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
};

// A ZIP built by hand, so the directory can say things a real tool never would
const craftZip = (
  entries: Craft[],
  end: { count?: number; locator?: boolean } = {}
): Uint8Array => {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    const raw = entry.data ?? enc(entry.text ?? "");
    const stored = entry.deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const name = enc(entry.name);
    const method = entry.deflate ? 8 : 0;
    const crc = entry.crc ?? crc32(raw);
    const size = entry.size ?? raw.length;
    const compressed = entry.compressedSize ?? stored.length;

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, stored.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, name.length, true);
    local.set(name, 30);
    locals.push(local, stored);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, entry.madeBy ?? 20, true);
    cv.setUint16(8, entry.flags ?? 0, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, compressed, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(38, entry.attributes ?? 0, true);
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length + stored.length;
  }
  const directory = concat(centrals);
  const tail: Uint8Array[] = [];
  if (end.locator) {
    const locator = new Uint8Array(20);
    new DataView(locator.buffer).setUint32(0, 0x07064b50, true);
    tail.push(locator);
  }
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, end.count ?? entries.length, true);
  ev.setUint16(10, end.count ?? entries.length, true);
  ev.setUint32(12, directory.length, true);
  ev.setUint32(16, offset, true);
  tail.push(eocd);
  return concat([...locals, directory, ...tail]);
};

const failure = async (promise: Promise<unknown>): Promise<string> => {
  try {
    await promise;
  } catch (err) {
    return err instanceof ArchiveReadError ? err.code : `other: ${err}`;
  }
  return "no error";
};

describe("readZipDirectory", () => {
  it("lists a stored and a deflated entry", async () => {
    const zip = craftZip([
      { name: "a/", text: "" },
      { name: "a/one.txt", text: "one" },
      { name: "a/two.json", text: '{"x":1}'.repeat(50), deflate: true },
    ]);

    const entries = await readZipDirectory(bytesSource(zip));

    expect(
      entries.map((entry) => [entry.name, entry.isDirectory, entry.method])
    ).toEqual([
      ["a/", true, 0],
      ["a/one.txt", false, 0],
      ["a/two.json", false, 8],
    ]);
  });

  it("reads the text of a stored and a deflated file, without a byte order mark", async () => {
    const zip = craftZip([
      { name: "plain.txt", text: "hello" },
      {
        name: "packed.json",
        text: "\uFEFF" + '{"a":"b"}'.repeat(40),
        deflate: true,
      },
    ]);
    const source = bytesSource(zip);
    const [plain, packed] = await readZipDirectory(source);

    expect(await readZipText(source, plain)).toBe("hello");
    expect(await readZipText(source, packed)).toBe('{"a":"b"}'.repeat(40));
  });

  it("leaves out a file that is too big to only tell what the content is, and one that is not text", async () => {
    const zip = craftZip([
      {
        name: "big.json",
        data: new Uint8Array(ARCHIVE_LIMITS.markerBytes + 1),
      },
      { name: "binary.bin", data: new Uint8Array([0xff, 0xfe, 0xfd]) },
    ]);
    const source = bytesSource(zip);
    const [big, binary] = await readZipDirectory(source);

    expect(await readZipText(source, big)).toBeUndefined();
    expect(await readZipText(source, binary)).toBeUndefined();
  });

  it.each([
    ["not a zip at all", enc("this is just some text, long enough to look at")],
    ["too short", enc("PK")],
  ])("refuses %s", async (_name, bytes) => {
    expect(await failure(readZipDirectory(bytesSource(bytes)))).toBe("not_zip");
  });

  it("refuses a file past the size limit without reading it", async () => {
    const source: ByteSource = {
      size: ARCHIVE_LIMITS.archiveBytes + 1,
      read: async () => {
        throw new Error("must not be read");
      },
    };

    expect(await failure(readZipDirectory(source))).toBe("too_big");
  });

  it.each([
    "../evil.txt",
    "a/../../evil.txt",
    "/etc/passwd",
    "C:/windows/x.dll",
    "a\\b.txt",
    "a//b.txt",
    "a/./b.txt",
    "evil\u202egpj.exe",
  ])("refuses the path %s", async (name) => {
    expect(
      await failure(
        readZipDirectory(bytesSource(craftZip([{ name, text: "x" }])))
      )
    ).toBe("unsafe_path");
  });

  it("refuses a path that is nested too deeply", async () => {
    const name = `${"d/".repeat(ARCHIVE_LIMITS.pathDepth + 1)}f`;

    expect(
      await failure(
        readZipDirectory(bytesSource(craftZip([{ name, text: "x" }])))
      )
    ).toBe("too_deep");
  });

  it.each([
    [
      "a symbolic link",
      { madeBy: 3 << 8, attributes: (0o120777 << 16) >>> 0 },
      "link_entry",
    ],
    [
      "a device",
      { madeBy: 3 << 8, attributes: (0o020600 << 16) >>> 0 },
      "link_entry",
    ],
    ["an encrypted file", { flags: 1 }, "encrypted"],
  ])("refuses %s", async (_name, extra, code) => {
    const zip = craftZip([{ name: "x", text: "x", ...extra }]);

    expect(await failure(readZipDirectory(bytesSource(zip)))).toBe(code);
  });

  it("accepts files and folders made on Unix", async () => {
    const zip = craftZip([
      { name: "d/", madeBy: 3 << 8, attributes: (0o040755 << 16) >>> 0 },
      {
        name: "d/f",
        text: "x",
        madeBy: 3 << 8,
        attributes: (0o100644 << 16) >>> 0,
      },
    ]);

    expect(await readZipDirectory(bytesSource(zip))).toHaveLength(2);
  });

  it("refuses more entries than allowed", async () => {
    const zip = craftZip([], { count: ARCHIVE_LIMITS.entries + 1 });

    expect(await failure(readZipDirectory(bytesSource(zip)))).toBe(
      "too_many_entries"
    );
  });

  it("refuses an archive that says it expands to too much", async () => {
    const zip = craftZip([
      {
        name: "a",
        text: "x",
        size: 80 * 1024 * 1024,
        compressedSize: 80 * 1024 * 1024,
      },
      {
        name: "b",
        text: "x",
        size: 80 * 1024 * 1024,
        compressedSize: 80 * 1024 * 1024,
      },
    ]);

    expect(await failure(readZipDirectory(bytesSource(zip)))).toBe(
      "too_large_unpacked"
    );
  });

  it("refuses a file that expands far more than it should", async () => {
    const zip = craftZip([
      {
        name: "bomb",
        text: "x",
        size: 400 * 1024 * 1024,
        compressedSize: 10_000,
      },
    ]);

    expect(await failure(readZipDirectory(bytesSource(zip)))).toBe("ratio");
  });

  it.each([
    ["ZIP64 archives", craftZip([{ name: "a", text: "x" }], { locator: true })],
    ["entry counts only ZIP64 can hold", craftZip([], { count: 0xffff })],
  ])("says plainly that %s are not supported", async (_name, zip) => {
    expect(await failure(readZipDirectory(bytesSource(zip)))).toBe(
      "unsupported"
    );
  });

  it("refuses data that does not match its checksum", async () => {
    const zip = craftZip([{ name: "a.txt", text: "hello", crc: 123 }]);
    const source = bytesSource(zip);
    const [entry] = await readZipDirectory(source);

    expect(await failure(readZipText(source, entry))).toBe("corrupt");
  });
});

describe("checkEntryName", () => {
  it("accepts the names of an ordinary repository", () => {
    for (const name of ["a.txt", "x-main/.git/HEAD", "dir/", "a/b/c.json"]) {
      expect(() => checkEntryName(name)).not.toThrow();
    }
  });
});
