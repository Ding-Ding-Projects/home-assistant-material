import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as StoreModule from "../../../src/common/activity/activity-store";
import type * as TrackerModule from "../../../src/data/hassio/app-job-tracker";

// The tracker is a single shared object, so each test loads a fresh copy.
type Tracker = typeof TrackerModule;
type Store = typeof StoreModule;

const localize = (key: string, values?: Record<string, string | number>) =>
  values ? `${key} ${JSON.stringify(values)}` : key;

class FakeConnection {
  private _listeners = new Map<string, Set<() => void>>();

  public callback?: (message: unknown) => void;

  public jobs: unknown[] = [];

  public subscribed = 0;

  public addEventListener(name: string, fn: () => void) {
    this._listeners.set(name, (this._listeners.get(name) ?? new Set()).add(fn));
  }

  public removeEventListener(name: string, fn: () => void) {
    this._listeners.get(name)?.delete(fn);
  }

  public emit(name: string) {
    this._listeners.get(name)?.forEach((fn) => fn());
  }

  public subscribeMessage(callback: (message: unknown) => void) {
    this.callback = callback;
    this.subscribed += 1;
    return Promise.resolve(() => undefined);
  }

  public sendMessagePromise(message: { endpoint?: string }) {
    if (message.endpoint === "/jobs/info") {
      return Promise.resolve({ jobs: this.jobs });
    }
    return Promise.resolve({ name: "Mosquitto broker", icon: true });
  }

  public job(data: Record<string, unknown>) {
    this.callback?.({ event: "job", data });
  }
}

const job = (extra: Record<string, unknown> = {}) => ({
  name: "app_manager_install",
  reference: "core_mosquitto",
  uuid: "job-1",
  progress: 0,
  stage: null,
  done: false,
  errors: [],
  created: "2026-11-11T12:00:00+00:00",
  ...extra,
});

let tracker: Tracker;
let store: Store;
let connection: FakeConnection;

const deps = () =>
  ({
    connection,
    api: { callApi: vi.fn().mockRejectedValue(new Error("no log")) },
    localize,
  }) as never;

const flush = () =>
  new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

