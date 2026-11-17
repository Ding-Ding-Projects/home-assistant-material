import { describe, expect, it } from "vitest";
import type {
  ManagerStateEvent,
  UploadBackupEvent,
} from "../../../../src/data/backup_manager";
import type { RunSnapshot } from "../../../../src/panels/config/backup/helper/backup-progress";
import {
  adoptStoredRun,
  applyBackupEvent,
  applyManagerEvent,
  applyUploadEvent,
  computeLocationRows,
  computeOverall,
  computeSpeed,
  computeStageRows,
  formatClock,
  formatDuration,
  getStageDefinitions,
  restoreRun,
  serializeRun,
} from "../../../../src/panels/config/backup/helper/backup-progress";

const create = (
  stage: string | null,
  state: "in_progress" | "completed" | "failed" = "in_progress",
  reason: string | null = null
): ManagerStateEvent =>
  ({
    manager_state: "create_backup",
    stage,
    state,
    reason,
  }) as ManagerStateEvent;

const upload = (agent: string, done: number, total: number) =>
  ({
    manager_state: "create_backup",
    agent_id: agent,
    uploaded_bytes: done,
    total_bytes: total,
  }) as UploadBackupEvent;

const T0 = 1_000_000;

const startedRun = (isHassio = true): RunSnapshot =>
  applyManagerEvent(undefined, create(null), T0, isHassio)!;

describe("stage list per operation", () => {
  it("omits Supervisor-only rows when Supervisor is not running", () => {
    expect(getStageDefinitions("create", true).map((r) => r.id)).toEqual([
      "home_assistant",
      "apps",
      "folders",
      "await_restarts",
      "upload",
      "cleaning_up",
    ]);
    expect(getStageDefinitions("create", false).map((r) => r.id)).toEqual([
      "home_assistant",
      "folders",
      "upload",
      "cleaning_up",
    ]);
  });

  it("has its own rows for receiving and restoring", () => {
    expect(getStageDefinitions("receive", true).map((r) => r.id)).toEqual([
      "receive_file",
      "upload",
    ]);
    expect(getStageDefinitions("restore", false).map((r) => r.id)).toEqual([
      "download_from_agent",
      "repositories",
      "home_assistant",
      "folders",
      "restart_check",
    ]);
  });
});

describe("applying manager events", () => {
  it("ignores a final event when nothing is running", () => {
    expect(
      applyManagerEvent(undefined, create(null, "completed"), T0, true)
    ).toBeUndefined();
  });

  it("records when each stage was first seen and ended", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("home_assistant"), T0 + 1000, true)!;
    run = applyManagerEvent(run, create("addons"), T0 + 5000, true)!;
    expect(run.stageTimes.home_assistant).toEqual({
      startedAt: T0 + 1000,
      endedAt: T0 + 5000,
    });
    expect(run.stageTimes.apps).toEqual({ startedAt: T0 + 5000 });
    expect(run.observedFromStart).toBe(true);
  });

  it("does not restart a stage that repeats inside the same row", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("docker_config"), T0 + 100, true)!;
    run = applyManagerEvent(run, create("home_assistant"), T0 + 200, true)!;
    expect(run.stageTimes.home_assistant).toEqual({ startedAt: T0 + 100 });
  });

  it("marks the row that was running as failed, using the last stage", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("upload_to_agents"), T0 + 10, true)!;
    run = applyManagerEvent(
      run,
      create(null, "failed", "upload_failed"),
      T0 + 900,
      true
    )!;
    expect(run.state).toBe("failed");
    expect(run.reason).toBe("upload_failed");
    expect(run.failedRowId).toBe("upload");
    const failed = computeStageRows(run, true).find((r) => r.id === "upload");
    expect(failed?.state).toBe("failed");
  });

  it("starts a new run after a finished one", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create(null, "completed"), T0 + 50, true)!;
    expect(run.state).toBe("completed");
    const next = applyManagerEvent(run, create(null), T0 + 99, true)!;
    expect(next.state).toBe("in_progress");
    expect(next.startedAt).toBe(T0 + 99);
  });

  it("does not report an outcome when the manager goes idle unannounced", () => {
    const idle = applyManagerEvent(
      startedRun(),
      { manager_state: "idle" },
      T0 + 5,
      true
    )!;
    expect(idle.state).toBe("completed");
    expect(idle.reason).toBeUndefined();
  });
});

