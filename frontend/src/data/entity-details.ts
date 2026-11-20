/**
 * Pure logic behind "Show more details": how attributes are ordered and
 * written, which editor fits a value, what "Copy everything" copies, and the
 * facts shown for things that are not entities (devices, integration entries,
 * areas, backups and the like).
 */
import { load } from "js-yaml";
import type { HassEntity } from "home-assistant-js-websocket";
import type { HomeAssistant } from "../types";

/** How many attributes are listed before "Show the other N attributes". */
export const ATTRIBUTES_SHOWN_FIRST = 3;

/** A written value longer than this is folded until it is opened. */
export const LONG_VALUE_CHARS = 160;

/** A written value with more lines than this is folded until it is opened. */
export const LONG_VALUE_LINES = 4;

/** A structured value whose compact form is longer than this is indented. */
const COMPACT_LIMIT = 60;

/** The editor that fits a value. */
export type ValueKind = "text" | "number" | "boolean" | "structured";

export const valueKind = (value: unknown): ValueKind => {
  if (typeof value === "boolean") {
    return "boolean";
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return "number";
  }
  if (typeof value === "string") {
    return "text";
  }
  return "structured";
};

/** Attribute names in a stable, case-insensitive alphabetical order. */
export const orderAttributeKeys = (attributes: Record<string, unknown>) =>
  Object.keys(attributes).sort((a, b) => {
    const byName = a.toLowerCase().localeCompare(b.toLowerCase());
    return byName !== 0 ? byName : a.localeCompare(b);
  });

