import type { ConfirmationDrama } from "../confirm/two-key-drama";
import { isReduced, readDrama } from "./page-entry";

/**
 * The few moments where something real happened and a little drama is
 * welcome: a count changed, a save went through, a row was deleted, an update
 * finished, something failed. Each one plays once, uses only `transform`,
 * `opacity` and `stroke-dashoffset`, never loops and never follows scrolling.
 *
 * The strength follows the "Confirmation drama" preference the page entry
 * uses: Off plays nothing, Calm only changes opacity, Standard moves and
 * Dramatic moves a little further. Reduced motion always plays nothing.
 */

/** The spring easing every moment shares. */
export const MOMENT_SPRING = "cubic-bezier(.2, 1.5, .3, 1)";

export type MomentMode = "none" | "fade" | "move";

export interface MomentProfile {
  mode: MomentMode;
  /** 1 for Standard, more for Dramatic. */
  strength: number;
}

export const momentProfile = (
  drama: ConfirmationDrama,
  reducedMotion = false
): MomentProfile => {
  if (reducedMotion || drama === "off") {
    return { mode: "none", strength: 0 };
  }
  if (drama === "calm") {
    return { mode: "fade", strength: 0 };
  }
  return { mode: "move", strength: drama === "dramatic" ? 1.3 : 1 };
};

export const currentMomentProfile = (): MomentProfile =>
  momentProfile(readDrama(), isReduced());

const canAnimate = (element: Element | null | undefined): element is Element =>
  !!element && typeof element.animate === "function";

/** A count changed: the numeral swells, tilts a little and settles. */
export const playCountPop = (
  element: Element | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Animation | undefined => {
  if (!canAnimate(element) || profile.mode === "none") {
    return undefined;
  }
  if (profile.mode === "fade") {
    return element.animate([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: 300,
      easing: "ease-out",
    });
  }
  const swell = 1 + 0.5 * profile.strength;
  return element.animate(
    [
      { transform: "none" },
      {
        transform: `scale(${swell}) rotate(${4 * profile.strength}deg)`,
        offset: 0.35,
      },
      { transform: "none" },
    ],
    { duration: 600, easing: MOMENT_SPRING }
  );
};

/** Draws a tick path by stroke, once. The path needs a known length. */
export const playTickDraw = (
  path: SVGGeometryElement | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Animation | undefined => {
  if (!canAnimate(path) || profile.mode === "none") {
    return undefined;
  }
  if (profile.mode === "fade") {
    return path.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 250,
      easing: "ease-out",
    });
  }
  const length = path.getTotalLength?.() ?? 24;
  return path.animate(
    [
      { strokeDasharray: `${length}`, strokeDashoffset: `${length}` },
      { strokeDasharray: `${length}`, strokeDashoffset: "0" },
    ],
    { duration: 450, easing: "cubic-bezier(.2, 0, 0, 1)", fill: "backwards" }
  );
};

/** A tile pops once, for example a saved button. */
export const playTilePop = (
  element: Element | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Animation | undefined => {
  if (!canAnimate(element) || profile.mode !== "move") {
    return undefined;
  }
  return element.animate(
    [
      { transform: "scale(.9)" },
      { transform: `scale(${1 + 0.08 * profile.strength})`, offset: 0.55 },
      { transform: "none" },
    ],
    { duration: 500, easing: MOMENT_SPRING }
  );
};

/**
 * An error: one firm sideways shake. The caller changes the colour and says
 * in words what happened; this only moves the element.
 */
export const playShake = (
  element: Element | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Animation | undefined => {
  if (!canAnimate(element) || profile.mode === "none") {
    return undefined;
  }
  if (profile.mode === "fade") {
    return element.animate([{ opacity: 0.5 }, { opacity: 1 }], {
      duration: 300,
      easing: "ease-out",
    });
  }
  const d = 8 * profile.strength;
  return element.animate(
    [
      { transform: "none" },
      { transform: `translateX(${-d}px)`, offset: 0.15 },
      { transform: `translateX(${d}px)`, offset: 0.35 },
      { transform: `translateX(${-d * 0.6}px)`, offset: 0.55 },
      { transform: `translateX(${d * 0.4}px)`, offset: 0.75 },
      { transform: "none" },
    ],
    { duration: 500, easing: "ease-out" }
  );
};

/**
 * One soft flash and one ring that leaves, for an update that finished. The
 * flash uses opacity on an overlay the caller provides, the ring scales and
 * fades out.
 */
export const playRingFlash = (
  ring: Element | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Animation | undefined => {
  if (!canAnimate(ring) || profile.mode === "none") {
    return undefined;
  }
  if (profile.mode === "fade") {
    return ring.animate([{ opacity: 0.4 }, { opacity: 1 }], {
      duration: 400,
      easing: "ease-out",
    });
  }
  return ring.animate(
    [
      { transform: "scale(1)", opacity: 1 },
      {
        transform: `scale(${1 + 0.35 * profile.strength})`,
        opacity: 1,
        offset: 0.3,
      },
      { transform: "scale(1)", opacity: 1 },
    ],
    { duration: 1200, easing: MOMENT_SPRING }
  );
};

/**
 * A deleted row closes: it shudders, slides away and its height closes, so
 * the rows below move up. Resolves once it is gone, so the caller can remove
 * it from its data afterwards. With no motion it resolves at once.
 */
export const collapseRow = async (
  row: HTMLElement | null | undefined,
  profile: MomentProfile = currentMomentProfile()
): Promise<void> => {
  if (!canAnimate(row) || profile.mode === "none") {
    return;
  }
  const rect = row.getBoundingClientRect();
  if (!rect.height) {
    return;
  }
  const keyframes: Keyframe[] =
    profile.mode === "fade"
      ? [{ opacity: 1 }, { opacity: 0 }]
      : [
          {
            opacity: 1,
            transform: "none",
            height: `${rect.height}px`,
            marginBlock: getComputedStyle(row).marginBlock,
            offset: 0,
          },
          { opacity: 1, transform: "translateX(-6px)", offset: 0.15 },
          { opacity: 1, transform: "translateX(5px)", offset: 0.3 },
          {
            opacity: 0,
            transform: "translateX(40px)",
            height: `${rect.height}px`,
            offset: 0.6,
          },
          {
            opacity: 0,
            transform: "translateX(40px)",
            height: "0px",
            marginBlock: "0px",
            offset: 1,
          },
        ];
  const style = row.style;
  const previousOverflow = style.overflow;
  style.overflow = "hidden";
  try {
    await row.animate(keyframes, {
      duration: profile.mode === "fade" ? 160 : 420,
      easing: "cubic-bezier(.3, 0, .2, 1)",
      fill: "forwards",
    }).finished;
  } catch (_err) {
    // A cancelled animation still lets the delete go ahead.
  } finally {
    style.overflow = previousOverflow;
  }
};
