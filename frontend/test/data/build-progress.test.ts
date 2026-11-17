import { describe, expect, it } from "vitest";
import type {
  BuildJob,
  BuildRun,
  StageSummary,
} from "../../src/data/build-progress";
import {
  buildStages,
  chooseRun,
  computeProgress,
  coreBase,
  coreUpdateOffered,
  coreVersionFor,
  currentStage,
  estimateRemaining,
  formatElapsed,
  jobState,
  parseBuildNumber,
  parseJobs,
  parseRuns,
  pickRunTitle,
  replacedRuns,
  estimateCore,
  stageCount,
  stageOfJob,
} from "../../src/data/build-progress";
import { rateLimitResetFromHeaders } from "../../src/data/public-json";

const run = (number: number, over: Partial<BuildRun> = {}): BuildRun => ({
  id: number * 10,
  runNumber: number,
  status: "completed",
  conclusion: "success",
  event: "push",
  headSha: "abc",
  createdAt: "2026-11-16T10:00:00Z",
  startedAt: "2026-11-16T10:00:00Z",
  updatedAt: "2026-11-16T12:00:00Z",
  url: "",
  title: `build ${number}`,
  ...over,
});

const job = (
  name: string,
  status: string,
  conclusion: string | null = null,
  times: Partial<BuildJob> = {}
): BuildJob => ({
  name,
  status,
  conclusion,
  startedAt: null,
  completedAt: null,
  ...times,
});

const ok = (name: string) => job(name, "completed", "success");

describe("versions", () => {
  it("reads the build number and the base of a four part version", () => {
    expect(parseBuildNumber("2026.11.1.457")).toBe(457);
    expect(coreBase("2026.11.1.457")).toBe("2026.11.1");
    expect(coreVersionFor("2026.11.1", 460)).toBe("2026.11.1.460");
  });

  it("has no build number for a plain three part version", () => {
    expect(parseBuildNumber("2026.11.1")).toBeUndefined();
    expect(coreBase("2026.11.1")).toBeUndefined();
    expect(coreVersionFor(undefined, 5)).toBeUndefined();
    expect(parseBuildNumber("2026.11.1.beta")).toBeUndefined();
    expect(parseBuildNumber(undefined)).toBeUndefined();
  });
});

describe("parsing", () => {
  it("ignores entries that are not runs or jobs", () => {
    expect(
      parseRuns({
        workflow_runs: [
          { id: 1, run_number: 2, status: "queued" },
          { id: "x", run_number: 3, status: "queued" },
          null,
          { id: 4 },
        ],
      })
    ).toHaveLength(1);
    expect(parseRuns("nope")).toEqual([]);
    expect(
      parseJobs({ jobs: [{ name: "a", status: "queued" }, { status: "x" }] })
    ).toHaveLength(1);
  });
});

describe("choosing the run", () => {
  it("prefers the newest running build and reports the one waiting behind it", () => {
    const choice = chooseRun(
      [
        run(461, { status: "queued", conclusion: null }),
        run(460, { status: "in_progress", conclusion: null }),
        run(459),
      ],
      457
    );
    expect(choice.kind).toBe("active");
    if (choice.kind === "active") {
      expect(choice.run.runNumber).toBe(460);
      expect(choice.next?.runNumber).toBe(461);
    }
  });

  it("shows a queued run when nothing is running", () => {
    const choice = chooseRun(
      [run(461, { status: "pending", conclusion: null }), run(460)],
      457
    );
    expect(choice.kind).toBe("waiting");
  });

  it("says a finished newer build is ready, and a failed one is failed", () => {
    expect(chooseRun([run(460)], 457).kind).toBe("ready");
    expect(chooseRun([run(460, { conclusion: "failure" })], 457).kind).toBe(
      "failed"
    );
  });

  it("never picks a cancelled run and says nothing when nothing is newer", () => {
    expect(chooseRun([run(461, { conclusion: "cancelled" })], 460).kind).toBe(
      "none"
    );
    expect(
      chooseRun([run(461, { conclusion: "cancelled" }), run(460)], 457).kind
    ).toBe("ready");
    expect(chooseRun([run(457)], 457).kind).toBe("none");
    expect(chooseRun([run(460)], undefined).kind).toBe("none");
  });
});

