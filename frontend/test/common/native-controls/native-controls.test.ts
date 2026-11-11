import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { NATIVE_CONTROL_EXCEPTIONS } from "./native-controls-allowlist";

// Protects the rule that the interface uses the product's own controls and no
// plain browser form controls. A check that only looks at the files it knows
// cannot see a new one, so this walks the source. Hidden file inputs, which
// sit behind a button, are not form controls the person sees and are allowed.

const SRC = path.resolve(__dirname, "../../../src");

/** A native select. */
const SELECT = /<select[\s>]/;

/** A native input; "(?<input>" in a regular expression is not markup. */
const INPUT = /(?<!\?)<input[\s>]/g;

/** How far after `<input` its attributes are read. */
const WINDOW = 600;

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) {
      return walk(full);
    }
    return full.endsWith(".ts") ? [full] : [];
  });

const files = walk(SRC).map((full) => ({
  file: path.relative(SRC, full).split(path.sep).join("/"),
  source: readFileSync(full, "utf8"),
}));

/** True when the file renders a native input that is not a file chooser. */
const hasVisibleInput = (source: string): boolean => {
  for (const match of source.matchAll(INPUT)) {
    const attributes = source.slice(match.index, match.index + WINDOW);
    const tag = attributes.split(/\/>|><\/input>/)[0];
    if (!/type="file"/.test(tag)) {
      return true;
    }
  }
  return false;
};

const allowed = (element: "select" | "input") =>
  new Set(
    NATIVE_CONTROL_EXCEPTIONS.filter((item) => item.element === element).map(
      (item) => item.file
    )
  );

describe("native form controls", () => {
  it("renders no native select outside the allow-list", () => {
    const listed = allowed("select");
    expect(
      files
        .filter(({ file, source }) => SELECT.test(source) && !listed.has(file))
        .map(({ file }) => file)
    ).toEqual([]);
  });

  it("renders no visible native input outside the allow-list", () => {
    const listed = allowed("input");
    expect(
      files
        .filter(
          ({ file, source }) => hasVisibleInput(source) && !listed.has(file)
        )
        .map(({ file }) => file)
    ).toEqual([]);
  });

  it("lists no file that has lost its native control", () => {
    const stale = NATIVE_CONTROL_EXCEPTIONS.filter((item) => {
      if (item.pending) {
        return false;
      }
      const found = files.find(({ file }) => file === item.file);
      if (!found) {
        return true;
      }
      return item.element === "select"
        ? !SELECT.test(found.source)
        : !hasVisibleInput(found.source);
    });
    expect(stale).toEqual([]);
  });

  it("gives every exception a reason", () => {
    expect(
      NATIVE_CONTROL_EXCEPTIONS.filter((item) => item.reason.trim().length < 10)
    ).toEqual([]);
  });

  it("lists each file and element once", () => {
    const keys = NATIVE_CONTROL_EXCEPTIONS.map(
      (item) => `${item.file}#${item.element}`
    );
    expect(new Set(keys).size).toBe(keys.length);
  });
});
