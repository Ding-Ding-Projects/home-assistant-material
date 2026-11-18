import { describe, expect, it } from "vitest";
import {
  ESTIMATE_MIN_GAIN,
  ESTIMATE_MIN_SPAN_MS,
  RECORD_KEEP_MS,
  addPercentSample,
  appSlugOf,
  cleanPercent,
  deriveStages,
  estimateRemainingMs,
  formatClock,
  maskLogLine,
  parseRecords,
  prepareLogLines,
  progressKindOf,
  queueOrderOf,
  queuePositionOf,
  shortSystemName,
  stageIdsFor,
} from "../../../../src/panels/config/core/updates/update-progress-model";
import type { PercentSamples } from "../../../../src/panels/config/core/updates/update-progress-model";
import { makeProgressText } from "../../../../src/panels/config/core/updates/update-progress-strings";
import type { QueueState } from "../../../../src/panels/config/core/updates/update-queue";

// Protects what the update rows promise: the steps shown for each kind of
// update, that a percentage or an estimate is only shown when a source really
// gave data, that the queue place is worded from the real order, that a
// stored run comes back after a reload, and that log lines never show a
// password or token.

const states = (rows: { id: string; state: string }[]) =>
  Object.fromEntries(rows.map((row) => [row.id, row.state]));

describe("kinds and steps", () => {
  it("lists the steps for each kind of update", () => {
    expect(stageIdsFor("core", true)).toEqual([
      "backup",
      "download",
      "extract",
      "install",
      "restart",
      "check",
    ]);
    expect(stageIdsFor("os", true)).toEqual([
      "backup",
      "download",
      "install",
      "restart",
      "check",
    ]);
    expect(stageIdsFor("app", false)).toEqual([
      "backup",
      "download",
      "extract",
      "install",
      "check",
    ]);
    expect(stageIdsFor("firmware", true)).toEqual(["install", "check"]);
  });

  it("leaves the backup step out when nobody knows if one was asked for", () => {
    expect(stageIdsFor("core", undefined)).not.toContain("backup");
  });

  it("tells the kind of an update from the entity", () => {
    const system = (id: string) => ({ entity_id: id, attributes: {} }) as any;
    expect(progressKindOf(system("update.home_assistant_core_update"))).toBe(
      "core"
    );
    expect(
      progressKindOf(system("update.home_assistant_operating_system_update"))
    ).toBe("os");
    expect(progressKindOf(system("update.some_app"), "hassio")).toBe("app");
    expect(
      progressKindOf(
        {
          entity_id: "update.lamp",
          attributes: { device_class: "firmware" },
        } as any,
        "zha"
      )
    ).toBe("firmware");
    expect(progressKindOf(system("update.integration"), "hacs")).toBe("entity");
  });

  it("reads an app slug from its picture", () => {
    expect(
      appSlugOf({
        attributes: { entity_picture: "/api/hassio/addons/core_ssh/icon" },
      } as any)
    ).toBe("core_ssh");
    expect(appSlugOf({ attributes: {} } as any)).toBeUndefined();
  });
});

describe("stage states", () => {
  it("marks earlier steps done, the current one running, the rest waiting", () => {
    const rows = deriveStages({
      kind: "core",
      backupRequested: true,
      jobStage: "Extracting",
      hasPercent: true,
    });
    expect(states(rows)).toEqual({
      backup: "done",
      download: "done",
      extract: "running",
      install: "waiting",
      restart: "waiting",
      check: "waiting",
    });
  });

  it("shows the backup as the running step while the backup runs", () => {
    const rows = deriveStages({
      kind: "supervisor",
      backupRequested: true,
      tracker: "backing_up",
      hasPercent: false,
    });
    expect(states(rows).backup).toBe("running");
    expect(states(rows).download).toBe("waiting");
  });

  it("skips a backup that was not asked for", () => {
    const rows = deriveStages({
      kind: "os",
      backupRequested: false,
      hasPercent: true,
    });
    expect(states(rows).backup).toBe("skipped");
    expect(states(rows).download).toBe("running");
  });

  it("treats the Supervisor percentage as the image download", () => {
    const rows = deriveStages({
      kind: "app",
      backupRequested: false,
      hasPercent: true,
    });
    expect(states(rows).download).toBe("running");
  });

  it("reports the restart wait", () => {
    const rows = deriveStages({
      kind: "core",
      backupRequested: false,
      tracker: "waiting",
      hasPercent: false,
    });
    expect(states(rows)).toMatchObject({
      download: "done",
      install: "done",
      restart: "running",
      check: "waiting",
    });
  });

  it("marks every step done when the update arrived", () => {
    const rows = deriveStages({
      kind: "core",
      backupRequested: false,
      hasPercent: false,
      end: "done",
    });
    expect(
      rows.every((row) => row.state === "done" || row.state === "skipped")
    ).toBe(true);
    expect(states(rows).backup).toBe("skipped");
  });

  it("fails the step that was current and skips the rest", () => {
    const rows = deriveStages({
      kind: "core",
      backupRequested: false,
      hasPercent: false,
      end: "failed",
      failedAt: "install",
    });
    expect(states(rows)).toMatchObject({
      download: "done",
      extract: "done",
      install: "failed",
      restart: "skipped",
      check: "skipped",
    });
  });

  it("claims no running step when no source says where the update is", () => {
    const rows = deriveStages({
      kind: "entity",
      backupRequested: undefined,
      hasPercent: false,
    });
    expect(rows.some((row) => row.state === "running")).toBe(false);
  });
});

