import { describe, expect, it } from "vitest";
import type { BackupKind } from "../../../../src/data/auto-update";
import type { UpdateEntity } from "../../../../src/data/update";
import {
  BACKUP_KINDS,
  PRESET_CHOICES,
  backupKindOf,
  choiceFor,
  markFor,
  needsSystemConfirmation,
  planQueueBackups,
  presetSettings,
  pruneApps,
  settingsFromInfo,
  stepWantsBackup,
  summaryKey,
  wantsBackup,
} from "../../../../src/panels/config/core/updates/backup-choice";
import type { BackupSubject } from "../../../../src/panels/config/core/updates/backup-choice";
import {
  createQueue,
  parseStoredQueue,
  stepDone,
} from "../../../../src/panels/config/core/updates/update-queue";

// These protect the one decision that the update buttons, "Update everything"
// and the automatic updates all share. A wrong answer here skips the backup
// before a system update, which has no way back, or makes a backup nobody
// asked for.

const SYSTEM: BackupKind[] = ["core", "supervisor", "os"];

describe("wantsBackup", () => {
  const cases = PRESET_CHOICES.flatMap((choice) =>
    BACKUP_KINDS.flatMap((kind) =>
      [true, false].map((supports) => ({ choice, kind, supports }))
    )
  );

  it.each(cases)(
    "$choice, $kind, supports a backup: $supports",
    ({ choice, kind, supports }) => {
      const expected =
        supports &&
        (choice === "all" || (choice === "system" && SYSTEM.includes(kind)));
      expect(wantsBackup(kind, presetSettings(choice), supports, "a")).toBe(
        expected
      );
    }
  );

  it("follows the apps chosen one by one", () => {
    const settings = {
      ...presetSettings("system"),
      apps: ["a"],
      seen: ["a", "b"],
    };
    expect(wantsBackup("app", settings, true, "a")).toBe(true);
    expect(wantsBackup("app", settings, true, "b")).toBe(false);
    expect(wantsBackup("app", settings, false, "a")).toBe(false);
    expect(wantsBackup("device", settings, true, "a")).toBe(false);
  });

  it("gives an app installed later the later choice", () => {
    const base = { ...presetSettings("system"), seen: ["a"] };
    expect(wantsBackup("app", { ...base, later: true }, true, "new")).toBe(
      true
    );
    expect(wantsBackup("app", { ...base, later: false }, true, "new")).toBe(
      false
    );
    expect(wantsBackup("app", { ...base, later: true }, true, "a")).toBe(false);
  });
});

describe("choiceFor and settingsFromInfo", () => {
  it.each(PRESET_CHOICES)("reads %s back from its own values", (choice) => {
    expect(choiceFor(presetSettings(choice))).toBe(choice);
  });

  it("reads one chosen app, or the later choice, as custom", () => {
    expect(
      choiceFor({ ...presetSettings("system"), apps: ["a"], seen: ["a"] })
    ).toBe("custom");
    expect(choiceFor({ ...presetSettings("none"), later: true })).toBe(
      "custom"
    );
    expect(choiceFor({ ...presetSettings("all"), later: false })).toBe(
      "custom"
    );
    const device = presetSettings("system");
    device.kinds.device = true;
    expect(choiceFor(device)).toBe("custom");
  });

  it("migrates a server that only has the single boolean", () => {
    const on = settingsFromInfo({ backup: true });
    const off = settingsFromInfo({ backup: false });
    expect(choiceFor(on)).toBe("all");
    expect(choiceFor(off)).toBe("none");
  });

  it("reads the stored values and the identifiers of chosen apps", () => {
    const settings = settingsFromInfo({
      backup: true,
      backup_kinds: presetSettings("system").kinds,
      backup_apps: ["core_mosquitto"],
      backup_apps_seen: ["core_mosquitto", "a0d7b954_ssh"],
      backup_apps_later: false,
    });
    expect(settings.apps).toEqual(["core_mosquitto"]);
    expect(choiceFor(settings)).toBe("custom");
  });

  it("drops a removed app from the chosen list", () => {
    expect(pruneApps(["a", "gone", "a", "b"], ["b", "a"])).toEqual(["a", "b"]);
  });
});

describe("system confirmation", () => {
  it("asks only when a backup is turned off for Core, Supervisor or the system", () => {
    const system = presetSettings("system");
    const all = presetSettings("all");
    const none = presetSettings("none");
    expect(needsSystemConfirmation(system, none)).toBe(true);
    expect(needsSystemConfirmation(all, none)).toBe(true);
    expect(needsSystemConfirmation(none, all)).toBe(false);
    expect(needsSystemConfirmation(all, system)).toBe(false);
    const apps = presetSettings("all");
    apps.kinds.app = false;
    expect(needsSystemConfirmation(all, apps)).toBe(false);
    const core = presetSettings("system");
    core.kinds.core = false;
    expect(needsSystemConfirmation(system, core)).toBe(true);
  });
});

