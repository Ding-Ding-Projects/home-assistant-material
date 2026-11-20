import { describe, expect, it, vi } from "vitest";
import type { PillToolInput } from "../../src/layouts/pill-tools";
import { HoverMenuIntent, pillTools } from "../../src/layouts/pill-tools";

// Protects the promise that moving the list tools into a floating pill
// removes nothing: every tool the old tool row offered is still there, at the
// same number of presses, on a wide window and on a phone.

const base: PillToolInput = {
  narrow: false,
  compact: false,
  searchable: true,
  hasFilters: true,
  selectable: true,
  alwaysShowCheckboxes: false,
  selecting: false,
  sortable: true,
  groupable: true,
  noData: false,
};

describe("pillTools", () => {
  it("puts every tool one press away on a wide window", () => {
    expect(pillTools(base)).toEqual({
      pill: [
        "search",
        "filter",
        "select",
        "group",
        "sort",
        "columns",
        "export",
      ],
      more: [],
    });
  });

  it("folds the table tools into More when the wide pill does not fit", () => {
    expect(pillTools({ ...base, compact: true })).toEqual({
      pill: ["search", "filter", "select", "more"],
      more: ["sort", "group", "columns", "export"],
    });
  });

  it("keeps the phone's filters in the pill and the rest in More", () => {
    expect(pillTools({ ...base, narrow: true })).toEqual({
      pill: ["filter", "more"],
      more: ["select", "sort", "group", "columns", "export"],
    });
  });

  it("leaves out what has nothing to act on", () => {
    expect(pillTools({ ...base, noData: true })).toEqual({
      pill: ["search", "filter", "select"],
      more: [],
    });
    expect(
      pillTools({ ...base, narrow: true, noData: true, hasFilters: false })
    ).toEqual({ pill: [], more: [] });
  });

  it("offers selection only when it is not already on", () => {
    expect(pillTools({ ...base, selecting: true }).pill).not.toContain(
      "select"
    );
    expect(
      pillTools({ ...base, alwaysShowCheckboxes: true }).pill
    ).not.toContain("select");
    expect(
      pillTools({ ...base, narrow: true, selecting: true }).more
    ).not.toContain("select");
  });

  it("leaves out sorting and grouping when no column allows them", () => {
    const model = pillTools({ ...base, sortable: false, groupable: false });
    expect(model.pill).not.toContain("sort");
    expect(model.pill).not.toContain("group");
    expect(model.pill).toContain("columns");
  });
});

describe("HoverMenuIntent", () => {
  const make = () => {
    const open = vi.fn();
    const close = vi.fn();
    const timers: (() => void)[] = [];
    const intent = new HoverMenuIntent(
      open,
      close,
      250,
      (callback) => {
        timers.push(callback);
        return timers.length;
      },
      (handle) => {
        timers[(handle as number) - 1] = () => undefined;
      }
    );
    return { intent, open, close, timers };
  };

  it("opens for a mouse and closes after the delay", () => {
    const { intent, open, close, timers } = make();
    intent.enter("mouse", false);
    expect(open).toHaveBeenCalledOnce();
    intent.leave("mouse");
    expect(close).not.toHaveBeenCalled();
    timers.forEach((run) => run());
    expect(close).toHaveBeenCalledOnce();
  });

  it("stays open when the pointer comes back before the delay", () => {
    const { intent, close, timers } = make();
    intent.enter("mouse", false);
    intent.leave("mouse");
    intent.enter("mouse", true);
    timers.forEach((run) => run());
    expect(close).not.toHaveBeenCalled();
  });

  it("never opens for touch or pen", () => {
    const { intent, open } = make();
    intent.enter("touch", false);
    intent.enter("pen", false);
    expect(open).not.toHaveBeenCalled();
  });

  it("pins a hover-opened menu on click instead of closing it", () => {
    const { intent, close, timers } = make();
    intent.enter("mouse", false);
    expect(intent.click(true)).toBe(true);
    intent.leave("mouse");
    timers.forEach((run) => run());
    expect(close).not.toHaveBeenCalled();
    // A second click is the menu's own toggle again
    expect(intent.click(true)).toBe(false);
  });

  it("lets a click toggle a menu that hovering did not open", () => {
    const { intent } = make();
    expect(intent.click(false)).toBe(false);
    expect(intent.click(true)).toBe(false);
  });

  it("forgets everything once the menu closes", () => {
    const { intent, open } = make();
    intent.enter("mouse", false);
    intent.click(true);
    intent.closed();
    expect(intent.pinned).toBe(false);
    intent.enter("mouse", false);
    expect(open).toHaveBeenCalledTimes(2);
  });
});
