import type { RegexToken } from "./explain";
import { tokenizeRegex } from "./explain";

/**
 * A step-by-step trace of the first match of a pattern.
 *
 * The pattern is cut into the pieces a person reads at the top level, each
 * piece with the quantifier that follows it: `kitchen`, `(_\w+)?`, `\b`. For
 * each piece, the pattern up to and including it is run from the start of the
 * match, and the position it reaches is the position that piece leaves the
 * match at. That shows how the match is built up, from the real engine.
 *
 * It is not a record of the engine's own backtracking, which JavaScript does
 * not expose. When a later piece makes an earlier one give text back, the
 * earlier piece's own step still shows how far it reached on its own, and the
 * step that gave text back says so.
 */

export type TraceStatus =
  | "ok"
  /** The pattern has no match in the sample. */
  | "no_match"
  /** A top-level choice, or a construct the engine does not run. */
  | "unsupported"
  /** Too many pieces to list. */
  | "too_long";

export type TraceStepKind =
  /** The piece took the text from `from` to `to`. */
  | "text"
  /** The piece took no text: it is a position check. */
  | "position"
  /** The piece left the match earlier than the step before: text went back. */
  | "gave_back"
  /** The pattern up to this piece cannot run from the start of the match. */
  | "unreached";

export interface TraceStep {
  /** The piece of the pattern, with its quantifier. */
  source: string;
  kind: TraceStepKind;
  from: number;
  to?: number;
  /** The text the piece took. */
  text: string;
}

export interface TraceResult {
  status: TraceStatus;
  /** Why the trace is not available, for `unsupported`. */
  reason?: "alternation" | "construct";
  start?: number;
  end?: number;
  steps: TraceStep[];
}

/** The most pieces a trace lists. */
export const TRACE_MAX_STEPS = 200;

const OPENERS = new Set<RegexToken["kind"]>([
  "group_capture",
  "group_named",
  "group_noncapture",
  "group_modifiers",
  "lookahead",
  "negative_lookahead",
  "lookbehind",
  "negative_lookbehind",
]);

export interface TraceUnit {
  start: number;
  end: number;
  /** A run of plain characters, which neighbours join. */
  plain: boolean;
}

/**
 * The top-level pieces of a pattern, or why it has none. A group is one piece
 * with everything inside it, and a quantifier belongs to the piece before it.
 */
export const traceUnits = (
  pattern: string,
  flags = ""
): { units: TraceUnit[] } | { reason: "alternation" | "construct" } => {
  const { tokens, unbalanced } = tokenizeRegex(pattern, flags);
  if (unbalanced) {
    return { reason: "construct" };
  }
  const units: TraceUnit[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token.kind === "alternation" && token.depth === 0) {
      return { reason: "alternation" };
    }
    if (token.kind === "unsupported") {
      return { reason: "construct" };
    }
    if (token.kind === "quantifier") {
      // A quantifier with nothing before it is the engine's to reject.
      i++;
      continue;
    }
    let end = token.end;
    let next = i + 1;
    if (OPENERS.has(token.kind)) {
      let close = next;
      while (
        close < tokens.length &&
        !(
          tokens[close].kind === "group_close" &&
          tokens[close].depth === token.depth
        )
      ) {
        close++;
      }
      if (close >= tokens.length) {
        return { reason: "construct" };
      }
      end = tokens[close].end;
      next = close + 1;
    }
    let quantified = false;
    if (
      next < tokens.length &&
      tokens[next].kind === "quantifier" &&
      tokens[next].depth === token.depth
    ) {
      end = tokens[next].end;
      next++;
      quantified = true;
    }
    const plain = token.kind === "literal" && !quantified;
    const last = units[units.length - 1];
    if (plain && last?.plain && last.end === token.start) {
      last.end = end;
    } else {
      units.push({ start: token.start, end, plain });
    }
    i = next;
  }
  return { units };
};

const withoutRepeatFlags = (flags: string): string =>
  flags.replace(/[gy]/g, "");

/** Traces the first match at or after `from`. */
export const traceMatch = (
  pattern: string,
  flags: string,
  sample: string,
  from = 0
): TraceResult => {
  const cut = traceUnits(pattern, flags);
  if ("reason" in cut) {
    return { status: "unsupported", reason: cut.reason, steps: [] };
  }
  if (cut.units.length > TRACE_MAX_STEPS) {
    return { status: "too_long", steps: [] };
  }
  const base = withoutRepeatFlags(flags);
  const whole = new RegExp(pattern, `${base}g`);
  whole.lastIndex = from;
  const found = whole.exec(sample);
  if (!found) {
    return { status: "no_match", steps: [] };
  }
  const start = found.index;
  const end = start + found[0].length;
  const steps: TraceStep[] = [];
  let position = start;
  for (const unit of cut.units) {
    const source = pattern.slice(unit.start, unit.end);
    let reached: number | undefined;
    try {
      const prefix = new RegExp(pattern.slice(0, unit.end), `${base}y`);
      prefix.lastIndex = start;
      const hit = prefix.exec(sample);
      reached = hit ? start + hit[0].length : undefined;
    } catch (_err) {
      // A prefix that does not compile on its own cannot be traced.
      reached = undefined;
    }
    if (reached === undefined) {
      steps.push({ source, kind: "unreached", from: position, text: "" });
      continue;
    }
    steps.push({
      source,
      kind:
        reached < position
          ? "gave_back"
          : reached === position
            ? "position"
            : "text",
      from: position,
      to: reached,
      text: reached > position ? sample.slice(position, reached) : "",
    });
    position = reached;
  }
  return { status: "ok", start, end, steps };
};
