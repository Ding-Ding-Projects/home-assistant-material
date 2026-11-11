import { load } from "js-yaml";
import {
  showHiddenCharacterCodes,
  stripHiddenCharacters,
} from "../../../common/string/hidden-characters";
import { slugify } from "../../../common/string/slugify";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import { pickAvailableDashboardUrlPath } from "../../config/lovelace/dashboards/pick-available-dashboard-url-path";
import type { AddressProblem } from "./address-host";
import { hostOf } from "./address-host";

/**
 * The dashboard file format. A file holds nothing but data: the settings of
 * one dashboard and its configuration, or one view of a dashboard.
 */
export const DASHBOARD_FILE_FORMAT = "home-assistant-dashboard";
export const DASHBOARD_FILE_VERSION = 1;

/** Largest file the dashboard import reads, in bytes (2 MiB). */
export const DASHBOARD_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

const MAX_VIEWS = 100;
const MAX_DEPTH = 40;
const MAX_NODES = 200_000;
const MAX_TITLE_LENGTH = 100;

/** Keys that load code. They are removed from an imported configuration. */
const CODE_LOADING_KEYS = new Set([
  "module_url",
  "extra_module_url",
  "js_url",
  "extra_js_url",
]);
const UNSAFE_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type DashboardImportError =
  | "unreadable"
  | "too_large"
  | "not_dashboard"
  | "unsupported_version"
  | "invalid_file"
  | "too_many_views"
  | "too_complex";

export interface DashboardFileSettings {
  title: string;
  icon?: string;
  url_path: string;
  require_admin: boolean;
  show_in_sidebar: boolean;
}

export interface DashboardFileEnvelope {
  format: typeof DASHBOARD_FILE_FORMAT;
  version: number;
  kind: "dashboard";
  settings: DashboardFileSettings;
  config: LovelaceConfig;
}

export interface ViewFileEnvelope {
  format: typeof DASHBOARD_FILE_FORMAT;
  version: number;
  kind: "view";
  source?: { dashboard_title?: string };
  view: LovelaceViewConfig;
}

/** Most list items a summary names. The total stays exact. */
export const SUMMARY_LIST_LIMIT = 20;

/** A list cut to its first items, with the exact number there were. */
export interface Capped<T> {
  /** What is shown at first. Never leaves out an item that needs a look. */
  items: T[];
  total: number;
  /** Every item, most important first, for the "Show all" control. */
  all: T[];
}

/** One resource or module address that was removed from the file. */
export interface RemovedEntry {
  kind: "resource" | "module" | "text";
  address: string;
}

export type ParsedDashboardImport =
  | {
      ok: true;
      kind: "dashboard";
      settings: DashboardFileSettings;
      config: LovelaceConfig;
      /** True when resource or module entries were removed. */
      stripped: boolean;
      removed: Capped<RemovedEntry>;
    }
  | {
      ok: true;
      kind: "view";
      view: LovelaceViewConfig;
      sourceTitle?: string;
      stripped: boolean;
      removed: Capped<RemovedEntry>;
    }
  | { ok: false; error: DashboardImportError };

export type DropRoute =
  { route: "dashboard"; parsed: unknown } | { route: "other" };

