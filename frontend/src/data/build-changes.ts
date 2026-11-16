import { searchMatcher } from "../common/regex/filter";
import { BUILD_REPOSITORY } from "./build-progress";
import type { PublicFetchResult } from "./public-json";
import { fetchPublicJson } from "./public-json";

/**
 * The public change list: what changed in each build, newest first.
 *
 * The file is published next to the update feed. Its shape is checked here
 * before anything is shown, and everything that decides what the comparison
 * shows is a pure function so it can be tested without a network.
 */

/** The areas a change can belong to, in the order the chips use. */
export const CHANGE_AREAS = [
  "interface",
  "core",
  "supervisor",
  "os",
  "deploy",
  "docs",
  "design",
  "build",
] as const;

export interface ChangeEntry {
  sha: string;
  date: string;
  title: string;
  areas: string[];
  detail?: string;
  detailYue?: string;
}

export interface ReleaseEntry {
  build: number;
  core: string;
  supervisor: string;
  os: string;
  tag: string | null;
  source: string;
  date: string;
  previousBuild: number | null;
  truncated: boolean;
  changes: ChangeEntry[];
}

export interface ChangeList {
  generated: string;
  repository: string;
  newestBuild: number;
  releases: ReleaseEntry[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const str = (value: unknown, fallback = ""): string =>
  typeof value === "string" ? value : fallback;

const optionalStr = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value : undefined;

const parseChange = (value: unknown): ChangeEntry | undefined => {
  if (!isRecord(value) || typeof value.title !== "string" || !value.title) {
    return undefined;
  }
  return {
    sha: str(value.sha),
    date: str(value.date),
    title: value.title,
    areas: Array.isArray(value.areas)
      ? value.areas.filter((area): area is string => typeof area === "string")
      : [],
    detail: optionalStr(value.detail),
    detailYue: optionalStr(value.detail_yue),
  };
};

const parseRelease = (value: unknown): ReleaseEntry | undefined => {
  if (
    !isRecord(value) ||
    typeof value.build !== "number" ||
    !Number.isFinite(value.build) ||
    typeof value.core !== "string"
  ) {
    return undefined;
  }
  const changes = Array.isArray(value.changes)
    ? value.changes
        .map(parseChange)
        .filter((change): change is ChangeEntry => change !== undefined)
    : [];
  return {
    build: value.build,
    core: value.core,
    supervisor: str(value.supervisor),
    os: str(value.os),
    tag: typeof value.tag === "string" && value.tag ? value.tag : null,
    source: str(value.source),
    date: str(value.date),
    previousBuild:
      typeof value.previous_build === "number" ? value.previous_build : null,
    truncated: value.truncated === true,
    changes,
  };
};

/**
 * Checks the shape of the file and returns it, newest build first. Entries
 * that are malformed are ignored. Returns undefined when the file is not a
 * change list at all.
 */
export const parseChangeList = (json: unknown): ChangeList | undefined => {
  if (!isRecord(json) || json.format !== 1 || !Array.isArray(json.releases)) {
    return undefined;
  }
  const releases = json.releases
    .map(parseRelease)
    .filter((release): release is ReleaseEntry => release !== undefined)
    .sort((a, b) => b.build - a.build);
  return {
    generated: str(json.generated),
    repository: str(json.repository),
    newestBuild:
      typeof json.newest_build === "number"
        ? json.newest_build
        : (releases[0]?.build ?? 0),
    releases,
  };
};

// ----------------------------------------------------------------- ranges

export interface BuildRange {
  from: number;
  to: number;
}

/**
 * The build the From picker starts on: the installed build when the list has
 * it, otherwise the nearest older build the list has, otherwise the oldest
 * one. `belowList` is true when the installed build is older than every
 * entry.
 */
export const defaultFromBuild = (
  releases: ReleaseEntry[],
  installedBuild: number | undefined
): { build: number | undefined; belowList: boolean } => {
  if (!releases.length) {
    return { build: undefined, belowList: false };
  }
  const builds = releases.map((release) => release.build);
  if (installedBuild === undefined) {
    return { build: Math.min(...builds), belowList: false };
  }
  if (builds.includes(installedBuild)) {
    return { build: installedBuild, belowList: false };
  }
  const older = builds.filter((build) => build < installedBuild);
  if (older.length) {
    return { build: Math.max(...older), belowList: false };
  }
  return { build: Math.min(...builds), belowList: true };
};

/**
 * Keeps From at or below To. When the person changed From past To, To moves
 * up to it; when they changed To below From, From moves down to it.
 */
export const correctRange = (
  range: BuildRange,
  changed: "from" | "to"
): BuildRange => {
  if (range.from <= range.to) {
    return range;
  }
  return changed === "from"
    ? { from: range.from, to: range.from }
    : { from: range.to, to: range.to };
};

/**
 * The releases between two builds: every build after From, up to and
 * including To, newest first. The From build itself is the starting point and
 * is not part of the changes.
 */
export const sliceReleases = (
  releases: ReleaseEntry[],
  range: BuildRange
): ReleaseEntry[] =>
  releases
    .filter(
      (release) => release.build > range.from && release.build <= range.to
    )
    .sort((a, b) => b.build - a.build);

export const findRelease = (
  releases: ReleaseEntry[],
  build: number | undefined
): ReleaseEntry | undefined =>
  build === undefined
    ? undefined
    : releases.find((release) => release.build === build);

export const isPublishedRelease = (release: ReleaseEntry): boolean =>
  release.tag !== null;

// -------------------------------------------------------------- filtering

/** How many changes each area has. Areas with none are left out. */
export const countByArea = (
  releases: ReleaseEntry[]
): Record<string, number> => {
  const counts: Record<string, number> = {};
  for (const release of releases) {
    for (const change of release.changes) {
      for (const area of new Set(change.areas)) {
        counts[area] = (counts[area] ?? 0) + 1;
      }
    }
  }
  return counts;
};

export const countChanges = (releases: ReleaseEntry[]): number =>
  releases.reduce((total, release) => total + release.changes.length, 0);

export interface ChangeFilter {
  areas: ReadonlySet<string>;
  query: string;
}

export const isFiltering = (filter: ChangeFilter): boolean =>
  filter.areas.size > 0 || filter.query.trim() !== "";

/**
 * Applies the area chips (a change matches when it has any chosen area) and
 * the search text (title, both detail texts and the commit id; a text written
 * as /pattern/flags is read as a pattern). Releases left with no change are
 * dropped while a filter is active.
 */
export const filterReleases = (
  releases: ReleaseEntry[],
  filter: ChangeFilter
): ReleaseEntry[] => {
  if (!isFiltering(filter)) {
    return releases;
  }
  const matches = searchMatcher(filter.query);
  const result: ReleaseEntry[] = [];
  for (const release of releases) {
    const changes = release.changes.filter(
      (change) =>
        (!filter.areas.size ||
          change.areas.some((area) => filter.areas.has(area))) &&
        matches(change.title, change.detail, change.detailYue, change.sha)
    );
    if (changes.length) {
      result.push({ ...release, changes });
    }
  }
  return result;
};

// ------------------------------------------------------------------- text

export interface ChangeTextOptions {
  heading: string;
  /** The header line of one build. */
  releaseLabel: (release: ReleaseEntry) => string;
  /** The names of the areas of one change, already translated. */
  areaLabel: (area: string) => string;
  /** The detail paragraphs to include for a change, in the order to show. */
  details: (change: ChangeEntry) => string[];
}

/** The filtered list as plain text, for copying. */
export const changesToText = (
  releases: ReleaseEntry[],
  options: ChangeTextOptions
): string => {
  const lines: string[] = [options.heading];
  for (const release of releases) {
    lines.push("", options.releaseLabel(release));
    for (const change of release.changes) {
      const areas = change.areas.map(options.areaLabel).join(", ");
      lines.push(`- ${change.title}${areas ? ` [${areas}]` : ""}`);
      for (const paragraph of options.details(change)) {
        lines.push(`    ${paragraph}`);
      }
    }
  }
  return lines.join("\n");
};

/** Which detail paragraphs to show for a language mode. */
export const detailsForMode = (
  change: ChangeEntry,
  mode: "english" | "cantonese" | "bilingual"
): string[] => {
  const english = change.detail;
  const cantonese = change.detailYue ?? change.detail;
  if (mode === "cantonese") {
    return cantonese ? [cantonese] : [];
  }
  if (mode === "bilingual") {
    return [
      ...new Set([english, change.detailYue].filter((v): v is string => !!v)),
    ];
  }
  return english ? [english] : [];
};

// ---------------------------------------------------------------- network

/** How long a loaded list is reused before it is read again. */
export const CHANGES_CACHE_MS = 300_000;

let cache: { at: number; list: ChangeList } | undefined;

/** Forgets the loaded list. Used by tests and by Retry. */
export const clearChangeListCache = () => {
  cache = undefined;
};

export const changeListUrl = (
  repository: string = BUILD_REPOSITORY,
  bust?: number
): string =>
  `https://raw.githubusercontent.com/${repository}/channel/changes.json${
    bust ? `?t=${bust}` : ""
  }`;

/**
 * Loads the change list. A list loaded less than five minutes ago is reused
 * unless `force` is set; a forced read adds a time to the address so no
 * cache in between answers for it.
 */
export const fetchChangeList = async (
  force: boolean,
  signal?: AbortSignal,
  now: number = Date.now()
): Promise<PublicFetchResult<ChangeList>> => {
  if (!force && cache && now - cache.at < CHANGES_CACHE_MS) {
    return { ok: true, data: cache.list };
  }
  const result = await fetchPublicJson(
    changeListUrl(BUILD_REPOSITORY, force ? now : undefined),
    signal
  );
  if (!result.ok) {
    return result;
  }
  const list = parseChangeList(result.data);
  if (!list) {
    return { ok: false, reason: "invalid" };
  }
  cache = { at: now, list };
  return { ok: true, data: list };
};

const REPOSITORY_NAME = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

/**
 * The repository the change list names, when a list has been loaded and the
 * name has the plain "owner/name" form. Anything else is ignored, because the
 * name ends up in a web address.
 */
export const loadedRepository = (): string | undefined => {
  const name = cache?.list.repository;
  return name && REPOSITORY_NAME.test(name) ? name : undefined;
};
