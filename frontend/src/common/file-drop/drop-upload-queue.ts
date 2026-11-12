import type { ShowToastParams } from "../../managers/notification-manager";
import { createImage, createImageWithProgress } from "../../data/image_upload";
import {
  browseLocalMediaPlayer,
  isMediaSourceRoot,
  normalizeMediaFolderId,
  uploadLocalMedia,
  uploadLocalMediaWithProgress,
} from "../../data/media_source";
import type { HomeAssistant } from "../../types";
import {
  finishActivity,
  startActivity,
  updateActivity,
} from "../activity/activity-store";
import { convertImage } from "../converter/image-convert";
import type { LocalizeFunc } from "../translations/localize";
import type {
  ConversionChange,
  ConvertPlan,
  PictureConverter,
} from "./drop-convert";
import { convertPicture, renamedWithExtension } from "./drop-convert";
import type { DropZone, SkippedFile } from "./drop-routing";
import { formatBytes } from "./format-bytes";
import {
  DEFAULT_MEDIA_DIRECTORY,
  MEDIA_SOURCE_ROOT,
  mediaBrowserPathForFolder,
  mediaBrowserPathForImages,
} from "./media-target";
import type { MediaLocation } from "./media-target";

/** Sent on the window when files landed in the media library. */
export const MEDIA_LIBRARY_CHANGED_EVENT = "media-library-changed";

declare global {
  interface WindowEventMap {
    "media-library-changed": CustomEvent<{ folderId?: string }>;
  }
}

export interface DropUploadJob {
  target: DropZone;
  files: File[];
  /** Files that were not sent, with the reason. */
  skipped: SkippedFile[];
  /** Files to convert before they are stored, by position in `files`. */
  conversions?: Record<number, ConvertPlan & { action: "convert" }>;
  /** Where the person was when they dropped, taken at the drop. */
  location: MediaLocation;
}

/** What the queue needs from the running app, read fresh for each upload. */
export interface DropUploadDeps {
  hass: Pick<HomeAssistant, "callWS" | "fetchWithAuth"> &
    Partial<Pick<HomeAssistant, "auth">>;
  localize: LocalizeFunc;
  toast: (params: ShowToastParams) => void;
  navigate: (path: string) => void;
}

/** Lets an upload report bytes sent. The plain calls ignore it. */
export interface UploadProgress {
  hass: Pick<HomeAssistant, "auth">;
  onProgress: (fraction: number) => void;
}

/** The upload and conversion calls, replaceable in tests. */
export interface UploadApi {
  media: (
    fetchWithAuth: HomeAssistant["fetchWithAuth"],
    localize: LocalizeFunc,
    folderId: string,
    file: File,
    signal?: AbortSignal,
    progress?: UploadProgress
  ) => Promise<unknown>;
  image: (
    fetchWithAuth: HomeAssistant["fetchWithAuth"],
    localize: LocalizeFunc,
    file: File,
    signal?: AbortSignal,
    progress?: UploadProgress,
    folder?: string
  ) => Promise<unknown>;
  browse: typeof browseLocalMediaPlayer;
  convert: PictureConverter;
}

const defaultApi: UploadApi = {
  media: (fetchWithAuth, localize, folderId, file, signal, progress) =>
    progress
      ? uploadLocalMediaWithProgress(progress.hass, localize, folderId, file, {
          signal,
          onProgress: progress.onProgress,
        })
      : uploadLocalMedia(fetchWithAuth, localize, folderId, file, signal),
  image: (fetchWithAuth, localize, file, signal, progress, folder) =>
    progress
      ? createImageWithProgress(
          progress.hass,
          localize,
          file,
          {
            signal,
            onProgress: progress.onProgress,
          },
          folder
        )
      : createImage(fetchWithAuth, localize, file, signal, folder),
  browse: browseLocalMediaPlayer,
  convert: convertImage,
};

interface FailedFile {
  name: string;
  reason: string;
}

interface QueueEntry {
  job: DropUploadJob;
  activityId: string;
  controller: AbortController;
  cancelled: boolean;
  done: boolean;
}

/** Lines of detail shown in one warning before "and N more". */
const WARNING_LINES = 4;

const MAX_PROGRESS_NAME = 40;

const shortName = (name: string) =>
  name.length > MAX_PROGRESS_NAME
    ? `${name.slice(0, MAX_PROGRESS_NAME - 1)}…`
    : name;

