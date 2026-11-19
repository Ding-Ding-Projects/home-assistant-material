/**
 * Live views and snapshots a recorded camera keeps, and how its live video is
 * watched. A camera that streams only through its service is watched through
 * the home, so the one live view the home pulls is both shown and kept.
 */
import type { HomeAssistant } from "../types";
import type { WebRtcOfferEvent } from "./camera";

export type WatchedKind = "live_view" | "snapshot";

export type WatchedOrigin = "person" | "dashboard" | "automation" | "other";

export interface WatchedRow {
  start: number;
  kind: WatchedKind;
  state: "saved" | "saving" | "none";
  origin: WatchedOrigin | null;
  /** Why nothing was kept, as one of the clip reason codes */
  reason: string | null;
  name: string | null;
  duration: number;
  size: number;
  /** "recording" when an all-day recording already holds this moment */
  points_at: "recording" | null;
  entry_id: string;
}

export interface WatchSettings {
  auto_start: boolean;
  keep_live: boolean;
  keep_snapshots: boolean;
  longest_minutes: number;
  snapshot_seconds: number;
}

export interface WatchLiveState {
  route: "home" | "camera";
  viewers: number;
  keeping_since: number | null;
  retry_at: number | null;
}

export interface WatchedSummary {
  recorded: boolean;
  rows: WatchedRow[];
  entry_id?: string;
  settings?: WatchSettings;
  kept_today?: { live_views: number; snapshots: number; size: number };
  live?: WatchLiveState;
}

export const DEFAULT_WATCH_SETTINGS: WatchSettings = {
  auto_start: true,
  keep_live: true,
  keep_snapshots: true,
  longest_minutes: 10,
  snapshot_seconds: 60,
};

export const fetchWatched = (
  hass: Pick<HomeAssistant, "callWS">,
  entityId: string,
  start: Date,
  end: Date
) =>
  hass.callWS<WatchedSummary>({
    type: "camera_recording/watched/list",
    entity_id: entityId,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

export const saveWatchSettings = (
  hass: Pick<HomeAssistant, "callWS">,
  entryId: string,
  entityId: string,
  changes: Partial<WatchSettings>
) =>
  hass.callWS<Omit<WatchedSummary, "recorded" | "rows">>({
    type: "camera_recording/watched/settings",
    entry_id: entryId,
    entity_id: entityId,
    ...changes,
  });

const SUMMARY_SECONDS = 60;

const summaries = new Map<
  string,
  { at: number; value: Promise<WatchedSummary | undefined> }
>();

/**
 * The settings and route of a camera, asked at most once a minute per tab.
 * Undefined when the camera is not recorded or the command is not available.
 */
export const watchedSummaryCached = (
  hass: Pick<HomeAssistant, "callWS">,
  entityId: string,
  now = Date.now()
): Promise<WatchedSummary | undefined> => {
  const cached = summaries.get(entityId);
  if (cached && now - cached.at < SUMMARY_SECONDS * 1000) {
    return cached.value;
  }
  const end = new Date(now);
  const value = fetchWatched(hass, entityId, new Date(now - 1000), end).then(
    (summary) => (summary.recorded ? summary : undefined),
    () => undefined
  );
  summaries.set(entityId, { at: now, value });
  return value;
};

/** Forget the cached settings of a camera, after they were changed. */
export const forgetWatchedSummary = (entityId: string) => {
  summaries.delete(entityId);
};

/** Whether a picture should wait for a tap: only when the camera's switch says so. */
export const waitsForTap = (
  tapToStart: boolean,
  settings?: Pick<WatchSettings, "auto_start">
): boolean => tapToStart && settings?.auto_start === false;

interface WatchStateEvent extends WatchLiveState {
  type: "state";
}

interface WatchErrorEvent {
  type: "error";
  code: string;
  retry_after?: number | null;
}

interface WatchEndedEvent {
  type: "ended";
}

export type WatchEvent =
  | WatchStateEvent
  | WatchErrorEvent
  | WatchEndedEvent
  | { type: "session"; session_id: string }
  | { type: "answer"; answer: string }
  | { type: "candidate"; candidate: { candidate: string } };

/** Words the player already reads as "too many requests". */
export const RATE_LIMITED_MESSAGE = "too many requests";

/**
 * The offer events of a watch, in the shape the player already handles. Error
 * codes become the message, and a refusal reads as too many requests.
 */
export const toOfferEvent = (
  event: WatchEvent
): WebRtcOfferEvent | undefined => {
  switch (event.type) {
    case "session":
    case "answer":
      return event;
    case "candidate":
      return { type: "candidate", candidate: event.candidate };
    case "error":
      return {
        type: "error",
        code: event.code,
        message:
          event.code === "rate_limited" ? RATE_LIMITED_MESSAGE : event.code,
      };
    default:
      return undefined;
  }
};

/** Watch a camera that streams through its service, through the home. */
export const watchOffer = (
  hass: Pick<HomeAssistant, "connection">,
  entityId: string,
  offer: string,
  callback: (event: WatchEvent) => void
) =>
  hass.connection.subscribeMessage<WatchEvent>(callback, {
    type: "camera_recording/watch/offer",
    entity_id: entityId,
    offer,
  });

export const watchCandidate = (
  hass: Pick<HomeAssistant, "callWS">,
  entityId: string,
  sessionId: string,
  candidate: string
) =>
  hass.callWS({
    type: "camera_recording/watch/candidate",
    entity_id: entityId,
    session_id: sessionId,
    candidate,
  });

/** Tell the home a camera with its own stream address is being watched, so it is kept. */
export const watchSubscribe = (
  hass: Pick<HomeAssistant, "connection">,
  entityId: string,
  callback: (event: WatchEvent) => void
) =>
  hass.connection.subscribeMessage<WatchEvent>(callback, {
    type: "camera_recording/watch/subscribe",
    entity_id: entityId,
  });

/** Minutes and seconds kept so far, for example 0:24. */
export const keptFor = (since: number, now = Date.now()): string => {
  const whole = Math.max(0, Math.floor(now / 1000 - since));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = (whole % 60).toString().padStart(2, "0");
  return hours
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`;
};
