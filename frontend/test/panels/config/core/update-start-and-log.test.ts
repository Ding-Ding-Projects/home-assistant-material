import { describe, expect, it } from "vitest";
import {
  appSizesFromBackups,
  formatAppSizeMb,
} from "../../../../src/panels/config/core/updates/backup-choice";
import {
  newlyInstalling,
  scrollBehaviorFor,
} from "../../../../src/panels/config/core/updates/scroll-to-installing";
import {
  filterUpdateLog,
  logSourceFor,
  restartHasBegun,
} from "../../../../src/panels/config/core/updates/update-log-source";
import {
  jobStartMs,
  resolveStart,
  startFoundLater,
} from "../../../../src/panels/config/core/updates/update-start-time";

const NOW = Date.parse("2026-11-18T10:10:00Z");

// A page opened in the middle of an update must not claim the update began
// when the page noticed it. Each source of a real start has to win in its
// place, and without any the start is unknown.
describe("resolveStart", () => {
  it("uses the install this page started", () => {
    expect(
      resolveStart(
        {
          runStartedAt: 5,
          jobCreated: "2026-11-18T10:00:00Z",
          queueStartedAt: 7,
          seenTurnedOnAt: 9,
        },
        NOW
      )
    ).toEqual({ startedAt: 5, source: "run" });
  });

  it("uses the Supervisor job's creation time next", () => {
    expect(
      resolveStart(
        {
          jobCreated: "2026-11-18T10:00:00Z",
          queueStartedAt: 7,
          seenTurnedOnAt: 9,
        },
        NOW
      )
    ).toEqual({ startedAt: Date.parse("2026-11-18T10:00:00Z"), source: "job" });
  });

  it("uses the queue's stored step start when there is no job time", () => {
    expect(resolveStart({ queueStartedAt: 7, seenTurnedOnAt: 9 }, NOW)).toEqual(
      {
        startedAt: 7,
        source: "queue",
      }
    );
  });

  it("uses the moment this page saw the update turn on", () => {
    expect(resolveStart({ seenTurnedOnAt: 9 }, NOW)).toEqual({
      startedAt: 9,
      source: "seen",
    });
  });

  it("says the start is unknown for a page opened mid-update", () => {
    expect(resolveStart({}, NOW)).toEqual({ source: "unknown" });
    expect(resolveStart({ jobCreated: "not a date" }, NOW)).toEqual({
      source: "unknown",
    });
  });

  it("ignores a job time in the future", () => {
    expect(jobStartMs("2026-11-18T12:00:00Z", NOW)).toBeUndefined();
    expect(jobStartMs(null, NOW)).toBeUndefined();
  });
});

const LOG = [
  "2026-11-18 10:00:01.100 INFO (MainThread) [supervisor.homeassistant.core] Updating Home Assistant to version 2026.11.1.520",
  "2026-11-18 10:00:02.200 INFO (MainThread) [supervisor.docker.manager] Pulling image ghcr.io/example/core:2026.11.1.520",
  "2026-11-18 10:00:03.300 INFO (MainThread) [supervisor.api.proxy] Request for /unrelated/path",
  "2026-11-18 10:00:04.400 INFO (MainThread) [supervisor.addons.addon] Backup of core_mosquitto finished",
  "2026-11-18 10:00:05.500 ERROR (MainThread) [supervisor.docker.interface] Image failed",
  "Traceback (most recent call last):",
  "  File x, line 1",
  "2026-11-18 10:00:06.600 INFO (MainThread) [supervisor.api.proxy] Mentions 2026.11.1.520 in passing",
  "2026-11-18 10:00:07.700 INFO (MainThread) [supervisor.misc.tasks] Task ran",
].join("\n");

describe("filterUpdateLog", () => {
  const kept = filterUpdateLog(LOG, "2026.11.1.520").split("\n");

  it("keeps the update and the image pull lines", () => {
    expect(kept[0]).toContain("Updating Home Assistant to version");
    expect(kept[1]).toContain("Pulling image");
  });

  it("keeps a line that names the target version and drops unrelated ones", () => {
    expect(kept.some((line) => line.includes("Mentions 2026.11.1.520"))).toBe(
      true
    );
    expect(kept.some((line) => line.includes("unrelated/path"))).toBe(false);
    expect(kept.some((line) => line.includes("Task ran"))).toBe(false);
  });

  it("keeps the lines of a traceback with the line that started it", () => {
    const failed = kept.findIndex((line) => line.includes("Image failed"));
    expect(kept[failed + 1]).toBe("Traceback (most recent call last):");
    expect(kept[failed + 2]).toBe("  File x, line 1");
  });

  it("returns nothing for a log with no lines of this update", () => {
    expect(
      filterUpdateLog(
        "2026-11-18 10:00:00.000 INFO (MainThread) [supervisor.api.proxy] x",
        undefined
      )
    ).toBe("");
  });
});