describe("stage row states", () => {
  it("shows waiting, running and done rows in order", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("home_assistant"), T0, true)!;
    run = applyManagerEvent(run, create("folders"), T0 + 4000, true)!;
    const states = computeStageRows(run, true).map((r) => [r.id, r.state]);
    expect(states).toEqual([
      ["home_assistant", "done"],
      ["apps", "skipped"],
      ["folders", "running"],
      ["await_restarts", "waiting"],
      ["upload", "waiting"],
      ["cleaning_up", "waiting"],
    ]);
  });

  it("does not claim skipped rows when the page joined mid-run", () => {
    const joined = applyManagerEvent(
      undefined,
      create("upload_to_agents"),
      T0,
      true
    )!;
    expect(joined.observedFromStart).toBe(false);
    const rows = computeStageRows(joined, true);
    expect(rows.find((r) => r.id === "apps")?.state).toBe("done");
    expect(rows.find((r) => r.id === "upload")?.approximate).toBe(true);
  });

  it("marks rows never reached after a success as not needed", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("upload_to_agents"), T0, true)!;
    run = applyManagerEvent(run, create(null, "completed"), T0 + 10, true)!;
    const rows = computeStageRows(run, true);
    expect(rows.find((r) => r.id === "cleaning_up")?.state).toBe("skipped");
  });
});

describe("per-location upload rows", () => {
  const uploading = () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("upload_to_agents"), T0, true)!;
    return run;
  };

  it("gives each location its own state", () => {
    let run = uploading();
    run = applyUploadEvent(run, upload("backup.local", 100, 100), T0 + 1)!;
    run = applyUploadEvent(run, upload("google_drive.x", 40, 100), T0 + 2)!;
    run = applyUploadEvent(run, upload("onedrive.y", 0, 100), T0 + 3)!;
    const rows = computeLocationRows(run);
    expect(rows.map((r) => [r.agentId, r.state, r.percent])).toEqual([
      ["backup.local", "done", 100],
      ["google_drive.x", "running", 40],
      ["onedrive.y", "running", undefined],
    ]);
    expect(rows[2].reportsProgress).toBe(false);
  });

  it("never reaches 100 percent before the location has finished", () => {
    const run = applyUploadEvent(
      uploading(),
      upload("a.b", 999, 1000),
      T0 + 1
    )!;
    expect(computeLocationRows(run)[0].percent).toBe(99);
  });

  it("marks a location that never finished as failed once the run ends", () => {
    let run = uploading();
    run = applyUploadEvent(run, upload("backup.local", 100, 100), T0 + 1)!;
    run = applyUploadEvent(run, upload("google_drive.x", 30, 100), T0 + 2)!;
    run = applyManagerEvent(run, create(null, "completed"), T0 + 9, true)!;
    const states = computeLocationRows(run).map((r) => r.state);
    expect(states).toEqual(["done", "failed"]);
  });

  it("ignores upload events when no run is in progress", () => {
    expect(
      applyUploadEvent(undefined, upload("a.b", 1, 2), T0)
    ).toBeUndefined();
    const finished = applyManagerEvent(
      startedRun(),
      create(null, "completed"),
      T0 + 1,
      true
    )!;
    expect(applyUploadEvent(finished, upload("a.b", 1, 2), T0 + 2)).toBe(
      finished
    );
  });

  it("routes events through applyBackupEvent", () => {
    const run = applyBackupEvent(
      startedRun(),
      upload("a.b", 1, 2),
      T0 + 1,
      true
    );
    expect(run?.uploads["a.b"].uploaded).toBe(1);
  });
});

