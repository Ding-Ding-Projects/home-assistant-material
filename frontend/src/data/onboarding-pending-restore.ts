export type OnboardingPendingRestoreState =
  "queued" | "running" | "done" | "failed";

/** The restore queued during first start, as the Supervisor kept it. */
export interface OnboardingPendingRestore {
  name: string;
  state: OnboardingPendingRestoreState;
  error: string | null;
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

export const fetchOnboardingPendingRestore =
  async (): Promise<OnboardingPendingRestoreResult> => {
    try {
      const response = await fetch(
        `${__HASS_URL__}/api/onboarding/restore/pending`
      );
      // The route is missing on a Core without it: there is nothing to show
      if (response.status === 404) {
        return { status: "none" };
      }
      if (!response.ok) {
        return { status: "unreachable" };
      }
      const body = (await response.json()) as {
        pending_restore?: OnboardingPendingRestore | null;
      };
      return body.pending_restore
        ? { status: "record", restore: body.pending_restore }
        : { status: "none" };
    } catch (_err) {
      return { status: "unreachable" };
    }
  };