/**
 * Uploads dropped files one drop at a time. A drop made while another is
 * still uploading waits its turn, so nothing is lost and the server is never
 * handed two uploads of the same person at once. Each drop is one entry in the
 * activity tray, with a progress bar and Cancel.
 */
export class DropUploadQueue {
  private _entries: QueueEntry[] = [];

  private _running = false;

  public constructor(
    private _deps: () => DropUploadDeps,
    private _api: UploadApi = defaultApi
  ) {}

  /** Drops waiting or uploading. */
  public get length(): number {
    return this._entries.length;
  }

  public enqueue(job: DropUploadJob): string {
    const { localize } = this._deps();
    const count = job.files.length;
    const entry: QueueEntry = {
      job,
      activityId: "",
      controller: new AbortController(),
      cancelled: false,
      done: false,
    };
    entry.activityId = startActivity({
      title: localize("ui.drop_upload.activity_title", {
        count,
        place: this._placeName(job, localize),
      }),
      kind: "other",
      progress: { completed: 0, total: count },
      status:
        this._entries.length > 0
          ? localize("ui.drop_upload.activity_waiting")
          : undefined,
      cancel: () => this._cancel(entry),
      openPath: this._openPath(job),
    });
    this._entries.push(entry);
    void this._drain();
    return entry.activityId;
  }

  /** Tells the person which dropped files were not sent, when none were. */
  public reportSkipped(skipped: SkippedFile[]): void {
    const { localize, toast } = this._deps();
    if (skipped.length === 0) {
      return;
    }
    toast({
      message: warningText(
        skipped.map((file) => skipText(file, localize)),
        localize
      ),
      severity: "warning",
      dismissable: true,
    });
  }

  private async _drain(): Promise<void> {
    if (this._running) {
      return;
    }
    this._running = true;
    try {
      while (this._entries.length > 0) {
        const entry = this._entries[0];
        // eslint-disable-next-line no-await-in-loop
        await this._run(entry);
        entry.done = true;
        this._entries = this._entries.filter((item) => item !== entry);
      }
    } finally {
      this._running = false;
    }
  }

  private _cancel(entry: QueueEntry): void {
    entry.cancelled = true;
    entry.controller.abort();
  }

  private _placeName(job: DropUploadJob, localize: LocalizeFunc): string {
    if (job.target === "image") {
      return job.location.imageFolderName
        ? localize("ui.drop_upload.place_image_folder", {
            folder: job.location.imageFolderName,
          })
        : localize("ui.drop_upload.place_images");
    }
    return job.location.folderName
      ? localize("ui.drop_upload.place_folder", {
          folder: job.location.folderName,
        })
      : localize("ui.drop_upload.place_media");
  }

  private _openPath(job: DropUploadJob, folderId?: string): string {
    const player = job.location.player;
    if (job.target === "image") {
      return mediaBrowserPathForImages(player, job.location.imageFolder);
    }
    const id = folderId ?? job.location.folderId ?? DEFAULT_MEDIA_DIRECTORY;
    return mediaBrowserPathForFolder(player, id);
  }

  /** The folder a media drop goes into: the open one, or the library root. */
  private async _resolveFolder(entry: QueueEntry): Promise<string> {
    const { hass } = this._deps();
    if (entry.job.location.folderId) {
      return entry.job.location.folderId;
    }
    try {
      const root = await this._api.browse(hass.callWS, MEDIA_SOURCE_ROOT);
      // With one media directory the server answers with that directory
      // itself, so its own id is the library root.
      if (!isMediaSourceRoot(root.media_content_id)) {
        return normalizeMediaFolderId(root.media_content_id);
      }
      // With several, the first one is used.
      const directory = root.children?.find((child) => child.can_expand);
      if (directory) {
        return normalizeMediaFolderId(directory.media_content_id);
      }
    } catch (_err) {
      // Fall back to the directory every default installation has.
    }
    return DEFAULT_MEDIA_DIRECTORY;
  }