describe("speed and estimates", () => {
  const trackWith = (samples: [number, number][], total = 1000) => ({
    uploaded: samples[samples.length - 1][1],
    total,
    startedAt: 0,
    samples: samples.map(([t, bytes]) => ({ t, bytes })),
  });

  it("gives nothing without enough history", () => {
    expect(computeSpeed(trackWith([[0, 0]]))).toEqual({});
    expect(
      computeSpeed(
        trackWith([
          [0, 0],
          [1000, 100],
          [2000, 200],
        ])
      )
    ).toEqual({});
  });

  it("gives nothing when no bytes moved", () => {
    expect(
      computeSpeed(
        trackWith([
          [0, 50],
          [4000, 50],
          [8000, 50],
        ])
      )
    ).toEqual({});
  });

  it("derives speed and a time estimate from the samples", () => {
    const result = computeSpeed(
      trackWith([
        [0, 0],
        [5000, 100],
        [10000, 200],
      ])
    );
    expect(result.bytesPerSecond).toBe(20);
    expect(result.etaSeconds).toBe(40);
  });

  it("keeps recent samples only and bounds their number", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("upload_to_agents"), T0, true)!;
    for (let i = 1; i <= 40; i++) {
      run = applyUploadEvent(run, upload("a.b", i, 1000), T0 + i * 1000)!;
    }
    expect(run.uploads["a.b"].samples.length).toBeLessThanOrEqual(12);
    expect(
      run.uploads["a.b"].samples.every((s) => T0 + 40000 - s.t <= 30000)
    ).toBe(true);
  });
});

describe("overall line", () => {
  it("counts steps without inventing a percentage", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("home_assistant"), T0, true)!;
    run = applyManagerEvent(run, create("folders"), T0 + 1000, true)!;
    const overall = computeOverall(run, true, T0 + 61000);
    expect(overall.step).toBe(2);
    expect(overall.steps).toBe(5);
    expect(overall.uploadPercent).toBeUndefined();
    expect(overall.elapsedMs).toBe(61000);
  });

  it("gives an upload percentage only from locations that report bytes", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("upload_to_agents"), T0, true)!;
    run = applyUploadEvent(run, upload("a.b", 0, 100), T0 + 1)!;
    expect(computeOverall(run, true, T0 + 2).uploadPercent).toBeUndefined();
    run = applyUploadEvent(run, upload("c.d", 25, 100), T0 + 3)!;
    expect(computeOverall(run, true, T0 + 4).uploadPercent).toBe(25);
  });

  it("stops the clock when the run has ended", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create(null, "completed"), T0 + 3000, true)!;
    expect(computeOverall(run, true, T0 + 999999).elapsedMs).toBe(3000);
  });
});

describe("restoring after a reload", () => {
  it("round-trips a run through storage", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("home_assistant"), T0 + 5, true)!;
    expect(restoreRun(serializeRun(run))).toEqual(run);
  });

  it("rejects missing or damaged stored data", () => {
    expect(restoreRun(null)).toBeUndefined();
    expect(restoreRun("not json")).toBeUndefined();
    expect(restoreRun(JSON.stringify({ kind: "other" }))).toBeUndefined();
  });

  it("adopts the stored run only for the same unfinished operation", () => {
    const run = startedRun();
    expect(adoptStoredRun(run, create("folders"))).toBe(run);
    expect(
      adoptStoredRun(run, {
        manager_state: "restore_backup",
        stage: null,
        state: "in_progress",
        reason: null,
      } as ManagerStateEvent)
    ).toBeUndefined();
    expect(adoptStoredRun(run, { manager_state: "idle" })).toBeUndefined();
    const done = { ...run, state: "completed" as const };
    expect(adoptStoredRun(done, create("folders"))).toBeUndefined();
  });

  it("keeps the recorded times when the replayed event arrives", () => {
    let run = startedRun();
    run = applyManagerEvent(run, create("home_assistant"), T0 + 100, true)!;
    const adopted = adoptStoredRun(
      restoreRun(serializeRun(run)),
      create("home_assistant")
    )!;
    const after = applyManagerEvent(
      adopted,
      create("home_assistant"),
      T0 + 9000,
      true
    )!;
    expect(after.startedAt).toBe(T0);
    expect(after.stageTimes.home_assistant.startedAt).toBe(T0 + 100);
  });
});

describe("formatting", () => {
  it("writes times on a 24-hour clock", () => {
    expect(formatClock(Date.UTC(2026, 10, 17, 19, 49, 5), "UTC")).toBe(
      "19:49:05"
    );
    expect(formatClock(Date.UTC(2026, 10, 17, 0, 3, 9), "UTC")).toBe(
      "00:03:09"
    );
  });

  it("writes durations", () => {
    expect(formatDuration(65000)).toBe("1:05");
    expect(formatDuration(3723000)).toBe("1:02:03");
    expect(formatDuration(-5)).toBe("0:00");
  });
});
