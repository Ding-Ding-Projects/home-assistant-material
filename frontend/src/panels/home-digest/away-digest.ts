import {
  safeGetStored,
  safeSetStored,
} from "../../common/preferences/safe-storage";
import type { LogbookEntry } from "../../data/logbook";

/**
 * The summary shown on the Home page after an absence. This file holds the
 * logic only: when to show it, what is counted from the logbook and the
 * current states, and which sentence fits. It never reads the page or sends
 * anything anywhere.
 */

export const AWAY_MAX_WINDOW_MS = 7 * 24 * 3600 * 1000;
/** The most logbook entries read; the newest ones are kept. */
export const AWAY_MAX_ENTRIES = 1500;
export const AWAY_MAX_ROWS = 6;
export const LOW_BATTERY_PERCENT = 15;

const HOUR_MS = 3600 * 1000;
const MINUTE_MS = 60 * 1000;

/** The device classes of a binary sensor that count as something opening. */
export const OPENING_DEVICE_CLASSES = [
  "door",
  "window",
  "garage_door",
  "opening",
];

/** The part of an entity state the digest reads. */
export interface DigestState {
  state: string;
  attributes: Record<string, unknown>;
}

export type DigestStates = Record<string, DigestState>;

const domainOf = (entityId: string): string => entityId.split(".", 1)[0];

/** Where the time of the last visit is kept: this device, one key per person. */
export const lastSeenKey = (userId?: string): string =>
  `awayDigestLastSeen.${userId || "anonymous"}`;

export const readLastSeen = (userId?: string): number | undefined => {
  const value = safeGetStored<unknown>(lastSeenKey(userId));
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
};

export const writeLastSeen = (userId: string | undefined, now: number) =>
  safeSetStored(lastSeenKey(userId), now);

export interface ShowDecisionInput {
  enabled: boolean;
  gapHours: number;
  /** When the front door was last open, if it ever was. */
  lastSeen?: number;
  now: number;
}

/**
 * True when the summary should appear: it is switched on and the person has
 * been away at least the chosen gap. A first visit, or a clock that moved
 * back, shows nothing.
 */
export const shouldShowDigest = ({
  enabled,
  gapHours,
  lastSeen,
  now,
}: ShowDecisionInput): boolean =>
  enabled &&
  lastSeen !== undefined &&
  lastSeen < now &&
  now - lastSeen >= gapHours * HOUR_MS;

export interface AbsenceWindow {
  start: number;
  end: number;
  /** True when the time away was longer than the window read. */
  capped: boolean;
}

/** The part of the absence that is read: at most the last seven days. */
export const absenceWindow = (lastSeen: number, now: number): AbsenceWindow => {
  const start = Math.max(lastSeen, now - AWAY_MAX_WINDOW_MS);
  return { start, end: now, capped: start > lastSeen };
};

export type DurationUnit = "minutes" | "hours" | "days";

/** The length of the absence as a whole number of one unit. */
export const describeDuration = (
  ms: number
): { unit: DurationUnit; count: number } => {
  if (ms >= 24 * HOUR_MS) {
    return { unit: "days", count: Math.round(ms / (24 * HOUR_MS)) };
  }
  if (ms >= HOUR_MS) {
    return { unit: "hours", count: Math.round(ms / HOUR_MS) };
  }
  return { unit: "minutes", count: Math.max(1, Math.round(ms / MINUTE_MS)) };
};

const isOpeningSensor = (entityId: string, states: DigestStates): boolean =>
  domainOf(entityId) === "binary_sensor" &&
  OPENING_DEVICE_CLASSES.includes(
    String(states[entityId]?.attributes.device_class)
  );

const isBatterySensor = (state: DigestState): boolean =>
  state.attributes.device_class === "battery";

export type EventKind = "arrival" | "opening";

export interface NotableEvent {
  kind: EventKind;
  entityId: string;
  name: string;
  /** Milliseconds since the epoch. */
  when: number;
}

export type AttentionKind = "unavailable" | "battery";

export interface AttentionItem {
  kind: AttentionKind;
  entityId: string;
  name: string;
  /** The battery level, for a battery item. */
  percent?: number;
}

export interface DigestCounts {
  automations: number;
  openings: number;
  arrivals: number;
  attention: number;
}

/** Which tiles can be derived from this home; a tile with no source is left out. */
export interface DigestSources {
  automations: boolean;
  openings: boolean;
  arrivals: boolean;
}