class FileError extends Error {
  public constructor(public readonly code: DashboardImportError) {
    super(code);
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const looksLikeYamlName = (name: string): boolean => /\.ya?ml$/i.test(name);

/**
 * Text from a file that is safe to show. Control characters, direction
 * overrides and other invisible characters are replaced by their code, such
 * as `U+202E`, so nothing can hide or reorder what is shown. Long text is cut.
 */
export const safeText = (value: string, max = 200): string => {
  const replaced = showHiddenCharacterCodes(value);
  const characters = Array.from(replaced);
  return characters.length > max
    ? `${characters.slice(0, max).join("")}…`
    : replaced;
};

// Words that only a view has. A list of views is checked against these.
const VIEW_KEYS = [
  "title",
  "path",
  "icon",
  "theme",
  "type",
  "cards",
  "badges",
  "sections",
  "panel",
  "subview",
  "visible",
  "max_columns",
  "strategy",
  "background",
  "header",
];

const looksLikeView = (value: unknown): boolean =>
  isRecord(value) && VIEW_KEYS.some((key) => key in value);

/**
 * True for a plain dashboard configuration: a top level list whose items look
 * like views, in a file that is not a wording file. Wording files carry
 * their own markers and are never taken as dashboards.
 */
export const isPlainDashboardConfig = (
  parsed: Record<string, unknown>
): boolean =>
  Array.isArray(parsed.views) &&
  !("schemaVersion" in parsed) &&
  !("entries" in parsed) &&
  parsed.views.every(looksLikeView);

/** Parses file text as JSON, or as YAML when the file name says so. */
const parseText = (name: string, text: string): unknown => {
  if (looksLikeYamlName(name)) {
    return load(text);
  }
  return JSON.parse(text);
};

/**
 * Decides where a dropped file goes, from its content. A file that carries
 * the dashboard format marker, or a plain dashboard configuration with a
 * top level list of views, is a dashboard file. Everything else, including a
 * file that cannot be parsed, is left to the next import path unchanged.
 */
export const routeDroppedFile = (name: string, text: string): DropRoute => {
  const lower = name.toLowerCase();
  if (!lower.endsWith(".json") && !looksLikeYamlName(lower)) {
    return { route: "other" };
  }
  let parsed: unknown;
  try {
    parsed = parseText(lower, text);
  } catch (_err) {
    return { route: "other" };
  }
  if (!isRecord(parsed)) {
    return { route: "other" };
  }
  if (
    parsed.format === DASHBOARD_FILE_FORMAT ||
    isPlainDashboardConfig(parsed)
  ) {
    return { route: "dashboard", parsed };
  }
  return { route: "other" };
};

interface CleanState {
  nodes: number;
  stripped: boolean;
  removed: RemovedEntry[];
  removedTotal: number;
}

const newState = (): CleanState => ({
  nodes: 0,
  stripped: false,
  removed: [],
  removedTotal: 0,
});

const cappedRemoved = (state: CleanState): Capped<RemovedEntry> => ({
  items: state.removed.slice(0, SUMMARY_LIST_LIMIT),
  total: state.removedTotal,
  all: state.removed,
});

const noteRemoved = (
  state: CleanState,
  kind: RemovedEntry["kind"],
  address: unknown
): void => {
  state.stripped = true;
  state.removedTotal += 1;
  state.removed.push({
    kind,
    address: typeof address === "string" ? safeText(address) : "",
  });
};

/**
 * A title without hidden or direction-changing characters. Anything removed
 * is named in the removed list, so the person sees that the file had them.
 */
const cleanTitle = (value: string, state: CleanState): string => {
  const cleaned = stripHiddenCharacters(value);
  if (cleaned !== value) {
    noteRemoved(state, "text", value);
  }
  return cleaned.trim().slice(0, MAX_TITLE_LENGTH);
};

/** Cleans the title of a record in place. Returns nothing when it has none. */
const cleanTitleOf = (record: Record<string, unknown>, state: CleanState) => {
  if (typeof record.title === "string") {
    const title = cleanTitle(record.title, state);
    if (title) {
      record.title = title;
    } else {
      delete record.title;
    }
  }
};

/** Notes every entry of a removed `resources` list, or the list itself. */
const noteRemovedResources = (state: CleanState, value: unknown): void => {
  if (Array.isArray(value) && value.length) {
    value.forEach((item) =>
      noteRemoved(state, "resource", isRecord(item) ? item.url : undefined)
    );
  } else {
    noteRemoved(state, "resource", undefined);
  }
};

/**
 * Copies plain data only. Dates become text, anything that is not plain data
 * is refused, and keys that load code or could change prototypes are dropped.
 */
const cleanData = (
  value: unknown,
  state: CleanState,
  depth: number,
  top: boolean
): unknown => {
  state.nodes += 1;
  if (depth > MAX_DEPTH || state.nodes > MAX_NODES) {
    throw new FileError("too_complex");
  }
  if (value === null || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FileError("invalid_file");
    }
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => cleanData(item, state, depth + 1, false));
  }
  if (isRecord(value) && Object.getPrototypeOf(value) === Object.prototype) {
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) {
        continue;
      }
      if (top && key === "resources") {
        noteRemovedResources(state, child);
        continue;
      }
      if (CODE_LOADING_KEYS.has(key)) {
        noteRemoved(state, "module", child);
        continue;
      }
      result[key] = cleanData(child, state, depth + 1, false);
    }
    return result;
  }
  throw new FileError("invalid_file");
};

