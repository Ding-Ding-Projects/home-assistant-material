import type { HomeAssistant } from "../types";

/**
 * Container registry storage: a free public container registry used as a place
 * for camera recordings and for backups. Everything is locked at home with the
 * owner's password before it leaves, so public is expected and the lock is
 * never optional.
 *
 * The websocket command names below follow the registry storage integration's
 * own naming. Keep them in this one block so a rename is one edit.
 */
export const REGISTRY_WS = {
  status: "registry_storage/status",
  set: "registry_storage/set",
  repositories: "registry_storage/repositories",
  selfTest: "registry_storage/self_test",
  changePassword: "registry_storage/change_password",
  recordings: "registry_storage/recordings",
  restore: "registry_storage/restore",
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

/** The shortest password the lock accepts. The integration enforces it again. */
export const REGISTRY_PASSWORD_MIN_LENGTH = 14;

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
  used_bytes: number;
  waiting_files: number;
  waiting_bytes: number;
  backup_count: number;
  last_sent: { entity_id: string; at: number } | null;
  last_problem: { reason: string; at: number } | null;
}

export interface RegistryStatus {
  places: RegistryPlace[];
}

export interface RegistryChange {
  enabled?: boolean;
  /** Required by the server whenever a place is turned on. */
  video_leaves_home_confirmed?: boolean;
  send?: RegistrySendChoice;
  keep_days?: number | null;
}

export interface RegistryRepositoriesChange {
  default_repository?: string;
  /** Null sends a camera back to the default. */
  camera_repositories?: Record<string, string | null>;
  /** Null sends backups back to the default. */
  backups_repository?: string | null;
}

export interface RegistrySelfTestResult {
  ok: boolean;
  reason: string | null;
  seconds: number;
}

/** A recording stored in the registry. */
export interface RegistryRecording {
  id: string;
  entity_id: string;
  /** Epoch seconds. */
  start: number;
  duration: number;
  stored_size: number;
  /** True while a copy is still on this system. */
  local: boolean;
}

export type RegistryPlayState = "fetching" | "playing" | "done" | "failed";

export interface RegistryPlayback {
  state: RegistryPlayState;
  /** 0 to 1: how much of the file has arrived. */
  fetched: number;
  /** 0 to 1: how much has been played. */
  played: number;
}

type CallWS = Pick<HomeAssistant, "callWS">;

export const fetchRegistryStatus = (hass: CallWS) =>
  hass.callWS<RegistryStatus>({ type: REGISTRY_WS.status });

export const setRegistryPlace = (
  hass: CallWS,
  entryId: string,
  change: RegistryChange
) =>
  hass.callWS<RegistryStatus>({
    type: REGISTRY_WS.set,
    entry_id: entryId,
    ...change,
  });

export const setRegistryRepositories = (
  hass: CallWS,
  entryId: string,
  change: RegistryRepositoriesChange
) =>
  hass.callWS<RegistryStatus>({
    type: REGISTRY_WS.repositories,
    entry_id: entryId,
    ...change,
  });

export const runRegistrySelfTest = (hass: CallWS, entryId: string) =>
  hass.callWS<RegistrySelfTestResult>({
    type: REGISTRY_WS.selfTest,
    entry_id: entryId,
  });

export const changeRegistryPassword = (
  hass: CallWS,
  entryId: string,
  oldPassword: string,
  password: string,
  passwordConfirmation: string
) =>
  hass.callWS<undefined>({
    type: REGISTRY_WS.changePassword,
    entry_id: entryId,
    old_password: oldPassword,
    password,
    password_confirmation: passwordConfirmation,
  });

export const fetchRegistryRecordings = (
  hass: CallWS,
  entityId?: string,
  start?: number,
  end?: number
) =>
  hass.callWS<{ recordings: RegistryRecording[] }>({
    type: REGISTRY_WS.recordings,
    ...(entityId ? { entity_id: entityId } : {}),
    ...(start !== undefined ? { start } : {}),
    ...(end !== undefined ? { end } : {}),
  });

export const restoreRegistryRecording = (hass: CallWS, id: string) =>
  hass.callWS<undefined>({ type: REGISTRY_WS.restore, recording_id: id });

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

export const registryProblemKey = (reason: string): string =>
  (REGISTRY_PROBLEM_REASONS as readonly string[]).includes(reason)
    ? reason
    : "unexpected";

/** What the owner can do about a problem. */
export type RegistryProblemAdvice = "later" | "token" | "damaged" | "other";

export const registryProblemAdvice = (
  reason: string
): RegistryProblemAdvice => {
  switch (reason) {
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

/**
 * The camera map after one change: a blank or missing name sends the camera
 * back to the default, anything else gives it its own repository.
 */
export const withCameraRepository = (
  current: Record<string, string>,
  entityId: string,
  repository: string | null
): Record<string, string> => {
  const next = { ...current };
  const name = repository?.trim();
  if (name) {
    next[entityId] = name;
  } else {
    delete next[entityId];
  }
  return next;
};

/** A repository name looks like account/name, in lower case. */
export const isValidRepositoryName = (name: string): boolean =>
  /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/.test(name.trim());

export type PasswordRating =
  "empty" | "too_short" | "obvious" | "strong" | "very_strong";

const COMMON_PASSWORDS = [
  "password",
  "passw0rd",
  "123456",
  "qwerty",
  "letmein",
  "iloveyou",
  "admin",
  "welcome",
];

/**
 * A quick local estimate so the owner sees feedback while typing. The
 * integration runs the real rules again when the password is set.
 */
export const ratePassword = (password: string): PasswordRating => {
  if (!password) {
    return "empty";
  }
  if (password.length < REGISTRY_PASSWORD_MIN_LENGTH) {
    return "too_short";
  }
  const lower = password.toLowerCase();
  if (
    new Set(password).size < 5 ||
    COMMON_PASSWORDS.some(
      (word) => lower.includes(word) && password.length < 20
    )
  ) {
    return "obvious";
  }
  return password.length >= 20 || new Set(password).size >= 12
    ? "very_strong"
    : "strong";
};

export type PasswordFormProblem =
  "empty" | "too_short" | "obvious" | "mismatch" | "same_as_old" | "understand";

export interface PasswordFormValues {
  old_password?: string;
  password: string;
  password_confirmation: string;
  understand: boolean;
}

/**
 * The first reason the form cannot be submitted, or undefined when it can.
 * The old password is only checked when the form asks for one.
 */
export const passwordFormProblem = (
  values: PasswordFormValues,
  needsOld: boolean
): PasswordFormProblem | undefined => {
  if (needsOld && !values.old_password) {
    return "empty";
  }
  const rating = ratePassword(values.password);
  if (rating === "empty") {
    return "empty";
  }
  if (rating === "too_short") {
    return "too_short";
  }
  if (rating === "obvious") {
    return "obvious";
  }
  if (values.password !== values.password_confirmation) {
    return "mismatch";
  }
  if (needsOld && values.old_password === values.password) {
    return "same_as_old";
  }
  if (!values.understand) {
    return "understand";
  }
  return undefined;
};

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
