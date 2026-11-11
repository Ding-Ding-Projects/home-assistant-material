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
  /** The SSH host that runs the server; only used by the SSH Docker target. */
  host_id?: string;
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
  /** The stored definition state; the live state comes from the status call. */
  state: string;
  host_id?: string;
  eula_accepted?: boolean;
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
export const minecraftDraftPayload = (draft: MinecraftServerDraft) => {
  const { host_id: hostId, ...rest } = draft;
  return {
    ...rest,
    name: draft.name.trim(),
    ...(hostId ? { host_id: hostId } : {}),
  };
};

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

/**
 * Removes the stored definition. It is refused while the container exists;
 * `force` only skips a host that cannot be reached to check.
 */
export const deleteMinecraftServer = (
  hass: HomeAssistant,
  serverId: string,
  force = false
) =>
  hass.callWS<MinecraftResult<{ ok: true }>>({
    type: "minecraft_manager/delete",
    server_id: serverId,
    force,
  });

/** The EULA page the person has to accept. Shown as text, never opened here. */
export const MINECRAFT_EULA_URL = "https://www.minecraft.net/eula";

/** The container image every server uses. Fixed on the server in const.py. */
export const MINECRAFT_IMAGE = "itzg/minecraft-server:2026.11.0-java21";

export const HOST_LIMITS = { portMin: 1, portMax: 65535 };

const HOSTNAME_PATTERN =
  /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)*$/;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
const IPV6_PATTERN = /^[0-9A-Fa-f:]+$/;
const USER_PATTERN = /^[A-Za-z_][A-Za-z0-9_.-]{0,31}$/;

export interface MinecraftHost {
  id: string;
  name: string;
  address: string;
  port: number;
  user: string;
  /** The public key to add to authorized_keys on the host. */
  public_key: string;
  host_key_fingerprint: string | null;
}

export interface MinecraftHostDraft {
  name: string;
  address: string;
  port: number | undefined;
  user: string;
}

export const emptyMinecraftHostDraft = (): MinecraftHostDraft => ({
  name: "",
  address: "",
  port: 22,
  user: "",
});

const NUMERIC_LABEL_PATTERN = /^(0[xX][0-9A-Fa-f]*|\d+)$/;

const isValidAddress = (value: string): boolean => {
  if (!value || value.length > 253 || value.includes("%")) {
    return false;
  }
  const v4 = IPV4_PATTERN.exec(value);
  if (v4) {
    return v4
      .slice(1)
      .every((part) => Number(part) <= 255 && !/^0\d/.test(part));
  }
  if (value.includes(":")) {
    return IPV6_PATTERN.test(value) && value.length >= 2;
  }
  // A real name ends in a label that is not a number, so 0x7f.1 is refused.
  return (
    HOSTNAME_PATTERN.test(value) &&
    !NUMERIC_LABEL_PATTERN.test(value.slice(value.lastIndexOf(".") + 1))
  );
};

/** Loopback, link-local, unspecified and the name localhost are refused. */
const isForbiddenTarget = (value: string): boolean => {
  const name = value.toLowerCase().replace(/\.$/, "");
  if (name === "localhost" || name.endsWith(".localhost")) {
    return true;
  }
  if (IPV4_PATTERN.test(name)) {
    return /^(127\.|169\.254\.|0\.)/.test(name);
  }
  if (!name.includes(":")) {
    return false;
  }
  return (
    /^(::1?|0*:0*:0*:0*:0*:0*:0*:[01])$/.test(name) || /^fe[89ab]/.test(name)
  );
};

/** The same rules the server applies; the server remains the authority. */
export const validateMinecraftHostDraft = (
  draft: MinecraftHostDraft
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
  const address = draft.address.trim();
  if (!address) {
    errors.push({ field: "address", code: "required" });
  } else if (!isValidAddress(address)) {
    errors.push({ field: "address", code: "invalid_address" });
  } else if (isForbiddenTarget(address)) {
    errors.push({ field: "address", code: "address_not_allowed" });
  }
  if (
    !isInt(draft.port) ||
    draft.port < HOST_LIMITS.portMin ||
    draft.port > HOST_LIMITS.portMax
  ) {
    errors.push({ field: "port", code: "out_of_range" });
  }
  const user = draft.user.trim();
  if (!user) {
    errors.push({ field: "user", code: "required" });
  } else if (!USER_PATTERN.test(user)) {
    errors.push({ field: "user", code: "invalid_user" });
  }
  return errors;
};

/**
 * The command that lets this instance sign in. It creates ~/.ssh with mode
 * 700, starts the entry on a new line, and adds `restrict` so the key cannot
 * forward ports or agents or open a terminal. It can still run commands.
 */
