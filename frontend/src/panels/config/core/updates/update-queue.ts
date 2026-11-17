import type { UpdateEntity } from "../../../../data/update";
import { latestVersionIsSkipped } from "../../../../data/update";

/**
 * The rules behind "Update everything": which updates go in which order, what
 * happens to a step while it runs, and which buttons must wait. Everything in
 * here is a plain function so that it can be tested without a page.
 */

export type UpdateRole = "supervisor" | "core" | "os" | "other";

export type QueueStepState =
  "waiting" | "updating" | "done" | "failed" | "skipped";

export interface QueueStep {
  entityId: string;
  /** The version the step has to reach. */
  targetVersion: string | null;
  state: QueueStepState;
  role: UpdateRole;
  /** The step was seen running, so a return to "available" is a failure. */
  seenInProgress: boolean;
  /** When the step was started, in milliseconds. */
  startedAt: number | null;
}

export interface QueueFailure {
  entityId: string;
  reason: "failed" | "timeout" | "not_started" | "error";
  /** Error text of a rejected call, shown in plain words. */
  message?: string;
}

export interface QueueState {
  version: 1;
  steps: QueueStep[];
  stopRequested: boolean;
  failure?: QueueFailure;
  /** The backup choice made when the queue was started. */
  backup: boolean;
}

// The hassio integration fixes these entity ids and titles; neither is
// translated, so both are safe to compare.
const SYSTEM_ENTITY_IDS: Record<string, UpdateRole> = {
  "update.home_assistant_supervisor_update": "supervisor",
  "update.home_assistant_core_update": "core",
  "update.home_assistant_operating_system_update": "os",
};

const SYSTEM_TITLES: Record<string, UpdateRole> = {
  "Home Assistant Supervisor": "supervisor",
  "Home Assistant Core": "core",
  "Home Assistant Operating System": "os",
};

/** What kind of update an entity is: one of the three system ones, or other. */
export const updateRole = (
  entity: Pick<UpdateEntity, "entity_id" | "attributes">
): UpdateRole =>
  SYSTEM_ENTITY_IDS[entity.entity_id] ??
  SYSTEM_TITLES[entity.attributes?.title || ""] ??
  "other";

/** The time one step may take before the queue stops. */
export const STEP_TIMEOUT_MS = 30 * 60 * 1000;

/** The time a started install may stay unseen before it counts as not started. */
export const STEP_START_GRACE_MS = 3 * 60 * 1000;

const ROLE_RANK: Record<UpdateRole, number> = {
  supervisor: 0,
  other: 1,
  core: 2,
  os: 3,
};

const isInProgress = (entity: UpdateEntity): boolean =>
  !!entity.attributes.in_progress;

/**
 * The order in which updates run. Updates that are already running come
 * first, because they cannot be held back. After them: the Supervisor, then
 * apps and everything else in the order given, then Core, and the operating
 * system last because it restarts the device. Skipped versions and updates
 * with nothing waiting are left out.
 */
export const orderUpdateQueue = (entities: UpdateEntity[]): UpdateEntity[] =>
  entities
    .map((entity, index) => ({ entity, index }))
    .filter(
      ({ entity }) =>
        isInProgress(entity) ||
        (entity.state === "on" && !latestVersionIsSkipped(entity))
    )
    .sort((a, b) => {
      const aRunning = isInProgress(a.entity) ? 0 : 1;
      const bRunning = isInProgress(b.entity) ? 0 : 1;
      if (aRunning !== bRunning) {
        return aRunning - bRunning;
      }
      const rank =
        ROLE_RANK[updateRole(a.entity)] - ROLE_RANK[updateRole(b.entity)];
      return rank || a.index - b.index;
    })
    .map(({ entity }) => entity);

export const createQueue = (
  entities: UpdateEntity[],
  backup: boolean
): QueueState => ({
  version: 1,
  backup,
  stopRequested: false,
  steps: orderUpdateQueue(entities).map((entity) => ({
    entityId: entity.entity_id,
    targetVersion: entity.attributes.latest_version,
    state: "waiting",
    role: updateRole(entity),
    seenInProgress: false,
    startedAt: null,
  })),
});

export type StepOutcome =
  | { kind: "running" }
  | { kind: "waiting" }
  | { kind: "done" }
  | { kind: "failed"; reason: "failed" | "timeout" | "not_started" };

/**
 * What a started step is doing. `connected` is false while the connection is
 * down, which is what a Supervisor, Core or operating system update looks
 * like from the browser; nothing is concluded then.
 */
