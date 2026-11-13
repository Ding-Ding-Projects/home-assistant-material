/**
 * Brief feedback animation for a card gesture (tap, hold, double tap).
 *
 * The effect names are fixed; the duration comes from the theme motion token,
 * which collapses to a millisecond when the person asks for reduced motion, and
 * the system reduced-motion setting is checked as well. Nothing from the card
 * configuration is ever used as CSS text.
 */

export const FEEDBACK_EFFECTS = ["none", "scale", "ripple", "glow"] as const;

export type FeedbackEffect = (typeof FEEDBACK_EFFECTS)[number];

export const FEEDBACK_GESTURES = ["tap", "hold", "double_tap"] as const;

export type FeedbackGesture = (typeof FEEDBACK_GESTURES)[number];

/** The effect when the value is one of the known names, otherwise undefined. */
export const parseFeedbackEffect = (
  value: unknown
): FeedbackEffect | undefined =>
  typeof value === "string" &&
  (FEEDBACK_EFFECTS as readonly string[]).includes(value)
    ? (value as FeedbackEffect)
    : undefined;

/** A CSS time such as `250ms` or `0.25s` in milliseconds, or undefined. */
export const parseDurationMs = (
  value: string | undefined
): number | undefined => {
  const match = /^\s*(\d+(?:\.\d+)?|\.\d+)(ms|s)\s*$/.exec(value ?? "");
  if (!match) {
    return undefined;
  }
  const amount = Number(match[1]);
  return match[2] === "s" ? amount * 1000 : amount;
};

const RADIUS = "var(--ha-card-border-radius, var(--ha-border-radius-4xl))";

/** The keyframes of an effect, or undefined for none. */
export const feedbackKeyframes = (
  effect: FeedbackEffect
): Keyframe[] | undefined => {
  switch (effect) {
    case "scale":
      return [
        { transform: "scale(1)" },
        { transform: "scale(0.96)", offset: 0.4 },
        { transform: "scale(1)" },
      ];
    case "ripple":
      return [
        {
          borderRadius: RADIUS,
          boxShadow: "0 0 0 0 var(--primary-color)",
        },
        {
          borderRadius: RADIUS,
          boxShadow: "0 0 0 10px transparent",
        },
      ];
    case "glow":
      return [
        { borderRadius: RADIUS, boxShadow: "0 0 0 0 transparent" },
        {
          borderRadius: RADIUS,
          boxShadow: "0 0 18px 2px var(--primary-color)",
          offset: 0.4,
        },
        { borderRadius: RADIUS, boxShadow: "0 0 0 0 transparent" },
      ];
    default:
      return undefined;
  }
};

/**
 * Plays the effect once on the element. Does nothing for `none`, an unknown
 * name, reduced motion, or a collapsed duration token.
 */
export const playCardFeedback = (element: HTMLElement, value: unknown) => {
  const effect = parseFeedbackEffect(value);
  const keyframes = effect ? feedbackKeyframes(effect) : undefined;
  if (!keyframes || typeof element.animate !== "function") {
    return;
  }
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const duration = parseDurationMs(
    getComputedStyle(element).getPropertyValue("--ha-animation-duration-normal")
  );
  if (!duration || duration <= 1) {
    return;
  }
  element.animate(keyframes, { duration, easing: "ease-out" });
};
