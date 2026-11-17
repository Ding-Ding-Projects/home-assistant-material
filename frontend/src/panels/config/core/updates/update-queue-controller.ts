import type { ReactiveController, ReactiveControllerHost } from "lit";
import { supportsFeature } from "../../../../common/entity/supports-feature";
import { installUpdatesTracked } from "../../../../components/update-progress/update-install-tracker";
import { isConnectionLostError } from "../../../../components/update-progress/update-progress-logic";
import { extractApiErrorMessage } from "../../../../data/hassio/common";
import type { UpdateEntity } from "../../../../data/update";
import { UpdateEntityFeature } from "../../../../data/update";
import type { HomeAssistant } from "../../../../types";
import type { QueueFailure, QueueState, QueueStep } from "./update-queue";
import {
  createQueue,
  evaluateStep,
  loadStoredQueue,
  queueIsActive,
  roleRestartsSystem,
  stepDone,
  storeQueue,
  SYSTEM_STEP_SETTLE_MS,
} from "./update-queue";

/** How often a running step is looked at when no state change arrives. */
const TICK_MS = 5000;

export type QueueAnnouncement =
  | { kind: "start"; entityId: string }
  | { kind: "done"; entityId: string }
  | { kind: "failed"; entityId: string }
  | { kind: "finished" }
  | { kind: "stopped" };

/**
 * Runs the "Update everything" queue for the updates page: one install at a
 * time, kept in the session so that a restart of Home Assistant, the
 * Supervisor or the device does not lose the rest. It never starts by
 * itself; a person has to press the button, and a stored queue is only
 * resumed, never created.
 */
export class UpdateQueueController implements ReactiveController {
  private _host: ReactiveControllerHost;

  private _getHass: () => HomeAssistant;

  private _timer?: ReturnType<typeof setInterval>;

  public queue?: QueueState;

  /** The latest change worth announcing to a screen reader. */
  public announcement?: QueueAnnouncement;

  /** Error text of a refused call; it is never stored. */
  public failureMessage?: string;

  /**
   * A queue was restored after a reload and the page has no real data yet, so
   * a restart-prone step is neither done nor failed: the card says it is
   * checking. Never stored.
   */
  public checking = false;

  private _restoredAt = 0;

  /** Steps whose install call has not answered yet. */
  private _calling = new Set<string>();

  constructor(host: ReactiveControllerHost, getHass: () => HomeAssistant) {
    this._host = host;
    this._getHass = getHass;
    host.addController(this);
  }

  hostConnected() {
    this.queue = loadStoredQueue();
    this._beginChecking();
    // After a reload onto a new build the stored queue may already be done:
    // settle that before the card first shows anything.
    this.tick();
    this._timer = setInterval(() => this.tick(), TICK_MS);
  }

  hostDisconnected() {
    clearInterval(this._timer);
    this._timer = undefined;
  }

  // A step that restarts the system may have been left running or failed by
  // the reload that this page is the result of. Until the first evaluation
  // with real data it is judged by nobody, and its old idle time is dropped.
  private _beginChecking(): void {
    this.checking = false;
    const queue = this.queue;
    if (
      !queue ||
      !queue.steps.some(
        (step) =>
          roleRestartsSystem(step.role) &&
          (step.state === "updating" || step.state === "failed")
      )
    ) {
      return;
    }
    this.checking = true;
    this._restoredAt = Date.now();
    this.queue = {
      ...queue,
      steps: queue.steps.map((step) =>
        step.state === "updating" ? { ...step, idleSince: null } : step
      ),
    };
  }

  // Whether the page now knows enough to judge the restored step.
  private _hasRealData(hass: HomeAssistant): boolean {
    if (hass.connected === false) {
      return false;
    }
    const ids = this.queue?.steps.map((step) => step.entityId) ?? [];
    return ids.some((id) => !!hass.states[id]) || !!hass.config?.version;
  }

  public get active(): boolean {
    return queueIsActive(this.queue);
  }

  /** Builds the queue from the updates that are ready and starts the first. */
  public start(entities: UpdateEntity[], backup: boolean): void {
    if (this.queue && (this.active || this.queue.failure)) {
      return;
    }
    const queue = createQueue(entities, backup);
    if (!queue.steps.length) {
      return;
    }
    this.failureMessage = undefined;
    this._commit(queue);
    this.tick();
  }

