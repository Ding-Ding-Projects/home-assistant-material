import type { PersistentNotification } from "../../../data/persistent_notification";

export type NotificationSeverity = "error" | "warning" | "info";

export interface NotificationAction {
  label: string;
  href: string;
}

const ERROR_WORDS =
  /\b(error|errors|fail|failed|failure|could not|couldn t|unable|invalid|refused|unreachable|crashed)\b/;
const WARNING_WORDS =
  /\b(warning|warn|low|expire|expires|expired|expiring|deprecated|deprecation|offline|unavailable|battery|batteries|repair)\b/;

/**
 * The instance does not report how serious a notification is, so this reads
 * it from the words of the notification's id and title. Anything that does
 * not clearly say it is an error or a warning counts as information.
 */
export const notificationSeverity = (
  notification: Pick<PersistentNotification, "notification_id" | "title">
): NotificationSeverity => {
  const text = `${notification.notification_id} ${notification.title ?? ""}`
    .toLowerCase()
    .replace(/[_.\-'’]/g, " ");
  if (ERROR_WORDS.test(text)) {
    return "error";
  }
  if (WARNING_WORDS.test(text)) {
    return "warning";
  }
  return "info";
};

const LINK = /\[([^\]\n]{1,60})\]\(([^)\s]+)\)/g;

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
    const safe =
      (href.startsWith("/") && !href.startsWith("//")) ||
      /^https?:\/\//i.test(href);
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
