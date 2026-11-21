/**
 * True when an event handled on an element was fired by that element itself
 * (or retargeted to it from its own shadow tree), not by something inside it.
 *
 * Overlay events such as `wa-show`, `wa-after-show` and `closed` bubble. A
 * dialog that holds other overlays (a slider's tooltip, a colour picker, a
 * details sheet) must only react to its own: reacting to a nested one would,
 * for example, empty the dialog's list or close it while the nested overlay
 * opens.
 */
export const isOwnEvent = (ev: Event): boolean =>
  ev.target === ev.currentTarget;
