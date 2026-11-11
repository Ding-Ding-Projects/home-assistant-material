export interface NotificationAction {
  label: string;
  href: string;
}

// A link that is not preceded by "!" (that would be an image).
const LINK = /(?<!!)\[([^\]\n]{1,60})\]\(([^)\s]+)\)/g;

// An address inside this interface: one plain path, never a form a browser
// could read as another site (such as "/\host") and no control characters.
const APP_PATH = /^\/(?![/\\])[A-Za-z0-9\-._~!$&'()*+,;=:@%/?#[\]]*$/;

/** The most action buttons shown on one notification. */
export const MAX_NOTIFICATION_ACTIONS = 2;

/**
 * The links in the message of a notification, as action buttons. Only links
 * inside this interface (starting with "/") and web links are kept; anything
 * else, such as a script address, is left out.
 */
export const notificationActions = (message: string): NotificationAction[] => {
  const actions: NotificationAction[] = [];
  for (const match of message.matchAll(LINK)) {
    const href = match[2];
    const safe = APP_PATH.test(href) || /^https?:\/\/[!-[\]-~]+$/i.test(href);
    if (!safe || actions.some((action) => action.href === href)) {
      continue;
    }
    actions.push({ label: match[1].trim(), href });
    if (actions.length === MAX_NOTIFICATION_ACTIONS) {
      break;
    }
  }
  return actions;
};