  /** The running step finishes; the ones after it are not started. */
  public stopAfterCurrent(): void {
    if (!this.queue) {
      return;
    }
    this._commit({ ...this.queue, stopRequested: true });
    this.tick();
  }

  /** Sends the failed step again. */
  public retry(): void {
    const queue = this.queue;
    if (!queue?.failure) {
      return;
    }
    const { entityId } = queue.failure;
    this.failureMessage = undefined;
    this._commit({
      ...queue,
      failure: undefined,
      steps: queue.steps.map((step) =>
        step.entityId === entityId
          ? {
              ...step,
              state: "waiting",
              seenInProgress: false,
              startedAt: null,
              idleSince: null,
            }
          : step
      ),
    });
    this.tick();
  }

  /** Leaves the failed step out and goes on with the rest. */
  public skip(): void {
    const queue = this.queue;
    if (!queue?.failure) {
      return;
    }
    const { entityId } = queue.failure;
    this.failureMessage = undefined;
    this._commit({
      ...queue,
      failure: undefined,
      steps: queue.steps.map((step) =>
        step.entityId === entityId
          ? { ...step, state: "skipped" as const }
          : step
      ),
    });
    this.tick();
  }

  /** Closes the card of a finished or stopped queue. */
  public dismiss(): void {
    if (this.queue && !this.active && !this.queue.failure) {
      this.failureMessage = undefined;
      this._commit(undefined);
    }
  }

  /** Looks at the running step and starts the next one when it is time. */
  public tick(): void {
    const hass = this._getHass();
    if (!this.queue || !hass?.states) {
      return;
    }
    const connected = hass.connected !== false;
    if (this.checking) {
      const timedOut = Date.now() - this._restoredAt > SYSTEM_STEP_SETTLE_MS;
      if (!this._hasRealData(hass) && !timedOut) {
        return;
      }
      this.checking = false;
      this._host.requestUpdate();
    }
    if (this.queue.failure) {
      // A step that was judged failed but whose update has since arrived was
      // not a failure: a real update can look stuck for a while, and a call
      // that was refused while the system restarted says nothing about the
      // result. The queue carries on.
      const failedId = this.queue.failure.entityId;
      const failed = this.queue.steps.find(
        (step) => step.entityId === failedId
      );
      if (
        !connected ||
        !failed ||
        !stepDone(
          hass.states[failedId] as UpdateEntity | undefined,
          failed,
          hass.config?.version
        )
      ) {
        return;
      }
      this.failureMessage = undefined;
      this.announcement = { kind: "done", entityId: failedId };
      this._commit({
        ...this.queue,
        failure: undefined,
        steps: this.queue.steps.map((step) =>
          step.entityId === failedId
            ? { ...step, state: "done" as const }
            : step
        ),
      });
    }
    const queue = this.queue;
    let changed = false;
    const steps = queue.steps.map((step) => ({ ...step }));
    let failure: QueueFailure | undefined;
    let announcement: QueueAnnouncement | undefined;
    let toStart: QueueStep | undefined;

    for (;;) {
      const current = steps.find((step) => step.state === "updating");
      if (current) {
        const entity = hass.states[current.entityId] as
          UpdateEntity | undefined;
        if (stepDone(entity, current, hass.config?.version)) {
          // Already at the target, for instance after a reload onto the new
          // build: finished, whatever the entity still says.
          current.state = "done";
          announcement = { kind: "done", entityId: current.entityId };
          changed = true;
          continue;
        }
        if (entity?.attributes.in_progress && !current.seenInProgress) {
          current.seenInProgress = true;
          changed = true;
        }
        // Track how long the update has sat at "available, not running".
        const idleNow =
          connected &&
          !!entity &&
          entity.state === "on" &&
          !entity.attributes.in_progress;
        if (idleNow && current.idleSince === null) {
          current.idleSince = Date.now();
          changed = true;
        } else if (!idleNow && current.idleSince !== null) {
          current.idleSince = null;
          changed = true;
        }
        const outcome = evaluateStep(
          entity,
          current,
          Date.now(),
          connected,
          this._calling.has(current.entityId)
        );
        if (outcome.kind === "done") {
          current.state = "done";
          announcement = { kind: "done", entityId: current.entityId };
          changed = true;
          continue;
        }
        if (outcome.kind === "failed") {
          current.state = "failed";
          failure = { entityId: current.entityId, reason: outcome.reason };
          announcement = { kind: "failed", entityId: current.entityId };
          changed = true;
        }
        break;
      }
      const next = steps.find((step) => step.state === "waiting");
      if (!next) {
        if (changed && !failure) {
          announcement = { kind: "finished" };
        }
        break;
      }
      if (queue.stopRequested) {
        for (const step of steps) {
          if (step.state === "waiting") {
            step.state = "skipped";
          }
        }
        announcement = { kind: "stopped" };
        changed = true;
        break;
      }
      if (!connected) {
        break;
      }
      const entity = hass.states[next.entityId] as UpdateEntity | undefined;
      const atTarget = stepDone(entity, next, hass.config?.version);
      if (
        !entity ||
        atTarget ||
        entity.state === "off" ||
        (next.targetVersion !== null &&
          entity.attributes.installed_version === next.targetVersion)
      ) {
        // Gone, or already at the target: there is nothing to install.
        next.state = entity || atTarget ? "done" : "skipped";
        changed = true;
        continue;
      }
      next.state = "updating";
      next.startedAt = Date.now();
      next.idleSince = null;
      next.seenInProgress = !!entity.attributes.in_progress;
      announcement = { kind: "start", entityId: next.entityId };
      changed = true;
      if (!entity.attributes.in_progress) {
        toStart = next;
      }
      break;
    }

    if (changed) {
      this.announcement = announcement;
      this._commit({ ...queue, steps, failure });
    }
    if (toStart) {
      this._install(toStart.entityId, queue.backup);
    }
  }

