import { CORE_SCHEMA, dump, load, mergeTag, Schema } from "js-yaml";
import type { DataFormat } from "./detect";
import { parseDelimited, writeDelimited } from "./delimited";
import { parseMarkdownTable, writeMarkdownTable } from "./markdown-table";
import type { ConvertNote, ConvertResult } from "./types";
import {
  failure,
  locate,
  MAX_DEPTH,
  MAX_NODES,
  MAX_OUTPUT_CHARACTERS,
  mergeNotes,
} from "./types";

/**
 * Structured text in one format written in another: JSON, YAML, CSV, TSV and
 * Markdown tables. Reading is strict and stops at the exact line and column.
 * What a conversion cannot keep is reported as notes, never dropped quietly.
 */

export interface StructuredOptions {
  /** JSON indentation: spaces, "tab", or 0 for one line. */
  indent: 0 | 2 | 4 | "tab";
  /** The first row of a CSV or TSV is the names of the columns. */
  header: boolean;
  /** Read numbers and true/false in tables instead of keeping all as text. */
  guessTypes: boolean;
  /** Put an apostrophe before text a spreadsheet would run as a formula. */
  protectFormulas: boolean;
}

export const DEFAULT_STRUCTURED_OPTIONS: StructuredOptions = {
  indent: 2,
  header: true,
  guessTypes: false,
  protectFormulas: true,
};

/** The core schema plus merge keys (<<), which Home Assistant YAML uses. */
const YAML_SCHEMA = new Schema([...CORE_SCHEMA.tags, mergeTag]);

type Value = unknown;
type Parsed =
  | { ok: true; value: Value; notes: ConvertNote[] }
  | Extract<ConvertResult, { ok: false }>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** First place in a JSON text that is nested deeper than allowed. */
export const jsonDepthLimit = (
  text: string,
  limit: number
): { line: number; column: number } | undefined => {
  let depth = 0;
  let inString = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (inString) {
      if (char === "\\") {
        index++;
      } else if (char === '"') {
        inString = false;
      }
    } else if (char === '"') {
      inString = true;
    } else if (char === "[" || char === "{") {
      depth++;
      if (depth > limit) {
        return locate(text, index);
      }
    } else if (char === "]" || char === "}") {
      depth--;
    }
  }
  return undefined;
};

/** Line and column of a JSON.parse failure, as far as the engine says. */
export const jsonErrorLocation = (
  message: string,
  text: string
): { line: number; column: number } | undefined => {
  const both = /line (\d+) column (\d+)/i.exec(message);
  if (both) {
    return { line: Number(both[1]), column: Number(both[2]) };
  }
  const position = /position (\d+)/i.exec(message);
  if (position) {
    return locate(text, Number(position[1]));
  }
  if (/end of (json )?(input|data)|unexpected end/i.test(message)) {
    return locate(text, text.length);
  }
  return undefined;
};

/**
 * Index of the first character that is not valid JSON, or -1. Engines differ
 * in whether they say where a JSON text goes wrong, so this finds it itself.
 * Nesting is already limited when it runs.
 */
