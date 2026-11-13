import { mdiCloudOffOutline } from "@mdi/js";
import type { LocalizeKeys } from "./translations/localize";
import { formatTime } from "./datetime/format_time";
import type { HomeAssistant } from "../types";

/**
 * A banner that says the connection to the server is gone and when it was
 * lost. The dashboard keeps showing the last known states underneath, so the
 * page is never blank. It listens to the connection status the app already
 * broadcasts and draws only while disconnected.
 */

let banner: HTMLElement | undefined;
let lostAt: Date | undefined;
let getHass: (() => HomeAssistant | undefined) | undefined;
let timer: number | undefined;

const hide = (): void => {
  banner?.remove();
  banner = undefined;
  lostAt = undefined;
  window.clearInterval(timer);
  timer = undefined;
};

const text = (): string => {
  const hass = getHass?.();
  if (!hass || !lostAt) {
    return "";
  }
  return hass.localize("ui.common.offline_banner" as LocalizeKeys, {
    time: formatTime(lostAt, hass.locale, hass.config),
  });
};

const show = (): void => {
  if (banner) {
    return;
  }
  const element = document.createElement("div");
  element.setAttribute("role", "status");
  Object.assign(element.style, {
    position: "fixed",
    insetInline: "var(--ha-space-4, 16px)",
    insetBlockEnd:
      "calc(var(--ha-space-4, 16px) + env(safe-area-inset-bottom, 0px) + 72px)",
    marginInline: "auto",
    maxWidth: "560px",
    display: "flex",
    alignItems: "center",
    gap: "var(--ha-space-3, 12px)",
    padding: "var(--ha-space-3, 12px) var(--ha-space-4, 16px)",
    borderRadius: "var(--ha-border-radius-lg, 16px)",
    background:
      "var(--ha-color-warning-container, var(--warning-color, #ffe0b2))",
    color: "var(--ha-color-on-warning-container, var(--primary-text-color))",
    boxShadow: "var(--ha-shadow-overlay, 0 2px 8px rgba(0,0,0,.3))",
    zIndex: "9000",
    fontFamily: "var(--ha-font-family-body, sans-serif)",
    fontSize: "var(--ha-font-size-m, 14px)",
  });
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("aria-hidden", "true");
  svg.style.flex = "none";
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", mdiCloudOffOutline);
  path.setAttribute("fill", "currentColor");
  svg.append(path);
  const label = document.createElement("span");
  label.textContent = text();
  element.append(svg, label);
  document.body.append(element);
  banner = element;
  // The wording follows the language when it changes while offline.
  timer = window.setInterval(() => {
    label.textContent = text();
  }, 5000);
};

const onStatus = (ev: Event): void => {
  const status = (ev as CustomEvent<string>).detail;
  if (status === "disconnected") {
    lostAt = new Date();
    show();
  } else if (status === "connected") {
    hide();
  }
};

/** Starts watching the connection. Safe to call again; `hass` is read when the banner is drawn. */
export const startOfflineBanner = (
  hass: () => HomeAssistant | undefined
): void => {
  getHass = hass;
  window.removeEventListener("connection-status", onStatus);
  window.addEventListener("connection-status", onStatus);
  // The page may be opened while the connection is already down.
  if (hass()?.connected === false && !banner) {
    lostAt = new Date();
    show();
  }
};

export const stopOfflineBanner = (): void => {
  window.removeEventListener("connection-status", onStatus);
  hide();
};
