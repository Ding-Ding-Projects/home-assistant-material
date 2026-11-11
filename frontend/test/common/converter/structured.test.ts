import { describe, expect, it } from "vitest";
import {
  parseDelimited,
  writeDelimited,
} from "../../../src/common/converter/delimited";
import {
  convertStructured,
  DEFAULT_STRUCTURED_OPTIONS,
  jsonDepthLimit,
  jsonErrorLocation,
} from "../../../src/common/converter/structured";
import {
  parseMarkdownTable,
  writeMarkdownTable,
} from "../../../src/common/converter/markdown-table";

// Protects the structured conversions: what is written must read back as the
// same data, hostile input must be refused with a place, and whatever a
// format cannot keep must be reported.

const options = DEFAULT_STRUCTURED_OPTIONS;
const text = (result: ReturnType<typeof convertStructured>) => {
  if (!result.ok || result.kind !== "text") {
    throw new Error(`not text: ${JSON.stringify(result)}`);
  }
  return result;
};

describe("delimited text", () => {
  it("reads quotes, doubled quotes, separators and line breaks in fields", () => {
    const parsed = parseDelimited(
      'a,"b,1","say ""hi""","l1\nl2"\r\nx,y,z,w\n',
      ","
    );
    expect(parsed).toEqual({
      ok: true,
      rows: [
        ["a", "b,1", 'say "hi"', "l1\nl2"],
        ["x", "y", "z", "w"],
      ],
    });
  });

  it("skips empty lines but keeps a quoted empty field", () => {
    const parsed = parseDelimited('a\n\n""\n', ",");
    expect(parsed).toEqual({ ok: true, rows: [["a"], [""]] });
  });

  it("says where an unterminated quote started", () => {
    expect(parseDelimited('a,b\nc,"d\ne', ",")).toEqual({
      ok: false,
      error: { code: "csv_unterminated", line: 2, column: 3 },
    });
  });

  it("refuses a quote in the middle of a field and text after a quote", () => {
    expect(parseDelimited('ab"c', ",")).toMatchObject({
      ok: false,
      error: { code: "csv_stray_quote", line: 1, column: 3 },
    });
    expect(parseDelimited('"ab"c', ",")).toMatchObject({
      ok: false,
      error: { code: "csv_after_quote", line: 1, column: 5 },
    });
  });

  it("writes what it reads", () => {
    const rows = [
      ["a", 'q"uote', "x,y", "two\nlines"],
      ["", " ", "\t", "end"],
    ];
    const written = writeDelimited(rows, ",");
    expect(parseDelimited(written, ",")).toEqual({ ok: true, rows });
    const tabbed = writeDelimited(rows, "\t");
    expect(parseDelimited(tabbed, "\t")).toEqual({ ok: true, rows });
  });
});

describe("Markdown tables", () => {
  it("round trips pipes and line breaks in cells", () => {
    const rows = [
      ["name", "note"],
      ["a|b", "l1\nl2"],
    ];
    const written = writeMarkdownTable(rows);
    expect(written.lineBreaks).toBe(1);
    expect(parseMarkdownTable(written.text)).toEqual({ ok: true, rows });
  });

  it("needs a separator line", () => {
    expect(parseMarkdownTable("| a | b |\n| 1 | 2 |")).toEqual({
      ok: false,
      error: { code: "markdown_no_separator", line: 2 },
    });
  });
});

