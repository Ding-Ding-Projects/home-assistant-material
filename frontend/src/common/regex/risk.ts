import type { RegexToken } from "./explain";
import { tokenizeRegex } from "./explain";

/**
 * Static screening of a pattern for constructs that can make a backtracking
 * engine take a very long time on some inputs.
 *
 * This is a set of heuristics over the pattern's structure. It can miss a
 * slow pattern and it can flag a harmless one. The workbench shows every
 * finding; list filters that run on the main thread refuse a pattern with a
 * "high" finding, because a slow evaluation there cannot be stopped.
 */

export type RiskLevel = "high" | "medium" | "low";

export type RiskCode =
  | "nested_quantifier"
  | "quantified_alternation"
  | "adjacent_repeats"
  | "leading_wildcard"
  | "quantified_backreference"
  | "large_repeat";

export interface RiskFinding {
  level: RiskLevel;
  code: RiskCode;
  start: number;
  end: number;
}

interface Node {
  token: RegexToken;
  /** Set for groups. */
  children?: Node[];
  lookaround: boolean;
  quantifier?: RegexToken;
  hasAlternation: boolean;
}

const GROUP_KINDS = new Set([
  "group_capture",
  "group_named",
  "group_noncapture",
  "group_modifiers",
  "lookahead",
  "negative_lookahead",
  "lookbehind",
  "negative_lookbehind",
]);

const LOOKAROUND_KINDS = new Set([
  "lookahead",
  "negative_lookahead",
  "lookbehind",
  "negative_lookbehind",
]);

const LARGE_REPEAT = 1000;

const unbounded = (node: Node): boolean =>
  node.quantifier !== undefined && node.quantifier.max === undefined;

const optional = (node: Node): boolean =>
  node.quantifier !== undefined && node.quantifier.min === 0;

const buildTree = (tokens: RegexToken[]): Node => {
  const root: Node = {
    token: tokens[0],
    children: [],
    lookaround: false,
    hasAlternation: false,
  };
  const stack: Node[] = [root];
  tokens.forEach((token) => {
    const parent = stack[stack.length - 1];
    if (token.kind === "group_close") {
      if (stack.length > 1) {
        stack.pop();
      }
      return;
    }
    if (token.kind === "quantifier") {
      const target = parent.children![parent.children!.length - 1];
      if (target) {
        target.quantifier = token;
      }
      return;
    }
    if (token.kind === "alternation") {
      parent.hasAlternation = true;
      return;
    }
    if (token.kind === "unsupported" && token.reason !== "atomic") {
      return;
    }
    const node: Node = {
      token,
      lookaround: LOOKAROUND_KINDS.has(token.kind),
      hasAlternation: false,
    };
    parent.children!.push(node);
    if (GROUP_KINDS.has(token.kind) || token.reason === "atomic") {
      node.children = [];
      stack.push(node);
    }
  });
  return root;
};

const endOf = (node: Node): number => {
  if (node.quantifier) {
    return node.quantifier.end;
  }
  if (node.children?.length) {
    // The closing bracket follows the last child.
    return endOf(node.children[node.children.length - 1]) + 1;
  }
  return node.token.end;
};

const broadAtom = (node: Node): boolean =>
  node.token.kind === "any" ||
  (node.token.kind === "class" && node.token.negated === true) ||
  ["not_digit", "not_word", "not_space"].includes(node.token.kind);

/** An unbounded repeat anywhere inside, outside lookarounds. */
const findUnbounded = (node: Node): Node | undefined => {
  for (const child of node.children ?? []) {
    if (child.lookaround) {
      continue;
    }
    if (unbounded(child)) {
      return child;
    }
    const inner = findUnbounded(child);
    if (inner) {
      return inner;
    }
  }
  return undefined;
};

export const analyzeRisk = (pattern: string, flags = ""): RiskFinding[] => {
  const { tokens } = tokenizeRegex(pattern, flags);
  if (!tokens.length) {
    return [];
  }
  const findings: RiskFinding[] = [];
  const root = buildTree(tokens);

  const visit = (node: Node, insideUnbounded: boolean) => {
    const children = node.children ?? [];

    if (node !== root && node.children && unbounded(node) && !node.lookaround) {
      const range = { start: node.token.start, end: endOf(node) };
      const inner = findUnbounded(node);
      if (inner) {
        // The repeats can overlap when nothing required separates one pass
        // of the group from the next, or when the inner repeat matches
        // almost anything.
        const directChild = children.includes(inner);
        const othersOptional =
          directChild &&
          children.every((child) => child === inner || optional(child));
        findings.push({
          level:
            othersOptional || broadAtom(inner) || !directChild
              ? "high"
              : "medium",
          code: "nested_quantifier",
          ...range,
        });
      } else if (node.hasAlternation) {
        findings.push({
          level: "medium",
          code: "quantified_alternation",
          ...range,
        });
      }
    }

    children.forEach((child, index) => {
      const next = children[index + 1];
      if (
        next &&
        !node.hasAlternation &&
        unbounded(child) &&
        unbounded(next) &&
        !child.children &&
        !next.children &&
        (child.token.text === next.token.text ||
          (broadAtom(child) && broadAtom(next)))
      ) {
        findings.push({
          level: "medium",
          code: "adjacent_repeats",
          start: child.token.start,
          end: endOf(next),
        });
      }
      if (
        child.quantifier &&
        (child.quantifier.min! >= LARGE_REPEAT ||
          (child.quantifier.max ?? 0) >= LARGE_REPEAT)
      ) {
        findings.push({
          level: "medium",
          code: "large_repeat",
          start: child.quantifier.start,
          end: child.quantifier.end,
        });
      }
      if (
        (child.token.kind === "backreference" ||
          child.token.kind === "named_backreference") &&
        (insideUnbounded || unbounded(child))
      ) {
        findings.push({
          level: "medium",
          code: "quantified_backreference",
          start: child.token.start,
          end: endOf(child),
        });
      }
      visit(child, insideUnbounded || unbounded(child));
    });
  };

  visit(root, false);

  const first = root.children?.[0];
  if (
    first &&
    !root.hasAlternation &&
    first.token.kind === "any" &&
    unbounded(first) &&
    !flags.includes("y")
  ) {
    findings.push({
      level: "low",
      code: "leading_wildcard",
      start: first.token.start,
      end: endOf(first),
    });
  }

  return findings;
};