  private async _run(entry: QueueEntry): Promise<void> {
    const { job, activityId } = entry;
    const total = job.files.length;
    const added: string[] = [];
    const failed: FailedFile[] = [];
    const converted: ConversionChange[] = [];
    const skipped: SkippedFile[] = [...job.skipped];
    const usedNames = new Set<string>();
    let folderId: string | undefined;
    let fatal: string | undefined;

    if (entry.cancelled) {
      finishActivity(activityId, "cancelled", {
        message: this._deps().localize("ui.drop_upload.cancelled"),
      });
      return;
    }

    updateActivity(activityId, {
      status: this._deps().localize("ui.drop_upload.activity_starting"),
    });

    let existing = new Set<string>();
    if (job.target === "media") {
      try {
        folderId = await this._resolveFolder(entry);
        const listing = await this._api.browse(
          this._deps().hass.callWS,
          folderId
        );
        existing = new Set(
          (listing.children ?? []).map((child) => child.title)
        );
      } catch (err: any) {
        fatal = err?.message || String(err);
      }
    }

    if (!fatal) {
      for (let index = 0; index < total; index++) {
        if (entry.cancelled) {
          break;
        }
        let file = job.files[index];
        const { localize, hass } = this._deps();
        const plan = job.conversions?.[index];
        if (plan) {
          updateActivity(activityId, {
            progress: { completed: index, total },
            status: localize("ui.drop_upload.activity_converting", {
              name: shortName(file.name),
            }),
          });
          // eslint-disable-next-line no-await-in-loop
          const outcome = await convertPicture(
            file,
            plan,
            this._api.convert,
            entry.controller.signal
          );
          if (entry.cancelled) {
            break;
          }
          if (!outcome.ok) {
            skipped.push({
              name: file.name,
              reason: "convert_failed",
              detail: outcome.code,
            });
            continue;
          }
          converted.push(outcome.change);
          file = outcome.file;
        }
        if (
          job.target === "media" &&
          (existing.has(file.name) || usedNames.has(file.name))
        ) {
          skipped.push({
            name: file.name,
            reason: existing.has(file.name) ? "exists" : "duplicate",
          });
          if (plan) {
            converted.pop();
          }
          continue;
        }
        usedNames.add(file.name);
        const baseStatus = localize("ui.drop_upload.activity_uploading", {
          name: shortName(file.name),
        });
        updateActivity(activityId, {
          progress: { completed: index, total },
          status: baseStatus,
        });
        const progress = hass.auth
          ? {
              hass: { auth: hass.auth },
              onProgress: (fraction: number) =>
                updateActivity(activityId, {
                  status: localize(
                    "ui.drop_upload.activity_uploading_percent",
                    {
                      name: shortName(file.name),
                      percent: Math.floor(fraction * 100),
                    }
                  ),
                }),
            }
          : undefined;
        try {
          // eslint-disable-next-line no-await-in-loop
          await (job.target === "image"
            ? this._api.image(
                hass.fetchWithAuth,
                localize,
                file,
                entry.controller.signal,
                progress,
                job.location.imageFolder || undefined
              )
            : this._api.media(
                hass.fetchWithAuth,
                localize,
                folderId!,
                file,
                entry.controller.signal,
                progress
              ));
          added.push(file.name);
        } catch (err: any) {
          if (entry.cancelled || err?.name === "AbortError") {
            break;
          }
          failed.push({
            name: file.name,
            reason: err?.message || localize("ui.common.unknown_error"),
          });
        }
      }
    }

    // A converted file that did not reach the server is not reported as converted.
    const stored = new Set(added);
    const convertedStored = converted.filter((change) =>
      stored.has(renamedFor(change))
    );
    this._report(entry, {
      added,
      failed,
      skipped,
      converted: convertedStored,
      folderId,
      fatal,
    });
  }

  private _report(
    entry: QueueEntry,
    result: {
      added: string[];
      failed: FailedFile[];
      skipped: SkippedFile[];
      converted: ConversionChange[];
      folderId?: string;
      fatal?: string;
    }
  ): void {
    const { job, activityId } = entry;
    const { localize, toast, navigate } = this._deps();
    const { added, failed, skipped, converted, folderId, fatal } = result;
    const total = job.files.length;
    const openPath = this._openPath(job, folderId);

    // The Media browser and the Manage dialog show the new files, in either store
    if (added.length > 0) {
      window.dispatchEvent(
        new CustomEvent(MEDIA_LIBRARY_CHANGED_EVENT, { detail: { folderId } })
      );
    }

    const warnings: string[] = [];
    if (fatal) {
      warnings.push(localize("ui.drop_upload.fatal", { reason: fatal }));
    }
    for (const file of failed) {
      warnings.push(
        localize("ui.drop_upload.failed", {
          name: file.name,
          reason: file.reason,
        })
      );
    }
    for (const file of skipped) {
      warnings.push(skipText(file, localize));
    }

    let message: string;
    if (entry.cancelled) {
      message = localize("ui.drop_upload.cancelled_with_count", {
        count: added.length,
      });
      finishActivity(activityId, "cancelled", { message, openPath });
    } else if (added.length === 0) {
      message = fatal
        ? localize("ui.drop_upload.fatal", { reason: fatal })
        : localize("ui.drop_upload.none_added");
      finishActivity(activityId, "failed", {
        message,
        details: warnings.join("\n"),
        openPath,
        compact: true,
      });
    } else {
      message = this._successText(job, added, total, localize);
      const notes = converted.map((change) => convertedText(change, localize));
      if (notes.length > 0) {
        message = `${message}. ${warningText(notes, localize)}`;
      }
      // The bar shows the finished count; a finished entry keeps its last value.
      updateActivity(activityId, { progress: { completed: total, total } });
      finishActivity(activityId, "done", { message, openPath });
    }

    if (added.length > 0) {
      toast({
        message,
        duration: 10000,
        dismissable: true,
        action: {
          text:
            job.target === "image"
              ? localize("ui.drop_upload.show_images")
              : localize("ui.drop_upload.show_media"),
          action: () => navigate(openPath),
          primary: true,
        },
      });
    }
    if (warnings.length > 0) {
      toast({
        message: warningText(warnings, localize),
        severity: "warning",
        dismissable: true,
      });
    }
  }

