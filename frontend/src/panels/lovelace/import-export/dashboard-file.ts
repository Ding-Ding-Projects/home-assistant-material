import { load } from "js-yaml";
import { slugify } from "../../../common/string/slugify";
import type { LovelaceConfig } from "../../../data/lovelace/config/types";
import type { LovelaceViewConfig } from "../../../data/lovelace/config/view";
import { pickAvailableDashboardUrlPath } from "../../config/lovelace/dashboards/pick-available-dashboard-url-path";

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

export type ParsedDashboardImport =
  | {
      ok: true;
      kind: "dashboard";
      settings: DashboardFileSettings;
      config: LovelaceConfig;
      /** True when resource or module entries were removed. */
      stripped: boolean;
    }
  | {
      ok: true;
      kind: "view";
      view: LovelaceViewConfig;
      sourceTitle?: string;
      stripped: boolean;
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
    (Array.isArray(parsed.views) &&
      parsed.views.every((view) => isRecord(view)))
  ) {
    return { route: "dashboard", parsed };
  }
  return { route: "other" };
};

interface CleanState {
  nodes: number;
  stripped: boolean;
}

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
      if ((top && key === "resources") || CODE_LOADING_KEYS.has(key)) {
        state.stripped = true;
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
  return cleanData(value, state, 0, false) as LovelaceViewConfig;
};

const cleanSettings = (
  value: unknown,
  fallbackTitle: string
): DashboardFileSettings => {
  const raw = isRecord(value) ? value : {};
  const title =
    typeof raw.title === "string" && raw.title.trim()
      ? raw.title.trim().slice(0, MAX_TITLE_LENGTH)
      : fallbackTitle;
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
    const state: CleanState = { nodes: 0, stripped: false };

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
        };
      }
      if (parsed.kind !== "dashboard") {
        return { ok: false, error: "invalid_file" };
      }
      return dashboardFromConfig(
        parsed.config,
        cleanSettings(parsed.settings, fallbackTitle),
        state
      );
    }

    if (Array.isArray(parsed.views)) {
      const title =
        typeof parsed.title === "string" && parsed.title.trim()
          ? parsed.title.trim().slice(0, MAX_TITLE_LENGTH)
          : fallbackTitle;
      return dashboardFromConfig(
        parsed,
        cleanSettings({ title }, fallbackTitle),
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
  return {
    ok: true,
    kind: "dashboard",
    settings,
    config: cleaned,
    stripped: state.stripped,
  };
};

/** Reads text from a file's bytes, refusing a file that is too large. */
export const parseDashboardFileText = (
  name: string,
  text: string,
  fallbackTitle: string
): ParsedDashboardImport => {
  if (text.length > DASHBOARD_IMPORT_MAX_BYTES) {
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
