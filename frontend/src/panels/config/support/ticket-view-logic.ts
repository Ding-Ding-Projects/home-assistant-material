import { getStorage } from "../../../common/decorators/storage";
import { searchMatcher } from "../../../common/regex/filter";
import type { SupportTicket } from "../../../common/locks/support-tickets";

/**
 * What the Support page adds to a ticket: a status the person controls, the
 * page it was about, a note per step and a reference to a support bundle file.
 * It is kept beside the tickets in this browser's storage, keyed by ticket
 * number, and nothing is ever sent anywhere. The reference holds only the file
 * name, size and time of a bundle, never its contents.
 */

export const TICKET_EXTRAS_STORAGE_KEY = "supportTicketExtras";

export type TicketDeskStatus = "open" | "waiting" | "closed";

export const TICKET_DESK_STATUSES: readonly TicketDeskStatus[] = [
  "open",
  "waiting",
  "closed",
];

export const PAGE_LIMIT = 120;
export const NOTE_LIMIT = 500;
export const NOTES_PER_TICKET = 50;

export interface TicketNote {
  at: number;
  text: string;
}

export interface BundleReference {
  name: string;
  size: number;
  at: number;
}

export interface TicketExtra {
  status: TicketDeskStatus;
  page: string;
  bundle?: BundleReference;
  notes: TicketNote[];
  /** When the status last changed. */
  changed: number;
}

export type TicketExtras = Record<string, TicketExtra>;

/** The moves a status may make; anything else is refused. */
const TRANSITIONS: Record<TicketDeskStatus, readonly TicketDeskStatus[]> = {
  open: ["waiting", "closed"],
  waiting: ["open", "closed"],
  closed: ["open"],
};

export const canTransition = (
  from: TicketDeskStatus,
  to: TicketDeskStatus
): boolean => TRANSITIONS[from]?.includes(to) ?? false;

const clip = (value: unknown, limit: number): string =>
  typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, limit)
    : "";

export const newExtra = (
  now: number,
  page = "",
  bundle?: BundleReference
): TicketExtra => ({
  status: "open",
  page: clip(page, PAGE_LIMIT),
  ...(bundle ? { bundle } : {}),
  notes: [],
  changed: now,
});

const normalizeBundle = (raw: unknown): BundleReference | undefined => {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }
  const value = raw as Partial<BundleReference>;
  const name = clip(value.name, 120);
  if (!name || !Number.isFinite(value.size) || !Number.isFinite(value.at)) {
    return undefined;
  }
  return { name, size: value.size!, at: value.at! };
};

/** Makes stored data safe to use; anything unexpected is dropped. */
export const normalizeExtras = (raw: unknown): TicketExtras => {
  const result: TicketExtras = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return result;
  }
  Object.entries(raw as Record<string, unknown>).forEach(([number, entry]) => {
    if (!/^\d{4,}$/.test(number) || !entry || typeof entry !== "object") {
      return;
    }
    const value = entry as Partial<TicketExtra>;
    const status = TICKET_DESK_STATUSES.includes(value.status as any)
      ? (value.status as TicketDeskStatus)
      : "open";
    const notes: TicketNote[] = [];
    if (Array.isArray(value.notes)) {
      value.notes.forEach((note) => {
        const text = clip(note?.text, NOTE_LIMIT);
        if (text && Number.isFinite(note?.at)) {
          notes.push({ at: note.at, text });
        }
      });
    }
    const bundle = normalizeBundle(value.bundle);
    result[number] = {
      status,
      page: clip(value.page, PAGE_LIMIT),
      ...(bundle ? { bundle } : {}),
      notes: notes.slice(-NOTES_PER_TICKET),
      changed: Number.isFinite(value.changed) ? value.changed! : 0,
    };
  });
  return result;
};

/** Moves a ticket to a new status, or returns undefined when that is refused. */
export const transitionExtra = (
  extra: TicketExtra,
  to: TicketDeskStatus,
  now: number
): TicketExtra | undefined =>
  canTransition(extra.status, to)
    ? { ...extra, status: to, changed: now }
    : undefined;

/** Adds a note, or returns undefined when it is empty or the ticket is full. */
export const addNote = (
  extra: TicketExtra,
  text: string,
  now: number
): TicketExtra | undefined => {
  const clean = clip(text, NOTE_LIMIT);
  if (!clean || extra.notes.length >= NOTES_PER_TICKET) {
    return undefined;
  }
  return { ...extra, notes: [...extra.notes, { at: now, text: clean }] };
};

/** Keeps only the extras of tickets that still exist. */
export const pruneExtras = (
  extras: TicketExtras,
  tickets: readonly SupportTicket[]
): TicketExtras => {
  const numbers = new Set(tickets.map((ticket) => ticket.number));
  return Object.fromEntries(
    Object.entries(extras).filter(([number]) => numbers.has(number))
  );
};

export interface TicketRow {
  ticket: SupportTicket;
  extra: TicketExtra;
}

export interface TicketFilter {
  query: string;
  /** Left out or "all" shows every status. */
  status?: TicketDeskStatus | "all";
}

/** Tickets that match, newest first. A missing extra counts as open. */
export const viewTickets = (
  tickets: readonly SupportTicket[],
  extras: TicketExtras,
  filter: TicketFilter
): TicketRow[] => {
  const matches = searchMatcher(filter.query);
  return tickets
    .map((ticket) => ({
      ticket,
      extra: extras[ticket.number] ?? newExtra(ticket.created),
    }))
    .filter(({ ticket, extra }) => {
      if (filter.status && filter.status !== "all") {
        if (extra.status !== filter.status) {
          return false;
        }
      }
      return matches(
        ticket.number,
        ticket.subject,
        ticket.details,
        extra.page,
        extra.bundle?.name,
        ...extra.notes.map((note) => note.text)
      );
    })
    .sort(
      (a, b) =>
        b.ticket.created - a.ticket.created ||
        Number(b.ticket.number) - Number(a.ticket.number)
    );
};

export const countByStatus = (
  rows: readonly TicketRow[]
): Record<TicketDeskStatus, number> => {
  const counts: Record<TicketDeskStatus, number> = {
    open: 0,
    waiting: 0,
    closed: 0,
  };
  rows.forEach((row) => {
    counts[row.extra.status] += 1;
  });
  return counts;
};

export const readExtras = (): TicketExtras =>
  normalizeExtras(getStorage().getValue(TICKET_EXTRAS_STORAGE_KEY));

export const writeExtras = (extras: TicketExtras): void =>
  getStorage().setValue(TICKET_EXTRAS_STORAGE_KEY, normalizeExtras(extras));
