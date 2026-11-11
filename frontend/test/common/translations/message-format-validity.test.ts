import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { IntlMessageFormat } from "intl-messageformat";
import { describe, expect, it } from "vitest";

// The interface formats every string with IntlMessageFormat (see
// common/translations/localize.ts). A string that cannot be parsed, for
// example one with a bare `{ }`, `$<name>` or `\p{...}`, shows up as
// "Translation error: ..." in the interface. Nothing else notices, so this
// test parses every string of the English file and of the own Cantonese file.

const flatten = (
  value: unknown,
  prefix: string,
  out: Record<string, string>
): Record<string, string> => {
  if (typeof value === "string") {
    out[prefix] = value;
  } else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      flatten(child, prefix ? `${prefix}.${key}` : key, out);
    }
  }
  return out;
};

const load = (file: string) =>
  flatten(
    JSON.parse(
      readFileSync(
        resolve(__dirname, "../../../src/translations", file),
        "utf8"
      )
    ),
    "",
    {}
  );

const failures = (language: string, strings: Record<string, string>) => {
  const bad: string[] = [];
  for (const [key, text] of Object.entries(strings)) {
    try {
      new IntlMessageFormat(text, language);
    } catch (err: any) {
      bad.push(`${key}: ${err.message}`);
    }
  }
  return bad;
};

describe("translation strings can be formatted", () => {
  it("every string in en.json parses as an ICU message", () => {
    expect(failures("en", load("en.json"))).toEqual([]);
  });

  it("every string in yue-own.json parses as an ICU message", () => {
    expect(failures("zh-Hant", load("yue-own.json"))).toEqual([]);
  });
});
