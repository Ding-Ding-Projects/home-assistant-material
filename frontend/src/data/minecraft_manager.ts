import type { HomeAssistant } from "../types";

export type MinecraftEdition = "java" | "bedrock";

export type MinecraftTarget =
  | "ssh_docker"
  | "supervisor"
  | "docker_socket"
  | "local_process"
  | "ssh_process";

/** Listed in order of preference. The first one is the default. */
export const MINECRAFT_TARGETS: MinecraftTarget[] = [
  "ssh_docker",
  "supervisor",
  "docker_socket",
  "local_process",
  "ssh_process",
];

export const MINECRAFT_EDITIONS: MinecraftEdition[] = ["java", "bedrock"];

export const MINECRAFT_FLAVOURS: Record<MinecraftEdition, string[]> = {
  java: ["vanilla", "paper", "purpur", "spigot", "fabric", "forge", "neoforge"],
  bedrock: ["vanilla"],
};

export const MINECRAFT_LIMITS = {
  nameMax: 48,
  portMin: 1024,
  portMax: 65535,
  memoryMin: 512,
  memoryMax: 65536,
};

const NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9 _.-]*$/;
const VERSION_PATTERN = /^(latest|[A-Za-z0-9][A-Za-z0-9._+-]{0,39})$/;

export interface MinecraftServerDraft {
  name: string;
  edition: MinecraftEdition;
  flavour: string;
  version: string;
  port: number | undefined;
  memory_mb: number | undefined;
  target: MinecraftTarget;
}

export interface MinecraftServer {
  id: string;
  name: string;
  edition: MinecraftEdition;
  flavour: string;
  version: string;
  port: number;
  memory_mb: number;
  target: MinecraftTarget;
  /** Only "defined" exists until starting servers is built. */
  state: string;
}

export interface MinecraftTargetStatus {
  id: MinecraftTarget;
  available: boolean;
  reason: string;
}

export interface MinecraftFieldError {
  field: string;
  code: string;
}

export interface MinecraftSaveResult {
  saved: boolean;
  errors: MinecraftFieldError[];
  server?: MinecraftServer;
}

export const emptyMinecraftDraft = (): MinecraftServerDraft => ({
  name: "",
  edition: "java",
  flavour: "vanilla",
  version: "latest",
  port: 25565,
  memory_mb: 2048,
  target: "ssh_docker",
});

const isInt = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

/** The same rules the server applies; the server remains the authority. */
export const validateMinecraftDraft = (
  draft: MinecraftServerDraft
): MinecraftFieldError[] => {
  const errors: MinecraftFieldError[] = [];
  const name = draft.name.trim();
  if (!name) {
    errors.push({ field: "name", code: "required" });
  } else if (name.length > MINECRAFT_LIMITS.nameMax) {
    errors.push({ field: "name", code: "too_long" });
  } else if (!NAME_PATTERN.test(name)) {
    errors.push({ field: "name", code: "invalid_characters" });
  }
  if (!MINECRAFT_EDITIONS.includes(draft.edition)) {
    errors.push({ field: "edition", code: "invalid_choice" });
  } else if (!MINECRAFT_FLAVOURS[draft.edition].includes(draft.flavour)) {
    errors.push({ field: "flavour", code: "invalid_choice" });
  }
  if (!VERSION_PATTERN.test(draft.version)) {
    errors.push({ field: "version", code: "invalid_version" });
  }
  if (
    !isInt(draft.port) ||
    draft.port < MINECRAFT_LIMITS.portMin ||
    draft.port > MINECRAFT_LIMITS.portMax
  ) {
    errors.push({ field: "port", code: "out_of_range" });
  }
  if (
    !isInt(draft.memory_mb) ||
    draft.memory_mb < MINECRAFT_LIMITS.memoryMin ||
    draft.memory_mb > MINECRAFT_LIMITS.memoryMax
  ) {
    errors.push({ field: "memory_mb", code: "out_of_range" });
  }
  if (!MINECRAFT_TARGETS.includes(draft.target)) {
    errors.push({ field: "target", code: "invalid_choice" });
  }
  return errors;
};

/** Parses a number field; an empty or non-integer entry becomes undefined. */
export const parseMinecraftNumber = (text: string): number | undefined => {
  if (!/^\s*\d+\s*$/.test(text)) {
    return undefined;
  }
  return Number(text);
};

/** The definition sent to the server, with the name trimmed. */
export const minecraftDraftPayload = (draft: MinecraftServerDraft) => ({
  ...draft,
  name: draft.name.trim(),
});

export const fetchMinecraftTargets = (hass: HomeAssistant) =>
  hass.callWS<{ targets: MinecraftTargetStatus[] }>({
    type: "minecraft_manager/targets",
  });

export const fetchMinecraftServers = (hass: HomeAssistant) =>
  hass.callWS<{ servers: MinecraftServer[] }>({
    type: "minecraft_manager/list",
  });

export const createMinecraftServer = (
  hass: HomeAssistant,
  draft: MinecraftServerDraft
) =>
  hass.callWS<MinecraftSaveResult>({
    type: "minecraft_manager/create",
    server: minecraftDraftPayload(draft),
  });

export const updateMinecraftServer = (
  hass: HomeAssistant,
  serverId: string,
  draft: MinecraftServerDraft
) =>
  hass.callWS<MinecraftSaveResult>({
    type: "minecraft_manager/update",
    server_id: serverId,
    server: minecraftDraftPayload(draft),
  });

export const deleteMinecraftServer = (hass: HomeAssistant, serverId: string) =>
  hass.callWS<null>({
    type: "minecraft_manager/delete",
    server_id: serverId,
  });