describe("planQueueBackups", () => {
  const subject = (
    entityId: string,
    kind: BackupKind,
    supportsBackup = true
  ): BackupSubject => ({
    entityId,
    kind,
    appSlug: kind === "app" ? entityId : null,
    supportsBackup,
  });

  const run = [
    subject("supervisor", "supervisor", false),
    subject("a", "app"),
    subject("b", "app"),
    subject("core", "core"),
    subject("os", "os"),
  ];

  it("makes one backup for the system steps and one per chosen app", () => {
    const settings = {
      ...presetSettings("system"),
      apps: ["a"],
      seen: ["a", "b"],
    };
    const plan = planQueueBackups(run, settings);
    expect(plan.carriers).toEqual(["a", "core"]);
    expect(plan.covered).toEqual({ os: "core" });
  });

  it("gives every app its own backup under every update", () => {
    const plan = planQueueBackups(run, presetSettings("all"));
    expect(plan.carriers).toEqual(["a", "b", "core"]);
  });

  it("makes none under no update and skips a step that cannot make one", () => {
    expect(planQueueBackups(run, presetSettings("none")).carriers).toEqual([]);
    expect(planQueueBackups(run, presetSettings("system")).carriers).toEqual([
      "core",
    ]);
  });

  it("makes no second backup for apps a system backup at the start already holds", () => {
    const early = [
      subject("core", "core"),
      subject("a", "app"),
      subject("os", "os"),
    ];
    const plan = planQueueBackups(early, presetSettings("all"), true);
    expect(plan.carriers).toEqual(["core"]);
    expect(plan.covered).toEqual({ a: "core", os: "core" });
  });

  it("does not make an app wait for a system backup that comes after it", () => {
    const plan = planQueueBackups(run, presetSettings("all"), true);
    expect(plan.carriers).toEqual(["a", "b", "core"]);
  });
});

describe("a stored run", () => {
  it("asks only the steps it recorded, and an older run asks as before", () => {
    expect(
      stepWantsBackup({ backup: true, backupSteps: ["core"] }, "core", true)
    ).toBe(true);
    expect(
      stepWantsBackup({ backup: true, backupSteps: ["core"] }, "a", true)
    ).toBe(false);
    expect(
      stepWantsBackup({ backup: true, backupSteps: ["core"] }, "core", false)
    ).toBe(false);
    expect(stepWantsBackup({ backup: true }, "a", true)).toBe(true);
    expect(stepWantsBackup({ backup: false }, "a", true)).toBe(false);
  });

  it("keeps the steps that ask for a backup across a reload", () => {
    const queue = createQueue([], true, ["update.core"]);
    queue.steps.push({
      entityId: "update.core",
      targetVersion: "2",
      state: "updating",
      role: "core",
      seenInProgress: true,
      startedAt: 1000,
      endedAt: 5000,
      idleSince: null,
    });
    const parsed = parseStoredQueue(JSON.stringify(queue));
    expect(parsed?.backupSteps).toEqual(["update.core"]);
    expect(parsed?.steps[0].endedAt).toBe(5000);
  });
});

describe("kinds, marks and the summary", () => {
  const entity = (id: string, attributes = {}): UpdateEntity =>
    ({ entity_id: id, state: "on", attributes }) as unknown as UpdateEntity;

  it("tells the kinds apart, preferring the server's own answer", () => {
    expect(
      backupKindOf(entity("update.home_assistant_core_update"), "hassio")
    ).toBe("core");
    expect(backupKindOf(entity("update.x"), "hassio")).toBe("app");
    expect(
      backupKindOf(entity("update.x", { device_class: "firmware" }), "esphome")
    ).toBe("device");
    expect(backupKindOf(entity("update.x"), "hacs")).toBe("integration");
    expect(backupKindOf(entity("update.x"), "zha")).toBe("device");
    expect(backupKindOf(entity("update.x"), "hassio", "integration")).toBe(
      "integration"
    );
  });

  it("marks a row backup first, no backup or unsupported", () => {
    const settings = presetSettings("system");
    const subject = (kind: BackupKind, supportsBackup: boolean) => ({
      entityId: "e",
      kind,
      supportsBackup,
    });
    expect(markFor(subject("core", true), settings)).toBe("backup_first");
    expect(markFor(subject("app", true), settings)).toBe("no_backup");
    expect(markFor(subject("core", false), settings)).toBe("unsupported");
  });

  it("says so when there is no Supervisor", () => {
    expect(summaryKey("custom", false)).toBe("summary_no_supervisor");
    expect(summaryKey("custom", true)).toBe("summary_custom");
    expect(summaryKey("system", false)).toBe("summary_system");
  });
});

describe("stepDone for Core", () => {
  const step = { targetVersion: "2026.11.1", role: "core" as const };
  const core = (inProgress: boolean, installed = "2026.11.0") =>
    ({
      entity_id: "update.home_assistant_core_update",
      state: "on",
      attributes: { in_progress: inProgress, installed_version: installed },
    }) as unknown as UpdateEntity;

  it("is done as soon as the running version is the target, even while the entity still says it is running", () => {
    expect(stepDone(core(true), step, "2026.11.1")).toBe(true);
  });

  it("is not done while the running version is older", () => {
    expect(stepDone(core(true), step, "2026.11.0")).toBe(false);
  });
});
