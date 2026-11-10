/**
 * A tokenizer for JavaScript (ECMAScript) regular expressions.
 *
 * It splits a pattern into the pieces a person reads: literals, escapes,
 * character classes, groups, quantifiers and so on. The pattern workbench
 * uses it to explain a pattern piece by piece and to screen for risky
 * constructs. It does not decide whether a pattern is valid: the engine
 * does that when the pattern is compiled.
 *
 * Constructs from other regular expression flavours (possessive quantifiers,
 * atomic groups, conditionals and others) are recognised and reported as
 * unsupported, with the reason, instead of being hidden.
 */

export type RegexTokenKind =
  | "literal"
  | "escaped_literal"
  | "control"
  | "hex"
  | "unicode"
  | "control_letter"
  | "digit"
  | "not_digit"
  | "word"
  | "not_word"
  | "space"
  | "not_space"
  | "property"
  | "not_property"
  | "any"
  | "start"
  | "end"
  | "word_boundary"
  | "not_word_boundary"
  | "group_capture"
  | "group_named"
  | "group_noncapture"
  | "lookahead"
  | "negative_lookahead"
  | "lookbehind"
  | "negative_lookbehind"
  | "group_modifiers"
  | "group_close"
  | "alternation"
  | "quantifier"
  | "backreference"
  | "named_backreference"
  | "class"
  | "unsupported";

export type UnsupportedReason =
  | "possessive"
  | "atomic"
  | "conditional"
  | "comment"
  | "subroutine"
  | "python_named"
  | "inline_flags"
  | "posix_class"
  | "anchor_a"
  | "anchor_z"
  | "keep_out"
  | "horizontal_space"
  | "any_newline"
  | "property_needs_flag";

export interface RegexClassItem {
  type: "char" | "range" | "escape" | "property" | "operator" | "nested";
  text: string;
}

export interface RegexToken {
  kind: RegexTokenKind;
  start: number;
  end: number;
  text: string;
  /** How many groups the token sits inside. */
  depth: number;
  /** The number of a capturing group, or of the group a reference points to. */
  group?: number;
  /** The name of a named group or named reference, or a property name. */
  name?: string;
  /** Quantifier bounds. `max` is undefined when there is no upper bound. */
  min?: number;
  max?: number;
  lazy?: boolean;
  /** Character class details. */
  negated?: boolean;
  items?: RegexClassItem[];
  /** The character an escape stands for, or the modifiers of a group. */
  value?: string;
  reason?: UnsupportedReason;
}

export interface RegexTokens {
  tokens: RegexToken[];
  /** The number of capturing groups. */
  groupCount: number;
  /** The names of named groups, in order. */
  groupNames: string[];
  /** True when a group is closed that was never opened, or left open. */
  unbalanced: boolean;
}

const CONTROL_ESCAPES: Record<string, string> = {
  n: "line feed",
  r: "carriage return",
  t: "tab",
  f: "form feed",
  v: "vertical tab",
  "0": "null",
};

const CLASS_ESCAPES: Record<string, RegexTokenKind> = {
  d: "digit",
  D: "not_digit",
  w: "word",
  W: "not_word",
  s: "space",
  S: "not_space",
};

const HEX = /^[0-9a-fA-F]+$/;

