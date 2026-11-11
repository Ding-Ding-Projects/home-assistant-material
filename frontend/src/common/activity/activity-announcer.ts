import type { HomeAssistant } from "../../types";
import { modeText } from "../language-mode/language-mode";
import type { Activity } from "./activity-store";
import { activityStore } from "./activity-store";

type Localize = HomeAssistant["localize"];

/**
 * Says, once each, when an activity starts, finishes, fails or is cancelled,
 * through one polite live region that stays in the page. The region lives
 * outside any page, so an announcement is made even when the tray is closed.
 */

let localize: Localize | undefined;
let region: HTMLElement | undefined;
let unsubscribe: (() => void) | undefined;
const announced = new Map<string, Activity["state"]>();

const ensureRegion = (): HTMLElement => {
  if (region?.isConnected) {
    return region;
  }
  const el = document.createElement("div");
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  el.setAttribute("aria-atomic", "true");
  Object.assign(el.style, {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  });
  document.body.appendChild(el);
  region = el;
  return el;
};

const announce = (activity: Activity): void => {
  if (!localize) {
    return;
  }
  const state = activity.state;
  const text = modeText(localize as any, `ui.activity.announce.${state}`, {
    title: activity.title,
  });
  if (text) {
    ensureRegion().textContent = text;
  }
};

/** Starts announcing. Safe to call again: it only refreshes the language. */
export const trackActivityAnnouncements = (nextLocalize: Localize): void => {
  localize = nextLocalize;
  if (unsubscribe) {
    return;
  }
  unsubscribe = activityStore.subscribe((items) => {
    const present = new Set<string>();
    for (const item of items) {
      present.add(item.id);
      if (announced.get(item.id) !== item.state) {
        announced.set(item.id, item.state);
        announce(item);
      }
    }
    for (const id of [...announced.keys()]) {
      if (!present.has(id)) {
        announced.delete(id);
      }
    }
  });
};
