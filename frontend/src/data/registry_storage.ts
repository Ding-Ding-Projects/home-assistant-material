import type { HomeAssistant } from "../types";

/**
 * Container registry storage: a free public container registry used as a place
 * for camera recordings and for backups. Everything is locked at home with the
 * owner's password before it leaves, so public is expected and the lock is
 * never optional.
 *
 * The commands live in the camera recording integration, which owns the upload
 * queue, the recording index and playback. Keep every name in this one block:
 * a test here and a test in the integration check the same list, so a rename on
 * either side fails a test. There is deliberately no command that carries a
 * password; setting and changing it happen in the integration's own flows.
 */
export const REGISTRY_WS = {
  status: "camera_recording/registry/status",
  test: "camera_recording/registry/test",
  set: "camera_recording/registry/set",
  cameraRepository: "camera_recording/registry/camera_repository",
  refresh: "camera_recording/registry/refresh",
  where: "camera_recording/registry/where",
  play: "camera_recording/registry/play",
  getBack: "camera_recording/registry/get_back",
  getBackStatus: "camera_recording/registry/get_back_status",
  getBackCancel: "camera_recording/registry/get_back_cancel",
} as const;

export const REGISTRY_DOMAIN = "registry_storage";

export type RegistryKind = "docker_hub" | "github" | "other";

/** Product names are shown as they are in every language. */
export const REGISTRY_NAMES: Record<RegistryKind, string | undefined> = {
  docker_hub: "Docker Hub",
  github: "GitHub",
  other: undefined,
};

export type RegistrySendChoice = "events" | "everything";

export const REGISTRY_KEEP_DAYS_RANGE = { min: 1, max: 365, default: 30 };

/** The server answers at most this window for one camera at a time. */
export const REGISTRY_WHERE_MAX_SECONDS = 8 * 86400;

/** The upload queue's view of the registry, as the server reports it. */
export interface RegistryUploadStatus {
  domain: string;
  set_up: boolean;
  loaded: boolean;
  enabled: boolean;
  send: RegistrySendChoice;
  keep_days: number | null;
  enabled_at: number | null;
  waiting_files: number;
  waiting_bytes: number;
  sent_files: number;
  sent_bytes: number;
  given_up: number;
  last_sent: {
    entity_id: string;
    name: string;
    kind: string;
    at: number;
  } | null;
  last_problem: { reason: string; at: number } | null;
}

export interface RegistryCameraStatus {
  repository: string | null;
  own_repository: boolean;
  in_registry_files: number;
  in_registry_bytes: number;
  waiting_files: number;
  waiting_bytes: number;
  sending: { name: string; done: number; total: number }[];
}

/** The answer of `camera_recording/registry/status`. */
export interface RegistryServerStatus {
  entry_id: string | null;
  registry: RegistryKind | null;
  address: string | null;
  username: string | null;
  set_up: boolean;
  loaded: boolean;
  default_repository: string | null;
  backups_repository: string | null;
  public: boolean | null;
  used_bytes: number | null;
  rate_limit_remaining: number | null;
  tested: {
    ok: boolean;
    reason: string | null;
    at: number;
    seconds: number;
  } | null;
  upload: RegistryUploadStatus;
  cameras: Record<string, RegistryCameraStatus>;
  playback: { reason: string; retry_after: number } | null;
  indexed_files: number;
}

/** What the pages draw for one registry place. */
export interface RegistryPlace {
  entry_id: string;
  registry: RegistryKind;
  /** Only for a registry of the owner's own. */
  address: string | null;
  username: string;
  default_repository: string;
  /** Camera entity id to its own repository. */
  camera_repositories: Record<string, string>;
  backups_repository: string | null;
  loaded: boolean;
  enabled: boolean;
  /** Read from the registry; null when it could not be asked. */
  public: boolean | null;
  send: RegistrySendChoice;
  /** Null keeps recordings there for ever. */
  keep_days: number | null;
  /** Null when the registry could not be asked. */
  used_bytes: number | null;
  waiting_files: number;
  waiting_bytes: number;
  last_sent: { entity_id: string; at: number } | null;
  last_problem: { reason: string; at: number } | null;
}

