import { describe, expect, it } from "vitest";
import {
  addStall,
  countStalls,
  isOwnCache,
  nextWorkerState,
  parseStalls,
  workerVerdict,
} from "../../src/util/worker-health";

const DAY = 86_400_000;

describe("stalls", () => {
  it("reads only well formed entries and survives bad text", () => {
    expect(parseStalls(null)).toEqual([]);
    expect(parseStalls("not json")).toEqual([]);
    expect(parseStalls('{"t":1}')).toEqual([]);
    expect(
      parseStalls(
        '[{"t":5,"k":"import"},{"t":"x","k":"import"},{"t":6,"k":"zzz"}]'
      )
    ).toEqual([{ t: 5, k: "import" }]);
  });

  it("keeps the newest fifty", () => {
    let list = [] as ReturnType<typeof parseStalls>;
    for (let i = 0; i < 60; i++) {
      list = addStall(list, "reload", i);
    }
    expect(list).toHaveLength(50);
    expect(list[0].t).toBe(10);
  });

  it("counts a window of days", () => {
    const now = 100 * DAY;
    const list = [
      { t: now - 8 * DAY, k: "import" as const },
      { t: now - 6 * DAY, k: "import" as const },
      { t: now - 1000, k: "reload" as const },
    ];
    expect(countStalls(list, 7, now)).toBe(2);
  });
});

describe("worker state", () => {
  it("moves the since moment only when the version changes", () => {
    const first = nextWorkerState(undefined, "1", 10);
    expect(first).toEqual({ version: "1", since: 10, lastCheck: 10 });
    expect(nextWorkerState(first, "1", 50)).toEqual({
      version: "1",
      since: 10,
      lastCheck: 50,
    });
    expect(nextWorkerState(first, "2", 90).since).toBe(90);
  });
});

describe("caches and verdict", () => {
  it("treats only the app's own caches as its own", () => {
    expect(isOwnCache("workbox-precache-v2-http://x/")).toBe(true);
    expect(isOwnCache("navigation-cache")).toBe(true);
    expect(isOwnCache("someone-elses-cache")).toBe(false);
  });

  it("judges the offline copy", () => {
    const base = {
      supported: true,
      registered: true,
      state: "activated",
      controlled: true,
      updateWaiting: false,
      caches: [],
    };
    expect(workerVerdict(base, 0)).toBe("healthy");
    expect(workerVerdict(base, 2)).toBe("attention");
    expect(workerVerdict({ ...base, updateWaiting: true }, 0)).toBe(
      "attention"
    );
    expect(workerVerdict({ ...base, registered: false }, 0)).toBe("inactive");
    expect(workerVerdict({ ...base, supported: false }, 0)).toBe("unsupported");
  });
});
