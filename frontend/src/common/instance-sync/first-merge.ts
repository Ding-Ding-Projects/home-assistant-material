/**
 * A small signal that the copy of the settings saved on the instance has been
 * merged into this browser for the first time since the page opened. Features
 * that decide something once at start (such as covering the interface for a
 * lock that is locked on start) look again when it fires, because on a fresh
 * browser what they need only arrives with that copy.
 */

let done = false;
const waiting = new Set<() => void>();

/** Called by the settings sync once the instance copy has been merged. */
export const markFirstInstanceMerge = (): void => {
  if (done) {
    return;
  }
  done = true;
  const callbacks = [...waiting];
  waiting.clear();
  callbacks.forEach((callback) => callback());
};

/**
 * Runs the callback once, after the first merge (at once when it has already
 * happened). Returns a function that cancels a callback still waiting.
 */
export const onFirstInstanceMerge = (callback: () => void): (() => void) => {
  if (done) {
    callback();
    return () => undefined;
  }
  waiting.add(callback);
  return () => {
    waiting.delete(callback);
  };
};

/** For tests: forgets that the merge happened. */
export const resetFirstInstanceMerge = (): void => {
  done = false;
  waiting.clear();
};
