import { describe, expect, it } from "vitest";
import {
  PAGE_ENTRY_MAX_ITEMS,
  pageEntryProfile,
  playPageEntry,
} from "../../../src/common/motion/page-entry";

// Protects how a page arrives for each drama level: Off never moves, Calm only
// fades, Standard rises, Dramatic rises and grows, and reduced motion always
// wins over the person's choice.

describe("page entry profile", () => {
  it("does nothing when drama is off", () => {
    expect(pageEntryProfile("off").enabled).toBe(false);
  });

  it("only fades on calm", () => {
    expect(pageEntryProfile("calm")).toEqual({
      enabled: true,
      rise: 0,
      scale: 1,
    });
  });

  it("rises on standard without scaling", () => {
    expect(pageEntryProfile("standard")).toEqual({
      enabled: true,
      rise: 24,
      scale: 1,
    });
  });

  it("rises and grows slightly on dramatic", () => {
    expect(pageEntryProfile("dramatic")).toEqual({
      enabled: true,
      rise: 24,
      scale: 0.96,
    });
  });

  it("is switched off by reduced motion at every level", () => {
    for (const level of ["off", "calm", "standard", "dramatic"] as const) {
      expect(pageEntryProfile(level, true).enabled).toBe(false);
    }
  });
});

describe("playing the page entry", () => {
  const fakeElement = () => {
    const calls: { options: KeyframeAnimationOptions }[] = [];
    const el = {
      animate: (_k: Keyframe[], options: KeyframeAnimationOptions) => {
        calls.push({ options });
        return {} as Animation;
      },
    } as unknown as Element;
    return { el, calls };
  };

  it("staggers at most eight blocks, sixty milliseconds apart", () => {
    const items = Array.from({ length: 12 }, fakeElement);
    const started = playPageEntry(
      items.map((i) => i.el),
      "standard",
      false
    );
    expect(started).toHaveLength(PAGE_ENTRY_MAX_ITEMS);
    expect(items[0].calls[0].options.delay).toBe(0);
    expect(items[3].calls[0].options.delay).toBe(180);
    expect(items[8].calls).toHaveLength(0);
  });

  it("starts nothing under reduced motion", () => {
    const item = fakeElement();
    expect(playPageEntry([item.el], "dramatic", true)).toEqual([]);
    expect(item.calls).toHaveLength(0);
  });
});
