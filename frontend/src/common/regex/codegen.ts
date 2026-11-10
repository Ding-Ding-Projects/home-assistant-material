import type { RegexToken } from "./explain";
import { tokenizeRegex } from "./explain";

/**
 * Writes a pattern as code for the places a Home Assistant user is likely to
 * paste it, converting syntax where another flavour spells it differently.
 *
 * A conversion is a rewrite of syntax, not a proof of equal behaviour. Every
 * known difference that the rewrite cannot remove is returned as a warning.
 */

export type CodeTarget =
  "javascript" | "python" | "home_assistant" | "pcre" | "json";

export const CODE_TARGETS: CodeTarget[] = [
  "javascript",
  "home_assistant",
  "python",
  "pcre",
  "json",
];

export type ConversionWarning =
  | "unsupported_construct"
  | "unicode_property"
  | "set_operations"
  | "digit_unicode"
  | "dollar_newline"
  | "lookbehind_fixed"
  | "sticky"
  | "indices"
  | "global_is_call"
  | "case_insensitive_unicode";

export interface GeneratedCode {
  code: string;
  /** The pattern as the target flavour spells it. */
  pattern: string;
  warnings: ConversionWarning[];
}

const LOOKBEHIND = new Set(["lookbehind", "negative_lookbehind"]);

const hex = (codePoint: number, width: number) =>
  codePoint.toString(16).toUpperCase().padStart(width, "0");

const codePointOf = (token: RegexToken): number | undefined =>
  token.value === undefined ? undefined : token.value.codePointAt(0);

/** Rewrites the pattern token by token for a Python or PCRE engine. */
const convert = (
  pattern: string,
  flags: string,
  flavour: "python" | "pcre"
): { pattern: string; warnings: Set<ConversionWarning> } => {
  const warnings = new Set<ConversionWarning>();
  const { tokens } = tokenizeRegex(pattern, flags);
  let lookbehindDepth: number | undefined;

  const parts = tokens.map((token) => {
    if (LOOKBEHIND.has(token.kind)) {
      lookbehindDepth = token.depth;
    } else if (
      token.kind === "group_close" &&
      lookbehindDepth !== undefined &&
      token.depth === lookbehindDepth
    ) {
      lookbehindDepth = undefined;
    } else if (
      lookbehindDepth !== undefined &&
      (token.kind === "alternation" ||
        (token.kind === "quantifier" && token.min !== token.max))
    ) {
      // Python needs fixed-width lookbehind; PCRE needs each alternative to
      // be fixed-width. JavaScript allows any length.
      warnings.add("lookbehind_fixed");
    }

    switch (token.kind) {
      case "group_named":
        return flavour === "python" ? `(?P<${token.name}>` : token.text;
      case "named_backreference":
        return flavour === "python" ? `(?P=${token.name})` : token.text;
      case "unicode": {
        const codePoint = codePointOf(token);
        if (codePoint === undefined) {
          return token.text;
        }
        if (flavour === "pcre") {
          return `\\x{${hex(codePoint, 4)}}`;
        }
        return codePoint > 0xffff
          ? `\\U${hex(codePoint, 8)}`
          : `\\u${hex(codePoint, 4)}`;
      }
      case "escaped_literal":
        // A slash needs no escape outside a JavaScript literal.
        return token.value === "/" ? "/" : token.text;
      case "property":
      case "not_property":
        if (flavour === "python") {
          warnings.add("unicode_property");
        }
        return token.text;
      case "digit":
      case "not_digit":
      case "word":
      case "not_word":
      case "space":
      case "not_space":
        if (flavour === "python") {
          warnings.add("digit_unicode");
        }
        return token.text;
      case "end":
        if (!flags.includes("m")) {
          warnings.add("dollar_newline");
        }
        return token.text;
      case "class":
        if (token.items?.some((item) => item.type === "operator")) {
          warnings.add("set_operations");
        }
        if (
          flavour === "python" &&
          token.items?.some((item) => item.type === "property")
        ) {
          warnings.add("unicode_property");
        }
        return token.text;
      case "unsupported":
        // These are written for another flavour already. Keep them as they
        // are and say that JavaScript did not run them.
        warnings.add("unsupported_construct");
        return token.text;
      default:
        return token.text;
    }
  });

  if (flags.includes("y")) {
    warnings.add("sticky");
  }
  if (flags.includes("d")) {
    warnings.add("indices");
  }
  if (flags.includes("v")) {
    warnings.add("set_operations");
  }
  if (flags.includes("i") && flavour === "python") {
    warnings.add("case_insensitive_unicode");
  }
  return { pattern: parts.join(""), warnings };
};

