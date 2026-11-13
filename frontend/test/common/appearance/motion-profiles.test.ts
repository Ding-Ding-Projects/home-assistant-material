import { describe, expect, it } from "vitest";
import {
  BUILT_IN_PROFILES,
  copyActiveToNew,
  curveToCss,
  customCurve,
  editActiveProfile,
  effectiveDuration,
  isDefaultProfile,
  MAX_CUSTOM_PROFILES,
  motionLockReason,
  namedCurve,
  normalizeMotionSettings,
  profileToCss,
  profileToVariables,
  removeProfile,
  standardProfile,
  withKind,
} from "../../../src/common/appearance/motion-profiles";

describe("motion profiles", () => {
  it("writes nothing for the profile that equals the theme", () => {
    expect(profileToVariables(standardProfile())).toEqual({});
    expect(profileToCss(standardProfile())).toBe("");
  });

  it("makes everything change at once when the master switch is off", () => {
    const none = BUILT_IN_PROFILES.find((p) => p.id === "none")!;
    const vars = profileToVariables(none);
    expect(vars["--ha-animation-duration-normal"]).toBe("1ms");
    expect(vars["--ha-motion-cards-duration"]).toBe("1ms");
    expect(vars["--ha-dialog-show-duration"]).toBe("1ms");
  });

  it("divides durations by the speed factor", () => {
    const fast = { ...standardProfile(), speed: 2 };
    expect(effectiveDuration(fast, "cards")).toBe(225);
    expect(profileToVariables(fast)["--ha-animation-duration-normal"]).toBe(
      "125ms"
    );
  });

  it("writes a curve only where it differs from the theme", () => {
    const profile = withKind(standardProfile(), "menus", {
      curve: namedCurve("linear"),
    });
    const vars = profileToVariables(profile);
    expect(vars["--ha-motion-menus-curve"]).toBe("cubic-bezier(0, 0, 1, 1)");
    expect(vars["--ha-motion-cards-curve"]).toBeUndefined();
    expect(vars["--ha-motion-menus-duration"]).toBeUndefined();
  });

  it("only applies the stylesheet while motion is allowed", () => {
    const css = profileToCss({ ...standardProfile(), speed: 0.5 });
    expect(css).toContain("prefers-reduced-motion: no-preference");
    expect(css).toContain(":not([data-a11y-reduce-motion])");
    expect(css).toContain(":not([data-low-stimulation])");
  });

  it("explains why motion stays off", () => {
    expect(
      motionLockReason({
        systemReduced: true,
        toolReduced: true,
        lowStimulation: false,
      })
    ).toBe("system");
    expect(
      motionLockReason({
        systemReduced: false,
        toolReduced: false,
        lowStimulation: false,
      })
    ).toBeUndefined();
  });

  it("bounds custom curves and recognises named ones", () => {
    expect(customCurve([5, 9, -3, -9]).points).toEqual([1, 1.5, 0, -0.5]);
    expect(customCurve([0.2, 1.25, 0.32, 1]).id).toBe("spring");
    expect(curveToCss(customCurve([0.1, 0.2, 0.3, 0.4]))).toBe(
      "cubic-bezier(0.1, 0.2, 0.3, 0.4)"
    );
  });

  it("sanitises damaged storage", () => {
    expect(normalizeMotionSettings("not json")).toEqual({
      activeId: "standard",
      custom: [],
    });
    const settings = normalizeMotionSettings({
      activeId: "mine-1",
      custom: [
        {
          id: "mine-1",
          name: "  Slow\u0000 ",
          speed: 99,
          kinds: { cards: { duration: -5, curve: { id: "x" } } },
        },
        { id: "standard" },
        { id: "bad id!" },
      ],
    });
    expect(settings.activeId).toBe("mine-1");
    expect(settings.custom).toHaveLength(1);
    expect(settings.custom[0].speed).toBe(2);
    expect(settings.custom[0].kinds.cards.duration).toBe(1);
    expect(settings.custom[0].kinds.cards.curve.id).toBe("spring");
    expect(settings.custom[0].name).toBe("Slow");
  });

  it("falls back to Standard when the profile in use is gone", () => {
    const settings = normalizeMotionSettings({ activeId: "ghost" });
    expect(settings.activeId).toBe("standard");
  });

  it("never edits a built-in profile, it forks one", () => {
    const edited = editActiveProfile(
      normalizeMotionSettings(undefined),
      "Mine",
      (profile) => withKind(profile, "cards", { duration: 900 })
    );
    expect(edited.custom).toHaveLength(1);
    expect(edited.activeId).toBe(edited.custom[0].id);
    expect(edited.custom[0].kinds.cards.duration).toBe(900);
    expect(BUILT_IN_PROFILES[0].kinds.cards.duration).toBe(450);
    expect(isDefaultProfile(edited.custom[0])).toBe(false);
  });

  it("edits a profile of the person's own in place and can remove it", () => {
    let settings = editActiveProfile(
      normalizeMotionSettings(undefined),
      "Mine",
      (profile) => ({ ...profile, speed: 1.5 })
    );
    settings = editActiveProfile(settings, "Mine", (profile) => ({
      ...profile,
      speed: 0.5,
    }));
    expect(settings.custom).toHaveLength(1);
    expect(settings.custom[0].speed).toBe(0.5);
    settings = removeProfile(settings, settings.activeId);
    expect(settings.activeId).toBe("standard");
    expect(settings.custom).toHaveLength(0);
  });

  it("keeps the number of own profiles bounded", () => {
    let settings = normalizeMotionSettings(undefined);
    for (let i = 0; i < MAX_CUSTOM_PROFILES + 3; i++) {
      settings = copyActiveToNew(settings, `p${i}`);
    }
    expect(settings.custom).toHaveLength(MAX_CUSTOM_PROFILES);
  });
});
