import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  PATTERN_AWARE_FUNCTIONS,
  SEARCH_SURFACES,
} from "../../../src/common/regex/search-surfaces";

// Protects the rule that every search field offers the pattern workbench and
// that its list understands a regular expression. A check that only looks at
// the listed fields cannot see a missing one, so this walks the source.

const SRC = path.resolve(__dirname, "../../../src");

/** Markup that puts a search field on the screen. */
const FIELD = /<ha-input-search\b|type="search"|role="searchbox"/;

/** Files that define the field itself or only describe it. */
const NOT_A_SURFACE = new Set([
  "components/input/ha-input-search.ts",
  "components/input/ha-input.ts",
  "common/regex/search-surfaces.ts",
  // The workbench's own inputs edit a pattern; they do not filter a list.
  "components/regex/ha-regex-workbench.ts",
]);

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });

const read = (file: string) => readFileSync(path.join(SRC, file), "utf8");

const filesWithField = walk(SRC)
  .filter((full) => FIELD.test(readFileSync(full, "utf8")))
  .map((full) => path.relative(SRC, full).split(path.sep).join("/"))
  .filter((file) => !NOT_A_SURFACE.has(file))
  .sort();

describe("search surface catalogue", () => {
  const listed = SEARCH_SURFACES.map((surface) => surface.file).sort();

  it("lists every file that renders a search field", () => {
    expect(filesWithField.filter((file) => !listed.includes(file))).toEqual([]);
  });

  it("lists no file that has lost its search field", () => {
    expect(listed.filter((file) => !filesWithField.includes(file))).toEqual([]);
  });

  it("lists each file once", () => {
    expect(new Set(listed).size).toBe(listed.length);
  });

  it.each(SEARCH_SURFACES)(
    "$file reaches a pattern-aware function",
    (surface) => {
      const source = read(surface.matcher ?? surface.file);
      expect(
        PATTERN_AWARE_FUNCTIONS.some((name) => source.includes(`${name}(`))
      ).toBe(true);
    }
  );

  it.each(SEARCH_SURFACES.filter((surface) => surface.external))(
    "$file leaves the workbench button off its external search",
    (surface) => {
      expect(read(surface.file)).toContain("no-pattern-builder");
    }
  );

  it("uses the shared search field, not a hand-made input", () => {
    const handMade = filesWithField.filter(
      (file) => !/<ha-input-search\b/.test(read(file))
    );
    expect(handMade).toEqual([]);
  });
});
