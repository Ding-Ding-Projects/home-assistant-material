import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";

/**
 * The support desk's tickets.
 *
 * They are for fun and live only in this browser's storage. Nothing is
 * sent anywhere: there is no request, no account and nobody reading. The
 * number is made here, the status moves on with the clock, and the first
 * reply is canned. A ticket never holds a credential; the form only keeps
 * a short subject and a short description the person typed.
 */

export const TICKETS_STORAGE_KEY = "supportTickets";

/** Most tickets kept; the oldest is dropped after this. */
export const TICKET_LIMIT = 50;

export const SUBJECT_LIMIT = 120;
export const DETAILS_LIMIT = 1000;

/**
 * Milliseconds after opening at which the status moves on. The change is only
 * the clock: nobody reviews, answers or resolves a ticket.
 */
export const REVIEW_AFTER_MS = 4000;
export const REPLY_AFTER_MS = 9000;
export const RESOLVED_AFTER_MS = 16000;

export type TicketStatus = "open" | "reviewing" | "replied" | "resolved";

export interface SupportTicket {
  /** The number shown to the person, such as 0001. */
  number: string;
  subject: string;
  details: string;
  created: number;
}

export interface TicketStore {
  /** The last number handed out. Never goes back, even when tickets are dropped. */
  last: number;
  tickets: SupportTicket[];
}

export const emptyTicketStore = (): TicketStore => ({ last: 0, tickets: [] });

const formatNumber = (value: number): string => String(value).padStart(4, "0");

const clip = (value: unknown, limit: number): string =>
  typeof value === "string"
    ? value.replace(/\r/g, "").trim().slice(0, limit)
    : "";

/** Makes stored data safe to use; anything unexpected is dropped. */
export const normalizeTicketStore = (raw: unknown): TicketStore => {
  const store = emptyTicketStore();
  if (!raw || typeof raw !== "object") {
    return store;
  }
  const value = raw as Partial<TicketStore>;
  if (Array.isArray(value.tickets)) {
    const seen = new Set<string>();
    value.tickets.forEach((entry) => {
      if (!entry || typeof entry !== "object") {
        return;
      }
      const ticket = entry as Partial<SupportTicket>;
      const subject = clip(ticket.subject, SUBJECT_LIMIT);
      if (
        typeof ticket.number !== "string" ||
        !/^\d{4,}$/.test(ticket.number) ||
        seen.has(ticket.number) ||
        !subject ||
        !Number.isFinite(ticket.created)
      ) {
        return;
      }
      seen.add(ticket.number);
      store.tickets.push({
        number: ticket.number,
        subject,
        details: clip(ticket.details, DETAILS_LIMIT),
        created: ticket.created!,
      });
    });
    store.tickets = store.tickets.slice(-TICKET_LIMIT);
  }
  const highest = store.tickets.reduce(
    (max, ticket) => Math.max(max, Number(ticket.number)),
    0
  );
  store.last =
    Number.isInteger(value.last) && value.last! > highest
      ? value.last!
      : highest;
  return store;
};

/** What is wrong with a new ticket, or undefined when it can be opened. */
export const validateTicket = (subject: string): "subject" | undefined =>
  clip(subject, SUBJECT_LIMIT) ? undefined : "subject";

/** Opens a ticket. The numbers go up by one and are never reused. */
export const withTicket = (
  store: TicketStore,
  subject: string,
  details: string,
  now: number
): TicketStore => {
  if (validateTicket(subject)) {
    return store;
  }
  const last = store.last + 1;
  const ticket: SupportTicket = {
    number: formatNumber(last),
    subject: clip(subject, SUBJECT_LIMIT),
    details: clip(details, DETAILS_LIMIT),
    created: now,
  };
  return { last, tickets: [...store.tickets, ticket].slice(-TICKET_LIMIT) };
};

export const withoutTicket = (
  store: TicketStore,
  number: string
): TicketStore => ({
  ...store,
  tickets: store.tickets.filter((ticket) => ticket.number !== number),
});

/** The status at a moment: it only ever moves forward as time passes. */
export const ticketStatus = (
  ticket: SupportTicket,
  now: number
): TicketStatus => {
  const age = now - ticket.created;
  if (age >= RESOLVED_AFTER_MS) {
    return "resolved";
  }
  if (age >= REPLY_AFTER_MS) {
    return "replied";
  }
  if (age >= REVIEW_AFTER_MS) {
    return "reviewing";
  }
  return "open";
};

/** Milliseconds until the status next changes; undefined once resolved. */
export const nextStatusIn = (
  ticket: SupportTicket,
  now: number
): number | undefined => {
  const age = now - ticket.created;
  const next = [REVIEW_AFTER_MS, REPLY_AFTER_MS, RESOLVED_AFTER_MS].find(
    (at) => at > age
  );
  return next === undefined ? undefined : next - age;
};

/** The canned first reply is shown from the "replied" status on. */
export const hasReply = (status: TicketStatus): boolean =>
  status === "replied" || status === "resolved";

export const readTickets = (): TicketStore =>
  normalizeTicketStore(getStorage().getValue(TICKETS_STORAGE_KEY));

export const writeTickets = (store: TicketStore): void =>
  getStorage().setValue(TICKETS_STORAGE_KEY, normalizeTicketStore(store));

export const subscribeTickets = (
  callback: (store: TicketStore) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(TICKETS_STORAGE_KEY, () =>
    callback(readTickets())
  );