describe("percentage and estimate", () => {
  it("accepts only real numbers and keeps them between 0 and 100", () => {
    expect(cleanPercent(null)).toBeUndefined();
    expect(cleanPercent(undefined)).toBeUndefined();
    expect(cleanPercent(Number.NaN)).toBeUndefined();
    expect(cleanPercent("40")).toBeUndefined();
    expect(cleanPercent(42.9)).toBe(42);
    expect(cleanPercent(140)).toBe(100);
    expect(cleanPercent(-5)).toBe(0);
  });

  it("never lets the percentage go back", () => {
    let samples: PercentSamples | undefined;
    samples = addPercentSample(samples, 20, 1000);
    samples = addPercentSample(samples, 15, 2000);
    expect(samples?.lastValue).toBe(20);
    samples = addPercentSample(samples, 30, 3000);
    expect(samples?.lastValue).toBe(30);
    expect(samples?.firstValue).toBe(20);
    expect(addPercentSample(undefined, undefined, 5)).toBeUndefined();
  });

  it("gives no estimate without data", () => {
    expect(estimateRemainingMs(undefined, 100000)).toBeUndefined();
  });

  it("gives no estimate from too little time or movement", () => {
    const base = { firstAt: 0, firstValue: 10, lastAt: 0, lastValue: 10 };
    expect(
      estimateRemainingMs(
        { ...base, lastAt: ESTIMATE_MIN_SPAN_MS - 1, lastValue: 30 },
        ESTIMATE_MIN_SPAN_MS
      )
    ).toBeUndefined();
    expect(
      estimateRemainingMs(
        {
          ...base,
          lastAt: ESTIMATE_MIN_SPAN_MS * 3,
          lastValue: 10 + ESTIMATE_MIN_GAIN - 1,
        },
        ESTIMATE_MIN_SPAN_MS * 3
      )
    ).toBeUndefined();
  });

  it("derives an estimate from the real speed", () => {
    // 20 points in 20 seconds: 80 points left take 80 seconds.
    const samples = {
      firstAt: 0,
      firstValue: 10,
      lastAt: 20_000,
      lastValue: 30,
    };
    expect(estimateRemainingMs(samples, 20_000)).toBe(70_000);
    // The seconds since the last reading are already spent.
    expect(estimateRemainingMs(samples, 30_000)).toBe(60_000);
    expect(
      estimateRemainingMs({ ...samples, lastValue: 100 }, 20_000)
    ).toBeUndefined();
  });

  it("writes the time in 24-hour form", () => {
    expect(formatClock(new Date(2026, 10, 17, 19, 49).getTime())).toBe("19:49");
    expect(formatClock(new Date(2026, 10, 17, 7, 5).getTime())).toBe("07:05");
  });
});

describe("queue place", () => {
  const queue = {
    version: 1,
    backup: false,
    stopRequested: false,
    steps: [
      { entityId: "update.sup", state: "done" },
      { entityId: "update.core", state: "updating" },
      { entityId: "update.os", state: "waiting" },
    ],
  } as unknown as QueueState;

  it("lists only the steps that have not finished", () => {
    expect(queueOrderOf(queue)).toEqual(["update.core", "update.os"]);
    expect(queueOrderOf(undefined)).toEqual([]);
  });

  it("names the place and the update ahead", () => {
    const order = queueOrderOf(queue);
    expect(queuePositionOf(order, "update.os", "os")).toEqual({
      position: 2,
      total: 2,
      afterEntityId: "update.core",
      restartsSystem: true,
    });
    expect(queuePositionOf(order, "update.core", "core")?.afterEntityId).toBe(
      undefined
    );
    expect(queuePositionOf(order, "update.app", "app")).toBeUndefined();
  });

  it("says an app does not restart the system", () => {
    expect(
      queuePositionOf(["update.a", "update.b"], "update.b", "app")
        ?.restartsSystem
    ).toBe(false);
  });
});