describe("jobs and stages", () => {
  it("names the state of a job", () => {
    expect(jobState(job("a", "completed", "success"))).toBe("done");
    expect(jobState(job("a", "completed", "skipped"))).toBe("skipped");
    expect(jobState(job("a", "completed", "cancelled"))).toBe("cancelled");
    expect(jobState(job("a", "completed", "failure"))).toBe("failed");
    expect(jobState(job("a", "in_progress"))).toBe("running");
    expect(jobState(job("a", "queued"))).toBe("waiting");
  });

  it("maps job names to stages", () => {
    expect(stageOfJob("Work out versions")).toBe("prepare");
    expect(stageOfJob("Build the frontend")).toBe("interface");
    expect(stageOfJob("Collect integration translations")).toBe("interface");
    expect(stageOfJob("Stage the Deploy Assistant")).toBe("interface");
    expect(stageOfJob("Build amd64 core images")).toBe("images");
    expect(stageOfJob("Build aarch64 supervisor image")).toBe("images");
    expect(stageOfJob("Publish the container image")).toBe("publish");
    expect(stageOfJob("Build the full hosting mode image")).toBe("publish");
    expect(stageOfJob("Move the update feed for Core and Supervisor")).toBe(
      "offer"
    );
    expect(stageOfJob("Build the Green operating system image")).toBe("system");
    expect(stageOfJob("Publish the release")).toBe("release");
    expect(stageOfJob("Something new")).toBe("other");
  });

  const jobs = [
    ok("Work out versions"),
    ok("Build the frontend"),
    ok("Collect integration translations"),
    ok("Build amd64 core images"),
    job("Build aarch64 core images", "in_progress"),
    job("Publish the container image", "queued"),
    job("Move the update feed for Core and Supervisor", "queued"),
    job("Build the Green operating system image", "queued"),
    job("Publish the release", "completed", "skipped"),
  ];

  it("leaves the release stage out of a run that skipped it", () => {
    const stages = buildStages(
      jobs,
      { status: "in_progress", event: "push" },
      0
    );
    expect(stages.map((stage) => stage.id)).toEqual([
      "prepare",
      "interface",
      "images",
      "publish",
      "offer",
      "system",
    ]);
    expect(currentStage(stages)?.id).toBe("images");
    expect(coreUpdateOffered(stages)).toBe(false);
  });

  it("leaves the release stage out when its job is absent, unless the run was started by hand", () => {
    const without = jobs.slice(0, -1);
    expect(
      buildStages(without, { status: "in_progress", event: "push" }, 0).some(
        (stage) => stage.id === "release"
      )
    ).toBe(false);
    const stages = buildStages(
      without,
      { status: "in_progress", event: "workflow_dispatch" },
      0
    );
    expect(stages[stages.length - 1]).toMatchObject({
      id: "release",
      state: "waiting",
    });
  });

  it("shows stages that have no jobs yet as waiting, but not for a finished run", () => {
    expect(
      buildStages(
        [ok("Work out versions")],
        { status: "in_progress", event: "push" },
        0
      ).length
    ).toBe(6);
    expect(
      buildStages(
        [ok("Work out versions")],
        { status: "completed", event: "push" },
        0
      ).length
    ).toBe(1);
  });

  it("reports a failed job as a failed stage and the current stage", () => {
    const stages = buildStages(
      [
        ok("Work out versions"),
        job("Build the frontend", "completed", "failure"),
        job("Collect integration translations", "in_progress"),
      ],
      { status: "in_progress", event: "push" },
      0
    );
    expect(stages.find((stage) => stage.id === "interface")?.state).toBe(
      "failed"
    );
    expect(currentStage(stages)?.id).toBe("interface");
  });

  it("marks the Core update as offered once its stage is done", () => {
    const stages = buildStages(
      [ok("Move the update feed for Core and Supervisor")],
      { status: "in_progress", event: "push" },
      0
    );
    expect(coreUpdateOffered(stages)).toBe(true);
  });
});

describe("progress", () => {
  it("counts finished jobs over jobs total and ignores skipped ones", () => {
    expect(
      computeProgress([
        ok("a"),
        ok("b"),
        job("c", "in_progress"),
        job("d", "completed", "skipped"),
      ])
    ).toEqual({ done: 2, total: 3, percent: 67 });
  });

  it("never shows 100 until every job is done", () => {
    const many = Array.from({ length: 300 }, (_, i) =>
      i === 0 ? job("x", "queued") : ok(`j${i}`)
    );
    expect(computeProgress(many).percent).toBe(99);
    expect(computeProgress([ok("a")]).percent).toBe(100);
    expect(computeProgress([])).toEqual({ done: 0, total: 0, percent: 0 });
  });
});

