import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";
import { computeDomain } from "../common/entity/compute_domain";

export interface RecordedSegment {
  entry_id: string;
  name: string;
  /** UNIX seconds */
  start: number;
  /** UNIX seconds */
  end: number;
  size: number;
  /** Whether the file is still on this computer, so it plays without a download */
  here: boolean;
}

export interface CameraRecordingSegments {
  /** Whether any recording destination records this camera */
  recorded: boolean;
  /** Whether the camera is being recorded right now */
  recording: boolean;
  states: string[];
  segments: RecordedSegment[];
}

export const fetchRecordedSegments = (
  hass: Pick<HomeAssistant, "callWS">,
  entityId: string,
  start: Date,
  end: Date
) =>
  hass.callWS<CameraRecordingSegments>({
    type: "camera_recording/segments",
    entity_id: entityId,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
  });

export const segmentPath = (entityId: string, segment: RecordedSegment) =>
  `/api/camera_recording/segment/${segment.entry_id}/${entityId}/${segment.name}`;

export type CameraEventKind =
  "motion" | "person" | "vehicle" | "animal" | "doorbell" | "sound";

export const CAMERA_EVENT_KINDS: CameraEventKind[] = [
  "motion",
  "person",
  "vehicle",
  "animal",
  "doorbell",
  "sound",
];

export interface CameraEvent {
  kind: CameraEventKind;
  entityId: string;
  /** milliseconds */
  start: number;
  /** milliseconds; equal to start for a single moment */
  end: number;
}

const WORDS: [RegExp, CameraEventKind][] = [
  [/person|people|human|face/, "person"],
  [/vehicle|car\b|_car|license|plate/, "vehicle"],
  [/animal|pet|dog|cat\b|_cat/, "animal"],
  [/doorbell|ring|visitor|button|press/, "doorbell"],
  [/sound|audio|noise|bark|crying|glass/, "sound"],
  [/motion|movement|move|detect/, "motion"],
];

/**
 * What kind of camera event an entity reports, or undefined when it reports none.
 * Uses the device class first, then words in the entity id and name.
 */
export const cameraEventKind = (
  stateObj: HassEntity | undefined,
  entityId: string
): CameraEventKind | undefined => {
  const domain = computeDomain(entityId);
  if (domain !== "binary_sensor" && domain !== "event") {
    return undefined;
  }
  const deviceClass = stateObj?.attributes.device_class as string | undefined;
  const text =
    `${entityId} ${stateObj?.attributes.friendly_name ?? ""}`.toLowerCase();
  const byWord = WORDS.find(([pattern]) => pattern.test(text))?.[1];
  if (domain === "event") {
    if (deviceClass === "doorbell") {
      return "doorbell";
    }
    if (deviceClass === "motion") {
      return byWord === "motion" || !byWord ? "motion" : byWord;
    }
    return byWord;
  }
  switch (deviceClass) {
    case "motion":
    case "moving":
      return byWord && byWord !== "doorbell" ? byWord : "motion";
    case "occupancy":
    case "presence":
      return byWord && byWord !== "doorbell" ? byWord : "person";
    case "sound":
      return "sound";
    default:
      return byWord === "doorbell" ? undefined : byWord;
  }
};

/** Entities on the camera's device that report events, with their kind. */
export const cameraEventEntities = (
  cameraId: string,
  entities: HomeAssistant["entities"],
  states: HomeAssistant["states"]
): Map<string, CameraEventKind> => {
  const found = new Map<string, CameraEventKind>();
  const deviceId = entities[cameraId]?.device_id;
  if (!deviceId) {
    return found;
  }
  for (const entry of Object.values(entities)) {
    if (entry.device_id !== deviceId || entry.entity_id === cameraId) {
      continue;
    }
    const kind = cameraEventKind(states[entry.entity_id], entry.entity_id);
    if (kind) {
      found.set(entry.entity_id, kind);
    }
  }
  return found;
};

interface CompressedOrFullState {
  s?: string;
  state?: string;
  lu?: number;
  lc?: number;
  last_changed?: string;
  last_updated?: string;
}

const stateOf = (item: CompressedOrFullState) => item.s ?? item.state;

