import { css } from "lit";

/**
 * Shared expressive motion for components.
 *
 * Keyframes are only visible inside the tree scope that declares them, so
 * components that want the shared entrance animations include this fragment
 * in their own styles. Every duration comes from the theme duration tokens,
 * which collapse to 1ms when the person asks for reduced motion (system
 * setting or the accessibility tool), so nothing here needs its own
 * reduced-motion branch. The media query below is a second guard for the
 * system setting in case a token is overridden by a custom theme.
 */
export const haMotionKeyframes = css`
  @keyframes ha-rise {
    from {
      opacity: 0;
      transform: translateY(10px) scale(0.99);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @keyframes ha-pop {
    0% {
      opacity: 0;
      transform: scale(0.95);
    }
    60% {
      opacity: 1;
    }
    100% {
      transform: none;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    :host {
      --ha-animation-duration-enter: 1ms;
    }
  }
`;

/**
 * Transition shorthand shared by interactive surfaces: lift and colour
 * changes glide with the spring curve.
 */
export const haMotionTransition = css`
  transition:
    transform var(--ha-animation-duration-normal) var(--ha-motion-spring, ease),
    box-shadow var(--ha-animation-duration-normal) var(--ha-motion-ease, ease),
    background-color var(--ha-animation-duration-normal)
      var(--ha-motion-ease, ease),
    color var(--ha-animation-duration-normal) var(--ha-motion-ease, ease);
`;
