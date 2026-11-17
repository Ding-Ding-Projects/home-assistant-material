import type { DramaProfile } from "./two-key-drama";

/**
 * The moment of confirmation: one white flash and two shockwave rings that
 * spread from the core of the two-key control.
 *
 * It plays on its own fixed layer, not inside the dialog, so it keeps going
 * after the dialog has closed. The layer ignores the pointer, is hidden from
 * screen readers, only animates transform and opacity, and removes itself
 * when the last animation ends. It never delays or blocks anything.
 */

export const FLASH_MS = 500;
export const BLAST_MS = 900;
export const BLAST_SECOND_MS = 1200;
export const BLAST_SECOND_DELAY_MS = 120;

/** The longest any part of the effect lasts, including the delay. */
export const EFFECT_TOTAL_MS = BLAST_SECOND_MS + BLAST_SECOND_DELAY_MS;

export interface ConfirmEffectOptions {
  /** Where the shockwaves start, in viewport pixels. */
  origin: { x: number; y: number };
  /** Colour of the first ring. */
  ringColor: string;
  /** Colour of the second ring and the flash. */
  lightColor: string;
  profile: DramaProfile;
}

const BASE_RING = 200;

const ring = (
  layer: HTMLElement,
  options: ConfirmEffectOptions,
  border: string,
  color: string
): HTMLDivElement => {
  const element = document.createElement("div");
  Object.assign(element.style, {
    position: "absolute",
    left: `${options.origin.x - BASE_RING / 2}px`,
    top: `${options.origin.y - BASE_RING / 2}px`,
    width: `${BASE_RING}px`,
    height: `${BASE_RING}px`,
    boxSizing: "border-box",
    borderRadius: "50%",
    border: `${border} solid ${color}`,
    opacity: "0",
    willChange: "transform, opacity",
  });
  layer.appendChild(element);
  return element;
};

/**
 * Plays the effect. Returns false when the profile allows none of it, so the
 * caller knows nothing was drawn.
 */
export const playConfirmEffect = (options: ConfirmEffectOptions): boolean => {
  const { profile } = options;
  if (
    (!profile.flash && !profile.shockwave) ||
    typeof document === "undefined" ||
    typeof Element.prototype.animate !== "function"
  ) {
    return false;
  }
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  Object.assign(layer.style, {
    position: "fixed",
    inset: "0",
    width: "100%",
    height: "100%",
    margin: "0",
    padding: "0",
    border: "0",
    overflow: "hidden",
    background: "transparent",
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  // A modal dialog sits in the top layer, above anything fixed. A popover
  // shown after it sits above the dialog.
  layer.setAttribute("popover", "manual");
  document.body.appendChild(layer);
  try {
    (layer as HTMLElement & { showPopover?: () => void }).showPopover?.();
  } catch (_err) {
    // Without popover support the fixed layer is still drawn.
  }

  let running = 0;
  const finish = () => {
    running -= 1;
    if (running <= 0) {
      try {
        (layer as HTMLElement & { hidePopover?: () => void }).hidePopover?.();
      } catch (_err) {
        // Already hidden.
      }
      layer.remove();
    }
  };
  const run = (
    element: HTMLElement,
    frames: Keyframe[],
    timing: number,
    delay = 0,
    easing = "ease-out"
  ) => {
    running += 1;
    const animation = element.animate(frames, {
      duration: timing,
      delay,
      easing,
      fill: "both",
    });
    animation.addEventListener("finish", finish);
    animation.addEventListener("cancel", finish);
  };

  if (profile.flash) {
    const flash = document.createElement("div");
    Object.assign(flash.style, {
      position: "absolute",
      inset: "0",
      background: options.lightColor,
      opacity: "0",
      willChange: "opacity",
    });
    layer.appendChild(flash);
    run(flash, [{ opacity: 0.9 }, { opacity: 0 }], FLASH_MS);
  }
  if (profile.shockwave) {
    const first = ring(layer, options, "10px", options.ringColor);
    run(
      first,
      [
        { transform: "scale(0.2)", opacity: 1 },
        { transform: "scale(9)", opacity: 0 },
      ],
      BLAST_MS,
      0,
      "cubic-bezier(.1,.7,.2,1)"
    );
    const second = ring(layer, options, "6px", options.lightColor);
    run(
      second,
      [
        { transform: "scale(0.2)", opacity: 0.9 },
        { transform: "scale(9)", opacity: 0 },
      ],
      BLAST_SECOND_MS,
      BLAST_SECOND_DELAY_MS,
      "cubic-bezier(.1,.7,.2,1)"
    );
  }
  if (running === 0) {
    layer.remove();
    return false;
  }
  return true;
};
