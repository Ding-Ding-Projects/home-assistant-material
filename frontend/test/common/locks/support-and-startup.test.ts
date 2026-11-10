import { describe, expect, it } from "vitest";
import type { LockRecord } from "../../../src/common/locks/lock-credentials";
import {
  cleanPageTitle,
  normalizeLockRecord,
} from "../../../src/common/locks/lock-credentials";
import {
  emptyLockStore,
  withLock,
} from "../../../src/common/locks/element-locks";
import {
  lockPageAddress,
  lockPageName,
} from "../../../src/common/locks/lock-where";
import { startupLockKeys } from "../../../src/common/locks/startup-lock";
import {
  emptyTicketStore,
  hasReply,
  normalizeTicketStore,
  RESOLVED_AFTER_MS,
  REVIEW_AFTER_MS,
  ticketStatus,
  TICKET_LIMIT,
  withoutTicket,
  withTicket,
} from "../../../src/common/locks/support-tickets";

// Protects the fictional support desk (numbers never reused, status only
// forward, stored data sanitised) and the locked-on-start choice (which
// locks cover the interface, and that older locks are not changed).

const secret = { salt: "a".repeat(32), hash: "b".repeat(64), rounds: 150000 };

const record = (key: string, extra: Partial<LockRecord> = {}): LockRecord => ({
  key,
  label: key,
  policy: "pin",
  pin: secret,
  duration: { kind: "surface" },
  failures: 0,
  blockedUntil: 0,
  created: 1,
  ...extra,
});

describe("support tickets", () => {
  it("numbers tickets in order and never reuses a number", () => {
    let store = withTicket(emptyTicketStore(), "First", "", 1000);
    store = withTicket(store, "Second", "", 2000);
    expect(store.tickets.map((ticket) => ticket.number)).toEqual([
      "0001",
      "0002",
    ]);
    store = withoutTicket(store, "0002");
    store = withTicket(store, "Third", "", 3000);
    expect(store.tickets.map((ticket) => ticket.number)).toEqual([
      "0001",
      "0003",
    ]);
  });

  it("refuses an empty subject", () => {
    const store = emptyTicketStore();
    expect(withTicket(store, "   ", "x", 1)).toBe(store);
  });

  it("moves the status forward with time, and the reply comes with it", () => {
    const store = withTicket(emptyTicketStore(), "Locked out", "", 1000);
    const ticket = store.tickets[0];
    expect(ticketStatus(ticket, 1000)).toBe("open");
    expect(ticketStatus(ticket, 1000 + REVIEW_AFTER_MS)).toBe("reviewing");
    expect(ticketStatus(ticket, 1000 + RESOLVED_AFTER_MS)).toBe("resolved");
    expect(hasReply("open")).toBe(false);
    expect(hasReply("reviewing")).toBe(false);
    expect(hasReply("resolved")).toBe(true);
  });

  it("keeps only the newest tickets", () => {
    let store = emptyTicketStore();
    for (let i = 0; i < TICKET_LIMIT + 5; i++) {
      store = withTicket(store, `Ticket ${i}`, "", i);
    }
    expect(store.tickets).toHaveLength(TICKET_LIMIT);
    expect(store.tickets[0].subject).toBe("Ticket 5");
  });

  it("drops stored data that is not a ticket and keeps the counter ahead", () => {
    const store = normalizeTicketStore({
      last: 2,
      tickets: [
        { number: "0007", subject: "ok", details: "d", created: 5 },
        { number: "0007", subject: "duplicate", created: 6 },
        { number: "x", subject: "bad number", created: 6 },
        { number: "0008", subject: "", created: 6 },
        "nonsense",
      ],
    });
    expect(store.tickets.map((ticket) => ticket.number)).toEqual(["0007"]);
    expect(store.last).toBe(7);
  });
});

describe("locked on start", () => {
  it("covers only for locked records that ask for it, oldest first", () => {
    let store = emptyLockStore();
    const records = [
      record("page:/a", { onStart: true, created: 20 }),
      record("page:/b", { onStart: false, created: 5 }),
      record("page:/c", { onStart: true, created: 10 }),
    ];
    store = records.reduce(
      (current, item) => ({
        ...withLock(current, item.key, true),
        records: { ...current.records, [item.key]: item },
      }),
      store
    );
    expect(startupLockKeys(store, new Set())).toEqual(["page:/c", "page:/a"]);
    expect(startupLockKeys(store, new Set(["page:/c"]))).toEqual(["page:/a"]);
  });

  it("does not cover for older locks without a record", () => {
    const store = withLock(emptyLockStore(), "page:/old", true);
    expect(startupLockKeys(store, new Set())).toEqual([]);
  });

  it("leaves locks made before the choice existed as they were", () => {
    const stored = JSON.parse(JSON.stringify(record("page:/a")));
    expect(normalizeLockRecord(stored)?.onStart).toBe(false);
    expect(normalizeLockRecord({ ...stored, onStart: true })?.onStart).toBe(
      true
    );
  });
});

describe("where a lock is", () => {
  it("reads the page address from a key", () => {
    expect(lockPageAddress("page:/config/devices")).toBe("/config/devices");
    expect(lockPageAddress("element:/lovelace/0#div>a")).toBe("/lovelace/0");
    expect(lockPageAddress("other")).toBeUndefined();
  });

  it("prefers the stored title, then the address", () => {
    const key = "element:/lovelace/0#a";
    const bare = { ...withLock(emptyLockStore(), key, true) };
    expect(lockPageName(bare, key)).toBe("/lovelace/0");
    const titled = {
      ...bare,
      records: { [key]: record(key, { page: "Home" }) },
    };
    expect(lockPageName(titled, key)).toBe("Home");
  });

  it("tidies a page title", () => {
    expect(cleanPageTitle("  Overview \n  Home ")).toBe("Overview Home");
    expect(cleanPageTitle("   ")).toBeUndefined();
    expect(cleanPageTitle(5)).toBeUndefined();
    expect(cleanPageTitle("x".repeat(500))).toHaveLength(120);
  });
});
