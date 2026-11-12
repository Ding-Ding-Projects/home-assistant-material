import type { Connection, UnsubscribeFunc } from "home-assistant-js-websocket";
import {
  activityStore,
  finishActivity,
  startActivity,
  updateActivity,
} from "../../common/activity/activity-store";
import type {
  AppJobKind,
  AppJobRun,
  SupervisorJobData,
} from "../../common/app-jobs/app-job-logic";
import {
  appJobKindOf,
  applyCallResult,
  applyJobEvent,
  createRun,
  derivePhase,
  describeRunChange,
  relateJob,
} from "../../common/app-jobs/app-job-logic";
import type {
  LogBuffer,
  LogLevel,
  LogSource,
} from "../../common/log-terminal/log-terminal-logic";
import {
  appendLines,
  detectLevel,
  emptyBuffer,
  newLinesOf,
} from "../../common/log-terminal/log-terminal-logic";
import type { LocalizeFunc } from "../../common/translations/localize";
import { isConnectionLostError } from "../../components/update-progress/update-progress-logic";
import type { HomeAssistantApi } from "../../types";
import { extractApiErrorMessage } from "./common";

/**
 * Follows installs, updates, rebuilds and uninstalls of apps from the moment
 * they start until they end, and keeps following them while the page is left
 * and while the websocket drops and comes back. It lives outside any
 * component, and reports to the shared activity list as well as to the
 * progress views.
 *
 * Signals it uses, and nothing else:
 * - the Supervisor's `job` events, which every admin connection can subscribe
 *   to. They name the app, report progress and stage, and end with `done`;
 * - the Supervisor's job list, read once when following starts and after the
 *   websocket comes back, which covers what happened while nothing listened;
 * - the answer of the call that started the work, when it really is an error;
 * - the app's own log, read while a view of a finished run is open.
 */

export interface AppJobDeps {
  connection: Connection;
  api: Pick<HomeAssistantApi, "callApi">;
  localize: LocalizeFunc;
  /** An element in the page, for opening the progress dialog from the tray. */
  host?: HTMLElement;
}

export type AppLogState = "idle" | "waiting" | "unavailable" | "live";

/** What a view reads: a copy of the run, never the run being changed. */
export interface AppJobSnapshot {
  run: AppJobRun;
  name: string;
  hasIcon?: boolean;
  buffer: LogBuffer;
  appLog: AppLogState;
}

interface RunInternal {
  run: AppJobRun;
  name: string;
  hasIcon?: boolean;
  buffer: LogBuffer;
  activityId?: string;
  /** The run was replaced or dismissed and is no longer followed. */
  closed: boolean;
  appLog: AppLogState;
  appLogSnapshot: string[];
  appLogHeading: boolean;
  logWatchers: number;
  logTimer?: ReturnType<typeof setTimeout>;
  logBusy: boolean;
  generation: number;
}

type Listener = () => void;

/** How long a finished run that went well stays visible. */
export const APP_JOB_LINGER_MS = 60 * 1000;

/** How often the app's own log is read while a view of it is open. */
export const APP_LOG_POLL_MS = 3000;

let nextGeneration = 1;

const jobPath = (slug: string) => `/config/app/${slug}/info`;

const asLevel = (level: "info" | "error"): LogLevel => level;

class AppJobTracker {
  private _runs = new Map<string, RunInternal>();

  private _listeners = new Set<Listener>();

  private _deps?: AppJobDeps;

  private _unsubEvents?: UnsubscribeFunc;

  private _watching?: Connection;

  private _onReady?: () => void;

  private _onDisconnected?: () => void;

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public get(slug: string): AppJobSnapshot | undefined {
    const internal = this._runs.get(slug);
    return internal ? this._snapshot(internal) : undefined;
  }

  public list(): AppJobSnapshot[] {
    return [...this._runs.values()].map((internal) => this._snapshot(internal));
  }

  /** Forget a finished run, for example when its card is dismissed. */
  public dismiss(slug: string): void {
    const internal = this._runs.get(slug);
    if (internal?.run.done) {
      this._release(internal);
      if (internal.activityId) {
        activityStore.dismiss(internal.activityId);
      }
      this._runs.delete(slug);
      this._notify();
    }
  }

