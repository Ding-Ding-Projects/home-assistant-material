import { describe, expect, it } from "vitest";
import {
  parseDelimited,
  writeDelimited,
} from "../../../src/common/converter/delimited";
import {
  MAX_PIXELS,
  readImageSize,
} from "../../../src/common/converter/image-size";
import { convertStructured } from "../../../src/common/converter/structured";

// Protects the edge cases found in review: a lone empty cell, YAML written
// for Home Assistant, a negative zero, Markdown line breaks and pictures
// whose size is judged before decoding.

const text = (result: ReturnType<typeof convertStructured>) => {
  if (!result.ok || result.kind !== "text") {
    throw new Error(`not text: ${JSON.stringify(result)}`);
  }
  return result;
};

describe("a table with one column", () => {
  it("keeps an empty cell as a quoted empty value", () => {
    const rows = [["a"], [""], ["b"]];
    const written = writeDelimited(rows, ",");
    expect(written).toBe('a\n""\nb\n');
    expect(parseDelimited(written, ",")).toEqual({ ok: true, rows });
  });

  it("keeps empty values from JSON when they are written as CSV", () => {
    const out = text(
      convertStructured('[{"v":"x"},{"v":""},{"v":"y"}]', "json", "csv")
    );
    const back = text(convertStructured(out.text, "csv", "json"));
    expect(JSON.parse(back.text)).toEqual([{ v: "x" }, { v: "" }, { v: "y" }]);
  });
});

describe("YAML as Home Assistant writes it", () => {
  const merged = "base: &b {k: 1, j: 0}\nuse:\n  <<: *b\n  j: 9\n";

  it("merges <<  keys and says so", () => {
    const out = text(convertStructured(merged, "yaml", "json"));
    expect(JSON.parse(out.text).use).toEqual({ k: 1, j: 9 });
    expect(out.notes.map((n) => n.code)).toContain("yaml_merge_keys");
  });

  it("names a Home Assistant tag instead of a generic syntax error", () => {
    const result = convertStructured("password: !secret db\n", "yaml", "json");
    expect(result).toMatchObject({
      ok: false,
      error: { code: "yaml_custom_tag", detail: "!secret", line: 1 },
    });
    const include = convertStructured("a: !include b.yaml\n", "yaml", "json");
    expect(include).toMatchObject({
      ok: false,
      error: { code: "yaml_custom_tag", detail: "!include" },
    });
  });
});

describe("negative zero", () => {
  it("is reported when the target cannot keep it", () => {
    const out = text(convertStructured('{"a":-0}', "json", "csv"));
    expect(out.notes).toContainEqual({ code: "negative_zero", count: 1 });
    const json = text(convertStructured('{"a":-0}', "json", "json"));
    expect(json.notes).toContainEqual({ code: "negative_zero", count: 1 });
  });

  it("is not reported when nothing is lost", () => {
    const yaml = text(convertStructured('{"a":-0}', "json", "yaml"));
    expect(yaml.notes.map((n) => n.code)).not.toContain("negative_zero");
    const plain = text(convertStructured('{"a":0}', "json", "json"));
    expect(plain.notes.map((n) => n.code)).not.toContain("negative_zero");
  });
});

describe("Markdown line breaks", () => {
  it("reports a literal <br> turned into a line break", () => {
    const table = "| a |\n| --- |\n| x<br>y |\n";
    const out = text(convertStructured(table, "markdown", "json"));
    expect(JSON.parse(out.text)).toEqual([{ a: "x\ny" }]);
    expect(out.notes).toContainEqual({ code: "markdown_br_read", count: 1 });
  });
});

/** An AVIF-like file: a file type box and a meta box holding one ispe. */
const avif = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(64);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 16);
  bytes.set([0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66], 4);
  view.setUint32(24, 20);
  bytes.set([0x69, 0x73, 0x70, 0x65], 28);
  view.setUint32(36, width);
  view.setUint32(40, height);
  return bytes;
};

describe("picture size from the header", () => {
  it("reads the size of an AVIF picture", () => {
    expect(readImageSize(avif(1200, 800), "avif")).toEqual({
      width: 1200,
      height: 800,
    });
  });

  it("cannot read an AVIF picture that has no size box", () => {
    expect(readImageSize(new Uint8Array(64), "avif")).toBeUndefined();
  });

  it("caps pictures at 40 million pixels", () => {
    expect(MAX_PIXELS).toBe(40_000_000);
  });
});