describe("JSON", () => {
  it("places a syntax error", () => {
    const result = convertStructured(
      '{\n  "a": 1,\n  "b": }',
      "json",
      "yaml",
      options
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("json_syntax");
      expect(result.error.line).toBe(3);
    }
  });

  it("refuses nesting that is too deep before parsing it", () => {
    const deep = "[".repeat(5000) + "]".repeat(5000);
    expect(jsonDepthLimit(deep, 256)).toEqual({ line: 1, column: 257 });
    const result = convertStructured(deep, "json", "yaml", options);
    expect(result).toMatchObject({ ok: false, error: { code: "too_deep" } });
  });

  it("does not count brackets inside strings as nesting", () => {
    expect(jsonDepthLimit('{"a":"[[[[[[[[\\"[["}', 3)).toBeUndefined();
  });

  it("reports whole numbers that cannot be kept exactly", () => {
    const result = text(
      convertStructured('{"id": 12345678901234567890}', "json", "yaml", options)
    );
    expect(result.notes).toContainEqual({ code: "numbers_rounded", count: 1 });
  });

  it("refuses a number that is not finite", () => {
    expect(convertStructured("[1e999]", "json", "yaml", options)).toMatchObject(
      {
        ok: false,
        error: { code: "number_out_of_range" },
      }
    );
  });

  it("keeps a key named __proto__ as data", () => {
    const result = text(
      convertStructured('{"__proto__": {"x": 1}}', "json", "json", {
        ...options,
        indent: 0,
      })
    );
    expect(result.text.trim()).toBe('{"__proto__":{"x":1}}');
  });

  it("finds a place from engine messages", () => {
    expect(
      jsonErrorLocation("Unexpected token } in JSON at position 4", "a\nbcd}")
    ).toEqual({
      line: 2,
      column: 3,
    });
    expect(
      jsonErrorLocation("x at line 3 column 9 of the JSON data", "")
    ).toEqual({
      line: 3,
      column: 9,
    });
    expect(jsonErrorLocation("something else", "")).toBeUndefined();
  });
});

describe("YAML", () => {
  it("reads and writes data", () => {
    const yaml = "name: Porch\nsize: [1, 2]\nnested:\n  ok: true\n";
    const json = text(convertStructured(yaml, "yaml", "json", options)).text;
    expect(JSON.parse(json)).toEqual({
      name: "Porch",
      size: [1, 2],
      nested: { ok: true },
    });
    const back = text(convertStructured(json, "json", "yaml", options)).text;
    expect(back).toBe(
      "name: Porch\nsize:\n  - 1\n  - 2\nnested:\n  ok: true\n"
    );
  });

  it("writes aliases out in full and says so", () => {
    const result = text(
      convertStructured("a: &x [1, 2]\nb: *x # same\n", "yaml", "json", options)
    );
    expect(JSON.parse(result.text)).toEqual({ a: [1, 2], b: [1, 2] });
    expect(result.notes.map((n) => n.code)).toEqual(
      expect.arrayContaining(["yaml_aliases", "yaml_comments"])
    );
  });

  it("refuses an alias bomb", () => {
    let yaml = "a0: &a0 [x, x, x, x, x, x, x, x, x, x]\n";
    for (let i = 1; i <= 8; i++) {
      const prev = `*a${i - 1}`;
      yaml += `a${i}: &a${i} [${Array(10).fill(prev).join(", ")}]\n`;
    }
    const result = convertStructured(yaml, "yaml", "json", options);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "too_large_expanded" },
    });
  });

  it("refuses an anchor that contains itself", () => {
    expect(
      convertStructured("a: &a [*a]", "yaml", "json", options)
    ).toMatchObject({
      ok: false,
      error: { code: "too_deep" },
    });
  });

  it("places a syntax error", () => {
    const result = convertStructured("a: [1\nb: 2", "yaml", "json", options);
    expect(result).toMatchObject({ ok: false, error: { code: "yaml_syntax" } });
    if (!result.ok) {
      expect(result.error.line).toBeGreaterThan(0);
      expect(result.error.column).toBeGreaterThan(0);
    }
  });

  it("refuses several documents", () => {
    expect(
      convertStructured("a: 1\n---\nb: 2", "yaml", "json", options).ok
    ).toBe(false);
  });
});

