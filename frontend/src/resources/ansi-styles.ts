import { css } from "lit";

/**
 * Styles for the class names `parseAnsiSegments` gives to runs of terminal
 * output. Shared by the log renderer and the log terminal.
 */
export const ansiStyles = css`
  .bold {
    font-weight: var(--ha-font-weight-bold);
  }
  .italic {
    font-style: italic;
  }
  .underline {
    text-decoration: underline;
  }
  .strikethrough {
    text-decoration: line-through;
  }
  .underline.strikethrough {
    text-decoration: underline line-through;
  }
  .fg-red {
    color: var(--error-color);
  }
  .fg-green {
    color: var(--success-color);
  }
  .fg-yellow {
    color: var(--warning-color);
  }
  .fg-blue {
    color: var(--info-color);
  }
  .fg-magenta {
    color: rgb(118, 38, 113);
  }
  .fg-cyan {
    color: rgb(44, 181, 233);
  }
  .fg-white {
    color: rgb(204, 204, 204);
  }
  .bg-black {
    background-color: rgb(0, 0, 0);
  }
  .bg-red {
    background-color: var(--error-color);
  }
  .bg-green {
    background-color: var(--success-color);
  }
  .bg-yellow {
    background-color: var(--warning-color);
  }
  .bg-blue {
    background-color: var(--info-color);
  }
  .bg-magenta {
    background-color: rgb(118, 38, 113);
  }
  .bg-cyan {
    background-color: rgb(44, 181, 233);
  }
  .bg-white {
    background-color: rgb(204, 204, 204);
  }
`;
