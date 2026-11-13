import { describe, expect, it } from "vitest";
import type { PhonePage } from "../../../src/components/phone/phone-page-actions";
import {
  dropAfter,
  headerActions,
  pageActions,
  planClose,
  planDrop,
  planMove,
  planTitleBulkClose,
  planTitleBulkLock,
} from "../../../src/components/phone/phone-page-actions";

// The Pages sheet closes and moves pages, so these protect the rules that keep
// a person from losing a page by accident: pinned and locked pages are never
// closed in bulk, a bulk close needs real text and matches the visible title
// only, and a move never crosses between the pinned group and the rest.

const page = (
  id: string,
  title: string,
  extra: Partial<PhonePage> = {}
): PhonePage => ({
  id,
  title,
  open: true,
  pinned: false,
  locked: false,
  ...extra,
});

// Display order: pinned pages first, as the tab order puts them.
const pages = [
  page("energy", "Energy", { pinned: true }),
  page("map", "Map", { pinned: true }),
  page("lovelace", "Overview"),
  page("light", "Lights"),
  page("history", "History", { open: false }),
  page("climate", "Climate"),
  page("logbook", "Logbook", { locked: true }),
];

const enabled = (id: string, current?: string) =>
  Object.fromEntries(
    pageActions(pages, id, current).map((entry) => [entry.id, entry.enabled])
  );

describe("pageActions", () => {
  it("offers pin for an unpinned page and unpin for a pinned one", () => {
    expect(pageActions(pages, "light").map((e) => e.id)).toContain("pin");
    expect(pageActions(pages, "energy").map((e) => e.id)).toContain("unpin");
    expect(pageActions(pages, "energy").map((e) => e.id)).not.toContain("pin");
  });

  it("lists every action in a fixed order", () => {
    expect(pageActions(pages, "light").map((e) => e.id)).toEqual([
      "pin",
      "close",
      "close_others",
      "close_above",
      "close_below",
      "move_up",
      "move_down",
      "move_top",
      "move_bottom",
    ]);
  });

  it("does not let a pinned page be closed and says why", () => {
    const close = pageActions(pages, "energy").find((e) => e.id === "close")!;
    expect(close.enabled).toBe(false);
    expect(close.reason).toBe("pinned");
  });

  it("does not let a locked page be closed", () => {
    expect(enabled("logbook").close).toBe(false);
  });

  it("disables the moves a page cannot make", () => {
    const first = enabled("energy");
    expect(first.move_up).toBe(false);
    expect(first.move_top).toBe(false);
    expect(first.move_down).toBe(true);
    // Overview is the first unpinned page, so it cannot move above Map.
    expect(enabled("lovelace").move_up).toBe(false);
    expect(enabled("logbook").move_down).toBe(false);
  });

  it("returns nothing for an unknown page", () => {
    expect(pageActions(pages, "nope")).toEqual([]);
  });
});

describe("planClose", () => {
  it("closes only the page for Close", () => {
    expect(planClose(pages, "light", "close")).toEqual({
      ids: ["light"],
      kept: [],
    });
  });

  it("closes the other open pages but keeps pinned, locked and current", () => {
    const plan = planClose(pages, "light", "others", "climate");
    expect(plan.ids).toEqual(["lovelace"]);
    expect(plan.kept).toEqual([
      { id: "energy", title: "Energy", reason: "pinned" },
      { id: "map", title: "Map", reason: "pinned" },
      { id: "climate", title: "Climate", reason: "current" },
      { id: "logbook", title: "Logbook", reason: "locked" },
    ]);
  });

  it("closes only the open pages above or below", () => {
    expect(planClose(pages, "climate", "above").ids).toEqual([
      "lovelace",
      "light",
    ]);
    // History is closed and Logbook is locked: nothing below Climate closes.
    expect(planClose(pages, "climate", "below").ids).toEqual([]);
    expect(planClose(pages, "light", "below").ids).toEqual(["climate"]);
  });

  it("never lists a closed page as closing", () => {
    expect(planClose(pages, "light", "others").ids).not.toContain("history");
  });
});

describe("planMove", () => {
  it("moves a page past the next open page of its group", () => {
    // History is closed, so Lights moves over Climate, not History.
    const plan = planMove(pages, "light", "down");
    expect(plan.order).toEqual([
      "energy",
      "map",
      "lovelace",
      "history",
      "climate",
      "light",
      "logbook",
    ]);
    expect(plan.position).toBe(5);
    expect(plan.total).toBe(6);
  });

  it("moves to the top and the bottom of its own group", () => {
    expect(planMove(pages, "climate", "top").order?.slice(0, 4)).toEqual([
      "energy",
      "map",
      "climate",
      "lovelace",
    ]);
    expect(planMove(pages, "lovelace", "bottom").order?.slice(-2)).toEqual([
      "logbook",
      "lovelace",
    ]);
  });

  it("moves pinned pages among pinned pages only", () => {
    expect(planMove(pages, "energy", "down").order?.slice(0, 2)).toEqual([
      "map",
      "energy",
    ]);
    expect(planMove(pages, "map", "bottom")).toEqual({ blocked: "at_bottom" });
  });

  it("says when the page is already at the edge", () => {
    expect(planMove(pages, "energy", "up")).toEqual({ blocked: "at_top" });
    expect(planMove(pages, "lovelace", "top")).toEqual({ blocked: "at_top" });
    expect(planMove(pages, "logbook", "down")).toEqual({
      blocked: "at_bottom",
    });
  });
});

