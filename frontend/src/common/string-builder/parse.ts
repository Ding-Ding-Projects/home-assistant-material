import { isTemplate } from "../string/has-template";
import { createTextPiece, emptyValue } from "./create-piece";
import { unquoteBody } from "./quote";
import {
  conditionExpression,
  normalizePieces,
  pieceExpression,
} from "./serialize";
import type {
  CompareOp,
  CompareValue,
  ConditionPiece,
  ElapsedPiece,
  ElapsedSource,
  ElapsedStyle,
  NamePiece,
  Piece,
} from "./types";
import { MAX_CONDITION_DEPTH } from "./types";
import { uid } from "../util/uid";

// A single-quoted string literal, capturing its body.
const S = String.raw`'((?:[^'\\]|\\.)*)'`;
const NUM = String.raw`-?\d+(?:\.\d+)?`;

const re = (source: string): RegExp => new RegExp(`^${source}$`, "s");

const unq = (body: string): string => unquoteBody(body);

interface Token {
  type: "text" | "expr" | "tag" | "comment";
  /** Trimmed inside of a delimiter pair, or the text itself. */
  value: string;
  raw: string;
}

/** Index of `close` outside of string literals, or -1. */
const findClose = (source: string, from: number, close: string): number => {
  let quoteChar: string | undefined;
  for (let i = from; i < source.length; i++) {
    const char = source[i];
    if (quoteChar) {
      if (char === "\\") {
        i++;
      } else if (char === quoteChar) {
        quoteChar = undefined;
      }
    } else if (char === "'" || char === '"') {
      quoteChar = char;
    } else if (source.startsWith(close, i)) {
      return i;
    }
  }
  return -1;
};

