import type { PersistentNotification } from "../../../data/persistent_notification";

/** How long a dismissed notification is kept in this browser. */
export const DISMISSED_KEEP_DAYS = 30;

/** The most dismissed notifications kept at once. */
export const DISMISSED_LIMIT = 200;

export const DISMISSED_STORAGE_KEY = "ha-dismissed-notifications";

export interface DismissedNotification extends PersistentNotification {
  /** ISO 8601 moment the notification was dismissed. */
  dismissed_at: string;
}

const DAY_MS = 86400000;

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const defaultStorage = (): StorageLike | undefined => {
  try {
    return window.localStorage;
  } catch (_err: any) {
    return undefined;
  }
};

const isEntry = (value: unknown): value is DismissedNotification => {
  if (!value || typeof value !== "object") {
    return false;
  }
  const item = value as Record<string, unknown>;
  return (
    typeof item.notification_id === "string" &&
    typeof item.message === "string" &&
    typeof item.created_at === "string" &&
    typeof item.dismissed_at === "string" &&
    !Number.isNaN(Date.parse(item.dismissed_at)) &&
    (item.title === null || typeof item.title === "string")
  );
};

/** Drops entries older than the keeping time, and the oldest past the limit. */
export const pruneDismissed = (
  entries: DismissedNotification[],
  now = Date.now()
): DismissedNotification[] =>
  entries
    .filter(
      (entry) =>
        now - Date.parse(entry.dismissed_at) < DISMISSED_KEEP_DAYS * DAY_MS
    )
    .sort((a, b) => Date.parse(b.dismissed_at) - Date.parse(a.dismissed_at))
    .slice(0, DISMISSED_LIMIT);

/** The dismissed notifications still kept, newest dismissal first. */
export const loadDismissed = (
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now()
): DismissedNotification[] => {
  try {
    const raw = storage?.getItem(DISMISSED_STORAGE_KEY);
    if (!raw) {
      return [];
    }
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed)
      ? pruneDismissed(parsed.filter(isEntry), now)
      : [];
  } catch (_err: any) {
    return [];
  }
};

const save = (
  entries: DismissedNotification[],
  storage: StorageLike | undefined
): void => {
  try {
    if (entries.length) {
      storage?.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(entries));
    } else {
      storage?.removeItem(DISMISSED_STORAGE_KEY);
    }
  } catch (_err: any) {
    // Storage that is full or blocked only means nothing is kept.
  }
};

/** Keeps the given notifications as dismissed now. Returns what is kept. */
export const rememberDismissed = (
  notifications: PersistentNotification[],
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now()
): DismissedNotification[] => {
  const dismissedAt = new Date(now).toISOString();
  const added = notifications.map((item) => ({
    notification_id: item.notification_id,
    title: item.title,
    message: item.message,
    created_at: item.created_at,
    dismissed_at: dismissedAt,
  }));
  const ids = new Set(added.map((item) => item.notification_id));
  const kept = pruneDismissed(
    [
      ...added,
      ...loadDismissed(storage, now).filter(
        (item) => !ids.has(item.notification_id)
      ),
    ],
    now
  );
  save(kept, storage);
  return kept;
};

/** Forgets one dismissed notification, or all of them with no id. */
export const forgetDismissed = (
  notificationId?: string,
  storage: StorageLike | undefined = defaultStorage(),
  now = Date.now()
): DismissedNotification[] => {
  const kept = notificationId
    ? loadDismissed(storage, now).filter(
        (item) => item.notification_id !== notificationId
      )
    : [];
  save(kept, storage);
  return kept;
};
