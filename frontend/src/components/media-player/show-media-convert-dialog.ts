import type { ConvertStore } from "../../common/media-manage/convert-item";
import { fireEvent } from "../../common/dom/fire_event";
import type { MediaPlayerItem } from "../../data/media-player";

export interface MediaConvertDialogParams {
  /** The item to convert. */
  item: MediaPlayerItem;
  /** Where the result is stored: the media library or the image store. */
  store: ConvertStore;
  /** The folder the result goes into: a media content ID, or an image folder path. */
  destination: string;
  /** The names in that folder, so the result never replaces one of them. */
  existingNames: string[];
  /** Called after a result was stored. */
  onStored?: () => void;
}

export const showMediaConvertDialog = (
  element: HTMLElement,
  dialogParams: MediaConvertDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-media-convert",
    dialogImport: () => import("./dialog-media-convert"),
    dialogParams,
  });
};
