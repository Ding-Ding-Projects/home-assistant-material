import type {
  UpdateRunRecord,
  UpdateRunReport,
  UpdateRunState,
} from "../../../../data/auto-update";
import type { QueueState } from "./update-queue";
import { queueIsActive, queueProgress } from "./update-queue";

/**
 * The run shown in every browser. The browser that started "Update
 * everything" keeps driving it and reports its progress to the server; the
 * other browsers only read that report. Everything here is a plain function so
 * it can be tested without a page.
 */

/** The server refuses longer runs, so a longer one is simply not shared. */
export const MAX_SHARED_STEPS = 50;

/**
 * How often the driving browser reports a run that is going or waiting on a
 * failure, even when nothing changed, so other browsers know it is there.
 * A background tab may only manage once a minute.
 */
export const SHARE_HEARTBEAT_MS = 30_000;

/**
 * How long other browsers wait without a report before they say the driving
 * browser stopped responding. A Core restart empties the server's record, so
 * it never counts towards this; the wait covers a reload onto a new build, a
 * background tab that reports only once a minute and a short network loss.
 */
export const DRIVER_SILENT_MS = 5 * 60_000;

/**
 * When, on this browser's own clock, the driving browser last reported. The
 * server says how many seconds ago that was when it sent the record, so the
 * two clocks never have to agree. Undefined for an older server.
 */
export const driverSeenAt = (
  record: UpdateRunRecord | null | undefined,
  receivedAt: number
): number | undefined =>
  typeof record?.seen_ago === "number" && Number.isFinite(record.seen_ago)
    ? receivedAt - Math.max(0, record.seen_ago) * 1000
    : undefined;

export type SharedRunPhase = "running" | "driver_silent" | "finished";

/**
 * Whether a run another browser drives is still being driven, has lost its
 * browser, or has ended. Only a running or failed run can lose its browser;
 * an ended run is simply finished. Without a time of last report (an older
 * server) the run counts as driven.
 */
export const sharedRunPhase = (
  record: UpdateRunRecord | null | undefined,
  seenAt: number | undefined,
  now: number
): SharedRunPhase | undefined => {
  if (!record?.entity_ids.length) {
    return undefined;
  }
  if (record.state !== "running" && record.state !== "failed") {
    return "finished";
  }
  if (seenAt !== undefined && now - seenAt >= DRIVER_SILENT_MS) {
    return "driver_silent";
  }
  return "running";
};

/**
 * Whether the driving browser sends its report although it has not changed:
 * a report that was refused is sent again (a restarting Core refuses updates
 * it has not loaded yet), and a run that is going is reported at a steady
 * pace so other browsers can tell it from one whose browser was closed.
 */
export const shareDue = (opts: {
  key: string;
  sentKey: string | undefined;
  state: UpdateRunState;
  lastSentAt: number;
  now: number;
}): boolean => {
  if (opts.key !== opts.sentKey) {
    return true;
  }
  const driven = opts.state === "running" || opts.state === "failed";
  return driven && opts.now - opts.lastSentAt >= SHARE_HEARTBEAT_MS;
};

/** What the driving browser reports for its queue, or undefined for none. */
export const runReportFromQueue = (
  queue: QueueState | undefined
): UpdateRunReport | undefined => {
  if (!queue?.steps.length || queue.steps.length > MAX_SHARED_STEPS) {
    return undefined;
  }
  const progress = queueProgress(queue);
  const current = queue.steps.find(
    (step) => step.state === "updating" || step.state === "failed"
  );
  let state: UpdateRunState;
  if (queue.failure) {
    state = "failed";
  } else if (queueIsActive(queue)) {
    state = "running";
  } else if (queue.stopRequested) {
    state = "cancelled";
  } else {
    state = "done";
  }
  const started = runStartedAt(queue);
  return {
    entity_ids: queue.steps.map((step) => step.entityId),
    position: Math.max(1, Math.min(progress.total, progress.position)),
    state,
    current: current?.entityId ?? null,
    ...(started === undefined
      ? {}
      : { started: new Date(started).toISOString() }),
  };
};

