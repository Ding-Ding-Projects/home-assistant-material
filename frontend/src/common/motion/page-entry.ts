import { css } from "lit";
import { currentMotionLock } from "../appearance/motion-profiles";
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
  /* Phone: a compact title and 44 px round buttons, so the content below
     the header stays on screen. */
  :host([narrow]) .main-title .page-title,
  :host([narrow]) .main-title h1.page-title {
    font-size: 22px;
    font-weight: 700;
    font-stretch: 100%;
  }
  :host([narrow]) ha-icon-button-arrow-prev,
  :host([narrow]) ha-menu-button {
    width: 44px;
    height: 44px;
    --mdc-icon-button-size: 44px;
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
