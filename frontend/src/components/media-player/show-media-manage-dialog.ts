import { fireEvent } from "../../common/dom/fire_event";
import type { RandomSource } from "../../common/media-manage/download";
import type { MediaPlayerItem } from "../../data/media-player";

export interface MediaManageDialogParams {
  currentItem: MediaPlayerItem;
  onClose?: () => void;
  /** Where the surprise draw of a single download gets its numbers; a test can replace it. */
  random?: RandomSource;
}

export const showMediaManageDialog = (
  element: HTMLElement,
  dialogParams: MediaManageDialogParams
): void => {
  fireEvent(element, "show-dialog", {
    dialogTag: "dialog-media-manage",
    dialogImport: () => import("./dialog-media-manage"),
    dialogParams,
  });
};
