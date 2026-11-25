import { css } from "lit";
import type { MotionKindId } from "../appearance/motion-profiles";
import {
  activeProfile,
  curveToCss,
  currentMotionLock,
  DURATION_MIN,
  effectiveCurve,
  effectiveDuration,
  getMotionSettings,
} from "../appearance/motion-profiles";
import type { ConfirmationDrama } from "../confirm/two-key-drama";
import { normalizeConfirmationDrama } from "../confirm/two-key-drama";
import { getPersonalPreferences } from "../preferences/personal-preferences";

/** The most content blocks that rise when a page is first shown. */
export const PAGE_ENTRY_MAX_ITEMS = 8;
/** Distance each block rises from, in pixels. */
export const PAGE_ENTRY_RISE_PX = 24;
/** Delay between one block and the next, in milliseconds. */
export const PAGE_ENTRY_STAGGER_MS = 60;
export const PAGE_ENTRY_DURATION_MS = 450;
export const PAGE_ENTRY_EASING = "cubic-bezier(.2, 1.5, .3, 1)";
/** The overshoot in the spring would push opacity past 1, so fades use this. */
const PAGE_ENTRY_FADE_EASING = "cubic-bezier(.2, 0, 0, 1)";

export interface PageEntryProfile {
  /** Whether anything moves or fades at all. */
  enabled: boolean;
  /** Pixels each block rises from; 0 for a fade only. */
  rise: number;
  /** Scale each block grows from; 1 for no scaling. */
  scale: number;
}

/**
 * How a page arrives for a given "Confirmation drama" choice: Off is no
 * motion, Calm fades only, Standard rises and Dramatic rises and grows a
 * little. Reduced motion always wins and switches everything off.
 */
export const pageEntryProfile = (
  drama: ConfirmationDrama,
  reducedMotion = false
): PageEntryProfile => {
  if (reducedMotion || drama === "off") {
    return { enabled: false, rise: 0, scale: 1 };
  }
  if (drama === "calm") {
    return { enabled: true, rise: 0, scale: 1 };
  }
  if (drama === "standard") {
    return { enabled: true, rise: PAGE_ENTRY_RISE_PX, scale: 1 };
  }
  return { enabled: true, rise: PAGE_ENTRY_RISE_PX, scale: 0.96 };
};

export const readDrama = (): ConfirmationDrama => {
  try {
    return normalizeConfirmationDrama(
      getPersonalPreferences().confirmationDrama
    );
  } catch (_err) {
    return normalizeConfirmationDrama(undefined);
  }
};

export const isReduced = (): boolean => {
  try {
    return currentMotionLock() !== undefined;
  } catch (_err) {
    return false;
  }
};

export interface MotionKindTiming {
  /** False when motion is off for this kind, as a whole or by a lock. */
  enabled: boolean;
  /** The duration the person's motion profile gives this kind, in ms. */
  duration: number;
  /** The curve the profile gives this kind, as CSS. */
  easing: string;
}

/**
 * How long, and with which curve, a kind of motion plays under the person's
 * animation settings. Reduced motion, the accessibility tool and low
 * stimulation switch every kind off, as does a kind switched off in the
 * motion editor.
 */
export const motionKindTiming = (
  kind: MotionKindId,
  reducedMotion: boolean = isReduced()
): MotionKindTiming => {
  try {
    const profile = activeProfile(getMotionSettings());
    const duration = effectiveDuration(profile, kind);
    return {
      enabled: !reducedMotion && duration > DURATION_MIN,
      duration,
      easing: curveToCss(effectiveCurve(profile, kind)),
    };
  } catch (_err) {
    return {
      enabled: !reducedMotion,
      duration: 450,
      easing: PAGE_ENTRY_EASING,
    };
  }
};

/**
 * Plays the staggered arrival on the first few blocks of a page. Call it once,
 * when the page is first shown. Returns the animations that were started.
 */