  /**
   * Start following every app job of this connection, and read the ones that
   * are already running, for example after the page was reloaded. Safe to
   * call again: the newest functions of the page are kept.
   */
  public watch(deps: AppJobDeps): void {
    this._deps = deps;
    if (this._watching === deps.connection) {
      return;
    }
    this._unwatch();
    this._watching = deps.connection;
    const { connection } = deps;
    this._onDisconnected = () => {
      for (const internal of this._runs.values()) {
        if (!internal.run.done) {
          this._line(
            internal,
            "note",
            "info",
            this._text("ui.app_job.line.connection_lost")
          );
        }
      }
      this._notify();
    };
    this._onReady = () => {
      void this._readJobs(true);
    };
    connection.addEventListener("disconnected", this._onDisconnected);
    connection.addEventListener("ready", this._onReady);
    connection
      .subscribeMessage<{ event?: string; data?: SupervisorJobData }>(
        (message) => {
          if (message?.event === "job" && message.data) {
            this._handleJob(message.data);
          }
        },
        { type: "supervisor/subscribe" }
      )
      .then(
        (unsub) => {
          if (this._watching === connection) {
            this._unsubEvents = unsub;
          } else {
            unsub();
          }
        },
        () => {
          // Not an administrator, or no Supervisor: there is nothing to follow.
        }
      );
    void this._readJobs(false);
  }

  /**
   * Start following work that the caller is about to send. The caller sends
   * the call itself and reports its answer with `finishCall`.
   */
  public begin(
    deps: AppJobDeps,
    slug: string,
    kind: AppJobKind,
    name?: string
  ): number {
    // The page that starts the work can be left, so the element that opens
    // dialogs stays the one the long-lived watcher gave.
    this.watch({ ...deps, host: this._deps?.host ?? deps.host });
    const internal = this._create(slug, kind, true, name);
    this._notify();
    return internal.generation;
  }

  /** Report how the call ended. A dropped socket is not a failure. */
  public finishCall(slug: string, generation: number, err?: unknown): void {
    const internal = this._runs.get(slug);
    if (!internal || internal.generation !== generation) {
      return;
    }
    const before = internal.run;
    const message =
      err === undefined || isConnectionLostError(err)
        ? undefined
        : extractApiErrorMessage(err as never);
    internal.run = applyCallResult(before, message, Date.now());
    this._after(internal, before);
  }

  /** Follow the app's own log while a view of the run is open. */
  public watchAppLog(slug: string): () => void {
    const internal = this._runs.get(slug);
    if (!internal) {
      return () => undefined;
    }
    internal.logWatchers += 1;
    this._scheduleLog(internal, 0);
    let released = false;
    return () => {
      if (released) {
        return;
      }
      released = true;
      internal.logWatchers = Math.max(0, internal.logWatchers - 1);
      if (!internal.logWatchers && internal.logTimer) {
        clearTimeout(internal.logTimer);
        internal.logTimer = undefined;
      }
    };
  }

  // ---- runs ----

  private _create(
    slug: string,
    kind: AppJobKind,
    callPending: boolean,
    name?: string,
    startedAt = Date.now()
  ): RunInternal {
    const existing = this._runs.get(slug);
    if (existing) {
      this._release(existing);
      if (existing.activityId && !existing.run.done) {
        finishActivity(existing.activityId, "cancelled");
      }
    }
    const internal: RunInternal = {
      run: createRun(slug, kind, startedAt, callPending),
      name: name ?? slug,
      buffer: emptyBuffer(),
      closed: false,
      appLog: "idle",
      appLogSnapshot: [],
      appLogHeading: false,
      logWatchers: 0,
      logBusy: false,
      generation: nextGeneration++,
    };
    this._runs.set(slug, internal);
    this._line(
      internal,
      "job",
      "info",
      this._text(`ui.app_job.line.started.${kind}`, { name: internal.name }),
      startedAt
    );
    if (kind !== "update") {
      // An update shows in the activity list through its update entity.
      internal.activityId = startActivity({
        title: this._text(`ui.app_job.title.${kind}`, { name: internal.name }),
        kind: "other",
        status: this._text("ui.app_job.phase.preparing"),
        openPath: jobPath(slug),
        show: () => this._openDialog(slug),
      });
    }
    if (name === undefined) {
      void this._loadName(internal);
    }
    return internal;
  }

  private _openDialog(slug: string): void {
    const host = this._deps?.host ?? document.body;
    void import("../../panels/config/apps/dialogs/show-dialog-app-job-progress").then(
      ({ showAppJobProgressDialog }) => showAppJobProgressDialog(host, { slug })
    );
  }

