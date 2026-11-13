import { mdiLockOpenVariantOutline } from "@mdi/js";
import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import { fireEvent } from "../../../../common/dom/fire_event";
import { setLockLocalize } from "../../../../common/locks/element-lock-session";
import { navigate } from "../../../../common/navigate";
import type { LocalizeKeys } from "../../../../common/translations/localize";
import type {
  WallTabletCommand,
  WallTabletScreen,
} from "../../../../data/wall-tablet";
import {
  announceWallTablet,
  isWallTabletUnavailable,
  subscribeWallTabletCommands,
} from "../../../../data/wall-tablet";
import type { HomeAssistant } from "../../../../types";
import type { WallPanelSettings } from "./wall-panel";
import { tabletIdFromName } from "./wall-panel";

/** The lock the exit from lockdown asks. A convenience lock, not security. */
export const KIOSK_EXIT_LOCK = "wall_tablet:exit";

/** How often a tablet tells the server it is still here, in milliseconds. */
const ANNOUNCE_EVERY_MS = 30000;

/** Whether a motion or occupancy entity just turned on. The first reading never counts. */
export const motionTurnedOn = (
  previous: string | undefined,
  current: string | undefined
): boolean => previous !== undefined && previous !== "on" && current === "on";

/** Whether a path from a command stays inside the interface. */
export const isInterfacePath = (path: unknown): path is string =>
  typeof path === "string" &&
  path.startsWith("/") &&
  !path.startsWith("//") &&
  !path.includes("\\");

export interface WallTabletHooks {
  wake: () => void;
  sleep: () => void;
  screen: () => WallTabletScreen;
}

interface WakeLockSentinelLike {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (type: "release", listener: () => void) => void;
}

/**
 * The parts of wall tablet mode that need the page and the connection:
 * hiding the navigation until the exit lock is opened, waking on motion,
 * asking the browser to keep the screen on, and being reachable by name.
 * Called once a second with the current settings; does nothing while the
 * mode is off.
 */
export class WallTabletMode {
  private _exited = false;

  private _lockdownApplied = false;

  private _exitButton?: HTMLButtonElement;

  private _wakeLock?: WakeLockSentinelLike;

  private _wakeLockPending = false;

  private _motionState?: string;

  private _subscription?: Promise<UnsubscribeFunc>;

  private _subscribedId = "";

  private _connection?: unknown;

  private _lastAnnounce = 0;

  private _lastScreen?: WallTabletScreen;

  private _unavailable = false;

  constructor(private _hooks: WallTabletHooks) {}

  public update(settings: WallPanelSettings, hass?: HomeAssistant): void {
    const kiosk = settings.kiosk;
    this._lockdown(kiosk.enabled && kiosk.lockdown && !this._exited, hass);
    this._keepAwake(kiosk.enabled && kiosk.keepAwake);
    this._motion(kiosk.enabled ? kiosk.motionEntity : "", hass);
    this._remote(kiosk.enabled ? kiosk.name : "", hass);
    if (!kiosk.enabled) {
      this._exited = false;
    }
  }

  public stop(): void {
    this._removeExit();
    this._keepAwake(false);
    this._unsubscribe();
    this._motionState = undefined;
  }

  private _lockdown(wanted: boolean, hass?: HomeAssistant): void {
    if (!wanted) {
      if (this._lockdownApplied) {
        this._lockdownApplied = false;
        fireEvent(window, "hass-kiosk-mode", { enable: false });
      }
      this._removeExit();
      return;
    }
    if (!hass) {
      return;
    }
    if (!this._lockdownApplied && !hass.kioskMode) {
      this._lockdownApplied = true;
      fireEvent(window, "hass-kiosk-mode", { enable: true });
    }
    if (this._lockdownApplied && !this._exitButton) {
      this._addExit(hass);
    }
  }