const cleanView = (value: unknown, state: CleanState): LovelaceViewConfig => {
  if (!isRecord(value)) {
    throw new FileError("invalid_file");
  }
  for (const key of ["cards", "badges", "sections"]) {
    if (key in value && !Array.isArray(value[key])) {
      throw new FileError("invalid_file");
    }
  }
  const view = cleanData(value, state, 0, false) as LovelaceViewConfig;
  cleanTitleOf(view as Record<string, unknown>, state);
  return view;
};

const cleanSettings = (
  value: unknown,
  fallbackTitle: string,
  state: CleanState
): DashboardFileSettings => {
  const raw = isRecord(value) ? value : {};
  const title =
    (typeof raw.title === "string" ? cleanTitle(raw.title, state) : "") ||
    cleanTitle(fallbackTitle, state);
  const icon =
    typeof raw.icon === "string" && /^[a-z0-9_-]+:[a-z0-9_-]+$/i.test(raw.icon)
      ? raw.icon
      : undefined;
  return {
    title,
    ...(icon ? { icon } : {}),
    url_path:
      typeof raw.url_path === "string" ? raw.url_path.slice(0, 100) : "",
    require_admin: raw.require_admin === true,
    show_in_sidebar: raw.show_in_sidebar !== false,
  };
};

/**
 * Checks a parsed dashboard file in full and returns the data to import.
 * Nothing is changed anywhere: the caller imports only on `ok`.
 */
export const validateDashboardFile = (
  parsed: unknown,
  fallbackTitle: string
): ParsedDashboardImport => {
  try {
    if (!isRecord(parsed)) {
      return { ok: false, error: "not_dashboard" };
    }
    const state = newState();

    if (parsed.format === DASHBOARD_FILE_FORMAT) {
      const version = parsed.version;
      if (
        typeof version !== "number" ||
        !Number.isInteger(version) ||
        version < 1 ||
        version > DASHBOARD_FILE_VERSION
      ) {
        return { ok: false, error: "unsupported_version" };
      }
      if (parsed.kind === "view") {
        const view = cleanView(parsed.view, state);
        const source = isRecord(parsed.source) ? parsed.source : undefined;
        return {
          ok: true,
          kind: "view",
          view,
          sourceTitle:
            typeof source?.dashboard_title === "string"
              ? source.dashboard_title.slice(0, MAX_TITLE_LENGTH)
              : undefined,
          stripped: state.stripped,
          removed: cappedRemoved(state),
        };
      }
      if (parsed.kind !== "dashboard") {
        return { ok: false, error: "invalid_file" };
      }
      return dashboardFromConfig(
        parsed.config,
        cleanSettings(parsed.settings, fallbackTitle, state),
        state
      );
    }

    if (isPlainDashboardConfig(parsed)) {
      return dashboardFromConfig(
        parsed,
        cleanSettings({ title: parsed.title }, fallbackTitle, state),
        state
      );
    }
    return { ok: false, error: "not_dashboard" };
  } catch (err) {
    if (err instanceof FileError) {
      return { ok: false, error: err.code };
    }
    return { ok: false, error: "invalid_file" };
  }
};

const dashboardFromConfig = (
  config: unknown,
  settings: DashboardFileSettings,
  state: CleanState
): ParsedDashboardImport => {
  if (!isRecord(config) || !Array.isArray(config.views)) {
    throw new FileError("invalid_file");
  }
  if (config.views.length > MAX_VIEWS) {
    throw new FileError("too_many_views");
  }
  if (!config.views.every((view) => isRecord(view))) {
    throw new FileError("invalid_file");
  }
  const cleaned = cleanData(config, state, 0, true) as LovelaceConfig;
  const cleanedRecord = cleaned as unknown as Record<string, unknown>;
  cleanTitleOf(cleanedRecord, state);
  (cleanedRecord.views as unknown[]).forEach((view) => {
    if (isRecord(view)) {
      cleanTitleOf(view, state);
    }
  });
  return {
    ok: true,
    kind: "dashboard",
    settings,
    config: cleaned,
    stripped: state.stripped,
    removed: cappedRemoved(state),
  };
};

