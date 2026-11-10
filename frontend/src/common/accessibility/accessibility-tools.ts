import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { getStorage } from "../decorators/storage";
import { isNotShown } from "../dom/is-not-shown";

/**
 * Accessibility tools: text size, contrast, motion, a focus ring that follows
 * the focused control, larger targets and reading the page aloud.
 *
 * The choices live in this browser's storage and are applied to the document
 * element as attributes. A stylesheet in the document head turns the
 * attributes into theme variables, which inherit into every component.
 */

export const ACCESSIBILITY_STORAGE_KEY = "accessibilityTools";

export type AccessibilityContrast = "standard" | "more" | "most";

export interface AccessibilitySettings {
  textScale: number;
  contrast: AccessibilityContrast;
  reduceMotion: boolean;
  showFocus: boolean;
  largerTargets: boolean;
  hideButton: boolean;
}

export const TEXT_SCALE_STEPS = [1, 1.1, 1.25, 1.5, 1.75, 2];

export const DEFAULT_ACCESSIBILITY_SETTINGS: AccessibilitySettings = {
  textScale: 1,
  contrast: "standard",
  reduceMotion: false,
  showFocus: false,
  largerTargets: false,
  hideButton: false,
};

export const normalizeAccessibilitySettings = (
  stored?: Partial<AccessibilitySettings> | null
): AccessibilitySettings => {
  const settings = { ...DEFAULT_ACCESSIBILITY_SETTINGS, ...(stored || {}) };
  if (!TEXT_SCALE_STEPS.includes(settings.textScale)) {
    settings.textScale = 1;
  }
  if (!["standard", "more", "most"].includes(settings.contrast)) {
    settings.contrast = "standard";
  }
  return settings;
};

/** The stored choices, as they are now. */
export const getAccessibilitySettings = (): AccessibilitySettings =>
  normalizeAccessibilitySettings(
    getStorage().getValue<Partial<AccessibilitySettings>>(
      ACCESSIBILITY_STORAGE_KEY
    )
  );

/**
 * Calls back when the stored choices change, in this tab or another. The
 * storage decorator can subscribe one field per element, so elements that
 * already use it for something else subscribe here.
 */
export const subscribeAccessibilitySettings = (
  callback: (settings: AccessibilitySettings) => void
): UnsubscribeFunc =>
  getStorage().subscribeChanges(ACCESSIBILITY_STORAGE_KEY, () =>
    callback(getAccessibilitySettings())
  );

const STYLE_ID = "ha-accessibility-tools";

