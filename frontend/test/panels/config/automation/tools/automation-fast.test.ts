import { describe, expect, it } from "vitest";
import {
  BRANCH_FOLD_MIN,
  countNestedRows,
  countRows,
  isFastModeActive,
  limitToShow,
  nextRowLimit,
  planFastRender,
  ROOT_CHUNK,
  visibleRowCount,
} from "../../../../../src/panels/config/automation/tools/automation-fast";

const service = (n: number) => ({
  action: "light.turn_on",
  target: { entity_id: `light.lamp_${n}` },
});

/** Five choose steps, each with five options holding twenty steps. */
const bigChoose = () => ({
  actions: Array.from({ length: 5 }, () => ({
    choose: Array.from({ length: 5 }, () => ({
      conditions: [{ condition: "state", entity_id: "sun.sun", state: "on" }],
      sequence: Array.from({ length: 20 }, (_, i) => service(i)),
    })),
  })),
});

describe("fast mode planning", () => {
  it("counts every row of every nested list", () => {
    const config = bigChoose();
    // 5 * (1 choose + 5 * (1 condition + 20 steps))
    expect(countRows(config.actions)).toBe(530);
    expect(countNestedRows(config.actions[0])).toBe(105);
    expect(countNestedRows({ action: "light.turn_on" })).toBe(0);
    expect(countNestedRows("not a step")).toBe(0);
  });

  it("builds only the top level rows while branches are closed", () => {
    const plan = planFastRender(bigChoose());
    expect(plan.total).toBe(530);
    expect(plan.drawnToday).toBe(530);
    expect(plan.drawnFast).toBe(5);
    expect(plan.folded).toHaveLength(5);
    expect(plan.folded[0]).toEqual({ path: "action/0", steps: 105 });
  });

  it("builds the rows of a branch once the person opens it", () => {
    const plan = planFastRender(bigChoose(), { open: ["action/0"] });
    expect(plan.drawnFast).toBe(5 + 5 * 21);
  });

  it("draws a long flat list one chunk at a time", () => {
    const config = {
      triggers: [{ trigger: "state", entity_id: "light.a" }],
      actions: Array.from({ length: 500 }, (_, i) => service(i)),
    };
    const plan = planFastRender(config);
    expect(plan.total).toBe(501);
    expect(plan.drawnFast).toBe(1 + ROOT_CHUNK);
    expect(plan.folded).toEqual([]);
    expect(planFastRender(config, { chunk: 100 }).drawnFast).toBe(101);
  });

  it("only folds branches that hold enough steps", () => {
    const small = {
      actions: [
        { sequence: Array.from({ length: BRANCH_FOLD_MIN - 1 }, service) },
      ],
    };
    expect(planFastRender(small).folded).toEqual([]);
    const big = {
      actions: [{ sequence: Array.from({ length: BRANCH_FOLD_MIN }, service) }],
    };
    expect(planFastRender(big).folded).toHaveLength(1);
  });

  it("switches on from the threshold and only when enabled", () => {
    expect(isFastModeActive(199, true, 200)).toBe(false);
    expect(isFastModeActive(200, true, 200)).toBe(true);
    expect(isFastModeActive(900, false, 200)).toBe(false);
  });

  it("limits the drawn rows only in fast mode", () => {
    expect(visibleRowCount(500, false, 40)).toBe(500);
    expect(visibleRowCount(500, true, 40)).toBe(40);
    expect(visibleRowCount(10, true, 40)).toBe(10);
    expect(nextRowLimit(40, 500)).toBe(80);
    expect(nextRowLimit(480, 500)).toBe(500);
    expect(limitToShow(40, 10)).toBe(40);
    expect(limitToShow(40, 130)).toBe(160);
  });
});
