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
  /** A recording, or the clip or picture of an event kept for a camera with no stream */
  kind?: "recording" | "event_clip" | "event_image";
}

export type RecordingAmount = "all_day" | "light" | "off";

export interface CameraAmountPeriod {
  /** UNIX seconds */
  since: number;
  mode: RecordingAmount;
}

export type EventClipReason =
  | "recording_off"
  | "rate_limited"
  | "timed_out"
  | "unsupported"
  | "storage_full"
  | "storage_unreachable"
  | "removed"
  | "no_media"
  | "failed"
  | "not_recorded";

/** What the home knows about the clip of one event, from the backend */
export interface CameraEventRecord {
  /** UNIX seconds */
  start: number;
  state: "saved" | "saving" | "none";
  reason: EventClipReason | null;
  name: string | null;
  kind: "clip" | "image" | null;
  duration: number;
  size: number;
  /** Seconds since the event, while the clip is being saved */
  progress: number | null;
  entry_id: string;
}

/** The part of a camera's recording status anyone who can see it may read */
export interface CameraRecordingSummary {
  entry_id: string;
  mode: RecordingAmount;
  effective_mode: RecordingAmount;
  mode_reason: "provider_only" | "no_stream" | "no_event_source" | null;
  state: string;
  provider_only: boolean;
  all_day_available: boolean;
  all_day_reason: "provider_only" | null;
  kept_today: number;
  bytes_today: number;
  saving: number;
  /** UNIX seconds */
  last_clip: number | null;
  last_problem: { at: number; reason: EventClipReason } | null;
  event_clips: number;
}

export interface CameraRecordingSegments {
  /** What became of each event of the window */
  events?: CameraEventRecord[];
  /** How this camera is being recorded, or null when no destination records it */
  camera?: CameraRecordingSummary | null;
  /** When the amount changed, so gaps can be explained */
  modes?: CameraAmountPeriod[];
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
    | "limited"
    | "paused"
    | "stopped";
  error: string | null;
  /** The amount chosen for this camera */
  mode: RecordingAmount;
  /** What the camera really does now */
  effective_mode: RecordingAmount;
  /** Why the real amount differs from the choice, if it does */
  mode_reason: "provider_only" | "no_stream" | "no_event_source" | null;
  /** Seconds kept before and after something is seen, in Light */
  pre: number;
  post: number;
  /** The longest single clip in Light, in seconds */
  max_clip: number;
  /** The sources in use, and the ones the owner chose (null for automatic) */
  sources: string[];
  sources_chosen: string[] | null;
  source_options: { source: string; kind: string }[];
  light_possible: boolean;
  light_reason: "no_event_source" | null;
  /** The camera has no stream of its own, so only event clips can be kept */
  provider_only: boolean;
  continuous_possible: boolean;
  /** UNIX seconds when a clip was last cut at its longest length, within a day */
  cap_hit: number | null;
  events_today: number;
  bytes_today: number;
  /** Event clips and pictures kept */
  event_clips: number;
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
  default_mode: RecordingAmount;
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

export const setRecordingAmount = (
  hass: Pick<HomeAssistant, "callWS">,
  entryId: string,
  entityId: string,
  mode: RecordingAmount,
  extra: { pre?: number; post?: number; sources?: string[] | null } = {}
) =>
  hass.callWS<RecordingDestinationStatus>({
    type: "camera_recording/set_mode",
    entry_id: entryId,
    entity_id: entityId,
    mode,
    ...extra,
  });

/** The sentence about what a camera keeps, by amount. */
export const amountKey = (
  camera: Pick<
    RecordingCameraStatus,
    "provider_only" | "effective_mode" | "mode"
  >
): "provider_only" | "all_day" | "light" | "off" =>
  camera.provider_only ? "provider_only" : camera.effective_mode;

/** An event and a record of it are one event when they are this close, in milliseconds */
export const EVENT_MATCH_MS = 30_000;

export interface EventClip {
  state: "saved" | "saving" | "none";
  /** Why there is no clip, when there is none */
  reason?: EventClipReason;
  /** The saved clip or picture, or the recording that covers the event */
  segment?: RecordedSegment;
  /** Only a still picture was kept */
  picture?: boolean;
  /** Seconds saved so far, while saving */
  progress?: number;
  duration?: number;
  size?: number;
}

/**
 * What is on disk for one event. A clip counts only when a file is really
 * indexed: a record that says saved without its file, or no record and no
 * recording over the moment, never offers playback.
 */
export const clipForEvent = (
  event: CameraEvent,
  records: CameraEventRecord[],
  segments: RecordedSegment[],
  summary: CameraRecordingSummary | null | undefined
): EventClip => {
  const record = records
    .filter(
      (item) => Math.abs(item.start * 1000 - event.start) <= EVENT_MATCH_MS
    )
    .sort(
      (a, b) =>
        Math.abs(a.start * 1000 - event.start) -
        Math.abs(b.start * 1000 - event.start)
    )[0];
  if (record?.state === "saved") {
    const segment = segments.find((seg) => seg.name === record.name);
    if (segment) {
      return {
        state: "saved",
        segment,
        picture: record.kind === "image",
        duration: record.duration,
        size: record.size,
      };
    }
    return { state: "none", reason: "removed" };
  }
  if (record?.state === "saving") {
    return { state: "saving", progress: record.progress ?? 0 };
  }
  if (record?.state === "none") {
    return { state: "none", reason: record.reason ?? "not_recorded" };
  }
  const covering =
    segmentAt(segments, event.start - 5000) ?? segmentAt(segments, event.start);
  if (covering && covering.kind !== "event_image") {
    return { state: "saved", segment: covering };
  }
  if (summary?.effective_mode === "off") {
    return { state: "none", reason: "recording_off" };
  }
  return { state: "none", reason: "not_recorded" };
};

/** The moment to seek to so that playback starts on an event's clip */
export const playTimeForClip = (event: CameraEvent, clip: EventClip): number =>
  clip.segment && clip.segment.kind !== "recording" && clip.segment.kind
    ? clip.segment.start * 1000 + 1
    : event.start - 5000;

/** Turn on keeping a clip for each event of a camera that is off. */
export const keepClipsForEvents = (
  hass: Pick<HomeAssistant, "callWS">,
  entryId: string,
  entityId: string
) => pauseRecording(hass, entryId, false, entityId);
