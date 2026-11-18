import { css } from "lit";

/**
 * Colours for the ha-control-button elements of a more-info sheet.
 *
 * An enabled button is filled with the primary colour so that it meets a 3:1
 * contrast ratio against the sheet surface in both themes. A disabled button
 * keeps a visible tonal fill and a readable, dimmed icon or label instead of
 * the pale grey on white of the default tokens.
 */
export const stateControlButtonStyle = css`
  ha-control-button:not([disabled]) {
    --control-button-background-color: var(--primary-color);
    --control-button-background-opacity: 1;
    --control-button-icon-color: var(--text-primary-color, #fff);
  }
  ha-control-button[disabled] {
    --disabled-color: var(--secondary-text-color);
    --disabled-text-color: var(--secondary-text-color);
    opacity: 0.7;
    /* A pale fill alone is under 3:1 against the sheet in the light theme;
       the outline gives the button a clear edge. */
    outline: 1px solid var(--secondary-text-color);
    outline-offset: -1px;
    border-radius: var(
      --control-button-border-radius,
      var(--ha-border-radius-md)
    );
  }
`;
