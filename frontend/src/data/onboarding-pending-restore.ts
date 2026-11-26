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
  // The route is missing on a Core without it, or on one with no Supervisor:
  // there is nothing to show
  if (httpStatus === 404) {
    return { status: "none" };
  }
  if (httpStatus < 200 || httpStatus >= 300) {
    return { status: "unreachable" };
  }
  return body?.pending_restore
    ? { status: "record", restore: body.pending_restore }
    : { status: "none" };
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

/** Send a change; true when the server accepted it. */
const sendChange = async (
  method: "POST" | "DELETE",
  path: string,
  body: Record<string, unknown>
): Promise<boolean> => {
  try {
    const response = await fetch(`${__HASS_URL__}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return response.ok;
  } catch (_err) {
    return false;
  }
};

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
