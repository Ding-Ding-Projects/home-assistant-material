import type {
  Connection,
  HassEntity,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import {
  activityStore,
  finishActivity,
  startActivity,
  updateActivity,
} from "../../common/activity/activity-store";
import { isComponentLoaded } from "../../common/config/is_component_loaded";
import { computeStateDomain } from "../../common/entity/compute_state_domain";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../common/translations/localize";
import { subscribeBackupEvents } from "../../data/backup_manager";
import type { UpdateEntity } from "../../data/update";
import { installUpdates, UpdateEntityFeature } from "../../data/update";
import type { HomeAssistant, HomeAssistantApi } from "../../types";
import { watchEntityState } from "./entity-state-hub";
import type { UpdateStage } from "./update-progress-logic";
import {
  deriveUpdateStage,
  errorText,
  graceCounts,
  isConnectionLostError,
  START_SLOW_MS,
  startIsSlow,
  VERSION_CHECK_GRACE_MS,
} from "./update-progress-logic";

/**
 * Follows one update install from the moment it is started until the new
 * version is read back, and keeps following it while the page is left and
 * while Home Assistant restarts. It lives outside any component, because the
 * page that started the install can be left, and it reports to the shared
 * activity list as well as to the progress card.
 *
 * Signals it uses, and nothing else:
 * - the update entity's `in_progress`, `update_percentage` and
 *   `installed_version`, through the entity's state changes;
 * - the backup manager's state, only when a backup was asked for;
 * - the websocket going down and coming back, which is what a Core restart
 *   looks like from the browser (the page itself does not reload);
 * - the answer of the install call, when it really is an error.
 */

export { VERSION_CHECK_GRACE_MS };

let nextGeneration = 1;

export interface UpdateTrackerDeps {
  connection: Connection;
  localize: LocalizeFunc;
  callService: HomeAssistantApi["callService"];
  instanceVersion: string;
  /** The instance's own state (`RUNNING`, `STARTING`, ...), when known. */
  instanceState?: () => string | undefined;
  /** The backup integration and the Supervisor are both loaded. */
  backupAvailable: boolean;
}

export interface UpdateRun {
  entityId: string;
  title: string;
  fromVersion: string | null;
  targetVersion: string | null;
  backupRequested: boolean;
  stage: UpdateStage;
  percent?: number;
  /** Raw error text of a failed install, redacted before it is shown. */
  error?: string;
  startedAt: number;
  /** The install data that can be sent again, absent for an adopted run. */
  canRetry: boolean;
  /** Names this run, so an answer of an older run for the entity is ignored. */
  generation: number;
  /** The install has stayed on "getting ready" for a long time. */
  slow?: boolean;
}

interface RunInternal extends UpdateRun {
  deps: UpdateTrackerDeps;
  entity: UpdateEntity;
  activityId: string;
  installData?: Record<string, unknown>;
  backupState?: string;
  disconnected: boolean;
  callPending: boolean;
  seenInProgress: boolean;
  callError?: string;
  graceExpired: boolean;
  graceTimer?: ReturnType<typeof setTimeout>;
  slowTimer?: ReturnType<typeof setTimeout>;
  /** The websocket went down during this run. */
  restarted: boolean;
  /** The failure after the grace ran out was already reported. */
  graceFailureReported: boolean;
  closed: boolean;
  unsubs: (() => void)[];
}

type Listener = () => void;

const entityName = (entity: UpdateEntity): string =>
  entity.attributes.title ||
  (entity.attributes.friendly_name as string | undefined) ||
  entity.entity_id;

class UpdateInstallTracker {
  private _runs = new Map<string, RunInternal>();

  private _listeners = new Set<Listener>();

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public get(entityId: string): UpdateRun | undefined {
    return this._runs.get(entityId);
  }

  /** Forget a finished run, for example when the card is dismissed. */
  public dismiss(entityId: string): void {
    const run = this._runs.get(entityId);
    if (run && (run.stage === "done" || run.stage === "failed")) {
      this._close(run);
      this._runs.delete(entityId);
      this._notify();
    }
  }

  /**
   * Start following an install that the caller is about to send. The caller
   * sends the call itself and reports its answer with `finishCall`.
   */
  public begin(
    deps: UpdateTrackerDeps,
    entity: UpdateEntity,
    installData: Record<string, unknown>
  ): number {
    const run = this._create(deps, entity, {
      installData,
      backupRequested: installData.backup === true,
      callPending: true,
    });
    this._attach(run);
    this._evaluate(run);
    return run.generation;
  }

  /**
   * Report how the install call ended. A dropped socket is not a failure.
   * Pass the number `begin` returned so that the answer of an older call is
   * not applied to a newer run of the same entity.
   */
  public finishCall(
    entityId: string,
    err?: unknown,
    message?: string,
    generation?: number
  ): void {
    const run = this._runs.get(entityId);
    if (!run || (generation !== undefined && run.generation !== generation)) {
      return;
    }
    run.callPending = false;
    if (err !== undefined && !isConnectionLostError(err)) {
      run.callError = message ?? errorText(err);
    }
    this._evaluate(run);
  }

  /**
   * An install that is already running when nothing is following it, for
   * example after the page was reloaded. The backup stage is not known then.
   */
  public adopt(deps: UpdateTrackerDeps, entity: UpdateEntity): void {
    if (this._runs.has(entity.entity_id) || !entity.attributes.in_progress) {
      return;
    }
    const run = this._create(deps, entity, {
      backupRequested: false,
      callPending: false,
    });
    run.seenInProgress = true;
    this._attach(run);
    this._evaluate(run);
  }

  /** Keep the freshest functions of the page that is showing the run. */
  public refreshDeps(entityId: string, deps: UpdateTrackerDeps): void {
    const run = this._runs.get(entityId);
    if (run) {
      run.deps = deps;
    }
  }

  /** Send the same install again after a failure. */
  public async retry(entityId: string): Promise<void> {
    const run = this._runs.get(entityId);
    if (!run?.installData) {
      return;
    }
    const { deps, entity, installData } = run;
    this._close(run);
    this._runs.delete(entityId);
    const generation = this.begin(deps, entity, installData);
    try {
      await deps.callService(
        "update",
        "install",
        installData,
        undefined,
        false
      );
      this.finishCall(entityId, undefined, undefined, generation);
    } catch (err) {
      this.finishCall(entityId, err, undefined, generation);
    }
  }

  private _create(
    deps: UpdateTrackerDeps,
    entity: UpdateEntity,
    options: {
      installData?: Record<string, unknown>;
      backupRequested: boolean;
      callPending: boolean;
    }
  ): RunInternal {
    const existing = this._runs.get(entity.entity_id);
    if (existing) {
      if (!existing.closed) {
        finishActivity(existing.activityId, "cancelled");
      }
      this._close(existing);
    }
    const title = entityName(entity);
    const run: RunInternal = {
      deps,
      entity,
      entityId: entity.entity_id,
      title,
      fromVersion: entity.attributes.installed_version,
      targetVersion: entity.attributes.latest_version,
      backupRequested: options.backupRequested,
      stage: "preparing",
      startedAt: Date.now(),
      canRetry: !!options.installData,
      installData: options.installData,
      disconnected: false,
      callPending: options.callPending,
      seenInProgress: false,
      graceExpired: false,
      restarted: false,
      graceFailureReported: false,
      generation: nextGeneration++,
      closed: false,
      unsubs: [],
      activityId: startActivity({
        title: deps.localize("ui.update_progress.activity_title", {
          name: title,
        }),
        kind: "other",
        status: deps.localize("ui.update_progress.stage.preparing"),
        openPath: "/config/updates",
      }),
    };
    run.slowTimer = setTimeout(() => {
      run.slowTimer = undefined;
      if (!run.closed) {
        this._evaluate(run);
      }
    }, START_SLOW_MS);
    this._runs.set(entity.entity_id, run);
    return run;
  }

  private _attach(run: RunInternal): void {
    const { connection } = run.deps;

    const onDisconnected = () => {
      run.disconnected = true;
      run.restarted = true;
      this._clearGrace(run);
      this._evaluate(run);
    };
    const onReady = () => {
      run.disconnected = false;
      this._refreshEntity(run);
      this._evaluate(run);
    };
    connection.addEventListener("disconnected", onDisconnected);
    connection.addEventListener("ready", onReady);
    run.unsubs.push(() => {
      connection.removeEventListener("disconnected", onDisconnected);
      connection.removeEventListener("ready", onReady);
    });

    run.unsubs.push(
      watchEntityState(connection, run.entityId, (state) => {
        run.entity = state as UpdateEntity;
        this._evaluate(run);
      })
    );

    if (run.backupRequested && run.deps.backupAvailable) {
      this._keep(
        run,
        subscribeBackupEvents({ connection }, (event) => {
          if (!("agent_id" in event)) {
            run.backupState = event.manager_state;
            this._evaluate(run);
          }
        })
      );
    }
  }

  private _keep(run: RunInternal, pending: Promise<UnsubscribeFunc>): void {
    pending.then(
      (unsub) => {
        if (run.closed) {
          unsub();
        } else {
          run.unsubs.push(unsub);
        }
      },
      () => {
        // A subscription that cannot be made only costs detail, not the run.
      }
    );
  }

  /** After a reconnect the entity may have changed without an event. */
  private async _refreshEntity(run: RunInternal): Promise<void> {
    try {
      const states = await run.deps.connection.sendMessagePromise<HassEntity[]>(
        { type: "get_states" }
      );
      const fresh = states.find((state) => state.entity_id === run.entityId);
      if (fresh && !run.closed) {
        run.entity = fresh as UpdateEntity;
        this._evaluate(run);
      }
    } catch (_err) {
      // The next state change carries the entity anyway.
    }
  }

  private _clearGrace(run: RunInternal): void {
    if (run.graceTimer) {
      clearTimeout(run.graceTimer);
      run.graceTimer = undefined;
    }
  }

  private _evaluate(run: RunInternal): void {
    if (run.closed) {
      return;
    }
    const { attributes } = run.entity;
    if (attributes?.in_progress) {
      run.seenInProgress = true;
      run.graceExpired = false;
      this._clearGrace(run);
    }
    const result = deriveUpdateStage({
      inProgress: !!attributes?.in_progress,
      supportsProgress: supportsFeature(
        run.entity,
        UpdateEntityFeature.PROGRESS
      ),
      percentage: attributes?.update_percentage,
      backupRequested: run.backupRequested,
      backupState: run.backupState,
      disconnected: run.disconnected,
      callPending: run.callPending,
      seenInProgress: run.seenInProgress,
      callError: run.callError,
      installedVersion: attributes?.installed_version,
      targetVersion: run.targetVersion,
      fromVersion: run.fromVersion,
      graceExpired: run.graceExpired,
      entityState: run.entity.state,
      restarted: run.restarted,
    });
    run.stage = result.stage;
    run.percent = result.percent;
    run.slow = startIsSlow(run.stage, run.startedAt, Date.now());

    // The wait for the new version counts only while the instance is back and
    // the entity reports a real state, so a slow restart is never a failure.
    const counting = graceCounts({
      disconnected: run.disconnected,
      entityState: run.entity.state,
      instanceState: run.deps.instanceState?.(),
    });
    if (result.stage === "checking" && counting) {
      if (!run.graceTimer) {
        run.graceTimer = setTimeout(() => {
          run.graceTimer = undefined;
          run.graceExpired = true;
          this._evaluate(run);
        }, VERSION_CHECK_GRACE_MS);
      }
    } else if (result.stage === "checking") {
      this._clearGrace(run);
    }

    const { localize } = run.deps;
    if (result.stage === "done") {
      run.error = undefined;
      if (run.graceFailureReported) {
        // The failure was reported when the wait ran out, and the new version
        // showed up after all: replace the failed entry with a finished one.
        activityStore.dismiss(run.activityId);
        run.activityId = startActivity({
          title: localize("ui.update_progress.activity_title", {
            name: run.title,
          }),
          kind: "other",
          status: localize("ui.update_progress.stage.checking"),
          openPath: "/config/updates",
        });
        run.graceFailureReported = false;
      }
      this._finish(run, "done", {
        message: localize("ui.update_progress.done", {
          name: run.title,
          version: attributes?.installed_version ?? run.targetVersion ?? "",
        }),
      });
    } else if (result.stage === "failed") {
      run.error =
        run.callError ??
        localize("ui.update_progress.version_unchanged", {
          version: attributes?.installed_version ?? "",
        });
      const patch = {
        message: localize("ui.update_progress.failed_message"),
        // The full recovery card (details, retry) is shown on the updates
        // page only. The tray gets a one-line entry that opens that page.
        compact: true,
      };
      if (run.callError) {
        this._finish(run, "failed", patch);
      } else if (!run.graceFailureReported) {
        // The wait ran out, but the subscriptions stay open: the new version
        // can still appear, and then the run turns to done.
        run.graceFailureReported = true;
        finishActivity(run.activityId, "failed", patch);
      }
    } else {
      updateActivity(run.activityId, {
        status: localize(`ui.update_progress.stage.${result.stage}`),
        progress:
          result.percent === undefined
            ? undefined
            : { completed: result.percent, total: 100 },
      });
    }
    this._notify();
  }

  private _finish(
    run: RunInternal,
    state: "done" | "failed",
    patch: Parameters<typeof finishActivity>[2]
  ): void {
    finishActivity(run.activityId, state, patch);
    this._close(run);
    // The run stays in the map so the card can show how it ended.
  }

  private _close(run: RunInternal): void {
    run.closed = true;
    this._clearGrace(run);
    if (run.slowTimer) {
      clearTimeout(run.slowTimer);
      run.slowTimer = undefined;
    }
    for (const unsub of run.unsubs.splice(0)) {
      unsub();
    }
  }

  private _notify(): void {
    for (const listener of [...this._listeners]) {
      listener();
    }
  }
}

export const updateInstallTracker = new UpdateInstallTracker();

const depsFromHass = (hass: HomeAssistant): UpdateTrackerDeps => ({
  connection: hass.connection,
  localize: hass.localize,
  callService: hass.callService,
  instanceVersion: hass.config.version,
  instanceState: () => hass.config.state,
  backupAvailable:
    isComponentLoaded(hass.config, "backup") &&
    isComponentLoaded(hass.config, "hassio"),
});

/**
 * Starts installs through `installUpdates` and follows each of them, so
 * "Update all" shows progress in the activity tray like a single install.
 * The call's answer is reported to every entity it covered.
 */
export const installUpdatesTracked = async (
  hass: HomeAssistant,
  entityIds: string[],
  notifyOnError = true
): Promise<void> => {
  const deps = depsFromHass(hass);
  const followed: { id: string; generation: number }[] = [];
  for (const entityId of entityIds) {
    const entity = hass.states[entityId] as UpdateEntity | undefined;
    if (entity && computeStateDomain(entity) === "update") {
      followed.push({
        id: entityId,
        generation: updateInstallTracker.begin(deps, entity, {
          entity_id: entityId,
        }),
      });
    }
  }
  try {
    await installUpdates(hass, entityIds, notifyOnError);
    followed.forEach(({ id, generation }) =>
      updateInstallTracker.finishCall(id, undefined, undefined, generation)
    );
  } catch (err) {
    followed.forEach(({ id, generation }) =>
      updateInstallTracker.finishCall(id, err, undefined, generation)
    );
    throw err;
  }
};

/**
 * After a page reload: follows every install that is already running, so the
 * activity tray shows it without an update card having to be on screen.
 */
export const adoptRunningInstalls = (hass: HomeAssistant): void => {
  const deps = depsFromHass(hass);
  for (const entity of Object.values(hass.states)) {
    if (
      computeStateDomain(entity) === "update" &&
      entity.attributes.in_progress
    ) {
      updateInstallTracker.adopt(deps, entity as UpdateEntity);
    }
  }
};
