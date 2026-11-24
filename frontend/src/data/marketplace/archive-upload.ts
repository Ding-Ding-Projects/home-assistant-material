/* eslint-disable no-await-in-loop -- the small files are read in order */
import type { LocalizeFunc } from "../../common/translations/localize";
import { handleFetchPromise } from "../../util/hass-call-api";
import { sha256, toHex } from "../../common/util/sha256";
import { bytesToString } from "../../util/bytes-to-string";
import type { HomeAssistant } from "../../types";
import type { ArchiveGitInfo, ArchiveItem } from "./archive-detect";
import { detectArchive, markerPaths } from "./archive-detect";
import type { PackageManifest } from "./archive-package";
import {
  MAX_MANIFEST_BYTES,
  PACKAGE_MANIFEST,
  PackageError,
  packageKindMatches,
  parsePackageManifest,
  verifyPackageFiles,
} from "./archive-package";
import type { ArchiveErrorCode, ByteSource, ZipEntry } from "./archive-zip";
import {
  ARCHIVE_LIMITS,
  ArchiveReadError,
  blobSource,
  decodeUtf8,
  readZipBytes,
  readZipDirectory,
  readZipText,
} from "./archive-zip";
import { marketplaceErrorMessage } from "./websocket";

// All the small files together stay far below what an archive may hold
const MAX_MARKER_TOTAL = 8 * 1024 * 1024;

export interface ArchiveInspection {
  fileName: string;
  fileSize: number;
  entryCount: number;
  items: ArchiveItem[];
  git?: ArchiveGitInfo;
  /** What the manifest of a package says, once its checksums were verified */
  package?: ArchivePackageInfo;
  /** Why the manifest of a package was refused */
  packageError?: PackageError;
}

export interface ArchivePackageInfo extends PackageManifest {
  verified: true;
}

/** Package files and plain ZIP archives are read the same way */
export const ARCHIVE_ACCEPT =
  ".hapkg,.zip,application/zip,application/x-zip-compressed";

export const isArchiveFileName = (name: string): boolean =>
  /\.(hapkg|zip)$/i.test(name);

/**
 * Looks inside the archive on this device. Only the list of the archive and
 * a few small files that tell what it holds are read, nothing is unpacked
 * and nothing is sent.
 */
export const inspectArchive = async (
  file: Blob & { name?: string }
): Promise<ArchiveInspection> => {
  const source = blobSource(file);
  const entries = await readZipDirectory(source);
  const names = entries.map((entry) => entry.name);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const files: Record<string, string> = {};
  let total = 0;
  for (const path of markerPaths(names)) {
    const entry = byName.get(path);
    if (!entry || total + entry.size > MAX_MARKER_TOTAL) {
      continue;
    }
    const text = await readZipText(source, entry);
    if (text !== undefined) {
      total += entry.size;
      files[path] = text;
    }
  }

  const detection = detectArchive(names, files, file.name ?? "");
  const inspection: ArchiveInspection = {
    fileName: file.name ?? "",
    fileSize: file.size,
    entryCount: entries.length,
    items: detection.items,
    git: detection.git,
  };

  const manifestEntry = byName.get(PACKAGE_MANIFEST);
  if (manifestEntry) {
    try {
      inspection.package = await inspectPackage(
        source,
        manifestEntry,
        entries,
        byName,
        detection.items
      );
    } catch (err) {
      if (!(err instanceof PackageError)) {
        throw err;
      }
      inspection.packageError = err;
    }
  }
  return inspection;
};

// Reads the manifest and checks every file against it, as the server does
const inspectPackage = async (
  source: ByteSource,
  manifestEntry: ZipEntry,
  entries: ZipEntry[],
  byName: Map<string, ZipEntry>,
  items: ArchiveItem[]
): Promise<ArchivePackageInfo> => {
  if (manifestEntry.isDirectory || manifestEntry.size > MAX_MANIFEST_BYTES) {
    throw new PackageError("invalid", "size");
  }
  const text = decodeUtf8(await readZipBytes(source, manifestEntry));
  if (text === undefined) {
    throw new PackageError("invalid", "json");
  }
  const manifest = parsePackageManifest(text);
  await verifyPackageFiles(manifest, entries, async (name) =>
    toHex(sha256(await readZipBytes(source, byName.get(name)!)))
  );
  if (!packageKindMatches(manifest, items)) {
    throw new PackageError("kind", manifest.kind);
  }
  return { ...manifest, verified: true };
};

// What the person is told when the archive is refused before it is sent
export const archiveErrorMessage = (
  err: unknown,
  localize: LocalizeFunc
): string => {
  if (!(err instanceof ArchiveReadError)) {
    return localize("ui.panel.marketplace.common.unknown_error");
  }
  const limits: Record<ArchiveErrorCode, string> = {
    not_zip: "",
    too_big: bytesToString(ARCHIVE_LIMITS.archiveBytes, 0),
    too_many_entries: String(ARCHIVE_LIMITS.entries),
    too_large_unpacked: bytesToString(ARCHIVE_LIMITS.unpackedBytes, 0),
    unsafe_path: "",
    too_deep: "",
    link_entry: "",
    encrypted: "",
    unsupported: "",
    ratio: "",
    corrupt: "",
    cannot_unpack: "",
  };
  return localize(
    `ui.panel.marketplace.dialog_custom_repositories.file.errors.${err.code}`,
    { entry: err.entry ?? "", limit: limits[err.code] }
  );
};

export interface MarketplaceUploadResult {
  kind: string;
  name: string;
  // Where it was placed, below the configuration folder
  path: string;
  restart_required: boolean;
  resource_url: string | null;
  resource_added: boolean;
  // Set for a package, which names itself
  version?: string | null;
  title?: string | null;
}

// The server looks inside the archive again and installs only this item
export const uploadArchiveItem = (
  hass: Pick<HomeAssistant, "fetchWithAuth">,
  file: Blob,
  fileName: string,
  item: Pick<ArchiveItem, "kind" | "source">
) => {
  const body = new FormData();
  // The server needs the fields before the archive
  body.append("kind", item.kind);
  body.append("source", item.source);
  body.append("file", file, fileName || "archive.zip");

  return handleFetchPromise<MarketplaceUploadResult>(
    hass.fetchWithAuth("/api/marketplace/upload", { method: "POST", body })
  );
};

// What to tell about a failed upload, the server explains its refusals
export const uploadErrorMessage = (
  err: unknown,
  localize: LocalizeFunc
): string => {
  const failure = err as { body?: unknown; status_code?: number } | null;
  if (failure?.body && typeof failure.body === "object") {
    return marketplaceErrorMessage(failure.body, localize);
  }
  if (failure?.status_code === undefined) {
    return localize(
      "ui.panel.marketplace.dialog_custom_repositories.file.upload_failed"
    );
  }
  return marketplaceErrorMessage(
    typeof failure.body === "string" ? failure.body : undefined,
    localize
  );
};

// What the person is told when the manifest of a package is refused
export const packageErrorMessage = (
  err: PackageError,
  localize: LocalizeFunc
): string =>
  localize(
    `ui.panel.marketplace.dialog_custom_repositories.file.package.errors.${err.code}`,
    { detail: err.detail }
  );
