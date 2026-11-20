/**
 * Recovery rules for the updates page around a restart of Home Assistant.
 *
 * An update of Home Assistant Core replaces the frontend that the server
 * serves. A page that stays open keeps running the build it loaded, whose
 * files may no longer exist on the server. After the connection comes back
 * and Home Assistant runs again, the page asks the server once whether its
 * build is still served; when it is not, the page reloads itself once, but
 * never while a dialog is open, a form has unsaved changes or a field has
 * focus. The "Update everything" run is kept in the session, so its result
 * still shows after the reload.
 *
 * When the page cannot recover by itself (the connection stays away, or the
 * reload was already done or is not allowed), it says so in a plain sentence
 * and offers a Reload action instead of waiting without end.
 *
 * Plain code, so it can be tested without a page.
 */

/** How long the connection may stay away before the page offers a reload. */
export const DISCONNECT_NOTICE_MS = 60_000;

/** Pause before asking the server again after an unclear answer. */
export const PROBE_RETRY_MS = 10_000;

/** How often an unclear answer is asked again before the page gives up. */
export const PROBE_ATTEMPTS = 3;

/** Session key holding the file that was found gone and reloaded for. */
export const BUILD_RELOAD_KEY = "updatesPageBuildReload";

export type BuildVerdict = "gone" | "present" | "unknown";

export interface BuildProbeResult {
  verdict: BuildVerdict;
  /** The hashed file that was asked about, when there was one. */
  url?: string;
}

export interface RecoveryDeps {
  /** Asks the server whether the loaded build is still served. */
  probe: () => Promise<BuildProbeResult>;
  /** True while a reload would lose something the person is doing. */
  busy: () => boolean;
  /** Reloads onto the current build; false when the reload did not start. */
  reload: () => boolean;
  /** Called when something the page shows has changed. */
  changed: () => void;
  /** Session storage; when unavailable the page never reloads by itself. */
  storage?: Pick<Storage, "getItem" | "setItem">;
  now?: () => number;
}

export interface ConnectionView {
  connected: boolean;
  /** Home Assistant has finished starting. */
  running: boolean;
}

const EDITING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

const EDITING_ROLES = new Set(["slider", "textbox", "spinbutton", "combobox"]);

/**
 * Whether the focused element takes typed input or a dragged value, such as
 * a text field or the slider of a confirmation. A reload then waits.
 */
export const focusIsEditing = (focused: Element | null): boolean => {
  if (!focused) {
    return false;
  }
  if (EDITING_TAGS.has(focused.tagName)) {
    return true;
  }
  if ((focused as HTMLElement).isContentEditable) {
    return true;
  }
  const role = focused.getAttribute("role");
  return role !== null && EDITING_ROLES.has(role);
};

export class UpdatePageRecovery {
  /** Since when the connection is away; undefined while connected. */
  public disconnectedSince?: number;

  /**
   * The server serves a newer build and the page could not reload by
   * itself: it asks the person to reload.
   */
  public newerBuild = false;

  private _checkPending = false;

  private _probing = false;

  private _attempts = 0;

  private _nextProbeAt = 0;

  private _goneUrl?: string;

  private _reloadStarted = false;

  private _sawDisconnect = false;

  constructor(private _deps: RecoveryDeps) {}

  private _now(): number {
    return this._deps.now ? this._deps.now() : Date.now();
  }

  /** Whether the page should show the plain "reload" notice. */
  public noticeDue(): boolean {
    if (this.newerBuild) {
      return true;
    }
    return (
      this.disconnectedSince !== undefined &&
      this._now() - this.disconnectedSince >= DISCONNECT_NOTICE_MS
    );
  }

  /**
   * Called on every change of the connection or of the server state. Starts
   * the build check once after a reconnect, when Home Assistant runs again.
   */
  public update(view: ConnectionView): void {
    if (!view.connected) {
      if (this.disconnectedSince === undefined) {
        this.disconnectedSince = this._now();
        this._deps.changed();
      }
      this._sawDisconnect = true;
      return;
    }
    if (this.disconnectedSince !== undefined) {
      this.disconnectedSince = undefined;
      this._deps.changed();
    }
    if (this._sawDisconnect) {
      // A new reconnect: check the build once Home Assistant runs.
      this._sawDisconnect = false;
      this._checkPending = true;
      this._attempts = 0;
      this._nextProbeAt = 0;
    }
    if (!view.running || this._reloadStarted) {
      return;
    }
    if (this._goneUrl) {
      // The reload waits for the person to finish what they are doing.
      this._tryReload();
      return;
    }
    if (
      this._checkPending &&
      !this._probing &&
      this._now() >= this._nextProbeAt
    ) {
      void this._probe();
    }
  }

  private async _probe(): Promise<void> {
    this._probing = true;
    let result: BuildProbeResult;
    try {
      result = await this._deps.probe();
    } catch (_err) {
      result = { verdict: "unknown" };
    }
    this._probing = false;
    if (result.verdict === "present") {
      this._checkPending = false;
      return;
    }
    if (result.verdict === "gone" && result.url) {
      this._checkPending = false;
      this._goneUrl = result.url;
      this._tryReload();
      return;
    }
    this._attempts++;
    if (this._attempts >= PROBE_ATTEMPTS) {
      // No clear answer: leave the page as it is.
      this._checkPending = false;
      return;
    }
    this._nextProbeAt = this._now() + PROBE_RETRY_MS;
  }

  private _tryReload(): void {
    const url = this._goneUrl;
    if (!url || this._reloadStarted || this.newerBuild) {
      return;
    }
    if (this._deps.busy()) {
      return;
    }
    const storage = this._deps.storage;
    let handledBefore: boolean;
    try {
      if (!storage) {
        throw new Error("No session storage");
      }
      handledBefore = storage.getItem(BUILD_RELOAD_KEY) === url;
      if (!handledBefore) {
        storage.setItem(BUILD_RELOAD_KEY, url);
      }
    } catch (_err) {
      // Without a marker a reload loop cannot be ruled out: ask instead.
      this._askPerson();
      return;
    }
    if (handledBefore) {
      // This build was reloaded for already and is still gone: ask instead.
      this._askPerson();
      return;
    }
    if (this._deps.reload()) {
      this._reloadStarted = true;
      return;
    }
    this._askPerson();
  }

  private _askPerson(): void {
    this.newerBuild = true;
    this._deps.changed();
  }
}
