import { navigate } from "../../../../common/navigate";
import type { HomeAssistant } from "../../../../types";
import {
  inNightWindow,
  nextViewKey,
  readWallPanel,
  WALL_PANEL_KEY,
} from "./wall-panel";
import { WallTabletMode } from "./wall-tablet-mode";

/**
 * Runs the wall panel settings while a dashboard is open: draws the
 * screensaver after idle time, rotates between views, and dims at night.
 * Nothing runs unless the person switched a part on. It only draws over the
 * page and navigates inside the app.
 */

export interface WallPanelContext {
  urlPath: string | null;
  editMode: boolean;
  hass?: HomeAssistant;
}

/** How long after the last touch or key press rotation waits, in milliseconds. */
const ROTATION_GRACE_MS = 15000;

/** How often the screensaver content moves to a new place, in milliseconds. */
const SHIFT_EVERY_MS = 30000;

class WallPanelRuntime {
  private _context?: () => WallPanelContext | undefined;

  private _timer?: number;

  private _lastActivity = Date.now();

  private _lastRotation = Date.now();

  private _saver?: HTMLElement;

  private _clock?: HTMLElement;

  private _dim?: HTMLElement;

  private _previewUntil = 0;

  /** Set when a command or the person asked for the screensaver; it then shows until touched. */
  private _forceSaver = false;

  private _lastShift = 0;

  private _tablet = new WallTabletMode({
    wake: () => this._activity(),
    sleep: () => {
      this._forceSaver = true;
      this._showSaver();
    },
    screen: () => (this._saver ? "screensaver" : "on"),
  });

  public start(context: () => WallPanelContext | undefined): void {
    this._context = context;
    if (this._timer !== undefined) {
      return;
    }
    ["pointerdown", "keydown", "touchstart", "wheel"].forEach((name) =>
      window.addEventListener(name, this._activity, { passive: true })
    );
    window.addEventListener("storage", this._changed);
    window.addEventListener("wall-panel-changed", this._changed);
    this._lastActivity = Date.now();
    this._timer = window.setInterval(this._tick, 1000);
    this._tick();
  }

  public stop(): void {
    if (this._timer === undefined) {
      return;
    }
    window.clearInterval(this._timer);
    this._timer = undefined;
    ["pointerdown", "keydown", "touchstart", "wheel"].forEach((name) =>
      window.removeEventListener(name, this._activity)
    );
    window.removeEventListener("storage", this._changed);
    window.removeEventListener("wall-panel-changed", this._changed);
    this._hideSaver();
    this._dim?.remove();
    this._dim = undefined;
    this._forceSaver = false;
    this._tablet.stop();
  }

  /** Shows the screensaver for a few seconds so it can be seen. */
  public preview(seconds = 5): void {
    this._previewUntil = Date.now() + seconds * 1000;
    this._showSaver();
    window.setTimeout(this._tick, seconds * 1000 + 50);
  }

  private _changed = (ev: Event) => {
    if (ev.type === "storage" && (ev as StorageEvent).key !== WALL_PANEL_KEY) {
      return;
    }
    this._lastRotation = Date.now();
    this._tick();
  };

  private _activity = () => {
    this._lastActivity = Date.now();
    this._lastRotation = Math.max(this._lastRotation, Date.now() - 1000);
    if (this._saver) {
      this._previewUntil = 0;
      this._forceSaver = false;
      this._hideSaver();
    }
  };

