/**
 * The manifest of a packaged installer (.hapkg). A package is a ZIP archive
 * that holds hapkg.json at its root and the folder of the item it installs.
 * The manifest names the item and lists every file with its SHA-256 digest.
 *
 * The server applies the same rules before it installs anything
 * (core/homeassistant/components/marketplace/upload_package.py), so what the
 * panel shows as verified is what the server accepts.
 */

export const PACKAGE_MANIFEST = "hapkg.json";
export const PACKAGE_FORMAT = 1;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;

export const PACKAGE_KINDS = [
  "integration",
  "plugin",
  "theme",
  "template",
  "blueprint",
] as const;

export type PackageKind = (typeof PACKAGE_KINDS)[number];

export interface PackageSource {
  repository: string;
  path: string;
}

export interface PackageManifest {
  kind: PackageKind;
  /** The domain of an integration, the name of anything else */
  name: string;
  version: string;
  title: string;
  description: string;
  source?: PackageSource;
  updateUrl?: string;
  files: Record<string, string>;
}

export type PackageErrorCode =
  | "invalid"
  | "format"
  | "missing"
  | "checksum"
  | "unlisted"
  | "kind"
  | "update_url";

export class PackageError extends Error {
  public readonly code: PackageErrorCode;

  public readonly detail: string;

  constructor(code: PackageErrorCode, detail = "") {
    super(code);
    this.code = code;
    this.detail = detail;
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
// eslint-disable-next-line no-control-regex -- refusing control characters
const CONTROL = /[\u0000-\u001f\u007f]/;

const text = (
  data: Record<string, unknown>,
  key: string,
  limit: number,
  required: boolean
): string => {
  const value = data[key];
  if (value === undefined || value === null) {
    if (required) {
      throw new PackageError("invalid", key);
    }
    return "";
  }
  if (
    typeof value !== "string" ||
    CONTROL.test(value) ||
    value.length > limit
  ) {
    throw new PackageError("invalid", key);
  }
  const trimmed = value.trim();
  if (required && !trimmed) {
    throw new PackageError("invalid", key);
  }
  return trimmed;
};

/** Only a plain https address may be named to update a package from. */
export const checkUpdateUrl = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 2048 || CONTROL.test(value)) {
    throw new PackageError("update_url");
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch (_err) {
    throw new PackageError("update_url");
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    throw new PackageError("update_url");
  }
  return value;
};

const parseSource = (value: unknown): PackageSource | undefined => {
  if (value === undefined || value === null) {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const path = source.path ?? "";
  if (
    typeof value !== "object" ||
    typeof source.repository !== "string" ||
    !REPOSITORY.test(source.repository) ||
    typeof path !== "string" ||
    CONTROL.test(path) ||
    path.length > 512 ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  ) {
    throw new PackageError("invalid", "source");
  }
  return { repository: source.repository, path };
};

/** The manifest, refusing one that is not complete and well formed. */
export const parsePackageManifest = (json: string): PackageManifest => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (_err) {
    throw new PackageError("invalid", "json");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new PackageError("invalid", "json");
  }
  const data = parsed as Record<string, unknown>;

  if (data.format !== PACKAGE_FORMAT) {
    throw new PackageError("format", String(data.format).slice(0, 20));
  }
  const kind = data.kind;
  if (!PACKAGE_KINDS.some((known) => known === kind)) {
    throw new PackageError("invalid", "kind");
  }
  const name = text(
    data,
    kind === "integration" ? "domain" : "name",
    200,
    true
  );
  const version = text(data, "version", 64, true);
  const title = text(data, "title", 200, false) || name;
  const description = text(data, "description", 2000, false);

  const files = data.files;
  if (
    !files ||
    typeof files !== "object" ||
    Array.isArray(files) ||
    !Object.keys(files).length
  ) {
    throw new PackageError("invalid", "files");
  }
  for (const [path, digest] of Object.entries(files)) {
    if (
      !path ||
      path === PACKAGE_MANIFEST ||
      typeof digest !== "string" ||
      !SHA256.test(digest)
    ) {
      throw new PackageError("invalid", "files");
    }
  }

  return {
    kind: kind as PackageKind,
    name,
    version,
    title,
    description,
    source: parseSource(data.source),
    updateUrl:
      data.update_url === undefined || data.update_url === null
        ? undefined
        : checkUpdateUrl(data.update_url),
    files: files as Record<string, string>,
  };
};

/**
 * Checks that the archive holds exactly the files the manifest lists, each
 * with the digest the manifest gives. The digest of a file is read only when
 * it is needed.
 */
export const verifyPackageFiles = async (
  manifest: PackageManifest,
  entries: readonly { name: string; isDirectory: boolean }[],
  digestOf: (name: string) => Promise<string>
): Promise<void> => {
  const present = new Set(
    entries.filter((entry) => !entry.isDirectory).map((entry) => entry.name)
  );
  for (const [path, expected] of Object.entries(manifest.files)) {
    if (!present.has(path)) {
      throw new PackageError("missing", path);
    }
    // The files are read one after the other, to keep memory use flat
    // eslint-disable-next-line no-await-in-loop
    if ((await digestOf(path)) !== expected) {
      throw new PackageError("checksum", path);
    }
  }
  for (const name of present) {
    if (name !== PACKAGE_MANIFEST && !(name in manifest.files)) {
      throw new PackageError("unlisted", name);
    }
  }
};

/** Whether what the package says it is agrees with what was detected. */
export const packageKindMatches = (
  manifest: PackageManifest,
  items: readonly { kind: string; domain?: string }[]
): boolean =>
  items.some(
    (item) =>
      item.kind === manifest.kind &&
      (manifest.kind !== "integration" || item.domain === manifest.name)
  );
