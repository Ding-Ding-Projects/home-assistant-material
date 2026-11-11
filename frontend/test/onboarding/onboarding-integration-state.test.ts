import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DialogResult,
  IntegrationState,
} from "../../src/onboarding/onboarding-integration-state";
import {
  beginFlow,
  buttonState,
  canSetUpItem,
  endFlow,
  initialState,
  outcomeFromDialog,
  pendingIds,
  phaseOf,
  recoverStuck,
  runFlow,
  runFlowQueue,
  setChoice,
  stepPhase,
  summarize,
  syncItems,
} from "../../src/onboarding/onboarding-integration-state";

const store = (start: IntegrationState) => {
  let state = start;
  return {
    get: () => state,
    set: (next: IntegrationState) => {
      state = next;
    },
    now: () => state,
  };
};

describe("syncItems", () => {
  it("switches new items on and keeps a decision to leave one off", () => {
    let state = syncItems(initialState(), ["a", "b"]);
    expect([...state.chosen]).toEqual(["a", "b"]);
    state = setChoice(state, "b", false);
    state = syncItems(state, ["a", "b", "c"]);
    expect([...state.chosen].sort()).toEqual(["a", "c"]);
  });

  it("drops items that are gone and returns the same state when nothing changed", () => {
    const state = syncItems(initialState(), ["a", "b"]);
    expect(syncItems(state, ["a", "b"])).toBe(state);
    expect([...syncItems(state, ["a"]).chosen]).toEqual(["a"]);
  });

  it("keeps an added item counted after its flow has left the list", () => {
    let state = syncItems(initialState(), ["a", "b"]);
    state = endFlow(beginFlow(state, "a"), "a", "added");
    state = syncItems(state, ["b"]);
    expect(phaseOf(state, "a")).toBe("added");
    expect(summarize(state).added).toBe(1);
  });
});

describe("flow transitions", () => {
  it("allows one running flow at a time", () => {
    const state = beginFlow(syncItems(initialState(), ["a", "b"]), "a");
    expect(state.runningId).toBe("a");
    expect(beginFlow(state, "b")).toBe(state);
    expect(canSetUpItem(state, "b")).toBe(false);
  });

  it("removes an added item from the choice and keeps the others", () => {
    let state = syncItems(initialState(), ["a", "b"]);
    state = endFlow(beginFlow(state, "a"), "a", "added");
    expect(phaseOf(state, "a")).toBe("added");
    expect(pendingIds(state)).toEqual(["b"]);
    expect(beginFlow(state, "a")).toBe(state);
    expect(setChoice(state, "a", true)).toBe(state);
  });

  it("keeps a failed item chosen with its reason and lets it run again", () => {
    let state = syncItems(initialState(), ["a"]);
    state = endFlow(beginFlow(state, "a"), "a", "failed", {
      reason: "error",
      detail: "boom",
    });
    expect(state.failures.a).toEqual({ reason: "error", detail: "boom" });
    expect(stepPhase(state)).toBe("failed");
    state = beginFlow(state, "a");
    expect(state.failures.a).toBeUndefined();
    expect(phaseOf(state, "a")).toBe("running");
  });

  it("reports done once something was added and nothing is left to set up", () => {
    let state = syncItems(initialState(), ["a"]);
    expect(stepPhase(state)).toBe("idle");
    state = endFlow(beginFlow(state, "a"), "a", "added");
    expect(stepPhase(state)).toBe("done");
  });
});

describe("buttons", () => {
  it("enables set up only while nothing runs and something is chosen", () => {
    let state = syncItems(initialState(), ["a"]);
    expect(buttonState(state).setUpChosen).toBe(true);
    state = beginFlow(state, "a");
    expect(buttonState(state)).toEqual({
      setUpChosen: false,
      next: true,
      skip: true,
    });
    state = setChoice(endFlow(state, "a", "added"), "a", false);
    expect(buttonState(state).setUpChosen).toBe(false);
  });

  it("never leaves the buttons off after a failed flow (stuck buttons)", () => {
    let state = syncItems(initialState(), ["a", "b"]);
    state = endFlow(beginFlow(state, "a"), "a", "failed", {
      reason: "ended_without_entry",
    });
    expect(state.runningId).toBeUndefined();
    expect(buttonState(state).setUpChosen).toBe(true);
    expect(canSetUpItem(state, "a")).toBe(true);
    expect(canSetUpItem(state, "b")).toBe(true);
    expect([...state.chosen]).toEqual(["a", "b"]);
  });

  it("recovers a state that says a flow runs when nothing can answer", () => {
    const stuck = beginFlow(syncItems(initialState(), ["a", "b"]), "a");
    expect(buttonState(stuck).setUpChosen).toBe(false);
    const recovered = recoverStuck(stuck);
    expect(recovered.runningId).toBeUndefined();
    expect(buttonState(recovered).setUpChosen).toBe(true);
    expect(recovered.failures.a?.reason).toBe("timed_out");
    expect(recoverStuck(recovered)).toBe(recovered);
  });
});

