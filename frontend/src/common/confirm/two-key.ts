/**
 * Two-key confirmation: something that destroys data happens only after
 * two keys are turned and a slider is moved to its end.
 *
 * A key is turned while it is held. So that the confirmation can be given
 * with one hand, one pointer or a switch, a key stays turned for a short
 * while after it is let go: both can be turned one after the other.
 */

export type KeyName = "one" | "two";

/** How long a key stays turned after it is let go, in milliseconds. */
export const KEY_STAYS_MS = 6000;

/** The keyboard keys that turn each key, far apart on purpose. */
export const KEY_LETTERS: Record<KeyName, string> = { one: "q", two: "p" };

export interface TwoKeyState {
  /** Held now. */
  held: Record<KeyName, boolean>;
  /** Epoch milliseconds until which a key that was let go counts as turned. */
  until: Record<KeyName, number>;
}

export const emptyTwoKeyState = (): TwoKeyState => ({
  held: { one: false, two: false },
  until: { one: 0, two: 0 },
});

export const holdKey = (state: TwoKeyState, key: KeyName): TwoKeyState => ({
  held: { ...state.held, [key]: true },
  until: { ...state.until, [key]: 0 },
});

export const releaseKey = (
  state: TwoKeyState,
  key: KeyName,
  now: number
): TwoKeyState =>
  state.held[key]
    ? {
        held: { ...state.held, [key]: false },
        until: { ...state.until, [key]: now + KEY_STAYS_MS },
      }
    : state;

export const isTurned = (
  state: TwoKeyState,
  key: KeyName,
  now: number
): boolean => state.held[key] || state.until[key] > now;

export const bothTurned = (state: TwoKeyState, now: number): boolean =>
  isTurned(state, "one", now) && isTurned(state, "two", now);

/** Milliseconds a key that was let go still counts as turned. */
export const remaining = (
  state: TwoKeyState,
  key: KeyName,
  now: number
): number => (state.held[key] ? 0 : Math.max(0, state.until[key] - now));

/** The key that a keyboard key turns, if any. */
export const keyForLetter = (letter: string): KeyName | undefined => {
  const lower = letter.toLowerCase();
  return lower === KEY_LETTERS.one
    ? "one"
    : lower === KEY_LETTERS.two
      ? "two"
      : undefined;
};
