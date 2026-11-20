import { describe, expect, it } from "vitest";
import {
  MOTION_KIND_IDS,
  standardProfile,
  withKind,
} from "../../../src/common/appearance/motion-profiles";
import {
  ARRIVAL_MAX_ROWS,
  DRAMA_KIND_IDS,
  dramaTiming,
  fallRow,
  playArrival,
  playFailed,
  playFinished,
  playPictureFloat,
  removalDuration,
  removalKeyframes,
  shakeKeyframes,
} from "../../../src/common/motion/drama";

// Protects the dramatic moments: each is its own tunable kind in the motion
// settings, Off and reduced motion never move, a switched-off kind never
// moves, Calm only fades, and Dramatic is the only level with the full
// moment (rays, the falling row, three floats).

const recorder = () => {
  const calls: { keyframes: Keyframe[]; options: KeyframeAnimationOptions }[] =
    [];
  const element = {
    animate(keyframes: Keyframe[], options: KeyframeAnimationOptions) {
      calls.push({ keyframes, options });
      return { finished: Promise.resolve() } as unknown as Animation;
    },
  } as unknown as Element;
  return { element, calls };
};

describe("drama kinds", () => {
  it("registers every moment as a kind in the motion settings", () => {
    for (const kind of DRAMA_KIND_IDS) {
      expect(MOTION_KIND_IDS).toContain(kind);
    }
  });
});

describe("drama timing", () => {
  const profile = standardProfile();

  it("never moves when drama is off or motion is reduced", () => {
    expect(dramaTiming("celebrations", "off", false, profile).mode).toBe(
      "none"
    );
    expect(dramaTiming("celebrations", "dramatic", true, profile).mode).toBe(
      "none"
    );
  });

  it("never moves when the kind or all motion is switched off", () => {
    const kindOff = withKind(profile, "removals", { enabled: false });
    expect(dramaTiming("removals", "dramatic", false, kindOff).mode).toBe(
      "none"
    );
    expect(
      dramaTiming("removals", "dramatic", false, { ...profile, master: false })
        .mode
    ).toBe("none");
  });

  it("only fades, briefly, on calm", () => {
    const timing = dramaTiming("celebrations", "calm", false, profile);
    expect(timing.mode).toBe("fade");
    expect(timing.duration).toBeLessThanOrEqual(300);
  });

  it("uses the kind's duration and the speed factor", () => {
    expect(
      dramaTiming("celebrations", "dramatic", false, profile).duration
    ).toBe(1400);
    expect(
      dramaTiming("celebrations", "dramatic", false, { ...profile, speed: 2 })
        .duration
    ).toBe(700);
    expect(dramaTiming("failures", "standard", false, profile)).toMatchObject({
      mode: "move",
      duration: 550,
    });
  });
});

describe("finished", () => {
  it("sends rays only on dramatic and one ring on standard", () => {
    const parts = () => {
      const badge = recorder();
      const ring1 = recorder();
      const ring2 = recorder();
      const ray = recorder();
      return {
        recorders: { badge, ring1, ring2, ray },
        parts: {
          badge: badge.element,
          rings: [ring1.element, ring2.element],
          rays: [{ element: ray.element, angle: 60 }],
        },
      };
    };
    const dramatic = parts();
    playFinished(dramatic.parts, {
      mode: "dramatic",
      duration: 1400,
      easing: "ease",
    });
    expect(dramatic.recorders.ray.calls).toHaveLength(1);
    expect(dramatic.recorders.ring2.calls).toHaveLength(1);
    expect(
      String(dramatic.recorders.ray.calls[0].keyframes[0].transform)
    ).toContain("rotate(60deg)");

    const standard = parts();
    playFinished(standard.parts, {
      mode: "move",
      duration: 1400,
      easing: "ease",
    });
    expect(standard.recorders.ray.calls).toHaveLength(0);
    expect(standard.recorders.ring1.calls).toHaveLength(1);
    expect(standard.recorders.ring2.calls).toHaveLength(0);
  });

  it("plays nothing with no drama", () => {
    const badge = recorder();
    expect(
      playFinished(
        { badge: badge.element },
        { mode: "none", duration: 0, easing: "" }
      )
    ).toEqual([]);
    expect(badge.calls).toHaveLength(0);
  });
});

describe("failed", () => {
  it("flashes and shakes harder on dramatic", () => {
    const target = recorder();
    const flash = recorder();
    playFailed(
      { target: target.element, flash: flash.element },
      { mode: "dramatic", duration: 550, easing: "ease" }
    );
    expect(flash.calls).toHaveLength(1);
    expect(target.calls[0].keyframes).toEqual(shakeKeyframes(2));
    expect(target.calls[0].options.iterations ?? 1).toBe(1);
  });

  it("only fades on calm, without a flash", () => {
    const target = recorder();
    const flash = recorder();
    playFailed(
      { target: target.element, flash: flash.element },
      { mode: "fade", duration: 300, easing: "ease-out" }
    );
    expect(flash.calls).toHaveLength(0);
    expect(target.calls[0].keyframes).toEqual([
      { opacity: 0.5 },
      { opacity: 1 },
    ]);
  });
});

describe("deleted", () => {
  it("tips and falls on dramatic, then closes the gap", () => {
    const frames = removalKeyframes("dramatic", 64);
    expect(frames[0].height).toBe("64px");
    expect(String(frames[2].transform)).toContain("rotate(24deg)");
    expect(frames[frames.length - 1].height).toBe("0px");
  });

  it("keeps the shorter slide on standard and a fade on calm", () => {
    expect(removalKeyframes("fade", 64)).toEqual([
      { opacity: 1 },
      { opacity: 0 },
    ]);
    expect(removalDuration({ mode: "move", duration: 1150, easing: "" })).toBe(
      420
    );
    expect(
      removalDuration({ mode: "dramatic", duration: 1150, easing: "" })
    ).toBe(1150);
  });

  it("resolves at once when nothing moves", async () => {
    const row = document.createElement("div");
    await expect(
      fallRow(row, { mode: "none", duration: 0, easing: "" })
    ).resolves.toBeUndefined();
  });
});

describe("arriving and empty", () => {
  it("lets at most eight rows follow", () => {
    const rows = Array.from({ length: 20 }, () => recorder());
    playArrival(
      { rows: rows.map((row) => row.element) },
      { mode: "dramatic", duration: 1100, easing: "ease" }
    );
    const moved = rows.filter((row) => row.calls.length > 0).length;
    expect(moved).toBe(ARRIVAL_MAX_ROWS);
  });

  it("floats three times on dramatic, once on standard, not on calm", () => {
    const dramatic = recorder();
    playPictureFloat(dramatic.element, {
      mode: "dramatic",
      duration: 2400,
      easing: "",
    });
    expect(dramatic.calls[0].options.iterations).toBe(3);

    const standard = recorder();
    playPictureFloat(standard.element, {
      mode: "move",
      duration: 2400,
      easing: "",
    });
    expect(standard.calls[0].options.iterations).toBe(1);

    const calm = recorder();
    playPictureFloat(calm.element, {
      mode: "fade",
      duration: 300,
      easing: "",
    });
    expect(calm.calls).toHaveLength(0);
  });
});