describe("estimate", () => {
  const stages = buildStages(
    [job("Build the Green operating system image", "in_progress")],
    { status: "in_progress", event: "push" },
    0
  );
  const start = "2026-11-16T10:00:00Z";
  const at = (minutes: number) => Date.parse(start) + minutes * 60000;

  it("counts down from about two hours", () => {
    expect(estimateRemaining(stages, start, at(30))).toBe(90);
    expect(estimateRemaining(stages, start, at(119))).toBe(1);
  });

  it("says overdue after the typical time", () => {
    expect(estimateRemaining(stages, start, at(130))).toBe("overdue");
  });

  it("has no estimate without a start time", () => {
    expect(estimateRemaining(stages, "", at(10))).toBeUndefined();
  });
});

describe("small helpers", () => {
  it("formats elapsed time", () => {
    expect(formatElapsed(65)).toBe("1:05");
    expect(formatElapsed(3725)).toBe("1:02:05");
    expect(formatElapsed(undefined)).toBe("");
  });

  it("reads when a rate limit ends", () => {
    const headers: Record<string, string> = { "x-ratelimit-reset": "1000" };
    expect(
      rateLimitResetFromHeaders((name) => headers[name] ?? null)?.getTime()
    ).toBe(1_000_000);
    const retry: Record<string, string> = { "retry-after": "60" };
    expect(
      rateLimitResetFromHeaders((name) => retry[name] ?? null, 5000)?.getTime()
    ).toBe(65_000);
    expect(rateLimitResetFromHeaders(() => null)).toBeUndefined();
  });
});

describe("run titles", () => {
  const entry = (over: Record<string, unknown>) => ({
    id: 1,
    run_number: 462,
    status: "in_progress",
    ...over,
  });

  it("keeps a display title that names a change", () => {
    expect(pickRunTitle("Fix the footer", "Release", "Other")).toBe(
      "Fix the footer"
    );
  });

  it("uses the first line of the commit when the title is the workflow name", () => {
    expect(pickRunTitle("Release", "Release", "Fix it\n\nBody text")).toBe(
      "Fix it"
    );
    expect(pickRunTitle("release", " Release ", "Fix it")).toBe("Fix it");
  });

  it("uses the commit when the title is empty", () => {
    expect(pickRunTitle("", "Release", "Fix it")).toBe("Fix it");
  });

  it("shows nothing when the title is the workflow name and there is no commit", () => {
    expect(pickRunTitle("Release", "Release", undefined)).toBe("");
  });

  it("reads the head commit of a run from the run list", () => {
    const [first] = parseRuns({
      workflow_runs: [
        entry({
          name: "Release",
          display_title: "Release",
          head_commit: { message: "Add the USB update\n\nMore" },
        }),
      ],
    });
    expect(first.title).toBe("Add the USB update");
    const [plain] = parseRuns({
      workflow_runs: [entry({ name: "Release", display_title: "Fix it" })],
    });
    expect(plain.title).toBe("Fix it");
  });
});

describe("replaced builds and Core estimate", () => {
  const make = (number: number, over: Partial<BuildRun> = {}): BuildRun => ({
    id: number,
    runNumber: number,
    status: "completed",
    conclusion: "cancelled",
    event: "push",
    headSha: "",
    createdAt: "",
    startedAt: "",
    updatedAt: "",
    url: "",
    title: "",
    ...over,
  });

  it("lists cancelled builds between the installed build and the chosen one", () => {
    const runs = [
      make(461),
      make(460, { conclusion: "success" }),
      make(458),
      make(462, { status: "in_progress", conclusion: null }),
    ];
    expect(replacedRuns(runs, runs[3], 459).map((r) => r.runNumber)).toEqual([
      461,
    ]);
    expect(replacedRuns(runs, undefined, 459)).toEqual([]);
  });

  const stage = (id: string, state: string) =>
    ({ id, state, jobs: [] }) as unknown as StageSummary;
  const start = "2026-11-16T10:00:00Z";
  const at = (minutes: number) => Date.parse(start) + minutes * 60000;

  it("estimates the time until Core can be installed", () => {
    const stages = [stage("prepare", "done"), stage("offer", "waiting")];
    expect(estimateCore(stages, start, at(10))).toBe(17);
    expect(estimateCore(stages, start, at(40))).toBe("overdue");
    expect(estimateCore([stage("offer", "done")], start, at(10))).toBe(0);
    expect(
      estimateCore([stage("prepare", "done")], start, at(10))
    ).toBeUndefined();
  });

  it("counts finished jobs of a stage without the skipped ones", () => {
    const counted = {
      id: "system",
      state: "running",
      jobs: [
        { name: "a", state: "done" },
        { name: "b", state: "running" },
        { name: "c", state: "skipped" },
      ],
    } as unknown as StageSummary;
    expect(stageCount(counted)).toEqual({ done: 1, total: 2 });
  });
});
