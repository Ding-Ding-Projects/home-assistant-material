import { uid } from "../util/uid";
import type {
  CompareValue,
  ConditionPiece,
  Piece,
  PieceKind,
  TextPiece,
} from "./types";

export const emptyValue = (): CompareValue => ({
  mode: "literal",
  literal: "",
  entity: "",
});

/** A new piece of the given kind with sensible starting values. */
export const createPiece = (kind: PieceKind): Piece => {
  const id = uid();
  switch (kind) {
    case "text":
      return { id, kind, text: "" };
    case "state":
      return { id, kind, entity: "", withUnit: false };
    case "attribute":
      return { id, kind, entity: "", attribute: "" };
    case "name":
      return { id, kind, entity: "", what: "name" };
    case "datetime":
      return { id, kind, format: "%H:%M" };
    case "elapsed":
      return {
        id,
        kind,
        entity: "",
        direction: "since",
        source: "last_changed",
        style: "words",
        precision: 1,
      };
    case "number":
      return {
        id,
        kind,
        entity: "",
        decimals: 1,
        op: "none",
        operand: 1,
        fallback: "unknown",
      };
    case "condition":
      return {
        id,
        kind,
        leftEntity: "",
        leftAs: "text",
        op: "is",
        right: emptyValue(),
        rightEnd: emptyValue(),
        thenPieces: [],
        elsePieces: [],
      } satisfies ConditionPiece;
    case "count":
      return { id, kind, entities: [], state: "on" };
    case "raw":
      return { id, kind, template: "" };
    default:
      return { id, kind: "text", text: "" };
  }
};

export const createTextPiece = (text: string): TextPiece => ({
  id: uid(),
  kind: "text",
  text,
});