export interface Digest {
  counts: DigestCounts;
  sources: DigestSources;
  attention: AttentionItem[];
  events: NotableEvent[];
}

const nameOf = (entityId: string, states: DigestStates): string => {
  const friendly = states[entityId]?.attributes.friendly_name;
  return typeof friendly === "string" && friendly ? friendly : entityId;
};

const isAutomationRun = (entry: LogbookEntry): boolean =>
  entry.domain === "automation" &&
  !entry.state &&
  (entry.context_event_type === "automation_triggered" ||
    /triggered/i.test(entry.message ?? ""));

/** What the home has that the tiles could count at all. */
export const digestSources = (states: DigestStates): DigestSources => {
  const ids = Object.keys(states);
  return {
    automations: ids.some((id) => domainOf(id) === "automation"),
    openings: ids.some((id) => isOpeningSensor(id, states)),
    arrivals: ids.some((id) => domainOf(id) === "person"),
  };
};

/**
 * Things that need a look: an entity that became unavailable during the
 * absence and still is, then battery sensors under the low-battery level.
 */
export const attentionItems = (
  entries: LogbookEntry[],
  states: DigestStates
): AttentionItem[] => {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    const id = entry.entity_id;
    if (
      !id ||
      seen.has(id) ||
      entry.state !== "unavailable" ||
      states[id]?.state !== "unavailable"
    ) {
      continue;
    }
    seen.add(id);
    items.push({ kind: "unavailable", entityId: id, name: nameOf(id, states) });
  }
  for (const [id, state] of Object.entries(states)) {
    if (domainOf(id) !== "sensor" || !isBatterySensor(state)) {
      continue;
    }
    const percent = Number(state.state);
    if (
      state.state !== "" &&
      Number.isFinite(percent) &&
      percent < LOW_BATTERY_PERCENT
    ) {
      items.push({
        kind: "battery",
        entityId: id,
        name: nameOf(id, states),
        percent: Math.round(percent),
      });
    }
  }
  return items;
};

/** Counts and notable events from the entries inside the window. */
export const buildDigest = (
  entries: LogbookEntry[],
  states: DigestStates,
  window: Pick<AbsenceWindow, "start" | "end">
): Digest => {
  const inWindow = entries.filter((entry) => {
    const when = entry.when * 1000;
    return when >= window.start && when <= window.end;
  });
  let automations = 0;
  const events: NotableEvent[] = [];
  for (const entry of inWindow) {
    if (isAutomationRun(entry)) {
      automations++;
      continue;
    }
    const id = entry.entity_id;
    if (!id) {
      continue;
    }
    if (domainOf(id) === "person" && entry.state === "home") {
      events.push({
        kind: "arrival",
        entityId: id,
        name: entry.name || nameOf(id, states),
        when: entry.when * 1000,
      });
    } else if (entry.state === "on" && isOpeningSensor(id, states)) {
      events.push({
        kind: "opening",
        entityId: id,
        name: entry.name || nameOf(id, states),
        when: entry.when * 1000,
      });
    }
  }
  const attention = attentionItems(inWindow, states);
  events.sort((a, b) => b.when - a.when);
  return {
    counts: {
      automations,
      openings: events.filter((event) => event.kind === "opening").length,
      arrivals: events.filter((event) => event.kind === "arrival").length,
      attention: attention.length,
    },
    sources: digestSources(states),
    attention,
    events,
  };
};

export type DigestLead = "nothing" | "quiet" | "busy";

/** How much happened, in three steps, from what was counted. */
export const digestLead = (counts: DigestCounts): DigestLead => {
  const activity = counts.automations + counts.openings + counts.arrivals;
  if (activity === 0) {
    return "nothing";
  }
  return activity <= 10 ? "quiet" : "busy";
};

export type DigestRow =
  | { type: "attention"; item: AttentionItem }
  | { type: "event"; event: NotableEvent };

/** Up to six rows: what needs a look first, then notable events, newest first. */
export const digestRows = (
  digest: Pick<Digest, "attention" | "events">,
  max = AWAY_MAX_ROWS
): DigestRow[] =>
  [
    ...digest.attention.map((item): DigestRow => ({ type: "attention", item })),
    ...digest.events.map((event): DigestRow => ({ type: "event", event })),
  ].slice(0, max);
