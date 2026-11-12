import { classifyType } from "./drop-routing";

/**
 * Decides whether a paste on the window should add media. A paste that lands
 * in a text field, a text area, a rich text area or a code editor belongs to
 * that control, and so does a paste a page already handled.
 */

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Class names or tags of code editors that keep their text off native fields. */
const EDITOR_CLASSES = ["cm-editor", "cm-content", "monaco-editor"];
const EDITOR_TAGS = new Set(["HA-CODE-EDITOR", "CODE-EDITOR"]);

const isEditableNode = (node: unknown): boolean => {
  if (!(node instanceof Element)) {
    return false;
  }
  if (EDITABLE_TAGS.has(node.tagName)) {
    return true;
  }
  if (EDITOR_TAGS.has(node.tagName)) {
    return true;
  }
  if (EDITOR_CLASSES.some((name) => node.classList.contains(name))) {
    return true;
  }
  const editable = node.getAttribute("contenteditable");
  return (
    (node as HTMLElement).isContentEditable ||
    (editable !== null && editable !== "false")
  );
};

/** True when any element on the event path is a place the person types in. */
export const isEditablePath = (path: readonly unknown[]): boolean =>
  path.some(isEditableNode);

export interface PasteLike {
  defaultPrevented: boolean;
  clipboardData: { files: ArrayLike<File> } | null;
  composedPath(): unknown[];
}

/**
 * The pictures, video and audio files to add for a paste, or an empty list
 * when the paste is not for media: handled by a page, inside an editable
 * control, or carrying no media file.
 */
export const mediaFilesFromPaste = (ev: PasteLike): File[] => {
  if (ev.defaultPrevented || isEditablePath(ev.composedPath())) {
    return [];
  }
  const files = Array.from(ev.clipboardData?.files ?? []);
  return files.filter((file) => classifyType(file.type) !== "other");
};

/** A pasted picture is usually called `image.png`; give it a name of its own. */
export const nameForPastedFile = (file: File, now = new Date()): File => {
  if (file.name && file.name !== "image.png") {
    return file;
  }
  const pad = (value: number) => String(value).padStart(2, "0");
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(
    now.getDate()
  )}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const extension = file.type.split("/")[1]?.split("+")[0] || "png";
  return new File([file], `pasted-${stamp}.${extension}`, { type: file.type });
};
