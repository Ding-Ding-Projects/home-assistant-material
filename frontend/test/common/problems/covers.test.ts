import { describe, expect, it } from "vitest";
import { clipToArea, clipToCovers } from "../../../src/common/problems/covers";

// A bar at the bottom of the window, from y 800 to 880.
const bar = [{ top: 800, bottom: 880, left: 0, right: 760 }];

describe("clipToCovers", () => {
  it("leaves a box above the bar alone", () => {
    const box = { top: 100, left: 20, width: 300, height: 80 };
    expect(clipToCovers(box, bar)).toEqual(box);
  });

  it("cuts a box that reaches under the bar", () => {
    const cut = clipToCovers(
      { top: 700, left: 20, width: 300, height: 200 },
      bar
    );
    expect(cut?.top).toBe(700);
    expect(cut!.top + cut!.height).toBeLessThan(800);
  });

  it("drops a box whose top edge is under the bar", () => {
    expect(
      clipToCovers({ top: 810, left: 20, width: 300, height: 60 }, bar)
    ).toBeUndefined();
  });

  // A sticky bar at the top of the editor, from y 60 to 140.
  const topBar = [{ top: 60, bottom: 140, left: 0, right: 760 }];

  it("moves the top of a box that has scrolled under a top bar", () => {
    const cut = clipToCovers(
      { top: 100, left: 20, width: 300, height: 300 },
      topBar
    );
    expect(cut!.top).toBeGreaterThanOrEqual(140);
    expect(cut!.top + cut!.height).toBe(400);
  });

  it("drops a box that is only under the top bar", () => {
    expect(
      clipToCovers({ top: 80, left: 20, width: 300, height: 40 }, topBar)
    ).toBeUndefined();
  });

  it("cuts both ends of a box under a top bar and a bottom bar", () => {
    const cut = clipToCovers({ top: 100, left: 20, width: 300, height: 800 }, [
      ...topBar,
      ...bar,
    ]);
    expect(cut!.top).toBeGreaterThanOrEqual(140);
    expect(cut!.top + cut!.height).toBeLessThanOrEqual(792);
  });

  it("keeps the larger visible part when a bar crosses the middle", () => {
    const middle = [{ top: 300, bottom: 380, left: 0, right: 760 }];
    const above = clipToCovers(
      { top: 100, left: 20, width: 300, height: 600 },
      middle
    );
    // 192 px above the bar, 312 px below it: the lower part stays.
    expect(above!.top).toBeGreaterThanOrEqual(380);
    expect(above!.top + above!.height).toBe(700);
    const larger = clipToCovers(
      { top: 100, left: 20, width: 300, height: 470 },
      middle
    );
    expect(larger!.top).toBe(100);
    expect(larger!.top + larger!.height).toBeLessThanOrEqual(292);
  });

  it("drops a box that is under a bar completely", () => {
    expect(
      clipToCovers({ top: 70, left: 20, width: 300, height: 60 }, topBar)
    ).toBeUndefined();
  });

  it("drops a box when only a sliver is left above the bar", () => {
    expect(
      clipToCovers({ top: 780, left: 20, width: 300, height: 100 }, bar)
    ).toBeUndefined();
  });

  it("keeps a small box that no bar touches", () => {
    const box = { top: 300, left: 20, width: 20, height: 20 };
    expect(clipToCovers(box, bar)).toEqual(box);
  });

  it("ignores a bar that is beside the box", () => {
    const box = { top: 790, left: 800, width: 100, height: 60 };
    expect(clipToCovers(box, bar)).toEqual(box);
  });
});

// The scroll container starts at y 100 and its sticky bar fills y 100 to 160.
describe("a box under a sticky bar at the top of its scroll container", () => {
  const area = { top: 100, bottom: 700, left: 0, right: 760 };
  const sticky = [{ top: 100, bottom: 160, left: 0, right: 760 }];
  const seen = (box: { top: number; height: number }) => {
    const inArea = clipToArea({ ...box, left: 20, width: 300 }, area);
    return inArea ? clipToCovers(inArea, sticky) : undefined;
  };

  it("keeps the part below the bar when the box starts above the container", () => {
    // 30 px of the box show below the bar: it keeps its outline from there.
    const cut = seen({ top: 60, height: 130 });
    expect(cut).toBeDefined();
    expect(cut!.top).toBeGreaterThanOrEqual(160);
    expect(cut!.top + cut!.height).toBe(190);
  });

  it("keeps the part below the bar when the box starts under the bar", () => {
    const cut = seen({ top: 120, height: 70 });
    expect(cut).toBeDefined();
    expect(cut!.top).toBeGreaterThanOrEqual(160);
    expect(cut!.top + cut!.height).toBe(190);
  });

  it("still drops a box with less than the minimum showing below the bar", () => {
    expect(seen({ top: 60, height: 112 })).toBeUndefined();
  });
});

describe("clipToArea", () => {
  const area = { top: 100, bottom: 700, left: 0, right: 760 };

  it("leaves a box inside the area alone", () => {
    const box = { top: 200, left: 20, width: 300, height: 80 };
    expect(clipToArea(box, area)).toEqual(box);
  });

  it("cuts a box that runs past the bottom of the area", () => {
    const cut = clipToArea(
      { top: 600, left: 20, width: 300, height: 300 },
      area
    );
    expect(cut).toMatchObject({ top: 600, height: 100 });
  });

  it("cuts a box that starts above the area", () => {
    const cut = clipToArea(
      { top: 40, left: 20, width: 300, height: 200 },
      area
    );
    expect(cut).toMatchObject({ top: 100, height: 140 });
  });

  it("drops a box that has scrolled out of the area", () => {
    expect(
      clipToArea({ top: 720, left: 20, width: 300, height: 80 }, area)
    ).toBeUndefined();
  });

  it("drops a box of which only a sliver is left", () => {
    expect(
      clipToArea({ top: 690, left: 20, width: 300, height: 80 }, area)
    ).toBeUndefined();
  });
});