/** Reads text from a file's bytes, refusing a file that is too large. */
export const parseDashboardFileText = (
  name: string,
  text: string,
  fallbackTitle: string
): ParsedDashboardImport => {
  // Every character takes at least one byte, so a longer text is too large
  // without measuring; otherwise measure the bytes themselves.
  if (
    text.length > DASHBOARD_IMPORT_MAX_BYTES ||
    new TextEncoder().encode(text).length > DASHBOARD_IMPORT_MAX_BYTES
  ) {
    return { ok: false, error: "too_large" };
  }
  let parsed: unknown;
  try {
    parsed = parseText(name.toLowerCase(), text);
  } catch (_err) {
    return { ok: false, error: "unreadable" };
  }
  return validateDashboardFile(parsed, fallbackTitle);
};

/** A readable title taken from a file name, without its extensions. */
export const titleFromFileName = (name: string): string => {
  const base = name
    .replace(/\.(dashboard|view)\.json$/i, "")
    .replace(/\.(json|ya?ml)$/i, "")
    .replace(/[_]+/g, " ")
    .trim();
  return base.slice(0, MAX_TITLE_LENGTH);
};

const withoutResources = (config: LovelaceConfig): LovelaceConfig => {
  const { resources: _resources, ...rest } = config as LovelaceConfig & {
    resources?: unknown;
  };
  return rest as LovelaceConfig;
};

/** The envelope written for a whole dashboard. Nothing else is included. */
export const buildDashboardEnvelope = (
  settings: DashboardFileSettings,
  config: LovelaceConfig
): DashboardFileEnvelope => ({
  format: DASHBOARD_FILE_FORMAT,
  version: DASHBOARD_FILE_VERSION,
  kind: "dashboard",
  settings: {
    title: settings.title,
    ...(settings.icon ? { icon: settings.icon } : {}),
    url_path: settings.url_path,
    require_admin: settings.require_admin,
    show_in_sidebar: settings.show_in_sidebar,
  },
  config: withoutResources(config),
});

/** The envelope written for a single view. */
export const buildViewEnvelope = (
  view: LovelaceViewConfig,
  dashboardTitle?: string
): ViewFileEnvelope => ({
  format: DASHBOARD_FILE_FORMAT,
  version: DASHBOARD_FILE_VERSION,
  kind: "view",
  ...(dashboardTitle ? { source: { dashboard_title: dashboardTitle } } : {}),
  view,
});

/** A safe download name such as `Kitchen.dashboard.json`. */
export const exportFileName = (
  title: string,
  kind: "dashboard" | "view"
): string => {
  const safe = title
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
  return `${safe || "dashboard"}.${kind}.json`;
};

/**
 * The address for a new dashboard. A preferred address from the file is used
 * when it is well formed, otherwise one is made from the title. Addresses
 * need a hyphen, and one already taken gets a number added.
 */
export const pickNewDashboardUrlPath = (
  title: string,
  preferred: string | undefined,
  taken: ReadonlySet<string>
): string => {
  let base: string;
  if (preferred && /^[a-z0-9_]+(-[a-z0-9_]+)+$/.test(preferred)) {
    base = preferred;
  } else {
    const slug = slugify(title, "-");
    base = slug.includes("-") ? slug : `dashboard-${slug}`;
  }
  return pickAvailableDashboardUrlPath(base, taken);
};

/** Adds a view at the end of a configuration, keeping view paths unique. */
export const appendViewToConfig = (
  config: LovelaceConfig,
  view: LovelaceViewConfig
): LovelaceConfig => {
  const used = new Set(
    config.views
      .map((existing) => (existing as { path?: string }).path)
      .filter((path): path is string => typeof path === "string")
  );
  const next: LovelaceViewConfig = { ...view };
  if (typeof next.path === "string" && used.has(next.path)) {
    let n = 2;
    while (used.has(`${next.path}-${n}`)) {
      n += 1;
    }
    next.path = `${next.path}-${n}`;
  }
  return { ...config, views: [...config.views, next] };
};

const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
};

/** Text of a value that does not depend on the order of object keys. */
export const stableStringify = (value: unknown): string =>
  JSON.stringify(sortKeys(value)) ?? "";

/** True when a stored configuration is exactly what was imported. */
export const configIsAsImported = (
  current: unknown,
  imported: LovelaceConfig
): boolean => stableStringify(current) === stableStringify(imported);

/**
 * The configuration without the one view that an import added, or `undefined`
 * when that view is no longer there exactly as it was imported. Every other
 * view and setting is kept as it is now.
 */