const compact = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(compact).join(", ")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .map(([key, inner]) => `${JSON.stringify(key)}: ${compact(inner)}`)
      .join(", ")}}`;
  }
  if (value === undefined) {
    return "null";
  }
  return JSON.stringify(value) ?? String(value);
};

/**
 * A value written out for reading. Text stays as it is; numbers and switches
 * as they are written; lists and objects as JSON, on one line when short and
 * indented when long.
 */
export const formatDetailValue = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  const short = compact(value);
  if (short.length <= COMPACT_LIMIT) {
    return short;
  }
  return JSON.stringify(value, null, 2) ?? short;
};

/** Whether a written value is long enough to be folded at first. */
export const isLongValue = (text: string): boolean =>
  text.length > LONG_VALUE_CHARS || text.split("\n").length > LONG_VALUE_LINES;

/** The text an editor starts with for a value of the given kind. */
export const editorText = (value: unknown, kind: ValueKind): string => {
  if (kind === "structured") {
    return JSON.stringify(value ?? null, null, 2) ?? "null";
  }
  return value === undefined || value === null ? "" : String(value);
};

export type ParsedValue =
  | { ok: true; value: unknown }
  | { ok: false; error: "not_a_number" | "invalid_structure" };

/** Reads what was typed in an editor back into a value of its kind. */
export const parseEditedValue = (
  kind: ValueKind,
  raw: string | boolean
): ParsedValue => {
  if (kind === "boolean") {
    return { ok: true, value: raw === true || raw === "true" };
  }
  const text = String(raw);
  if (kind === "number") {
    const trimmed = text.trim();
    const parsed = trimmed === "" ? NaN : Number(trimmed);
    return Number.isFinite(parsed)
      ? { ok: true, value: parsed }
      : { ok: false, error: "not_a_number" };
  }
  if (kind === "structured") {
    if (text.trim() === "") {
      return { ok: true, value: null };
    }
    try {
      const value = load(text);
      return { ok: true, value: value === undefined ? null : value };
    } catch (_err) {
      return { ok: false, error: "invalid_structure" };
    }
  }
  return { ok: true, value: text };
};

/** The attributes with one of them replaced, leaving the original intact. */
export const withAttribute = (
  attributes: Record<string, unknown>,
  key: string,
  value: unknown
): Record<string, unknown> => ({ ...attributes, [key]: value });

/** What "Copy everything" copies for an entity. */
export interface EntityCopyInput {
  stateObj: HassEntity;
  uniqueId?: string;
  deviceId?: string | null;
  deviceName?: string;
  platform?: string;
  areaId?: string | null;
  labels?: string[];
}

const copyLine = (key: string, value: unknown): string | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value) && value.length === 0) {
    return undefined;
  }
  const written = formatDetailValue(value);
  return written.includes("\n")
    ? `${key}:\n${written
        .split("\n")
        .map((line) => `  ${line}`)
        .join("\n")}`
    : `${key}: ${written}`;
};

/**
 * A plain-text block with everything shown, using the raw field names so it
 * reads the same in every language and pastes cleanly into a report.
 */
export const entityDetailsCopyText = (input: EntityCopyInput): string => {
  const { stateObj } = input;
  const lines = [
    copyLine("entity_id", stateObj.entity_id),
    copyLine("unique_id", input.uniqueId),
    copyLine("device_id", input.deviceId),
    copyLine("device", input.deviceName),
    copyLine("platform", input.platform),
    copyLine("area_id", input.areaId),
    copyLine("labels", input.labels),
    copyLine("state", stateObj.state),
    copyLine("last_changed", stateObj.last_changed),
    copyLine("last_updated", stateObj.last_updated),
    copyLine(
      "last_reported",
      (stateObj as HassEntity & { last_reported?: string }).last_reported
    ),
  ];
  const attributes = stateObj.attributes as Record<string, unknown>;
  const keys = orderAttributeKeys(attributes);
  const attributeLines = keys
    .map((key) => copyLine(key, attributes[key]))
    .filter((line): line is string => line !== undefined)
    .map((line) =>
      line
        .split("\n")
        .map((part) => `  ${part}`)
        .join("\n")
    );
  const body = lines.filter((line): line is string => line !== undefined);
  if (attributeLines.length) {
    body.push("attributes:", ...attributeLines);
  }
  return body.join("\n");
};

/**
 * Whether a state that was set by hand is still the one shown: the server
 * keeps the context of the write until the next real report replaces it.
 */
export const isStillSetByHand = (
  stateObj: HassEntity | undefined,
  contextId: string | undefined
): boolean => !!stateObj && !!contextId && stateObj.context?.id === contextId;

/** The REST call the states tool uses to set a state by hand. */
export const setEntityStateByHand = (
  hass: Pick<HomeAssistant, "callApi">,
  entityId: string,
  state: string,
  attributes: Record<string, unknown>
) =>
  hass.callApi<HassEntity>("POST", `states/${entityId}`, {
    state,
    attributes,
  });

/* ---------------------------------------------------------------------- */
/* Facts for things that are not entities                                   */
/* ---------------------------------------------------------------------- */

/** How a fact's value is shown. */
export type DetailFactKind =
  "mono" | "text" | "time" | "bytes" | "yesno" | "link";

/** One line in a "Show more details" panel. */
export interface DetailFact {
  /** The fact's name, a key under ui.components.entity_details.fact. */
  key: DetailFactKey;
  /** The raw value; times are ISO strings, sizes are bytes, yes/no is "true" or "false". */
  value: string;
  kind: DetailFactKind;
  /** For a link, where it goes. */
  href?: string;
}

export type DetailFactKey =
  | "device_id"
  | "identifiers"
  | "connections"
  | "manufacturer"
  | "model"
  | "model_id"
  | "firmware"
  | "hardware"
  | "serial_number"
  | "via_device"
  | "config_entries"
  | "entry_id"
  | "domain"
  | "title"
  | "source"
  | "entry_state"
  | "disabled_by"
  | "entity_id"
  | "unique_id"
  | "last_triggered"
  | "mode"
  | "current_runs"
  | "area_id"
  | "floor"
  | "aliases"
  | "backup_id"
  | "size"
  | "protected"
  | "locations"
  | "created"
  | "installed_version"
  | "latest_version"
  | "release_url"
  | "skipped_version";

const fact = (
  key: DetailFactKey,
  value: unknown,
  kind: DetailFactKind = "mono",
  href?: string
): DetailFact | undefined => {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (Array.isArray(value) && value.length === 0) {
    return undefined;
  }
  const written = Array.isArray(value)
    ? value.map((item) => String(item)).join("\n")
    : String(value);
  return href
    ? { key, value: written, kind, href }
    : { key, value: written, kind };
};

const present = (facts: (DetailFact | undefined)[]): DetailFact[] =>
  facts.filter((item): item is DetailFact => item !== undefined);

const pairs = (list: [string, string][] | undefined) =>
  (list ?? []).map(([kind, id]) => `${kind}: ${id}`);

export interface DeviceFactsInput {
  id: string;
  identifiers?: [string, string][];
  connections?: [string, string][];
  manufacturer?: string | null;
  model?: string | null;
  model_id?: string | null;
  sw_version?: string | null;
  hw_version?: string | null;
  serial_number?: string | null;
  via_device_id?: string | null;
  config_entries?: string[];
}

export const deviceFacts = (device: DeviceFactsInput): DetailFact[] =>
  present([
    fact("device_id", device.id),
    fact("identifiers", pairs(device.identifiers)),
    fact("connections", pairs(device.connections)),
    fact("manufacturer", device.manufacturer, "text"),
    fact("model", device.model, "text"),
    fact("model_id", device.model_id),
    fact("firmware", device.sw_version),
    fact("hardware", device.hw_version),
    fact("serial_number", device.serial_number),
    fact(
      "via_device",
      device.via_device_id,
      "link",
      device.via_device_id
        ? `/config/devices/device/${device.via_device_id}`
        : undefined
    ),
    fact("config_entries", device.config_entries),
  ]);

export interface ConfigEntryFactsInput {
  entry_id: string;
  domain: string;
  title?: string;
  source?: string;
  state?: string;
  disabled_by?: string | null;
}

export const configEntryFacts = (entry: ConfigEntryFactsInput): DetailFact[] =>
  present([
    fact("entry_id", entry.entry_id),
    fact("domain", entry.domain),
    fact("title", entry.title, "text"),
    fact("source", entry.source),
    fact("entry_state", entry.state),
    fact("disabled_by", entry.disabled_by),
  ]);

/** Facts for an automation, script or scene, from its state. */
export const runnableFacts = (
  stateObj: HassEntity,
  uniqueId?: string
): DetailFact[] => {
  const attributes = stateObj.attributes as Record<string, unknown>;
  const domain = stateObj.entity_id.split(".")[0];
  const lastTriggered =
    domain === "scene" ? stateObj.state : attributes.last_triggered;
  const validTime =
    typeof lastTriggered === "string" &&
    !Number.isNaN(new Date(lastTriggered).getTime())
      ? lastTriggered
      : undefined;
  return present([
    fact("entity_id", stateObj.entity_id),
    fact("unique_id", uniqueId ?? attributes.id),
    fact("last_triggered", validTime, "time"),
    fact("mode", attributes.mode),
    fact("current_runs", attributes.current),
  ]);
};

export interface AreaFactsInput {
  area_id: string;
  floor_id?: string | null;
  floorName?: string;
  aliases?: string[];
}

export const areaFacts = (area: AreaFactsInput): DetailFact[] =>
  present([
    fact("area_id", area.area_id),
    fact(
      "floor",
      area.floor_id
        ? area.floorName
          ? `${area.floorName} (${area.floor_id})`
          : area.floor_id
        : undefined
    ),
    fact("aliases", area.aliases, "text"),
  ]);

export interface BackupFactsInput {
  backup_id: string;
  date?: string;
  agents?: Record<string, { size: number; protected: boolean }>;
}

export const backupFacts = (backup: BackupFactsInput): DetailFact[] => {
  const agents = Object.entries(backup.agents ?? {});
  const sizes = Array.from(new Set(agents.map(([, agent]) => agent.size)));
  const anyProtected = agents.some(([, agent]) => agent.protected);
  return present([
    fact("backup_id", backup.backup_id),
    sizes.length === 1 ? fact("size", sizes[0], "bytes") : undefined,
    sizes.length > 1
      ? fact(
          "size",
          agents.map(([id, agent]) => `${id}: ${agent.size}`),
          "mono"
        )
      : undefined,
    agents.length
      ? fact("protected", String(anyProtected), "yesno")
      : undefined,
    fact(
      "locations",
      agents.map(([id]) => id)
    ),
    fact("created", backup.date, "time"),
  ]);
};

/** Facts for an update entity. */
export const updateFacts = (stateObj: HassEntity): DetailFact[] => {
  const attributes = stateObj.attributes as Record<string, unknown>;
  const releaseUrl =
    typeof attributes.release_url === "string" &&
    /^https?:\/\//i.test(attributes.release_url)
      ? attributes.release_url
      : undefined;
  return present([
    fact("entity_id", stateObj.entity_id),
    fact("installed_version", attributes.installed_version),
    fact("latest_version", attributes.latest_version),
    fact("release_url", releaseUrl, "link", releaseUrl),
    fact("skipped_version", attributes.skipped_version),
  ]);
};

/** A plain-text block of facts, using the raw field names. */
export const factsCopyText = (facts: DetailFact[]): string =>
  facts
    .map((item) =>
      item.value.includes("\n")
        ? `${item.key}:\n${item.value
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")}`
        : `${item.key}: ${item.value}`
    )
    .join("\n");
