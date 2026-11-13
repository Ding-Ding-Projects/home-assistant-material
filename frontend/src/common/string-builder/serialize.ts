import { ELAPSED_DIVISOR } from "./presets";
import { escapeText, formatNumber, quote } from "./quote";
import type {
  CompareValue,
  ConditionPiece,
  ElapsedPiece,
  NumberPiece,
  Piece,
} from "./types";

const OPERATOR_SYMBOL = {
  add: "+",
  subtract: "-",
  multiply: "*",
  divide: "/",
} as const;

const entityParts = (entity: string): [string, string] => {
  const dot = entity.indexOf(".");
  return dot < 0 ? [entity, ""] : [entity.slice(0, dot), entity.slice(dot + 1)];
};

const statesCall = (entity: string): string => `states(${quote(entity)})`;

const elapsedTarget = (piece: ElapsedPiece): string => {
  if (piece.source === "state") {
    return piece.style === "words"
      ? `as_datetime(${statesCall(piece.entity)})`
      : statesCall(piece.entity);
  }
  const [domain, objectId] = entityParts(piece.entity);
  return `states.${domain}.${objectId}.${piece.source}`;
};

const elapsedExpression = (piece: ElapsedPiece): string => {
  const target = elapsedTarget(piece);
  if (piece.style === "words") {
    const fn = piece.direction === "since" ? "time_since" : "time_until";
    return `${fn}(${target}, ${piece.precision})`;
  }
  const divisor = ELAPSED_DIVISOR[piece.style];
  const difference =
    piece.direction === "since"
      ? `as_timestamp(now()) - as_timestamp(${target})`
      : `as_timestamp(${target}) - as_timestamp(now())`;
  return `((${difference}) / ${divisor}) | int`;
};

const numberExpression = (piece: NumberPiece): string => {
  const source = statesCall(piece.entity);
  const arithmetic =
    piece.op === "none"
      ? ""
      : ` ${OPERATOR_SYMBOL[piece.op]} ${formatNumber(piece.operand)}`;
  const decimals = Math.max(0, Math.min(6, Math.trunc(piece.decimals)));
  const rounded = `(${source} | float${arithmetic}) | round(${decimals})${
    decimals === 0 ? " | int" : ""
  }`;
  return `${rounded} if is_number(${source}) else ${quote(piece.fallback)}`;
};

const isNumericComparison = (piece: ConditionPiece): boolean =>
  piece.op !== "contains" &&
  (piece.leftAs === "number" ||
    piece.op === "above" ||
    piece.op === "below" ||
    piece.op === "between");

const numericValue = (value: CompareValue): string => {
  if (value.mode === "entity") {
    return `${statesCall(value.entity)} | float`;
  }
  const parsed = Number(value.literal);
  return value.literal.trim() !== "" ? formatNumber(parsed) : "0";
};

const textValue = (value: CompareValue): string =>
  value.mode === "entity" ? statesCall(value.entity) : quote(value.literal);

/** The condition of an if block, as the builder writes it. */
export const conditionExpression = (piece: ConditionPiece): string => {
  const left = statesCall(piece.leftEntity);
  if (!isNumericComparison(piece)) {
    if (piece.op === "contains") {
      return `${textValue(piece.right)} in ${left}`;
    }
    const test = `is_state(${quote(piece.leftEntity)}, ${textValue(piece.right)})`;
    return piece.op === "is_not" ? `not ${test}` : test;
  }
  const values =
    piece.op === "between" ? [piece.right, piece.rightEnd] : [piece.right];
  const guards = [
    `is_number(${left})`,
    ...values
      .filter((value) => value.mode === "entity")
      .map((value) => `is_number(${statesCall(value.entity)})`),
  ];
  let comparison: string;
  if (piece.op === "between") {
    comparison = `${numericValue(piece.right)} <= ${left} | float <= ${numericValue(piece.rightEnd)}`;
  } else {
    const symbol = { is: "==", is_not: "!=", above: ">", below: "<" }[
      piece.op as "is" | "is_not" | "above" | "below"
    ];
    comparison = `${left} | float ${symbol} ${numericValue(piece.right)}`;
  }
  return [...guards, comparison].join(" and ");
};

/** The inside of `{{ }}` for pieces that are a single expression. */
export const pieceExpression = (piece: Piece): string | undefined => {
  switch (piece.kind) {
    case "state": {
      const call = piece.withUnit
        ? `states(${quote(piece.entity)}, with_unit=True)`
        : statesCall(piece.entity);
      return piece.fallback !== undefined
        ? `${call} if has_value(${quote(piece.entity)}) else ${quote(piece.fallback)}`
        : call;
    }
    case "attribute": {
      const call = `state_attr(${quote(piece.entity)}, ${quote(piece.attribute)})`;
      return piece.fallback !== undefined
        ? `${call} if ${call} is not none else ${quote(piece.fallback)}`
        : call;
    }
    case "name":
      if (piece.what === "area") {
        return `area_name(${quote(piece.entity)})`;
      }
      if (piece.what === "floor") {
        return `floor_name(${quote(piece.entity)})`;
      }
      return `state_attr(${quote(piece.entity)}, 'friendly_name')`;
    case "datetime":
      return `now().strftime(${quote(piece.format)})`;
    case "elapsed":
      return elapsedExpression(piece);
    case "number":
      return numberExpression(piece);
    case "count":
      return `[${piece.entities.map(quote).join(", ")}] | select('is_state', ${quote(piece.state)}) | list | count`;
    default:
      return undefined;
  }
};

/** Merge neighbouring text pieces and drop empty ones. */
export const normalizePieces = (pieces: Piece[]): Piece[] => {
  const result: Piece[] = [];
  for (const piece of pieces) {
    if (piece.kind === "text") {
      if (piece.text === "") {
        continue;
      }
      const last = result[result.length - 1];
      if (last?.kind === "text") {
        result[result.length - 1] = { ...last, text: last.text + piece.text };
        continue;
      }
    }
    result.push(piece);
  }
  return result;
};

/** Write a list of pieces as a template string. */
export const serializePieces = (pieces: Piece[]): string =>
  normalizePieces(pieces)
    .map((piece) => {
      switch (piece.kind) {
        case "text":
          return escapeText(piece.text);
        case "raw":
          return piece.template;
        case "condition": {
          const elseText = normalizePieces(piece.elsePieces).length
            ? `{% else %}${serializePieces(piece.elsePieces)}`
            : "";
          return `{% if ${conditionExpression(piece)} %}${serializePieces(piece.thenPieces)}${elseText}{% endif %}`;
        }
        default:
          return `{{ ${pieceExpression(piece)} }}`;
      }
    })
    .join("");
