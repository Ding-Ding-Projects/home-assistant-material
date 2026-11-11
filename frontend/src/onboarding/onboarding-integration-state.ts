/**
 * State machine of the first-run integrations step. Pure functions over an
 * immutable state, so that it can be tested alone. The one rule it exists to
 * keep: a flow that fails, is cancelled, throws or never reports back always
 * ends in a state where the buttons are enabled again and every other choice
 * is still there.
 */

/** Where one discovered integration stands. */
export type ItemPhase = "idle" | "running" | "added" | "needs_input" | "failed";

/** Where the whole step stands. */
export type StepPhase = "idle" | "running" | "failed" | "done";

/** How one flow ended. */
export type FlowOutcome = "added" | "needs_input" | "failed";

/** Why a flow failed, as a code the page turns into a plain sentence. */
export type FailureReason = "timed_out" | "ended_without_entry" | "error";

export interface ItemFailure {
  reason: FailureReason;
  /** The message the server gave, when it gave one. */
  detail?: string;
}

export interface IntegrationState {
  readonly phases: Readonly<Record<string, ItemPhase>>;
  readonly failures: Readonly<Record<string, ItemFailure>>;
  /** Items the person has switched on. */
  readonly chosen: ReadonlySet<string>;
  /** Items seen before, so only new ones start switched on. */
  readonly known: ReadonlySet<string>;
  /** The flow whose dialog is open, if any. Only one runs at a time. */
  readonly runningId?: string;
}

export const initialState = (): IntegrationState => ({
  phases: {},
  failures: {},
  chosen: new Set(),
  known: new Set(),
});

export const phaseOf = (state: IntegrationState, id: string): ItemPhase =>
  state.phases[id] ?? "idle";

const withPhase = (
  state: IntegrationState,
  id: string,
  phase: ItemPhase
): IntegrationState => ({
  ...state,
  phases: { ...state.phases, [id]: phase },
});

/** Whether an item can still be set up (not added, not running). */
const isOpen = (state: IntegrationState, id: string): boolean => {
  const phase = phaseOf(state, id);
  return phase !== "added" && phase !== "running";
};

/**
 * Keeps the choices of items that still exist and switches new ones on. An
 * earlier decision to leave an item off is kept. Items that are gone are
 * dropped together with their result.
 */
export const syncItems = (
  state: IntegrationState,
  ids: readonly string[]
): IntegrationState => {
  const present = new Set(ids);
  const chosen = new Set<string>();
  const known = new Set<string>();
  for (const id of ids) {
    known.add(id);
    if (
      (!state.known.has(id) || state.chosen.has(id)) &&
      phaseOf(state, id) !== "added"
    ) {
      chosen.add(id);
    }
  }
  // An added item stays counted after its flow has left the list.
  const keep = <T>(record: Readonly<Record<string, T>>) =>
    Object.fromEntries(
      Object.entries(record).filter(
        ([id]) =>
          present.has(id) ||
          id === state.runningId ||
          state.phases[id] === "added"
      )
    );
  const sameChoice =
    chosen.size === state.chosen.size &&
    [...chosen].every((id) => state.chosen.has(id));
  const sameKnown =
    known.size === state.known.size &&
    [...known].every((id) => state.known.has(id));
  const phases = keep(state.phases);
  const failures = keep(state.failures);
  if (
    sameChoice &&
    sameKnown &&
    Object.keys(phases).length === Object.keys(state.phases).length &&
    Object.keys(failures).length === Object.keys(state.failures).length
  ) {
    return state;
  }
  return { ...state, chosen, known, phases, failures };
};

/** Switches one item on or off. Nothing changes while it runs or once added. */
export const setChoice = (
  state: IntegrationState,
  id: string,
  on: boolean
): IntegrationState => {
  if (!isOpen(state, id) || state.chosen.has(id) === on) {
    return state;
  }
  const chosen = new Set(state.chosen);
  if (on) {
    chosen.add(id);
  } else {
    chosen.delete(id);
  }
  return { ...state, chosen };
};

/** Starts a flow. Only one runs at a time and an added item never runs again. */
export const beginFlow = (
  state: IntegrationState,
  id: string
): IntegrationState => {
  if (state.runningId !== undefined || !isOpen(state, id)) {
    return state;
  }
  const { [id]: _cleared, ...failures } = state.failures;
  return { ...withPhase(state, id, "running"), failures, runningId: id };
};

/**
 * Ends a flow, whatever way it ended. It always clears the running flow so
 * no button can stay off, and it leaves every other choice as it was. An item
 * that was added is no longer chosen; one that failed or needs input stays
 * chosen so it can be tried again.
 */
export const endFlow = (
  state: IntegrationState,
  id: string,
  outcome: FlowOutcome,
  failure?: ItemFailure
): IntegrationState => {
  const next = withPhase(state, id, outcome);
  const chosen = new Set(next.chosen);
  const failures = { ...next.failures };
  if (outcome === "added") {
    chosen.delete(id);
    delete failures[id];
  } else if (outcome === "failed" && failure) {
    failures[id] = failure;
  } else {
    delete failures[id];
  }
  return {
    ...next,
    chosen,
    failures,
    runningId: state.runningId === id ? undefined : state.runningId,
  };
};