export const evaluateStep = (
  entity: UpdateEntity | undefined,
  step: Pick<QueueStep, "targetVersion" | "seenInProgress" | "startedAt">,
  now: number,
  connected: boolean
): StepOutcome => {
  if (!connected || !entity) {
    return { kind: "waiting" };
  }
  const elapsed = step.startedAt === null ? 0 : now - step.startedAt;
  if (isInProgress(entity)) {
    return elapsed > STEP_TIMEOUT_MS
      ? { kind: "failed", reason: "timeout" }
      : { kind: "running" };
  }
  if (entity.state === "unavailable" || entity.state === "unknown") {
    return elapsed > STEP_TIMEOUT_MS
      ? { kind: "failed", reason: "timeout" }
      : { kind: "waiting" };
  }
  const reached =
    (step.targetVersion !== null &&
      entity.attributes.installed_version === step.targetVersion) ||
    entity.state === "off";
  if (reached) {
    return { kind: "done" };
  }
  // Still offered, not running.
  if (step.seenInProgress) {
    return { kind: "failed", reason: "failed" };
  }
  return elapsed > STEP_START_GRACE_MS
    ? { kind: "failed", reason: "not_started" }
    : { kind: "waiting" };
};

export interface BlockReason {
  /** The update everything else is waiting for, when it is a single one. */
  entityId?: string;
  kind: "update_running" | "queue_running";
}

/**
 * Why an update button has to wait, or undefined when it may be pressed.
 * Only one update runs at a time, wherever it was started. The extra rules
 * keep the three system updates in their order: the operating system waits
 * for Core and the Supervisor, and Core waits for the Supervisor.
 */
export const updateBlockReason = (
  entity: UpdateEntity,
  allUpdates: UpdateEntity[],
  queueActive: boolean
): BlockReason | undefined => {
  const others = allUpdates.filter(
    (other) => other.entity_id !== entity.entity_id && isInProgress(other)
  );
  const role = updateRole(entity);
  const supervisor = others.find((o) => updateRole(o) === "supervisor");
  const core = others.find((o) => updateRole(o) === "core");
  if ((role === "core" || role === "os") && supervisor) {
    return { kind: "update_running", entityId: supervisor.entity_id };
  }
  if (role === "os" && core) {
    return { kind: "update_running", entityId: core.entity_id };
  }
  if (others.length) {
    return { kind: "update_running", entityId: others[0].entity_id };
  }
  return queueActive ? { kind: "queue_running" } : undefined;
};

/** A queue is active while it has a step that is waiting or running. */
export const queueIsActive = (queue: QueueState | undefined): boolean =>
  !!queue &&
  !queue.failure &&
  queue.steps.some((s) => s.state === "waiting" || s.state === "updating");

export const queueProgress = (queue: QueueState) => {
  const total = queue.steps.length;
  const finished = queue.steps.filter(
    (s) => s.state === "done" || s.state === "skipped"
  ).length;
  const current = queue.steps.findIndex(
    (s) => s.state === "updating" || s.state === "failed"
  );
  return {
    total,
    finished,
    /** The 1-based position of the step being worked on. */
    position: current >= 0 ? current + 1 : Math.min(total, finished + 1),
    percent: total ? Math.round((finished / total) * 100) : 0,
  };
};

const STORAGE_KEY = "ha-update-queue";

const VALID_STATES: QueueStepState[] = [
  "waiting",
  "updating",
  "done",
  "failed",
  "skipped",
];

/** Reads a stored queue; anything unexpected is dropped. */
export const parseStoredQueue = (
  raw: string | null
): QueueState | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const data = JSON.parse(raw);
    if (
      !data ||
      data.version !== 1 ||
      !Array.isArray(data.steps) ||
      !data.steps.length
    ) {
      return undefined;
    }
    const steps: QueueStep[] = [];
    for (const step of data.steps) {
      if (
        typeof step?.entityId !== "string" ||
        !step.entityId.startsWith("update.") ||
        !VALID_STATES.includes(step.state)
      ) {
        return undefined;
      }
      steps.push({
        entityId: step.entityId,
        targetVersion:
          typeof step.targetVersion === "string" ? step.targetVersion : null,
        state: step.state,
        role: ["supervisor", "core", "os"].includes(step.role)
          ? step.role
          : "other",
        seenInProgress: step.seenInProgress === true,
        startedAt: typeof step.startedAt === "number" ? step.startedAt : null,
      });
    }
    const failure = data.failure;
    return {
      version: 1,
      steps,
      backup: data.backup === true,
      stopRequested: data.stopRequested === true,
      failure:
        failure && typeof failure.entityId === "string"
          ? {
              entityId: failure.entityId,
              reason: ["failed", "timeout", "not_started", "error"].includes(
                failure.reason
              )
                ? failure.reason
                : "failed",
            }
          : undefined,
    };
  } catch (_err) {
    return undefined;
  }
};

export const loadStoredQueue = (): QueueState | undefined => {
  try {
    return parseStoredQueue(window.sessionStorage.getItem(STORAGE_KEY));
  } catch (_err) {
    return undefined;
  }
};

/** Keeps only ids, versions and states; error text is not stored. */
export const storeQueue = (queue: QueueState | undefined): void => {
  try {
    const open =
      !!queue &&
      (!!queue.failure ||
        queue.steps.some(
          (s) => s.state === "waiting" || s.state === "updating"
        ));
    if (!queue || !open) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        ...queue,
        failure: queue.failure
          ? { entityId: queue.failure.entityId, reason: queue.failure.reason }
          : undefined,
      })
    );
  } catch (_err) {
    // The queue then simply does not survive a reload.
  }
};
