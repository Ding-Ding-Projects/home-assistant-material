/** The few properties of an element that decide whether it takes typing. */
export interface EditableCandidate {
  tagName?: string;
  isContentEditable?: boolean;
  classList?: { contains(name: string): boolean };
}

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const EDITOR_TAGS = new Set(["HA-CODE-EDITOR"]);
const EDITOR_CLASSES = ["cm-editor", "cm-content"];

/**
 * Whether an event started in something people type into: a form field, an
 * element that is content-editable, or the code editor. `path` is the
 * event's composed path, so fields inside a shadow root are found too.
 */
export const isEditableTarget = (path: readonly unknown[]): boolean =>
  path.some((node) => {
    const el = node as EditableCandidate | undefined;
    if (!el || typeof el !== "object") {
      return false;
    }
    const tag = el.tagName?.toUpperCase();
    return (
      el.isContentEditable === true ||
      (tag !== undefined && (TYPING_TAGS.has(tag) || EDITOR_TAGS.has(tag))) ||
      EDITOR_CLASSES.some((name) => el.classList?.contains(name) === true)
    );
  });
