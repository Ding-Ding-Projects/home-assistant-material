export interface NotificationAction {
  label: string;
  href: string;
  /** The site an outside link goes to; empty for a link inside this interface. */
  host: string;
}

// A link that is not preceded by "!" (that would be an image).
const LINK = /(?<!!)\[([^\]\n]{1,60})\]\(([^)\s]+)\)/g;

// An address inside this interface: one plain path, never a form a browser
// could read as another site (such as "/\host") and no control characters.
const APP_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/** The most action buttons shown on one notification. */
export const MAX_NOTIFICATION_ACTIONS = 2;

/** True when a path climbs out of its place with a ".." segment. */
export const hasDotSegments = (path: string): boolean =>
  path
    .split(/[?#]/, 1)[0]
    .split("/")
    .some((segment) => {
      let plain = segment;
      try {
        plain = decodeURIComponent(segment);
      } catch (_err) {
        // keep the raw segment
      }
      return plain === "..";
    });

/** The host of a web link, in lower case, or "" when it is not one. */
export const linkHost = (href: string): string => {
  try {
    const url = new URL(href);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.hostname.toLowerCase()
      : "";
  } catch (_err) {
    return "";
  }
};

/**
 * The links in the message of a notification, as action buttons. Only links
 * inside this interface (starting with "/", without ".." segments) and web
 * links are kept; anything else, such as a script address, is left out. A web
 * link carries its host so the button can say where it goes.
 */
export const notificationActions = (message: string): NotificationAction[] => {
  const actions: NotificationAction[] = [];
  for (const match of message.matchAll(LINK)) {
    const href = match[2];
    const inApp = APP_PATH.test(href) && !hasDotSegments(href);
    const host = /^https?:\/\/[!-[\]-~]+$/i.test(href) ? linkHost(href) : "";
    if ((!inApp && !host) || actions.some((action) => action.href === href)) {
      continue;
    }
    actions.push({ label: match[1].trim(), href, host: inApp ? "" : host });
    if (actions.length === MAX_NOTIFICATION_ACTIONS) {
      break;
    }
  }
  return actions;
};