export const findJsonError = (text: string): number => {
  let at = 0;
  const skip = () => {
    while (" \t\n\r".includes(text[at]) && at < text.length) {
      at++;
    }
  };
  const literal = (word: string): boolean => {
    if (text.startsWith(word, at)) {
      at += word.length;
      return true;
    }
    return false;
  };
  const string = (): boolean => {
    at++;
    while (at < text.length) {
      const char = text[at];
      if (char === '"') {
        at++;
        return true;
      }
      if (char < " ") {
        return false;
      }
      if (char === "\\") {
        const next = text[at + 1];
        if (next === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(text.slice(at + 2, at + 6))) {
            return false;
          }
          at += 6;
          continue;
        }
        if (!next || !'"\\/bfnrt'.includes(next)) {
          return false;
        }
        at += 2;
        continue;
      }
      at++;
    }
    return false;
  };
  const value = (): boolean => {
    skip();
    const char = text[at];
    if (char === '"') {
      return string();
    }
    if (char === "{") {
      at++;
      skip();
      if (text[at] === "}") {
        at++;
        return true;
      }
      for (;;) {
        skip();
        if (text[at] !== '"' || !string()) {
          return false;
        }
        skip();
        if (text[at] !== ":") {
          return false;
        }
        at++;
        if (!value()) {
          return false;
        }
        skip();
        if (text[at] === ",") {
          at++;
        } else if (text[at] === "}") {
          at++;
          return true;
        } else {
          return false;
        }
      }
    }
    if (char === "[") {
      at++;
      skip();
      if (text[at] === "]") {
        at++;
        return true;
      }
      for (;;) {
        if (!value()) {
          return false;
        }
        skip();
        if (text[at] === ",") {
          at++;
        } else if (text[at] === "]") {
          at++;
          return true;
        } else {
          return false;
        }
      }
    }
    if (literal("true") || literal("false") || literal("null")) {
      return true;
    }
    const number = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(
      text.slice(at)
    );
    if (number) {
      at += number[0].length;
      return true;
    }
    return false;
  };
  if (!value()) {
    return at;
  }
  skip();
  return at < text.length ? at : -1;
};

type Inspection =
  | { ok: true; unsafeNumbers: number; negativeZeros: number }
  | Extract<ConvertResult, { ok: false }>;

/**
 * Walks a value without recursion and refuses what would be unsafe to write:
 * nesting that is too deep (or loops back on itself), aliases that expand to
 * more values than allowed, and numbers a text format cannot hold. Counts the
 * whole numbers too large to be kept exactly.
 */
export const inspectValue = (value: Value): Inspection => {
  const stack: [Value, number][] = [[value, 1]];
  let nodes = 1;
  let unsafeNumbers = 0;
  let negativeZeros = 0;
  while (stack.length) {
    const [node, depth] = stack.pop()!;
    if (typeof node === "number") {
      if (!Number.isFinite(node)) {
        return failure("number_out_of_range");
      }
      if (Object.is(node, -0)) {
        negativeZeros++;
      }
      if (Number.isInteger(node) && Math.abs(node) > Number.MAX_SAFE_INTEGER) {
        unsafeNumbers++;
      }
      continue;
    }
    if (typeof node !== "object" || node === null) {
      continue;
    }
    if (depth > MAX_DEPTH) {
      return failure("too_deep");
    }
    const children = Array.isArray(node) ? node : Object.values(node);
    nodes += children.length;
    if (nodes > MAX_NODES) {
      return failure("too_large_expanded");
    }
    for (const child of children) {
      stack.push([child, depth + 1]);
    }
  }
  return { ok: true, unsafeNumbers, negativeZeros };
};

const NUMBER = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?$/;

/** A table cell as a value, when it can be read back exactly as written. */
const guessValue = (cell: string): unknown => {
  if (cell === "true") {
    return true;
  }
  if (cell === "false") {
    return false;
  }
  if (NUMBER.test(cell)) {
    const number = Number(cell);
    if (!Number.isFinite(number)) {
      return cell;
    }
    const whole = !/[.eE]/.test(cell);
    if (
      whole
        ? Math.abs(number) <= Number.MAX_SAFE_INTEGER
        : String(number) === cell
    ) {
      return number;
    }
  }
  return cell;
};

/** Rows of text as a value: objects when there is a header, else lists. */
const rowsToValue = (
  rows: string[][],
  header: boolean,
  guess: boolean,
  notes: ConvertNote[]
): { ok: true; value: Value } | Extract<ConvertResult, { ok: false }> => {
  const cell = (text: string) => (guess ? guessValue(text) : text);
  if (!header) {
    return { ok: true, value: rows.map((row) => row.map(cell)) };
  }
  if (rows.length === 0) {
    return { ok: true, value: [] };
  }
  const seen = new Map<string, number>();
  let fixed = 0;
  const names = rows[0].map((raw, index) => {
    let name = raw.trim() === "" ? `column ${index + 1}` : raw;
    if (name !== raw) {
      fixed++;
    }
    const times = (seen.get(name) ?? 0) + 1;
    seen.set(name, times);
    if (times > 1) {
      name = `${name} ${times}`;
      fixed++;
    }
    return name;
  });
  if (fixed) {
    notes.push({ code: "header_renamed", count: fixed });
  }
  let padded = 0;
  const objects: Record<string, unknown>[] = [];
  for (let index = 1; index < rows.length; index++) {
    const row = rows[index];
    if (row.length > names.length) {
      return failure("row_too_long", { row: index + 1 });
    }
    if (row.length < names.length) {
      padded++;
    }
    objects.push(
      Object.fromEntries(names.map((name, at) => [name, cell(row[at] ?? "")]))
    );
  }
  if (padded) {
    notes.push({ code: "rows_padded", count: padded });
  }
  return { ok: true, value: objects };
};

