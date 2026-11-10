import type { ReactiveController, ReactiveControllerHost } from "lit";
import {
  isLocked,
  pageLockKey,
  readLocks,
  subscribeLocks,
} from "./element-locks";

/**
 * Tells a page layout whether the page it shows is locked, and asks it to
 * draw again when that changes or when another page is opened.
 */
export class PageLockController implements ReactiveController {
  public locked = false;

  private _unsubscribe?: () => void;

  constructor(private _host: ReactiveControllerHost) {
    this._host.addController(this);
  }

  public hostConnected(): void {
    this._unsubscribe = subscribeLocks(this._check);
    window.addEventListener("location-changed", this._check);
    window.addEventListener("popstate", this._check);
    this._check();
  }

  public hostDisconnected(): void {
    this._unsubscribe?.();
    this._unsubscribe = undefined;
    window.removeEventListener("location-changed", this._check);
    window.removeEventListener("popstate", this._check);
  }

  private _check = (): void => {
    const locked = isLocked(readLocks(), pageLockKey(window.location.pathname));
    if (locked !== this.locked) {
      this.locked = locked;
      this._host.requestUpdate();
    }
  };
}
