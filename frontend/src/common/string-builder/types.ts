/**
 * Model for the string builder: a text assembled from pieces that is written
 * as a Home Assistant template. Everything here is pure data; see
 * `serialize.ts` and `parse.ts` for the two directions.
 */

export type PieceKind =
  | "text"
  | "state"
  | "attribute"
  | "name"
  | "datetime"
  | "elapsed"
  | "number"
  | "condition"
  | "count"
  | "raw";

interface PieceBase {
  /** Stable key for list rendering only; never part of the template. */
  id: string;
}

export interface TextPiece extends PieceBase {
  kind: "text";
  text: string;
}

/** The state of an entity, optionally with its unit. */
export interface StatePiece extends PieceBase {
  kind: "state";
  entity: string;
  /** Append the unit of measurement (and round as the interface does). */
  withUnit: boolean;
  /** Text to show when the state is unknown or unavailable. */
  fallback?: string;
}

export interface AttributePiece extends PieceBase {
  kind: "attribute";
  entity: string;
  attribute: string;
  /** Text to show when the attribute does not exist. */
  fallback?: string;
}

export type NameWhat = "name" | "area" | "floor";

export interface NamePiece extends PieceBase {
  kind: "name";
  entity: string;
  what: NameWhat;
}

/** The current date or time, written with a strftime pattern. */
export interface DateTimePiece extends PieceBase {
  kind: "datetime";
  /** A strftime pattern such as `%H:%M`. */
  format: string;
}

export type ElapsedDirection = "since" | "until";
export type ElapsedSource = "last_changed" | "last_updated" | "state";
export type ElapsedStyle = "words" | "seconds" | "minutes" | "hours" | "days";

/** How long ago an entity changed, or how long until a time it holds. */
export interface ElapsedPiece extends PieceBase {
  kind: "elapsed";
  entity: string;
  direction: ElapsedDirection;
  /** `state` reads the entity's state as a date and time. */
  source: ElapsedSource;
  style: ElapsedStyle;
  /** Number of units for the wordy style (1 to 3). */
  precision: number;
}

export type ArithmeticOp = "none" | "add" | "subtract" | "multiply" | "divide";

/** The state of an entity as a number, rounded, with optional arithmetic. */
export interface NumberPiece extends PieceBase {
  kind: "number";
  entity: string;
  decimals: number;
  op: ArithmeticOp;
  operand: number;
  /** Text to show when the state is not a number. */
  fallback: string;
}

export type CompareOp =
  "is" | "is_not" | "above" | "below" | "between" | "contains";

/** What the left side of a comparison reads from an entity. */
export type CompareLeftAs = "text" | "number";

export type ValueMode = "literal" | "entity";

/** A value on the right side of a comparison. */
export interface CompareValue {
  mode: ValueMode;
  /** The typed text or number when `mode` is `literal`. */
  literal: string;
  /** The entity whose state is used when `mode` is `entity`. */
  entity: string;
}

export interface ConditionPiece extends PieceBase {
  kind: "condition";
  leftEntity: string;
  leftAs: CompareLeftAs;
  op: CompareOp;
  right: CompareValue;
  /** The upper bound, used by `between` only. */
  rightEnd: CompareValue;
  thenPieces: Piece[];
  elsePieces: Piece[];
}

/** How many of some entities are in a given state. */
export interface CountPiece extends PieceBase {
  kind: "count";
  entities: string[];
  state: string;
}

/** Any other template, kept exactly as written. */
export interface RawPiece extends PieceBase {
  kind: "raw";
  template: string;
}

export type Piece =
  | TextPiece
  | StatePiece
  | AttributePiece
  | NamePiece
  | DateTimePiece
  | ElapsedPiece
  | NumberPiece
  | ConditionPiece
  | CountPiece
  | RawPiece;

/** Conditions may nest this many levels (the top level is level 0). */
export const MAX_CONDITION_DEPTH = 1;
