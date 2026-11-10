import { describe, expect, it } from "vitest";
import {
  bytesToText,
  decodeBase64,
  encodeBase64,
  fromDataUrl,
  sameBytes,
  textToBytes,
  toDataUrl,
} from "../../../src/common/base64/base64";

// Protects the Base64 toolkit: the text it writes is what other software
// reads, and strict decoding must stop where the text is wrong.

const bytes = (text: string) => new TextEncoder().encode(text);
const plain = { variant: "standard", padding: true, lineLength: 0 } as const;

describe("encodeBase64", () => {
  it.each([
    ["", ""],
    ["f", "Zg=="],
    ["fo", "Zm8="],
    ["foo", "Zm9v"],
    ["foob", "Zm9vYg=="],
    ["fooba", "Zm9vYmE="],
    ["foobar", "Zm9vYmFy"],
  ])("encodes %j as the published vectors say", (input, expected) => {
    expect(encodeBase64(bytes(input), plain)).toBe(expected);
  });

  it("matches the platform for every byte value", () => {
    const all = Uint8Array.from({ length: 256 }, (_value, index) => index);
    expect(encodeBase64(all, plain)).toBe(btoa(String.fromCharCode(...all)));
  });

  it("uses - and _ in the URL-safe alphabet and can leave padding out", () => {
    const input = new Uint8Array([0xfb, 0xff, 0xfe]);
    expect(encodeBase64(input, plain)).toBe("+//+");
    expect(
      encodeBase64(input, { variant: "url", padding: false, lineLength: 0 })
    ).toBe("-__-");
    expect(
      encodeBase64(bytes("f"), {
        variant: "url",
        padding: false,
        lineLength: 0,
      })
    ).toBe("Zg");
  });

  it("breaks MIME into lines of 76 with CRLF, always padded", () => {
    const text = encodeBase64(new Uint8Array(100), {
      variant: "mime",
      padding: false,
      lineLength: 0,
    });
    const lines = text.split("\r\n");
    expect(lines[0]).toHaveLength(76);
    expect(text.endsWith("=")).toBe(true);
  });

  it("breaks other text at the chosen length with a line feed", () => {
    const text = encodeBase64(new Uint8Array(100), {
      ...plain,
      lineLength: 64,
    });
    expect(text.split("\n")[0]).toHaveLength(64);
    expect(text).not.toContain("\r");
  });
});

describe("decodeBase64", () => {
  it("reads back what was written, with line breaks", () => {
    const input = Uint8Array.from(
      { length: 300 },
      (_value, index) => index % 256
    );
    const text = encodeBase64(input, {
      variant: "mime",
      padding: true,
      lineLength: 0,
    });
    const result = decodeBase64(text, "mime", true);
    expect(result.ok && sameBytes(result.bytes, input)).toBe(true);
  });

  it("strict decoding stops at a character outside the alphabet", () => {
    expect(decodeBase64("Zm9v%YmFy", "standard", true)).toEqual({
      ok: false,
      position: 5,
      character: "%",
      reason: "alphabet",
    });
    expect(decodeBase64("-__-", "standard", true)).toMatchObject({
      ok: false,
      character: "-",
    });
  });

  it("strict decoding refuses data after padding and impossible lengths", () => {
    expect(decodeBase64("Zg==Zg==", "standard", true)).toMatchObject({
      ok: false,
      reason: "padding",
    });
    expect(decodeBase64("Zm9vY", "standard", true)).toMatchObject({
      ok: false,
      reason: "length",
    });
  });

  it("lenient decoding skips what does not belong and reads both alphabets", () => {
    const result = decodeBase64("Zm9v%YmFy", "standard", false);
    expect(result).toMatchObject({ ok: true, skipped: 1 });
    expect(result.ok && bytesToText(result.bytes, "utf-8")).toBe("foobar");
    const mixed = decodeBase64("-__-", "standard", false);
    expect(mixed.ok && Array.from(mixed.bytes)).toEqual([0xfb, 0xff, 0xfe]);
  });

  it("reads text without padding", () => {
    const result = decodeBase64("Zm9vYg", "standard", true);
    expect(result.ok && bytesToText(result.bytes, "utf-8")).toBe("foob");
  });
});

describe("text and data URLs", () => {
  it("says when bytes are not text", () => {
    expect(bytesToText(new Uint8Array([0xff, 0xfe]), "utf-8")).toBeUndefined();
    expect(bytesToText(new Uint8Array([0xe9]), "latin1")).toBe("é");
  });

  it("refuses Latin-1 for a character it does not have", () => {
    expect(textToBytes("é", "latin1")).toEqual(new Uint8Array([0xe9]));
    expect(textToBytes("世", "latin1")).toBeUndefined();
  });

  it("writes and reads a data URL", () => {
    const url = toDataUrl(bytes("hi"), "text/plain");
    expect(url).toBe("data:text/plain;base64,aGk=");
    const read = fromDataUrl(url);
    expect(read?.mime).toBe("text/plain");
    expect(read?.result.ok && bytesToText(read.result.bytes, "utf-8")).toBe(
      "hi"
    );
    expect(fromDataUrl("https://example.com")).toBeUndefined();
  });
});
