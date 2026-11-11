import type {
  Connection,
  HassEntity,
  HassEvent,
  UnsubscribeFunc,
} from "home-assistant-js-websocket";
import {
  finishActivity,
  startActivity,
  updateActivity,
} from "../../common/activity/activity-store";
import { supportsFeature } from "../../common/entity/supports-feature";
import type { LocalizeFunc } from "../../common/translations/localize";
import { subscribeBackupEvents } from "../../data/backup_manager";
import type { UpdateEntity } from "../../data/update";
import { UpdateEntityFeature } from "../../data/update";
import type { HomeAssistantApi } from "../../types";
import type { UpdateStage } from "./update-progress-logic";
import {
  deriveUpdateStage,
  errorText,
  isConnectionLostError,
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

/** How long the new version may take to show up after the instance is back. */
export const VERSION_CHECK_GRACE_MS = 30000;

export interface UpdateTrackerDeps {
  connection: Connection;
  localize: LocalizeFunc;
  callService: HomeAssistantApi["callService"];
  instanceVersion: string;
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
  ): void {
    const run = this._create(deps, entity, {
      installData,
      backupRequested: installData.backup === true,
      callPending: true,
    });
    this._attach(run);
    this._evaluate(run);
  }

  /** Report how the install call ended. A dropped socket is not a failure. */
  public finishCall(entityId: string, err?: unknown, message?: string): void {
    const run = this._runs.get(entityId);
    if (!run) {
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
    this.begin(deps, entity, installData);
    try {
      await deps.callService(
        "update",
        "install",
        installData,
        undefined,
        false
      );
      this.finishCall(entityId);
    } catch (err) {
      this.finishCall(entityId, err);
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
    this._runs.set(entity.entity_id, run);
    return run;
  }

  private _attach(run: RunInternal): void {
    const { connection } = run.deps;

    const onDisconnected = () => {
      run.disconnected = true;
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

    this._keep(
      run,
      connection.subscribeEvents<HassEvent>((event) => {
        const data = event.data as {
          entity_id?: string;
          new_state?: HassEntity | null;
        };
        if (data.entity_id !== run.entityId || !data.new_state) {
          return;
        }
        run.entity = data.new_state as UpdateEntity;
        this._evaluate(run);
      }, "state_changed")
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
    });
    run.stage = result.stage;
    run.percent = result.percent;

    if (result.stage === "checking" && !run.graceTimer) {
      run.graceTimer = setTimeout(() => {
        run.graceTimer = undefined;
        run.graceExpired = true;
        this._evaluate(run);
      }, VERSION_CHECK_GRACE_MS);
    }

    const { localize } = run.deps;
    if (result.stage === "done") {
      run.error = undefined;
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
      this._finish(run, "failed", {
        message: localize("ui.update_progress.failed_message"),
        // The full recovery card (details, retry) is shown on the updates
        // page only. The tray gets a one-line entry that opens that page.
        compact: true,
      });
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