export const removeImportedView = (
  current: unknown,
  imported: LovelaceViewConfig
): LovelaceConfig | undefined => {
  if (!isRecord(current) || !Array.isArray(current.views)) {
    return undefined;
  }
  const wanted = stableStringify(imported);
  for (let index = current.views.length - 1; index >= 0; index--) {
    if (stableStringify(current.views[index]) === wanted) {
      return {
        ...current,
        views: current.views.filter((_view, i) => i !== index),
      } as LovelaceConfig;
    }
  }
  return undefined;
};

export interface SummaryAddress {
  host: string;
  address: string;
  where: string;
  /** Set when the host cannot be shown as a plain, readable name. */
  problem?: AddressProblem;
}

export interface SummaryCustomType {
  type: string;
  kind: "card" | "strategy";
}

export interface SummaryAction {
  where: string;
  action: string;
  service: string;
  target: string;
}

/** What a file contains, for the person to read before anything is made. */
export interface ImportSummary {
  kind: "dashboard" | "view";
  title: string;
  /** The address the file asks for, when it names one. */
  urlPath: string;
  views: number;
  cards: number;
  addresses: Capped<SummaryAddress>;
  customTypes: Capped<SummaryCustomType>;
  actions: Capped<SummaryAction>;
  removed: Capped<RemovedEntry>;
}

// Actions that only move around or show things. Any other action is listed.
const SAFE_ACTIONS = new Set(["navigate", "more-info", "none", "toggle"]);

// Records of these types run a service when pressed, with no `action` key.
const ACTION_TYPES = new Set([
  "call-service",
  "service-button",
  "action-button",
]);

// Services that only switch a light, a switch or a scene, or work a cover or
// a player. A listed action that calls any other service needs a closer look.
const HARMLESS_SERVICES = new Set([
  "light.turn_on",
  "light.turn_off",
  "light.toggle",
  "switch.turn_on",
  "switch.turn_off",
  "switch.toggle",
  "fan.turn_on",
  "fan.turn_off",
  "fan.toggle",
  "input_boolean.turn_on",
  "input_boolean.turn_off",
  "input_boolean.toggle",
  "scene.turn_on",
  "cover.open_cover",
  "cover.close_cover",
  "cover.stop_cover",
  "cover.toggle",
  "media_player.media_play",
  "media_player.media_pause",
  "media_player.media_play_pause",
]);

const isOutsideAddress = (text: string): boolean =>
  !/^\s*\/(?![\\/])/.test(text);

/** True when the person should look at this action before importing. */
const actionNeedsLook = (action: SummaryAction): boolean =>
  action.action === "url"
    ? isOutsideAddress(action.target)
    : !HARMLESS_SERVICES.has(action.service);

const addressNeedsLook = (address: SummaryAddress): boolean =>
  address.problem !== undefined || SCHEME_ADDRESS.test(address.address);

// Keys whose records are cards, rows, badges and the like, named by a label.
const LABELLED_KEYS = new Set([
  "views",
  "sections",
  "cards",
  "card",
  "entities",
  "rows",
  "badges",
  "elements",
  "features",
]);

const ADDRESS_PATTERN =
  /(?:\b[a-z][a-z0-9+.-]*:\/\/|(?<![\w:/.])\/\/)[^\s"'<>`)\]]+/gi;
const SCHEME_ADDRESS = /^\s*(?:javascript|data|vbscript|blob):/i;

const addressesIn = (text: string): string[] => {
  if (SCHEME_ADDRESS.test(text)) {
    return [text.trim()];
  }
  return (text.match(ADDRESS_PATTERN) ?? []).map((found) =>
    found.replace(/[.,;:!?]+$/, "")
  );
};

const labelOf = (node: Record<string, unknown>): string => {
  for (const key of ["title", "name", "heading", "entity", "type"]) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) {
      return safeText(value.trim(), 80);
    }
  }
  return "";
};

const targetOf = (node: Record<string, unknown>): string => {
  if (node.action === "url") {
    return safeText(String(node.url_path ?? node.url ?? ""));
  }
  const data = (isRecord(node.data) && node.data) || undefined;
  const serviceData =
    (isRecord(node.service_data) && node.service_data) || undefined;
  const target =
    node.target ?? serviceData?.entity_id ?? data?.entity_id ?? undefined;
  if (target === undefined) {
    return "";
  }
  return safeText(typeof target === "string" ? target : JSON.stringify(target));
};

