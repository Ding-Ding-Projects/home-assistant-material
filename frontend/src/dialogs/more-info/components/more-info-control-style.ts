import { css } from "lit";

export const moreInfoControlStyle = css`
  :host {
    display: flex;
    flex-direction: column;
    flex: 1;
    justify-content: flex-start;
  }

  .controls {
    display: flex;
    flex-direction: column;
    align-items: center;
    /* Start under the header instead of floating in the middle of a tall sheet. */
    justify-content: flex-start;
    padding-top: var(--ha-space-4);
    flex: none;
  }

  .controls:not(:last-child) {
    margin-bottom: var(--ha-space-6);
  }

  .controls > *:not(:last-child) {
    margin-bottom: var(--ha-space-6);
  }

  .buttons {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: var(--ha-space-3);
  }

  .buttons > * {
    margin: var(--ha-space-2);
  }
`;
