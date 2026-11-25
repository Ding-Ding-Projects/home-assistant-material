import { css } from "lit";

/**
 * Shared style for the setting rows on the profile page. The row item keeps
 * its headline and description to one line with three dots, which hides the
 * part of a sentence that matters ("after 5 minutes"). On these rows the text
 * wraps instead, so the whole sentence can be read.
 */
export const profileRowStyle = css`
  ha-row-item::part(headline),
  ha-row-item::part(supporting-text) {
    white-space: normal;
    overflow: visible;
    text-overflow: clip;
    overflow-wrap: anywhere;
  }
`;
