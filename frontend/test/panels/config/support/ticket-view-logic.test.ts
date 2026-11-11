import { describe, expect, it } from "vitest";
import type { SupportTicket } from "../../../../src/common/locks/support-tickets";
import {
  addNote,
  canTransition,
  countByStatus,
  newExtra,
  normalizeExtras,
  NOTES_PER_TICKET,
  pruneExtras,
  transitionExtra,
  viewTickets,
} from "../../../../src/panels/config/support/ticket-view-logic";

const ticket = (
  number: string,
  subject: string,
  created: number,
  details = ""
): SupportTicket => ({ number, subject, details, created });

describe("status transitions", () => {
  it("allows the moves a person can make", () => {
    expect(canTransition("open", "waiting")).toBe(true);
    expect(canTransition("open", "closed")).toBe(true);
    expect(canTransition("waiting", "open")).toBe(true);
    expect(canTransition("closed", "open")).toBe(true);
  });

  it("refuses moves that make no sense", () => {
    expect(canTransition("open", "open")).toBe(false);
    expect(canTransition("closed", "waiting")).toBe(false);
    expect(canTransition("closed", "closed")).toBe(false);
    expect(transitionExtra(newExtra(1), "open", 2)).toBeUndefined();
    expect(
      transitionExtra({ ...newExtra(1), status: "closed" }, "waiting", 2)
    ).toBeUndefined();
  });

  it("records when a status changed and can reopen a closed ticket", () => {
    const closed = transitionExtra(newExtra(1), "closed", 50)!;
    expect(closed.status).toBe("closed");
    expect(closed.changed).toBe(50);
    expect(transitionExtra(closed, "open", 90)!.status).toBe("open");
  });
});

describe("notes", () => {
  it("adds a trimmed note and refuses an empty one", () => {
    const extra = addNote(newExtra(1), "  tried again  ", 5)!;
    expect(extra.notes).toEqual([{ at: 5, text: "tried again" }]);
    expect(addNote(newExtra(1), "   ", 5)).toBeUndefined();
  });

  it("stops at the note limit", () => {
    let extra = newExtra(1);
    for (let i = 0; i < NOTES_PER_TICKET; i++) {
      extra = addNote(extra, `note ${i}`, i)!;
    }
    expect(addNote(extra, "one more", 99)).toBeUndefined();
  });
});

describe("viewTickets", () => {
  const tickets = [
    ticket("0001", "Lock will not open", 100, "PIN screen"),
    ticket("0002", "Backup question", 300),
    ticket("0003", "Dashboard slow", 200),
  ];
  const extras = normalizeExtras({
    "0002": {
      status: "closed",
      page: "Settings > Backups",
      notes: [{ at: 5, text: "Solved by restart" }],
      changed: 7,
    },
    "0003": { status: "waiting", page: "Overview", notes: [], changed: 8 },
  });

  it("orders newest first", () => {
    expect(
      viewTickets(tickets, extras, { query: "" }).map((r) => r.ticket.number)
    ).toEqual(["0002", "0003", "0001"]);
  });

  it("treats a ticket with no saved extras as open", () => {
    const rows = viewTickets(tickets, {}, { query: "", status: "open" });
    expect(rows).toHaveLength(3);
  });

  it("filters by status", () => {
    expect(
      viewTickets(tickets, extras, { query: "", status: "waiting" }).map(
        (r) => r.ticket.number
      )
    ).toEqual(["0003"]);
  });

  it("matches the subject, details, page and notes, ignoring case", () => {
    const find = (query: string) =>
      viewTickets(tickets, extras, { query }).map((r) => r.ticket.number);
    expect(find("LOCK")).toEqual(["0001"]);
    expect(find("pin screen")).toEqual(["0001"]);
    expect(find("backups")).toEqual(["0002"]);
    expect(find("restart")).toEqual(["0002"]);
    expect(find("nothing like this")).toEqual([]);
  });

  it("understands a pattern and shows nothing for a broken one", () => {
    expect(
      viewTickets(tickets, extras, { query: "/^dash/i" }).map(
        (r) => r.ticket.number
      )
    ).toEqual(["0003"]);
    expect(viewTickets(tickets, extras, { query: "/(/" })).toEqual([]);
  });

  it("counts by status", () => {
    expect(countByStatus(viewTickets(tickets, extras, { query: "" }))).toEqual({
      open: 1,
      waiting: 1,
      closed: 1,
    });
  });
});

describe("stored data", () => {
  it("drops anything unexpected and defaults an unknown status to open", () => {
    const result = normalizeExtras({
      "0001": { status: "bogus", page: 5, notes: [{ text: "", at: 1 }, 3] },
      abc: { status: "closed" },
      "0002": "nope",
    });
    expect(Object.keys(result)).toEqual(["0001"]);
    expect(result["0001"].status).toBe("open");
    expect(result["0001"].notes).toEqual([]);
    expect(normalizeExtras(null)).toEqual({});
    expect(normalizeExtras([])).toEqual({});
  });

  it("keeps a bundle reference with only a name, size and time", () => {
    const result = normalizeExtras({
      "0001": {
        status: "open",
        bundle: { name: "bundle.txt", size: 10, at: 4, text: "secret" },
      },
    });
    expect(result["0001"].bundle).toEqual({
      name: "bundle.txt",
      size: 10,
      at: 4,
    });
  });

  it("prunes extras of tickets that were removed", () => {
    const kept = pruneExtras({ "0001": newExtra(1), "0009": newExtra(1) }, [
      ticket("0001", "A", 1),
    ]);
    expect(Object.keys(kept)).toEqual(["0001"]);
  });
});