const STYLES = `
${TEXT_SCALE_STEPS.filter((step) => step !== 1)
  .map(
    (step) => `html[data-a11y-scale="${step}"] {
  --ha-font-size-scale: ${step} !important;
  font-size: ${14 * step}px !important;
}`
  )
  .join("\n")}
html[data-a11y-contrast="more"] {
  --ha-color-text-secondary: #2b3036 !important;
  --secondary-text-color: #2b3036 !important;
  --disabled-text-color: #6b6b6b !important;
  --primary-color: #004a76 !important;
  --divider-color: rgba(0, 0, 0, 0.45) !important;
  --outline-color: rgba(0, 0, 0, 0.6) !important;
  --outline-hover-color: rgba(0, 0, 0, 0.87) !important;
  --ha-card-border-width: 1px !important;
  --ha-card-border-color: rgba(0, 0, 0, 0.45) !important;
}
html[data-a11y-contrast="more"][data-a11y-dark] {
  --ha-color-text-primary: #ffffff !important;
  --primary-text-color: #ffffff !important;
  --ha-color-text-secondary: #d5d9e0 !important;
  --secondary-text-color: #d5d9e0 !important;
  --disabled-text-color: #9a9a9a !important;
  --primary-color: #9ccbff !important;
  --divider-color: rgba(255, 255, 255, 0.5) !important;
  --outline-color: rgba(255, 255, 255, 0.6) !important;
  --outline-hover-color: rgba(255, 255, 255, 0.87) !important;
  --ha-card-border-color: rgba(255, 255, 255, 0.5) !important;
}
html[data-a11y-contrast="most"] {
  --ha-color-text-primary: #000000 !important;
  --primary-text-color: #000000 !important;
  --rgb-primary-text-color: 0, 0, 0 !important;
  --ha-color-text-secondary: #000000 !important;
  --secondary-text-color: #000000 !important;
  --rgb-secondary-text-color: 0, 0, 0 !important;
  --disabled-text-color: #595959 !important;
  --primary-color: #003c61 !important;
  --rgb-primary-color: 0, 60, 97 !important;
  --ha-color-window: #ffffff !important;
  --primary-background-color: #ffffff !important;
  --card-background-color: #ffffff !important;
  --rgb-card-background-color: 255, 255, 255 !important;
  --secondary-background-color: #ffffff !important;
  --clear-background-color: #ffffff !important;
  --divider-color: #000000 !important;
  --outline-color: #000000 !important;
  --outline-hover-color: #000000 !important;
  --ha-card-border-width: 2px !important;
  --ha-card-border-color: #000000 !important;
  --ha-pane-outline: 2px solid #000000;
}
html[data-a11y-contrast="most"][data-a11y-dark] {
  --ha-color-text-primary: #ffffff !important;
  --primary-text-color: #ffffff !important;
  --rgb-primary-text-color: 255, 255, 255 !important;
  --ha-color-text-secondary: #ffffff !important;
  --secondary-text-color: #ffffff !important;
  --rgb-secondary-text-color: 255, 255, 255 !important;
  --disabled-text-color: #b0b0b0 !important;
  --primary-color: #9ccbff !important;
  --rgb-primary-color: 156, 203, 255 !important;
  --text-primary-color: #000000 !important;
  --ha-color-window: #000000 !important;
  --primary-background-color: #000000 !important;
  --card-background-color: #000000 !important;
  --rgb-card-background-color: 0, 0, 0 !important;
  --secondary-background-color: #000000 !important;
  --clear-background-color: #000000 !important;
  --divider-color: #ffffff !important;
  --outline-color: #ffffff !important;
  --outline-hover-color: #ffffff !important;
  --ha-card-border-color: #ffffff !important;
  --ha-pane-outline: 2px solid #ffffff;
}
html[data-a11y-reduce-motion] {
  --ha-animation-duration-instant: 1ms !important;
  --ha-animation-duration-fast: 1ms !important;
  --ha-animation-duration-normal: 1ms !important;
  --ha-animation-duration-slow: 1ms !important;
  scroll-behavior: auto !important;
}
html[data-a11y-larger-targets] {
  --ha-icon-button-size: 56px !important;
  --ha-button-height: 56px !important;
  --ha-page-tab-height: 48px;
}
#ha-accessibility-focus-ring {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  border: 3px solid var(--primary-color, #00639b);
  border-radius: 10px;
  background: transparent;
  box-shadow:
    0 0 0 2px var(--primary-background-color, #ffffff),
    0 0 0 5px var(--primary-text-color, #181c20);
  pointer-events: none;
  overflow: visible;
  box-sizing: border-box;
}
`;

const ensureStyles = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = STYLES;
  document.head.appendChild(style);
};

/**
 * A ring drawn around the focused control. Focus styles inside components
 * cannot be changed from outside, so the ring is its own element: it reads
 * the focused element through shadow roots and follows it. It is shown as a
 * manual popover so it also sits above dialogs.
 */
class FocusRing {
  private _ring?: HTMLElement;

  private _target?: Element;

  private _frame?: number;

  private _enabled = false;

  public setEnabled(enabled: boolean) {
    if (enabled === this._enabled) {
      return;
    }
    this._enabled = enabled;
    if (enabled) {
      window.addEventListener("focusin", this._focusIn, true);
      window.addEventListener("focusout", this._focusOut, true);
      const active = this._deepActiveElement();
      if (active) {
        this._show(active);
      }
    } else {
      window.removeEventListener("focusin", this._focusIn, true);
      window.removeEventListener("focusout", this._focusOut, true);
      this._hide();
    }
  }

  private _deepActiveElement(): Element | undefined {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) {
      active = active.shadowRoot.activeElement;
    }
    return active && active !== document.body ? active : undefined;
  }

  private _focusIn = (ev: FocusEvent) => {
    const target = ev.composedPath()[0];
    if (target instanceof Element) {
      this._show(target);
    }
  };

  private _focusOut = () => {
    this._hide();
  };

  private _show(target: Element) {
    if (!this._ring) {
      this._ring = document.createElement("div");
      this._ring.id = "ha-accessibility-focus-ring";
      this._ring.setAttribute("aria-hidden", "true");
      this._ring.setAttribute("popover", "manual");
      document.body.appendChild(this._ring);
    }
    this._target = target;
    // Showing it again moves it above anything opened since.
    try {
      if (this._ring.matches(":popover-open")) {
        this._ring.hidePopover();
      }
      this._ring.showPopover();
    } catch (_err) {
      // The ring stays in the page when popovers are not supported.
    }
    this._position();
  }

  private _hide() {
    this._target = undefined;
    if (this._frame) {
      cancelAnimationFrame(this._frame);
      this._frame = undefined;
    }
    try {
      if (this._ring?.matches(":popover-open")) {
        this._ring.hidePopover();
      }
    } catch (_err) {
      // Nothing to hide.
    }
  }

  private _position = () => {
    this._frame = undefined;
    if (!this._target || !this._ring) {
      return;
    }
    if (!this._target.isConnected) {
      this._hide();
      return;
    }
    const rect = this._target.getBoundingClientRect();
    const gap = 4;
    this._ring.style.left = `${rect.left - gap}px`;
    this._ring.style.top = `${rect.top - gap}px`;
    this._ring.style.width = `${rect.width + gap * 2}px`;
    this._ring.style.height = `${rect.height + gap * 2}px`;
    this._ring.style.display = rect.width || rect.height ? "" : "none";
    this._frame = requestAnimationFrame(this._position);
  };
}

