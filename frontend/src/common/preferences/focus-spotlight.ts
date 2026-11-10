/**
 * A dim layer over everything except the control that has the keyboard
 * focus. Nothing is hidden and nothing takes input: the layer ignores the
 * pointer and disappears when nothing is focused, when the focused element
 * covers most of the window, or when the mode is turned off.
 *
 * Focus styles inside components cannot be changed from outside, so the
 * layer is its own element that reads the focused element through shadow
 * roots and follows it. It is shown as a manual popover so it sits above
 * dialogs.
 */

const ELEMENT_ID = "ha-focus-spotlight";
const STYLE_ID = "ha-focus-spotlight-style";

/** Above this share of the window the layer would only dim a sliver. */
export const MAX_SPOTLIGHT_AREA_SHARE = 0.7;

export const DIM_SHADOW = "0 0 0 100vmax rgba(0, 0, 0, 0.32)";

/** True when the focused element is small enough to be worth a spotlight. */
export const worthSpotlight = (
  rect: { width: number; height: number },
  view: { width: number; height: number }
): boolean => {
  if (!rect.width || !rect.height) {
    return false;
  }
  return (
    (rect.width * rect.height) / (view.width * view.height || 1) <
    MAX_SPOTLIGHT_AREA_SHARE
  );
};

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `#${ELEMENT_ID} {
  position: fixed;
  inset: auto;
  margin: 0;
  padding: 0;
  border: none;
  border-radius: 12px;
  background: transparent;
  box-shadow: ${DIM_SHADOW};
  pointer-events: none;
  overflow: visible;
  box-sizing: border-box;
}`;
  document.head.appendChild(style);
};

class FocusSpotlight {
  private _layer?: HTMLElement;

  private _target?: Element;

  private _frame?: number;

  private _enabled = false;

  public setEnabled(enabled: boolean) {
    if (enabled === this._enabled) {
      return;
    }
    this._enabled = enabled;
    if (enabled) {
      ensureStyle();
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
    if (!this._layer) {
      this._layer = document.createElement("div");
      this._layer.id = ELEMENT_ID;
      this._layer.setAttribute("aria-hidden", "true");
      this._layer.setAttribute("popover", "manual");
      document.body.appendChild(this._layer);
    }
    this._target = target;
    try {
      if (this._layer.matches(":popover-open")) {
        this._layer.hidePopover();
      }
      this._layer.showPopover();
    } catch (_err) {
      // The layer stays in the page when popovers are not supported.
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
      if (this._layer?.matches(":popover-open")) {
        this._layer.hidePopover();
      }
    } catch (_err) {
      // Nothing to hide.
    }
  }

  private _position = () => {
    this._frame = undefined;
    if (!this._target || !this._layer) {
      return;
    }
    if (!this._target.isConnected) {
      this._hide();
      return;
    }
    const rect = this._target.getBoundingClientRect();
    const gap = 6;
    this._layer.style.left = `${rect.left - gap}px`;
    this._layer.style.top = `${rect.top - gap}px`;
    this._layer.style.width = `${rect.width + gap * 2}px`;
    this._layer.style.height = `${rect.height + gap * 2}px`;
    this._layer.style.display = worthSpotlight(rect, {
      width: window.innerWidth,
      height: window.innerHeight,
    })
      ? ""
      : "none";
    this._frame = requestAnimationFrame(this._position);
  };
}

export const focusSpotlight = new FocusSpotlight();