const pythonFlags = (flags: string): string[] => {
  const result: string[] = [];
  if (flags.includes("i")) {
    result.push("re.IGNORECASE");
  }
  if (flags.includes("m")) {
    result.push("re.MULTILINE");
  }
  if (flags.includes("s")) {
    result.push("re.DOTALL");
  }
  return result;
};

/** A Python raw string. A raw string cannot end in an odd backslash. */
const pythonRawString = (text: string): string => {
  const quote = text.includes('"') && !text.includes("'") ? "'" : '"';
  if (text.includes(quote) || /\\$/.test(text) || text.includes("\n")) {
    return JSON.stringify(text);
  }
  return `r${quote}${text}${quote}`;
};

const jinjaString = (text: string): string =>
  `'${text.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;

const shellString = (text: string): string =>
  `'${text.replace(/'/g, "'\\''")}'`;

export const generateCode = (
  target: CodeTarget,
  pattern: string,
  flags: string
): GeneratedCode => {
  if (target === "javascript") {
    const warnings: ConversionWarning[] = [];
    // A literal cannot hold a line break or an unescaped slash.
    const literal = pattern.replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    const needsConstructor = /(^|[^\\])(\\\\)*\//.test(literal);
    const code = needsConstructor
      ? `const pattern = new RegExp(${JSON.stringify(pattern)}, ${JSON.stringify(flags)});`
      : `const pattern = /${literal}/${flags};`;
    const use = flags.includes("g")
      ? "const matches = [...text.matchAll(pattern)];"
      : "const match = pattern.exec(text);";
    return { code: `${code}\n${use}`, pattern, warnings };
  }

  if (target === "json") {
    return {
      code: JSON.stringify({ pattern, flags }, null, 2),
      pattern,
      warnings: [],
    };
  }

  if (target === "python") {
    const converted = convert(pattern, flags, "python");
    const flagList = pythonFlags(flags);
    const compiled = `pattern = re.compile(${pythonRawString(converted.pattern)}${
      flagList.length ? `, ${flagList.join(" | ")}` : ""
    })`;
    const use = flags.includes("g")
      ? "matches = list(pattern.finditer(text))"
      : "match = pattern.search(text)";
    if (flags.includes("g")) {
      converted.warnings.add("global_is_call");
    }
    return {
      code: `import re\n\n${compiled}\n${use}`,
      pattern: converted.pattern,
      warnings: Array.from(converted.warnings),
    };
  }

  if (target === "home_assistant") {
    // Home Assistant templates use Python's `re` through Jinja filters.
    const converted = convert(pattern, flags, "python");
    const inline = `${flags.includes("m") ? "(?m)" : ""}${
      flags.includes("s") ? "(?s)" : ""
    }${converted.pattern}`;
    const ignoreCase = flags.includes("i") ? ", ignorecase=True" : "";
    const filter = flags.includes("g") ? "regex_findall" : "regex_search";
    if (flags.includes("g")) {
      converted.warnings.add("global_is_call");
    }
    return {
      code: `{{ value | ${filter}(${jinjaString(inline)}${ignoreCase}) }}`,
      pattern: inline,
      warnings: Array.from(converted.warnings),
    };
  }

  const converted = convert(pattern, flags, "pcre");
  const inline = `${flags.includes("m") ? "(?m)" : ""}${
    flags.includes("s") ? "(?s)" : ""
  }${converted.pattern}`;
  const options = `-${flags.includes("g") ? "o" : ""}${
    flags.includes("i") ? "i" : ""
  }P`;
  if (flags.includes("g")) {
    converted.warnings.add("global_is_call");
  }
  return {
    code: `grep ${options} ${shellString(inline)} file.txt`,
    pattern: inline,
    warnings: Array.from(converted.warnings),
  };
};
