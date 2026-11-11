import { describe, expect, it } from "vitest";
import {
  DEFAULT_TRANSFORM_OPTIONS,
  transformBytes,
} from "../../../src/common/converter/encodings";
import type { TextTransform } from "../../../src/common/converter/encodings";
import {
  decodeUtf8Strict,
  encodeUtf8,
} from "../../../src/common/converter/utf8";
import {
  detectDataFormat,
  sniffContents,
} from "../../../src/common/converter/detect";
import {
  fitSize,
  readImageSize,
} from "../../../src/common/converter/image-size";
import { outputFileName } from "../../../src/common/converter/output-name";
import { addHistory } from "../../../src/common/converter/history";
import type { HistoryEntry } from "../../../src/common/converter/history";
import { targetsFor } from "../../../src/common/converter/formats";

// Protects the encodings, the reading of file contents and the small rules
// the page relies on: names, limits, sizes and what is offered for a file.

const run = (kind: TextTransform, input: string | Uint8Array, opts = {}) =>
  transformBytes(kind, typeof input === "string" ? encodeUtf8(input) : input, {
    ...DEFAULT_TRANSFORM_OPTIONS,
    ...opts,
  });
const textOf = (result: ReturnType<typeof run>) => {
  if (!result.ok || result.kind !== "text") {
    throw new Error(JSON.stringify(result));
  }
  return result.text;
};

describe("strict UTF-8", () => {
  it("accepts text, strips a BOM and says where invalid bytes are", () => {
    expect(decodeUtf8Strict(encodeUtf8("héllo ✓ 😀"))).toMatchObject({
      ok: true,
    });
    expect(decodeUtf8Strict(new Uint8Array([0xef, 0xbb, 0xbf, 0x61]))).toEqual({
      ok: true,
      text: "a",
      bom: true,
    });
    expect(decodeUtf8Strict(new Uint8Array([0x61, 0x62, 0xff]))).toEqual({
      ok: false,
      offset: 3,
    });
  });

  it("refuses overlong forms, surrogates and cut sequences", () => {
    for (const bytes of [
      [0xc0, 0x80],
      [0xed, 0xa0, 0x80],
      [0xe2, 0x82],
      [0xf4, 0x90, 0x80, 0x80],
    ]) {
      expect(decodeUtf8Strict(new Uint8Array(bytes)).ok).toBe(false);
    }
  });
});

describe("encodings", () => {
  it("round trips Base64, hex and URL encoding", () => {
    const sample = "héllo wörld ✓ 😀 &=?/";
    for (const [to, from] of [
      ["base64", "base64-decode"],
      ["hex", "hex-decode"],
      ["url-encode", "url-decode"],
    ] as const) {
      expect(textOf(run(from, textOf(run(to, sample))))).toBe(sample);
    }
  });

  it("writes known values", () => {
    expect(textOf(run("base64", "hi?>"))).toBe("aGk/Pg==");
    expect(textOf(run("base64", "hi?>", { urlSafe: true }))).toBe("aGk_Pg");
    expect(textOf(run("hex", "Hi"))).toBe("48 69");
    expect(textOf(run("hex", "Hi", { hexSpaced: false }))).toBe("4869");
    expect(textOf(run("url-encode", "a b&c"))).toBe("a%20b%26c");
  });

  it("reads Base64 in either alphabet and a data URL", () => {
    expect(textOf(run("base64-decode", "aGk_Pg"))).toBe("hi?>");
    expect(textOf(run("base64-decode", "data:text/plain;base64,aGk="))).toBe(
      "hi"
    );
  });

  it("says where Base64, hex and URL text goes wrong", () => {
    expect(run("base64-decode", "aGk*")).toMatchObject({
      ok: false,
      error: { code: "base64_alphabet", position: 4, character: "*" },
    });
    expect(run("hex-decode", "48 6g")).toMatchObject({
      ok: false,
      error: { code: "hex_character", position: 5 },
    });
    expect(run("hex-decode", "486")).toMatchObject({
      ok: false,
      error: { code: "hex_length" },
    });
    expect(run("url-decode", "a%2")).toMatchObject({
      ok: false,
      error: { code: "url_bad_percent", position: 2 },
    });
    expect(run("url-decode", "%ff")).toMatchObject({
      ok: false,
      error: { code: "url_bad_utf8" },
    });
  });

  it("reads hex with prefixes and commas, and returns a file when not text", () => {
    expect(textOf(run("hex-decode", "0x48, 0x69"))).toBe("Hi");
    const binary = run("hex-decode", "ff fe");
    expect(binary).toMatchObject({ ok: true, kind: "bytes" });
  });

  it("refuses text that is not valid UTF-8 for text transforms, with the byte", () => {
    expect(run("upper", new Uint8Array([0x61, 0xff]))).toMatchObject({
      ok: false,
      error: { code: "invalid_utf8", position: 2 },
    });
    // Base64 and hex work on any bytes.
    expect(textOf(run("hex", new Uint8Array([0xff])))).toBe("ff");
  });

  it("changes line endings and reports mixed ones", () => {
    expect(textOf(run("crlf", "a\nb\r\nc\rd"))).toBe("a\r\nb\r\nc\r\nd");
    expect(textOf(run("lf", "a\r\nb\rc"))).toBe("a\nb\nc");
    expect(textOf(run("cr", "a\nb"))).toBe("a\rb");
    expect(run("lf", "a\r\nb\n")).toMatchObject({
      notes: [{ code: "mixed_endings" }],
    });
    expect(run("lf", "a\nb\n")).toMatchObject({ notes: [] });
  });

  it("changes case", () => {
    expect(textOf(run("upper", "straße"))).toBe("STRASSE");
    expect(textOf(run("lower", "ÀB"))).toBe("àb");
    expect(textOf(run("title", "the quick brown fox"))).toBe(
      "The Quick Brown Fox"
    );
    expect(textOf(run("camel", "Hello big-world_foo"))).toBe(
      "helloBigWorldFoo"
    );
    expect(textOf(run("snake", "helloBigWorld XMLHttp"))).toBe(
      "hello_big_world_xml_http"
    );
    expect(textOf(run("kebab", "one two\nThree Four"))).toBe(
      "one-two\nthree-four"
    );
  });
});

