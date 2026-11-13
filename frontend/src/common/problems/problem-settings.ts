/** The person's settings for the problem detector, kept in this browser. */

export interface ProblemDetectorSettings {
  /** Outline problems where they are and show the badge. */
  enabled: boolean;
  /** Pulse the outline. Reduced motion always stops it. */
  pulse: boolean;
}

export const PROBLEM_SETTINGS_KEY = "problemDetectorSettings";
export const PROBLEM_SETTINGS_CHANGED_EVENT = "ha-problem-settings-changed";

export const DEFAULT_PROBLEM_SETTINGS: ProblemDetectorSettings = {
  enabled: true,
  pulse: true,
};

export const readProblemSettings = (): ProblemDetectorSettings => {
  try {
    const raw = window.localStorage.getItem(PROBLEM_SETTINGS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      enabled:
        typeof parsed.enabled === "boolean"
          ? parsed.enabled
          : DEFAULT_PROBLEM_SETTINGS.enabled,
      pulse:
        typeof parsed.pulse === "boolean"
          ? parsed.pulse
          : DEFAULT_PROBLEM_SETTINGS.pulse,
    };
  } catch (_err) {
    return { ...DEFAULT_PROBLEM_SETTINGS };
  }
};

export const writeProblemSettings = (
  settings: Partial<ProblemDetectorSettings>
): ProblemDetectorSettings => {
  const next = { ...readProblemSettings(), ...settings };
  try {
    window.localStorage.setItem(PROBLEM_SETTINGS_KEY, JSON.stringify(next));
  } catch (_err) {
    // Blocked storage: the change still applies until the page reloads.
  }
  window.dispatchEvent(
    new CustomEvent(PROBLEM_SETTINGS_CHANGED_EVENT, { detail: next })
  );
  return next;
};

/** True when motion should stop: the system setting or the app's own tool. */
export const motionReduced = (): boolean =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ||
  document.documentElement.hasAttribute("data-a11y-reduce-motion");