/**
 * When the run started, in milliseconds. A queue stored by an older build has
 * no start time of its own, so its first started step stands in for it.
 */
const runStartedAt = (queue: QueueState): number | undefined => {
  if (typeof queue.startedAt === "number" && Number.isFinite(queue.startedAt)) {
    return queue.startedAt;
  }
  const stepStarts = queue.steps
    .map((step) => step.startedAt)
    .filter(
      (value): value is number =>
        typeof value === "number" && Number.isFinite(value)
    );
  return stepStarts.length ? Math.min(...stepStarts) : undefined;
};

export type SharedStepState =
  "finished" | "current" | "failed" | "waiting" | "unknown";

export interface SharedRunView {
  state: UpdateRunState;
  position: number;
  total: number;
  /** Updates the run has moved past. */
  finished: number;
  percent: number;
  current: string | null;
  steps: { entityId: string; state: SharedStepState }[];
}

/** What this browser itself sees of an update entity. */
export interface SharedStepEntity {
  state: string;
  /** `in_progress` is read: true or a percentage while installing. */
  attributes: Readonly<Record<string, unknown>>;
}

/**
 * What a browser that did not start the run shows. It starts from the shared
 * record, which says where the run is, not how each step ended; a step is
 * never called installed. When this browser's own view of the update
 * entities is given (`entities`), it corrects the record with what it sees:
 * an update that is installing now is shown as installing, one with nothing
 * left to install is shown as finished, and, when the driving browser has
 * stopped responding (`silent`), the step it was on is no longer shown as
 * installing unless it really is. The finished count follows the same steps.
 */
export const sharedRunView = (
  record: UpdateRunRecord | null | undefined,
  entities?: Readonly<Record<string, SharedStepEntity | undefined>>,
  silent = false
): SharedRunView | undefined => {
  const base = recordRunView(record);
  if (!base || !entities) {
    return base;
  }
  const steps = base.steps.map(({ entityId, state }) => ({
    entityId,
    state: correctedStepState(state, entities[entityId], silent),
  }));
  const finished =
    base.state === "done"
      ? base.total
      : steps.filter((step) => step.state === "finished").length;
  const current =
    steps.find((step) => step.state === "current")?.entityId ??
    (silent ? null : base.current);
  return {
    ...base,
    finished,
    percent: Math.round((finished / base.total) * 100),
    current,
    steps,
  };
};

const correctedStepState = (
  fromRecord: SharedStepState,
  entity: SharedStepEntity | undefined,
  silent: boolean
): SharedStepState => {
  if (!entity) {
    return silent && fromRecord === "current" ? "waiting" : fromRecord;
  }
  if (entity.attributes.in_progress) {
    return "current";
  }
  if (entity.state === "off") {
    return "finished";
  }
  // Still something to install and nothing installing: the step the silent
  // browser was on is not going on by itself.
  if (silent && fromRecord === "current") {
    return "waiting";
  }
  return fromRecord;
};

const recordRunView = (
  record: UpdateRunRecord | null | undefined
): SharedRunView | undefined => {
  if (!record?.entity_ids.length) {
    return undefined;
  }
  const total = record.entity_ids.length;
  const position = Math.max(1, Math.min(total, record.position));
  const finished =
    record.state === "done" || record.state === "cancelled"
      ? total
      : Math.max(0, position - 1);
  const current =
    record.current && record.entity_ids.includes(record.current)
      ? record.current
      : record.state === "running"
        ? record.entity_ids[position - 1]
        : null;
  const steps = record.entity_ids.map((entityId, index) => {
    let state: SharedStepState;
    if (record.state === "cancelled") {
      // A stopped run marks the rest as passed over; the record cannot tell
      // which ones were installed, so none is claimed.
      state = "unknown";
    } else if (record.state === "done" || index < position - 1) {
      state = "finished";
    } else if (index === position - 1 && record.state === "running") {
      state = "current";
    } else if (index === position - 1 && record.state === "failed") {
      state = "failed";
    } else {
      state = "waiting";
    }
    return { entityId, state };
  });
  return {
    state: record.state,
    position,
    total,
    finished,
    percent: Math.round((finished / total) * 100),
    current,
    steps,
  };
};