  private async _loadName(internal: RunInternal): Promise<void> {
    const slug = internal.run.slug;
    const connection = this._deps?.connection;
    if (!connection) {
      return;
    }
    const fetchInfo = async (endpoint: string) => {
      try {
        const info = await connection.sendMessagePromise<{
          name?: string;
          icon?: boolean;
        }>({ type: "supervisor/api", endpoint, method: "get" });
        return info?.name ? info : undefined;
      } catch (_err) {
        return undefined;
      }
    };
    // The store knows every app; the installed list is the fallback.
    const info =
      (await fetchInfo(`/store/addons/${slug}`)) ??
      (await fetchInfo(`/addons/${slug}/info`));
    if (!info?.name) {
      return;
    }
    internal.name = info.name;
    internal.hasIcon = info.icon;
    if (internal.activityId) {
      updateActivity(internal.activityId, {
        title: this._text(`ui.app_job.title.${internal.run.kind}`, {
          name: info.name,
        }),
      });
    }
    this._notify();
  }

  private _handleJob(job: SupervisorJobData): void {
    const kind = appJobKindOf(job.name);
    if (!kind) {
      return;
    }
    let target: RunInternal | undefined;
    let newer: RunInternal | undefined;
    for (const internal of this._runs.values()) {
      if (internal.run.kind !== kind) {
        continue;
      }
      const related = relateJob(internal.run, job);
      if (related === "same") {
        target = internal;
        break;
      }
      if (related === "newer") {
        newer = internal;
      }
    }
    if (!target && newer) {
      if (job.done === true) {
        // A job that finished before anything here saw it start.
        return;
      }
      // A newer job of the same app and kind: the work started over.
      target = this._create(newer.run.slug, kind, false, newer.name);
      target.hasIcon = newer.hasIcon;
    }
    if (!target) {
      // Work that nothing here started, for example an update from the
      // updates page or an install started in another browser.
      if (!job.reference || job.done === true) {
        return;
      }
      const started = job.created ? Date.parse(job.created) : NaN;
      target = this._create(
        job.reference,
        kind,
        false,
        undefined,
        Number.isFinite(started) ? started : Date.now()
      );
    }
    const before = target.run;
    target.run = applyJobEvent(before, job, Date.now());
    this._after(target, before);
  }

  /** Reads the Supervisor's job list. `resync` is true after a reconnect. */
  private async _readJobs(resync: boolean): Promise<void> {
    const connection = this._deps?.connection;
    if (!connection) {
      return;
    }
    try {
      const info = await connection.sendMessagePromise<{
        jobs?: (SupervisorJobData & { child_jobs?: SupervisorJobData[] })[];
      }>({ type: "supervisor/api", endpoint: "/jobs/info", method: "get" });
      const flat: SupervisorJobData[] = [];
      const queue = [...(info?.jobs ?? [])];
      while (queue.length) {
        const job = queue.shift()!;
        flat.push(job);
        queue.push(...(job.child_jobs ?? []));
      }
      for (const job of flat) {
        if (!appJobKindOf(job.name) || !job.reference) {
          continue;
        }
        const known = this._runs.get(job.reference);
        // After a reconnect, apply the state of every run being followed.
        // Otherwise only jobs that are still running are taken up.
        if (known ? resync || !known.run.done : job.done !== true) {
          this._handleJob(job);
        }
      }
    } catch (_err) {
      // Without the job list the events still carry the run.
    }
  }

  // ---- reporting ----

  private _after(internal: RunInternal, before: AppJobRun): void {
    const { run } = internal;
    for (const change of describeRunChange(before, run)) {
      this._line(
        internal,
        "job",
        asLevel(change.level),
        this._text(`ui.app_job.line.${change.key}`, change.values)
      );
    }
    this._report(internal, before);
    this._notify();
    if (run.done && !run.failed && run.kind !== "uninstall" && !before.done) {
      this._scheduleLog(internal, 1000);
    }
  }

  private _report(internal: RunInternal, before: AppJobRun): void {
    const { run, activityId } = internal;
    if (!activityId) {
      return;
    }
    const phase = derivePhase(run);
    if (run.done && !before.done) {
      if (run.failed) {
        finishActivity(activityId, "failed", {
          message: this._text("ui.app_job.failed_message", {
            name: internal.name,
          }),
          details: run.errorMessage,
          compact: true,
        });
      } else {
        finishActivity(activityId, "done", {
          message: this._text(`ui.app_job.done.${run.kind}`, {
            name: internal.name,
          }),
        });
      }
      return;
    }
    updateActivity(activityId, {
      status: this._text(`ui.app_job.phase.${phase}`),
      progress:
        run.progress === undefined
          ? undefined
          : { completed: Math.floor(run.progress), total: 100 },
    });
  }