describe("tables", () => {
  const records = [
    { name: "Ada", age: 36, admin: true },
    { name: "Bob, Jr.", age: 41, admin: false },
  ];
  const json = JSON.stringify(records);

  it("JSON to CSV and back keeps the data when types are read", () => {
    const csv = text(convertStructured(json, "json", "csv", options)).text;
    expect(csv).toBe('name,age,admin\nAda,36,true\n"Bob, Jr.",41,false\n');
    const back = text(
      convertStructured(csv, "csv", "json", { ...options, guessTypes: true })
    ).text;
    expect(JSON.parse(back)).toEqual(records);
  });

  it("keeps everything as text unless asked, and says so", () => {
    const result = text(
      convertStructured("a,b\n1,true\n", "csv", "json", options)
    );
    expect(JSON.parse(result.text)).toEqual([{ a: "1", b: "true" }]);
    expect(result.notes).toContainEqual({ code: "table_all_text" });
  });

  it("does not turn 007 or a huge number into a number", () => {
    const result = text(
      convertStructured("a,b\n007,12345678901234567890\n", "csv", "json", {
        ...options,
        guessTypes: true,
      })
    );
    expect(JSON.parse(result.text)).toEqual([
      { a: "007", b: "12345678901234567890" },
    ]);
  });

  it("round trips Markdown, TSV and YAML", () => {
    const md = text(convertStructured(json, "json", "markdown", options)).text;
    const fromMd = text(
      convertStructured(md, "markdown", "json", {
        ...options,
        guessTypes: true,
      })
    ).text;
    expect(JSON.parse(fromMd)).toEqual(records);
    const tsv = text(convertStructured(json, "json", "tsv", options)).text;
    expect(tsv.split("\n")[0]).toBe("name\tage\tadmin");
    const yaml = text(convertStructured(tsv, "tsv", "yaml", options)).text;
    expect(yaml.startsWith("- name: Ada")).toBe(true);
  });

  it("reports nested data and nulls that a table cannot hold", () => {
    const result = text(
      convertStructured(
        '[{"a":{"b":1},"c":null,"d":[1,2]}]',
        "json",
        "csv",
        options
      )
    );
    expect(result.text).toBe('a,c,d\n"{""b"":1}",,"[1,2]"\n');
    expect(result.notes).toEqual(
      expect.arrayContaining([
        { code: "nested_flattened", count: 2 },
        { code: "empty_for_null", count: 1 },
      ])
    );
  });

  it("puts an apostrophe before text a spreadsheet would run", () => {
    const hostile =
      '[{"a":"=HYPERLINK(\\"http://x\\")","b":"-5","c":-5,"d":"@SUM(1)","e":"+1","f":"\\tx"}]';
    const result = text(convertStructured(hostile, "json", "csv", options));
    const rows = parseDelimited(result.text, ",");
    expect(rows.ok && rows.rows[1]).toEqual([
      '\'=HYPERLINK("http://x")',
      "'-5",
      "-5",
      "'@SUM(1)",
      "'+1",
      "'\tx",
    ]);
    expect(result.notes).toContainEqual({
      code: "formulas_protected",
      count: 5,
    });
    const raw = text(
      convertStructured(hostile, "json", "csv", {
        ...options,
        protectFormulas: false,
      })
    );
    expect(raw.text).toContain("=HYPERLINK");
    expect(raw.text).not.toContain("'=");
  });

  it("renames empty and repeated headers and pads short rows", () => {
    const result = text(convertStructured("a,,a\n1\n", "csv", "json", options));
    expect(JSON.parse(result.text)).toEqual([
      { a: "1", "column 2": "", "a 2": "" },
    ]);
    expect(result.notes.map((n) => n.code)).toEqual(
      expect.arrayContaining(["header_renamed", "rows_padded"])
    );
  });

  it("refuses a row longer than the header, naming it", () => {
    expect(
      convertStructured("a,b\n1,2,3\n", "csv", "json", options)
    ).toMatchObject({
      ok: false,
      error: { code: "row_too_long", row: 2 },
    });
  });

  it("reads without a header", () => {
    const result = text(
      convertStructured("1,2\n3,4\n", "csv", "json", {
        ...options,
        header: false,
        guessTypes: true,
        indent: 0,
      })
    );
    expect(result.text.trim()).toBe("[[1,2],[3,4]]");
  });

  it("refuses data that is not a table", () => {
    expect(convertStructured('"text"', "json", "csv", options)).toMatchObject({
      ok: false,
      error: { code: "not_tabular" },
    });
  });

  it("refuses empty input", () => {
    expect(convertStructured("  \n", "json", "yaml", options)).toMatchObject({
      ok: false,
      error: { code: "empty" },
    });
  });
});
