import { dump, load, YAML11_SCHEMA } from "js-yaml";

export type TransferKind = "automation" | "script" | "scene";

export type PrivateKind = "webhook" | "secret" | "location";

export interface PrivateFinding {
  kind: PrivateKind;
  count: number;
}

const SECRET_KEY =
  /(^|[_-])(pass(word|wd)?|token|api[_-]?key|apikey|secret|credentials?|auth)([_-]|$)/i;
const LOCATION_KEYS = new Set(["latitude", "longitude", "lat", "lon", "lng"]);

/** The YAML an editor's YAML view shows for these items. */
export const exportYaml = (configs: Record<string, any>[]): string =>
  dump(configs.length === 1 ? configs[0] : configs, {
    schema: YAML11_SCHEMA,
    noRefs: true,
  });

/** A file name made from an item's name, with the extension. */
export const exportFileName = (
  name: string | undefined,
  kind: TransferKind,
  count = 1
): string => {
  if (count > 1) {
    return `${kind}s.yaml`;
  }
  const slug = (name ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || kind}.yaml`;
};

const walk = (
  value: unknown,
  visit: (key: string | undefined, value: unknown) => void,
  key?: string
): void => {
  visit(key, value);
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visit, key));
  } else if (value && typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) =>
      walk(v, visit, k)
    );
  }
};

/** Find things in items that someone may not want to hand to others. */
export const detectPrivateContent = (
  configs: Record<string, any>[]
): PrivateFinding[] => {
  const counts: Record<PrivateKind, number> = {
    webhook: 0,
    secret: 0,
    location: 0,
  };
  for (const config of configs) {
    walk(config, (key, value) => {
      if (!key) {
        return;
      }
      if (key === "webhook_id" && typeof value === "string" && value) {
        counts.webhook++;
      } else if (
        SECRET_KEY.test(key) &&
        typeof value === "string" &&
        value.trim() !== ""
      ) {
        counts.secret++;
      } else if (
        LOCATION_KEYS.has(key.toLowerCase()) &&
        typeof value === "number"
      ) {
        counts.location++;
      }
    });
  }
  return (Object.keys(counts) as PrivateKind[])
    .filter((kind) => counts[kind] > 0)
    .map((kind) => ({ kind, count: counts[kind] }));
};

export interface ImportSummary {
  name: string;
  triggers: number;
  conditions: number;
  actions: number;
}

export interface ImportItem {
  index: number;
  config: Record<string, any>;
  /** The id the file gave the item, when it had one. */
  originalId?: string;
  /** That id already belongs to an item in this home. */
  idClash: boolean;
  summary: ImportSummary;
}

export type ImportRefusal =
  | { reason: "invalid_yaml"; detail: string }
  | { reason: "empty"; detail: "" }
  | { reason: "not_config"; detail: string };

export type ImportResult =
  { ok: true; items: ImportItem[] } | ({ ok: false } & ImportRefusal);

const asList = (value: unknown): unknown[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

const isRecord = (value: unknown): value is Record<string, any> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const HAS_CONTENT: Record<TransferKind, string[]> = {
  automation: ["triggers", "trigger", "actions", "action", "use_blueprint"],
  script: ["sequence", "use_blueprint"],
  scene: ["entities"],
};

const checkItem = (
  value: unknown,
  kind: TransferKind
): { config?: Record<string, any>; detail?: string } => {
  if (!isRecord(value)) {
    return { detail: "it is not a mapping of settings" };
  }
  if (isRecord(value.blueprint) && "domain" in value.blueprint) {
    return { detail: "it is a blueprint file, which is not supported" };
  }
  if (kind === "automation" && "automation" in value) {
    return { detail: "it is a whole configuration file, not one automation" };
  }
  if (kind === "script" && "script" in value) {
    return { detail: "it is a whole configuration file, not one script" };
  }
  if (kind === "scene" && "scene" in value) {
    return { detail: "it is a whole configuration file, not one scene" };
  }
  if (!HAS_CONTENT[kind].some((key) => key in value)) {
    return {
      detail:
        kind === "automation"
          ? "it has no triggers and no actions"
          : kind === "script"
            ? "it has no sequence"
            : "it has no entities",
    };
  }
  return { config: value };
};

const summarize = (config: Record<string, any>): ImportSummary => ({
  name: String(config.alias ?? config.name ?? ""),
  triggers: asList(config.triggers ?? config.trigger).length,
  conditions: asList(config.conditions ?? config.condition).length,
  actions: asList(config.actions ?? config.action ?? config.sequence).length,
});

/**
 * Read YAML holding one item or a list of items. Refuses anything that is not
 * valid YAML or not an item of this kind, with the reason. Scripts also accept
 * the form the scripts file uses: a mapping of id to script.
 */
export const parseImport = (
  text: string,
  kind: TransferKind,
  existingIds: ReadonlySet<string>
): ImportResult => {
  if (!text.trim()) {
    return { ok: false, reason: "empty", detail: "" };
  }
  let parsed: unknown;
  try {
    parsed = load(text, { schema: YAML11_SCHEMA });
  } catch (err: any) {
    return {
      ok: false,
      reason: "invalid_yaml",
      detail: String(err?.reason ?? err?.message ?? err).split("\n")[0],
    };
  }
  if (parsed === null || parsed === undefined) {
    return { ok: false, reason: "empty", detail: "" };
  }

  let entries: { id?: string; value: unknown }[];
  if (Array.isArray(parsed)) {
    entries = parsed.map((value) => ({ value }));
  } else if (
    kind === "script" &&
    isRecord(parsed) &&
    !HAS_CONTENT.script.some((key) => key in parsed) &&
    !("script" in parsed) &&
    Object.values(parsed).length > 0 &&
    Object.values(parsed).every(isRecord)
  ) {
    entries = Object.entries(parsed).map(([id, value]) => ({ id, value }));
  } else {
    entries = [{ value: parsed }];
  }
  if (entries.length === 0) {
    return { ok: false, reason: "empty", detail: "" };
  }

  const items: ImportItem[] = [];
  for (const [index, entry] of entries.entries()) {
    const checked = checkItem(entry.value, kind);
    if (!checked.config) {
      return {
        ok: false,
        reason: "not_config",
        detail:
          entries.length > 1
            ? `item ${index + 1}: ${checked.detail}`
            : checked.detail!,
      };
    }
    const config = structuredClone(checked.config);
    const originalId =
      entry.id ?? (config.id !== undefined ? String(config.id) : undefined);
    const idClash = originalId !== undefined && existingIds.has(originalId);
    if (kind !== "script" && (idClash || originalId === undefined)) {
      delete config.id;
    }
    items.push({
      index,
      config,
      originalId,
      idClash,
      summary: summarize(config),
    });
  }
  return { ok: true, items };
};

export interface KnownReferences {
  entities: ReadonlySet<string>;
  devices: ReadonlySet<string>;
  areas: ReadonlySet<string>;
}

export interface MissingReferences {
  entities: string[];
  devices: string[];
  areas: string[];
}

const ENTITY_ID = /^[a-z0-9_]+\.[a-z0-9_]+$/;

const idsFrom = (value: unknown): string[] =>
  asList(value).flatMap((item) =>
    typeof item === "string" ? item.split(",").map((part) => part.trim()) : []
  );

/** Entities, devices and areas an item refers to that this home does not have. */
export const findMissingReferences = (
  config: Record<string, any>,
  known: KnownReferences
): MissingReferences => {
  const entities = new Set<string>();
  const devices = new Set<string>();
  const areas = new Set<string>();
  walk(config, (key, value) => {
    if (key === "entity_id") {
      idsFrom(value)
        .filter((id) => ENTITY_ID.test(id) && !known.entities.has(id))
        .forEach((id) => entities.add(id));
    } else if (key === "device_id") {
      idsFrom(value)
        .filter((id) => id && !id.includes("{{") && !known.devices.has(id))
        .forEach((id) => devices.add(id));
    } else if (key === "area_id") {
      idsFrom(value)
        .filter(
          (id) =>
            id && id !== "all" && !id.includes("{{") && !known.areas.has(id)
        )
        .forEach((id) => areas.add(id));
    }
  });
  return {
    entities: [...entities].sort(),
    devices: [...devices].sort(),
    areas: [...areas].sort(),
  };
};

export const hasMissingReferences = (missing: MissingReferences): boolean =>
  missing.entities.length + missing.devices.length + missing.areas.length > 0;

export interface SceneProblems {
  /** Problems that make the scene unusable as it is. */
  notMapping: boolean;
  badEntities: string[];
  badStates: string[];
  /** Entities in the scene that this home does not have. */
  missing: string[];
}

/**
 * The checks that can be made on a scene without the server: the entities are
 * a mapping, each key is an entity id, each state can be read, and which
 * entities exist here. The server does not check scenes when they are saved.
 */
export const validateSceneConfig = (
  config: Record<string, any>,
  knownEntities: ReadonlySet<string>
): SceneProblems => {
  const result: SceneProblems = {
    notMapping: false,
    badEntities: [],
    badStates: [],
    missing: [],
  };
  const entities = config.entities;
  if (entities === undefined || entities === null) {
    return result;
  }
  if (!isRecord(entities)) {
    result.notMapping = true;
    return result;
  }
  for (const [entityId, state] of Object.entries(entities)) {
    if (!ENTITY_ID.test(entityId)) {
      result.badEntities.push(entityId);
      continue;
    }
    const readable =
      typeof state === "string" ||
      typeof state === "number" ||
      typeof state === "boolean" ||
      (isRecord(state) &&
        (state.state === undefined ||
          ["string", "number", "boolean"].includes(typeof state.state)) &&
        (state.attributes === undefined || isRecord(state.attributes)));
    if (!readable) {
      result.badStates.push(entityId);
    }
    if (!knownEntities.has(entityId)) {
      result.missing.push(entityId);
    }
  }
  result.missing.sort();
  return result;
};
