import { describe, expect, it } from "vitest";
import {
  collectLines,
  decodeBytes,
  detectLineBreak,
  FILE_SEARCH_LIMITS,
  splitLines,
} from "../../../src/common/regex/file-search";

// Searching device files starts with reading them the way the person chose:
// the encoding decides the characters, the line break decides the lines and
// their numbers. These protect that, and the limits that keep a large or
// binary file from being read as text.

const bytes = (text: string) => new TextEncoder().encode(text);

describe("decodeBytes", () => {
  it("reads UTF-8 and follows a byte order mark in auto", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(decodeBytes(utf16, "auto")).toMatchObject({
      text: "hi",
      encoding: "utf-16le",
      invalid: false,
    });
    expect(decodeBytes(bytes("é"), "auto").text).toBe("é");
  });

  it("reads one byte per character in a single-byte encoding", () => {
    expect(decodeBytes(new Uint8Array([0xe9]), "windows-1252").text).toBe("é");
  });

  it("says when the bytes do not fit the encoding", () => {
    expect(decodeBytes(new Uint8Array([0xe9]), "utf-8").invalid).toBe(true);
  });
});

describe("splitLines", () => {
  it("cuts on every kind of line break in auto", () => {
    expect(splitLines("a\r\nb\nc\rd", "auto")).toEqual(["a", "b", "c", "d"]);
  });

  it("makes no empty last line after a final line break", () => {
    expect(splitLines("a\nb\n", "lf")).toEqual(["a", "b"]);
    expect(splitLines("\n", "lf")).toEqual([""]);
  });

  it("keeps stray characters when the chosen break is not the file's", () => {
    expect(splitLines("a\r\nb\r\n", "lf")).toEqual(["a\r", "b\r"]);
    expect(splitLines("a\nb", "crlf")).toEqual(["a\nb"]);
  });
});

describe("detectLineBreak", () => {
  it("names the line break a text uses most", () => {
    expect(detectLineBreak("a\r\nb\r\nc\n")).toBe("crlf");
    expect(detectLineBreak("a\nb")).toBe("lf");
    expect(detectLineBreak("a\rb")).toBe("cr");
    expect(detectLineBreak("none")).toBe(undefined);
  });
});

describe("collectLines", () => {
  it("numbers lines from 1 in each file", () => {
    const result = collectLines(
      [
        { name: "a.yaml", bytes: bytes("x\ny") },
        { name: "b.yaml", bytes: bytes("z") },
      ],
      "auto",
      "auto"
    );
    expect(result.lines).toEqual([
      { file: "a.yaml", line: 1, text: "x" },
      { file: "a.yaml", line: 2, text: "y" },
      { file: "b.yaml", line: 1, text: "z" },
    ]);
  });

  it("skips a file that is too big, binary, or one too many", () => {
    const big = new Uint8Array(FILE_SEARCH_LIMITS.bytes + 1).fill(97);
    const many = Array.from(
      { length: FILE_SEARCH_LIMITS.files + 1 },
      (_, i) => ({
        name: `f${i}`,
        bytes: bytes("a"),
      })
    );
    expect(
      collectLines([{ name: "big", bytes: big }], "auto", "auto").skipped
    ).toEqual([{ name: "big", reason: "too_big" }]);
    expect(
      collectLines(
        [{ name: "bin", bytes: new Uint8Array([1, 0, 2]) }],
        "auto",
        "auto"
      ).skipped
    ).toEqual([{ name: "bin", reason: "binary" }]);
    expect(collectLines(many, "auto", "auto").skipped).toEqual([
      { name: `f${FILE_SEARCH_LIMITS.files}`, reason: "too_many_files" },
    ]);
  });

  it("reads zero bytes as text in a UTF-16 file", () => {
    const utf16 = new Uint8Array([0xff, 0xfe, 0x61, 0x00]);
    const result = collectLines([{ name: "w", bytes: utf16 }], "auto", "auto");
    expect(result.skipped).toEqual([]);
    expect(result.lines[0].text).toBe("a");
  });

  it("lists files whose bytes do not fit the encoding", () => {
    expect(
      collectLines(
        [{ name: "latin", bytes: new Uint8Array([0xe9]) }],
        "utf-8",
        "auto"
      ).invalid
    ).toEqual(["latin"]);
  });

  it("stops at the line limit and cuts long lines, and says so", () => {
    const long = collectLines(
      [
        {
          name: "l",
          bytes: bytes("x".repeat(FILE_SEARCH_LIMITS.lineLength + 5)),
        },
      ],
      "auto",
      "auto"
    );
    expect(long.lines[0].text.length).toBe(FILE_SEARCH_LIMITS.lineLength);
    expect(long.truncated).toBe(true);
    const many = collectLines(
      [
        {
          name: "m",
          bytes: bytes("a\n".repeat(FILE_SEARCH_LIMITS.lines + 3)),
        },
      ],
      "auto",
      "lf"
    );
    expect(many.lines.length).toBe(FILE_SEARCH_LIMITS.lines);
    expect(many.truncated).toBe(true);
  });
});