const tokenize = (source: string): Token[] | undefined => {
  const tokens: Token[] = [];
  const opener = /\{[{%#]/g;
  let position = 0;
  while (position < source.length) {
    opener.lastIndex = position;
    const match = opener.exec(source);
    if (!match) {
      tokens.push({
        type: "text",
        value: source.slice(position),
        raw: source.slice(position),
      });
      break;
    }
    if (match.index > position) {
      const text = source.slice(position, match.index);
      tokens.push({ type: "text", value: text, raw: text });
    }
    const kind = match[0][1];
    const close = kind === "{" ? "}}" : kind === "%" ? "%}" : "#}";
    const end =
      kind === "#"
        ? source.indexOf(close, match.index + 2)
        : findClose(source, match.index + 2, close);
    if (end < 0) {
      return undefined;
    }
    const raw = source.slice(match.index, end + 2);
    tokens.push({
      type: kind === "{" ? "expr" : kind === "%" ? "tag" : "comment",
      value: source.slice(match.index + 2, end).trim(),
      raw,
    });
    position = end + 2;
  }
  return tokens;
};

const parseValue = (text: string): CompareValue | undefined => {
  let match = re(S).exec(text);
  if (match) {
    return { mode: "literal", literal: unq(match[1]), entity: "" };
  }
  match = re(`states\\(${S}\\)(?: \\| float)?`).exec(text);
  if (match) {
    return { mode: "entity", literal: "", entity: unq(match[1]) };
  }
  if (re(NUM).test(text)) {
    return { mode: "literal", literal: text, entity: "" };
  }
  return undefined;
};

const parseCondition = (source: string): ConditionPiece | undefined => {
  const base = (): ConditionPiece => ({
    id: uid(),
    kind: "condition",
    leftEntity: "",
    leftAs: "text",
    op: "is",
    right: emptyValue(),
    rightEnd: emptyValue(),
    thenPieces: [],
    elsePieces: [],
  });
  let candidate: ConditionPiece | undefined;

  let match = re(`(not )?is_state\\(${S}, (.+)\\)`).exec(source);
  if (match) {
    const right = parseValue(match[3]);
    if (right) {
      candidate = {
        ...base(),
        op: match[1] ? "is_not" : "is",
        leftEntity: unq(match[2]),
        right,
      };
    }
  }
  if (!candidate) {
    match = re(`(.+) in states\\(${S}\\)`).exec(source);
    const right = match ? parseValue(match[1]) : undefined;
    if (match && right) {
      candidate = {
        ...base(),
        op: "contains",
        leftEntity: unq(match[2]),
        right,
      };
    }
  }
  if (!candidate) {
    const parts = source.split(" and ");
    const comparison = parts.filter(
      (part) => !re(`is_number\\(states\\(${S}\\)\\)`).test(part)
    );
    if (comparison.length === 1) {
      const single = comparison[0];
      match = re(`states\\(${S}\\) \\| float (==|!=|>|<) (.+)`).exec(single);
      const right = match ? parseValue(match[3]) : undefined;
      if (match && right) {
        const ops: Record<string, CompareOp> = {
          "==": "is",
          "!=": "is_not",
          ">": "above",
          "<": "below",
        };
        candidate = {
          ...base(),
          op: ops[match[2]],
          leftAs: "number",
          leftEntity: unq(match[1]),
          right,
        };
      } else {
        match = re(`(.+) <= states\\(${S}\\) \\| float <= (.+)`).exec(single);
        const start = match ? parseValue(match[1]) : undefined;
        const finish = match ? parseValue(match[3]) : undefined;
        if (match && start && finish) {
          candidate = {
            ...base(),
            op: "between",
            leftAs: "number",
            leftEntity: unq(match[2]),
            right: start,
            rightEnd: finish,
          };
        }
      }
    }
  }
  return candidate && conditionExpression(candidate) === source
    ? candidate
    : undefined;
};

const ENTITY_STATES = String.raw`states\.([a-z0-9_]+)\.([a-z0-9_]+)\.(last_changed|last_updated)`;

const parseElapsed = (expr: string): ElapsedPiece | undefined => {
  const base = {
    id: uid(),
    kind: "elapsed" as const,
    entity: "",
    direction: "since" as const,
    source: "last_changed" as ElapsedSource,
    style: "words" as ElapsedStyle,
    precision: 1,
  };
  const targetSource = (
    target: string
  ): { entity: string; source: ElapsedSource } | undefined => {
    let match = re(ENTITY_STATES).exec(target);
    if (match) {
      return {
        entity: `${match[1]}.${match[2]}`,
        source: match[3] as ElapsedSource,
      };
    }
    match = re(`states\\(${S}\\)`).exec(target);
    if (match) {
      return { entity: unq(match[1]), source: "state" };
    }
    match = re(`as_datetime\\(states\\(${S}\\)\\)`).exec(target);
    return match ? { entity: unq(match[1]), source: "state" } : undefined;
  };

  let match = re(`time_(since|until)\\((.+), (\\d)\\)`).exec(expr);
  if (match) {
    const target = targetSource(match[2]);
    return target
      ? {
          ...base,
          ...target,
          direction: match[1] as "since" | "until",
          precision: Number(match[3]),
        }
      : undefined;
  }
  match = re(
    String.raw`\(\(as_timestamp\((.+)\) - as_timestamp\((.+)\)\) / (\d+)\) \| int`
  ).exec(expr);
  if (match) {
    const sinceTarget = match[1] === "now()" ? match[2] : undefined;
    const untilTarget = match[2] === "now()" ? match[1] : undefined;
    const target = targetSource(sinceTarget ?? untilTarget ?? "");
    const style = (
      {
        "1": "seconds",
        "60": "minutes",
        "3600": "hours",
        "86400": "days",
      } as Record<string, ElapsedStyle>
    )[match[3]];
    return target && style
      ? {
          ...base,
          ...target,
          direction: sinceTarget ? "since" : "until",
          style,
        }
      : undefined;
  }
  return undefined;
};

/** Recognise an expression the builder itself writes; otherwise undefined. */
const parseExpression = (expr: string): Piece | undefined => {
  const id = uid();
  const candidates: (Piece | undefined)[] = [];
  let match: RegExpExecArray | null;

  match = re(`'(.*)'`).exec(expr);
  if (match && re(S).test(expr)) {
    return createTextPiece(unq(match[1]));
  }
  match = re(`state_attr\\(${S}, 'friendly_name'\\)`).exec(expr);
  if (match) {
    candidates.push({
      id,
      kind: "name",
      entity: unq(match[1]),
      what: "name",
    } satisfies NamePiece);
  }
  match = re(`(area|floor)_name\\(${S}\\)`).exec(expr);
  if (match) {
    candidates.push({
      id,
      kind: "name",
      entity: unq(match[2]),
      what: match[1] as "area" | "floor",
    });
  }
  match = re(
    `states\\(${S}(, with_unit=True)?\\)(?: if has_value\\(${S}\\) else ${S})?`
  ).exec(expr);
  if (match) {
    candidates.push({
      id,
      kind: "state",
      entity: unq(match[1]),
      withUnit: !!match[2],
      fallback: match[4] !== undefined ? unq(match[4]) : undefined,
    });
  }
  match = re(
    `state_attr\\(${S}, ${S}\\)(?: if state_attr\\(${S}, ${S}\\) is not none else ${S})?`
  ).exec(expr);
  if (match) {
    candidates.push({
      id,
      kind: "attribute",
      entity: unq(match[1]),
      attribute: unq(match[2]),
      fallback: match[5] !== undefined ? unq(match[5]) : undefined,
    });
  }
  match = re(`now\\(\\)\\.strftime\\(${S}\\)`).exec(expr);
  if (match) {
    candidates.push({ id, kind: "datetime", format: unq(match[1]) });
  }
  candidates.push(parseElapsed(expr));
  match = re(
    `\\(states\\(${S}\\) \\| float(?: ([+\\-*/]) (${NUM}))?\\) \\| round\\((\\d)\\)(?: \\| int)? if is_number\\(states\\(${S}\\)\\) else ${S}`
  ).exec(expr);
  if (match) {
    const ops = { "+": "add", "-": "subtract", "*": "multiply", "/": "divide" };
    candidates.push({
      id,
      kind: "number",
      entity: unq(match[1]),
      op: match[2] ? (ops[match[2]] as "add") : "none",
      operand: match[3] ? Number(match[3]) : 1,
      decimals: Number(match[4]),
      fallback: unq(match[6]),
    });
  }
  match = re(
    `\\[(.*)\\] \\| select\\('is_state', ${S}\\) \\| list \\| count`
  ).exec(expr);
  if (match) {
    const entities = [...match[1].matchAll(new RegExp(S, "g"))].map((item) =>
      unq(item[1])
    );
    candidates.push({
      id,
      kind: "count",
      entities,
      state: unq(match[2]),
    });
  }
  return candidates.find(
    (candidate) => candidate && pieceExpression(candidate) === expr
  );
};

interface Cursor {
  tokens: Token[];
  index: number;
}

type SequenceEnd = "else" | "endif" | "eof";

const parseSequence = (
  cursor: Cursor,
  depth: number
): { pieces: Piece[]; end: SequenceEnd } | undefined => {
  const pieces: Piece[] = [];
  while (cursor.index < cursor.tokens.length) {
    const token = cursor.tokens[cursor.index++];
    if (token.type === "text") {
      pieces.push(createTextPiece(token.value));
    } else if (token.type === "comment") {
      pieces.push({ id: uid(), kind: "raw", template: token.raw });
    } else if (token.type === "expr") {
      pieces.push(
        parseExpression(token.value) ?? {
          id: uid(),
          kind: "raw",
          template: token.raw,
        }
      );
    } else if (token.value === "else" || token.value === "endif") {
      return { pieces: normalizePieces(pieces), end: token.value };
    } else if (token.value.startsWith("if ")) {
      if (depth > MAX_CONDITION_DEPTH) {
        return undefined;
      }
      const condition = parseCondition(token.value.slice(3));
      const thenPart = condition ? parseSequence(cursor, depth + 1) : undefined;
      if (!condition || !thenPart || thenPart.end === "eof") {
        return undefined;
      }
      let elsePieces: Piece[] = [];
      if (thenPart.end === "else") {
        const elsePart = parseSequence(cursor, depth + 1);
        if (!elsePart || elsePart.end !== "endif") {
          return undefined;
        }
        elsePieces = elsePart.pieces;
      }
      pieces.push({ ...condition, thenPieces: thenPart.pieces, elsePieces });
    } else {
      return undefined;
    }
  }
  return { pieces: normalizePieces(pieces), end: "eof" };
};

export interface ParseResult {
  pieces: Piece[];
  /**
   * True when the whole text was understood piece by piece. False when it
   * was kept as one raw piece because it uses template features the builder
   * does not model.
   */
  structured: boolean;
}

/**
 * Turn a template back into pieces. Text written by the builder comes back as
 * the same pieces; other text is split into plain text and raw pieces where
 * that is lossless, or kept whole as one raw piece.
 */
export const parseTemplate = (source: string): ParseResult => {
  if (source === "") {
    return { pieces: [], structured: true };
  }
  if (!isTemplate(source) && !source.includes("{#")) {
    return { pieces: [createTextPiece(source)], structured: true };
  }
  const tokens = tokenize(source);
  const parsed = tokens ? parseSequence({ tokens, index: 0 }, 0) : undefined;
  if (!parsed || parsed.end !== "eof") {
    return {
      pieces: [{ id: uid(), kind: "raw", template: source }],
      structured: false,
    };
  }
  return { pieces: parsed.pieces, structured: true };
};
