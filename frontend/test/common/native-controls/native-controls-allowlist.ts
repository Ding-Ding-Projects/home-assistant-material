/**
 * Files that may still contain a plain browser form control, written by hand.
 *
 * The interface draws every select, text field, slider, checkbox, radio and
 * colour choice with the product's own components. A file only belongs here
 * with a reason that is a decision, not a convenience. Hidden file inputs are
 * allowed everywhere and are not listed.
 */
export interface NativeControlException {
  /** Path below `src/`, with forward slashes. */
  file: string;
  /** Which native element the file keeps. */
  element: "select" | "input";
  /** Why the product's own component is not used here. */
  reason: string;
  /** A line that is being removed: it may already be out of date. */
  pending?: true;
}

export const NATIVE_CONTROL_EXCEPTIONS: NativeControlException[] = [
  {
    file: "panels/config/voice-assistants/debug/assist-pipeline-debug.ts",
    element: "select",
    reason:
      "Upstream Home Assistant debug page, kept as it is so later upstream merges stay clean",
  },
  {
    file: "dialogs/more-info/components/lights/light-color-rgb-picker.ts",
    element: "input",
    reason:
      "Upstream Home Assistant light dialog; the colour input is an invisible overlay behind an icon",
  },
  {
    file: "auth/ha-auth-textfield.ts",
    element: "input",
    reason:
      "The sign-in page's own text field is the control itself, and it cannot load the full component set before sign-in",
  },
];