/**
 * Reads a checked import and lists what the person should know before it is
 * made: counts, outside addresses, custom types and actions that run when
 * pressed. Pure: nothing is changed and nothing in the file is run. Every
 * list is cut to a few items but keeps its exact total.
 */
export const analyzeDashboardImport = (
  parsed: Extract<ParsedDashboardImport, { ok: true }>
): ImportSummary => {
  const addresses = new Map<string, SummaryAddress>();
  const customTypes = new Map<string, SummaryCustomType>();
  const actions = new Map<string, SummaryAction>();
  let cards = 0;

  const addAddress = (address: string, where: string): void => {
    const shown = safeText(address);
    if (!addresses.has(shown)) {
      const { host, problem } = hostOf(address);
      addresses.set(shown, {
        host: safeText(host),
        address: shown,
        where,
        ...(problem ? { problem } : {}),
      });
    }
  };

  const walk = (node: unknown, key: string, where: string): void => {
    if (Array.isArray(node)) {
      node.forEach((item) => walk(item, key, where));
      return;
    }
    if (typeof node === "string") {
      addressesIn(node).forEach((address) => addAddress(address, where));
      return;
    }
    if (!isRecord(node)) {
      return;
    }
    let here = where;
    if (
      typeof node.type === "string" ||
      typeof node.entity === "string" ||
      LABELLED_KEYS.has(key)
    ) {
      here = labelOf(node) || where;
    }
    if (typeof node.type === "string" && node.type.startsWith("custom:")) {
      const kind = key === "strategy" ? "strategy" : "card";
      const type = safeText(node.type, 100);
      customTypes.set(`${kind}\u0000${type}`, { type, kind });
    }
    const service = node.perform_action ?? node.service;
    const runsService =
      typeof node.perform_action === "string" ||
      typeof node.service === "string" ||
      (typeof node.type === "string" && ACTION_TYPES.has(node.type));
    if (
      (typeof node.action === "string" && !SAFE_ACTIONS.has(node.action)) ||
      runsService
    ) {
      const actionName =
        typeof node.action === "string"
          ? node.action
          : String(node.type ?? "call-service");
      const entry: SummaryAction = {
        where: here,
        action: safeText(actionName, 60),
        service: typeof service === "string" ? safeText(service, 100) : "",
        target: targetOf(node),
      };
      actions.set(
        [entry.where, entry.action, entry.service, entry.target].join("\u0000"),
        entry
      );
      // An address built by a template cannot be read in advance.
      if (node.action === "url" && /\{[{%]/.test(entry.target)) {
        addAddress(entry.target, here);
      }
    }
    for (const [childKey, child] of Object.entries(node)) {
      if (childKey === "cards" && Array.isArray(child)) {
        cards += child.filter(isRecord).length;
      } else if (childKey === "card" && isRecord(child)) {
        cards += 1;
      }
      walk(child, childKey, here);
    }
  };

  // Items that need a look come first, and none of them is ever left out of
  // the list shown at first. Only the rest is cut, to a few items.
  const capped = <T>(
    map: Map<string, T>,
    needsLook: (value: T) => boolean = () => false
  ): Capped<T> => {
    const values = [...map.values()];
    const first = values.filter(needsLook);
    const all = [...first, ...values.filter((value) => !needsLook(value))];
    return {
      items: all.slice(0, Math.max(SUMMARY_LIST_LIMIT, first.length)),
      total: all.length,
      all,
    };
  };

  let title: string;
  let urlPath = "";
  let views: number;
  if (parsed.kind === "dashboard") {
    title = safeText(parsed.settings.title, MAX_TITLE_LENGTH);
    urlPath = safeText(parsed.settings.url_path, 100);
    views = parsed.config.views.length;
    walk(parsed.config, "", "");
  } else {
    const viewTitle = parsed.view.title ?? parsed.sourceTitle ?? "";
    title = safeText(String(viewTitle), MAX_TITLE_LENGTH);
    views = 1;
    walk(parsed.view, "views", "");
  }

  return {
    kind: parsed.kind,
    title,
    urlPath,
    views,
    cards,
    addresses: capped(addresses, addressNeedsLook),
    customTypes: capped(customTypes),
    actions: capped(actions, actionNeedsLook),
    removed: parsed.removed,
  };
};
