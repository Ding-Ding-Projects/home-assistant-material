import { getStorage } from "../decorators/storage";
import { mainWindow } from "../dom/get_main_window";
import { modeText } from "../language-mode/language-mode";
import { currentPath } from "../url/current-path";
import type { PersonalPreferences } from "./personal-preferences";

/**
 * Two attention modes that have a real effect on screen:
 *
 * - Time awareness shows a small clock and how long this browser tab has
 *   been open. It does not know about tasks, so it never claims a task time.
 * - Momentum remembers the last page you were on and, when the app starts on
 *   a different page, offers one button to go back there.
 *
 * Both draw their own element, shown as a manual popover so it sits above
 * dialogs, and neither takes focus or hides anything.
 */

const STYLE_ID = "ha-attention-modes-style";
const CLOCK_ID = "ha-time-awareness";
const MOMENTUM_ID = "ha-momentum-bar";

export const MOMENTUM_STORAGE_KEY = "momentumLastPage";

/** A remembered page older than this is not offered. */
export const MOMENTUM_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface RememberedPage {
  path: string;
  at: number;
}

/** Whole minutes between two times, never negative. */
export const elapsedMinutes = (startedAt: number, now: number): number =>
  Math.max(0, Math.floor((now - startedAt) / 60000));

/** The clock text: the local time and the minutes this tab has been open. */
export const clockText = (
  now: Date,
  startedAt: number,
  locale?: string
): string => {
  const time = new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(now);
  const minutes = elapsedMinutes(startedAt, now.getTime());
  const hours = Math.floor(minutes / 60);
  const unit = (value: number, name: "hour" | "minute") =>
    new Intl.NumberFormat(locale, {
      style: "unit",
      unit: name,
      unitDisplay: "narrow",
    }).format(value);
  const open = hours
    ? `${unit(hours, "hour")} ${unit(minutes % 60, "minute")}`
    : unit(minutes, "minute");
  return `${time} · ${open}`;
};

/** True when a remembered page is worth offering on this page. */
export const shouldOfferMomentum = (
  remembered: RememberedPage | undefined,
  path: string,
  now: number
): remembered is RememberedPage =>
  !!remembered &&
  typeof remembered.path === "string" &&
  remembered.path.startsWith("/") &&
  remembered.path !== path &&
  typeof remembered.at === "number" &&
  now - remembered.at >= 0 &&
  now - remembered.at <= MOMENTUM_MAX_AGE_MS;

const ensureStyle = () => {
  if (document.getElementById(STYLE_ID)) {
    return;
  }
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `#${CLOCK_ID}, #${MOMENTUM_ID} {
  position: fixed;
  inset: auto;
  margin: 0;
  border: 1px solid var(--divider-color, #ccc);
  background: var(--card-background-color, #fff);
  color: var(--primary-text-color, #000);
  font: inherit;
  font-size: 0.875rem;
  box-sizing: border-box;
}
#${CLOCK_ID} {
  inset-inline-start: 12px;
  inset-block-end: 12px;
  padding: 4px 12px;
  border-radius: 16px;
  pointer-events: none;
}
#${MOMENTUM_ID} {
  inset-inline: 12px;
  inset-block-end: 56px;
  max-width: 480px;
  margin-inline: auto;
  padding: 12px 16px;
  border-radius: 16px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
}
#${MOMENTUM_ID} span {
  flex: 1 1 200px;
  min-width: 0;
  overflow-wrap: anywhere;
}
#${MOMENTUM_ID} button {
  min-height: 44px;
  padding: 0 16px;
  font: inherit;
  color: var(--primary-color, #03a9f4);
  background: none;
  border: 0;
  border-radius: 20px;
  cursor: pointer;
}
#${MOMENTUM_ID} button:focus-visible {
  outline: 2px solid var(--primary-color, #03a9f4);
}`;
  document.head.appendChild(style);
};

const showPopover = (el: HTMLElement) => {
  try {
    if (!el.matches(":popover-open")) {
      el.showPopover();
    }
  } catch (_err) {
    // The element stays in the page when popovers are not supported.
  }
};

