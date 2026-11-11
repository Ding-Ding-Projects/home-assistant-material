/**
 * Undo and redo over any immutable value. The present value is replaced by
 * each commit; earlier values are kept for undo, later ones for redo.
 */

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const MAX_UNDO_DEPTH = 500;

export const createHistory = <T>(present: T): History<T> => ({
  past: [],
  present,
  future: [],
});

/** Make a new value the present one. Clears redo; keeps at most `limit` undo steps. */
export const commit = <T>(
  history: History<T>,
  next: T,
  limit = MAX_UNDO_DEPTH
): History<T> => {
  if (Object.is(next, history.present)) {
    return history;
  }
  const past = [...history.past, history.present];
  return {
    past: past.length > limit ? past.slice(past.length - limit) : past,
    present: next,
    future: [],
  };
};

export const canUndo = <T>(history: History<T>): boolean =>
  history.past.length > 0;

export const canRedo = <T>(history: History<T>): boolean =>
  history.future.length > 0;

export const undo = <T>(history: History<T>): History<T> => {
  if (!history.past.length) {
    return history;
  }
  const previous = history.past[history.past.length - 1];
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
};

export const redo = <T>(history: History<T>): History<T> => {
  if (!history.future.length) {
    return history;
  }
  const [next, ...rest] = history.future;
  return {
    past: [...history.past, history.present],
    present: next,
    future: rest,
  };
};
