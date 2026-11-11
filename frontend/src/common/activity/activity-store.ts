/**
 * A small in-memory record of things that take time: a download, an import,
 * a backup. Anything that runs for a while reports here, and the activity
 * tray shows the list, so a task stays visible after the page that started it
 * has been left.
 *
 * Rules the store keeps for every caller:
 * - Progress is only ever what the caller measured. A value that is not a
 *   finite count with a positive total is dropped, and the activity is shown
 *   as running with no percentage.
 * - Nothing here estimates a remaining time or invents a percentage.
 * - Nothing is stored across a reload. The history is short and in memory.
 */

export type ActivityState = "running" | "done" | "failed" | "cancelled";

export type ActivityKind = "download" | "import" | "backup" | "other";

/** A measured amount of work done out of a known total. */
export interface ActivityProgress {
  completed: number;
  total: number;
}

export interface ActivityAction {
  /** Already localized button text. */
  label: string;
  run: () => void | Promise<void>;
}

export interface Activity {
  id: string;
  /** Already localized, for example "Downloading llama3". */
  title: string;
  kind: ActivityKind;
  state: ActivityState;
  /** Absent while the amount of work is not known. */
  progress?: ActivityProgress;
  /** Already localized, short, shown under the title. */
  status?: string;
  startedAt: number;
  finishedAt?: number;
  /** Present only when the server can really stop the work. */
  cancel?: () => void | Promise<void>;
  /** An address inside the interface where the work can be seen. */
  openPath?: string;
  /** Already localized result of a finished activity. */
  message?: string;
  /** Raw technical text for a failure. Redacted before it is copied. */
  details?: string;
  /** A way to take the work back, when one exists. */
  undo?: ActivityAction;
  /** A way to start the same work again after a failure. */
  retry?: () => void | Promise<void>;
}

export type ActivityInit = Pick<Activity, "title"> &
  Partial<
    Pick<
      Activity,
      "kind" | "progress" | "status" | "cancel" | "openPath" | "undo" | "retry"
    >
  >;

export type ActivityPatch = Partial<
  Omit<Activity, "id" | "startedAt" | "state">
>;

/** Finished activities kept for display. Running ones are never dropped. */
export const ACTIVITY_HISTORY_LIMIT = 12;

type Listener = (activities: readonly Activity[]) => void;

/** Returns the progress when it is a real measurement, otherwise nothing. */
export const sanitizeProgress = (
  progress: ActivityProgress | undefined
): ActivityProgress | undefined => {
  if (!progress) {
    return undefined;
  }
  const { completed, total } = progress;
  if (
    typeof completed !== "number" ||
    typeof total !== "number" ||
    !Number.isFinite(completed) ||
    !Number.isFinite(total) ||
    total <= 0 ||
    completed < 0
  ) {
    return undefined;
  }
  return { completed: Math.min(completed, total), total };
};

/** A whole percentage from real numbers, or undefined when not known. */
export const activityPercent = (activity: Activity): number | undefined => {
  const progress = sanitizeProgress(activity.progress);
  if (!progress) {
    return undefined;
  }
  return Math.min(100, Math.floor((progress.completed / progress.total) * 100));
};

export class ActivityStore {
  private _items: Activity[] = [];

  private _listeners = new Set<Listener>();

  private _nextId = 1;

  private _now: () => number;

  public constructor(now: () => number = () => Date.now()) {
    this._now = now;
  }

  /** Newest first. */
  public get activities(): readonly Activity[] {
    return this._items;
  }

  public get runningCount(): number {
    return this._items.filter((item) => item.state === "running").length;
  }

  public get(id: string): Activity | undefined {
    return this._items.find((item) => item.id === id);
  }

  public subscribe(listener: Listener): () => void {
    this._listeners.add(listener);
    listener(this._items);
    return () => {
      this._listeners.delete(listener);
    };
  }

  public start(init: ActivityInit): string {
    const id = `activity-${this._nextId++}`;
    const activity: Activity = {
      id,
      title: init.title,
      kind: init.kind ?? "other",
      state: "running",
      progress: sanitizeProgress(init.progress),
      status: init.status,
      startedAt: this._now(),
      cancel: init.cancel,
      openPath: init.openPath,
      undo: init.undo,
      retry: init.retry,
    };
    this._items = [activity, ...this._items];
    this._notify();
    return id;
  }

  /** Changes a running activity. Nothing happens once it has finished. */
  public update(id: string, patch: ActivityPatch): void {
    this._replace(id, (item) => {
      if (item.state !== "running") {
        return item;
      }
      const next = { ...item, ...patch };
      if ("progress" in patch) {
        next.progress = sanitizeProgress(patch.progress);
      }
      return next;
    });
  }

  /** Ends an activity. A second call with the same id changes nothing. */
  public finish(
    id: string,
    state: Exclude<ActivityState, "running">,
    patch: ActivityPatch = {}
  ): void {
    this._replace(id, (item) => {
      if (item.state !== "running") {
        return item;
      }
      return {
        ...item,
        ...patch,
        state,
        progress: state === "done" ? item.progress : undefined,
        cancel: undefined,
        finishedAt: this._now(),
      };
    });
    this._trim();
  }

  /** Changes the result text or the undo of a finished activity. */
  public amend(id: string, patch: ActivityPatch): void {
    this._replace(id, (item) =>
      item.state === "running" ? item : { ...item, ...patch }
    );
  }

  public dismiss(id: string): void {
    const next = this._items.filter((item) => item.id !== id);
    if (next.length !== this._items.length) {
      this._items = next;
      this._notify();
    }
  }

  public dismissFinished(): void {
    const next = this._items.filter((item) => item.state === "running");
    if (next.length !== this._items.length) {
      this._items = next;
      this._notify();
    }
  }

  private _replace(id: string, change: (item: Activity) => Activity): void {
    let changed = false;
    this._items = this._items.map((item) => {
      if (item.id !== id) {
        return item;
      }
      const next = change(item);
      if (next !== item) {
        changed = true;
      }
      return next;
    });
    if (changed) {
      this._notify();
    }
  }

  private _trim(): void {
    let finished = 0;
    const next = this._items.filter((item) => {
      if (item.state === "running") {
        return true;
      }
      finished++;
      return finished <= ACTIVITY_HISTORY_LIMIT;
    });
    if (next.length !== this._items.length) {
      this._items = next;
    }
    this._notify();
  }

  private _notify(): void {
    for (const listener of [...this._listeners]) {
      listener(this._items);
    }
  }
}

/** The one store the interface shares. */
export const activityStore = new ActivityStore();

export const startActivity = (init: ActivityInit): string =>
  activityStore.start(init);

export const updateActivity = (id: string, patch: ActivityPatch): void =>
  activityStore.update(id, patch);

export const finishActivity = (
  id: string,
  state: Exclude<ActivityState, "running">,
  patch?: ActivityPatch
): void => activityStore.finish(id, state, patch);

export const subscribeActivities = (listener: Listener): (() => void) =>
  activityStore.subscribe(listener);
