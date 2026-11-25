export type OnboardingPendingRestoreState =
  "queued" | "running" | "done" | "failed";

/** The restore queued during first start, as the Supervisor kept it. */
export interface OnboardingPendingRestore {
  name: string;
  state: OnboardingPendingRestoreState;
  error: string | null;
}

/**
 * Reads the restore queued while the system was preparing. Resolves to null
 * when there is none, and also when the server cannot say, because onboarding
 * must carry on with its ordinary welcome step in that case.
 */
export const fetchOnboardingPendingRestore =
  async (): Promise<OnboardingPendingRestore | null> => {
    try {
      const response = await fetch(
        `${__HASS_URL__}/api/onboarding/restore/pending`
      );
      if (!response.ok) {
        return null;
      }
      const body = (await response.json()) as {
        pending_restore?: OnboardingPendingRestore | null;
      };
      return body.pending_restore ?? null;
    } catch (_err) {
      return null;
    }
  };