const hidePopover = (el?: HTMLElement) => {
  try {
    if (el?.matches(":popover-open")) {
      el.hidePopover();
    }
  } catch (_err) {
    // Nothing to hide.
  }
};

const readText = (key: string, values?: Record<string, string | number>) => {
  const hass = (
    document.querySelector("home-assistant") as
      | (HTMLElement & {
          hass?: { localize: (key: string, values?: any) => string };
        })
      | null
  )?.hass;
  return hass
    ? modeText(
        hass.localize,
        `ui.panel.config.personal.momentum_bar.${key}`,
        values
      )
    : "";
};

class AttentionModes {
  private _startedAt = Date.now();

  private _clock?: HTMLElement;

  private _clockTimer?: number;

  private _bar?: HTMLElement;

  private _momentum = false;

  private _offered = false;

  public apply(
    preferences: Pick<PersonalPreferences, "timeAwareness" | "momentum">
  ) {
    this._setClock(preferences.timeAwareness);
    this._setMomentum(preferences.momentum);
  }

  private _setClock(enabled: boolean) {
    if (!enabled) {
      if (this._clockTimer) {
        window.clearInterval(this._clockTimer);
        this._clockTimer = undefined;
      }
      hidePopover(this._clock);
      this._clock?.remove();
      this._clock = undefined;
      return;
    }
    if (this._clock) {
      return;
    }
    ensureStyle();
    const clock = document.createElement("div");
    clock.id = CLOCK_ID;
    clock.setAttribute("popover", "manual");
    document.body.appendChild(clock);
    this._clock = clock;
    const tick = () => {
      clock.textContent = clockText(
        new Date(),
        this._startedAt,
        document.documentElement.lang || undefined
      );
    };
    tick();
    showPopover(clock);
    this._clockTimer = window.setInterval(tick, 15000);
  }

  private _setMomentum(enabled: boolean) {
    if (enabled === this._momentum) {
      return;
    }
    this._momentum = enabled;
    if (!enabled) {
      mainWindow.removeEventListener("location-changed", this._moved);
      window.removeEventListener("popstate", this._moved);
      this._closeBar();
      return;
    }
    const storage = getStorage();
    if (!this._offered) {
      this._offered = true;
      const remembered = storage.getValue<RememberedPage>(MOMENTUM_STORAGE_KEY);
      if (shouldOfferMomentum(remembered, currentPath(), Date.now())) {
        this._offer(remembered.path);
      }
    }
    this._remember();
    mainWindow.addEventListener("location-changed", this._moved);
    window.addEventListener("popstate", this._moved);
  }

  private _remember() {
    getStorage().setValue<RememberedPage>(MOMENTUM_STORAGE_KEY, {
      path: currentPath(),
      at: Date.now(),
    });
  }

  private _moved = () => {
    this._closeBar();
    this._remember();
  };

  private _offer(path: string, attempt = 0) {
    if (currentPath() === path) {
      return;
    }
    const label = readText("offer", { path });
    if (!label) {
      // The wording is not loaded yet while the app is starting.
      if (attempt < 20 && this._momentum) {
        window.setTimeout(() => this._offer(path, attempt + 1), 500);
      }
      return;
    }
    ensureStyle();
    this._closeBar();
    const bar = document.createElement("div");
    bar.id = MOMENTUM_ID;
    bar.setAttribute("popover", "manual");
    bar.setAttribute("role", "status");
    const text = document.createElement("span");
    text.textContent = label;
    const go = document.createElement("button");
    go.type = "button";
    go.textContent = readText("go");
    go.addEventListener("click", () => {
      this._closeBar();
      import("../navigate").then(({ navigate }) => navigate(path));
    });
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.textContent = readText("dismiss");
    dismiss.addEventListener("click", () => this._closeBar());
    bar.append(text, go, dismiss);
    document.body.appendChild(bar);
    this._bar = bar;
    showPopover(bar);
  }

  private _closeBar() {
    hidePopover(this._bar);
    this._bar?.remove();
    this._bar = undefined;
  }
}

export const attentionModes = new AttentionModes();