export const tokenizeRegex = (pattern: string, flags = ""): RegexTokens => {
  const unicode = flags.includes("u") || flags.includes("v");
  const tokens: RegexToken[] = [];
  const groupNames: string[] = [];
  let groupCount = 0;
  let depth = 0;
  let unbalanced = false;
  let i = 0;
  const length = pattern.length;

  const push = (
    kind: RegexTokenKind,
    start: number,
    end: number,
    extra: Partial<RegexToken> = {}
  ) => {
    tokens.push({
      kind,
      start,
      end,
      text: pattern.slice(start, end),
      depth,
      ...extra,
    });
  };

  const readEscape = (
    start: number
  ): { end: number; kind: RegexTokenKind; extra: Partial<RegexToken> } => {
    // `start` points at the backslash.
    const next = pattern[start + 1];
    if (next === undefined) {
      return { end: start + 1, kind: "literal", extra: {} };
    }
    if (next in CLASS_ESCAPES) {
      return { end: start + 2, kind: CLASS_ESCAPES[next], extra: {} };
    }
    if (next === "b") {
      return { end: start + 2, kind: "word_boundary", extra: {} };
    }
    if (next === "B") {
      return { end: start + 2, kind: "not_word_boundary", extra: {} };
    }
    if (next === "0" && !/[0-9]/.test(pattern[start + 2] ?? "")) {
      return { end: start + 2, kind: "control", extra: { value: "null" } };
    }
    if (next in CONTROL_ESCAPES && next !== "0") {
      return {
        end: start + 2,
        kind: "control",
        extra: { value: CONTROL_ESCAPES[next] },
      };
    }
    if (next === "x") {
      const hex = pattern.slice(start + 2, start + 4);
      if (hex.length === 2 && HEX.test(hex)) {
        return {
          end: start + 4,
          kind: "hex",
          extra: { value: String.fromCodePoint(parseInt(hex, 16)) },
        };
      }
    }
    if (next === "u") {
      if (pattern[start + 2] === "{") {
        const close = pattern.indexOf("}", start + 3);
        const hex = close === -1 ? "" : pattern.slice(start + 3, close);
        if (hex && HEX.test(hex) && parseInt(hex, 16) <= 0x10ffff) {
          return {
            end: close + 1,
            kind: "unicode",
            extra: { value: String.fromCodePoint(parseInt(hex, 16)) },
          };
        }
      }
      const hex = pattern.slice(start + 2, start + 6);
      if (hex.length === 4 && HEX.test(hex)) {
        return {
          end: start + 6,
          kind: "unicode",
          extra: { value: String.fromCodePoint(parseInt(hex, 16)) },
        };
      }
    }
    if (next === "c" && /[A-Za-z]/.test(pattern[start + 2] ?? "")) {
      return {
        end: start + 3,
        kind: "control_letter",
        extra: { value: pattern[start + 2].toUpperCase() },
      };
    }
    if (next === "p" || next === "P") {
      if (pattern[start + 2] === "{") {
        const close = pattern.indexOf("}", start + 3);
        if (close !== -1) {
          const name = pattern.slice(start + 3, close);
          if (!unicode) {
            return {
              end: close + 1,
              kind: "unsupported",
              extra: { reason: "property_needs_flag", name },
            };
          }
          return {
            end: close + 1,
            kind: next === "p" ? "property" : "not_property",
            extra: { name },
          };
        }
      }
    }
    if (next === "k" && pattern[start + 2] === "<") {
      const close = pattern.indexOf(">", start + 3);
      if (close !== -1) {
        return {
          end: close + 1,
          kind: "named_backreference",
          extra: { name: pattern.slice(start + 3, close) },
        };
      }
    }
    if (/[1-9]/.test(next)) {
      let end = start + 2;
      while (end < length && /[0-9]/.test(pattern[end])) {
        end++;
      }
      return {
        end,
        kind: "backreference",
        extra: { group: parseInt(pattern.slice(start + 1, end), 10) },
      };
    }
    if (next === "A") {
      return {
        end: start + 2,
        kind: "unsupported",
        extra: { reason: "anchor_a" },
      };
    }
    if (next === "Z" || next === "z") {
      return {
        end: start + 2,
        kind: "unsupported",
        extra: { reason: "anchor_z" },
      };
    }
    if (next === "K") {
      return {
        end: start + 2,
        kind: "unsupported",
        extra: { reason: "keep_out" },
      };
    }
    if (next === "h" || next === "H") {
      return {
        end: start + 2,
        kind: "unsupported",
        extra: { reason: "horizontal_space" },
      };
    }
    if (next === "R") {
      return {
        end: start + 2,
        kind: "unsupported",
        extra: { reason: "any_newline" },
      };
    }
    const codePoint = pattern.codePointAt(start + 1)!;
    const char = String.fromCodePoint(codePoint);
    return {
      end: start + 1 + char.length,
      kind: "escaped_literal",
      extra: { value: char },
    };
  };

  const readClass = (start: number): number => {
    // `start` points at the opening bracket.
    let pos = start + 1;
    let negated = false;
    if (pattern[pos] === "^") {
      negated = true;
      pos++;
    }
    const items: RegexClassItem[] = [];
    let nesting = 0;
    let closed = false;
    while (pos < length) {
      const char = pattern[pos];
      if (char === "]") {
        if (nesting === 0) {
          closed = true;
          pos++;
          break;
        }
        nesting--;
        pos++;
        continue;
      }
      if (char === "[") {
        if (pattern[pos + 1] === ":") {
          const close = pattern.indexOf(":]", pos + 2);
          if (close !== -1) {
            items.push({
              type: "nested",
              text: pattern.slice(pos, close + 2),
            });
            pos = close + 2;
            continue;
          }
        }
        if (flags.includes("v")) {
          nesting++;
          items.push({ type: "nested", text: "[" });
          pos++;
          continue;
        }
      }
      if (
        flags.includes("v") &&
        (pattern.startsWith("&&", pos) || pattern.startsWith("--", pos))
      ) {
        items.push({ type: "operator", text: pattern.slice(pos, pos + 2) });
        pos += 2;
        continue;
      }
      let itemEnd: number;
      let type: RegexClassItem["type"] = "char";
      if (char === "\\") {
        const escape = readEscape(pos);
        itemEnd = escape.end;
        type =
          escape.kind === "property" || escape.kind === "not_property"
            ? "property"
            : "escape";
      } else {
        itemEnd = pos + String.fromCodePoint(pattern.codePointAt(pos)!).length;
      }
      // A range: an item, a hyphen, and another item that is not the end.
      if (
        pattern[itemEnd] === "-" &&
        pattern[itemEnd + 1] !== undefined &&
        pattern[itemEnd + 1] !== "]" &&
        !(flags.includes("v") && pattern[itemEnd + 1] === "-")
      ) {
        const toStart = itemEnd + 1;
        const toEnd =
          pattern[toStart] === "\\"
            ? readEscape(toStart).end
            : toStart +
              String.fromCodePoint(pattern.codePointAt(toStart)!).length;
        items.push({ type: "range", text: pattern.slice(pos, toEnd) });
        pos = toEnd;
        continue;
      }
      items.push({ type, text: pattern.slice(pos, itemEnd) });
      pos = itemEnd;
    }
    if (!closed) {
      unbalanced = true;
    }
    const posix = items.find(
      (item) => item.type === "nested" && item.text.startsWith("[:")
    );
    if (posix) {
      push("unsupported", start, pos, { reason: "posix_class" });
    } else {
      push("class", start, pos, { negated, items });
    }
    return pos;
  };

  const readQuantifier = (
    start: number
  ): { end: number; min: number; max?: number } | undefined => {
    const char = pattern[start];
    if (char === "*") {
      return { end: start + 1, min: 0 };
    }
    if (char === "+") {
      return { end: start + 1, min: 1 };
    }
    if (char === "?") {
      return { end: start + 1, min: 0, max: 1 };
    }
    if (char === "{") {
      const match = /^\{(\d+)(?:(,)(\d*))?\}/.exec(pattern.slice(start));
      if (match) {
        const min = parseInt(match[1], 10);
        const max =
          match[2] === undefined
            ? min
            : match[3] === ""
              ? undefined
              : parseInt(match[3], 10);
        return { end: start + match[0].length, min, max };
      }
    }
    return undefined;
  };

  while (i < length) {
    const char = pattern[i];

    if (char === "\\") {
      const escape = readEscape(i);
      push(escape.kind, i, escape.end, escape.extra);
      i = escape.end;
      continue;
    }

    if (char === "[") {
      i = readClass(i);
      continue;
    }

    if (char === "(") {
      const rest = pattern.slice(i);
      let kind: RegexTokenKind = "group_capture";
      let end = i + 1;
      let extra: Partial<RegexToken> = {};
      let opens = true;
      if (rest.startsWith("(?:")) {
        kind = "group_noncapture";
        end = i + 3;
      } else if (rest.startsWith("(?=")) {
        kind = "lookahead";
        end = i + 3;
      } else if (rest.startsWith("(?!")) {
        kind = "negative_lookahead";
        end = i + 3;
      } else if (rest.startsWith("(?<=")) {
        kind = "lookbehind";
        end = i + 4;
      } else if (rest.startsWith("(?<!")) {
        kind = "negative_lookbehind";
        end = i + 4;
      } else if (rest.startsWith("(?<")) {
        const close = pattern.indexOf(">", i + 3);
        if (close !== -1) {
          kind = "group_named";
          end = close + 1;
          groupCount++;
          const name = pattern.slice(i + 3, close);
          groupNames.push(name);
          extra = { group: groupCount, name };
        }
      } else if (rest.startsWith("(?>")) {
        kind = "unsupported";
        end = i + 3;
        extra = { reason: "atomic" };
      } else if (rest.startsWith("(?(")) {
        kind = "unsupported";
        end = i + 3;
        extra = { reason: "conditional" };
      } else if (rest.startsWith("(?#")) {
        const close = pattern.indexOf(")", i);
        kind = "unsupported";
        end = close === -1 ? length : close + 1;
        extra = { reason: "comment" };
        opens = false;
      } else if (rest.startsWith("(?P")) {
        const close = pattern.indexOf(">", i);
        kind = "unsupported";
        end = pattern[i + 3] === "<" && close !== -1 ? close + 1 : i + 3;
        extra = { reason: "python_named" };
      } else if (/^\(\?(?:R|&\w+|[+-]?\d+)\)/.test(rest)) {
        const close = pattern.indexOf(")", i);
        kind = "unsupported";
        end = close + 1;
        extra = { reason: "subroutine" };
        opens = false;
      } else {
        const modifiers = /^\(\?([a-z]*(?:-[a-z]+)?)([:)])/.exec(rest);
        if (modifiers && modifiers[1]) {
          if (modifiers[2] === ":") {
            kind = "group_modifiers";
            end = i + modifiers[0].length;
            extra = { value: modifiers[1] };
          } else {
            kind = "unsupported";
            end = i + modifiers[0].length;
            extra = { reason: "inline_flags", value: modifiers[1] };
            opens = false;
          }
        } else if (rest.startsWith("(?")) {
          // Unknown group syntax: leave it to the engine to reject.
          kind = "group_noncapture";
          end = i + 2;
        }
      }
      if (kind === "group_capture") {
        groupCount++;
        extra = { group: groupCount };
      }
      push(kind, i, end, extra);
      if (opens) {
        depth++;
      }
      i = end;
      continue;
    }

    if (char === ")") {
      if (depth === 0) {
        unbalanced = true;
      } else {
        depth--;
      }
      push("group_close", i, i + 1);
      i++;
      continue;
    }

    if (char === "|") {
      push("alternation", i, i + 1);
      i++;
      continue;
    }

    if (char === ".") {
      push("any", i, i + 1);
      i++;
      continue;
    }

    if (char === "^") {
      push("start", i, i + 1);
      i++;
      continue;
    }

    if (char === "$") {
      push("end", i, i + 1);
      i++;
      continue;
    }

    const quantifier = readQuantifier(i);
    if (quantifier) {
      let end = quantifier.end;
      let lazy = false;
      if (pattern[end] === "?") {
        lazy = true;
        end++;
      }
      push("quantifier", i, end, {
        min: quantifier.min,
        max: quantifier.max,
        lazy,
      });
      i = end;
      if (pattern[i] === "+") {
        push("unsupported", i, i + 1, { reason: "possessive" });
        i++;
      }
      continue;
    }

    const literal = String.fromCodePoint(pattern.codePointAt(i)!);
    push("literal", i, i + literal.length, { value: literal });
    i += literal.length;
  }

  if (depth !== 0) {
    unbalanced = true;
  }

  return { tokens, groupCount, groupNames, unbalanced };
};

/**
 * Joins neighbouring literal characters, so an explanation reads
 * "the text cat" and not three separate letters.
 */
export const mergeLiterals = (tokens: RegexToken[]): RegexToken[] => {
  const merged: RegexToken[] = [];
  // Whether the last token can still take more characters.
  let open = false;
  tokens.forEach((token, index) => {
    // A quantifier binds to the one character before it, so that character
    // stays on its own.
    const quantified = tokens[index + 1]?.kind === "quantifier";
    const previous = merged[merged.length - 1];
    if (
      open &&
      !quantified &&
      token.kind === "literal" &&
      previous.depth === token.depth &&
      previous.end === token.start
    ) {
      previous.end = token.end;
      previous.text += token.text;
      previous.value = (previous.value ?? "") + (token.value ?? "");
      return;
    }
    merged.push({ ...token });
    open = token.kind === "literal" && !quantified;
  });
  return merged;
};
