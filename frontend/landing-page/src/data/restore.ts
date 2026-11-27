import type { HassioResponse } from "../../../src/data/hassio/common";

/** What the Supervisor keeps about a restore that waits for Core to be installed. */
export type PendingRestoreState = "queued" | "running" | "done" | "failed";

export interface PendingRestore {
  slug: string;
  name: string;
  size_bytes: number;
  protected: boolean;
  state: PendingRestoreState;
  queued_at: string;
  started_at: string | null;
  finished_at: string | null;
  job_id: string | null;
  error: string | null;
}

export interface UploadedBackup {
  slug: string;
  name: string;
  date: string;
  size_bytes: number;
  protected: boolean;
  homeassistant: string | null;
  apps: { slug: string; name: string }[];
  folders: string[];
}

/**
 * The info route the landing page reaches is the Supervisor's first version,
 * which calls the apps "addons". Both shapes are accepted.
 */
interface RawUploadedBackup extends Omit<UploadedBackup, "apps"> {
  apps?: { slug: string; name: string }[];
  addons?: { slug: string; name: string }[];
}

export const normalizeUploadedBackup = (
  raw: RawUploadedBackup
): UploadedBackup => ({
  ...raw,
  apps: raw.apps ?? raw.addons ?? [],
  folders: raw.folders ?? [],
});

export class RestoreApiError extends Error {
  public constructor(
    message: string,
    public readonly status: number
  ) {
    super(message);
  }
}

const parse = async <T>(response: Response): Promise<T> => {
  let body: Partial<HassioResponse<T>> = {};
  try {
    body = await response.json();
  } catch (_err) {
    // Not JSON, the status tells enough
  }
  if (!response.ok || body.result === "error") {
    throw new RestoreApiError(
      body.message || response.statusText || "Request failed",
      response.status
    );
  }
  return body.data as T;
};

// A page on another site cannot add a custom header without a preflight
// request, which the landing page server never approves. Every request that
// changes something carries it.
const CHANGE_HEADERS = {
  "Content-Type": "application/json",
  "X-Requested-With": "landing-page",
};

const post = (path: string, body?: unknown) =>
  fetch(`/supervisor-api/${path}`, {
    method: "POST",
    headers: CHANGE_HEADERS,
    body: JSON.stringify(body ?? {}),
  });

export const getPendingRestore = async (): Promise<PendingRestore | null> =>
  (
    await parse<{ pending_restore: PendingRestore | null }>(
      await fetch("/supervisor-api/backups/restore/pending")
    )
  ).pending_restore;

export const clearPendingRestore = async (
  removeBackup = false
): Promise<void> => {
  await parse(
    await fetch("/supervisor-api/backups/restore/pending", {
      method: "DELETE",
      headers: CHANGE_HEADERS,
      body: JSON.stringify({ remove_backup: removeBackup }),
    })
  );
};

/** Removes a backup that was uploaded but never queued. */
export const discardUploadedBackup = async (slug: string): Promise<void> => {
  await parse(
    await fetch("/supervisor-api/backups/restore/pending", {
      method: "DELETE",
      headers: CHANGE_HEADERS,
      body: JSON.stringify({ slug }),
    })
  );
};

export const getUploadedBackup = async (
  slug: string
): Promise<UploadedBackup> =>
  normalizeUploadedBackup(
    await parse<RawUploadedBackup>(
      await fetch(`/supervisor-api/backups/${slug}/info`)
    )
  );

export const checkBackupPassword = async (
  slug: string,
  password: string
): Promise<void> => {
  await parse(await post(`backups/${slug}/check_password`, { password }));
};

export const queueBackupRestore = async (
  slug: string,
  password?: string
): Promise<PendingRestore> =>
  parse(
    await post(
      `backups/${slug}/restore/full/when_ready`,
      password ? { password } : {}
    )
  );

export interface UploadProgress {
  loaded: number;
  total: number;
}

export interface BackupUpload {
  result: Promise<string>;
  abort: () => void;
}

/** Streams the file to the Supervisor; fetch cannot report upload progress. */
export const uploadBackup = (
  file: File,
  onProgress: (progress: UploadProgress) => void
): BackupUpload => {
  const xhr = new XMLHttpRequest();
  const result = new Promise<string>((resolve, reject) => {
    xhr.open("POST", "/supervisor-api/backups/new/upload");
    xhr.setRequestHeader("X-Requested-With", "landing-page");
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) {
        onProgress({ loaded: ev.loaded, total: ev.total });
      }
    };
    xhr.onload = () => {
      let body: Partial<HassioResponse<{ slug: string }>> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch (_err) {
        // Not JSON
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.data?.slug) {
        resolve(body.data.slug);
      } else {
        reject(new RestoreApiError(body.message || xhr.statusText, xhr.status));
      }
    };
    xhr.onerror = () => reject(new RestoreApiError("Network error", 0));
    xhr.onabort = () => reject(new RestoreApiError("aborted", 0));
    const form = new FormData();
    form.append("file", file);
    xhr.send(form);
  });
  return { result, abort: () => xhr.abort() };
};

export type StepState =
  "done" | "active" | "waiting" | "failed" | "not_started";

export interface RestoreStep {
  id: "prepare" | "restore" | "start" | "ready";
  state: StepState;
  /** 0 to 100 while the step is active and its progress is known. */
  progress?: number;
}

export interface RestoreSnapshot {
  pending: Pick<PendingRestore, "state">;
  /** Progress of the Core install job, or -1 when it is not running. */
  coreProgress: number;
  /** Progress of the restore job, or undefined before it exists. */
  restoreProgress?: number;
}

/**
 * The four steps shown while a restore is queued. Preparing is done once Core
 * is installed (the restore only starts then), and the last step opens by
 * itself when Core answers, which reloads the page.
 */
export const computeRestoreSteps = ({
  pending,
  coreProgress,
  restoreProgress,
}: RestoreSnapshot): RestoreStep[] => {
  const restoreStarted = pending.state !== "queued";
  const failed = pending.state === "failed";
  const finished = pending.state === "done";

  return [
    restoreStarted
      ? { id: "prepare", state: "done" }
      : {
          id: "prepare",
          state: "active",
          progress: coreProgress >= 0 ? coreProgress : undefined,
        },
    failed
      ? { id: "restore", state: "failed" }
      : finished
        ? { id: "restore", state: "done" }
        : restoreStarted
          ? { id: "restore", state: "active", progress: restoreProgress }
          : { id: "restore", state: "waiting" },
    finished
      ? { id: "start", state: "active" }
      : { id: "start", state: failed ? "not_started" : "waiting" },
    { id: "ready", state: failed ? "not_started" : "waiting" },
  ];
};

/**
 * Speed in bytes a second and whole seconds left, from the upload so far.
 * Both are undefined until there is a speed to work from.
 */
export const uploadRate = (
  loaded: number,
  total: number,
  elapsedMs: number
): { bytesPerSecond?: number; secondsLeft?: number } => {
  const bytesPerSecond =
    elapsedMs > 0 ? Math.round((loaded / elapsedMs) * 1000) : 0;
  if (bytesPerSecond <= 0) {
    return {};
  }
  return {
    bytesPerSecond,
    secondsLeft: Math.max(0, Math.ceil((total - loaded) / bytesPerSecond)),
  };
};

/** A time in 24 hour form, "13:42". */
export const formatClock = (iso: string, language: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(language, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};

/** Names for the folders a backup can hold, in the order they are shown. */
export const FOLDER_ORDER = [
  "media",
  "share",
  "ssl",
  "apps/local",
  "addons/local",
] as const;
