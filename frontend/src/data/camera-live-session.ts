/**
 * Live video of a camera, shared and rate limited.
 *
 * Some camera services allow only a few live-video commands per minute for the
 * whole account. A page that asks again for every view, every return to the
 * tab or every redraw uses that allowance up and then every view fails. This
 * module keeps one live session per camera for everything in the browser that
 * shows it, and remembers a growing wait after the service says "too many
 * requests".
 */

/** Waits in seconds after a refusal for too many requests: each one longer than the last. */
export const RATE_LIMIT_WAITS_SECONDS = [60, 120, 300];

const STORAGE_KEY = "camera-live-limits";

const RATE_LIMIT_WORDS = [
  "429",
  "resource_exhausted",
  "too many requests",
  "rate limit",
  "rate-limit",
  "ratelimit",
  "quota",
];

/** Whether an error text says the service is limiting how often it can be asked. */
export const isRateLimitMessage = (message?: string | null): boolean => {
  if (!message) {
    return false;
  }
  const lowered = message.toLowerCase();
  return RATE_LIMIT_WORDS.some((word) => lowered.includes(word));
};

/** The wait in seconds after the given number of refusals in a row (1 for the first). */
export const rateLimitWaitSeconds = (refusals: number): number =>
  RATE_LIMIT_WAITS_SECONDS[
    Math.min(Math.max(refusals, 1), RATE_LIMIT_WAITS_SECONDS.length) - 1
  ];

