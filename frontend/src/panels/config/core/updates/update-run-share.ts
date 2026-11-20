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

/**
 * What a browser that did not start the run shows. It is derived only from
 * the shared record, so a step is never called installed: the record says
 * where the run is, not how each earlier step ended.
 */
export const sharedRunView = (
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
