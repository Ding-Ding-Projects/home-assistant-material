import { beforeEach, describe, expect, it } from "vitest";
import {
  DIM_SUM_CHANCE,
  DIM_SUM_SETTLE_MS,
  decideDimSum,
  drawDimSumRandom,
  resetLaunchDrawForTest,
  setDimSumRandomSource,
  takeLaunchDraw,
} from "../../../src/common/dim-sum/dim-sum-draw";
import type { DimSumAppState } from "../../../src/common/dim-sum/dim-sum-draw";

const calm: DimSumAppState = {
  schoolMode: false,
  onboarding: false,
  signInPage: false,
  connected: true,
  serverBusy: false,
  shellLoading: false,
  errorShown: false,
  dialogOpen: false,
  unsavedChanges: false,
};

// Protects the one thing that decides whether the card shows: the 10 percent
// chance, and every moment when the card must stay away even on a lucky draw.
describe("decideDimSum chance", () => {
  it("shows below ten percent and not at or above it", () => {
    expect(DIM_SUM_CHANCE).toBe(0.1);
    expect(decideDimSum(0, calm)).toBe("show");
    expect(decideDimSum(0.0999, calm)).toBe("show");
    expect(decideDimSum(0.1, calm)).toBe("skip");
    expect(decideDimSum(0.5, calm)).toBe("skip");
    expect(decideDimSum(0.9999, calm)).toBe("skip");
  });
});

describe("decideDimSum must not appear", () => {
  const lucky = 0;

  it.each<[string, Partial<DimSumAppState>]>([
    ["School mode is on", { schoolMode: true }],
    ["first-run onboarding is showing", { onboarding: true }],
    ["the sign in page is showing", { signInPage: true }],
    ["an error screen is shown", { errorShown: true }],
    ["a dialog is open", { dialogOpen: true }],
    ["a page has unsaved changes", { unsavedChanges: true }],
  ])("skips the draw when %s", (_name, change) => {
    expect(decideDimSum(lucky, { ...calm, ...change })).toBe("skip");
  });

  it.each<[string, Partial<DimSumAppState>]>([
    ["the connection is down or reconnecting", { connected: false }],
    ["an update or restart is in progress", { serverBusy: true }],
    ["the shell has not loaded", { shellLoading: true }],
  ])("waits and then loses the draw when %s", (_name, change) => {
    const state = { ...calm, ...change };
    expect(decideDimSum(lucky, state, 0)).toBe("wait");
    expect(decideDimSum(lucky, state, DIM_SUM_SETTLE_MS - 1)).toBe("wait");
    expect(decideDimSum(lucky, state, DIM_SUM_SETTLE_MS)).toBe("skip");
  });

  it("shows once the shell has settled inside the wait", () => {
    expect(decideDimSum(lucky, { ...calm, connected: false }, 1000)).toBe(
      "wait"
    );
    expect(decideDimSum(lucky, calm, 2000)).toBe("show");
  });

  it("never shows for School mode, however long it waits", () => {
    expect(decideDimSum(lucky, { ...calm, schoolMode: true }, 60000)).toBe(
      "skip"
    );
  });

  it("does not wait for a dialog: the draw for that launch is lost", () => {
    expect(decideDimSum(lucky, { ...calm, dialogOpen: true }, 0)).toBe("skip");
  });
});

describe("the launch draw", () => {
  beforeEach(() => {
    resetLaunchDrawForTest();
    setDimSumRandomSource();
  });

  it("is taken once per launch and never again", () => {
    expect(takeLaunchDraw()).toBe(true);
    expect(takeLaunchDraw()).toBe(false);
    expect(takeLaunchDraw()).toBe(false);
  });

  it("reads one fresh value from an injectable random source", () => {
    let calls = 0;
    setDimSumRandomSource(() => {
      calls++;
      return 0.05;
    });
    expect(drawDimSumRandom()).toBe(0.05);
    expect(calls).toBe(1);
  });

  it("uses Math.random again once the injected source is removed", () => {
    setDimSumRandomSource(() => 2);
    setDimSumRandomSource();
    const value = drawDimSumRandom();
    expect(value).toBeGreaterThanOrEqual(0);
    expect(value).toBeLessThan(1);
  });
});
