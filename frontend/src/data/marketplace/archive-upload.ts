/* eslint-disable no-await-in-loop -- the small files are read in order */
import type { LocalizeFunc } from "../../common/translations/localize";
import { handleFetchPromise } from "../../util/hass-call-api";
import { bytesToString } from "../../util/bytes-to-string";
import type { HomeAssistant } from "../../types";
import type { ArchiveGitInfo, ArchiveItem } from "./archive-detect";
import { detectArchive, markerPaths } from "./archive-detect";
import type { ArchiveErrorCode } from "./archive-zip";
import {
  ARCHIVE_LIMITS,
  ArchiveReadError,
  blobSource,
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
}

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
  return {
    fileName: file.name ?? "",
    fileSize: file.size,
    entryCount: entries.length,
    items: detection.items,
    git: detection.git,
  };
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