export interface RegistryStatus {
  places: RegistryPlace[];
}

export interface RegistryChange {
  enabled?: boolean;
  /** Required by the server whenever sending is turned on. */
  public_understood?: boolean;
  send?: RegistrySendChoice;
  keep_days?: number | null;
}

export interface RegistrySelfTestResult {
  ok: boolean;
  reason: string | null;
  seconds: number;
}

/** One row of `camera_recording/registry/where`. */
export interface RegistryWhereRow {
  entry_id: string | null;
  name: string;
  /** Epoch seconds. */
  start: number;
  end: number;
  size: number;
  here: boolean;
  kind: string;
  in_registry: boolean;
}

/** A recording stored in the registry. */
export interface RegistryRecording {
  /** The recording's file name; unique per camera. */
  id: string;
  entity_id: string;
  /** Epoch seconds. */
  start: number;
  duration: number;
  stored_size: number;
  /** True while a copy is still on this system. */
  local: boolean;
}

export type RegistryGetBackState = "running" | "done" | "failed" | "cancelled";

export interface RegistryGetBackJob {
  id: string;
  entity_id: string;
  files: number;
  done_files: number;
  total_bytes: number;
  done_bytes: number;
  state: RegistryGetBackState;
  reason: string | null;
  started: number;
}

export interface RegistryPlayAnswer {
  path: string;
  expires_in: number;
  size: number;
  content_type: string;
  waiting: { reason: string; retry_after: number } | null;
}

export type RegistryPlayState = "fetching" | "playing" | "done" | "failed";

export interface RegistryPlayback {
  state: RegistryPlayState;
  /** 0 to 1: how much of the file has arrived. */
  fetched: number;
  /** 0 to 1: how much has been played. */
  played: number;
}

/** The server's status as the places the pages draw: none, or the one place. */
export const registryPlacesFromStatus = (
  status: RegistryServerStatus
): RegistryPlace[] => {
  if (!status.set_up || !status.entry_id) {
    return [];
  }
  const cameraRepositories: Record<string, string> = {};
  for (const [entityId, camera] of Object.entries(status.cameras ?? {})) {
    if (camera.own_repository && camera.repository) {
      cameraRepositories[entityId] = camera.repository;
    }
  }
  const upload = status.upload;
  return [
    {
      entry_id: status.entry_id,
      registry: status.registry ?? "other",
      address: status.address,
      username: status.username ?? "",
      default_repository: status.default_repository ?? "",
      camera_repositories: cameraRepositories,
      backups_repository: status.backups_repository,
      loaded: status.loaded,
      enabled: !!upload?.enabled,
      public: status.public,
      send: upload?.send ?? "events",
      keep_days:
        upload && "keep_days" in upload
          ? upload.keep_days
          : REGISTRY_KEEP_DAYS_RANGE.default,
      used_bytes: status.used_bytes,
      waiting_files: upload?.waiting_files ?? 0,
      waiting_bytes: upload?.waiting_bytes ?? 0,
      last_sent: upload?.last_sent
        ? { entity_id: upload.last_sent.entity_id, at: upload.last_sent.at }
        : null,
      last_problem: upload?.last_problem ?? null,
    },
  ];
};

type CallWS = Pick<HomeAssistant, "callWS">;

const toPlaces = (status: RegistryServerStatus): RegistryStatus => ({
  places: registryPlacesFromStatus(status),
});

export const fetchRegistryStatus = async (
  hass: CallWS
): Promise<RegistryStatus> =>
  toPlaces(
    await hass.callWS<RegistryServerStatus>({ type: REGISTRY_WS.status })
  );

/** Turning sending on runs the registry's self-test on the server first. */
export const setRegistryPlace = async (
  hass: CallWS,
  change: RegistryChange
): Promise<RegistryStatus> =>
  toPlaces(
    await hass.callWS<RegistryServerStatus>({
      type: REGISTRY_WS.set,
      ...change,
    })
  );