export const authorizedKeysCommand = (publicKey: string): string => {
  const entry = `restrict ${publicKey}`.replace(/'/g, "'\\''");
  return (
    "mkdir -p ~/.ssh && chmod 700 ~/.ssh && " +
    `printf '\\n%s\\n' '${entry}' >> ~/.ssh/authorized_keys && ` +
    "chmod 600 ~/.ssh/authorized_keys"
  );
};

export interface MinecraftHostSaveResult {
  saved: boolean;
  errors: MinecraftFieldError[];
  host?: MinecraftHost;
}

/** An operation that failed carries a stable code and never remote text. */
export interface MinecraftFailure {
  ok: false;
  code: string;
}

export interface MinecraftProbeResult {
  ok: true;
  fingerprint: string;
  /** The key type the host presented, such as ssh-ed25519. */
  algorithm: string;
  /** The type in /etc/ssh/ssh_host_<type>_key.pub, when it is known. */
  key_file_type: string | null;
  status: "new" | "match" | "changed";
  trusted_fingerprint: string | null;
}

export interface MinecraftTestResult {
  ok: true;
  docker_version: string | null;
  address: string;
  lan: boolean;
}

export type MinecraftRunState = "running" | "starting" | "stopped" | "absent";

export interface MinecraftStatus {
  ok: true;
  state: MinecraftRunState;
  started_at: string | null;
  health: string | null;
  /** The host's LAN address as this instance reaches it. */
  address: string;
  port: number;
  /** null when the server is not running, so nothing was checked. */
  reachable: boolean | null;
  already_running?: boolean;
  image?: string;
}

export interface MinecraftLogResult {
  ok: true;
  lines: string[];
}

export type MinecraftResult<T> = T | MinecraftFailure;

export const isMinecraftFailure = <T extends { ok: true }>(
  result: MinecraftResult<T>
): result is MinecraftFailure => result.ok === false;

/** The address to type into Minecraft: address and port. */
export const minecraftJoinAddress = (address: string, port: number): string =>
  address.includes(":") ? `[${address}]:${port}` : `${address}:${port}`;

export interface MinecraftVersionEntry {
  id: string;
  type: "release" | "snapshot";
  released?: string;
}

export interface MinecraftVersionLists {
  fetched_at: string | null;
  vanilla: MinecraftVersionEntry[];
  paper: MinecraftVersionEntry[];
}

export type MinecraftVersionKind = "all" | "release" | "snapshot";

/** The list that matches a flavour, or undefined when it has none. */
export const versionsForFlavour = (
  lists: MinecraftVersionLists | undefined,
  flavour: string
): MinecraftVersionEntry[] | undefined => {
  if (!lists) {
    return undefined;
  }
  if (flavour === "vanilla") {
    return lists.vanilla;
  }
  if (flavour === "paper") {
    return lists.paper;
  }
  return undefined;
};

/** Filters by kind and by what the person typed. Plain text, ignoring case. */
export const filterMinecraftVersions = (
  entries: MinecraftVersionEntry[],
  kind: MinecraftVersionKind,
  query: string
): MinecraftVersionEntry[] => {
  const needle = query.trim().toLowerCase();
  return entries.filter(
    (entry) =>
      (kind === "all" || entry.type === kind) &&
      (!needle || entry.id.toLowerCase().includes(needle))
  );
};

export const fetchMinecraftHosts = (hass: HomeAssistant) =>
  hass.callWS<{ hosts: MinecraftHost[] }>({
    type: "minecraft_manager/hosts/list",
  });

export const createMinecraftHost = (
  hass: HomeAssistant,
  draft: MinecraftHostDraft
) =>
  hass.callWS<MinecraftHostSaveResult>({
    type: "minecraft_manager/hosts/create",
    host: {
      ...draft,
      name: draft.name.trim(),
      address: draft.address.trim(),
      user: draft.user.trim(),
    },
  });

export const deleteMinecraftHost = (hass: HomeAssistant, hostId: string) =>
  hass.callWS<MinecraftResult<{ ok: true }>>({
    type: "minecraft_manager/hosts/delete",
    host_id: hostId,
  });

export const probeMinecraftHost = (hass: HomeAssistant, hostId: string) =>
  hass.callWS<MinecraftResult<MinecraftProbeResult>>({
    type: "minecraft_manager/hosts/probe",
    host_id: hostId,
  });

export const trustMinecraftHost = (
  hass: HomeAssistant,
  hostId: string,
  fingerprint: string,
  replace = false
) =>
  hass.callWS<MinecraftResult<{ ok: true; host: MinecraftHost }>>({
    type: "minecraft_manager/hosts/trust",
    host_id: hostId,
    fingerprint,
    replace,
  });

export const testMinecraftHost = (hass: HomeAssistant, hostId: string) =>
  hass.callWS<MinecraftResult<MinecraftTestResult>>({
    type: "minecraft_manager/hosts/test",
    host_id: hostId,
  });

export const fetchMinecraftVersions = (hass: HomeAssistant) =>
  hass.callWS<MinecraftVersionLists>({
    type: "minecraft_manager/versions/list",
  });

export const refreshMinecraftVersions = (hass: HomeAssistant) =>
  hass.callWS<MinecraftResult<{ ok: true } & MinecraftVersionLists>>({
    type: "minecraft_manager/versions/refresh",
  });

export const setMinecraftEula = (
  hass: HomeAssistant,
  serverId: string,
  accepted: boolean
) =>
  hass.callWS<{ server: MinecraftServer }>({
    type: "minecraft_manager/set_eula",
    server_id: serverId,
    accepted,
  });

export type MinecraftServerAction =
  "start" | "stop" | "restart" | "remove_container";

export const runMinecraftAction = (
  hass: HomeAssistant,
  serverId: string,
  action: MinecraftServerAction
) =>
  hass.callWS<MinecraftResult<MinecraftStatus | { ok: true }>>({
    type: `minecraft_manager/${action}`,
    server_id: serverId,
  });

export const fetchMinecraftStatus = (hass: HomeAssistant, serverId: string) =>
  hass.callWS<MinecraftResult<MinecraftStatus>>({
    type: "minecraft_manager/status",
    server_id: serverId,
  });

export const fetchMinecraftLogs = (
  hass: HomeAssistant,
  serverId: string,
  lines: number
) =>
  hass.callWS<MinecraftResult<MinecraftLogResult>>({
    type: "minecraft_manager/logs",
    server_id: serverId,
    lines,
  });

export const deleteMinecraftData = (
  hass: HomeAssistant,
  serverId: string,
  confirmName: string
) =>
  hass.callWS<MinecraftResult<{ ok: true }>>({
    type: "minecraft_manager/delete_data",
    server_id: serverId,
    confirm_name: confirmName,
  });
