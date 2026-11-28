export type OnboardingPendingRestoreState =
  "queued" | "running" | "done" | "failed";

/** The restore queued during first start, as the Supervisor kept it. */
export interface OnboardingPendingRestore {
  name: string;
  state: OnboardingPendingRestoreState;
  error: string | null;
  /** The backup needs its encryption key to be tried again. */
  protected?: boolean;
}

/**
 * What the server said about a queued restore. "unreachable" is not the same
 * as "none": a full restore stops Core on purpose, so the answer is missing
 * while the restore runs and the caller must keep what it last knew.
 */
export type OnboardingPendingRestoreResult =
  | { status: "none" }
  | { status: "unreachable" }
  | { status: "record"; restore: OnboardingPendingRestore };

/** Turn the server's answer into a result; kept apart from fetch to test it. */
export const interpretPendingRestoreResponse = (
  httpStatus: number,
  body: { pending_restore?: OnboardingPendingRestore | null } | undefined
): OnboardingPendingRestoreResult => {
  // Core closes this public route once owner setup advances (401).
  // Installations without the route or Supervisor answer 404.
  if (httpStatus === 401 || httpStatus === 404) {
    return { status: "none" };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { status: "unreachable" };
  }
  return body?.pending_restore
    ? { status: "record", restore: body.pending_restore }
    : { status: "none" };
};

/** Poll until Core has answered, and while the restore is active. */
export const pendingRestorePollDelay = (
  result: OnboardingPendingRestoreResult,
  misses: number
): number | undefined => {
  if (result.status === "unreachable") {
    return 3000 * 2 ** Math.min(misses, 3);
  }
  if (
    result.status === "record" &&
    (result.restore.state === "queued" || result.restore.state === "running")
  ) {
    return 3000;
  }
  return undefined;
};

export const fetchOnboardingPendingRestore =
  async (): Promise<OnboardingPendingRestoreResult> => {
    try {
      const response = await fetch(
        `${__HASS_URL__}/api/onboarding/restore/pending`
      );
      const body = response.ok ? await response.json() : undefined;
      return interpretPendingRestoreResponse(response.status, body);
    } catch (_err) {
      return { status: "unreachable" };
    }
  };

/** Send a change; the HTTP status, or 0 when the server could not be reached. */
const sendChange = async (
  method: "POST" | "DELETE",
  path: string,
  body: Record<string, unknown>
): Promise<number> => {
  try {
    const response = await fetch(`${__HASS_URL__}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.status;
  } catch (_err) {
    return 0;
  }
};

/** True for a successful HTTP status from a change. */
export const isChangeAccepted = (status: number) =>
  status >= 200 && status < 300;

/** Run the failed restore again, with its key when the backup is protected. */
export const retryOnboardingPendingRestore = (password?: string) =>
  sendChange("POST", "/api/onboarding/restore/pending/retry", {
    ...(password ? { password } : {}),
  });

/** Drop the restore, and the uploaded backup with it. */
export const discardOnboardingPendingRestore = () =>
  sendChange("DELETE", "/api/onboarding/restore/pending", {
    remove_backup: true,
  });