describe("summarize and outcomeFromDialog", () => {
  it("counts every kind", () => {
    let state = syncItems(initialState(), ["a", "b", "c", "d"]);
    state = endFlow(beginFlow(state, "a"), "a", "added");
    state = endFlow(beginFlow(state, "b"), "b", "failed", { reason: "error" });
    state = endFlow(beginFlow(state, "c"), "c", "needs_input");
    expect(summarize(state)).toEqual({
      chosen: 3,
      added: 1,
      failed: 1,
      needsInput: 1,
      running: 0,
    });
  });

  it("maps the dialog result", () => {
    expect(outcomeFromDialog({ flowFinished: false })).toBe("needs_input");
    expect(outcomeFromDialog({ flowFinished: true, entryId: "e" })).toBe(
      "added"
    );
    expect(outcomeFromDialog({ flowFinished: true })).toBe("failed");
  });
});

describe("runFlow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("ends a thrown flow with the buttons enabled and the other choices kept", async () => {
    const s = store(syncItems(initialState(), ["a", "b"]));
    await runFlow(s, "a", () => Promise.reject(new Error("no route")));
    expect(s.now().runningId).toBeUndefined();
    expect(s.now().failures.a).toEqual({ reason: "error", detail: "no route" });
    expect(buttonState(s.now()).setUpChosen).toBe(true);
    expect([...s.now().chosen]).toEqual(["a", "b"]);
  });

  it("ends a flow that never answers after the limit", async () => {
    vi.useFakeTimers();
    const s = store(syncItems(initialState(), ["a"]));
    const done = runFlow(
      s,
      "a",
      () =>
        new Promise<DialogResult>(() => {
          // never settles
        }),
      1000
    );
    expect(s.now().runningId).toBe("a");
    await vi.advanceTimersByTimeAsync(1000);
    await done;
    expect(s.now().runningId).toBeUndefined();
    expect(s.now().failures.a?.reason).toBe("timed_out");
  });

  it("treats a cancelled dialog as needing input and keeps it chosen", async () => {
    const s = store(syncItems(initialState(), ["a"]));
    await runFlow(s, "a", () => Promise.resolve({ flowFinished: false }));
    expect(phaseOf(s.now(), "a")).toBe("needs_input");
    expect([...s.now().chosen]).toEqual(["a"]);
    expect(buttonState(s.now()).setUpChosen).toBe(true);
  });

  it("does not start a second flow while one runs", async () => {
    const s = store(beginFlow(syncItems(initialState(), ["a", "b"]), "a"));
    const run = vi.fn(() => Promise.resolve({ flowFinished: true }));
    await runFlow(s, "b", run);
    expect(run).not.toHaveBeenCalled();
    expect(s.now().runningId).toBe("a");
  });
});

describe("runFlowQueue", () => {
  it("goes on after a failure and stops when asked", async () => {
    const s = store(syncItems(initialState(), ["a", "b", "c"]));
    let stop = false;
    await runFlowQueue(
      s,
      ["a", "b", "c"],
      (id) => {
        if (id === "a") {
          return Promise.reject(new Error("x"));
        }
        stop = true;
        return Promise.resolve({ flowFinished: true, entryId: "e" });
      },
      () => stop
    );
    expect(phaseOf(s.now(), "a")).toBe("failed");
    expect(phaseOf(s.now(), "b")).toBe("added");
    expect(phaseOf(s.now(), "c")).toBe("idle");
    expect(s.now().runningId).toBeUndefined();
  });
});
