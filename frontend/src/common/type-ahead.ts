/**
 * Keeps what is typed while a search dialog is still opening.
 *
 * A field that hands its typing over to a dialog loses focus at once, and the
 * dialog's own field can take a moment to appear. Keys pressed in between
 * would go nowhere. Collecting starts in the same turn as the first key, so
 * even a fast burst of keys is kept, and the dialog takes the text when its
 * field has focus.
 */
let buffer = "";
let active = false;
let giveUpTimer: number | undefined;

// If no dialog ever takes the text, stop holding the keyboard after this long.
const GIVE_UP_MS = 6000;

const onKeydown = (ev: KeyboardEvent) => {
  if (ev.ctrlKey || ev.metaKey || ev.altKey || ev.isComposing) {
    return;
  }
  if (ev.key.length === 1) {
    buffer += ev.key;
  } else if (ev.key === "Backspace") {
    buffer = buffer.slice(0, -1);
  } else {
    return;
  }
  ev.preventDefault();
  ev.stopPropagation();
};

export const stopTypeAhead = (): void => {
  if (!active) {
    return;
  }
  active = false;
  buffer = "";
  window.clearTimeout(giveUpTimer);
  window.removeEventListener("keydown", onKeydown, true);
};

/** Starts collecting, or adds to what is already collected. */
export const startTypeAhead = (initial = ""): void => {
  if (!active) {
    active = true;
    buffer = "";
    window.addEventListener("keydown", onKeydown, true);
  }
  buffer += initial;
  window.clearTimeout(giveUpTimer);
  giveUpTimer = window.setTimeout(stopTypeAhead, GIVE_UP_MS);
};

export const isTypeAheadActive = (): boolean => active;

/** Returns everything collected and stops collecting. */
export const takeTypeAhead = (): string => {
  const typed = buffer;
  stopTypeAhead();
  return typed;
};
