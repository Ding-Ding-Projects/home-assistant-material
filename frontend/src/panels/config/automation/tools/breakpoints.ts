import type { BreakpointHit, TraceBreakpoint } from "../../../../data/trace";

/** A run of the automation that is halted and waiting for a command. */
export interface PausedRun {
  runId: string;
  /** The trace path of the step the run stopped at. */
  node: string;
}

/**
 * The instance only stops a run before an action step, so triggers and
 * conditions cannot carry a breakpoint.
 */
export const canBreakAt = (path: string): boolean =>
  path === "action" || path.startsWith("action/");

/** Adds a hit of this automation to the halted runs, replacing an older one of the same run. */
export const addPausedRun = (
  paused: PausedRun[],
  hit: BreakpointHit,
  automationId: string
): PausedRun[] => {
  if (hit.domain !== "automation" || hit.item_id !== automationId) {
    return paused;
  }
  return [
    ...paused.filter((run) => run.runId !== hit.run_id),
    { runId: hit.run_id, node: hit.node },
  ];
};

export const removePausedRun = (
  paused: PausedRun[],
  runId: string
): PausedRun[] => paused.filter((run) => run.runId !== runId);

/**
 * The step paths this automation has breakpoints on for every run. A breakpoint
 * on the wildcard node belongs to a single step command, not to a step.
 */
export const breakpointPathsFor = (
  breakpoints: TraceBreakpoint[],
  automationId: string
): string[] => [
  ...new Set(
    breakpoints
      .filter(
        (b) =>
          b.domain === "automation" &&
          b.item_id === automationId &&
          b.run_id === "*" &&
          b.node !== "*"
      )
      .map((b) => b.node)
  ),
];

/** Adds or removes one path from a list of breakpoint paths. */
export const toggleBreakpointPath = (
  paths: string[],
  path: string
): { paths: string[]; set: boolean } =>
  paths.includes(path)
    ? { paths: paths.filter((p) => p !== path), set: false }
    : { paths: [...paths, path], set: true };
