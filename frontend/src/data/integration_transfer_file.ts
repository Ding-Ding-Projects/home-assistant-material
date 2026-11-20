/**
 * Pure checks for files the integration export and import read.
 *
 * Nothing here renders, fetches or trusts what a file says: every string is
 * kept as text, and a file of the wrong size, kind or shape is refused whole.
 */
import type {
  DomainHere,
  IntegrationsList,
  IntegrationsListRow,
} from "./integration_transfer";
import {
  INTEGRATION_SETTINGS_KIND,
  INTEGRATIONS_LIST_KIND,
  MAX_TRANSFER_FILE_BYTES,
  TRANSFER_FILE_FORMAT,
} from "./integration_transfer";

export type FileRefusal =
  "too_large" | "not_json" | "wrong_kind" | "wrong_shape";

export type ReadResult<T> =
  { ok: true; value: T } | { ok: false; reason: FileRefusal };

const DOMAIN_PATTERN = /^[a-z0-9_]{1,64}$/;
const MAX_ROWS = 2000;
const MAX_TEXT = 200;
const MAX_COUNT = 1_000_000;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === "string" && value.length <= max;

const isCount = (value: unknown): value is number =>
  typeof value === "number" &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_COUNT;

/** Return the size of a text in UTF-8 bytes. */
export const byteLength = (text: string): number =>
  new TextEncoder().encode(text).length;

const parseJson = (text: string): ReadResult<unknown> => {
  if (byteLength(text) > MAX_TRANSFER_FILE_BYTES) {
    return { ok: false, reason: "too_large" };
  }
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (_err: unknown) {
    return { ok: false, reason: "not_json" };
  }
};

const readRow = (value: unknown): IntegrationsListRow | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const { domain, name, source, version, entries, titles, devices } = value;
  const kinds = value.entity_kinds;
  const counts = value.entity_counts;
  if (
    !isText(domain) ||
    !DOMAIN_PATTERN.test(domain) ||
    !isText(name) ||
    (source !== "built_in" && source !== "custom") ||
    !(version === null || version === undefined || isText(version, 64)) ||
    !isCount(entries) ||
    !Array.isArray(kinds) ||
    kinds.length > 500 ||
    !kinds.every((kind) => isText(kind) && DOMAIN_PATTERN.test(kind))
  ) {
    return undefined;
  }
  if (
    titles !== undefined &&
    (!Array.isArray(titles) ||
      titles.length > 1000 ||
      !titles.every((title) => isText(title, 500)))
  ) {
    return undefined;
  }
  if (devices !== undefined && !isCount(devices)) {
    return undefined;
  }
  let entityCounts: Record<string, number> | undefined;
  if (counts !== undefined) {
    if (!isRecord(counts)) {
      return undefined;
    }
    entityCounts = {};
    for (const [kind, count] of Object.entries(counts)) {
      if (!DOMAIN_PATTERN.test(kind) || !isCount(count)) {
        return undefined;
      }
      entityCounts[kind] = count;
    }
  }
  return {
    domain,
    name,
    source,
    version: typeof version === "string" ? version : null,
    entries,
    ...(titles ? { titles: [...(titles as string[])] } : {}),
    entity_kinds: [...(kinds as string[])],
    ...(entityCounts ? { entity_counts: entityCounts } : {}),
    ...(devices !== undefined ? { devices } : {}),
  };
};

/** Read an integrations list file, refusing it whole when anything is off. */
export const readIntegrationsList = (
  text: string
): ReadResult<IntegrationsList> => {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return parsed;
  }
  const file = parsed.value;
  if (
    !isRecord(file) ||
    file.kind !== INTEGRATIONS_LIST_KIND ||
    file.format !== TRANSFER_FILE_FORMAT
  ) {
    return { ok: false, reason: "wrong_kind" };
  }
  const rows = file.integrations;
  if (
    !isText(file.build, 64) ||
    !isText(file.made_at, 64) ||
    !Array.isArray(rows) ||
    rows.length > MAX_ROWS
  ) {
    return { ok: false, reason: "wrong_shape" };
  }
  const integrations: IntegrationsListRow[] = [];
  const seen = new Set<string>();
  for (const value of rows) {
    const row = readRow(value);
    if (!row || seen.has(row.domain)) {
      return { ok: false, reason: "wrong_shape" };
    }
    seen.add(row.domain);
    integrations.push(row);
  }
  return {
    ok: true,
    value: {
      kind: INTEGRATIONS_LIST_KIND,
      format: TRANSFER_FILE_FORMAT,
      build: file.build,
      made_at: file.made_at,
      names_included: file.names_included === true,
      counts_included: file.counts_included === true,
      integrations,
    },
  };
};

export type CannotAddReason = "custom_missing" | "unknown" | "no_setup";

export interface ImportGroups {
  notHere: IntegrationsListRow[];
  alreadyHere: IntegrationsListRow[];
  cannotAdd: { row: IntegrationsListRow; reason: CannotAddReason }[];
}

/**
 * Sort the rows of an imported list into the three groups, from what this
 * system reported about each domain. A domain with an entry here is already
 * here; one this system cannot set up through its own setup cannot be added.
 */
export const groupImportedList = (
  rows: IntegrationsListRow[],
  here: Record<string, DomainHere | undefined>
): ImportGroups => {
  const groups: ImportGroups = { notHere: [], alreadyHere: [], cannotAdd: [] };
  for (const row of rows) {
    const info = here[row.domain];
    if (info?.known && info.entries > 0) {
      groups.alreadyHere.push(row);
    } else if (!info?.known) {
      groups.cannotAdd.push({
        row,
        reason: row.source === "custom" ? "custom_missing" : "unknown",
      });
    } else if (!info.config_flow) {
      groups.cannotAdd.push({ row, reason: "no_setup" });
    } else {
      groups.notHere.push(row);
    }
  }
  return groups;
};

/** Count the kinds of entity across a list: one per integration and kind. */
export const countEntityKinds = (list: IntegrationsList): number =>
  list.integrations.reduce((sum, row) => sum + row.entity_kinds.length, 0);

/** The exact text that is saved and copied for a list. */
export const integrationsListText = (list: IntegrationsList): string =>
  `${JSON.stringify(list, null, 2)}\n`;

export interface SettingsFileHead {
  domain: string;
  locked: boolean;
}

/**
 * Check a settings file before it is sent for a preview: its size, kind and
 * the integration it names. The server checks everything again.
 */
export const readSettingsFileHead = (
  text: string
): ReadResult<SettingsFileHead> => {
  const parsed = parseJson(text);
  if (!parsed.ok) {
    return parsed;
  }
  const file = parsed.value;
  if (
    !isRecord(file) ||
    file.kind !== INTEGRATION_SETTINGS_KIND ||
    file.format !== TRANSFER_FILE_FORMAT
  ) {
    return { ok: false, reason: "wrong_kind" };
  }
  if (!isText(file.domain) || !DOMAIN_PATTERN.test(file.domain)) {
    return { ok: false, reason: "wrong_shape" };
  }
  return {
    ok: true,
    value: { domain: file.domain, locked: file.locked === true },
  };
};

/**
 * Show when a file was made, with a 24-hour time. Text that is not a date is
 * shown as it is, as text.
 */
export const formatMadeAt = (iso: string, language: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  try {
    return new Intl.DateTimeFormat(language, {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(date);
  } catch (_err: unknown) {
    return iso;
  }
};

/** Show a setting's value as plain text, cut short when long. */
export const settingValueText = (value: unknown, max = 80): string => {
  const text =
    typeof value === "string" ? value : (JSON.stringify(value) ?? "null");
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};
