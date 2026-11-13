import { describe, expect, it } from "vitest";
import type {
  AppJobRun,
  SupervisorJobData,
} from "../../../src/common/app-jobs/app-job-logic";
import {
  appJobKindOf,
  applyCallResult,
  applyJobEvent,
  createRun,
  derivePhase,
  describeRunChange,
  deriveAppJobView,
  formatElapsed,
  relateJob,
} from "../../../src/common/app-jobs/app-job-logic";

const job = (extra: Partial<SupervisorJobData> = {}): SupervisorJobData => ({
  name: "app_manager_install",
  reference: "core_mosquitto",
  uuid: "job-1",
  progress: 0,
  stage: null,
  done: false,
  errors: [],
  ...extra,
});

const start = (kind: AppJobRun["kind"] = "install", pending = true) =>
  createRun("core_mosquitto", kind, 1000, pending);

describe("appJobKindOf", () => {
  it("reads the new and the old job names", () => {
    expect(appJobKindOf("app_manager_install")).toBe("install");
    expect(appJobKindOf("addon_manager_update")).toBe("update");
    expect(appJobKindOf("app_manager_rebuild")).toBe("rebuild");
    expect(appJobKindOf("app_manager_uninstall")).toBe("uninstall");
  });

  it("ignores every other job, including the ones inside an install", () => {
    expect(appJobKindOf("app_install")).toBeUndefined();
    expect(appJobKindOf("backup_manager_full_backup")).toBeUndefined();
    expect(appJobKindOf(null)).toBeUndefined();
  });
});

describe("a run that reports nothing", () => {
  it("has no percentage, which is not zero percent", () => {
    const view = deriveAppJobView(
      applyJobEvent(start(), job({ progress: 0, stage: null }), 2000),
      3000
    );
    expect(view.percent).toBeUndefined();
    expect(view.phase).toBe("preparing");
    expect(view.end).toBe("running");
  });

  it("has no percentage for an uninstall that never reports", () => {
    const run = applyJobEvent(
      start("uninstall"),
      job({ name: "app_manager_uninstall", reference: null }),
      2000
    );
    const view = deriveAppJobView(run, 3000);
    expect(view.percent).toBeUndefined();
    expect(view.phase).toBe("working");
    expect(view.steps).toEqual([]);
  });
});

describe("progress of an install", () => {
  it("follows the stages in order and shows real percentages", () => {
    let run = start();
    run = applyJobEvent(run, job({ progress: 12.4, stage: "Downloading" }), 2);
    expect(deriveAppJobView(run, 5).percent).toBe(12);
    expect(derivePhase(run)).toBe("pulling");
    run = applyJobEvent(run, job({ progress: 80, stage: "Extracting" }), 3);
    expect(derivePhase(run)).toBe("pulling");
    expect(run.stage).toBe("Extracting");
    run = applyJobEvent(run, job({ progress: 99, stage: "Pull complete" }), 4);
    expect(derivePhase(run)).toBe("finishing");
    const view = deriveAppJobView(run, 5);
    expect(view.steps.map((step) => step.state)).toEqual([
      "done",
      "done",
      "current",
    ]);
  });

  it("ends done at 100 percent with every step done", () => {
    let run = applyJobEvent(
      start(),
      job({ progress: 50, stage: "Downloading" }),
      2
    );
    run = applyJobEvent(run, job({ progress: 100, done: true }), 9000);
    const view = deriveAppJobView(run, 9500);
    expect(view.end).toBe("done");
    expect(view.percent).toBe(100);
    expect(view.steps.every((step) => step.state === "done")).toBe(true);
    expect(view.elapsedMs).toBe(8000);
  });

  it("counts earlier steps as done when an event was missed, and a progress value alone as the pull", () => {
    // The download events never arrived: the first one seen is "Extracting".
    const run = applyJobEvent(
      start(),
      job({ progress: 70, stage: "Extracting" }),
      2
    );
    const view = deriveAppJobView(run, 3);
    expect(view.steps.map((step) => step.state)).toEqual([
      "done",
      "current",
      "pending",
    ]);
  });
});

describe("events out of order", () => {
  it("never moves the bar or the steps back", () => {
    let run = applyJobEvent(
      start(),
      job({ progress: 60, stage: "Extracting" }),
      2
    );
    run = applyJobEvent(run, job({ progress: 30, stage: "Downloading" }), 3);
    expect(run.progress).toBe(60);
    expect(derivePhase(run)).toBe("pulling");
    expect(run.stage).toBe("Extracting");
  });

  it("ignores everything after the end", () => {
    const done = applyJobEvent(start(), job({ progress: 100, done: true }), 5);
    const later = applyJobEvent(
      done,
      job({ progress: 40, stage: "Downloading" }),
      6
    );
    expect(later).toBe(done);
  });

  it("accepts an end that arrives before any progress", () => {
    const run = applyJobEvent(start(), job({ progress: 100, done: true }), 5);
    expect(deriveAppJobView(run, 6).end).toBe("done");
  });
});

