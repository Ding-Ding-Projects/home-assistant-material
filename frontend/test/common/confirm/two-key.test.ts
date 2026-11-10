import { describe, expect, it } from "vitest";
import {
  bothTurned,
  emptyTwoKeyState,
  holdKey,
  isTurned,
  keyForLetter,
  KEY_STAYS_MS,
  releaseKey,
  remaining,
} from "../../../src/common/confirm/two-key";

// Protects the guard on destructive actions: one key is never enough, and a
// key that was let go stops counting after its time.

describe("two keys", () => {
  it("needs both keys", () => {
    let state = holdKey(emptyTwoKeyState(), "one");
    expect(isTurned(state, "one", 0)).toBe(true);
    expect(bothTurned(state, 0)).toBe(false);
    state = holdKey(state, "two");
    expect(bothTurned(state, 0)).toBe(true);
  });

  it("keeps a key turned for a while after it is let go", () => {
    let state = holdKey(emptyTwoKeyState(), "one");
    state = releaseKey(state, "one", 1000);
    expect(isTurned(state, "one", 1000 + KEY_STAYS_MS - 1)).toBe(true);
    expect(remaining(state, "one", 1000)).toBe(KEY_STAYS_MS);
    expect(isTurned(state, "one", 1000 + KEY_STAYS_MS)).toBe(false);
  });

  it("lets the keys be turned one after the other", () => {
    let state = holdKey(emptyTwoKeyState(), "one");
    state = releaseKey(state, "one", 1000);
    state = holdKey(state, "two");
    expect(bothTurned(state, 3000)).toBe(true);
    expect(bothTurned(state, 1000 + KEY_STAYS_MS + 1)).toBe(false);
  });

  it("does not turn a key that was never held", () => {
    const state = releaseKey(emptyTwoKeyState(), "two", 1000);
    expect(isTurned(state, "two", 1001)).toBe(false);
  });

  it("maps Q and P to the keys, in either case", () => {
    expect(keyForLetter("Q")).toBe("one");
    expect(keyForLetter("p")).toBe("two");
    expect(keyForLetter("x")).toBeUndefined();
  });
});