/**
 * Recovery for a state that says something runs while nothing can report
 * back (for example the person left the step). Turns the running item into a
 * failure that can be retried and enables the buttons again.
 */
export const recoverStuck = (state: IntegrationState): IntegrationState =>
  state.runningId === undefined
    ? state
    : endFlow(state, state.runningId, "failed", { reason: "timed_out" });

export const stepPhase = (state: IntegrationState): StepPhase => {
  if (state.runningId !== undefined) {
    return "running";
  }
  const phases = Object.values(state.phases);
  if (phases.includes("failed")) {
    return "failed";
  }
  if (phases.includes("added") && pendingIds(state).length === 0) {
    return "done";
  }
  return "idle";
};

/** Chosen items that can still be set up, in the order they were chosen. */
export const pendingIds = (state: IntegrationState): string[] =>
  [...state.chosen].filter((id) => isOpen(state, id));

export interface ButtonState {
  /** Starts every chosen item one after another. */
  setUpChosen: boolean;
  /** Moves on to the next step. Always possible: skipping is a choice. */
  next: boolean;
  /** Leaves this step without setting anything up. Always possible. */
  skip: boolean;
}

/** When each button is enabled. Only the set-up buttons wait for a flow. */
export const buttonState = (state: IntegrationState): ButtonState => ({
  setUpChosen: state.runningId === undefined && pendingIds(state).length > 0,
  next: true,
  skip: true,
});

/** Whether the Set up button of one item is enabled. */
export const canSetUpItem = (state: IntegrationState, id: string): boolean =>
  state.runningId === undefined && isOpen(state, id);

/** Whether the switch of one item can be changed. */
export const canChoose = (state: IntegrationState, id: string): boolean =>
  isOpen(state, id);

export interface Summary {
  chosen: number;
  added: number;
  failed: number;
  needsInput: number;
  running: number;
}

/** Counts for the live summary line. */
export const summarize = (state: IntegrationState): Summary => {
  const phases = Object.values(state.phases);
  const count = (phase: ItemPhase) => phases.filter((p) => p === phase).length;
  return {
    chosen: pendingIds(state).length,
    added: count("added"),
    failed: count("failed"),
    needsInput: count("needs_input"),
    running: count("running"),
  };
};

/** What the configuration dialog tells when it closes. */
export interface DialogResult {
  flowFinished: boolean;
  entryId?: string;
}

/**
 * Turns the dialog result into an outcome. A flow that finished with an entry
 * was added; one that finished without an entry was aborted, which is a
 * failure; one that was closed before finishing still needs input.
 */
export const outcomeFromDialog = (result: DialogResult): FlowOutcome => {
  if (!result.flowFinished) {
    return "needs_input";
  }
  return result.entryId ? "added" : "failed";
};

/** Longest wait for one dialog before the flow counts as failed. */
export const FLOW_WAIT_LIMIT_MS = 15 * 60 * 1000;

export interface StateStore {
  get: () => IntegrationState;
  set: (state: IntegrationState) => void;
}

/**
 * Runs one flow through the state machine. Whatever `run` does (resolve,
 * throw, or never answer), the state ends with no flow running.
 */
export const runFlow = async (
  store: StateStore,
  id: string,
  run: (id: string) => Promise<DialogResult>,
  limitMs: number = FLOW_WAIT_LIMIT_MS
): Promise<void> => {
  const started = beginFlow(store.get(), id);
  if (started.runningId !== id) {
    return;
  }
  store.set(started);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      run(id),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), limitMs);
      }),
    ]);
    if (result === "timeout") {
      store.set(endFlow(store.get(), id, "failed", { reason: "timed_out" }));
      return;
    }
    const outcome = outcomeFromDialog(result);
    store.set(
      endFlow(
        store.get(),
        id,
        outcome,
        outcome === "failed" ? { reason: "ended_without_entry" } : undefined
      )
    );
  } catch (err) {
    const detail =
      err instanceof Error && err.message.trim() ? err.message : undefined;
    store.set(endFlow(store.get(), id, "failed", { reason: "error", detail }));
  } finally {
    clearTimeout(timer);
  }
};

/** Runs several flows one after another and stops early on request. */
export const runFlowQueue = async (
  store: StateStore,
  ids: readonly string[],
  run: (id: string) => Promise<DialogResult>,
  shouldStop: () => boolean,
  limitMs: number = FLOW_WAIT_LIMIT_MS
): Promise<void> => {
  for (const id of ids) {
    if (shouldStop()) {
      return;
    }
    // The dialogs are meant to run one after another.
    // eslint-disable-next-line no-await-in-loop
    await runFlow(store, id, run, limitMs);
  }
};