  private _line(
    internal: RunInternal,
    source: LogSource,
    level: LogLevel,
    text: string,
    time = Date.now()
  ): void {
    internal.buffer = appendLines(internal.buffer, [
      { time, source, level, text },
    ]);
  }

  private _text(key: string, values?: Record<string, string | number>): string {
    return this._deps?.localize
      ? this._deps.localize(key as never, values as never)
      : key;
  }

  // ---- the app's own log ----

  private _scheduleLog(internal: RunInternal, delay: number): void {
    const { run } = internal;
    if (
      internal.closed ||
      !internal.logWatchers ||
      !run.done ||
      run.failed ||
      run.kind === "uninstall"
    ) {
      return;
    }
    if (internal.logTimer) {
      clearTimeout(internal.logTimer);
    }
    internal.logTimer = setTimeout(() => {
      internal.logTimer = undefined;
      void this._readAppLog(internal);
    }, delay);
  }

  private async _readAppLog(internal: RunInternal): Promise<void> {
    const api = this._deps?.api;
    if (!api || internal.closed || internal.logBusy || !internal.logWatchers) {
      return;
    }
    internal.logBusy = true;
    try {
      const text = await api.callApi<string>(
        "GET",
        `hassio/addons/${internal.run.slug}/logs`
      );
      const snapshot = String(text ?? "")
        .split("\n")
        .filter((line, index, all) => line !== "" || index < all.length - 1);
      const fresh = newLinesOf(internal.appLogSnapshot, snapshot);
      internal.appLogSnapshot = snapshot;
      if (fresh.length) {
        if (!internal.appLogHeading) {
          internal.appLogHeading = true;
          this._line(
            internal,
            "note",
            "info",
            this._text("ui.app_job.line.app_log_heading")
          );
        }
        const now = Date.now();
        internal.buffer = appendLines(
          internal.buffer,
          fresh.map((line) => ({
            time: now,
            source: "app" as const,
            level: detectLevel(line),
            text: line,
          }))
        );
        internal.appLog = "live";
        this._notify();
      } else if (internal.appLog === "idle") {
        internal.appLog = snapshot.length ? "live" : "waiting";
        this._notify();
      }
    } catch (_err) {
      if (internal.appLog !== "unavailable" && internal.appLog !== "live") {
        internal.appLog = "unavailable";
        this._line(
          internal,
          "note",
          "info",
          this._text("ui.app_job.line.app_log_waiting")
        );
        this._notify();
      }
    } finally {
      internal.logBusy = false;
    }
    this._scheduleLog(internal, APP_LOG_POLL_MS);
  }

  // ---- housekeeping ----

  private _release(internal: RunInternal): void {
    internal.closed = true;
    if (internal.logTimer) {
      clearTimeout(internal.logTimer);
      internal.logTimer = undefined;
    }
  }

  private _unwatch(): void {
    const connection = this._watching;
    if (connection) {
      if (this._onReady) {
        connection.removeEventListener("ready", this._onReady);
      }
      if (this._onDisconnected) {
        connection.removeEventListener("disconnected", this._onDisconnected);
      }
    }
    this._unsubEvents?.();
    this._unsubEvents = undefined;
    this._watching = undefined;
  }

  private _snapshot(internal: RunInternal): AppJobSnapshot {
    return {
      run: { ...internal.run },
      name: internal.name,
      hasIcon: internal.hasIcon,
      buffer: internal.buffer,
      appLog: internal.appLog,
    };
  }

  private _notify(): void {
    for (const listener of [...this._listeners]) {
      listener();
    }
  }
}

export const appJobTracker = new AppJobTracker();

/**
 * Runs a call that starts an install, update, rebuild or uninstall of an app
 * and follows the work it starts. The call's own result or error is passed
 * on unchanged.
 */
export const trackAppCall = async <T>(
  deps: AppJobDeps,
  slug: string,
  kind: AppJobKind,
  call: () => Promise<T>,
  name?: string
): Promise<T> => {
  const generation = appJobTracker.begin(deps, slug, kind, name);
  try {
    const result = await call();
    appJobTracker.finishCall(slug, generation);
    return result;
  } catch (err) {
    appJobTracker.finishCall(slug, generation, err);
    throw err;
  }
};

/** True while a run is worth showing: running, failed, or finished a moment ago. */
export const isAppJobVisible = (
  snapshot: AppJobSnapshot | undefined,
  now: number
): snapshot is AppJobSnapshot => {
  if (!snapshot) {
    return false;
  }
  const { run } = snapshot;
  if (!run.done || run.failed) {
    return true;
  }
  return now - (run.finishedAt ?? now) < APP_JOB_LINGER_MS;
};