describe("labels", () => {
  it("falls back to readable English when a key has no translation", () => {
    const text = makeProgressText(() => "");
    expect(text("stage.backup")).toBe("Backup");
    expect(text("queue_after", { position: 2, total: 3, name: "Core" })).toBe(
      "2 of 3, after Core"
    );
    expect(text("a.key.that.does.not.exist")).toBe("a.key.that.does.not.exist");
  });

  it("uses the translation when there is one", () => {
    const text = makeProgressText((key) =>
      key.endsWith("stage.backup") ? "備份" : ""
    );
    expect(text("stage.backup")).toBe("備份");
  });

  it("shortens system names and keeps other names", () => {
    expect(shortSystemName("Home Assistant Operating System Update")).toBe(
      "Operating System"
    );
    expect(shortSystemName("Home Assistant Core")).toBe("Core");
    expect(shortSystemName("Lamp firmware")).toBe("Lamp firmware");
  });
});

describe("restoring after a reload", () => {
  const now = Date.now();
  const record = (extra: Record<string, unknown> = {}) => ({
    entityId: "update.home_assistant_core_update",
    kind: "core",
    title: "Home Assistant Core",
    fromVersion: "1.0",
    toVersion: "1.1",
    startedAt: now - 60_000,
    backup: true,
    ...extra,
  });

  it("restores a running record with its percentage history", () => {
    const samples = {
      firstAt: now - 50_000,
      firstValue: 5,
      lastAt: now - 1000,
      lastValue: 40,
    };
    const parsed = parseRecords(JSON.stringify([record({ samples })]), now);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].samples).toEqual(samples);
    expect(parsed[0].backup).toBe(true);
  });

  it("remembers that the start of an install was not known", () => {
    const parsed = parseRecords(
      JSON.stringify([record({ startUnknown: true }), record()]),
      now
    );
    expect(parsed[0].startUnknown).toBe(true);
    expect(parsed[1].startUnknown).toBeUndefined();
  });

  it("keeps an unknown backup choice unknown", () => {
    const parsed = parseRecords(JSON.stringify([record({ backup: "x" })]), now);
    expect(parsed[0].backup).toBeNull();
  });

  it("keeps a failed record and drops an old finished one", () => {
    const failed = record({
      result: "failed",
      finishedAt: now - 3 * RECORD_KEEP_MS,
      error: "The image could not be pulled",
    });
    const done = record({
      entityId: "update.home_assistant_supervisor_update",
      kind: "supervisor",
      result: "done",
      finishedAt: now - 2 * RECORD_KEEP_MS,
    });
    const recent = record({
      entityId: "update.home_assistant_operating_system_update",
      kind: "os",
      result: "done",
      finishedAt: now - 1000,
    });
    const parsed = parseRecords(JSON.stringify([failed, done, recent]), now);
    expect(parsed.map((item) => item.entityId)).toEqual([
      "update.home_assistant_core_update",
      "update.home_assistant_operating_system_update",
    ]);
  });

  it("drops anything unexpected", () => {
    expect(parseRecords(null, now)).toEqual([]);
    expect(parseRecords("not json", now)).toEqual([]);
    expect(parseRecords('{"a":1}', now)).toEqual([]);
    expect(
      parseRecords(JSON.stringify([record({ entityId: "light.kitchen" })]), now)
    ).toEqual([]);
    expect(
      parseRecords(JSON.stringify([record({ kind: "other" })]), now)
    ).toEqual([]);
  });

  it("hides credentials in a stored error and stored lines", () => {
    const parsed = parseRecords(
      JSON.stringify([
        record({
          result: "failed",
          finishedAt: now,
          error: "request failed, password=hunter2hunter2",
          lastLines: ["token: abcdef123456"],
        }),
      ]),
      now
    );
    expect(parsed[0].error).not.toContain("hunter2");
    expect(parsed[0].lastLines?.join("")).not.toContain("abcdef123456");
  });
});

describe("log lines", () => {
  it("removes colour codes and hides secrets", () => {
    expect(maskLogLine("\u001b[32mINFO\u001b[0m pulled image")).toBe(
      "INFO pulled image"
    );
    expect(maskLogLine("login with password=swordfish")).not.toContain(
      "swordfish"
    );
    expect(maskLogLine("Authorization: Bearer abcdef0123456789")).not.toContain(
      "abcdef0123456789"
    );
    expect(
      maskLogLine("url https://user:secret@example.com/path")
    ).not.toContain("secret");
  });

  it("keeps only the newest lines and drops empty ones", () => {
    const text = ["one", "", "two", "  ", "three", "four"].join("\n");
    expect(prepareLogLines(text, 2)).toEqual(["three", "four"]);
    expect(prepareLogLines("")).toEqual([]);
  });
});
