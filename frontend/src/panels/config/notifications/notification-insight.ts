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

export type NotificationSeverity = "error" | "warning" | "info" | "neutral";

/** Severities from most to least urgent; the order of sorting and of chips. */
export const SEVERITIES: readonly NotificationSeverity[] = [
  "error",
  "warning",
  "info",
  "neutral",
];

// An explicit level written at the start of a notification id, such as
// "error.backup_failed" or "warning-low-disk".
const LEVEL_MARKER = /^(error|warning|info)[._:-]/i;

// Sources that always report a problem, matched on the start of the id.
const SOURCE_MARKERS: { prefix: RegExp; severity: NotificationSeverity }[] = [
  { prefix: /^update[._-]?fail/i, severity: "error" },
  { prefix: /^repairs?[._:-]/i, severity: "warning" },
  { prefix: /^system[._:-]/i, severity: "info" },
];

/**
 * The severity of a notification. It is read only from the explicit marker in
 * the notification id: a level written at its start wins, then a known source
 * (a repair, an update failure, the system). The words of the title or message
 * are never read, so everything else stays neutral.
 */
export const notificationSeverity = (
  notificationId: string
): NotificationSeverity => {
  const level = LEVEL_MARKER.exec(notificationId);
  if (level) {
    return level[1].toLowerCase() as NotificationSeverity;
  }
  return (
    SOURCE_MARKERS.find((source) => source.prefix.test(notificationId))
      ?.severity ?? "neutral"
  );
};

/** Rank of a severity, 0 for the most urgent. */
export const severityRank = (severity: NotificationSeverity): number =>
  SEVERITIES.indexOf(severity);

/** Most urgent first, then newest first, then by id so the order is stable. */
export const sortBySeverity = <
  T extends { notification_id: string; created_at: string },
>(
  items: readonly T[]
): T[] =>
  [...items].sort(
    (a, b) =>
      severityRank(notificationSeverity(a.notification_id)) -
        severityRank(notificationSeverity(b.notification_id)) ||
      (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0) ||
      a.notification_id.localeCompare(b.notification_id)
  );

/** Keeps the notifications of the chosen severities; none chosen keeps all. */
export const filterBySeverity = <T extends { notification_id: string }>(
  items: readonly T[],
  chosen: readonly NotificationSeverity[]
): T[] =>
  chosen.length
    ? items.filter((item) =>
        chosen.includes(notificationSeverity(item.notification_id))
      )
    : [...items];

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
