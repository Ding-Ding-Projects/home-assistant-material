import type { Connection } from "home-assistant-js-websocket";
import type { ShortcutItem } from "./home_shortcuts";

export interface SurveyInteraction {
  date: string;
  action: "opened" | "dismissed";
}

export interface CoreFrontendUserData {
  showEntityIdPicker?: boolean;
  default_panel?: string;
  apps_info_dismissed?: boolean;
  dashboard_favorite_card_types?: string[];
  /** Cards saved from the dashboard editor tools to insert again later. */
  dashboard_card_templates?: DashboardCardTemplate[];
  /** The user's own card library, with versions. */
  dashboard_card_library?: CardLibraryEntry[];
}

/** One saved version of a card in the user's own card library. */
export interface CardLibraryVersion {
  at: number;
  card: Record<string, unknown>;
}

/** A card kept in the user's own library, with every saved version, newest last. */
export interface CardLibraryEntry {
  id: string;
  name: string;
  created: number;
  versions: CardLibraryVersion[];
}

export interface DashboardCardTemplate {
  id: string;
  name: string;
  created: number;
  cards: Record<string, unknown>[];
}

export interface SidebarFrontendUserData {
  panelOrder?: string[];
  hiddenPanels?: string[];
}

export interface ESPHomeFrontendUserData {
  setupDeferred?: string[];
}

export interface CoreFrontendSystemData {
  default_panel?: string;
  onboarded_version?: string;
  onboarded_date?: string;
  surveys?: {
    onboarding?: SurveyInteraction;
  };
}

export interface HomeFrontendSystemData {
  favorite_entities?: string[];
  welcome_banner_dismissed?: boolean;
  hide_welcome_message?: boolean;
  hide_suggested_entities?: boolean;
  shortcuts?: ShortcutItem[];
}

export type SecurityAlertSeverity = "alert" | "warning";

export interface SecurityAlertEntityConfig {
  entity: string;
  severity?: SecurityAlertSeverity;
}

export interface SecurityFrontendSystemData {
  alert_entities?: SecurityAlertEntityConfig[];
  favorite_entities?: string[];
}

export interface EnergyFrontendSystemData {
  // Stable "<view>.<card-type>" keys of energy dashboard cards the user has
  // hidden. An absent key or array means nothing is hidden (all cards visible),
  // so cards added in the future are shown by default.
  hidden_cards?: string[];
}

/**
 * A per-account copy of a browser-side setting, wrapped with the time it was
 * last changed. `data` is null once the person cleared it. Every reader
 * validates `data` with the owning feature's own validator.
 */
export interface SyncedUserData {
  version: 1;
  updated: number;
  data: unknown;
}

declare global {
  interface FrontendUserData {
    core: CoreFrontendUserData;
    sidebar: SidebarFrontendUserData;
    esphome: ESPHomeFrontendUserData;
    personal_wording: SyncedUserData;
    appearance: SyncedUserData;
    settings_bundle: SyncedUserData;
  }
  interface FrontendSystemData {
    core: CoreFrontendSystemData;
    home: HomeFrontendSystemData;
    energy: EnergyFrontendSystemData;
    security: SecurityFrontendSystemData;
  }
}

export type ValidUserDataKey = keyof FrontendUserData;

export type ValidSystemDataKey = keyof FrontendSystemData;

export const fetchFrontendUserData = async <
  UserDataKey extends ValidUserDataKey,
>(
  conn: Connection,
  key: UserDataKey
): Promise<FrontendUserData[UserDataKey] | null> => {
  const result = await conn.sendMessagePromise<{
    value: FrontendUserData[UserDataKey] | null;
  }>({
    type: "frontend/get_user_data",
    key,
  });
  return result.value;
};

export const saveFrontendUserData = async <
  UserDataKey extends ValidUserDataKey,
>(
  conn: Connection,
  key: UserDataKey,
  value: FrontendUserData[UserDataKey]
): Promise<void> =>
  conn.sendMessagePromise<undefined>({
    type: "frontend/set_user_data",
    key,
    value,
  });

export const subscribeFrontendUserData = <UserDataKey extends ValidUserDataKey>(
  conn: Connection,
  userDataKey: UserDataKey,
  onChange: (data: { value: FrontendUserData[UserDataKey] | null }) => void
) =>
  conn.subscribeMessage<{ value: FrontendUserData[UserDataKey] | null }>(
    onChange,
    {
      type: "frontend/subscribe_user_data",
      key: userDataKey,
    }
  );

export const fetchFrontendSystemData = async <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  key: SystemDataKey
): Promise<FrontendSystemData[SystemDataKey] | null> => {
  const result = await conn.sendMessagePromise<{
    value: FrontendSystemData[SystemDataKey] | null;
  }>({
    type: "frontend/get_system_data",
    key,
  });
  return result.value;
};

export const saveFrontendSystemData = async <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  key: SystemDataKey,
  value: FrontendSystemData[SystemDataKey]
): Promise<void> =>
  conn.sendMessagePromise<undefined>({
    type: "frontend/set_system_data",
    key,
    value,
  });

export const subscribeFrontendSystemData = <
  SystemDataKey extends ValidSystemDataKey,
>(
  conn: Connection,
  systemDataKey: SystemDataKey,
  onChange: (data: { value: FrontendSystemData[SystemDataKey] | null }) => void
) =>
  conn.subscribeMessage<{ value: FrontendSystemData[SystemDataKey] | null }>(
    onChange,
    {
      type: "frontend/subscribe_system_data",
      key: systemDataKey,
    }
  );