const parseValue = (
  text: string,
  from: DataFormat,
  options: StructuredOptions
): Parsed => {
  const notes: ConvertNote[] = [];
  if (text.trim() === "") {
    return failure("empty");
  }
  if (from === "json") {
    const deep = jsonDepthLimit(text, MAX_DEPTH);
    if (deep) {
      return failure("too_deep", deep);
    }
    try {
      return { ok: true, value: JSON.parse(text), notes };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const found = findJsonError(text);
      const place =
        jsonErrorLocation(message, text) ??
        (found === -1 ? undefined : locate(text, found));
      return place
        ? failure("json_syntax", { ...place, detail: message })
        : failure("json_syntax_unplaced", { detail: message });
    }
  }
  if (from === "yaml") {
    try {
      const value = load(text, { schema: YAML_SCHEMA });
      if (/(^|[\s:[,{-])#/m.test(text)) {
        notes.push({ code: "yaml_comments" });
      }
      if (/(^|[\s:[,{-])[&*][A-Za-z0-9_-]+/m.test(text)) {
        notes.push({ code: "yaml_aliases" });
      }
      if (/(^|[\s,{])<<\s*:/m.test(text)) {
        notes.push({ code: "yaml_merge_keys" });
      }
      return { ok: true, value, notes };
    } catch (err) {
      if (err instanceof RangeError) {
        return failure("too_deep");
      }
      const known = err as {
        reason?: string;
        mark?: { line?: number; column?: number };
      };
      const detail =
        known.reason ??
        (err instanceof Error ? err.message.split("\n")[0] : "");
      // Home Assistant tags such as !secret and !include need its own files.
      const tag = /unknown .*tag !<(![^>]*)>|unknown .*tag (![^\s]+)/i.exec(
        detail
      );
      if (tag) {
        return failure("yaml_custom_tag", {
          detail: tag[1] ?? tag[2],
          ...(typeof known.mark?.line === "number"
            ? {
                line: known.mark.line + 1,
                column: (known.mark.column ?? 0) + 1,
              }
            : {}),
        });
      }
      return typeof known.mark?.line === "number"
        ? failure("yaml_syntax", {
            line: known.mark.line + 1,
            column: (known.mark.column ?? 0) + 1,
            detail,
          })
        : failure("yaml_syntax_unplaced", { detail });
    }
  }
  let rows: string[][];
  let header = options.header;
  if (from === "markdown") {
    const parsed = parseMarkdownTable(text);
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    rows = parsed.rows;
    header = true;
    if (parsed.lineBreaksRead) {
      notes.push({ code: "markdown_br_read", count: parsed.lineBreaksRead });
    }
  } else {
    const parsed = parseDelimited(text, from === "tsv" ? "\t" : ",");
    if (!parsed.ok) {
      return { ok: false, error: parsed.error };
    }
    rows = parsed.rows;
  }
  const value = rowsToValue(rows, header, options.guessTypes, notes);
  if (!value.ok) {
    return value;
  }
  return { ok: true, value: value.value, notes };
};

const FORMULA_START = /^[=+\-@\t\r]/;

/** The value as a table: a header row, then a row for each record. */
const toTable = (
  value: Value,
  options: StructuredOptions,
  notes: ConvertNote[]
): string[][] | Extract<ConvertResult, { ok: false }> => {
  let nested = 0;
  let nulls = 0;
  let protectedCells = 0;
  const cell = (item: unknown): string => {
    if (item === null || item === undefined) {
      nulls++;
      return "";
    }
    if (typeof item === "string") {
      if (options.protectFormulas && FORMULA_START.test(item)) {
        protectedCells++;
        return `'${item}`;
      }
      return item;
    }
    if (typeof item === "object") {
      nested++;
      return JSON.stringify(item);
    }
    return String(item);
  };
  let rows: string[][];
  const items = Array.isArray(value)
    ? value
    : isPlainObject(value)
      ? [value]
      : undefined;
  if (!items) {
    return failure("not_tabular");
  }
  if (items.every(isPlainObject)) {
    const columns: string[] = [];
    const known = new Set<string>();
    for (const item of items as Record<string, unknown>[]) {
      for (const key of Object.keys(item)) {
        if (!known.has(key)) {
          known.add(key);
          columns.push(key);
        }
      }
    }
    rows = [
      columns.map((name) => cell(name)),
      ...(items as Record<string, unknown>[]).map((item) =>
        columns.map((name) =>
          Object.prototype.hasOwnProperty.call(item, name)
            ? cell(item[name])
            : ""
        )
      ),
    ];
  } else if (items.every(Array.isArray)) {
    notes.push({ code: "table_no_header" });
    rows = (items as unknown[][]).map((row) => row.map(cell));
  } else if (items.every((item) => typeof item !== "object" || item === null)) {
    rows = [["value"], ...items.map((item) => [cell(item)])];
  } else {
    return failure("not_tabular");
  }
  if (nested) {
    notes.push({ code: "nested_flattened", count: nested });
  }
  if (nulls) {
    notes.push({ code: "empty_for_null", count: nulls });
  }
  if (protectedCells) {
    notes.push({ code: "formulas_protected", count: protectedCells });
  }
  return rows;
};

/** Converts structured text from one format to another. */
export const convertStructured = (
  text: string,
  from: DataFormat,
  to: DataFormat,
  options: StructuredOptions = DEFAULT_STRUCTURED_OPTIONS
): ConvertResult => {
  const parsed = parseValue(text, from, options);
  if (!parsed.ok) {
    return parsed;
  }
  const inspected = inspectValue(parsed.value);
  if (!inspected.ok) {
    return inspected;
  }
  const notes = [...parsed.notes];
  if (inspected.unsafeNumbers) {
    notes.push({ code: "numbers_rounded", count: inspected.unsafeNumbers });
  }
  if (inspected.negativeZeros && to !== "yaml") {
    // Only YAML can write a negative zero; the other formats write plain 0.
    notes.push({ code: "negative_zero", count: inspected.negativeZeros });
  }
  const tabularSource = from === "csv" || from === "tsv" || from === "markdown";
  if (
    tabularSource &&
    !options.guessTypes &&
    (to === "json" || to === "yaml")
  ) {
    notes.push({ code: "table_all_text" });
  }
  let output: string;
  try {
    if (to === "json") {
      output = `${JSON.stringify(
        parsed.value,
        null,
        options.indent === "tab" ? "\t" : options.indent
      )}\n`;
    } else if (to === "yaml") {
      output = dump(parsed.value, { noRefs: true, lineWidth: -1 });
    } else {
      const rows = toTable(parsed.value, options, notes);
      if (!Array.isArray(rows)) {
        return rows;
      }
      if (to === "markdown") {
        const written = writeMarkdownTable(rows);
        output = written.text;
        if (written.lineBreaks) {
          notes.push({
            code: "line_breaks_in_cells",
            count: written.lineBreaks,
          });
        }
      } else {
        output = writeDelimited(rows, to === "tsv" ? "\t" : ",");
      }
    }
  } catch (err) {
    if (err instanceof RangeError) {
      return failure("too_deep");
    }
    return failure("write_failed", {
      detail: err instanceof Error ? err.message : String(err),
    });
  }
  if (output.length > MAX_OUTPUT_CHARACTERS) {
    return failure("output_too_large");
  }
  return { ok: true, kind: "text", text: output, notes: mergeNotes(notes) };
};
