import { handleDroppedDashboardFile } from "../../panels/lovelace/import-export/dashboard-file-import";
import {
  hideFileDropIndicator,
  showFileDropIndicator,
} from "../../panels/lovelace/import-export/ha-file-drop-indicator";
import "../../components/file-drop/ha-add-media-sheet";
import "../../components/file-drop/ha-drop-upload-overlay";
import type { HaAddMediaSheet } from "../../components/file-drop/ha-add-media-sheet";
import type {
  DropUploadZone,
  HaDropUploadOverlay,
} from "../../components/file-drop/ha-drop-upload-overlay";
import type { HomeAssistant } from "../../types";
import { showToast } from "../../util/toast";
import { navigate } from "../navigate";
import {
  importWordingFile,
  looksLikeWordingFile,
  reportWordingImport,
} from "../vocabulary/wording-import";
import { openMediaFilePicker, registerAddMediaHandler } from "./add-media";
import { formatBytes } from "./format-bytes";
import { mediaFilesFromPaste, nameForPastedFile } from "./paste-guard";
import type { DropDecision, DropZone } from "./drop-routing";
import {
  describeDrag,
  IMAGE_MAX_BYTES,
  MEDIA_MAX_BYTES,
  routeDrop,
} from "./drop-routing";
import { DropUploadQueue } from "./drop-upload-queue";
import type { DropUploadJob } from "./drop-upload-queue";
import { mediaLocationFromPath } from "./media-target";
import type { MediaLocation } from "./media-target";
import type { LocalizeFunc } from "../translations/localize";

export interface FileDropHost {
  hass?: HomeAssistant;
  element: HTMLElement;
}

/** How long the overlay stays when drag events stop arriving. */
const HIDE_AFTER_MS = 500;

/** A drag that leaves the window ends quickly, without waiting for a timeout. */
const LEAVE_HIDE_MS = 120;

/** What the image zone is called: the image folder open in the browser, or the store. */
const imagePlaceName = (
  location: MediaLocation,
  localize: LocalizeFunc
): string =>
  location.imageFolderName
    ? localize("ui.drop_upload.place_image_folder", {
        folder: location.imageFolderName,
      })
    : localize("ui.drop_upload.place_images");

const hasFiles = (ev: DragEvent): boolean =>
  Boolean(ev.dataTransfer?.types.includes("Files"));

/**
 * The one place that decides what a file dropped on the app window does. A
 * dropped media file is uploaded; a dashboard or personal wording file is
 * imported as before. A page that already handles drops (an upload field, a
 * card editor, the converter) takes the event first and is left alone: the
 * router sees `defaultPrevented`, or never sees the event at all when the
 * page stopped it. See `drop-routing.ts` for the full rule.
 */
export class FileDropController {
  private _overlay?: HaDropUploadOverlay;

  private _hideTimer?: number;

  /** Escape was pressed: no overlay until the drag ends. */
  private _dismissed = false;

  private _seen?: DragEvent;

  private _handled = new WeakSet<Event>();

  private _queue: DropUploadQueue;

  private _sheet?: HaAddMediaSheet;

  public constructor(private _host: () => FileDropHost) {
    this._queue = new DropUploadQueue(() => {
      const { hass, element } = this._host();
      return {
        hass: hass!,
        localize: hass!.localize,
        toast: (params) => showToast(element, params),
        navigate: (path) => navigate(path),
      };
    });
  }

  public connect(): void {
    window.addEventListener("dragenter", this._onCapture, true);
    window.addEventListener("dragover", this._onCapture, true);
    window.addEventListener("dragenter", this._onOver);
    window.addEventListener("dragover", this._onOver);
    window.addEventListener("dragleave", this._onLeave);
    window.addEventListener("dragend", this._onEnd);
    window.addEventListener("drop", this._onDrop);
    window.addEventListener("keydown", this._onKeyDown);
    window.addEventListener("paste", this._onPaste);
    registerAddMediaHandler(this);
  }

