/**
 * Pure logic of the room setup wizard: which devices belong to a room by
 * name, which starter automations fit what the room has, the automation
 * configurations those starters produce, and the saved draft.
 *
 * Nothing here talks to the server or to the DOM.
 */

export type DeviceKind =
  "light" | "opening" | "motion" | "temperature" | "plug" | "other";

export type NeedKind = "light" | "opening" | "motion" | "temperature";

export type StarterId =
  | "light_when_dark"
  | "open_too_long"
  | "motion_light"
  | "temp_high"
  | "temp_low";

export const WIZARD_STEPS = ["name", "devices", "starters", "done"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

/** The most a device name may be shorter than before a name match is ignored. */
const MIN_MATCH_LENGTH = 2;

const OPENING_CLASSES = ["door", "window", "opening", "garage_door"];
const MOTION_CLASSES = ["motion", "occupancy", "presence"];

/** Defaults for the temperature starters; the editor lets people change them. */
export const TEMP_HIGH_DEFAULT = 26;
export const TEMP_LOW_DEFAULT = 16;
export const OPEN_MINUTES = 10;
export const MOTION_OFF_MINUTES = 5;

export interface DeviceInput {
  id: string;
  name: string;
  areaId: string | null;
  disabled?: boolean;
  isService?: boolean;
}

export interface EntityInput {
  entityId: string;
  deviceId?: string | null;
  hidden?: boolean;
  /** Set for configuration and diagnostic entities, which are ignored. */
  category?: string | null;
  deviceClass?: string | null;
}

export interface WizardEntity {
  entityId: string;
  kind: DeviceKind;
}

export interface WizardDevice {
  id: string;
  name: string;
  areaId: string | null;
  kind: DeviceKind;
  kinds: DeviceKind[];
  entities: WizardEntity[];
}

const KIND_PRIORITY: DeviceKind[] = [
  "light",
  "motion",
  "opening",
  "temperature",
  "plug",
  "other",
];

export const domainOf = (entityId: string): string =>
  entityId.slice(0, Math.max(entityId.indexOf("."), 0));

export const classifyEntity = (
  entityId: string,
  deviceClass?: string | null
): DeviceKind => {
  const domain = domainOf(entityId);
  if (domain === "light") {
    return "light";
  }
  if (domain === "binary_sensor") {
    if (deviceClass && OPENING_CLASSES.includes(deviceClass)) {
      return "opening";
    }
    if (deviceClass && MOTION_CLASSES.includes(deviceClass)) {
      return "motion";
    }
    return "other";
  }
  if (domain === "sensor") {
    return deviceClass === "temperature" ? "temperature" : "other";
  }
  if (domain === "switch") {
    return "plug";
  }
  return "other";
};

/** Groups entities by device and gives every device its kinds. */
export const buildWizardDevices = (
  devices: DeviceInput[],
  entities: EntityInput[]
): WizardDevice[] => {
  const byDevice = new Map<string, WizardEntity[]>();
  for (const entity of entities) {
    if (!entity.deviceId || entity.hidden || entity.category) {
      continue;
    }
    const list = byDevice.get(entity.deviceId) ?? [];
    list.push({
      entityId: entity.entityId,
      kind: classifyEntity(entity.entityId, entity.deviceClass),
    });
    byDevice.set(entity.deviceId, list);
  }
  return devices
    .filter((device) => !device.disabled && !device.isService)
    .map((device) => {
      const deviceEntities = byDevice.get(device.id) ?? [];
      const present = new Set(deviceEntities.map((entity) => entity.kind));
      const kinds = KIND_PRIORITY.filter((kind) => present.has(kind));
      return {
        id: device.id,
        name: device.name,
        areaId: device.areaId,
        kind: kinds[0] ?? "other",
        kinds,
        entities: deviceEntities,
      };
    });
};

const normalize = (text: string): string =>
  text.normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();

/** True when the device name contains the room name. */
export const nameMatchesRoom = (
  deviceName: string,
  roomName: string
): boolean => {
  const room = normalize(roomName);
  if (room.length < MIN_MATCH_LENGTH) {
    return false;
  }
  return normalize(deviceName).includes(room);
};

/** Devices that have no room yet, sorted by name. */
export const unassignedDevices = (devices: WizardDevice[]): WizardDevice[] =>
  devices
    .filter((device) => !device.areaId)
    .sort((a, b) => a.name.localeCompare(b.name));

/**
 * The ids of the devices whose name contains the room name. Nothing else is
 * guessed.
 */
export const preselectByName = (
  devices: WizardDevice[],
  roomName: string
): string[] =>
  devices
    .filter((device) => nameMatchesRoom(device.name, roomName))
    .map((device) => device.id);

export interface RoomCapabilities {
  light: string[];
  opening: string[];
  motion: string[];
  temperature: string[];
}

/** The entities a room has, by what an automation can use them for. */
export const roomCapabilities = (devices: WizardDevice[]): RoomCapabilities => {
  const caps: RoomCapabilities = {
    light: [],
    opening: [],
    motion: [],
    temperature: [],
  };
  for (const device of devices) {
    for (const entity of device.entities) {
      if (entity.kind in caps) {
        caps[entity.kind as NeedKind].push(entity.entityId);
      }
    }
  }
  return caps;
};

interface StarterDefinition {
  id: StarterId;
  needs: NeedKind[];
}

export const STARTER_DEFINITIONS: StarterDefinition[] = [
  { id: "light_when_dark", needs: ["light"] },
  { id: "open_too_long", needs: ["opening"] },
  { id: "motion_light", needs: ["motion", "light"] },
  { id: "temp_high", needs: ["temperature"] },
  { id: "temp_low", needs: ["temperature"] },
];

export interface StarterOffer {
  id: StarterId;
  needs: NeedKind[];
  missing: NeedKind[];
  available: boolean;
}

/**
 * Every starter, with what it needs and what the room is missing. A starter
 * whose need is missing is not available.
 */
export const offerStarters = (devices: WizardDevice[]): StarterOffer[] => {
  const caps = roomCapabilities(devices);
  return STARTER_DEFINITIONS.map(({ id, needs }) => {
    const missing = needs.filter((need) => caps[need].length === 0);
    return { id, needs, missing, available: missing.length === 0 };
  });
};

export type StarterText = (
  key: string,
  values?: Record<string, string | number>
) => string;

export interface RoomAutomationConfig {
  alias: string;
  description: string;
  /** Starters are created switched off. */
  initial_state: false;
  mode: "single" | "restart";
  triggers: Record<string, unknown>[];
  conditions: Record<string, unknown>[];
  actions: Record<string, unknown>[];
}

const notify = (title: string, message: string): Record<string, unknown> => ({
  action: "persistent_notification.create",
  data: { title, message },
});

const base = (
  alias: string,
  description: string,
  triggers: Record<string, unknown>[],
  actions: Record<string, unknown>[],
  mode: "single" | "restart" = "single"
): RoomAutomationConfig => ({
  alias,
  description,
  initial_state: false,
  mode,
  triggers,
  conditions: [],
  actions,
});

/**
 * The automation a starter produces for a room, built only from standard
 * triggers, conditions and actions with the real entity ids of the room.
 * Returns undefined when the room lacks what the starter needs.
 */
export const buildStarterConfig = (
  id: StarterId,
  roomName: string,
  caps: RoomCapabilities,
  text: StarterText
): RoomAutomationConfig | undefined => {
  const values = {
    room: roomName,
    open_minutes: OPEN_MINUTES,
    off_minutes: MOTION_OFF_MINUTES,
    high: TEMP_HIGH_DEFAULT,
    low: TEMP_LOW_DEFAULT,
  };
  const prefix = `ui.panel.config.areas.room_wizard.starter.${id}.`;
  const title = text(`${prefix}title`, values);
  const description = text(`${prefix}description`, values);
  const message = () => text(`${prefix}message`, values);
  switch (id) {
    case "light_when_dark":
      if (!caps.light.length) {
        return undefined;
      }
      return base(
        title,
        description,
        [{ trigger: "sun", event: "sunset", offset: 0 }],
        [
          {
            action: "light.turn_on",
            target: { entity_id: [...caps.light] },
          },
        ]
      );
    case "open_too_long":
      if (!caps.opening.length) {
        return undefined;
      }
      return base(
        title,
        description,
        [
          {
            trigger: "state",
            entity_id: [...caps.opening],
            to: "on",
            for: { minutes: OPEN_MINUTES },
          },
        ],
        [notify(title, message())]
      );
    case "motion_light":
      if (!caps.motion.length || !caps.light.length) {
        return undefined;
      }
      return base(
        title,
        description,
        [
          {
            trigger: "state",
            entity_id: [...caps.motion],
            to: "on",
            id: "motion_on",
          },
          {
            trigger: "state",
            entity_id: [...caps.motion],
            to: "off",
            for: { minutes: MOTION_OFF_MINUTES },
            id: "motion_off",
          },
        ],
        [
          {
            choose: [
              {
                conditions: [{ condition: "trigger", id: ["motion_on"] }],
                sequence: [
                  {
                    action: "light.turn_on",
                    target: { entity_id: [...caps.light] },
                  },
                ],
              },
              {
                conditions: [{ condition: "trigger", id: ["motion_off"] }],
                sequence: [
                  {
                    action: "light.turn_off",
                    target: { entity_id: [...caps.light] },
                  },
                ],
              },
            ],
          },
        ],
        "restart"
      );
    case "temp_high":
      if (!caps.temperature.length) {
        return undefined;
      }
      return base(
        title,
        description,
        [
          {
            trigger: "numeric_state",
            entity_id: [...caps.temperature],
            above: TEMP_HIGH_DEFAULT,
          },
        ],
        [notify(title, message())]
      );
    case "temp_low":
      if (!caps.temperature.length) {
        return undefined;
      }
      return base(
        title,
        description,
        [
          {
            trigger: "numeric_state",
            entity_id: [...caps.temperature],
            below: TEMP_LOW_DEFAULT,
          },
        ],
        [notify(title, message())]
      );
    default:
      return undefined;
  }
};

// ---- draft -----------------------------------------------------------

export const DRAFT_VERSION = 1;
const DRAFT_KEY_PREFIX = "ha-room-wizard-draft:";

export interface RoomDraft {
  version: typeof DRAFT_VERSION;
  step: WizardStep;
  name: string;
  floorId: string | null;
  icon: string | null;
  /** Set once the room exists on the server. */
  areaId: string | null;
  selectedDeviceIds: string[];
  /** Devices already moved into the room, so a retry never repeats them. */
  assignedDeviceIds: string[];
  /** The room name the name-based ticks were made for, so going back never re-ticks. */
  preselectedFor: string | null;
  selectedStarterIds: StarterId[];
  /** Starters already saved, by starter id: the automation id. */
  createdAutomations: Partial<Record<StarterId, string>>;
}

export const emptyDraft = (): RoomDraft => ({
  version: DRAFT_VERSION,
  step: "name",
  name: "",
  floorId: null,
  icon: null,
  areaId: null,
  selectedDeviceIds: [],
  assignedDeviceIds: [],
  preselectedFor: null,
  selectedStarterIds: [],
  createdAutomations: {},
});

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const draftKey = (userId: string | undefined): string =>
  `${DRAFT_KEY_PREFIX}${userId ?? "anonymous"}`;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

/** Reads a draft back, ignoring anything that does not look like one. */
export const parseDraft = (raw: string | null): RoomDraft | undefined => {
  if (!raw) {
    return undefined;
  }
  try {
    const value = JSON.parse(raw);
    if (
      !value ||
      value.version !== DRAFT_VERSION ||
      !WIZARD_STEPS.includes(value.step) ||
      typeof value.name !== "string" ||
      !isStringArray(value.selectedDeviceIds) ||
      !isStringArray(value.assignedDeviceIds) ||
      !isStringArray(value.selectedStarterIds)
    ) {
      return undefined;
    }
    const known = STARTER_DEFINITIONS.map((starter) => starter.id);
    const created: Partial<Record<StarterId, string>> = {};
    for (const [key, automationId] of Object.entries(
      value.createdAutomations ?? {}
    )) {
      if (
        known.includes(key as StarterId) &&
        typeof automationId === "string"
      ) {
        created[key as StarterId] = automationId;
      }
    }
    return {
      version: DRAFT_VERSION,
      step: value.step,
      name: value.name,
      floorId: typeof value.floorId === "string" ? value.floorId : null,
      icon: typeof value.icon === "string" ? value.icon : null,
      areaId: typeof value.areaId === "string" ? value.areaId : null,
      selectedDeviceIds: value.selectedDeviceIds,
      assignedDeviceIds: value.assignedDeviceIds,
      preselectedFor:
        typeof value.preselectedFor === "string" ? value.preselectedFor : null,
      selectedStarterIds: value.selectedStarterIds.filter((id: string) =>
        known.includes(id as StarterId)
      ) as StarterId[],
      createdAutomations: created,
    };
  } catch (_err) {
    return undefined;
  }
};

export const saveDraft = (
  storage: DraftStorage,
  userId: string | undefined,
  draft: RoomDraft
): boolean => {
  try {
    storage.setItem(draftKey(userId), JSON.stringify(draft));
    return true;
  } catch (_err) {
    return false;
  }
};

export const loadDraft = (
  storage: DraftStorage,
  userId: string | undefined
): RoomDraft | undefined => {
  try {
    return parseDraft(storage.getItem(draftKey(userId)));
  } catch (_err) {
    return undefined;
  }
};

export const clearDraft = (
  storage: DraftStorage,
  userId: string | undefined
): void => {
  try {
    storage.removeItem(draftKey(userId));
  } catch (_err) {
    // Storage is unavailable; there is nothing to clear.
  }
};

export interface AreaCreateParams {
  name: string;
  floor_id?: string;
  icon?: string;
}

/**
 * The values for creating a room. Optional keys are left out when empty,
 * because the server rejects null for them.
 */
export const buildAreaCreateParams = (
  draft: Pick<RoomDraft, "name" | "floorId" | "icon">
): AreaCreateParams => {
  const params: AreaCreateParams = { name: draft.name.trim() };
  if (draft.floorId) {
    params.floor_id = draft.floorId;
  }
  if (draft.icon) {
    params.icon = draft.icon;
  }
  return params;
};

/** A new automation id; the editor uses the time in milliseconds too. */
export const newAutomationId = (index: number, now = Date.now()): string =>
  String(now + index);