/** Minutes and seconds, for example 0:42. */
export const formatCountdown = (seconds: number): string => {
  const whole = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${minutes}:${rest.toString().padStart(2, "0")}`;
};

export type LiveViewKind =
  "live" | "starting" | "limited" | "offline" | "error" | "placeholder";

export interface LiveViewInput {
  /** The camera entity's state, for example "idle", "streaming" or "unavailable" */
  entityState?: string;
  /** Video is really playing */
  playing: boolean;
  /** The text of the last error from starting video, if any */
  error?: string;
  /** Seconds left of a wait after a refusal for too many requests */
  limitedSeconds: number;
  /** The camera only offers live video through its provider, and nobody tapped yet */
  waitingForTap: boolean;
}

/** What the picture area should show. Playing video always wins over any message. */
export const computeLiveView = (input: LiveViewInput): LiveViewKind => {
  if (input.playing) {
    return "live";
  }
  if (input.limitedSeconds > 0) {
    return "limited";
  }
  if (input.error) {
    return isRateLimitMessage(input.error) ? "limited" : "error";
  }
  if (input.entityState === "unavailable") {
    return "offline";
  }
  if (input.waitingForTap) {
    return "placeholder";
  }
  return "starting";
};

/** Whether a player may ask for live video now. */
export const mayStartLive = (input: {
  visible: boolean;
  limitedSeconds: number;
  waitingForTap: boolean;
}): boolean =>
  input.visible && input.limitedSeconds <= 0 && !input.waitingForTap;

interface LimitRecord {
  refusals: number;
  /** milliseconds since the epoch */
  until: number;
}

export interface LiveListener {
  /** The shared stream changed; undefined while there is none */
  onStream: (stream?: MediaStream) => void;
  /** The one that held the session left; this viewer must start it now */
  onPromote: () => void;
  /** The session failed for everyone */
  onError: (message: string) => void;
  /** A wait started, changed or ended */
  onLimit: () => void;
}

interface Session {
  owner?: string;
  stream?: MediaStream;
  members: Map<string, LiveListener>;
}

export class CameraLiveRegistry {
  private _sessions = new Map<string, Session>();

  private _limits = new Map<string, LimitRecord>();

  private _storage?: Pick<Storage, "getItem" | "setItem">;

  constructor(storage?: Pick<Storage, "getItem" | "setItem">) {
    this._storage = storage;
    this._load();
  }

  /**
   * Join the live view of a camera. The first to join holds the session and
   * must start it; later ones show its stream.
   */
  public join(
    entityId: string,
    id: string,
    listener: LiveListener
  ): "owner" | "viewer" {
    let session = this._sessions.get(entityId);
    if (!session) {
      session = { members: new Map() };
      this._sessions.set(entityId, session);
    }
    session.members.set(id, listener);
    if (!session.owner) {
      session.owner = id;
      return "owner";
    }
    if (session.stream) {
      listener.onStream(session.stream);
    }
    return "viewer";
  }

  public role(entityId: string, id: string): "owner" | "viewer" | undefined {
    const session = this._sessions.get(entityId);
    if (!session?.members.has(id)) {
      return undefined;
    }
    return session.owner === id ? "owner" : "viewer";
  }

  /** The holder shares its playing stream with every viewer. */
  public publish(entityId: string, id: string, stream?: MediaStream): void {
    const session = this._sessions.get(entityId);
    if (!session || session.owner !== id) {
      return;
    }
    session.stream = stream;
    session.members.forEach((listener, memberId) => {
      if (memberId !== id) {
        listener.onStream(stream);
      }
    });
  }

  /** The holder failed; viewers are told too, and nobody asks again by itself. */
  public fail(entityId: string, id: string, message: string): void {
    const session = this._sessions.get(entityId);
    if (!session || session.owner !== id) {
      return;
    }
    session.stream = undefined;
    session.members.forEach((listener, memberId) => {
      if (memberId !== id) {
        listener.onError(message);
      }
    });
  }

  /** Leave. When the holder leaves, the next viewer takes over. */
  public leave(entityId: string, id: string): void {
    const session = this._sessions.get(entityId);
    if (!session) {
      return;
    }
    session.members.delete(id);
    if (session.owner !== id) {
      return;
    }
    session.owner = undefined;
    session.stream = undefined;
    const next = session.members.entries().next();
    if (next.done) {
      this._sessions.delete(entityId);
      return;
    }
    const [nextId, listener] = next.value;
    session.owner = nextId;
    session.members.forEach((member, memberId) => {
      if (memberId !== nextId) {
        member.onStream(undefined);
      }
    });
    listener.onPromote();
  }

  /** Whether a shared stream is already playing for this camera. */
  public hasStream(entityId: string): boolean {
    return Boolean(this._sessions.get(entityId)?.stream);
  }

  public viewerCount(entityId: string): number {
    return this._sessions.get(entityId)?.members.size ?? 0;
  }

  /** Seconds left of the wait after a refusal for too many requests, 0 when none. */
  public limitedSeconds(entityId: string, now = Date.now()): number {
    const record = this._limits.get(entityId);
    if (!record) {
      return 0;
    }
    return Math.max(0, Math.ceil((record.until - now) / 1000));
  }

  /** How many refusals in a row are remembered for this camera. */
  public refusals(entityId: string): number {
    return this._limits.get(entityId)?.refusals ?? 0;
  }

  /** Remember a refusal and start the next, longer wait. Returns the wait in seconds. */
  public recordRateLimit(entityId: string, now = Date.now()): number {
    const refusals = (this._limits.get(entityId)?.refusals ?? 0) + 1;
    const wait = rateLimitWaitSeconds(refusals);
    this._limits.set(entityId, { refusals, until: now + wait * 1000 });
    this._save();
    this._notifyLimit(entityId);
    return wait;
  }

  /** "Try now": ends the wait but keeps the count, so a new refusal waits longer. */
  public skipWait(entityId: string): void {
    const record = this._limits.get(entityId);
    if (!record) {
      return;
    }
    record.until = 0;
    this._save();
    this._notifyLimit(entityId);
  }

  /** Video played: forget the refusals. */
  public recordSuccess(entityId: string): void {
    if (this._limits.delete(entityId)) {
      this._save();
      this._notifyLimit(entityId);
    }
  }

  private _notifyLimit(entityId: string) {
    this._sessions
      .get(entityId)
      ?.members.forEach((listener) => listener.onLimit());
  }

  private _load() {
    try {
      const raw = this._storage?.getItem(STORAGE_KEY);
      if (!raw) {
        return;
      }
      const data = JSON.parse(raw) as Record<string, LimitRecord>;
      Object.entries(data).forEach(([entityId, record]) => {
        if (
          typeof record?.refusals === "number" &&
          typeof record?.until === "number"
        ) {
          this._limits.set(entityId, record);
        }
      });
    } catch (_err) {
      // The memory is only a convenience; start empty.
    }
  }

  private _save() {
    try {
      this._storage?.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(this._limits))
      );
    } catch (_err) {
      // Private browsing can refuse storage; the wait still holds in memory.
    }
  }
}

const sessionStorageOrUndefined = (): Storage | undefined => {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch (_err) {
    return undefined;
  }
};

/** The one registry of this browser tab. */
export const cameraLive = new CameraLiveRegistry(sessionStorageOrUndefined());