  private _tick = () => {
    const settings = readWallPanel();
    const now = Date.now();
    const context = this._context?.();
    const date = new Date(now);

    // Dimming overlay.
    const dark =
      settings.night.enabled &&
      inNightWindow(
        date.getHours() * 60 + date.getMinutes(),
        settings.night.from,
        settings.night.to
      );
    if (dark) {
      if (!this._dim) {
        this._dim = document.createElement("div");
        this._dim.setAttribute("aria-hidden", "true");
        Object.assign(this._dim.style, {
          position: "fixed",
          inset: "0",
          background: "#000",
          pointerEvents: "none",
          zIndex: "9998",
          transition: "opacity 1s",
        });
        document.body.append(this._dim);
      }
      this._dim.style.opacity = String(settings.night.darkness / 100);
    } else if (this._dim) {
      this._dim.remove();
      this._dim = undefined;
    }

    // Screensaver.
    if (this._saver) {
      this._updateClock();
      if (this._previewUntil && now >= this._previewUntil) {
        this._previewUntil = 0;
        this._lastActivity = now;
        this._hideSaver();
      } else if (
        !this._previewUntil &&
        !this._forceSaver &&
        !settings.screensaver.enabled
      ) {
        this._hideSaver();
      }
    } else if (
      settings.screensaver.enabled &&
      !context?.editMode &&
      now - this._lastActivity >= settings.screensaver.minutes * 60000
    ) {
      this._showSaver();
    }

    this._tablet.update(settings, context?.hass);

    // Rotation between views.
    if (
      settings.rotation.enabled &&
      !this._saver &&
      context &&
      !context.editMode &&
      now - this._lastActivity >= ROTATION_GRACE_MS &&
      now - this._lastRotation >= settings.rotation.seconds * 1000
    ) {
      this._lastRotation = now;
      const segments = window.location.pathname.split("/").filter(Boolean);
      const target = nextViewKey(
        settings.rotation.views,
        decodeURIComponent(segments[1] ?? "")
      );
      if (target !== undefined) {
        navigate(
          `/${context.urlPath ?? segments[0] ?? "lovelace"}/${encodeURIComponent(target)}`,
          { replace: true }
        );
      }
    }
  };

  private _showSaver(): void {
    if (this._saver) {
      return;
    }
    const saver = document.createElement("div");
    saver.setAttribute("role", "presentation");
    Object.assign(saver.style, {
      position: "fixed",
      inset: "0",
      background: "#000",
      color: "#fff",
      display: "grid",
      placeItems: "center",
      zIndex: "9999",
      textAlign: "center",
      fontFamily: "var(--ha-font-family-body, sans-serif)",
    });
    const clock = document.createElement("div");
    const time = document.createElement("div");
    Object.assign(time.style, {
      fontSize: "min(24vw, 160px)",
      fontWeight: "300",
    });
    const day = document.createElement("div");
    Object.assign(day.style, { fontSize: "min(5vw, 32px)" });
    clock.append(time, day);
    saver.append(clock);
    this._clock = clock;
    this._lastShift = 0;
    this._saver = saver;
    document.body.append(saver);
    this._updateClock();
  }

  private _updateClock(): void {
    if (!this._clock) {
      return;
    }
    const date = new Date();
    if (
      readWallPanel().screensaver.shift &&
      date.getTime() - this._lastShift >= SHIFT_EVERY_MS
    ) {
      // Move the content slowly to a new place so no pixel stays lit.
      this._lastShift = date.getTime();
      Object.assign(this._clock.style, {
        transition: `transform ${SHIFT_EVERY_MS}ms linear`,
        transform: `translate(${Math.round((Math.random() - 0.5) * 24)}vw, ${Math.round((Math.random() - 0.5) * 24)}vh)`,
      });
    }
    const [time, day] = Array.from(this._clock.children) as HTMLElement[];
    time.textContent = date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    day.textContent = date.toLocaleDateString(undefined, {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
  }

  private _hideSaver(): void {
    this._saver?.remove();
    this._saver = undefined;
    this._clock = undefined;
  }
}

const runtime = new WallPanelRuntime();

export const startWallPanel = (
  context: () => WallPanelContext | undefined
): void => runtime.start(context);

export const stopWallPanel = (): void => runtime.stop();

export const previewWallPanelScreensaver = (): void => runtime.preview();