  private _addExit(hass: HomeAssistant): void {
    const label = hass.localize(
      "ui.panel.lovelace.editor.dashboard_tools.more.wall.exit_label" as LocalizeKeys
    );
    const button = document.createElement("button");
    button.type = "button";
    button.setAttribute("aria-label", label);
    button.title = label;
    Object.assign(button.style, {
      position: "fixed",
      insetBlockEnd: "0",
      insetInlineStart: "0",
      width: "56px",
      height: "56px",
      display: "grid",
      placeItems: "center",
      padding: "0",
      border: "0",
      borderStartEndRadius: "16px",
      background: "transparent",
      color: "var(--secondary-text-color)",
      opacity: "0.35",
      cursor: "pointer",
      zIndex: "9990",
    });
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "24");
    svg.setAttribute("height", "24");
    svg.setAttribute("aria-hidden", "true");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", mdiLockOpenVariantOutline);
    path.setAttribute("fill", "currentColor");
    svg.append(path);
    button.append(svg);
    button.addEventListener("click", () => this._askToLeave(hass, button));
    document.body.append(button);
    this._exitButton = button;
  }

  private _removeExit(): void {
    this._exitButton?.remove();
    this._exitButton = undefined;
  }

  private async _askToLeave(
    hass: HomeAssistant,
    anchor: HTMLElement
  ): Promise<void> {
    setLockLocalize(hass.localize);
    const { openLockPrompt } =
      await import("../../../../components/locks/ha-lock-prompt");
    openLockPrompt(KIOSK_EXIT_LOCK, anchor, {
      grant: false,
      returnTo: anchor,
      onSuccess: () => {
        this._exited = true;
        this._lockdown(false, hass);
      },
    });
  }

  private _keepAwake(wanted: boolean): void {
    if (!wanted) {
      const lock = this._wakeLock;
      this._wakeLock = undefined;
      lock?.release().catch(() => undefined);
      return;
    }
    const wakeLock = (
      navigator as Navigator & {
        wakeLock?: {
          request: (type: "screen") => Promise<WakeLockSentinelLike>;
        };
      }
    ).wakeLock;
    if (
      !wakeLock ||
      this._wakeLockPending ||
      (this._wakeLock && !this._wakeLock.released) ||
      document.visibilityState !== "visible"
    ) {
      return;
    }
    this._wakeLockPending = true;
    wakeLock
      .request("screen")
      .then((sentinel) => {
        this._wakeLock = sentinel;
        sentinel.addEventListener("release", () => {
          if (this._wakeLock === sentinel) {
            this._wakeLock = undefined;
          }
        });
      })
      .catch(() => undefined)
      .finally(() => {
        this._wakeLockPending = false;
      });
  }

  private _motion(entityId: string, hass?: HomeAssistant): void {
    if (!entityId || !hass) {
      this._motionState = undefined;
      return;
    }
    const state = hass.states[entityId]?.state;
    if (motionTurnedOn(this._motionState, state)) {
      this._hooks.wake();
    }
    this._motionState = state;
  }

  private _remote(name: string, hass?: HomeAssistant): void {
    const id = tabletIdFromName(name);
    if (!id || !hass || this._unavailable) {
      if (!id) {
        this._unsubscribe();
      }
      return;
    }
    if (this._subscribedId !== id || this._connection !== hass.connection) {
      this._unsubscribe();
      this._subscribedId = id;
      this._connection = hass.connection;
      this._subscription = subscribeWallTabletCommands(hass, id, (command) =>
        this._handle(command)
      );
      this._subscription.catch((err) => {
        this._unavailable = isWallTabletUnavailable(err);
      });
      this._lastAnnounce = 0;
    }
    const screen = this._hooks.screen();
    const now = Date.now();
    if (
      screen !== this._lastScreen ||
      now - this._lastAnnounce >= ANNOUNCE_EVERY_MS
    ) {
      this._lastScreen = screen;
      this._lastAnnounce = now;
      announceWallTablet(hass, id, name.trim(), screen).catch((err) => {
        this._unavailable = isWallTabletUnavailable(err);
      });
    }
  }

  private _unsubscribe(): void {
    const subscription = this._subscription;
    this._subscription = undefined;
    this._subscribedId = "";
    this._connection = undefined;
    subscription?.then((unsub) => unsub()).catch(() => undefined);
  }

  private _handle(command: WallTabletCommand): void {
    switch (command.command) {
      case "wake":
        this._hooks.wake();
        break;
      case "sleep":
        this._hooks.sleep();
        break;
      case "reload":
        window.location.reload();
        break;
      case "navigate":
        if (isInterfacePath(command.path)) {
          this._hooks.wake();
          navigate(command.path);
        }
        break;
      default:
        break;
    }
  }
}