/** Give one camera its own repository, or null to send it back to the default. */
export const setRegistryCameraRepository = async (
  hass: CallWS,
  entityId: string,
  repository: string | null
): Promise<RegistryStatus> =>
  toPlaces(
    await hass.callWS<RegistryServerStatus>({
      type: REGISTRY_WS.cameraRepository,
      entity_id: entityId,
      repository,
    })
  );

export const runRegistrySelfTest = (hass: CallWS) =>
  hass.callWS<RegistrySelfTestResult>({ type: REGISTRY_WS.test });

/** Rebuild the recording index from the registry's own list. */
export const refreshRegistryIndex = (hass: CallWS) =>
  hass.callWS<{ recordings: number }>({ type: REGISTRY_WS.refresh });

const isoSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();

export const fetchRegistryWhere = (
  hass: CallWS,
  entityId: string,
  start: number,
  end: number
) =>
  hass.callWS<RegistryWhereRow[]>({
    type: REGISTRY_WS.where,
    entity_id: entityId,
    start_time: isoSeconds(start),
    end_time: isoSeconds(end),
  });

export const registryRecordingsFromRows = (
  entityId: string,
  rows: RegistryWhereRow[]
): RegistryRecording[] =>
  rows
    .filter((row) => row.in_registry)
    .map((row) => ({
      id: row.name,
      entity_id: entityId,
      start: row.start,
      duration: Math.max(0, row.end - row.start),
      stored_size: row.size,
      local: row.here,
    }));

/**
 * The recordings of one camera that are in the registry, between two epoch
 * seconds. The server answers at most eight days, so a longer window keeps its
 * most recent eight days.
 */
export const fetchRegistryRecordings = async (
  hass: CallWS,
  entityId: string,
  start: number,
  end: number
): Promise<RegistryRecording[]> => {
  const from = Math.max(start, end - REGISTRY_WHERE_MAX_SECONDS);
  return registryRecordingsFromRows(
    entityId,
    await fetchRegistryWhere(hass, entityId, from, end)
  );
};

export const playRegistryRecording = (
  hass: CallWS,
  entityId: string,
  name: string
) =>
  hass.callWS<RegistryPlayAnswer>({
    type: REGISTRY_WS.play,
    entity_id: entityId,
    name,
  });

/** Download and unlock one recording into the camera's folder, as a job. */
export const startRegistryGetBack = (
  hass: CallWS,
  entityId: string,
  name: string
) =>
  hass.callWS<RegistryGetBackJob>({
    type: REGISTRY_WS.getBack,
    entity_id: entityId,
    name,
  });

export const fetchRegistryGetBack = (hass: CallWS, jobId: string) =>
  hass.callWS<RegistryGetBackJob>({
    type: REGISTRY_WS.getBackStatus,
    job_id: jobId,
  });

export const cancelRegistryGetBack = (hass: CallWS, jobId: string) =>
  hass.callWS<RegistryGetBackJob>({
    type: REGISTRY_WS.getBackCancel,
    job_id: jobId,
  });

/** Reason codes the integration reports; anything else shows as unexpected. */
export const REGISTRY_PROBLEM_REASONS = [
  "auth_failed",
  "denied",
  "not_found",
  "rate_limited",
  "unavailable",
  "timeout",
  "invalid_response",
  "rejected",
  "wrong_password",
  "tampered",
  "truncated",
  "self_test_failed",
  "not_ready",
] as const;

/**
 * The upload queue words its problems in its own codes, shared with the cloud
 * drives; these are the registry reasons they stand for.
 */
const UPLOAD_REASON_ALIASES: Record<string, string> = {
  sign_in: "auth_failed",
  refused: "rejected",
  timed_out: "timeout",
  drive_error: "unavailable",
  locked: "wrong_password",
  check_failed: "self_test_failed",
  not_set_up: "not_ready",
  not_loaded: "not_ready",
};

export const registryProblemKey = (reason: string): string => {
  const key = UPLOAD_REASON_ALIASES[reason] ?? reason;
  return (REGISTRY_PROBLEM_REASONS as readonly string[]).includes(key)
    ? key
    : "unexpected";
};

/** What the owner can do about a problem. */
export type RegistryProblemAdvice = "later" | "token" | "damaged" | "other";