  private async _install(entityId: string, backup: boolean): Promise<void> {
    const hass = this._getHass();
    const entity = hass.states[entityId] as UpdateEntity | undefined;
    const withBackup =
      backup && !!entity && supportsFeature(entity, UpdateEntityFeature.BACKUP);
    const step = this.queue?.steps.find((s) => s.entityId === entityId);
    const restarts = roleRestartsSystem(step?.role);
    this._calling.add(entityId);
    let refused: string | undefined;
    try {
      await installUpdatesTracked(hass, [entityId], false, withBackup);
    } catch (err: any) {
      // A lost connection is what these updates look like from the browser.
      // For an update that restarts the system any rejection can be the
      // restart cutting the call off, so it is judged by the result below.
      if (!isConnectionLostError(err)) {
        refused = extractApiErrorMessage(err) || "";
      }
    } finally {
      this._calling.delete(entityId);
    }
    if (refused !== undefined) {
      const current = this._getHass();
      const latest = current.states[entityId] as UpdateEntity | undefined;
      const now = this.queue?.steps.find((s) => s.entityId === entityId);
      const healthy = current.connected !== false;
      const settled =
        !!latest &&
        !latest.attributes.in_progress &&
        !stepDone(
          latest,
          now ?? { targetVersion: null, role: "other" },
          current.config?.version
        );
      const genuine = restarts
        ? healthy && settled && !now?.seenInProgress
        : settled || !latest;
      if (genuine) {
        this._failStep(
          entityId,
          "error",
          refused.trim() ||
            current.localize("ui.panel.config.updates.queue.error_unknown")
        );
      }
    }
    this.tick();
  }

  private _failStep(entityId: string, reason: "error", message: string): void {
    const queue = this.queue;
    const step = queue?.steps.find((s) => s.entityId === entityId);
    if (!queue || !step || step.state !== "updating") {
      return;
    }
    this.failureMessage = message;
    this.announcement = { kind: "failed", entityId };
    this._commit({
      ...queue,
      failure: { entityId, reason },
      steps: queue.steps.map((s) =>
        s.entityId === entityId ? { ...s, state: "failed" as const } : s
      ),
    });
  }

  private _commit(queue: QueueState | undefined): void {
    this.queue = queue;
    storeQueue(queue);
    this._host.requestUpdate();
  }
}
