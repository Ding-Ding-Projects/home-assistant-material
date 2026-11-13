import { describe, expect, it } from "vitest";
import {
  addPausedRun,
  breakpointPathsFor,
  canBreakAt,
  removePausedRun,
  toggleBreakpointPath,
} from "../../../../../src/panels/config/automation/tools/breakpoints";

const hit = (over: Record<string, string> = {}) => ({
  domain: "automation",
  item_id: "123",
  run_id: "run1",
  node: "action/0",
  ...over,
});

describe("canBreakAt", () => {
  it("allows action steps only", () => {
    expect(canBreakAt("action/0")).toBe(true);
    expect(canBreakAt("action/2/choose/0/sequence/1")).toBe(true);
    expect(canBreakAt("trigger/0")).toBe(false);
    expect(canBreakAt("condition/1")).toBe(false);
  });
});

describe("addPausedRun", () => {
  it("records a hit of this automation", () => {
    expect(addPausedRun([], hit(), "123")).toEqual([
      { runId: "run1", node: "action/0" },
    ]);
  });

  it("replaces the older stop of the same run", () => {
    const first = addPausedRun([], hit(), "123");
    const next = addPausedRun(first, hit({ node: "action/1" }), "123");
    expect(next).toEqual([{ runId: "run1", node: "action/1" }]);
  });

  it("keeps different runs apart", () => {
    const first = addPausedRun([], hit(), "123");
    const next = addPausedRun(first, hit({ run_id: "run2" }), "123");
    expect(next.map((run) => run.runId)).toEqual(["run1", "run2"]);
  });

  it("ignores another automation and a script", () => {
    expect(addPausedRun([], hit({ item_id: "999" }), "123")).toEqual([]);
    expect(addPausedRun([], hit({ domain: "script" }), "123")).toEqual([]);
  });
});

describe("removePausedRun", () => {
  it("drops one run", () => {
    const paused = [
      { runId: "a", node: "action/0" },
      { runId: "b", node: "action/1" },
    ];
    expect(removePausedRun(paused, "a")).toEqual([
      { runId: "b", node: "action/1" },
    ]);
  });
});

describe("breakpointPathsFor", () => {
  it("lists the all-run breakpoints of one automation without the step wildcard", () => {
    const list = [
      { domain: "automation", item_id: "123", run_id: "*", node: "action/0" },
      { domain: "automation", item_id: "123", run_id: "*", node: "action/0" },
      { domain: "automation", item_id: "123", run_id: "*", node: "*" },
      { domain: "automation", item_id: "123", run_id: "r", node: "action/3" },
      { domain: "automation", item_id: "9", run_id: "*", node: "action/1" },
      { domain: "script", item_id: "123", run_id: "*", node: "action/2" },
    ];
    expect(breakpointPathsFor(list, "123")).toEqual(["action/0"]);
  });
});

describe("toggleBreakpointPath", () => {
  it("adds and removes a path", () => {
    const on = toggleBreakpointPath([], "action/0");
    expect(on).toEqual({ paths: ["action/0"], set: true });
    expect(toggleBreakpointPath(on.paths, "action/0")).toEqual({
      paths: [],
      set: false,
    });
  });
});
