import type { UnsubscribeFunc } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";

export interface AutoUpdateResult {
  time: string;
  version: string | null;
  ok: boolean;
  error: string | null;
}

export interface AutoUpdateEntity {
  entity_id: string;
  // Whether automatic updating applies, counting the switch for everything.
  enabled: boolean;
  // The entity's own choice, or null when it follows the switch for everything.
  override: boolean | null;
  // False for the updates that restart the system.
  allowed: boolean;
  protected_reason: string | null;
  last_result: AutoUpdateResult | null;
}

export interface AutoUpdateInfo {
  all: boolean;
  backup: boolean;
  entities: AutoUpdateEntity[];
}

export const subscribeAutoUpdate = (
  hass: HomeAssistant,
  callback: (info: AutoUpdateInfo) => void
): Promise<UnsubscribeFunc> =>
  hass.connection.subscribeMessage<AutoUpdateInfo>(callback, {
    type: "auto_update/subscribe",
  });

export const setAutoUpdateAll = (
  hass: HomeAssistant,
  enabled: boolean
): Promise<void> => hass.callWS({ type: "auto_update/set_all", enabled });

export const setAutoUpdateBackup = (
  hass: HomeAssistant,
  enabled: boolean
): Promise<void> => hass.callWS({ type: "auto_update/set_backup", enabled });

export const setAutoUpdateEntity = (
  hass: HomeAssistant,
  entityId: string,
  enabled: boolean | null
): Promise<void> =>
  hass.callWS({
    type: "auto_update/set_entity",
    entity_id: entityId,
    enabled,
  });

export interface AutoUpdateRowState {
  checked: boolean;
  disabled: boolean;
  // Why the switch is disabled, when it is.
  reason?: "restarts_system" | "unknown";
}

/**
 * What one row's switch shows: its own choice when it has one, otherwise the
 * switch for everything. An update that restarts the system is always off.
 */
export const autoUpdateRowState = (
  info: AutoUpdateInfo | undefined,
  entityId: string
): AutoUpdateRowState => {
  const entity = info?.entities.find((item) => item.entity_id === entityId);
  if (!info || !entity) {
    return { checked: false, disabled: true, reason: "unknown" };
  }
  if (!entity.allowed) {
    return { checked: false, disabled: true, reason: "restarts_system" };
  }
  return { checked: entity.override ?? info.all, disabled: false };
};

/** The time of the last automatic result as 24-hour hours and minutes. */
export const formatAutoUpdateTime = (iso: string, locale?: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
};
