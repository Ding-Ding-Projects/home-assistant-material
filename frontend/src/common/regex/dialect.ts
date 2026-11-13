import type { UnsupportedReason } from "./explain";
import { tokenizeRegex } from "./explain";

/**
 * Brings a pattern written for another flavour into JavaScript, so it can be
 * tested here. The workbench's code tab goes the other way, from JavaScript
 * out to Python, PCRE and others.
 *
 * It is a rewrite of syntax, not a proof of equal behaviour. A construct that
 * JavaScript has no spelling for is kept as written, so the engine rejects it
 * with its own message, and it is listed in `unsupported` with the reason.
 */

export type SourceDialect = "javascript" | "python" | "pcre";

export const SOURCE_DIALECTS: SourceDialect[] = [
  "javascript",
  "python",
  "pcre",
];

export type ImportNote =
  /** A flag letter that has no JavaScript flag, or flags placed mid-pattern. */
  | "flag_ignored"
  | "inline_flags_middle"
  /** `\Z` in PCRE also matches before a final newline; the copy does too. */
  | "end_with_newline";

export interface ImportResult {
  pattern: string;
  flags: string;
  notes: ImportNote[];
  /** Constructs JavaScript cannot express, kept as written. */
  unsupported: UnsupportedReason[];
}

/** Where the absolute start and end of the text are, whatever the flags. */
const TEXT_START = "(?<![\\s\\S])";
const TEXT_END = "(?![\\s\\S])";
const TEXT_END_NEWLINE = "(?=\\n?(?![\\s\\S]))";
const NEWLINE = "(?:\\r\\n|[\\n\\r])";

const FLAG_LETTERS: Record<string, string> = { i: "i", m: "m", s: "s" };

const KEPT_AS_WRITTEN = new Set<UnsupportedReason>([
  "possessive",
  "atomic",
  "conditional",
  "subroutine",
  "posix_class",
  "keep_out",
  "property_needs_flag",
]);

export const importPattern = (
  source: string,
  dialect: SourceDialect
): ImportResult => {
  if (dialect === "javascript") {
    return { pattern: source, flags: "", notes: [], unsupported: [] };
  }
  // A Python reference to a named group is `(?P=name)`, which the tokenizer
  // reads as an opening, so it is rewritten first.
  const prepared = source.replace(
    /(?<!\\)(\\\\)*\(\?P=(\w+)\)/g,
    (_all, slashes: string | undefined, name: string) =>
      `${slashes ?? ""}\\k<${name}>`
  );
  const { tokens } = tokenizeRegex(prepared, "u");
  const notes = new Set<ImportNote>();
  const unsupported = new Set<UnsupportedReason>();
  const flags = new Set<string>();
  let out = "";
  let cursor = 0;
  tokens.forEach((token) => {
    out += prepared.slice(cursor, token.start);
    cursor = token.end;
    if (token.kind !== "unsupported") {
      out += token.text;
      return;
    }
    switch (token.reason) {
      case "python_named":
        out += token.text.startsWith("(?P<")
          ? `(?<${token.text.slice(4)}`
          : token.text;
        break;
      case "inline_flags": {
        // Flags at the very start of the pattern become flags of the copy.
        const letters = (token.value ?? "").split("-")[0];
        if (out === "") {
          for (const letter of letters) {
            if (FLAG_LETTERS[letter]) {
              flags.add(FLAG_LETTERS[letter]);
            } else {
              notes.add("flag_ignored");
            }
          }
        } else {
          notes.add("inline_flags_middle");
          out += token.text;
        }
        break;
      }
      case "anchor_a":
        out += TEXT_START;
        break;
      case "anchor_z":
        if (token.text === "\\Z" && dialect === "pcre") {
          out += TEXT_END_NEWLINE;
          notes.add("end_with_newline");
        } else {
          out += TEXT_END;
        }
        break;
      case "horizontal_space":
        out += token.text === "\\h" ? "[ \\t]" : "[^ \\t]";
        break;
      case "any_newline":
        out += NEWLINE;
        break;
      case "comment":
        break;
      default:
        if (token.reason && KEPT_AS_WRITTEN.has(token.reason)) {
          unsupported.add(token.reason);
        }
        out += token.text;
    }
  });
  out += prepared.slice(cursor);
  return {
    pattern: out,
    flags: Array.from(flags).sort().join(""),
    notes: Array.from(notes),
    unsupported: Array.from(unsupported),
  };
};
