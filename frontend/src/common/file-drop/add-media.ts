import type { DropZone } from "./drop-routing";

/** What the window's file controller offers to the rest of the interface. */
export interface AddMediaHandler {
  pickFiles(options?: { zone?: DropZone }): Promise<void>;
}

let handler: AddMediaHandler | undefined;

/** The controller on the window registers itself here while it is connected. */
export const registerAddMediaHandler = (
  next: AddMediaHandler | undefined
): void => {
  handler = next;
};

/** True while the window can take files, so an entry point can be shown. */
export const canAddMedia = (): boolean => handler !== undefined;

/** The file types the system picker offers. */
export const MEDIA_ACCEPT = "image/*,video/*,audio/*";

/** Opens the system file picker and resolves with what was chosen, or nothing. */
export const openMediaFilePicker = (): Promise<File[]> =>
  new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = MEDIA_ACCEPT;
    input.hidden = true;
    const finish = (files: File[]) => {
      input.remove();
      resolve(files);
    };
    input.addEventListener("change", () =>
      finish(Array.from(input.files ?? []))
    );
    input.addEventListener("cancel", () => finish([]));
    document.body.append(input);
    input.click();
  });

/**
 * Opens the file picker and sends the chosen files through the same routing,
 * conversion and upload queue as a drop. On a phone the picker also offers the
 * camera and the photo library. Call it from a tap or a key press: browsers
 * only open the picker for a person's own action. Resolves when the files
 * have been queued, or at once when the person chose nothing.
 */
export const pickFilesToAdd = async (options?: {
  zone?: DropZone;
}): Promise<void> => {
  await handler?.pickFiles(options);
};
