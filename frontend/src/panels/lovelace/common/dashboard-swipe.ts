import type { ReactiveController, ReactiveControllerHost } from "lit";

/**
 * Swiping left or right on a phone to move between dashboards.
 *
 * A swipe counts only when it is long, mostly sideways and quick. It is
 * ignored when it starts on something that uses sideways drags itself (a
 * slider, a map, a chart, an area that scrolls sideways), or close to the
 * screen edge, where the system uses it to go back.
 */

export const SWIPE_MIN_DISTANCE = 80;
export const SWIPE_MAX_DURATION_MS = 800;
const EDGE_GUARD = 24;
/** The sideways distance must be at least this many times the vertical one. */
const DIRECTION_RATIO = 2;

const OWN_DRAG_TAGS =
  /slider|^(input|textarea|select|video|canvas)$|code-editor|^ha-map$|map-card|chart|sortable|color-picker|joystick/i;

/** What a finished touch means: a swipe to the next or previous dashboard, or nothing. */
export const classifySwipe = (
  dx: number,
  dy: number,
  durationMs: number
): "next" | "previous" | undefined => {
  if (
    Math.abs(dx) < SWIPE_MIN_DISTANCE ||
    Math.abs(dx) < Math.abs(dy) * DIRECTION_RATIO ||
    durationMs > SWIPE_MAX_DURATION_MS
  ) {
    return undefined;
  }
  // Dragging the page to the left reveals what comes after it.
  return dx < 0 ? "next" : "previous";
};

/** Whether something in the path handles sideways drags itself. */
export const handlesOwnHorizontalDrag = (path: EventTarget[]): boolean =>
  path.some((target) => {
    if (!(target instanceof HTMLElement)) {
      return false;
    }
    if (
      target.dataset.noSwipe !== undefined ||
      OWN_DRAG_TAGS.test(target.localName)
    ) {
      return true;
    }
    if (target.scrollWidth > target.clientWidth + 1) {
      const overflow = getComputedStyle(target).overflowX;
      return overflow === "auto" || overflow === "scroll";
    }
    return false;
  });

export interface DashboardSwipeHost
  extends ReactiveControllerHost, HTMLElement {}

export class DashboardSwipeController implements ReactiveController {
  private _start?: { x: number; y: number; time: number };

  constructor(
    private _host: DashboardSwipeHost,
    /** Called with the direction when a swipe should change the dashboard. */
    private _onSwipe: (direction: "next" | "previous") => void,
    /** Whether swiping is on at the moment (a phone, view mode, setting on). */
    private _active: () => boolean
  ) {
    _host.addController(this);
  }

  hostConnected(): void {
    this._host.addEventListener("touchstart", this._touchStart, {
      passive: true,
    });
    this._host.addEventListener("touchend", this._touchEnd, { passive: true });
    this._host.addEventListener("touchcancel", this._touchCancel, {
      passive: true,
    });
  }

  hostDisconnected(): void {
    this._host.removeEventListener("touchstart", this._touchStart);
    this._host.removeEventListener("touchend", this._touchEnd);
    this._host.removeEventListener("touchcancel", this._touchCancel);
    this._start = undefined;
  }

  private _touchStart = (ev: TouchEvent) => {
    this._start = undefined;
    if (!this._active() || ev.touches.length !== 1) {
      return;
    }
    const touch = ev.touches[0];
    if (
      touch.clientX < EDGE_GUARD ||
      touch.clientX > window.innerWidth - EDGE_GUARD ||
      handlesOwnHorizontalDrag(ev.composedPath())
    ) {
      return;
    }
    this._start = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  };

  private _touchEnd = (ev: TouchEvent) => {
    const start = this._start;
    this._start = undefined;
    if (!start || !this._active() || ev.defaultPrevented) {
      return;
    }
    const touch = ev.changedTouches[0];
    if (!touch) {
      return;
    }
    const direction = classifySwipe(
      touch.clientX - start.x,
      touch.clientY - start.y,
      Date.now() - start.time
    );
    if (direction) {
      this._onSwipe(direction);
    }
  };

  private _touchCancel = () => {
    this._start = undefined;
  };
}