describe("a failure in the middle", () => {
  it("fails with the Supervisor's own message and keeps the steps reached", () => {
    let run = applyJobEvent(
      start(),
      job({ progress: 45, stage: "Downloading" }),
      2
    );
    run = applyJobEvent(
      run,
      job({
        done: true,
        progress: 45,
        stage: "Downloading",
        errors: [
          {
            type: "DockerError",
            message: "Can't install image: no space left",
          },
        ],
      }),
      3000
    );
    const view = deriveAppJobView(run, 4000);
    expect(view.end).toBe("failed");
    expect(view.errorMessage).toBe("Can't install image: no space left");
    expect(view.percent).toBe(45);
    expect(view.steps.map((step) => step.state)).toEqual([
      "done",
      "pending",
      "pending",
    ]);
    // The step that was under way is the one that broke.
    expect(view.failedStep).toBe("pulling");
  });

  it("describes the failure as one error line", () => {
    const before = applyJobEvent(
      start(),
      job({ progress: 10, stage: "Downloading" }),
      2
    );
    const after = applyJobEvent(
      before,
      job({ done: true, errors: [{ message: "boom" }] }),
      3
    );
    expect(describeRunChange(before, after)).toEqual([
      { level: "error", key: "failed", values: { message: "boom" } },
    ]);
  });

  it("fails when the call fails before any job event arrives", () => {
    const run = applyCallResult(start(), "Home Assistant is busy", 5);
    expect(deriveAppJobView(run, 6)).toMatchObject({
      end: "failed",
      errorMessage: "Home Assistant is busy",
    });
  });

  it("leaves the end to the job when the call succeeds", () => {
    const run = applyCallResult(start(), undefined, 5);
    expect(run.done).toBe(false);
    expect(run.callPending).toBe(false);
  });

  it("does not turn a finished run into a failure when a late call error comes", () => {
    const done = applyJobEvent(start(), job({ progress: 100, done: true }), 5);
    expect(applyCallResult(done, "late", 6).failed).toBe(false);
  });
});

describe("relating events to runs", () => {
  it("knows its own job, a retry and an unrelated app", () => {
    const run = applyJobEvent(start(), job(), 2);
    expect(relateJob(run, job())).toBe("same");
    expect(relateJob(run, job({ uuid: "job-2" }))).toBe("newer");
    expect(relateJob(run, job({ uuid: "job-3", reference: "core_ssh" }))).toBe(
      "other"
    );
    expect(relateJob(run, job({ name: "app_manager_update" }))).toBe("other");
  });

  it("binds an uninstall, which names no app, to the call that was sent", () => {
    const run = start("uninstall");
    const uninstall = job({ name: "app_manager_uninstall", reference: null });
    expect(relateJob(run, uninstall)).toBe("same");
    expect(relateJob({ ...run, callPending: false }, uninstall)).toBe("other");
  });

  it("keeps two apps apart", () => {
    const first = createRun("a", "install", 1, true);
    const second = createRun("b", "install", 1, true);
    const event = job({ reference: "b", progress: 20, stage: "Downloading" });
    expect(relateJob(first, event)).toBe("other");
    expect(relateJob(second, event)).toBe("same");
  });
});

describe("the lines the job adds to the terminal", () => {
  it("names a stage change once and a percent change once", () => {
    const before = start();
    const after = applyJobEvent(
      before,
      job({ progress: 3.2, stage: "Downloading" }),
      2
    );
    expect(describeRunChange(before, after).map((line) => line.key)).toEqual([
      "stage",
      "progress",
    ]);
    const same = applyJobEvent(
      after,
      job({ progress: 3.8, stage: "Downloading" }),
      3
    );
    expect(describeRunChange(after, same)).toEqual([]);
  });
});

describe("formatElapsed", () => {
  it("formats minutes and hours", () => {
    expect(formatElapsed(65_000)).toBe("1:05");
    expect(formatElapsed(3_723_000)).toBe("1:02:03");
    expect(formatElapsed(-5)).toBe("0:00");
  });
});

describe("a Supervisor that reports progress without a stage", () => {
  it("treats the progress as the pull of the image", () => {
    const run = applyJobEvent(start(), job({ progress: 22, stage: null }), 2);
    const view = deriveAppJobView(run, 3);
    expect(view.percent).toBe(22);
    expect(view.phase).toBe("pulling");
    expect(view.steps.map((step) => step.state)).toEqual([
      "done",
      "current",
      "pending",
    ]);
    expect(view.unknownStage).toBeUndefined();
  });
});