describe("logSourceFor", () => {
  it.each(["core", "supervisor", "os"] as const)(
    "reads the filtered Supervisor log for %s before the restart",
    (kind) => {
      for (const stage of [
        undefined,
        "backup",
        "download",
        "extract",
        "install",
      ] as const) {
        expect(logSourceFor(kind, stage, undefined, true)).toEqual({
          provider: "supervisor",
          filtered: true,
        });
      }
    }
  );

  it("switches to the log of the thing that restarts once the restart begins", () => {
    expect(logSourceFor("core", "restart", undefined, true)).toEqual({
      provider: "core",
      filtered: false,
    });
    expect(logSourceFor("core", "check", undefined, true)).toEqual({
      provider: "core",
      filtered: false,
    });
    expect(logSourceFor("os", "restart", undefined, true)).toEqual({
      provider: "host",
      filtered: false,
    });
    expect(restartHasBegun("install")).toBe(false);
    expect(restartHasBegun("restart")).toBe(true);
  });

  it("keeps an app's own log", () => {
    expect(logSourceFor("app", "download", "core_mosquitto", true)).toEqual({
      provider: "core_mosquitto",
      filtered: false,
    });
  });
});

describe("scrolling to a started update", () => {
  it("only scrolls to an update that started after the first look", () => {
    expect(newlyInstalling(undefined, ["a"])).toEqual([]);
    expect(newlyInstalling(new Set(["a"]), ["a", "b"])).toEqual(["b"]);
    expect(newlyInstalling(new Set(["a"]), ["a"])).toEqual([]);
  });

  it("does not scroll smoothly when motion is reduced", () => {
    expect(scrollBehaviorFor(true)).toBe("auto");
    expect(scrollBehaviorFor(false)).toBe("smooth");
  });
});

describe("app sizes from the last backups", () => {
  it("takes the newest size for each app and ignores missing sizes", () => {
    const sizes = appSizesFromBackups([
      {
        date: "2026-11-01",
        addons: [
          { slug: "a", size: 10 },
          { slug: "b", size: 5 },
        ],
      },
      {
        date: "2026-11-10",
        addons: [{ slug: "a", size: 12.4 }, { slug: "c" }],
      },
    ]);
    expect(sizes).toEqual({ a: 12.4, b: 5 });
  });

  it("gives nothing when no backup reports a size", () => {
    expect(appSizesFromBackups([])).toEqual({});
    expect(
      appSizesFromBackups([{ date: "d", addons: [{ slug: "a" }] }])
    ).toEqual({});
  });

  it("rounds the size to whole megabytes", () => {
    expect(formatAppSizeMb(12.4)).toBe("12");
    expect(formatAppSizeMb(0.2)).toBe("<1");
  });
});

describe("a start found after the record was made", () => {
  const sources = { jobCreated: "2026-11-18T10:00:00+00:00" };

  it("corrects a record whose start was unknown once the job is read", () => {
    expect(startFoundLater({ startUnknown: true }, sources, NOW)).toBe(
      Date.parse("2026-11-18T10:00:00Z")
    );
  });

  it("leaves a record whose start is known alone", () => {
    expect(startFoundLater({}, sources, NOW)).toBeUndefined();
  });

  it("stays unknown without a job, and never takes the moment a page noticed", () => {
    expect(startFoundLater({ startUnknown: true }, {}, NOW)).toBeUndefined();
    expect(
      startFoundLater({ startUnknown: true }, { seenTurnedOnAt: 9 }, NOW)
    ).toBeUndefined();
  });
});

describe("the Supervisor log as it is really written", () => {
  // The Supervisor colours its lines and writes the time with milliseconds
  // and the UTC offset.
  const line = (logger: string, message: string) =>
    `\u001b[32m2026-11-18 10:01:02.345+00:00 INFO (MainThread) [${logger}] ${message}\u001b[0m`;

  it("keeps the lines of the update when they carry colour codes", () => {
    const text = [
      line(
        "supervisor.docker.interface",
        "Pulling image ghcr.io/home-assistant/x:2026.12.0"
      ),
      line("supervisor.api.proxy", "Something unrelated"),
      line(
        "supervisor.homeassistant.core",
        "Updating Home Assistant to 2026.12.0"
      ),
    ].join("\n");
    const kept = filterUpdateLog(text, "2026.12.0").split("\n");
    expect(kept).toHaveLength(2);
    expect(kept[0]).toContain("Pulling image");
    expect(kept[1]).toContain("Updating Home Assistant");
  });
});