export const playPageEntry = (
  elements: Element[],
  drama: ConfirmationDrama = readDrama(),
  reducedMotion: boolean = isReduced()
): Animation[] => {
  const profile = pageEntryProfile(drama, reducedMotion);
  if (!profile.enabled) {
    return [];
  }
  const animations: Animation[] = [];
  elements.slice(0, PAGE_ENTRY_MAX_ITEMS).forEach((element, index) => {
    if (typeof element.animate !== "function") {
      return;
    }
    const from: Keyframe = { opacity: 0 };
    const to: Keyframe = { opacity: 1 };
    if (profile.rise || profile.scale !== 1) {
      from.transform = `translateY(${profile.rise}px) scale(${profile.scale})`;
      to.transform = "none";
    }
    const animation = element.animate([from, to], {
      duration: PAGE_ENTRY_DURATION_MS,
      delay: index * PAGE_ENTRY_STAGGER_MS,
      easing: profile.rise ? PAGE_ENTRY_EASING : PAGE_ENTRY_FADE_EASING,
      fill: "backwards",
    });
    animations.push(animation);
  });
  return animations;
};

/**
 * The page header both layouts share: a round tonal back pill, a heavy
 * widened title that wraps instead of clipping, and a soft tonal surface that
 * appears once the page has scrolled.
 */
export const pageHeaderStyles = css`
  .toolbar {
    transition: background-color 200ms ease;
  }
  /* Only the wide header is positioned: on a phone the bottom tab bar is
     placed against the page, not against the header. */
  :host(:not([narrow])) .toolbar {
    position: relative;
  }
  :host([scrolled]) .toolbar {
    background-color: var(
      --ha-header-scrolled-background,
      var(--md-sys-color-surface-container, var(--card-background-color))
    );
  }
  ha-icon-button-arrow-prev,
  ha-menu-button {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    --mdc-icon-button-size: 48px;
    background-color: var(
      --md-sys-color-secondary-container,
      var(--ha-color-fill-neutral-quiet-resting)
    );
    color: var(
      --md-sys-color-on-secondary-container,
      var(--primary-text-color)
    );
    transition:
      transform 250ms cubic-bezier(0.2, 1.5, 0.3, 1),
      background-color 150ms ease;
  }
  ha-icon-button-arrow-prev:hover,
  ha-menu-button:hover {
    transform: scale(1.06);
  }
  ha-icon-button-arrow-prev:active,
  ha-menu-button:active {
    transform: scale(0.94);
  }
  .main-title .page-title,
  .main-title h1.page-title {
    display: block;
    margin: 0;
    font: inherit;
    font-size: var(--ha-font-size-2xl);
    font-weight: 800;
    font-stretch: 116%;
    letter-spacing: -0.02em;
    line-height: var(--ha-line-height-condensed);
    color: var(--primary-text-color);
    overflow: visible;
    text-overflow: clip;
    white-space: normal;
    overflow-wrap: break-word;
    hyphens: none;
  }
  :host(:not([narrow])) .main-title .page-title {
    font-size: 32px;
  }
  /* A title in both languages: the separator and the second language wrap
     together onto the next line, and neither half breaks inside a word. */
  .main-title .page-title .title-alt {
    display: inline-block;
    max-width: 100%;
    word-break: keep-all;
    overflow-wrap: anywhere;
  }
  /* Phone: a compact title and 48 px round buttons, so the content below
     the header stays on screen. */
  :host([narrow]) .main-title .page-title,
  :host([narrow]) .main-title h1.page-title {
    font-size: 22px;
    font-weight: 700;
    font-stretch: 100%;
  }
  /* On a very narrow phone the room beside the buttons can be narrower than
     one long word at 22 px ("Integrations" at 320 px). The title then shrinks
     with the room it has, down to 16 px, so it wraps only at spaces and at
     the separator; a word breaks only when it is wider than the whole line
     even at the smallest size. */
  :host([narrow]) .main-title {
    container-type: inline-size;
  }
  @supports (font-size: 1cqi) {
    :host([narrow]) .main-title .page-title,
    :host([narrow]) .main-title h1.page-title {
      font-size: clamp(16px, 14.5cqi, 22px);
    }
  }
  :host([narrow]) ha-icon-button-arrow-prev,
  :host([narrow]) ha-menu-button {
    width: 48px;
    height: 48px;
    --mdc-icon-button-size: 48px;
  }
  @media (prefers-reduced-motion: reduce) {
    .toolbar,
    ha-icon-button-arrow-prev,
    ha-menu-button {
      transition: none;
    }
    ha-icon-button-arrow-prev:hover,
    ha-menu-button:hover,
    ha-icon-button-arrow-prev:active,
    ha-menu-button:active {
      transform: none;
    }
  }
`;