const focusRing = new FocusRing();

export const applyAccessibilitySettings = (
  settings: AccessibilitySettings,
  darkMode: boolean
) => {
  ensureStyles();
  const root = document.documentElement;
  const set = (name: string, value: string | undefined) => {
    if (value === undefined) {
      root.removeAttribute(name);
    } else {
      root.setAttribute(name, value);
    }
  };
  set(
    "data-a11y-scale",
    settings.textScale === 1 ? undefined : String(settings.textScale)
  );
  set(
    "data-a11y-contrast",
    settings.contrast === "standard" ? undefined : settings.contrast
  );
  set("data-a11y-dark", darkMode ? "" : undefined);
  set("data-a11y-reduce-motion", settings.reduceMotion ? "" : undefined);
  set("data-a11y-larger-targets", settings.largerTargets ? "" : undefined);
  focusRing.setEnabled(settings.showFocus);
};

const SKIPPED_TAGS = new Set([
  "SCRIPT",
  "STYLE",
  "TEMPLATE",
  "SVG",
  "INPUT",
  "TEXTAREA",
  "SELECT",
  "CODE",
  "PRE",
  "CANVAS",
  "VIDEO",
  "AUDIO",
  "IFRAME",
  "HA-CODE-EDITOR",
  "HA-QR-CODE",
  "HA-PASSWORD-FIELD",
]);

const MAX_READ_NODES = 20000;

/**
 * The visible text of a part of the page, read through shadow roots and
 * slots in the order it is shown. Form fields, code and QR codes are left
 * out, so a password or a one-time code is never read aloud.
 */
export const collectReadableText = (root: Node): string[] => {
  const parts: string[] = [];
  let visited = 0;

  const walk = (node: Node) => {
    visited++;
    if (visited > MAX_READ_NODES) {
      return;
    }
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.replace(/\s+/g, " ").trim();
      if (text) {
        parts.push(text);
      }
      return;
    }
    if (node instanceof Element) {
      if (
        SKIPPED_TAGS.has(node.tagName.toUpperCase()) ||
        node.getAttribute("aria-hidden") === "true" ||
        node.hasAttribute("hidden") ||
        node.hasAttribute("inert") ||
        node.getAttribute("autocomplete") === "one-time-code"
      ) {
        return;
      }
      if (isNotShown(node)) {
        return;
      }
      if (node instanceof HTMLSlotElement) {
        const assigned = node.assignedNodes({ flatten: true });
        (assigned.length ? assigned : Array.from(node.childNodes)).forEach(
          walk
        );
        return;
      }
      if (node.shadowRoot) {
        Array.from(node.shadowRoot.childNodes).forEach(walk);
        return;
      }
    } else if (
      node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE &&
      node.nodeType !== Node.DOCUMENT_NODE
    ) {
      return;
    }
    Array.from(node.childNodes).forEach(walk);
  };

  walk(root);

  // Join short fragments into sentences of a size a speech engine handles.
  const chunks: string[] = [];
  let current = "";
  parts.forEach((part) => {
    if (current && current.length + part.length > 220) {
      chunks.push(current);
      current = "";
    }
    current = current ? `${current}. ${part}` : part;
  });
  if (current) {
    chunks.push(current);
  }
  return chunks;
};

export const canReadAloud = (): boolean =>
  typeof window !== "undefined" &&
  "speechSynthesis" in window &&
  "SpeechSynthesisUtterance" in window;

export const stopReadingAloud = () => {
  if (canReadAloud()) {
    window.speechSynthesis.cancel();
  }
};

export const readAloud = (
  chunks: string[],
  language: string,
  onDone: () => void
) => {
  if (!canReadAloud() || !chunks.length) {
    onDone();
    return;
  }
  window.speechSynthesis.cancel();
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = language;
    if (index === chunks.length - 1) {
      utterance.onend = onDone;
      utterance.onerror = onDone;
    }
    window.speechSynthesis.speak(utterance);
  });
};
