import type { VocabularyError } from "./personal-vocabulary";
import {
  loadPersonalVocabulary,
  VOCABULARY_LIMITS,
} from "./personal-vocabulary";

export type WordingImportResult =
  | { ok: true; count: number }
  | { ok: false; error: VocabularyError | "unreadable" };

/** True for a dropped or chosen file that could be a wording file. */
export const looksLikeWordingFile = (file: File): boolean =>
  file.name.toLowerCase().endsWith(".json") || file.type === "application/json";

/**
 * Reads a file the person chose and loads it as personal wording. The size
 * is checked before the file is read. Nothing about the file is kept.
 */
export const importWordingFile = async (
  file: File
): Promise<WordingImportResult> => {
  if (file.size > VOCABULARY_LIMITS.bytes) {
    return { ok: false, error: "too_large" };
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (_err) {
    return { ok: false, error: "unreadable" };
  }
  const result = loadPersonalVocabulary(bytes);
  return result.ok
    ? { ok: true, count: result.count }
    : { ok: false, error: result.error };
};

const OVERLAY_ID = "ha-wording-overlay";

/**
 * Shows the short confirmation after a wording file loads. It sits above
 * everything for about three seconds, never takes input, and does not move
 * when reduced motion is on.
 */
export const showWordingOverlay = (title: string, detail: string): void => {
  document.getElementById(OVERLAY_ID)?.remove();
  const overlay = document.createElement("div");
  overlay.id = OVERLAY_ID;
  overlay.setAttribute("popover", "manual");
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.style.cssText = [
    "position: fixed",
    "inset: 0",
    "margin: auto",
    "width: min(420px, calc(100vw - 48px))",
    "height: fit-content",
    "padding: 40px 32px",
    "border: none",
    "border-radius: 28px",
    "background: #2b2d31",
    "color: #f1f2f6",
    "text-align: center",
    "font-family: var(--ha-font-family-body, sans-serif)",
    "box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35)",
    "pointer-events: none",
  ].join("; ");
  const badge = document.createElement("div");
  badge.textContent = "★";
  badge.setAttribute("aria-hidden", "true");
  badge.style.cssText =
    "width: 64px; height: 64px; margin: 0 auto 20px; border-radius: 20px; background: #ffdf7a; color: #5c4200; font-size: 32px; line-height: 64px";
  const heading = document.createElement("div");
  heading.textContent = title;
  heading.style.cssText =
    "font-size: 32px; line-height: 40px; font-weight: 500; margin-bottom: 12px";
  const body = document.createElement("div");
  body.textContent = detail;
  body.style.cssText = "font-size: 16px; line-height: 24px; opacity: 0.85";
  overlay.append(badge, heading, body);
  document.body.append(overlay);
  try {
    overlay.showPopover();
  } catch (_err) {
    // Without the popover API the element still shows, fixed in place.
  }
  const still =
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
    document.documentElement.hasAttribute("data-a11y-reduce-motion");
  if (!still && overlay.animate) {
    overlay.animate(
      [
        { opacity: 0, transform: "scale(0.96)" },
        { opacity: 1, transform: "scale(1)" },
      ],
      { duration: 180, easing: "ease-out" }
    );
  }
  window.setTimeout(() => overlay.remove(), 3000);
};
