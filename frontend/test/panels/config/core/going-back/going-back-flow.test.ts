import { describe, expect, it } from "vitest";
import type { DowngradeState } from "../../../../../src/panels/config/core/updates/going-back/going-back-flow";
import {
  formatElapsed,
  goingBackView,
  installStarted,
  isNewDowngrade,
  requestSkipPass,
  startGoingBack,
} from "../../../../../src/panels/config/core/updates/going-back/going-back-flow";
import {
  SUPER_STEPS,
  allStepsDone,
  currentStep,
  finishStep,
  leftPage,
  startSuperConfirm,
  stepState,
} from "../../../../../src/panels/config/core/updates/going-back/super-confirm-steps";

// Going back to an older build must show the backup step truthfully and must
// never move on to "going back" while the backup has not finished and been
// checked. The super confirmation must only finish all five steps in order.

const state = (changes: Partial<DowngradeState>): DowngradeState => ({
  from_version: "2026.11.1.527",
  to_version: "2026.11.1.525",
  started: "2026-11-19T21:52:00+00:00",
  stage: "waiting_for_backup",
  backup: null,
  skipped_by_pass: false,
  reason: null,
  detail: null,
  ...changes,
});

describe("super confirmation steps", () => {
  it("finishes the five steps only in order", () => {
    let progress = startSuperConfirm();
    expect(currentStep(progress)).toBe("keys");
    // A game reported out of order changes nothing.
    progress = finishStep(progress, "cookie");
    expect(progress.done).toBe(0);
    for (const step of SUPER_STEPS) {
      expect(allStepsDone(progress)).toBe(false);
      expect(stepState(progress, step)).toBe("current");
      progress = finishStep(progress, step);
      expect(stepState(progress, step)).toBe("done");
    }
    expect(allStepsDone(progress)).toBe(true);
    expect(currentStep(progress)).toBeUndefined();
  });

  it("starts again from step 1 when the page is left", () => {
    let progress = startSuperConfirm();
    progress = finishStep(progress, "keys");
    progress = finishStep(progress, "moles");
    progress = finishStep(progress, "four");
    expect(stepState(progress, "cookie")).toBe("waiting");
    progress = leftPage(progress);
    expect(progress.done).toBe(0);
    expect(currentStep(progress)).toBe("keys");
  });
});

describe("going back view", () => {
  it.each([
    ["waiting_for_backup", "waiting"],
    ["backing_up", "running"],
    ["checking", "checking"],
  ] as const)(
    "keeps going back waiting while the stage is %s",
    (stage, backup) => {
      const view = goingBackView(state({ stage }));
      expect(view.backup).toBe(backup);
      expect(view.install).toBe("waiting");
      expect(installStarted(view)).toBe(false);
    }
  );

  it("shows the checked backup once it is done", () => {
    const view = goingBackView(
      state({
        stage: "installing",
        backup: {
          slug: "abc",
          date: "2026-11-19T21:54:00+00:00",
          size_bytes: 412_000_000,
        },
      })
    );
    expect(view.backup).toBe("done");
    expect(view.install).toBe("running");
    expect(view.backupAt).toBe(Date.parse("2026-11-19T21:54:00+00:00"));
    expect(view.backupSize).toBe(412_000_000);
    // The one-tap delete proof action is offered only with this id.
    expect(view.backupId).toBe("abc");
  });

  it("has no backup id when the Supervisor reports none", () => {
    expect(goingBackView(state({ stage: "backup_checked" })).backupId).toBe(
      undefined
    );
  });

  it("shows no backup when the pass skipped it", () => {
    const view = goingBackView(
      state({ stage: "installing", skipped_by_pass: true })
    );
    expect(view.backup).toBe("skipped");
    expect(installStarted(view)).toBe(true);
  });

  it.each(["failed", "timed_out", "check_failed", "stopped"])(
    "reports the reason %s and never installs",
    (reason) => {
      const view = goingBackView(
        state({ stage: "failed", reason, detail: "Not enough space" })
      );
      expect(view.backup).toBe("failed");
      expect(view.reason).toBe(reason);
      expect(view.detail).toBe("Not enough space");
      expect(installStarted(view)).toBe(false);
    }
  );

  it("calls an unknown reason unknown", () => {
    expect(goingBackView(state({ stage: "failed", reason: "x" })).reason).toBe(
      "unknown"
    );
  });

  it("only follows the going back started from this page", () => {
    const before = state({
      started: "2026-11-19T20:00:00+00:00",
      stage: "failed",
    });
    expect(isNewDowngrade(before, before, "2026.11.1.525")).toBe(false);
    expect(isNewDowngrade(before, state({}), "2026.11.1.525")).toBe(true);
    expect(isNewDowngrade(null, state({}), "2026.11.1.524")).toBe(false);
    expect(isNewDowngrade(null, null, "2026.11.1.525")).toBe(false);
  });

  it("formats elapsed time", () => {
    expect(formatElapsed(48_000)).toBe("0:48");
    expect(formatElapsed(112_000)).toBe("1:52");
    expect(formatElapsed(3_725_000)).toBe("1:02:05");
  });
});

describe("Supervisor calls", () => {
  const recorder = () => {
    const calls: any[] = [];
    const hass = {
      callWS: async (msg: any) => {
        calls.push(msg);
        return { skip_backup_pass: "token" };
      },
    } as any;
    return { calls, hass };
  };

  it("always asks for a backup and runs in the background", async () => {
    const { calls, hass } = recorder();
    await startGoingBack(hass, "2026.11.1.525");
    expect(calls[0]).toEqual({
      type: "supervisor/api",
      endpoint: "/core/update",
      method: "post",
      timeout: null,
      data: { version: "2026.11.1.525", backup: true, background: true },
    });
  });

  it("sends the pass only when one was issued, and never a holder", async () => {
    const { calls, hass } = recorder();
    const pass = await requestSkipPass(hass, "2026.11.1.525");
    await startGoingBack(hass, "2026.11.1.525", pass);
    expect(calls[0]).toEqual({
      type: "supervisor/api",
      endpoint: "/core/downgrade_pass",
      method: "post",
      data: { version: "2026.11.1.525" },
    });
    expect(calls[1].data).toEqual({
      version: "2026.11.1.525",
      backup: true,
      background: true,
      skip_backup_pass: "token",
    });
  });
});
