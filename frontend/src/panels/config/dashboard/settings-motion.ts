import type { ReactiveController, ReactiveControllerHost } from "lit";
import { css } from "lit";
import { currentMotionLock } from "../../../common/appearance/motion-profiles";
import type { ConfirmationDrama } from "../../../common/confirm/two-key-drama";
import { DEFAULT_CONFIRMATION_DRAMA } from "../../../common/confirm/two-key-drama";
import {
  getPersonalPreferences,
  subscribePersonalPreferences,
} from "../../../common/preferences/personal-preferences";

/** The spring the boards use for arrivals. */
export const SPRING = "cubic-bezier(.2, 1.5, .3, 1)";

/**
 * The strength of motion for this page: the person's confirmation drama
 * choice, or "off" whenever reduced motion is asked for.
 */
export const effectiveDrama = (): ConfirmationDrama => {
  let drama: ConfirmationDrama = DEFAULT_CONFIRMATION_DRAMA;
  try {
    drama = getPersonalPreferences().confirmationDrama;
  } catch (_err) {
    // Storage is unavailable: the default stays.
  }
  try {
    if (currentMotionLock() !== undefined) {
      return "off";
    }
  } catch (_err) {
    // No document to read the switches from: keep the choice.
  }
  return drama;
};

/** Keeps a `drama` attribute on the host in step with the effective choice. */
export class SettingsDramaController implements ReactiveController {
  private _unsubscribe?: () => void;

  private _query?: MediaQueryList;

  public constructor(private _host: ReactiveControllerHost & HTMLElement) {
    _host.addController(this);
  }

  public hostConnected(): void {
    this._apply();
    try {
      this._unsubscribe = subscribePersonalPreferences(() => this._apply());
    } catch (_err) {
      this._unsubscribe = undefined;
    }
    this._query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    this._query?.addEventListener?.("change", this._apply);
  }

  public hostDisconnected(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._query?.removeEventListener?.("change", this._apply);
  }

  private _apply = (): void => {
    this._host.setAttribute("drama", effectiveDrama());
  };
}

/**
 * Local arrival motion. The host carries `drama` (off, calm, standard or
 * dramatic); an element with the `rise` class animates in, staggered by its
 * `--i` index. Nothing loops.
 */
export const settingsMotionStyles = css`
  @keyframes settings-rise {
    from {
      opacity: 0;
      transform: translateY(var(--_rise-y, 0px)) scale(var(--_rise-s, 1));
    }
    to {
      opacity: 1;
      transform: none;
    }
  }
  @keyframes settings-pop {
    0% {
      transform: scale(1);
    }
    40% {
      transform: scale(1.4) rotate(-4deg);
    }
    100% {
      transform: none;
    }
  }
  :host {
    --_rise-y: 0px;
    --_rise-s: 1;
    --_rise-time: 0.001s;
  }
  :host([drama="calm"]) {
    --_rise-time: 0.35s;
  }
  :host([drama="standard"]) {
    --_rise-y: 34px;
    --_rise-time: 0.55s;
  }
  :host([drama="dramatic"]) {
    --_rise-y: 34px;
    --_rise-s: 0.94;
    --_rise-time: 0.6s;
  }
  .rise {
    animation: settings-rise var(--_rise-time) cubic-bezier(0.2, 1.5, 0.3, 1)
      calc(var(--i, 0) * 60ms) both;
  }
  :host([drama="calm"]) .rise {
    animation-timing-function: ease-out;
  }
  :host([drama="off"]) .rise,
  :host(:not([drama])) .rise {
    animation: none;
  }
  .pop {
    animation: settings-pop 0.6s cubic-bezier(0.2, 1.5, 0.3, 1) both;
  }
  :host([drama="off"]) .pop,
  :host([drama="calm"]) .pop,
  :host(:not([drama])) .pop {
    animation: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .rise,
    .pop {
      animation: none !important;
    }
  }
`;