describe("planDrop and dropAfter", () => {
  it("places a page before or after another", () => {
    expect(planDrop(pages, "climate", "lovelace", false).order).toEqual([
      "energy",
      "map",
      "climate",
      "lovelace",
      "light",
      "history",
      "logbook",
    ]);
  });

  it("refuses a drop across the pinned boundary", () => {
    expect(planDrop(pages, "light", "energy", false)).toEqual({
      blocked: true,
    });
    expect(planDrop(pages, "energy", "light", true)).toEqual({ blocked: true });
  });

  it("changes nothing when the page lands where it is", () => {
    expect(planDrop(pages, "light", "lovelace", true)).toEqual({});
  });

  it("reads the position in a grid by the horizontal half, flipped in rtl", () => {
    const rect = { left: 0, top: 0, width: 100, height: 100 };
    expect(dropAfter({ x: 80, y: 10 }, rect, false, false)).toBe(true);
    expect(dropAfter({ x: 80, y: 10 }, rect, false, true)).toBe(false);
  });

  it("reads the position in one column by the vertical half", () => {
    const rect = { left: 0, top: 0, width: 300, height: 100 };
    expect(dropAfter({ x: 10, y: 80 }, rect, true, false)).toBe(true);
    expect(dropAfter({ x: 290, y: 20 }, rect, true, false)).toBe(false);
  });
});

describe("headerActions", () => {
  it("offers adding media only to someone who may add it", () => {
    expect(headerActions([]).map((e) => e.id)).not.toContain("add_media");
    expect(headerActions([], undefined, true).map((e) => e.id)).toContain(
      "add_media"
    );
  });

  it("offers Open every page only while a page is closed", () => {
    expect(headerActions(pages).map((e) => e.id)).toContain("open_every");
    const allOpen = pages.map((p) => ({ ...p, open: true }));
    expect(headerActions(allOpen).map((e) => e.id)).not.toContain("open_every");
  });

  it("disables the close actions when no page is open", () => {
    const none = pages.map((p) => ({ ...p, open: false }));
    const entries = headerActions(none);
    expect(entries.find((e) => e.id === "bulk_contain")?.enabled).toBe(false);
    expect(entries.find((e) => e.id === "close_others")?.reason).toBe(
      "nothing_to_close"
    );
  });
});

describe("planTitleBulkClose", () => {
  it("never closes anything for an empty text", () => {
    expect(planTitleBulkClose(pages, "  ", "not_matching")).toEqual({
      ids: [],
      kept: [],
      blocked: "empty",
    });
  });

  it("never closes anything for a pattern that cannot be used", () => {
    expect(planTitleBulkClose(pages, "/(/", "matching").blocked).toBe(
      "invalid"
    );
  });

  it("matches the visible title and not the address", () => {
    // "lovelace" is only the address of Overview, so it must not match.
    expect(planTitleBulkClose(pages, "lovelace", "matching").ids).toEqual([]);
    expect(planTitleBulkClose(pages, "overview", "matching").ids).toEqual([
      "lovelace",
    ]);
  });

  it("lists matching pages that are pinned, locked or current as kept", () => {
    const plan = planTitleBulkClose(pages, "o", "matching", "climate");
    // Titles with an o: Logbook, Overview, History (closed, skipped), Energy no.
    expect(plan.ids).toEqual(["lovelace"]);
    expect(plan.kept).toEqual([
      { id: "logbook", title: "Logbook", reason: "locked" },
    ]);
  });

  it("closes the pages without the text and keeps protected ones", () => {
    const plan = planTitleBulkClose(pages, "li", "not_matching", "lovelace");
    // Open pages without "li": Energy, Map (pinned), Overview (current), Logbook... has no "li".
    expect(plan.ids).toEqual([]);
    expect(plan.kept.map((k) => [k.id, k.reason])).toEqual([
      ["energy", "pinned"],
      ["map", "pinned"],
      ["lovelace", "current"],
      ["logbook", "locked"],
    ]);
  });
});

// Locking pages together uses the same title match as closing them, locks the
// pinned and current pages too, and leaves out the pages that are already
// locked and the pages that are closed.
describe("planTitleBulkLock", () => {
  it("selects open pages by title, pinned ones included", () => {
    expect(planTitleBulkLock(pages, "e", "matching").ids).toEqual([
      "energy",
      "lovelace",
      "climate",
    ]);
  });

  it("leaves out locked and closed pages", () => {
    const result = planTitleBulkLock(pages, "o", "matching").ids;
    expect(result).not.toContain("logbook");
    expect(result).not.toContain("history");
  });

  it("selects nothing without usable text", () => {
    expect(planTitleBulkLock(pages, "", "matching")).toEqual({
      ids: [],
      blocked: "empty",
    });
  });
});
