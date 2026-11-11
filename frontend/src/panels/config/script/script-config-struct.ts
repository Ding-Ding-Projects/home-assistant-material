import {
  any,
  array,
  enums,
  number,
  object,
  optional,
  string,
} from "superstruct";
import { MODES } from "../../../data/script";

/** The shape a pasted script must have before the editor accepts it. */
export const scriptConfigStruct = object({
  alias: optional(string()),
  description: optional(string()),
  sequence: optional(array(any())),
  icon: optional(string()),
  mode: optional(enums([...MODES])),
  max: optional(number()),
  fields: optional(object()),
  variables: optional(object()),
});

export type MaxRunsParse =
  { valid: true; max: number } | { valid: false; empty: boolean };

/** Reads the "most runs" input: a whole number of at least 1. */
export const parseMaxRuns = (value: string): MaxRunsParse => {
  const trimmed = value.trim();
  if (trimmed === "") {
    return { valid: false, empty: true };
  }
  const max = Number(trimmed);
  if (!Number.isFinite(max) || max < 1) {
    return { valid: false, empty: false };
  }
  return { valid: true, max: Math.floor(max) };
};