  private _successText(
    job: DropUploadJob,
    added: string[],
    total: number,
    localize: LocalizeFunc
  ): string {
    if (added.length < total) {
      return localize("ui.drop_upload.some_added", {
        added: added.length,
        total,
        place: this._placeName(job, localize),
      });
    }
    if (job.target === "image") {
      return job.location.imageFolderName
        ? localize("ui.drop_upload.images_added_folder", {
            count: added.length,
            folder: job.location.imageFolderName,
          })
        : localize("ui.drop_upload.images_added", { count: added.length });
    }
    const folder = job.location.folderName;
    if (added.length === 1) {
      return folder
        ? localize("ui.drop_upload.file_added_folder", {
            name: added[0],
            folder,
          })
        : localize("ui.drop_upload.file_added", { name: added[0] });
    }
    return folder
      ? localize("ui.drop_upload.files_added_folder", {
          count: added.length,
          folder,
        })
      : localize("ui.drop_upload.files_added", { count: added.length });
  }
}

const skipText = (file: SkippedFile, localize: LocalizeFunc): string => {
  switch (file.reason) {
    case "too_large":
      return localize("ui.drop_upload.skip.too_large", {
        name: file.name,
        limit: formatBytes(file.limit ?? 0),
      });
    case "image_type":
      return localize("ui.drop_upload.skip.image_type", { name: file.name });
    case "duplicate":
      return localize("ui.drop_upload.skip.duplicate", { name: file.name });
    case "exists":
      return localize("ui.drop_upload.skip.exists", { name: file.name });
    case "cannot_convert":
      return localize("ui.drop_upload.skip.cannot_convert", {
        name: file.name,
      });
    case "convert_failed":
      return localize("ui.drop_upload.skip.convert_failed", {
        name: file.name,
        reason: localize(
          `ui.drop_upload.convert_reason.${file.detail ?? "unknown"}`
        ),
      });
    default:
      return localize("ui.drop_upload.skip.not_media", { name: file.name });
  }
};

const warningText = (lines: string[], localize: LocalizeFunc): string => {
  const shown = lines.slice(0, WARNING_LINES);
  const more = lines.length - shown.length;
  if (more > 0) {
    shown.push(localize("ui.drop_upload.and_more", { count: more }));
  }
  return shown.join(" ");
};

/** The name a converted file was stored under. */
const renamedFor = (change: ConversionChange): string =>
  renamedWithExtension(
    change.originalName,
    change.to === "PNG" ? "png" : "jpeg"
  );

/** One line saying what a file was converted from and to, and what was lost. */
export const convertedText = (
  change: ConversionChange,
  localize: LocalizeFunc
): string => {
  const parts = [
    change.from === change.to
      ? localize("ui.drop_upload.converted_smaller", {
          name: change.originalName,
        })
      : localize("ui.drop_upload.converted", {
          name: change.originalName,
          from: change.from,
          to: change.to,
        }),
  ];
  if (change.resizedFrom && change.resizedTo) {
    parts.push(
      localize("ui.drop_upload.loss_resized", {
        from: change.resizedFrom,
        to: change.resizedTo,
      })
    );
  }
  if (change.quality !== undefined) {
    parts.push(
      localize("ui.drop_upload.loss_quality", { quality: change.quality })
    );
  }
  if (change.flattened) {
    parts.push(localize("ui.drop_upload.loss_flattened"));
  }
  return parts.join(" ");
};
