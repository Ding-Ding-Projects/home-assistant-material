import type { HassEntity } from "home-assistant-js-websocket";
import type { ReactiveController, ReactiveControllerHost } from "lit";
import { css } from "lit";
import { computeDeviceNameDisplay } from "../../../../common/entity/compute_device_name";
import { formatNumberWithUnit } from "../../../../common/number/format_number";
import type { StageTone } from "../../../../data/printer_3d";
import type { HomeAssistant } from "../../../../types";

export const isKnownState = (stateObj?: HassEntity): stateObj is HassEntity =>
  !!stateObj &&
  stateObj.state !== "unknown" &&
  stateObj.state !== "unavailable";

/** The number a sensor reports, or undefined when it has no reading. */
export const stateNumber = (stateObj?: HassEntity): number | undefined => {
  if (!isKnownState(stateObj)) {
    return undefined;
  }
  const value = Number(stateObj.state);
  return Number.isFinite(value) ? value : undefined;
};

/**
 * The state the stage chip names. The stage sensor reads idle once a print
 * has finished or failed, and often while it is being prepared, so then the
 * print status says more.
 */
export const chipStateObj = (
  stageObj?: HassEntity,
  statusObj?: HassEntity
): HassEntity | undefined => {
  const stage = isKnownState(stageObj) ? stageObj : undefined;
  const status = isKnownState(statusObj) ? statusObj : undefined;
  if (
    status &&
    (!stage || stage.state === "idle") &&
    ["finish", "failed", "prepare", "pause"].includes(status.state)
  ) {
    return status;
  }
  return stage ?? status;
};

/**
 * Which radio a key press moves to, following the ARIA radio group pattern:
 * arrows move and wrap, Home and End jump. Undefined for any other key.
 */
export const radioKeyTarget = (
  ev: KeyboardEvent,
  count: number,
  index: number
): number | undefined => {
  const rtl =
    ev.currentTarget instanceof Element &&
    getComputedStyle(ev.currentTarget).direction === "rtl";
  switch (ev.key) {
    case "ArrowRight":
      return (index + (rtl ? -1 : 1) + count) % count;
    case "ArrowLeft":
      return (index + (rtl ? 1 : -1) + count) % count;
    case "ArrowDown":
      return (index + 1) % count;
    case "ArrowUp":
      return (index - 1 + count) % count;
    case "Home":
      return 0;
    case "End":
      return count - 1;
    default:
      return undefined;
  }
};

/** Draws the host again when the app's reduced motion settings change. */
export class MotionPreferenceController implements ReactiveController {
  private _observer?: MutationObserver;

  constructor(private _host: ReactiveControllerHost) {
    _host.addController(this);
  }

  hostConnected() {
    this._observer = new MutationObserver(() => this._host.requestUpdate());
    this._observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-a11y-reduce-motion", "data-low-stimulation"],
    });
  }

  hostDisconnected() {
    this._observer?.disconnect();
    this._observer = undefined;
  }
}

/** A temperature with its unit, in the user's number format. */
export const formatTemperature = (
  hass: HomeAssistant,
  value: number,
  unit: string | undefined
): string =>
  formatNumberWithUnit(value, unit ?? "°C", hass.locale, {
    maximumFractionDigits: 0,
  });

export const printerDeviceName = (
  hass: HomeAssistant,
  deviceId: string
): string => {
  const device = hass.devices[deviceId];
  return device ? computeDeviceNameDisplay(device, hass.localize) : deviceId;
};

export const TONE_CLASS: Record<StageTone, string> = {
  primary: "tone-primary",
  amber: "tone-amber",
  error: "tone-error",
  green: "tone-green",
  neutral: "tone-neutral",
};

/** Styles both printer cards share: the stage chip and its quiet dot. */
export const printer3DSharedStyles = css`
  :host {
    /* The warning colour mixed toward the text colour, so amber marks stay
       readable on their light container in a light theme too. */
    --printer-amber: color-mix(
      in srgb,
      var(--warning-color) 45%,
      var(--primary-text-color)
    );
    --printer-amber-container: color-mix(
      in srgb,
      var(--warning-color) 22%,
      var(--card-background-color)
    );
    --printer-error-container: color-mix(
      in srgb,
      var(--error-color) 18%,
      var(--card-background-color)
    );
    --printer-green-container: color-mix(
      in srgb,
      var(--success-color) 20%,
      var(--card-background-color)
    );
    --printer-primary-container: color-mix(
      in srgb,
      var(--primary-color) 20%,
      var(--card-background-color)
    );
    --printer-tile: var(--secondary-background-color);
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2, 8px);
    min-height: 28px;
    padding-block: var(--ha-space-1, 4px);
    padding-inline: 10px var(--ha-space-3, 12px);
    border-radius: var(--ha-border-radius-pill, 999px);
    font-size: var(--ha-font-size-s);
    font-weight: var(--ha-font-weight-medium);
    background: var(--printer-tile);
    color: var(--secondary-text-color);
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .chip > span:last-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chip.tone-primary {
    background: var(--printer-primary-container);
    color: var(--primary-text-color);
  }
  .chip.tone-amber {
    background: var(--printer-amber-container);
    color: var(--primary-text-color);
  }
  .chip.tone-error {
    background: var(--printer-error-container);
    color: var(--primary-text-color);
  }
  .chip.tone-green {
    background: var(--printer-green-container);
    color: var(--primary-text-color);
  }
  .chip .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
    position: relative;
  }
  .chip.tone-primary .dot {
    background: var(--primary-color);
  }
  .chip.tone-amber .dot {
    background: var(--printer-amber);
  }
  .chip.tone-error .dot {
    background: var(--error-color);
  }
  .chip.tone-green .dot {
    background: var(--success-color);
  }
  .chip .dot.pulse::after {
    content: "";
    position: absolute;
    inset: 0;
    border-radius: 50%;
    background: inherit;
    animation: printer-ring 2.4s ease-out infinite;
  }
  @keyframes printer-ring {
    0% {
      transform: scale(1);
      opacity: 0.7;
    }
    70%,
    100% {
      transform: scale(2.6);
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
      animation: none !important;
      transition: none !important;
    }
  }
  .still *,
  .still *::before,
  .still *::after {
    animation: none !important;
    transition: none !important;
  }
`;

/** Whether the app's accessibility or low stimulation settings turn motion off. */
export const motionReduced = (): boolean => {
  const root = document.documentElement;
  return (
    root.hasAttribute("data-a11y-reduce-motion") ||
    root.hasAttribute("data-low-stimulation")
  );
};