const timeOf = (item: CompressedOrFullState): number => {
  if (item.lc !== undefined) {
    return item.lc * 1000;
  }
  if (item.lu !== undefined) {
    return item.lu * 1000;
  }
  return new Date(item.last_changed ?? item.last_updated ?? 0).getTime();
};

/**
 * Turns history into events: a binary sensor's on periods, and each change of
 * an event entity (its state is the time of the event).
 */
export const historyToEvents = (
  history: Record<string, CompressedOrFullState[]>,
  kinds: Map<string, CameraEventKind>,
  windowStart: number,
  windowEnd: number
): CameraEvent[] => {
  const events: CameraEvent[] = [];
  for (const [entityId, items] of Object.entries(history)) {
    const kind = kinds.get(entityId);
    if (!kind) {
      continue;
    }
    if (computeDomain(entityId) === "event") {
      for (const item of items) {
        const value = stateOf(item);
        const at = value ? Date.parse(value) : NaN;
        if (!Number.isNaN(at) && at >= windowStart && at <= windowEnd) {
          events.push({ kind, entityId, start: at, end: at });
        }
      }
      continue;
    }
    let onSince: number | undefined;
    for (const item of items) {
      const value = stateOf(item);
      const at = Math.max(timeOf(item), windowStart);
      if (value === "on" && onSince === undefined) {
        onSince = at;
      } else if (value !== "on" && onSince !== undefined) {
        events.push({ kind, entityId, start: onSince, end: at });
        onSince = undefined;
      }
    }
    if (onSince !== undefined) {
      events.push({ kind, entityId, start: onSince, end: windowEnd });
    }
  }
  return events.sort((a, b) => a.start - b.start);
};

/** Time ranges covered by recordings, joining segments that touch. */
export const recordedRanges = (
  segments: RecordedSegment[],
  gapSeconds = 5
): [number, number][] => {
  const ranges: [number, number][] = [];
  for (const segment of [...segments].sort((a, b) => a.start - b.start)) {
    const start = segment.start * 1000;
    const end = segment.end * 1000;
    const last = ranges[ranges.length - 1];
    if (last && start <= last[1] + gapSeconds * 1000) {
      last[1] = Math.max(last[1], end);
    } else {
      ranges.push([start, end]);
    }
  }
  return ranges;
};

/** The segment that holds a moment, if one does. */
export const segmentAt = (
  segments: RecordedSegment[],
  time: number
): RecordedSegment | undefined =>
  segments.find(
    (segment) => segment.start * 1000 <= time && time < segment.end * 1000
  );

/** The first segment that starts after a moment, to skip gaps while playing. */
export const segmentAfter = (
  segments: RecordedSegment[],
  time: number
): RecordedSegment | undefined =>
  [...segments]
    .sort((a, b) => a.start - b.start)
    .find((segment) => segment.start * 1000 > time);

export interface RecordingCameraStatus {
  entity_id: string;
  state:
    | "starting"
    | "recording"
    | "reconnecting"
    | "no_stream"
    | "paused"
    | "stopped";
  error: string | null;
  waiting: number;
  segments: number;
  bytes: number;
  /** UNIX seconds */
  newest: number | null;
  /** UNIX seconds */
  oldest: number | null;
}

export interface RecordingDestinationStatus {
  entry_id: string;
  title: string;
  destination: string;
  label: string;
  keep_days: number;
  max_bytes: number;
  segment_seconds: number;
  used_bytes: number;
  free_bytes: number | null;
  last_copy: string | null;
  error: string | null;
  cameras: RecordingCameraStatus[];
}

export const fetchRecordingStatus = (hass: Pick<HomeAssistant, "callWS">) =>
  hass.callWS<RecordingDestinationStatus[]>({
    type: "camera_recording/status",
  });

export const pauseRecording = (
  hass: Pick<HomeAssistant, "callWS">,
  entryId: string,
  paused: boolean,
  entityId?: string
) =>
  hass.callWS<RecordingDestinationStatus>({
    type: "camera_recording/pause",
    entry_id: entryId,
    paused,
    ...(entityId ? { entity_id: entityId } : {}),
  });