beforeEach(async () => {
  vi.resetModules();
  tracker = await import("../../../src/data/hassio/app-job-tracker");
  store = await import("../../../src/common/activity/activity-store");
  connection = new FakeConnection();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("following a run the page started", () => {
  it("shows the Supervisor's progress and ends done", async () => {
    const generation = tracker.appJobTracker.begin(
      deps(),
      "core_mosquitto",
      "install",
      "Mosquitto broker"
    );
    connection.job(job({ progress: 20, stage: "Downloading" }));
    connection.job(job({ progress: 90, stage: "Extracting" }));
    expect(tracker.appJobTracker.get("core_mosquitto")?.run).toMatchObject({
      progress: 90,
      stage: "Extracting",
      done: false,
    });
    tracker.appJobTracker.finishCall("core_mosquitto", generation);
    connection.job(job({ progress: 100, done: true }));
    const snapshot = tracker.appJobTracker.get("core_mosquitto")!;
    expect(snapshot.run).toMatchObject({ done: true, failed: false });
    expect(store.activityStore.activities[0]).toMatchObject({
      state: "done",
    });
    // The job's own events are in the terminal, oldest first.
    expect(snapshot.buffer.lines.map((line) => line.text)).toEqual([
      expect.stringContaining("line.started.install"),
      expect.stringContaining("line.stage"),
      expect.stringContaining("line.progress"),
      expect.stringContaining("line.stage"),
      expect.stringContaining("line.progress"),
      expect.stringContaining("line.finished"),
    ]);
  });

  it("fails with the answer of the call when no job event came", async () => {
    const generation = tracker.appJobTracker.begin(
      deps(),
      "core_mosquitto",
      "install",
      "Mosquitto broker"
    );
    tracker.appJobTracker.finishCall("core_mosquitto", generation, {
      body: { message: "No space left" },
    });
    expect(tracker.appJobTracker.get("core_mosquitto")?.run).toMatchObject({
      failed: true,
      errorMessage: "No space left",
    });
    expect(store.activityStore.activities[0]).toMatchObject({
      state: "failed",
      details: "No space left",
    });
  });

  it("does not take a dropped socket for a failure", () => {
    const generation = tracker.appJobTracker.begin(
      deps(),
      "core_mosquitto",
      "install"
    );
    tracker.appJobTracker.finishCall("core_mosquitto", generation, {
      code: 3,
    });
    expect(tracker.appJobTracker.get("core_mosquitto")?.run.failed).toBe(false);
  });

  it("ignores the answer of an older call when the work started again", () => {
    const first = tracker.appJobTracker.begin(deps(), "a", "install");
    tracker.appJobTracker.begin(deps(), "a", "install");
    tracker.appJobTracker.finishCall("a", first, new Error("old"));
    expect(tracker.appJobTracker.get("a")?.run.failed).toBe(false);
  });

  it("follows two apps at once without mixing them", () => {
    tracker.appJobTracker.begin(deps(), "core_mosquitto", "install");
    tracker.appJobTracker.begin(deps(), "core_ssh", "install");
    connection.job(job({ progress: 40, stage: "Downloading" }));
    connection.job(
      job({
        uuid: "job-2",
        reference: "core_ssh",
        progress: 5,
        stage: "Downloading",
      })
    );
    connection.job(job({ progress: 100, done: true }));
    expect(tracker.appJobTracker.get("core_mosquitto")?.run.done).toBe(true);
    expect(tracker.appJobTracker.get("core_ssh")?.run).toMatchObject({
      done: false,
      progress: 5,
    });
  });

  it("binds an uninstall, which names no app, to the call that was sent", () => {
    tracker.appJobTracker.begin(deps(), "core_mosquitto", "uninstall");
    connection.job(
      job({ name: "app_manager_uninstall", reference: null, uuid: "u-1" })
    );
    connection.job(
      job({
        name: "app_manager_uninstall",
        reference: null,
        uuid: "u-1",
        progress: 100,
        done: true,
      })
    );
    expect(tracker.appJobTracker.get("core_mosquitto")?.run).toMatchObject({
      kind: "uninstall",
      done: true,
    });
  });
});

describe("work that nothing here started", () => {
  it("takes up a running job from the Supervisor's job list after a reload", async () => {
    connection.jobs = [
      job({ uuid: "old", reference: "core_ssh", done: true, progress: 100 }),
      job({ progress: 33, stage: "Downloading" }),
    ];
    tracker.appJobTracker.watch(deps());
    await flush();
    expect(tracker.appJobTracker.list().map((entry) => entry.run.slug)).toEqual(
      ["core_mosquitto"]
    );
    expect(tracker.appJobTracker.get("core_mosquitto")?.run.progress).toBe(33);
    expect(tracker.appJobTracker.get("core_mosquitto")?.name).toBe(
      "Mosquitto broker"
    );
  });

  it("takes up an update that started on the updates page, without a second tray entry", () => {
    tracker.appJobTracker.watch(deps());
    connection.job(
      job({
        name: "app_manager_update",
        uuid: "up-1",
        progress: 10,
        stage: "Downloading",
      })
    );
    expect(tracker.appJobTracker.get("core_mosquitto")?.run.kind).toBe(
      "update"
    );
    expect(store.activityStore.activities).toHaveLength(0);
  });

  it("does not follow a job that was already finished when it first appeared", () => {
    tracker.appJobTracker.watch(deps());
    connection.job(job({ done: true, progress: 100 }));
    expect(tracker.appJobTracker.list()).toEqual([]);
  });

  it("starts a new run when the same app is installed again", () => {
    tracker.appJobTracker.watch(deps());
    connection.job(job({ progress: 10, stage: "Downloading" }));
    connection.job(job({ done: true, errors: [{ message: "network lost" }] }));
    expect(tracker.appJobTracker.get("core_mosquitto")?.run.failed).toBe(true);
    connection.job(job({ uuid: "job-2", progress: 3, stage: "Downloading" }));
    expect(tracker.appJobTracker.get("core_mosquitto")?.run).toMatchObject({
      uuid: "job-2",
      failed: false,
      progress: 3,
    });
  });
});

describe("the websocket dropping and coming back", () => {
  it("writes the loss in the terminal and catches up from the job list", async () => {
    tracker.appJobTracker.begin(deps(), "core_mosquitto", "install");
    connection.job(job({ progress: 30, stage: "Downloading" }));
    connection.emit("disconnected");
    expect(
      tracker.appJobTracker
        .get("core_mosquitto")
        ?.buffer.lines.some((line) => line.text.includes("connection_lost"))
    ).toBe(true);
    // The job finished while nothing listened.
    connection.jobs = [job({ progress: 100, done: true })];
    connection.emit("ready");
    await flush();
    expect(tracker.appJobTracker.get("core_mosquitto")?.run).toMatchObject({
      done: true,
      failed: false,
    });
  });

  it("subscribes once for the same connection", () => {
    tracker.appJobTracker.watch(deps());
    tracker.appJobTracker.watch(deps());
    expect(connection.subscribed).toBe(1);
  });
});

describe("dismissing", () => {
  it("forgets a finished run and its tray entry, never a running one", () => {
    tracker.appJobTracker.begin(deps(), "core_mosquitto", "install");
    tracker.appJobTracker.dismiss("core_mosquitto");
    expect(tracker.appJobTracker.get("core_mosquitto")).toBeDefined();
    connection.job(job({ progress: 100, done: true }));
    tracker.appJobTracker.dismiss("core_mosquitto");
    expect(tracker.appJobTracker.get("core_mosquitto")).toBeUndefined();
    expect(store.activityStore.activities).toHaveLength(0);
  });

  it("keeps a failed run visible and a finished one only for a minute", () => {
    tracker.appJobTracker.begin(deps(), "core_mosquitto", "install");
    connection.job(job({ progress: 100, done: true }));
    const snapshot = tracker.appJobTracker.get("core_mosquitto");
    const finished = snapshot!.run.finishedAt!;
    expect(tracker.isAppJobVisible(snapshot, finished + 1000)).toBe(true);
    expect(
      tracker.isAppJobVisible(
        snapshot,
        finished + tracker.APP_JOB_LINGER_MS + 1
      )
    ).toBe(false);
    const failed = {
      ...snapshot!,
      run: { ...snapshot!.run, failed: true },
    };
    expect(
      tracker.isAppJobVisible(failed, finished + tracker.APP_JOB_LINGER_MS * 9)
    ).toBe(true);
  });
});

describe("the app's own log", () => {
  it("appends only new lines and writes a heading once", async () => {
    vi.useFakeTimers();
    const callApi = vi
      .fn()
      .mockResolvedValueOnce("a\nb\n")
      .mockResolvedValueOnce("a\nb\nc\n");
    tracker.appJobTracker.begin(
      { ...(deps() as object), api: { callApi } } as never,
      "core_mosquitto",
      "install"
    );
    connection.job(job({ progress: 100, done: true }));
    const release = tracker.appJobTracker.watchAppLog("core_mosquitto");
    await vi.advanceTimersByTimeAsync(1100);
    await vi.advanceTimersByTimeAsync(tracker.APP_LOG_POLL_MS + 100);
    const texts = tracker.appJobTracker
      .get("core_mosquitto")!
      .buffer.lines.filter((line) => line.source !== "job")
      .map((line) => `${line.source}:${line.text}`);
    expect(texts).toEqual([
      expect.stringContaining("note:ui.app_job.line.app_log_heading"),
      "app:a",
      "app:b",
      "app:c",
    ]);
    release();
    vi.useRealTimers();
  });
});
