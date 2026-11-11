import { css, unsafeCSS } from "lit";

/**
 * Shared motion for the automation and script editors.
 *
 * Durations come from the `--ha-animation-duration-*` tokens. Both the system
 * reduced-motion preference (core theme globals) and the product's own reduce
 * motion setting (`html[data-a11y-reduce-motion]`) collapse those tokens to
 * 1ms, so every animation here becomes effectively instant under either. Only
 * `opacity` and `transform` are animated.
 */

// Material 3 easing: emphasized decelerate for entering, accelerate for leaving.
export const MOTION_ENTER_EASING = "cubic-bezier(0.05, 0.7, 0.1, 1)";
export const MOTION_EXIT_EASING = "cubic-bezier(0.3, 0, 0.8, 0.15)";
export const MOTION_STANDARD_EASING = "cubic-bezier(0.2, 0, 0, 1)";

export const MOTION_ENTERING_ATTRIBUTE = "motion-entering";

/** Keyframes and easing tokens, included once by every styled surface. */
export const motionKeyframes = css`
  :host {
    --ha-automation-ease-enter: ${unsafeCSS(MOTION_ENTER_EASING)};
    --ha-automation-ease-exit: ${unsafeCSS(MOTION_EXIT_EASING)};
    --ha-automation-ease-standard: ${unsafeCSS(MOTION_STANDARD_EASING)};
  }
  @keyframes ha-automation-enter {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes ha-automation-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
  @keyframes ha-automation-slide-in-end {
    from {
      opacity: 0;
      transform: translateX(calc(24px * var(--scale-direction, 1)));
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
`;

/** A small appear animation for messages and warnings. */
export const motionAppearStyles = css`
  span.motion-appear {
    display: inline-block;
  }
  .motion-appear {
    animation: ha-automation-enter var(--ha-animation-duration-normal, 250ms)
      var(--ha-automation-ease-enter, ${unsafeCSS(MOTION_ENTER_EASING)}) both;
  }
`;

/** Alerts (warnings, "can never run", save errors) appear with a short fade. */
export const motionAlertStyles = css`
  ${motionKeyframes}
  ha-alert {
    animation: ha-automation-enter var(--ha-animation-duration-normal, 250ms)
      var(--ha-automation-ease-enter, ${unsafeCSS(MOTION_ENTER_EASING)})
      backwards;
  }
`;
