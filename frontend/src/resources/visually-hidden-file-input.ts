import { css } from "lit";

/**
 * Style for a file field that is opened from a button.
 *
 * A field with `display: none` (the `hidden` attribute) can be refused by a
 * phone browser, which then never shows the file chooser. This keeps the field
 * in the layout, out of sight and out of the way of touches. Give the field
 * `class="file-input-hidden"`, `tabindex="-1"` and `aria-hidden="true"`, and
 * open it with `.click()` in the same step as the person's press, with no
 * `await` in between, because a browser only opens the chooser while it still
 * counts the press as the person's own action.
 */
export const visuallyHiddenFileInputStyles = css`
  .file-input-hidden {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: 0;
    padding: 0;
    border: 0;
    opacity: 0;
    overflow: hidden;
    clip-path: inset(50%);
    pointer-events: none;
  }
`;
