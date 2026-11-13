import { createTextPiece } from "./create-piece";
import type { Piece } from "./types";

/** A character position inside an existing text piece. */
export interface TextInsertion {
  pieceId: string;
  offset: number;
}

/** Insert a piece without changing any of the surrounding text. */
export const insertPiece = (
  pieces: Piece[],
  piece: Piece,
  position?: TextInsertion
): Piece[] => {
  const index = pieces.findIndex(({ id }) => id === position?.pieceId);
  const text = pieces[index];
  if (!position || text?.kind !== "text") {
    return [...pieces, piece];
  }
  let offset = Math.min(text.text.length, Math.max(0, position.offset));
  // A browser usually places the caret between whole characters. Also keep
  // surrogate pairs intact when an offset is supplied by a keyboard or test.
  if (/[\uDC00-\uDFFF]/.test(text.text.charAt(offset))) {
    offset++;
  }
  const before = text.text.slice(0, offset);
  const after = text.text.slice(offset);
  return [
    ...pieces.slice(0, index),
    ...(before ? [{ ...text, text: before }] : []),
    piece,
    ...(after
      ? [before ? createTextPiece(after) : { ...text, text: after }]
      : []),
    ...pieces.slice(index + 1),
  ];
};