describe("file contents", () => {
  const bytes = (text: string) =>
    new Uint8Array([...text].map((c) => c.charCodeAt(0)));

  it("tells files apart by contents, not by name", () => {
    expect(
      sniffContents(
        new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
      )
    ).toBe("png");
    expect(sniffContents(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "jpeg"
    );
    expect(sniffContents(bytes("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
    expect(sniffContents(bytes("\0\0\0\x18ftypheic"))).toBe("heic");
    expect(sniffContents(bytes("%PDF-1.7"))).toBe("pdf");
    expect(sniffContents(bytes("hello, world"))).toBe("text");
    expect(sniffContents(new Uint8Array([1, 0, 2]))).toBe("binary");
  });

  it("recognises SVG, which is refused because it can carry script", () => {
    expect(
      sniffContents(
        bytes('<?xml version="1.0"?>\n<svg xmlns="x"><script/></svg>')
      )
    ).toBe("svg");
    expect(sniffContents(bytes("<svg>"))).toBe("svg");
  });

  it("guesses the format of a text", () => {
    expect(detectDataFormat("a.json", "")).toBe("json");
    expect(detectDataFormat("a.yml", "")).toBe("yaml");
    expect(detectDataFormat("", '{"a":1}')).toBe("json");
    expect(detectDataFormat("", "| a | b |\n| - | - |\n")).toBe("markdown");
    expect(detectDataFormat("", "a\tb\n1\t2")).toBe("tsv");
    expect(detectDataFormat("", "name: x\nsize: 2")).toBe("yaml");
    expect(detectDataFormat("", "a,b\n1,2")).toBe("csv");
    expect(detectDataFormat("", "hello")).toBeUndefined();
  });

  it("offers what fits the input", () => {
    expect(targetsFor("image")).toEqual([
      "png",
      "jpeg",
      "webp",
      "base64",
      "hex",
    ]);
    expect(targetsFor("binary")).toEqual(["base64", "hex"]);
    expect(targetsFor("text")).toContain("yaml");
    expect(targetsFor("text")).not.toContain("png");
  });
});

describe("pictures", () => {
  it("reads sizes from headers", () => {
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47]);
    png.set([0, 0, 0x0f, 0xc0], 16);
    png.set([0, 0, 0x0b, 0xd0], 20);
    expect(readImageSize(png, "png")).toEqual({ width: 4032, height: 3024 });
    // A JPEG whose first segment is not the frame header.
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0x0b, 0xd0,
      0x0f, 0xc0, 3,
    ]);
    expect(readImageSize(jpeg, "jpeg")).toEqual({ width: 4032, height: 3024 });
    expect(readImageSize(new Uint8Array(3), "png")).toBeUndefined();
  });

  it("makes a picture smaller and never larger", () => {
    expect(fitSize(4000, 3000, { mode: "keep" })).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(fitSize(4000, 3000, { mode: "scale", factor: 0.5 })).toEqual({
      width: 2000,
      height: 1500,
    });
    expect(fitSize(4000, 3000, { mode: "scale", factor: 2 })).toEqual({
      width: 4000,
      height: 3000,
    });
    expect(fitSize(4000, 3000, { mode: "fit", longest: 1000 })).toEqual({
      width: 1000,
      height: 750,
    });
    expect(fitSize(800, 600, { mode: "fit", longest: 1000 })).toEqual({
      width: 800,
      height: 600,
    });
    expect(fitSize(1, 9000, { mode: "fit", longest: 100 })).toEqual({
      width: 1,
      height: 100,
    });
  });
});

describe("names and history", () => {
  it("names the converted file", () => {
    expect(outputFileName("porch camera.heic", "jpeg")).toBe(
      "porch camera.jpg"
    );
    expect(outputFileName("data.csv", "json")).toBe("data.json");
    expect(outputFileName("notes.txt", "crlf")).toBe("notes.txt");
    expect(outputFileName("photo.png", "base64")).toBe("photo.base64.txt");
    expect(outputFileName("photo.png.base64.txt", "base64-decode", false)).toBe(
      "photo.png"
    );
    expect(outputFileName("blob.hex.txt", "hex-decode", false)).toBe(
      "blob.bin"
    );
    expect(outputFileName("../../x:y*.json", "yaml")).toBe("x_y_.yaml");
    expect(outputFileName("", "png")).toBe("converted.png");
  });

  const entry = (id: number, bytes: number): HistoryEntry => ({
    id,
    name: `f${id}`,
    source: "s",
    target: "json",
    inputBytes: 1,
    outputBytes: bytes,
    at: id,
    blob: new Blob(),
  });

  it("keeps the newest, within a count and a size", () => {
    let list: HistoryEntry[] = [];
    for (let id = 1; id <= 5; id++) {
      list = addHistory(list, entry(id, 10), 3, 1000);
    }
    expect(list.map((e) => e.id)).toEqual([5, 4, 3]);
    list = addHistory(list, entry(6, 25), 10, 40);
    expect(list.map((e) => e.id)).toEqual([6, 5]);
    expect(addHistory([], entry(7, 999), 10, 30).map((e) => e.id)).toEqual([7]);
  });
});
