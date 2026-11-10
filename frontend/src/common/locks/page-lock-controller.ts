import type { ReactiveController, ReactiveControllerHost } from "lit";
import { isUnlocked, subscribeUnlocks } from "./element-lock-session";
import {
  isLocked,
  pageLockKey,
  readLocks,
  subscribeLocks,
} from "./element-locks";
import { runStartupLock } from "./startup-lock";

/**
 * Tells a page layout whether the page it shows is locked, and asks it to
 * draw again when that changes or when another page is opened.
 */
export class PageLockController implements ReactiveController {
  public locked = false;

  private _unsubscribe?: () => void;

  private _unsubscribeUnlocks?: () => void;

  constructor(private _host: ReactiveControllerHost) {
    this._host.addController(this);
  }

  public hostConnected(): void {
    this._unsubscribe = subscribeLocks(this._check);
    this._unsubscribeUnlocks = subscribeUnlocks(this._check);
    window.addEventListener("location-changed", this._check);
    window.addEventListener("popstate", this._check);
    this._check();
    runStartupLock();
  }

  public hostDisconnected(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    this._unsubscribeUnlocks?.();
    this._unsubscribeUnlocks = undefined;
    window.removeEventListener("location-changed", this._check);
    window.removeEventListener("popstate", this._check);
  }

  private _check = (): void => {
    const key = pageLockKey(window.location.pathname);
    // A page lock that was opened for a while is not locked until it ends.
    const locked = isLocked(readLocks(), key) && !isUnlocked(key);
    if (locked !== this.locked) {
      this.locked = locked;
      this._host.requestUpdate();
    }
  };
}