export const registryProblemAdvice = (
  reason: string
): RegistryProblemAdvice => {
  switch (registryProblemKey(reason)) {
    case "rate_limited":
    case "unavailable":
    case "timeout":
      return "later";
    case "auth_failed":
    case "denied":
      return "token";
    case "tampered":
    case "truncated":
    case "wrong_password":
      return "damaged";
    default:
      return "other";
  }
};

export type RegistryStatusKey =
  "not_loaded" | "off" | "waiting" | "up_to_date" | "nothing_sent";

/** Which one-line summary a place gets; the page words each key. */
export const registryStatusKey = (
  place: Pick<
    RegistryPlace,
    "loaded" | "enabled" | "waiting_files" | "last_sent"
  >
): RegistryStatusKey => {
  if (!place.loaded) {
    return "not_loaded";
  }
  if (!place.enabled) {
    return "off";
  }
  if (place.waiting_files > 0) {
    return "waiting";
  }
  return place.last_sent ? "up_to_date" : "nothing_sent";
};

export type RegistryVisibilityKey = "public" | "private" | "unknown";

export const registryVisibilityKey = (
  place: Pick<RegistryPlace, "public">
): RegistryVisibilityKey =>
  place.public === null ? "unknown" : place.public ? "public" : "private";

/** The repository a camera uses: its own, else the default. */
export const repositoryForCamera = (
  place: Pick<RegistryPlace, "default_repository" | "camera_repositories">,
  entityId: string
): string => place.camera_repositories[entityId] || place.default_repository;

export const repositoryForBackups = (
  place: Pick<RegistryPlace, "default_repository" | "backups_repository">
): string => place.backups_repository || place.default_repository;

export type RepositoryChoice = "default" | "own";

export const repositoryChoiceForCamera = (
  place: Pick<RegistryPlace, "camera_repositories">,
  entityId: string
): RepositoryChoice =>
  place.camera_repositories[entityId] ? "own" : "default";

/** A repository name looks like account/name, in lower case. */
export const isValidRepositoryName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(name.trim());

/** The registry backup location's agent id, for the backup pages. */
export const isRegistryAgent = (agentId: string): boolean =>
  agentId.split(".")[0] === REGISTRY_DOMAIN;

/** Where the owner is told what public means, the first time a place is turned on. */
export const REGISTRY_PUBLIC_WARNING_SEEN_KEY =
  "registry_storage_public_warning_seen";

export const registryPublicWarningSeen = (): boolean => {
  try {
    return (
      window.localStorage.getItem(REGISTRY_PUBLIC_WARNING_SEEN_KEY) === "1"
    );
  } catch {
    return false;
  }
};

export const markRegistryPublicWarningSeen = () => {
  try {
    window.localStorage.setItem(REGISTRY_PUBLIC_WARNING_SEEN_KEY, "1");
  } catch {
    // The warning is simply shown again next time.
  }
};

/** Recordings that exist only in the registry, newest first. */
export const registryOnlyRecordings = (
  recordings: RegistryRecording[]
): RegistryRecording[] =>
  recordings.filter((rec) => !rec.local).sort((a, b) => b.start - a.start);

/**
 * The place a backup location belongs to. The agent id is the domain and the
 * entry id; with one place, or an id that does not match, the first is used.
 */
export const registryPlaceForAgent = (
  places: RegistryPlace[] | undefined,
  agentId: string
): RegistryPlace | undefined =>
  places?.find((place) => agentId.endsWith(`.${place.entry_id}`)) ??
  places?.[0];

/** Where the registry recordings fall inside a window, as 0 to 1 positions. */
export const registryBars = (
  recordings: Pick<RegistryRecording, "start" | "duration">[],
  startMs: number,
  endMs: number
): { left: number; width: number }[] => {
  const span = endMs - startMs;
  if (span <= 0) {
    return [];
  }
  return recordings
    .map((rec) => {
      const from = Math.max(rec.start * 1000, startMs);
      const to = Math.min((rec.start + rec.duration) * 1000, endMs);
      return { left: (from - startMs) / span, width: (to - from) / span };
    })
    .filter((bar) => bar.width > 0);
};