  public disconnect(): void {
    window.removeEventListener("dragenter", this._onCapture, true);
    window.removeEventListener("dragover", this._onCapture, true);
    window.removeEventListener("dragenter", this._onOver);
    window.removeEventListener("dragover", this._onOver);
    window.removeEventListener("dragleave", this._onLeave);
    window.removeEventListener("dragend", this._onEnd);
    window.removeEventListener("drop", this._onDrop);
    window.removeEventListener("keydown", this._onKeyDown);
    window.removeEventListener("paste", this._onPaste);
    registerAddMediaHandler(undefined);
    this._sheet?.remove();
    this._sheet = undefined;
    this._hideAll();
  }

  // Runs first, before any page sees the event. A page that stops the event
  // from reaching the window shows up here as an event that never arrives at
  // `_onOver`, and the overlay is taken down at once.
  private _onCapture = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    this._seen = ev;
    window.setTimeout(() => {
      if (this._seen === ev && !this._handled.has(ev)) {
        this._hideAll();
      }
    }, 0);
  };

  private _onOver = (ev: DragEvent) => {
    if (!hasFiles(ev)) {
      return;
    }
    this._handled.add(ev);
    if (ev.defaultPrevented) {
      // A page took it: its own target shows its own feedback.
      this._hideAll();
      return;
    }
    // Accepting the drag is what lets a drop happen at all, and it keeps the
    // browser from opening a dropped file in place of the app.
    ev.preventDefault();
    const hass = this._host().hass;
    if (!hass) {
      return;
    }
    window.clearTimeout(this._hideTimer);
    if (this._dismissed) {
      return;
    }
    const types = Array.from(ev.dataTransfer?.items ?? [])
      .filter((item) => item.kind === "file")
      .map((item) => item.type);
    const description = describeDrag(types, Boolean(hass.user?.is_admin));
    if (description.mode === "legacy") {
      this._removeOverlay();
      showFileDropIndicator(
        hass.localize("ui.panel.lovelace.import_export.drop_to_import")
      );
      return;
    }
    hideFileDropIndicator();
    this._showOverlay(hass, description, ev);
    this._hideTimer = window.setTimeout(() => this._hideAll(), HIDE_AFTER_MS);
  };

  private _onLeave = (ev: DragEvent) => {
    if (!hasFiles(ev) || ev.relatedTarget) {
      return;
    }
    // The pointer left the window. The next drag event cancels this.
    window.clearTimeout(this._hideTimer);
    this._hideTimer = window.setTimeout(() => {
      this._dismissed = false;
      this._hideAll();
    }, LEAVE_HIDE_MS);
  };

  private _onEnd = () => {
    this._dismissed = false;
    this._hideAll();
  };

  private _onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === "Escape" && this._overlay) {
      this._dismissed = true;
      this._hideAll();
    }
  };

  private _showOverlay(
    hass: HomeAssistant,
    description: ReturnType<typeof describeDrag>,
    ev: DragEvent
  ) {
    const localize = hass.localize;
    const location = mediaLocationFromPath(window.location.pathname);
    const offerImages = description.offerImageStore;
    const defaultZone: DropZone =
      offerImages && location.inImageStore ? "image" : "media";
    const place = location.folderName
      ? localize("ui.drop_upload.place_folder", { folder: location.folderName })
      : localize("ui.drop_upload.place_media");
    const imagePlace = imagePlaceName(location, localize);

    if (!this._overlay) {
      this._overlay = document.createElement("ha-drop-upload-overlay");
      this._overlay.setAttribute("popover", "manual");
      document.body.append(this._overlay);
      try {
        // In the top layer, so it also shows above an open dialog.
        this._overlay.showPopover();
      } catch (_err) {
        // The browser has no popover support: the fixed position still shows it.
      }
    }
    const overlay = this._overlay;
    overlay.heading = localize("ui.drop_upload.overlay_heading");
    overlay.summary =
      description.total > 0
        ? localize("ui.drop_upload.overlay_summary", {
            count: description.total,
            place: defaultZone === "image" ? imagePlace : place,
          })
        : place;
    const notes: string[] = [];
    if (description.total > description.mediaCount) {
      notes.push(
        localize("ui.drop_upload.overlay_skipped", {
          count: description.total - description.mediaCount,
        })
      );
    }
    if (
      Array.from(ev.dataTransfer?.items ?? []).some(
        (item) => item.kind === "file" && item.type.startsWith("image/")
      )
    ) {
      notes.push(localize("ui.drop_upload.overlay_converts"));
    }
    overlay.note = notes.join(" ");
    overlay.defaultZone = defaultZone;
    overlay.zones = this._zones(
      hass,
      place,
      imagePlace,
      offerImages,
      defaultZone
    );
    overlay.active = overlay.zoneAt(ev.clientX, ev.clientY);
  }

  private _zones(
    hass: HomeAssistant,
    place: string,
    imagePlace: string,
    offerImages: boolean,
    defaultZone: DropZone
  ): DropUploadZone[] {
    const localize = hass.localize;
    return [
      {
        id: "media",
        title: place,
        hint: localize("ui.drop_upload.zone_media_hint", {
          limit: formatBytes(MEDIA_MAX_BYTES),
        }),
        primary: defaultZone === "media",
      },
      ...(offerImages
        ? [
            {
              id: "image" as const,
              title: imagePlace,
              hint: localize("ui.drop_upload.zone_images_hint", {
                limit: formatBytes(IMAGE_MAX_BYTES),
              }),
              primary: defaultZone === "image",
            },
          ]
        : []),
    ];
  }

  private _removeOverlay() {
    if (this._overlay) {
      this._overlay.remove();
      this._overlay = undefined;
    }
  }

  private _hideAll() {
    window.clearTimeout(this._hideTimer);
    this._removeOverlay();
    hideFileDropIndicator();
  }

  private _onDrop = async (ev: DragEvent) => {
    const zone: DropZone = this._overlay
      ? this._overlay.zoneAt(ev.clientX, ev.clientY)
      : "media";
    this._hideAll();
    this._dismissed = false;
    const files = ev.dataTransfer?.files;
    if (ev.defaultPrevented || !files?.length) {
      return;
    }
    // Never let a dropped file replace the page.
    ev.preventDefault();
    const { hass, element } = this._host();
    if (!hass) {
      return;
    }
    await this._route(hass, element, Array.from(files), zone, true);
  };

  /** Chooses the files with the system picker; see `pickFilesToAdd`. */
  public async pickFiles(options?: { zone?: DropZone }): Promise<void> {
    const files = await openMediaFilePicker();
    await this.addFiles(files, options?.zone);
  }

  /**
   * Adds files that did not come from a drop (the picker, a paste). When the
   * zone is not given and every file is a picture, the person is asked
   * whether they go to Media or to Images.
   */
  public async addFiles(files: File[], zone?: DropZone): Promise<void> {
    const { hass, element } = this._host();
    if (!hass || files.length === 0) {
      return;
    }
    let target = zone;
    if (!target) {
      const description = describeDrag(
        files.map((file) => file.type),
        Boolean(hass.user?.is_admin)
      );
      const location = mediaLocationFromPath(window.location.pathname);
      if (description.mode === "media" && description.offerImageStore) {
        target = await this._chooseZone(
          hass,
          files.length,
          location.inImageStore ? "image" : "media"
        );
        if (!target) {
          return;
        }
      } else {
        target = "media";
      }
    }
    await this._route(hass, element, files, target, false);
  }

  private _chooseZone(
    hass: HomeAssistant,
    count: number,
    defaultZone: DropZone
  ): Promise<DropZone | undefined> {
    this._sheet?.remove();
    const localize = hass.localize;
    const location = mediaLocationFromPath(window.location.pathname);
    const place = location.folderName
      ? localize("ui.drop_upload.place_folder", { folder: location.folderName })
      : localize("ui.drop_upload.place_media");
    const sheet = document.createElement("ha-add-media-sheet");
    sheet.setAttribute("popover", "manual");
    sheet.heading = localize("ui.drop_upload.sheet_heading");
    sheet.summary = localize("ui.drop_upload.sheet_summary", { count });
    sheet.cancelLabel = localize("ui.common.cancel");
    sheet.zones = this._zones(
      hass,
      place,
      imagePlaceName(location, localize),
      true,
      defaultZone
    );
    this._sheet = sheet;
    document.body.append(sheet);
    try {
      sheet.showPopover();
    } catch (_err) {
      // No popover support: the fixed position still shows the sheet.
    }
    return new Promise((resolve) => {
      const close = (zone?: DropZone) => {
        sheet.remove();
        if (this._sheet === sheet) {
          this._sheet = undefined;
        }
        resolve(zone);
      };
      sheet.addEventListener("add-media-zone-chosen", (ev) =>
        close((ev as CustomEvent<{ zone: DropZone }>).detail.zone)
      );
      sheet.addEventListener("add-media-sheet-closed", () => close());
    });
  }

  private _onPaste = (ev: ClipboardEvent) => {
    const files = mediaFilesFromPaste(ev);
    if (files.length === 0 || !this._host().hass?.user?.is_admin) {
      return;
    }
    ev.preventDefault();
    void this.addFiles(files.map((file) => nameForPastedFile(file)));
  };

  private async _route(
    hass: HomeAssistant,
    element: HTMLElement,
    list: File[],
    zone: DropZone,
    fromDrop: boolean
  ): Promise<void> {
    const decision = routeDrop(
      list.map((file) => ({
        name: file.name,
        type: file.type,
        size: file.size,
      })),
      { claimed: false, isAdmin: Boolean(hass.user?.is_admin), zone }
    );

    switch (decision.action) {
      case "ignore":
        return;
      case "legacy":
        if (fromDrop) {
          await this._dropLegacy(hass, element, list);
        } else {
          this._queue.reportSkipped(
            list.map((file) => ({ name: file.name, reason: "not_media" }))
          );
        }
        return;
      case "admin_only":
        showToast(element, {
          message: hass.localize("ui.drop_upload.admin_only"),
          duration: 8000,
          dismissable: true,
        });
        return;
      case "upload": {
        if (decision.accepted.length === 0) {
          this._queue.reportSkipped(decision.skipped);
          return;
        }
        this._queue.enqueue({
          target: decision.target,
          files: decision.accepted.map((index) => list[index]),
          skipped: decision.skipped,
          conversions: remapConversions(decision),
          location: mediaLocationFromPath(window.location.pathname),
        });
      }
    }
  }

  // The dashboard and personal wording import, exactly as it was before media
  // drops existed.
  private async _dropLegacy(
    hass: HomeAssistant,
    element: HTMLElement,
    files: File[]
  ) {
    // A dashboard file is imported as a dashboard. Any other file goes on to
    // the wording import below, unchanged.
    if (
      files.length === 1 &&
      (await handleDroppedDashboardFile({ hass, element }, files[0]))
    ) {
      return;
    }
    const result =
      files.length === 1 && looksLikeWordingFile(files[0])
        ? await importWordingFile(files[0])
        : ({ ok: false, error: "not_json" } as const);
    reportWordingImport(result, hass.localize);
    if (result.ok) {
      return;
    }
    showToast(element, {
      message: `${hass.localize("ui.personal_wording.not_applied")} ${hass.localize(
        `ui.personal_wording.error.${result.error}`
      )}`,
      duration: 8000,
    });
  }
}

/** The conversion plans, re-keyed from the dropped list to the accepted list. */
const remapConversions = (
  decision: Extract<DropDecision, { action: "upload" }>
): DropUploadJob["conversions"] => {
  if (!decision.conversions) {
    return undefined;
  }
  const result: NonNullable<DropUploadJob["conversions"]> = {};
  decision.accepted.forEach((original, position) => {
    const plan = decision.conversions?.[original];
    if (plan) {
      result[position] = plan;
    }
  });
  return result;
};
