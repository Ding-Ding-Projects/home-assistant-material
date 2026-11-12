import { css } from "lit";

/**
 * Styles that more than one tab module uses: the plain button reset, the round
 * icon buttons of the bar, the text button and the quiet notes. Each module
 * keeps the rest of its styles beside the markup they belong to.
 */
export const tabSharedStyles = css`
  button {
    font: inherit;
    color: inherit;
    border: none;
    background: none;
    cursor: pointer;
    padding: 0;
  }
  button:focus-visible {
    outline: 2px solid var(--primary-color);
    outline-offset: 2px;
  }
  .new-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: none;
    width: var(--ha-space-10);
    height: var(--ha-space-10);
    border-radius: var(--ha-border-radius-circle);
    color: var(--secondary-text-color);
    anchor-name: --page-tabs-new;
  }
  a.new-tab {
    text-decoration: none;
  }
  .new-tab:hover {
    background-color: var(--ha-color-fill-neutral-quiet-resting);
    color: var(--primary-text-color);
  }
  a.new-tab:focus-visible {
    outline: 3px solid var(--primary-color);
    outline-offset: 2px;
  }
  .text-button {
    display: inline-flex;
    align-items: center;
    gap: var(--ha-space-2);
    height: var(--ha-space-10);
    padding: 0 var(--ha-space-4);
    border-radius: var(--ha-border-radius-pill);
    background-color: var(--ha-color-fill-primary-normal-resting);
    color: var(--ha-color-on-primary-normal, var(--primary-text-color));
    font-weight: var(--ha-font-weight-medium);
    white-space: nowrap;
    --mdc-icon-size: 18px;
  }
  .text-button[disabled] {
    opacity: 0.5;
    cursor: default;
  }
  .bulk-note {
    padding: 0 var(--ha-space-2);
    color: var(--secondary-text-color);
    font-size: var(--ha-font-size-s);
  }
  .empty {
    margin: 0;
    padding: var(--ha-space-4);
    color: var(--secondary-text-color);
  }
`;
