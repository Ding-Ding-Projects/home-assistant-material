import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";
import { ERR_UNKNOWN_COMMAND } from "./websocket_api";

/** Commands a wall tablet understands; each only does what a page can do. */
export type WallTabletCommandName = "wake" | "sleep" | "reload" | "navigate";

export type WallTabletScreen = "on" | "screensaver" | "off";

export interface WallTablet {
  tablet_id: string;
  name: string;
  screen: WallTabletScreen;
  /** Seconds since the epoch. */
  last_seen: number;
  online: boolean;
}

export interface WallTabletCommand {
  command: WallTabletCommandName;
  path?: string;
}

/** The server without the wall tablet integration answers with this code. */
export const isWallTabletUnavailable = (err: unknown): boolean =>
  typeof err === "object" &&
  err !== null &&
  (err as { code?: unknown }).code === ERR_UNKNOWN_COMMAND;

export const announceWallTablet = (
  hass: HomeAssistant,
  tabletId: string,
  name: string,
  screen: WallTabletScreen
): Promise<void> =>
  hass.callWS({
    type: "wall_tablet/announce",
    tablet_id: tabletId,
    name,
    screen,
  });

export const subscribeWallTabletCommands = (
  hass: HomeAssistant,
  tabletId: string,
  callback: (command: WallTabletCommand) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<WallTabletCommand>(callback, {
    type: "wall_tablet/subscribe",
    tablet_id: tabletId,
  });

export const fetchWallTablets = (hass: HomeAssistant): Promise<WallTablet[]> =>
  hass.callWS({ type: "wall_tablet/list" });

export const sendWallTabletCommand = (
  hass: HomeAssistant,
  command: WallTabletCommandName,
  tabletId?: string,
  path?: string
): Promise<void> =>
  hass.callWS({
    type: "wall_tablet/command",
    command,
    ...(tabletId ? { tablet_id: tabletId } : {}),
    ...(path ? { path } : {}),
  });

export const forgetWallTablet = (
  hass: HomeAssistant,
  tabletId: string
): Promise<void> =>
  hass.callWS({ type: "wall_tablet/forget", tablet_id: tabletId });
